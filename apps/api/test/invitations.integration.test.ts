import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import request from "supertest";
import {
  base,
  origin,
  pool,
  signedIn,
  mailbox,
  logs,
} from "./integration-fixture";

type Session = Awaited<ReturnType<typeof signedIn>>;
let owner: Session, admin: Session;
const spaces: string[] = [];
beforeAll(async () => {
  [owner, admin] = await Promise.all([signedIn(), signedIn()]);
});
afterEach(async () => {
  await pool.query("DELETE FROM workspaces WHERE id=ANY($1::text[])", [
    spaces.splice(0),
  ]);
});
function headers(actor: Session) {
  return {
    Origin: origin,
    Cookie: "access_token=" + actor.access,
    "X-CSRF-Token": actor.csrf,
  };
}
async function workspace(creator = owner) {
  const result = await request(base)
    .post("/api/v1/workspaces")
    .set(headers(creator))
    .send({ name: "Invitation tests", slug: "invite-" + randomUUID() })
    .expect(201);
  spaces.push(result.body.id);
  return result.body.id as string;
}
async function add(wid: string, user: Session, role: string) {
  await pool.query(
    'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,$4)',
    [randomUUID(), wid, user.profile.id, role],
  );
}
const path = (wid: string) => "/api/v1/workspaces/" + wid + "/invitations";
const create = (wid: string, s: Session, email: string, role = "MEMBER") =>
  request(base).post(path(wid)).set(headers(s)).send({ email, role });
const list = (wid: string, s: Session) =>
  request(base).get(path(wid)).set(headers(s));
const resend = (wid: string, id: string, s: Session) =>
  request(base)
    .post(path(wid) + "/" + id + "/resend")
    .set(headers(s));
const revoke = (wid: string, id: string, s: Session) =>
  request(base)
    .delete(path(wid) + "/" + id)
    .set(headers(s));
const accept = (s: Session, token: string) =>
  request(base)
    .post("/api/v1/invitations/accept")
    .set(headers(s))
    .send({ token });
function filename(email: string) {
  return createHash("sha256").update(email).digest("hex");
}
async function tokenFor(email: string) {
  const mail = await readFile(
    join(mailbox, "invite-" + filename(email)),
    "utf8",
  );
  expect(mail).toContain("Invitation tests");
  const found = /Invitation token: ([A-Za-z0-9_-]{43})\n/.exec(mail);
  expect(found).not.toBeNull();
  return found![1];
}
async function verify(s: Session) {
  await request(base)
    .post("/api/v1/auth/email-verification/request")
    .set(headers(s))
    .expect(204);
  const code = await readFile(join(mailbox, filename(s.profile.email)), "utf8");
  await request(base)
    .post("/api/v1/auth/email-verification/consume")
    .set(headers(s))
    .send({ code })
    .expect(204);
}

test("duplicate issues and concurrent accepts produce one invitation, one membership and correlated audit", async () => {
  const wid = await workspace(),
    recipient = await signedIn();
  await add(wid, admin, "ADMIN");
  const email = recipient.profile.email;
  const issued = await Promise.all([
    create(wid, owner, email.toUpperCase(), "GUEST"),
    create(wid, admin, email, "GUEST"),
  ]);
  expect(issued.map((r) => r.status).sort()).toEqual([201, 409]);
  const created = issued.find((r) => r.status === 201)!;
  const token = await tokenFor(email),
    hash = createHash("sha256").update(token).digest("hex");
  expect(created.body).toMatchObject({
    email,
    workspaceId: wid,
    role: "GUEST",
    status: "PENDING",
  });
  const pending = await list(wid, admin).expect(200);
  expect(pending.body.data).toEqual([created.body]);
  const stored = await pool.query(
    'SELECT "tokenHash" FROM workspace_invitations WHERE id=$1',
    [created.body.id],
  );
  expect(stored.rows).toEqual([{ tokenHash: hash }]);
  await accept(recipient, token).expect(403);
  await verify(owner);
  await accept(owner, token).expect(403);
  await verify(recipient);
  await accept(recipient, token).unset("X-CSRF-Token").expect(403);
  const attempts = await Promise.all([
    accept(recipient, token),
    accept(recipient, token),
  ]);
  expect(attempts.map((r) => r.status).sort()).toEqual([200, 409]);
  const success = attempts.find((r) => r.status === 200)!;
  expect(success.body).toEqual({
    workspace: { id: wid, slug: expect.any(String) },
    membership: { role: "GUEST" },
  });
  await accept(recipient, token).expect(409);
  await create(wid, owner, email, "ADMIN").expect(409);
  expect((await list(wid, owner)).body.data).toEqual([]);
  const members = await pool.query(
    'SELECT role FROM workspace_members WHERE "workspaceId"=$1 AND "userId"=$2',
    [wid, recipient.profile.id],
  );
  expect(members.rows).toEqual([{ role: "GUEST" }]);
  const taken = await pool.query(
    'SELECT status,"acceptedById","acceptedAt" FROM workspace_invitations WHERE id=$1',
    [created.body.id],
  );
  expect(taken.rows[0]).toEqual({
    status: "ACCEPTED",
    acceptedById: recipient.profile.id,
    acceptedAt: expect.any(Date),
  });
  const events = await pool.query(
    'SELECT action,"requestId",details FROM audit_logs WHERE "targetId"=$1',
    [created.body.id],
  );
  expect(events.rows).toHaveLength(2);
  expect(events.rows).toEqual(
    expect.arrayContaining([
      {
        action: "INVITATION_CREATED",
        requestId: created.headers["x-request-id"],
        details: { role: "GUEST" },
      },
      {
        action: "INVITATION_ACCEPTED",
        requestId: success.headers["x-request-id"],
        details: { role: "GUEST" },
      },
    ]),
  );
  for (const secret of [token, hash])
    for (const output of [
      created.text,
      pending.text,
      JSON.stringify(events.rows),
      success.text,
      logs,
    ])
      expect(output).not.toContain(secret);
});

test("invitation management requires a live scoped membership and enforces role ceilings", async () => {
  const wid = await workspace(),
    foreign = await workspace(admin),
    user = await signedIn();
  const email = randomUUID() + "@example.invalid";
  await request(base).get(path(wid)).expect(401);
  await create(wid, owner, email).unset("X-CSRF-Token").expect(403);
  await create(wid, owner, email)
    .set("Origin", "https://foreign.example.invalid")
    .expect(403);
  await list(wid, admin).expect(404);
  await create(wid, admin, email).expect(404);
  await add(wid, admin, "ADMIN");
  await create(wid, owner, email, "OWNER").expect(403);
  await create(wid, admin, email, "OWNER").expect(403);
  const invite = await create(wid, admin, email).expect(201);
  const id = invite.body.id;
  await resend(foreign, id, admin).expect(404);
  await revoke(foreign, id, admin).expect(404);
  await add(wid, user, "MEMBER");
  for (const role of ["MEMBER", "GUEST"]) {
    await pool.query(
      'UPDATE workspace_members SET role=$3 WHERE "workspaceId"=$1 AND "userId"=$2',
      [wid, user.profile.id, role],
    );
    await list(wid, user).expect(403);
    await resend(wid, id, user).expect(403);
    await revoke(wid, id, user).expect(403);
  }
  await pool.query(
    'DELETE FROM workspace_members WHERE "workspaceId"=$1 AND "userId"=$2',
    [wid, admin.profile.id],
  );
  await resend(wid, id, admin).expect(404);
  await request(base)
    .post("/api/v1/workspaces/" + wid + "/archive")
    .set(headers(owner))
    .expect(204);
  await list(wid, owner).expect(404);
  await accept(owner, await tokenFor(email)).expect(409);
});

test("resend rotates the token, revocation is final and expiry releases the recipient for a new invitation", async () => {
  const wid = await workspace(),
    user = await signedIn(),
    email = user.profile.email;
  await verify(user);
  const created = await create(wid, owner, email).expect(201);
  const id = created.body.id,
    original = await tokenFor(email);
  await resend(wid, id, owner).expect(200);
  const rotated = await tokenFor(email);
  expect(rotated).not.toBe(original);
  await accept(user, original).expect(409);
  await revoke(wid, id, owner).expect(204);
  await resend(wid, id, owner).expect(409);
  await accept(user, rotated).expect(409);
  const again = await create(wid, owner, email).expect(201);
  const expiring = await tokenFor(email);
  await pool.query(
    'UPDATE workspace_invitations SET "expiresAt"=now() WHERE id=$1',
    [again.body.id],
  );
  await accept(user, expiring).expect(409);
  expect((await list(wid, owner)).body.data).toEqual([]);
  await create(wid, owner, email).expect(201);
  expect(
    (
      await pool.query("SELECT status FROM workspace_invitations WHERE id=$1", [
        again.body.id,
      ])
    ).rows[0].status,
  ).toBe("EXPIRED");
  const audit = await pool.query(
    'SELECT action FROM audit_logs WHERE "workspaceId"=$1',
    [wid],
  );
  expect(audit.rows.map((r) => r.action)).toEqual(
    expect.arrayContaining([
      "INVITATION_RESENT",
      "INVITATION_REVOKED",
      "INVITATION_EXPIRED",
    ]),
  );
});

test("pending invitation pages are bounded and cursors cannot move between workspaces", async () => {
  const wid = await workspace(),
    other = await workspace();
  for (let i = 0; i < 2; i++) {
    const invited = await request(base)
      .post(path(wid))
      .set(headers(owner))
      .send({ email: randomUUID() + "@example.invalid" })
      .expect(201);
    expect(invited.body.role).toBe("MEMBER");
  }
  const first = await list(wid, owner).query({ limit: 1 }).expect(200);
  const cursor = first.body.pageInfo.nextCursor;
  expect(first.body.data).toHaveLength(1);
  expect(typeof cursor).toBe("string");
  const second = await list(wid, owner).query({ limit: 1, cursor }).expect(200);
  expect(second.body.data).toHaveLength(1);
  expect(second.body.data[0].id).not.toBe(first.body.data[0].id);
  expect(second.body.pageInfo).toEqual({
    hasNextPage: false,
    nextCursor: null,
  });
  await list(other, owner).query({ cursor }).expect(400);
  await list(wid, owner).query({ limit: 101 }).expect(400);
});

test("accepting an outstanding invitation preserves a membership obtained independently", async () => {
  const wid = await workspace(),
    user = await signedIn();
  await verify(user);
  await create(wid, owner, user.profile.email, "ADMIN").expect(201);
  await add(wid, user, "GUEST");
  const accepted = await accept(
    user,
    await tokenFor(user.profile.email),
  ).expect(200);
  expect(accepted.body.membership).toEqual({ role: "GUEST" });
  expect(
    (
      await pool.query(
        'SELECT role FROM workspace_members WHERE "workspaceId"=$1 AND "userId"=$2',
        [wid, user.profile.id],
      )
    ).rows,
  ).toEqual([{ role: "GUEST" }]);
});
