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
function headers(actor: Session) {
  return {
    Origin: origin,
    Cookie: "access_token=" + actor.access,
    "X-CSRF-Token": actor.csrf,
  };
}
async function workspace(creator = owner): Promise<string> {
  const response = await request(base)
    .post("/api/v1/workspaces")
    .set(headers(creator))
    .send({ name: "Projects", slug: "projects-" + randomUUID() })
    .expect(201);
  workspaces.push(response.body.id);
  return response.body.id;
}
function join(workspaceId: string, actor: Session, role: string) {
  return pool.query(
    'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,$4)',
    [randomUUID(), workspaceId, actor.profile.id, role],
  );
}
function grant(wid: string, pid: string, actor: Session) {
  return pool.query(
    'INSERT INTO project_members (id,"workspaceId","projectId","userId",role) VALUES ($1,$2,$3,$4,\'VIEWER\')',
    [randomUUID(), wid, pid, actor.profile.id],
  );
}
const collection = (wid: string) => "/api/v1/workspaces/" + wid + "/projects";
const detail = (pid: string) => "/api/v1/projects/" + pid;
const get = (path: string, actor: Session) =>
  request(base).get(path).set(headers(actor));
const create = (
  wid: string,
  actor: Session,
  key: string,
  visibility = "WORKSPACE",
) =>
  request(base)
    .post(collection(wid))
    .set(headers(actor))
    .send({ name: "Project " + key, key, visibility });

test("concurrent creation enforces tenant-local keys and initializes one manager, ordered workflow and audit", async () => {
  const wid = await workspace();
  const responses = await Promise.all([
    create(wid, owner, "ENG"),
    create(wid, owner, "ENG"),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  const created = responses.find((r) => r.status === 201)!;
  const pid = created.body.id;
  expect(created.headers.location).toBe(detail(pid));
  expect((await get(detail(pid), owner).expect(200)).body).toEqual(
    created.body,
  );
  const statuses = await get(detail(pid) + "/statuses", owner).expect(200);
  expect(
    statuses.body.map((s: { category: string; sortOrder: number }) => [
      s.category,
      s.sortOrder,
    ]),
  ).toEqual([
    ["BACKLOG", 1000],
    ["TODO", 2000],
    ["IN_PROGRESS", 3000],
    ["DONE", 4000],
  ]);
  expect(
    (
      await pool.query('SELECT "nextTaskNumber" FROM projects WHERE id=$1', [
        pid,
      ])
    ).rows,
  ).toEqual([{ nextTaskNumber: 1 }]);
  expect(
    (
      await pool.query(
        'SELECT "userId",role FROM project_members WHERE "projectId"=$1',
        [pid],
      )
    ).rows,
  ).toEqual([{ userId: owner.profile.id, role: "MANAGER" }]);
  expect(
    (
      await pool.query(
        'SELECT action,"actorId" FROM audit_logs WHERE "workspaceId"=$1 AND "targetId"=$2',
        [wid, pid],
      )
    ).rows,
  ).toEqual([{ action: "PROJECT_CREATED", actorId: owner.profile.id }]);
  const second = await workspace(outsider);
  await create(second, outsider, "ENG").expect(201);
  await expect(grant(second, pid, outsider)).rejects.toMatchObject({
    code: "23503",
  });
  await expect(grant(wid, pid, outsider)).rejects.toMatchObject({
    code: "23503",
  });
});

test("project creation requires a current session, CSRF proof, a permitted role and valid input", async () => {
  const wid = await workspace();
  await join(wid, member, "MEMBER");
  await join(wid, guest, "GUEST");
  await request(base)
    .post(collection(wid))
    .set("Origin", origin)
    .send({ name: "Project", key: "ENG" })
    .expect(401);
  await request(base)
    .post(collection(wid))
    .set(headers(owner))
    .unset("X-CSRF-Token")
    .send({ name: "Project", key: "ENG" })
    .expect(403);
  await create(wid, member, "ENG").expect(403);
  await create(wid, outsider, "ENG").expect(404);
  await request(base)
    .patch("/api/v1/workspaces/" + wid)
    .set(headers(owner))
    .send({ allowMemberCreateProjects: true })
    .expect(200);
  await create(wid, guest, "ENG").expect(403);
  await create(wid, member, "ENG", "PRIVATE").expect(201);
  for (const invalid of [
    { key: "eng" },
    { name: " " },
    { workspaceId: wid },
    { visibility: "ALL" },
    { startDate: "2027-03-11", dueDate: "2027-03-01" },
  ])
    await request(base)
      .post(collection(wid))
      .set(headers(owner))
      .send({ key: "TEST", name: "Example", ...invalid })
      .expect(400);
});

test("every read enforces private, guest, cross-tenant and current membership rules", async () => {
  const wid = await workspace();
  await join(wid, admin, "ADMIN");
  await join(wid, member, "MEMBER");
  await join(wid, guest, "GUEST");
  const visible = (await create(wid, admin, "WEB").expect(201)).body.id;
  const privateId = (await create(wid, owner, "OPS", "PRIVATE").expect(201))
    .body.id;
  const adminPrivate = (await create(wid, admin, "CORE", "PRIVATE").expect(201))
    .body.id;
  await request(base).get(collection(wid)).expect(401);
  await get(collection(wid), outsider).expect(404);
  for (const suffix of ["", "/statuses"]) {
    await request(base)
      .get(detail(privateId) + suffix)
      .expect(401);
    await get(detail(privateId) + suffix, admin).expect(404);
    await get(detail(privateId) + suffix, member).expect(404);
    await get(detail(adminPrivate) + suffix, owner).expect(200);
    await get(detail(visible) + suffix, guest).expect(404);
    await get(detail(visible) + suffix, outsider).expect(404);
  }
  const page = await get(collection(wid), member)
    .query({ limit: 1 })
    .expect(200);
  expect(page.body.data.map((p: { id: string }) => p.id)).toEqual([visible]);
  expect(page.body.pageInfo).toEqual({ nextCursor: null, hasNextPage: false });
  expect((await get(collection(wid), guest).expect(200)).body.data).toEqual([]);
  await grant(wid, privateId, guest);
  await grant(wid, visible, guest);
  await grant(wid, privateId, admin);
  await get(detail(privateId), admin).expect(200);
  await get(detail(privateId) + "/statuses", guest).expect(200);
  const first = (
    await get(collection(wid), guest).query({ limit: 1 }).expect(200)
  ).body;
  const cursor = first.pageInfo.nextCursor;
  expect(typeof cursor).toBe("string");
  const second = (
    await get(collection(wid), guest).query({ limit: 1, cursor }).expect(200)
  ).body;
  expect([...first.data, ...second.data].map((p) => p.id)).toEqual(
    [visible, privateId].sort(),
  );
  await get(collection(wid), admin).query({ cursor }).expect(400);
  const other = await workspace();
  await join(other, guest, "GUEST");
  await get(collection(other), guest).query({ cursor }).expect(400);
  await request(base)
    .delete("/api/v1/workspaces/" + wid + "/members/" + guest.profile.id)
    .set(headers(owner))
    .expect(204);
  await get(detail(privateId), guest).expect(404);
  await get(collection(wid), guest).expect(404);
  await join(wid, guest, "GUEST");
  await get(detail(privateId) + "/statuses", guest).expect(404);
});

test("archiving hides projects from the directory and workspace archival revokes every route", async () => {
  const wid = await workspace();
  const pid = (await create(wid, owner, "ARC").expect(201)).body.id;
  await pool.query('UPDATE projects SET "archivedAt"=now() WHERE id=$1', [pid]);
  expect((await get(collection(wid), owner).expect(200)).body.data).toEqual([]);
  await get(detail(pid), owner).expect(200);
  expect(
    (await get(detail(pid) + "/statuses", owner).expect(200)).body,
  ).toHaveLength(4);
  await pool.query('UPDATE workspaces SET "archivedAt"=now() WHERE id=$1', [
    wid,
  ]);
  for (const path of [collection(wid), detail(pid), detail(pid) + "/statuses"])
    await get(path, owner).expect(404);
  await create(wid, owner, "NEW").expect(404);
});
