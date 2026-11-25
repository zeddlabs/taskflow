import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { DatabaseService } from "../src/database.service";
import { ProjectsService } from "../src/projects/projects.service";
import { InvitationsService } from "../src/workspaces/invitations.service";
import { EmailVerificationService } from "../src/auth/email-verification.service";
import { WorkspacesService } from "../src/workspaces/workspaces.service";
import type { Prisma } from "../src/generated/prisma/client";
import { WorkspaceMembersService } from "../src/workspaces/workspace-members.service";

const db = new DatabaseService();
after(() => db.$disconnect());

const config = {
  secret: randomBytes(32).toString("hex"),
  csrfSecret: randomBytes(32).toString("hex"),
  origin: "https://test.example.invalid",
  issuer: "test",
  audience: "test",
  secure: true,
};
const service = new WorkspacesService(db, config);

test("failed project audit rolls back the project, statuses and manager membership", async () => {
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: "acme-studio" },
    include: { members: { where: { role: "OWNER" } } },
  });
  const key = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  const projects = new ProjectsService(db, config);
  await assert.rejects(
    projects.create(
      workspace.members[0].userId,
      workspace.id,
      { name: "Rollback", key },
      "r".repeat(101),
    ),
    { code: "P2000" },
  );
  assert.equal(
    await db.project.count({ where: { workspaceId: workspace.id, key } }),
    0,
  );
});

test("a rejected audit insert rolls back workspace and owner membership", async () => {
  const user = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const slug = "rollback-" + randomUUID();
  const memberships = await db.workspaceMember.count({
    where: { userId: user.id },
  });
  try {
    // requestId is limited to 100 characters by PostgreSQL; fail the final write.
    await assert.rejects(
      service.create(
        user.id,
        { name: "Rollback probe", slug },
        "r".repeat(101),
      ),
      { code: "P2000" },
    );
    assert.equal(await db.workspace.count({ where: { slug } }), 0);
    assert.equal(
      await db.workspaceMember.count({ where: { userId: user.id } }),
      memberships,
    );
  } finally {
    await db.workspace.deleteMany({ where: { slug } });
  }
});

test("failed settings, archive and audit writes preserve the active workspace", async (t) => {
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const workspace = await service.create(
    owner.id,
    {
      name: "Audit rollback",
      slug: "settings-" + randomUUID(),
    },
    randomUUID(),
  );
  const id = workspace.id;
  t.after(async () => {
    await db.workspace.delete({ where: { id } });
  });
  const invalidRequestId = "r".repeat(101);
  await assert.rejects(
    service.update(
      owner.id,
      id,
      { timezone: "Asia/Jakarta" },
      invalidRequestId,
    ),
    { code: "P2000" },
  );
  await assert.rejects(service.archive(owner.id, id, invalidRequestId), {
    code: "P2000",
  });
  await assert.rejects(
    service.update(
      owner.id,
      id,
      { name: "Duplicate", slug: "acme-studio" },
      randomUUID(),
    ),
    { status: 409 },
  );
  const stored = await db.workspace.findUniqueOrThrow({ where: { id } });
  assert.equal(stored.timezone, "UTC");
  assert.equal(stored.archivedAt, null);
  assert.equal(stored.name, workspace.name);
  assert.equal(stored.slug, workspace.slug);
  assert.equal(await db.auditLog.count({ where: { workspaceId: id } }), 1);
});

test("membership edits, removal and transfer roll back when their audit record fails", async (t) => {
  const members = new WorkspaceMembersService(db, config);
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const workspace = await service.create(
    owner.id,
    { name: "Member audit rollback", slug: "rollback-" + randomUUID() },
    randomUUID(),
  );
  t.after(async () => {
    await db.workspace.delete({ where: { id: workspace.id } });
  });
  const user = await db.user.create({
    data: {
      name: "Member",
      emailNormalized: randomUUID() + "@example.invalid",
      passwordHash: owner.passwordHash,
    },
  });
  t.after(async () => {
    await db.user.delete({ where: { id: user.id } });
  });
  const workspaceId = workspace.id;
  await db.workspaceMember.create({
    data: { workspaceId, userId: user.id, role: "MEMBER" },
  });
  const invalidRequestId = "r".repeat(101);
  await assert.rejects(
    members.changeRole(
      owner.id,
      workspaceId,
      user.id,
      "ADMIN",
      invalidRequestId,
    ),
    { code: "P2000" },
  );
  await assert.rejects(
    members.remove(owner.id, workspaceId, user.id, invalidRequestId),
    { code: "P2000" },
  );
  await assert.rejects(
    members.transfer(owner.id, workspaceId, user.id, invalidRequestId),
    { code: "P2000" },
  );
  const rows = await db.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true, role: true },
  });
  assert.deepEqual(
    new Map(rows.map((m) => [m.userId, m.role])),
    new Map([
      [owner.id, "OWNER"],
      [user.id, "MEMBER"],
    ]),
  );
  assert.equal(await db.auditLog.count({ where: { workspaceId } }), 1);
});

test("failed mail delivery expires its code and preserves the resend cooldown", async (t) => {
  const user = await db.user.create({
    data: {
      name: "Mailbox test",
      emailNormalized: randomUUID() + "@example.invalid",
      passwordHash: "unused-test-hash",
    },
  });
  t.after(async () => {
    await db.user.delete({ where: { id: user.id } });
  });
  let delivered = "";
  const verification = new EmailVerificationService(db, config, {
    async send(_email, code) {
      delivered = code;
      throw new Error("relay unavailable");
    },
  });
  await assert.rejects(verification.request(user.id), { status: 503 });
  assert.match(delivered, /^[0-9]{8}$/);
  await assert.rejects(verification.consume(user.id, delivered), {
    status: 409,
  });
  await assert.rejects(verification.request(user.id), { status: 429 });
  assert.equal(
    (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
      .emailVerifiedAt,
    null,
  );
});

test("invitation delivery is recoverable and a failed audit rolls back membership, state and token rotation", async (t) => {
  const owner = await db.user.findUniqueOrThrow({
    where: { emailNormalized: "owner@example.invalid" },
  });
  const workspace = await service.create(
    owner.id,
    { name: "Invite rollback", slug: "invites-" + randomUUID() },
    randomUUID(),
  );
  t.after(async () => {
    await db.workspace.delete({ where: { id: workspace.id } });
  });
  const email = randomUUID() + "@example.invalid";
  const user = await db.user.create({
    data: {
      name: "Recipient",
      emailNormalized: email,
      emailVerifiedAt: new Date(),
      passwordHash: owner.passwordHash,
    },
  });
  t.after(async () => {
    await db.user.delete({ where: { id: user.id } });
  });
  let failDelivery = true,
    mail = "";
  const invitations = new InvitationsService(
    db,
    {
      async send(_email, _subject, body) {
        if (failDelivery) throw new Error("Relay unavailable");
        mail = body;
      },
    },
    config,
  );
  const wid = workspace.id,
    dto = { email, role: "MEMBER" as const },
    invalid = "r".repeat(101);
  await assert.rejects(invitations.create(owner.id, wid, dto, invalid), {
    code: "P2000",
  });
  assert.equal(
    await db.workspaceInvitation.count({ where: { workspaceId: wid } }),
    0,
  );
  await assert.rejects(invitations.create(owner.id, wid, dto, randomUUID()), {
    status: 503,
  });
  const pending = await db.workspaceInvitation.findFirstOrThrow({
    where: { workspaceId: wid },
  });
  const id = pending.id;
  await assert.rejects(
    db.workspaceInvitation.create({
      data: {
        workspaceId: wid,
        emailNormalized: email,
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        invitedById: owner.id,
        expiresAt: pending.expiresAt,
      },
    }),
    { code: "P2002" },
  );
  failDelivery = false;
  await assert.rejects(invitations.resend(owner.id, wid, id, invalid), {
    code: "P2000",
  });
  assert.equal(
    (await db.workspaceInvitation.findUniqueOrThrow({ where: { id } }))
      .tokenHash,
    pending.tokenHash,
  );
  await invitations.resend(owner.id, wid, id, randomUUID());
  const token = /Invitation token: ([A-Za-z0-9_-]{43})/.exec(mail)?.[1];
  assert.ok(token);
  await assert.rejects(invitations.revoke(owner.id, wid, id, invalid), {
    code: "P2000",
  });
  await assert.rejects(invitations.accept(user.id, token, invalid), {
    code: "P2000",
  });
  assert.equal(
    await db.workspaceMember.count({
      where: { workspaceId: wid, userId: user.id },
    }),
    0,
  );
  assert.equal(
    (await db.workspaceInvitation.findUniqueOrThrow({ where: { id } })).status,
    "PENDING",
  );
  assert.equal(
    (await invitations.accept(user.id, token, randomUUID())).membership.role,
    "MEMBER",
  );
});

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
