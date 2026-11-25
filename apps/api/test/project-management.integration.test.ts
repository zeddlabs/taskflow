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
function headers(user: Session) {
  return {
    Origin: origin,
    Cookie: "access_token=" + user.access,
    "X-CSRF-Token": user.csrf,
  };
}
async function setup(visibility = "PRIVATE") {
  const ws = await request(base)
    .post("/api/v1/workspaces")
    .set(headers(owner))
    .send({ name: "Project team", slug: "team-" + randomUUID() })
    .expect(201);
  const wid: string = ws.body.id;
  workspaces.push(wid);
  for (const [actor, role] of [
    [admin, "ADMIN"],
    [member, "MEMBER"],
    [guest, "GUEST"],
  ] as const)
    await pool.query(
      'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,$4)',
      [randomUUID(), wid, actor.profile.id, role],
    );
  const collection = "/api/v1/workspaces/" + wid + "/projects";
  const created = await request(base)
    .post(collection)
    .set(headers(owner))
    .send({ name: "Engineering", key: "ENG", visibility })
    .expect(201);
  const path = created.headers.location;
  const members = path + "/members";
  return {
    wid,
    pid: created.body.id,
    path,
    members,
    collection,
    patch: (actor: Session, data: object) =>
      request(base).patch(path).set(headers(actor)).send(data),
    add: (actor: Session, target: Session, role: string) =>
      request(base)
        .post(members)
        .set(headers(actor))
        .send({ userId: target.profile.id, role }),
    role: (actor: Session, target: Session, role: string) =>
      request(base)
        .patch(members + "/" + target.profile.id)
        .set(headers(actor))
        .send({ role }),
    remove: (actor: Session, target: Session) =>
      request(base)
        .delete(members + "/" + target.profile.id)
        .set(headers(actor)),
    archive: (actor: Session) =>
      request(base)
        .post(path + "/archive")
        .set(headers(actor)),
  };
}
const get = (path: string, actor: Session) =>
  request(base).get(path).set(headers(actor));

test("private management requires an explicit manager or workspace owner and membership grants are immediately effective", async () => {
  const p = await setup();
  await request(base).get(p.members).expect(401);
  await request(base)
    .post(p.members)
    .set(headers(owner))
    .unset("X-CSRF-Token")
    .send({ userId: member.profile.id, role: "VIEWER" })
    .expect(403);
  await p.patch(admin, { name: "Private" }).expect(404);
  await get(p.members, outsider).expect(404);
  await p.add(owner, outsider, "VIEWER").expect(404);
  await p.add(owner, admin, "VIEWER").expect(201);
  await p.patch(admin, { name: "Private" }).expect(403);
  await p.role(admin, admin, "MANAGER").expect(403);
  await p.add(owner, member, "CONTRIBUTOR").expect(201);
  await p.add(member, guest, "VIEWER").expect(403);
  await p.role(owner, member, "MANAGER").expect(200);
  await p.patch(member, { name: "Delivery" }).expect(200);
  await p.add(member, guest, "MANAGER").expect(403);
  await p.add(member, guest, "VIEWER").expect(201);
  await p.add(member, guest, "VIEWER").expect(409);
  await p.archive(guest).expect(403);
  const page = await get(p.members, guest).query({ limit: 1 }).expect(200);
  expect(Object.keys(page.body.data[0]).sort()).toEqual([
    "avatarUrl",
    "name",
    "role",
    "userId",
  ]);
  expect(page.body.pageInfo.hasNextPage).toBe(true);
  const next = await get(p.members, guest)
    .query({ cursor: page.body.pageInfo.nextCursor })
    .expect(200);
  expect(next.body.data).toHaveLength(3);
  await get(p.members, member)
    .query({ cursor: page.body.pageInfo.nextCursor })
    .expect(400);
  await p.remove(member, guest).expect(204);
  for (const path of [p.path, p.members, p.path + "/statuses"])
    await get(path, guest).expect(404);
  await p.role(owner, member, "VIEWER").expect(200);
  await p.remove(member, admin).expect(403);
  const events = await pool.query(
    'SELECT action,details FROM audit_logs WHERE "targetId"=$1',
    [p.pid],
  );
  expect(events.rows).toEqual(
    expect.arrayContaining([
      {
        action: "PROJECT_MEMBER_ADDED",
        details: { userId: guest.profile.id, toRole: "VIEWER" },
      },
      {
        action: "PROJECT_MEMBER_ROLE_CHANGED",
        details: {
          userId: member.profile.id,
          fromRole: "MANAGER",
          toRole: "VIEWER",
        },
      },
      {
        action: "PROJECT_MEMBER_REMOVED",
        details: { userId: guest.profile.id, fromRole: "VIEWER" },
      },
    ]),
  );
});

test("visibility changes apply to every read and archival preserves only authorized history", async () => {
  const p = await setup("WORKSPACE");
  await p.patch(admin, { visibility: "PRIVATE" }).expect(200);
  await p.patch(admin, { visibility: "WORKSPACE" }).expect(404);
  expect((await get(p.collection, member).expect(200)).body.data).toHaveLength(
    0,
  );
  await get(p.members, member).expect(404);
  await p.patch(owner, { visibility: "WORKSPACE" }).expect(200);
  await get(p.members, member).expect(200);
  const archived = await p.archive(admin).expect(200);
  expect(archived.body.archivedAt).toEqual(expect.any(String));
  expect((await get(p.collection, owner).expect(200)).body.data).toHaveLength(
    0,
  );
  await get(p.path, member).expect(200);
  await get(p.members, member).expect(200);
  await p.patch(owner, { name: "Closed" }).expect(409);
  await p.add(owner, member, "VIEWER").expect(409);
  await p.remove(owner, owner).expect(409);
  await p.archive(owner).expect(409);
});

test("partial settings validate the stored date range under concurrent writes and allow nullable fields to be cleared", async () => {
  const p = await setup();
  for (const invalid of [
    {},
    { key: "NEW" },
    { workspaceId: p.wid },
    { name: null },
    { visibility: null },
    { dueDate: "2027-02-30" },
  ])
    await p.patch(owner, invalid).expect(400);
  await p
    .patch(owner, {
      startDate: "2027-01-01",
      dueDate: "2027-01-31",
      description: "January",
    })
    .expect(200);
  const results = await Promise.all([
    p.patch(owner, { startDate: "2027-01-20" }),
    p.patch(owner, { dueDate: "2027-01-10" }),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
  const cleared = await p
    .patch(owner, { startDate: null, dueDate: null, description: null })
    .expect(200);
  expect(cleared.body).toMatchObject({
    key: "ENG",
    startDate: null,
    dueDate: null,
    description: null,
  });
});

test("concurrent project assignment and workspace removal leave no surviving project grant", async () => {
  const p = await setup();
  const added = await Promise.all([
    p.add(owner, member, "VIEWER"),
    p.add(owner, member, "VIEWER"),
  ]);
  expect(added.map((r) => r.status).sort()).toEqual([201, 409]);
  const [changed, removed] = await Promise.all([
    p.role(owner, member, "MANAGER"),
    request(base)
      .delete("/api/v1/workspaces/" + p.wid + "/members/" + member.profile.id)
      .set(headers(owner)),
  ]);
  expect([200, 404]).toContain(changed.status);
  expect(removed.status).toBe(204);
  await get(p.path, member).expect(404);
  expect(
    (await get(p.members, owner).expect(200)).body.data.map(
      (m: { userId: string }) => m.userId,
    ),
  ).toEqual([owner.profile.id]);
});
