import { randomUUID } from "node:crypto";
import request from "supertest";
import { base, origin, pool, signedIn } from "./integration-fixture";

type Session = Awaited<ReturnType<typeof signedIn>>;
let owner: Session,
  admin: Session,
  member: Session,
  guest: Session,
  outsider: Session;
const workspaces: string[] = [];

beforeAll(async () => {
  [owner, admin, member, guest, outsider] = await Promise.all(
    Array.from({ length: 5 }, () => signedIn()),
  );
});
afterEach(async () => {
  await pool.query("DELETE FROM workspaces WHERE id = ANY($1::text[])", [
    workspaces.splice(0),
  ]);
});

function headers(session: Session) {
  return {
    Origin: origin,
    Cookie: "access_token=" + session.access,
    "X-CSRF-Token": session.csrf,
  };
}
async function workspace(creator = owner) {
  const response = await request(base)
    .post("/api/v1/workspaces")
    .set(headers(creator))
    .send({ name: "Member directory", slug: "members-" + randomUUID() })
    .expect(201);
  const id: string = response.body.id;
  workspaces.push(id);
  return id;
}
function addMember(id: string, session: Session, role: string) {
  return pool.query(
    'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,$4)',
    [randomUUID(), id, session.profile.id, role],
  );
}
const path = (id: string) => "/api/v1/workspaces/" + id;
const list = (id: string, actor: Session) =>
  request(base)
    .get(path(id) + "/members")
    .set(headers(actor));
const edit = (id: string, actor: Session, target: Session, role: string) =>
  request(base)
    .patch(path(id) + "/members/" + target.profile.id)
    .set(headers(actor))
    .send({ role });
const remove = (id: string, actor: Session, target: Session) =>
  request(base)
    .delete(path(id) + "/members/" + target.profile.id)
    .set(headers(actor));
const transfer = (id: string, actor: Session, target: Session) =>
  request(base)
    .post(path(id) + "/transfer-ownership")
    .set(headers(actor))
    .send({ newOwnerUserId: target.profile.id });

test("member directory exposes minimal tenant profiles and binds pagination to both actor and workspace", async () => {
  const id = await workspace();
  const other = await workspace(outsider);
  await addMember(other, member, "MEMBER");
  await addMember(id, admin, "ADMIN");
  await addMember(id, member, "MEMBER");
  await addMember(id, guest, "GUEST");
  await request(base)
    .get(path(id) + "/members")
    .expect(401);
  await list(id, guest).expect(403);
  await list(id, outsider).expect(404);
  const first = await list(id, member).query({ limit: 2 }).expect(200);
  const cursor = first.body.pageInfo.nextCursor;
  expect(typeof cursor).toBe("string");
  const second = await list(id, member).query({ limit: 2, cursor }).expect(200);
  expect(second.body.pageInfo).toEqual({
    hasNextPage: false,
    nextCursor: null,
  });
  const rows = [...first.body.data, ...second.body.data];
  expect(rows.map((row) => row.userId)).toEqual(
    [owner, admin, member, guest].map((s) => s.profile.id).sort(),
  );
  for (const row of rows)
    expect(Object.keys(row).sort()).toEqual([
      "avatarUrl",
      "name",
      "role",
      "userId",
    ]);
  await list(id, owner).query({ cursor }).expect(400);
  await list(other, member).query({ cursor }).expect(400);
  await list(id, admin).expect(200);
  await list(id, member).query({ limit: 101 }).expect(400);
});

test("owner protection, guest restrictions, tenant boundaries and CSRF apply to membership mutations", async () => {
  const id = await workspace();
  const other = await workspace(outsider);
  await addMember(other, guest, "MEMBER");
  await addMember(id, admin, "ADMIN");
  await addMember(id, member, "MEMBER");
  await addMember(id, guest, "GUEST");
  await edit(id, admin, member, "INVALID").expect(400);
  await edit(id, admin, admin, "OWNER").expect(403);
  await edit(id, owner, member, "OWNER").expect(403);
  for (const actor of [owner, admin]) {
    await edit(id, actor, owner, "ADMIN").expect(403);
    await remove(id, actor, owner).expect(403);
  }
  for (const actor of [member, guest]) {
    await edit(id, actor, guest, "ADMIN").expect(403);
    await remove(id, actor, admin).expect(403);
  }
  await transfer(id, admin, member).expect(403);
  await transfer(id, owner, owner).expect(403);
  await transfer(id, owner, guest).expect(403);
  await transfer(id, owner, outsider).expect(404);
  await remove(id, owner, outsider).expect(404);
  await edit(id, owner, outsider, "ADMIN").expect(404);
  await transfer(id, outsider, admin).expect(404);
  await request(base)
    .delete(path(id) + "/members/" + member.profile.id)
    .set("Origin", origin)
    .expect(401);
  await remove(id, admin, member).unset("X-CSRF-Token").expect(403);
  await edit(id, admin, member, "ADMIN")
    .set("Origin", "https://other.example.invalid")
    .expect(403);
  await transfer(id, owner, admin).unset("X-CSRF-Token").expect(403);
  const editResult = await edit(id, admin, guest, "MEMBER").expect(200);
  expect(editResult.body).toMatchObject({
    userId: guest.profile.id,
    role: "MEMBER",
  });
  await edit(id, admin, guest, "MEMBER").expect(200);
  await list(id, guest).expect(200);
  const removed = await remove(id, admin, guest).expect(204);
  await list(id, guest).expect(404);
  await request(base).get(path(id)).set(headers(guest)).expect(404);
  await remove(id, owner, guest).expect(404);
  await list(other, guest).expect(200);
  const logs = await pool.query(
    'SELECT action,"actorId","targetId","requestId",details FROM audit_logs WHERE "workspaceId"=$1 AND action <> $2',
    [id, "WORKSPACE_CREATED"],
  );
  expect(logs.rows).toHaveLength(2);
  expect(logs.rows).toEqual(
    expect.arrayContaining([
      {
        action: "MEMBER_ROLE_CHANGED",
        actorId: admin.profile.id,
        targetId: guest.profile.id,
        requestId: editResult.headers["x-request-id"],
        details: { fromRole: "GUEST", toRole: "MEMBER" },
      },
      {
        action: "MEMBER_REMOVED",
        actorId: admin.profile.id,
        targetId: guest.profile.id,
        requestId: removed.headers["x-request-id"],
        details: { fromRole: "MEMBER" },
      },
    ]),
  );
  await request(base)
    .post(path(id) + "/archive")
    .set(headers(owner))
    .expect(204);
  await list(id, owner).expect(404);
  await transfer(id, owner, member).expect(404);
  await remove(id, owner, member).expect(404);
  await edit(id, owner, member, "ADMIN").expect(404);
});

test("simultaneous transfers commit exactly one new owner and one correlated audit event", async () => {
  const id = await workspace();
  await addMember(id, admin, "ADMIN");
  await addMember(id, member, "MEMBER");
  const results = await Promise.all([
    transfer(id, owner, admin),
    transfer(id, owner, member),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
  const success = results.find((r) => r.status === 200)!;
  const winner = success.body.userId;
  expect(success.body.role).toBe("OWNER");
  const { rows } = await pool.query(
    'SELECT "userId",role FROM workspace_members WHERE "workspaceId"=$1',
    [id],
  );
  expect(rows.filter((r) => r.role === "OWNER")).toEqual([
    { userId: winner, role: "OWNER" },
  ]);
  expect(rows).toContainEqual({ userId: owner.profile.id, role: "ADMIN" });
  const audit = await pool.query(
    'SELECT "actorId","targetId","requestId" FROM audit_logs WHERE "workspaceId"=$1 AND action=$2',
    [id, "OWNERSHIP_TRANSFERRED"],
  );
  expect(audit.rows).toEqual([
    {
      actorId: owner.profile.id,
      targetId: winner,
      requestId: success.headers["x-request-id"],
    },
  ]);
  await transfer(id, owner, admin).expect(403);
});

test("concurrent removal and transfer cannot remove the committed owner", async () => {
  const id = await workspace();
  await addMember(id, admin, "ADMIN");
  await addMember(id, member, "MEMBER");
  const [moved, removed] = await Promise.all([
    transfer(id, owner, member),
    remove(id, admin, member),
  ]);
  const { rows } = await pool.query(
    'SELECT "userId" FROM workspace_members WHERE "workspaceId"=$1 AND role=\'OWNER\'',
    [id],
  );
  if (moved.status === 200) {
    expect(removed.status).toBe(403);
    expect(rows).toEqual([{ userId: member.profile.id }]);
  } else {
    expect(moved.status).toBe(404);
    expect(removed.status).toBe(204);
    expect(rows).toEqual([{ userId: owner.profile.id }]);
  }
});
