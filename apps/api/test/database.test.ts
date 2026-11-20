import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { DatabaseService } from "../src/database.service";
import type { Prisma } from "../src/generated/prisma/client";

const db = new DatabaseService();
after(() => db.$disconnect());

// Keep even unexpectedly successful constraint probes out of the database.
async function rejectsWrite(
  expected: { code: string; message?: RegExp },
  write: (tx: Prisma.TransactionClient) => Promise<unknown>,
) {
  await assert.rejects(
    db.$transaction(async (tx) => {
      await write(tx);
      assert.fail("PostgreSQL accepted a write that violates a constraint");
    }),
    expected,
  );
}

test("seed owner has an Argon2id hash and owns both demo workspaces", async () => {
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
    include: { memberships: { include: { workspace: true } } },
  });
  assert.match(owner.passwordHash, /^\$argon2id\$/);
  assert.deepEqual(
    owner.memberships.map((m) => [m.workspace.slug, m.role]).sort(),
    [
      ["acme-studio", "OWNER"],
      ["northwind-labs", "OWNER"],
    ],
  );
});

test("PostgreSQL enforces canonical emails, slugs and their uniqueness", async () => {
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const user = { name: owner.name, passwordHash: owner.passwordHash };
  await rejectsWrite({ code: "P2002" }, (tx) =>
    tx.user.create({
      data: { ...user, emailNormalized: owner.emailNormalized },
    }),
  );
  await rejectsWrite(
    { code: "P2039", message: /23514.*users_email_normalized/ },
    (tx) =>
      tx.user.create({
        data: { ...user, emailNormalized: owner.emailNormalized.toUpperCase() },
      }),
  );
  await rejectsWrite(
    { code: "P2039", message: /23514.*users_email_normalized/ },
    (tx) =>
      tx.user.create({
        data: { ...user, emailNormalized: owner.emailNormalized + "\t" },
      }),
  );
  await rejectsWrite({ code: "P2002" }, (tx) =>
    tx.workspace.create({ data: { name: "Duplicate", slug: "acme-studio" } }),
  );
  await rejectsWrite(
    { code: "P2039", message: /23514.*workspaces_slug_normalized/ },
    (tx) =>
      tx.workspace.create({ data: { name: "Uppercase", slug: "ACME-STUDIO" } }),
  );
});

test("membership pairs, owner slots and parent references are enforced", async () => {
  const { id: workspaceId } = await db.workspace.findUniqueOrThrow({
    where: { slug: "acme-studio" },
  });
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const userId = owner.id;
  await rejectsWrite({ code: "P2002" }, (tx) =>
    tx.workspaceMember.create({
      data: { workspaceId, userId, role: "MEMBER" },
    }),
  );
  await rejectsWrite({ code: "P2002" }, async (tx) => {
    const other = await tx.user.create({
      data: {
        name: "Second owner",
        emailNormalized: randomUUID() + "@example.invalid",
        passwordHash: owner.passwordHash,
      },
    });
    await tx.workspaceMember.create({
      data: { workspaceId, userId: other.id, role: "OWNER" },
    });
  });
  await rejectsWrite({ code: "P2003" }, (tx) =>
    tx.workspaceMember.create({ data: { workspaceId: randomUUID(), userId } }),
  );
  await rejectsWrite({ code: "P2003" }, (tx) =>
    tx.workspaceMember.create({ data: { workspaceId, userId: randomUUID() } }),
  );
});

test("sessions retain consumed token history and enforce unique SHA-256 digests", async (t) => {
  const expiresAt = new Date(Date.now() + 3600000);
  const { id: userId } = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  await rejectsWrite({ code: "P2003" }, (tx) =>
    tx.authSession.create({ data: { userId: randomUUID(), expiresAt } }),
  );
  await rejectsWrite({ code: "P2003" }, (tx) =>
    tx.refreshToken.create({
      data: { sessionId: randomUUID(), tokenHash, expiresAt },
    }),
  );
  const session = await db.authSession.create({ data: { userId, expiresAt } });
  t.after(async () => {
    await db.authSession.delete({ where: { id: session.id } });
  });
  const data = { sessionId: session.id, tokenHash, expiresAt };
  await db.refreshToken.create({ data: { ...data, usedAt: new Date() } });
  await rejectsWrite({ code: "P2002" }, (tx) =>
    tx.refreshToken.create({ data }),
  );
  await rejectsWrite(
    { code: "P2039", message: /23514.*refresh_tokens_sha256_hex/ },
    (tx) =>
      tx.refreshToken.create({
        data: { ...data, tokenHash: "not-a-sha256-digest" },
      }),
  );
  const successor = createHash("sha256").update(randomBytes(32)).digest("hex");
  await db.refreshToken.create({ data: { ...data, tokenHash: successor } });
  const tokens = await db.refreshToken.findMany({
    where: { sessionId: session.id },
  });
  assert.equal(tokens.length, 2);
  assert.ok(
    tokens.find((token) => token.tokenHash === tokenHash)?.usedAt instanceof
      Date,
  );
  assert.equal(
    tokens.find((token) => token.tokenHash === successor)?.usedAt,
    null,
  );
});
