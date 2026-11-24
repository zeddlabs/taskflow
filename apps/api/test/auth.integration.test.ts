import "dotenv/config";
import { fork, type ChildProcess } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { join } from "node:path";
import { verify } from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import request from "supertest";

jest.setTimeout(30000);
const origin = "https://web.example.invalid";
const secret = randomBytes(32).toString("hex");
const password = randomBytes(32).toString("base64url");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fixtureEmails: string[] = [];
let api: ChildProcess;
let base: string;
let logs = "";

beforeAll(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Set DATABASE_URL to a disposable migrated database.");
  api = fork(join(__dirname, "auth-server.mjs"), [], {
    silent: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      WEB_ORIGIN: origin,
      JWT_ACCESS_SECRET: secret,
      CSRF_SECRET: randomBytes(32).toString("hex"),
      JWT_ISSUER: "taskflow-test",
      JWT_AUDIENCE: "taskflow-browser-test",
      COOKIE_SECURE: "false",
    },
  });
  api.stdout!.on("data", (chunk) => {
    logs += chunk;
  });
  api.stderr!.on("data", (chunk) => {
    logs += chunk;
  });
  base = await new Promise<string>((resolve, reject) => {
    api.once("error", reject);
    api.once("exit", (code) =>
      reject(new Error("API exited during startup: " + code)),
    );
    api.once("message", (url) => resolve(String(url)));
  });
});

afterAll(async () => {
  try {
    if (api?.connected) {
      const stopped = once(api, "exit");
      api.disconnect();
      await stopped;
    }
    if (fixtureEmails.length)
      await pool.query(
        'DELETE FROM users WHERE "emailNormalized" = ANY($1::text[])',
        [fixtureEmails],
      );
  } finally {
    await pool.end();
  }
});

function account() {
  const email = randomUUID() + "@example.invalid";
  fixtureEmails.push(email);
  return { email, password, name: "Test member" };
}
function post(path: string) {
  return request(base)
    .post("/api/v1/auth/" + path)
    .set("Origin", origin);
}
function me(access: string) {
  return request(base)
    .get("/api/v1/auth/me")
    .set("Cookie", "access_token=" + access);
}
function cookieValue(cookies: string[], name: string) {
  return cookies
    .find((cookie) => cookie.startsWith(name + "="))!
    .split(";")[0]
    .slice(name.length + 1);
}
function renew(token: string, proof: string) {
  return post("refresh")
    .set("Cookie", "refresh_token=" + token)
    .set("X-CSRF-Token", proof);
}
async function signedIn() {
  const user = account();
  const registered = await post("register").send(user).expect(201);
  const login = await post("login")
    .send({ email: user.email, password })
    .expect(200);
  const cookies = login.headers["set-cookie"] as unknown as string[];
  return {
    profile: registered.body,
    login,
    cookies,
    access: cookieValue(cookies, "access_token"),
    refresh: cookieValue(cookies, "refresh_token"),
    logout: cookieValue(cookies, "logout_session"),
    csrf: login.headers["x-csrf-token"] as string,
  };
}

test("registration normalizes identity, rejects duplicates atomically and stores only an Argon2id hash", async () => {
  const user = account();
  const responses = await Promise.all(
    [user.email, "  " + user.email.toUpperCase() + "  "].map((email) =>
      post("register").send({ ...user, email }),
    ),
  );
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(responses.find((r) => r.status === 201)!.body.email).toBe(user.email);
  const result = await pool.query(
    'SELECT "passwordHash" FROM users WHERE "emailNormalized"=$1',
    [user.email],
  );
  expect(result.rowCount).toBe(1);
  const hash = result.rows[0].passwordHash;
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verify(hash, password)).toBe(true);
  for (const r of responses) {
    expect(r.text).not.toContain(password);
    expect(r.text).not.toContain(hash);
  }
  expect(logs).not.toContain(hash);
});

test("credentials set host-only production cookies and the session selects its own safe profile", async () => {
  const { profile, login, cookies, access, refresh } = await signedIn();
  expect(Object.keys(profile).sort()).toEqual([
    "avatarUrl",
    "email",
    "id",
    "name",
    "timezone",
  ]);
  expect(login.body).toEqual(profile);
  for (const cookie of cookies) {
    expect(cookie).toMatch(/; HttpOnly/i);
    expect(cookie).toMatch(/; Secure/i);
    expect(cookie).toMatch(/; SameSite=Lax/i);
    expect(cookie).not.toMatch(/; Domain=/i);
  }
  expect(cookies.find((c) => c.startsWith("access_token="))).toMatch(
    /; Path=\/;/,
  );
  expect(cookies.find((c) => c.startsWith("refresh_token="))).toMatch(
    /; Path=\/api\/v1\/auth\/refresh;/,
  );
  const claims = jwt.verify(access, secret, {
    algorithms: ["HS256"],
    issuer: "taskflow-test",
    audience: "taskflow-browser-test",
  }) as jwt.JwtPayload;
  expect(claims.sub).toBe(profile.id);
  expect(claims.exp! - claims.iat!).toBe(600);
  expect(Buffer.from(refresh, "base64url")).toHaveLength(32);
  const digest = createHash("sha256").update(refresh).digest("hex");
  const stored = await pool.query(
    'SELECT s."userId", s."expiresAt" AS absolute, t."expiresAt" AS idle, t."tokenHash" FROM auth_sessions s JOIN refresh_tokens t ON s.id=t."sessionId" WHERE s.id=$1',
    [claims.sid],
  );
  expect(stored.rowCount).toBe(1);
  expect(stored.rows[0]).toMatchObject({
    userId: profile.id,
    tokenHash: digest,
  });
  expect(
    (stored.rows[0].absolute.getTime() - stored.rows[0].idle.getTime()) /
      86400000,
  ).toBe(23);
  const read = await me(access).query({ userId: randomUUID() }).expect(200);
  expect(read.body).toEqual(profile);
  expect(read.headers["cache-control"]).toBe("no-store");
  for (const credential of [access, refresh, password, digest, secret]) {
    expect(logs).not.toContain(credential);
    expect(login.text).not.toContain(credential);
    expect(read.text).not.toContain(credential);
  }
});

test("unknown accounts and incorrect passwords have the same public failure", async () => {
  const user = account();
  await post("register").send(user).expect(201);
  const failures = await Promise.all(
    [user.email, randomUUID() + "@example.invalid"].map((email) =>
      post("login").send({ email, password: randomUUID() }).expect(401),
    ),
  );
  const comparable = failures.map((r) => ({ ...r.body, requestId: undefined }));
  expect(comparable[0]).toEqual(comparable[1]);
  for (const response of failures)
    expect(response.headers["set-cookie"]).toBeUndefined();
});

test("checks browser origin and registration DTO before creating an account", async () => {
  const user = account();
  for (const method of ["register", "login"]) {
    await request(base)
      .post("/api/v1/auth/" + method)
      .send(user)
      .expect(403);
    await request(base)
      .post("/api/v1/auth/" + method)
      .set("Origin", "https://foreign.example.invalid")
      .set("Referer", origin + "/login")
      .send(user)
      .expect(403);
  }
  await post("register")
    .send({ ...user, password: "short" })
    .expect(400);
  await post("register")
    .send({ ...user, role: "OWNER" })
    .expect(400);
  await request(base)
    .post("/api/v1/auth/register")
    .set("Referer", origin + "/register")
    .send(user)
    .expect(201);
});

test("me requires a valid signed access credential and a matching active session", async () => {
  const { access, refresh, profile } = await signedIn();
  const claims = jwt.decode(access) as jwt.JwtPayload;
  const signed = (overrides: jwt.JwtPayload, key = secret) =>
    jwt.sign({ ...claims, ...overrides }, key, { algorithm: "HS256" });
  await request(base).get("/api/v1/auth/me").expect(401);
  const missingExpiry = { ...claims };
  delete missingExpiry.exp;
  for (const invalid of [
    refresh,
    signed({ aud: "other" }),
    signed({ iss: "other" }),
    signed({ sub: randomUUID() }),
    signed({ sid: randomUUID() }),
    jwt.sign(missingExpiry, secret, { algorithm: "HS256" }),
    signed({ exp: Math.floor(Date.now() / 1000) - 1 }),
    signed({ sub: profile.id }, randomBytes(32).toString("hex")),
  ]) {
    await me(invalid).expect(401);
  }
  await pool.query('UPDATE auth_sessions SET "revokedAt"=now() WHERE id=$1', [
    claims.sid,
  ]);
  await me(access).expect(401);
  await pool.query(
    `UPDATE auth_sessions SET "revokedAt"=NULL, "expiresAt"=($2::timestamptz AT TIME ZONE 'UTC') WHERE id=$1`,
    [claims.sid, new Date(Date.now() - 1000).toISOString()],
  );
  await me(access).expect(401);
  await request(base)
    .get("/api/v1/workspaces")
    .set("Cookie", "access_token=" + access)
    .expect(401);
});

test("rotation consumes each generation once and commits family revocation on reuse", async () => {
  const session = await signedIn();
  const sibling = await post("login")
    .send({ email: session.profile.email, password })
    .expect(200);
  const rotated = await renew(session.refresh, session.csrf).expect(200);
  const cookies = rotated.get("Set-Cookie")!;
  const successor = cookieValue(cookies, "refresh_token");
  expect(successor).not.toBe(session.refresh);
  const second = await renew(successor, session.csrf).expect(200);
  const current = cookieValue(second.get("Set-Cookie")!, "refresh_token");
  const denied = await renew(session.refresh, session.csrf).expect(401);
  expect(denied.type).toBe("application/problem+json");
  expect(denied.body.status).toBe(401);
  expect(denied.get("Set-Cookie")).toBeUndefined();
  await renew(current, session.csrf).expect(401);
  await me(cookieValue(cookies, "access_token")).expect(401);
  await me(cookieValue(sibling.get("Set-Cookie")!, "access_token")).expect(200);
});

test("simultaneous refreshes produce one successor and revoke it on reuse", async () => {
  const { refresh, csrf, access } = await signedIn();
  const results = await Promise.all([
    renew(refresh, csrf),
    renew(refresh, csrf),
  ]);
  expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  const cookies = results.find((r) => r.status === 200)!.get("Set-Cookie")!;
  await renew(cookieValue(cookies, "refresh_token"), csrf).expect(401);
  await me(access).expect(401);
  const tokens = await pool.query(
    'SELECT "usedAt" FROM refresh_tokens WHERE "sessionId"=$1',
    [(jwt.decode(access) as jwt.JwtPayload).sid],
  );
  expect(tokens.rowCount).toBe(2);
  expect(tokens.rows.filter((row) => row.usedAt === null)).toHaveLength(1);
});

test("refresh enforces idle and absolute deadlines and caps a successor at the family deadline", async () => {
  const session = await signedIn();
  await pool.query(
    'UPDATE refresh_tokens SET "expiresAt"=now() WHERE "sessionId"=$1',
    [session.logout],
  );
  await renew(session.refresh, session.csrf).expect(401);
  await request(base)
    .get("/api/v1/auth/refresh/csrf")
    .set("Cookie", "refresh_token=" + session.refresh)
    .expect(401);
  const nearExpiry = await signedIn();
  await pool.query(
    "UPDATE auth_sessions SET \"expiresAt\"=now() + interval '60 seconds' WHERE id=$1",
    [nearExpiry.logout],
  );
  const rotated = await renew(nearExpiry.refresh, nearExpiry.csrf).expect(200);
  const token = cookieValue(rotated.get("Set-Cookie")!, "refresh_token");
  const deadlines = await pool.query(
    'SELECT t."expiresAt" = s."expiresAt" AS capped FROM refresh_tokens t JOIN auth_sessions s ON t."sessionId"=s.id WHERE t."tokenHash"=$1',
    [createHash("sha256").update(token).digest("hex")],
  );
  expect(deadlines.rows[0].capped).toBe(true);
  await pool.query('UPDATE auth_sessions SET "expiresAt"=now() WHERE id=$1', [
    nearExpiry.logout,
  ]);
  await renew(token, nearExpiry.csrf).expect(401);
  await me(nearExpiry.access).expect(401);
});

test("browser can recover its proof, log out after access expiry and repeat logout", async () => {
  const { refresh, access, csrf, logout } = await signedIn();
  const bootstrap = await request(base)
    .get("/api/v1/auth/refresh/csrf")
    .set("Cookie", "refresh_token=" + refresh)
    .expect(204);
  expect(bootstrap.get("X-CSRF-Token")).toBe(csrf);
  expect(bootstrap.get("Cache-Control")).toBe("no-store");
  expect(cookieValue(bootstrap.get("Set-Cookie")!, "logout_session")).toBe(
    logout,
  );
  const sendLogout = () =>
    post("logout")
      .set("Cookie", "logout_session=" + logout)
      .set("X-CSRF-Token", csrf);
  const response = await sendLogout().expect(204);
  const cleared = response.get("Set-Cookie")!;
  for (const [name, path] of [
    ["access_token", "/"],
    ["refresh_token", "/api/v1/auth/refresh"],
    ["logout_session", "/api/v1/auth/logout"],
  ]) {
    const cookie = cleared.find((c) => c.startsWith(name + "=;"))!;
    expect(cookie).toContain("Path=" + path + ";");
    expect(cookie).toContain("Expires=Thu, 01 Jan 1970");
  }
  await sendLogout().expect(204);
  await post("logout").expect(204);
  await me(access).expect(401);
  await renew(refresh, csrf).expect(401);
  await request(base)
    .get("/api/v1/auth/refresh/csrf")
    .set("Cookie", "refresh_token=" + refresh)
    .expect(401);
});

test("cookie mutations require the exact origin and the current session's proof before changing state", async () => {
  const current = await signedIn();
  const other = await signedIn();
  for (const [path, cookie] of [
    ["refresh", "refresh_token=" + current.refresh],
    ["logout", "logout_session=" + current.logout],
  ]) {
    for (const headers of [
      {},
      { Referer: "invalid" },
      { Referer: "blob:" + origin + "/document" },
      { Referer: origin + ".foreign.example/" },
      { Origin: "null", Referer: origin + "/" },
      { Origin: "https://foreign.example.invalid", Referer: origin + "/" },
    ]) {
      await request(base)
        .post("/api/v1/auth/" + path)
        .set("Cookie", cookie)
        .set("X-CSRF-Token", current.csrf)
        .set(headers)
        .expect(403);
    }
    for (const proof of [undefined, "invalid", other.csrf]) {
      const req = post(path).set("Cookie", cookie);
      if (proof) req.set("X-CSRF-Token", proof);
      const denied = await req.expect(403);
      expect(denied.type).toBe("application/problem+json");
      expect(denied.get("Set-Cookie")).toBeUndefined();
    }
  }
  const rotated = await request(base)
    .post("/api/v1/auth/refresh")
    .set("Referer", origin + "/account")
    .set("Cookie", "refresh_token=" + current.refresh)
    .set("X-CSRF-Token", current.csrf)
    .expect(200);
  await renew(current.refresh, other.csrf).expect(403);
  await renew(
    cookieValue(rotated.get("Set-Cookie")!, "refresh_token"),
    current.csrf,
  ).expect(200);
});

test("workspace reads follow current membership and conceal inaccessible tenants", async () => {
  const alice = await signedIn();
  const bob = await signedIn();
  const root = "/api/v1/workspaces";
  const read = (path: string, access = alice.access) =>
    request(base)
      .get(root + path)
      .set("Cookie", "access_token=" + access);
  await request(base).get(root).expect(401);
  await request(base)
    .get(root + "/absent")
    .expect(401);
  await read("").expect(200, {
    data: [],
    pageInfo: { nextCursor: null, hasNextPage: false },
  });
  const ids = Array.from({ length: 4 }, () => randomUUID()).sort();
  const [first, second, archived, foreign] = ids;
  try {
    for (const id of ids) {
      await pool.query(
        'INSERT INTO workspaces (id,name,slug,"updatedAt","archivedAt") VALUES ($1::text,$1::text,$1::text,now(),$2)',
        [id, id === archived ? new Date() : null],
      );
      await pool.query(
        'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,$4)',
        [
          randomUUID(),
          id,
          id === foreign ? bob.profile.id : alice.profile.id,
          id === second ? "GUEST" : "OWNER",
        ],
      );
    }
    const page = await read("?limit=1&sort=id_asc")
      .expect(200)
      .expect("Cache-Control", "no-store");
    expect(page.body.data).toEqual([
      { id: first, name: first, slug: first, myRole: "OWNER" },
    ]);
    expect(page.body.pageInfo.hasNextPage).toBe(true);
    const next = "?cursor=" + page.body.pageInfo.nextCursor;
    const summary = { id: second, name: second, slug: second, myRole: "GUEST" };
    await read(next).expect(200, {
      data: [summary],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
    await read("/" + second)
      .expect(200, summary)
      .expect("Cache-Control", "no-store");
    await read(next, bob.access).expect(400);
    for (const query of [
      "?limit=0",
      "?limit=101",
      "?sort=name",
      "?cursor=invalid",
      "?userId=someone",
    ]) {
      await read(query).expect(400);
    }
    for (const id of [foreign, archived, "absent"]) {
      const denied = await read("/" + id).expect(404);
      expect(denied.body.code).toBe("NOT_FOUND");
    }
    await pool.query(
      'DELETE FROM workspace_members WHERE "workspaceId"=$1 AND "userId"=$2',
      [second, alice.profile.id],
    );
    await read("/" + second).expect(404);
    await read(next).expect(200, {
      data: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    });
  } finally {
    await pool.query("DELETE FROM workspaces WHERE id=ANY($1::text[])", [ids]);
  }
});

test("workspace creation binds ownership and audit to the authenticated winner of a slug race", async () => {
  const alice = await signedIn();
  const bob = await signedIn();
  const path = "/api/v1/workspaces";
  const slug = "team-" + randomUUID();
  const input = { name: "  Design team  ", slug };
  const create = (session: typeof alice, proof = session.csrf) =>
    request(base)
      .post(path)
      .set("Origin", origin)
      .set("Cookie", "access_token=" + session.access)
      .set("X-CSRF-Token", proof);
  try {
    await request(base)
      .post(path)
      .set("Origin", origin)
      .send(input)
      .expect(401);
    await request(base)
      .post(path)
      .set("Origin", origin)
      .set("Cookie", "access_token=" + alice.access)
      .send(input)
      .expect(403);
    await create(alice, bob.csrf).send(input).expect(403);
    await create(alice)
      .set("Origin", "https://foreign.example.invalid")
      .send(input)
      .expect(403);
    for (const invalid of [
      { role: "OWNER" },
      { actorId: bob.profile.id },
      { workspaceId: slug },
      { name: "  " },
      { slug: "bad slug" },
      { slug: "x".repeat(81) },
    ]) {
      await create(alice)
        .send({ ...input, ...invalid })
        .expect(400);
    }
    const responses = await Promise.all([
      create(alice).send({ ...input, slug: " " + slug.toUpperCase() + " " }),
      create(bob).send(input),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    const index = responses.findIndex((r) => r.status === 201);
    const winner = [alice, bob][index],
      other = [bob, alice][index];
    const result = responses[index],
      id = result.body.id;
    expect(result.body).toEqual({
      id: expect.any(String),
      name: "Design team",
      slug,
      myRole: "OWNER",
      createdAt: expect.any(String),
    });
    expect(result.headers.location).toBe(path + "/" + id);
    await request(base)
      .get(result.headers.location)
      .set("Cookie", "access_token=" + winner.access)
      .expect(200);
    await request(base)
      .get(result.headers.location)
      .set("Cookie", "access_token=" + other.access)
      .expect(404);
    expect(
      (
        await pool.query(
          'SELECT timezone,"allowMemberCreateProjects","archivedAt" FROM workspaces WHERE id=$1',
          [id],
        )
      ).rows,
    ).toEqual([
      { timezone: "UTC", allowMemberCreateProjects: false, archivedAt: null },
    ]);
    expect(
      (
        await pool.query(
          'SELECT "userId",role FROM workspace_members WHERE "workspaceId"=$1',
          [id],
        )
      ).rows,
    ).toEqual([{ userId: winner.profile.id, role: "OWNER" }]);
    expect(
      (
        await pool.query(
          'SELECT "actorId",action,"targetType","targetId","requestId",details FROM audit_logs WHERE "workspaceId"=$1',
          [id],
        )
      ).rows,
    ).toEqual([
      {
        actorId: winner.profile.id,
        action: "WORKSPACE_CREATED",
        targetType: "Workspace",
        targetId: id,
        requestId: result.headers["x-request-id"],
        details: {},
      },
    ]);
  } finally {
    await pool.query("DELETE FROM workspaces WHERE slug=$1", [slug]);
  }
});

test("only authorized current workspace members can change settings or archive", async () => {
  const owner = await signedIn();
  const teammate = await signedIn();
  const slug = "settings-" + randomUUID();
  const root = "/api/v1/workspaces";
  const sessionHeaders = (s: typeof owner) => ({
    Origin: origin,
    Cookie: "access_token=" + s.access,
    "X-CSRF-Token": s.csrf,
  });
  const created = await request(base)
    .post(root)
    .set(sessionHeaders(owner))
    .send({ name: "Studio", slug })
    .expect(201);
  const id = created.body.id,
    path = root + "/" + id;
  const edit = (s: typeof owner) =>
    request(base).patch(path).set(sessionHeaders(s));
  const archive = (s: typeof owner) =>
    request(base)
      .post(path + "/archive")
      .set(sessionHeaders(s));
  const settings = (s: typeof owner) =>
    request(base)
      .get(path + "/settings")
      .set("Cookie", "access_token=" + s.access);
  try {
    await request(base)
      .patch(path)
      .set("Origin", origin)
      .send({ name: "x" })
      .expect(401);
    await request(base)
      .post(path + "/archive")
      .set("Origin", origin)
      .expect(401);
    await edit(owner).unset("X-CSRF-Token").send({ name: "x" }).expect(403);
    await archive(owner).set("X-CSRF-Token", teammate.csrf).expect(403);
    await edit(owner)
      .set("Origin", "https://other.example.invalid")
      .send({ name: "x" })
      .expect(403);
    await settings(teammate).expect(404);
    await archive(teammate).expect(404);
    await edit(teammate).send({ name: "foreign" }).expect(404);
    const initial = await settings(owner).expect(200);
    expect(initial.body).toMatchObject({
      id,
      slug,
      timezone: "UTC",
      allowMemberCreateProjects: false,
    });
    for (const data of [
      {},
      { role: "OWNER" },
      { archivedAt: new Date().toISOString() },
      { ownerId: teammate.profile.id },
      { name: null },
      { name: "  " },
      { timezone: "Nowhere/Unknown" },
      { allowMemberCreateProjects: "false" },
    ]) {
      await edit(owner).send(data).expect(400);
    }
    await pool.query(
      'INSERT INTO workspace_members (id,"workspaceId","userId",role) VALUES ($1,$2,$3,\'GUEST\')',
      [randomUUID(), id, teammate.profile.id],
    );
    for (const role of ["GUEST", "MEMBER", "ADMIN"]) {
      await pool.query(
        'UPDATE workspace_members SET role=$1 WHERE "workspaceId"=$2 AND "userId"=$3',
        [role, id, teammate.profile.id],
      );
      await archive(teammate).expect(403);
      if (role === "ADMIN") {
        await settings(teammate).expect(200);
        const updated = await edit(teammate)
          .send({
            name: " Renamed ",
            timezone: "Asia/Jakarta",
            allowMemberCreateProjects: true,
          })
          .expect(200);
        expect(updated.body).toMatchObject({
          id,
          name: "Renamed",
          timezone: "Asia/Jakarta",
          allowMemberCreateProjects: true,
          myRole: "ADMIN",
        });
      } else {
        await settings(teammate).expect(403);
        await edit(teammate)
          .send({ allowMemberCreateProjects: true })
          .expect(403);
      }
    }
    await edit(owner)
      .send({
        slug: " " + slug.toUpperCase() + "-NEW ",
        allowMemberCreateProjects: false,
      })
      .expect(200);
    const current = await settings(owner).expect(200);
    expect(current.body).toMatchObject({
      name: "Renamed",
      slug: slug + "-new",
      timezone: "Asia/Jakarta",
      allowMemberCreateProjects: false,
    });
    await pool.query(
      'DELETE FROM workspace_members WHERE "workspaceId"=$1 AND "userId"=$2',
      [id, teammate.profile.id],
    );
    await edit(teammate).send({ timezone: "UTC" }).expect(404);
    const [archived, write] = await Promise.all([
      archive(owner),
      edit(owner).send({ timezone: "Europe/Paris" }),
    ]);
    expect(archived.status).toBe(204);
    expect([200, 404]).toContain(write.status);
    await archive(owner).expect(404);
    await edit(owner).send({ name: "too late" }).expect(404);
    await settings(owner).expect(404);
    await request(base)
      .get(path)
      .set("Cookie", "access_token=" + owner.access)
      .expect(404);
    const directory = await request(base)
      .get(root)
      .set("Cookie", "access_token=" + owner.access)
      .expect(200);
    expect(directory.body.data).toEqual([]);
    const stored = await pool.query(
      'SELECT timezone,"archivedAt" FROM workspaces WHERE id=$1',
      [id],
    );
    expect(stored.rows[0].archivedAt).toBeTruthy();
    expect(stored.rows[0].timezone).toBe(
      write.status === 200 ? "Europe/Paris" : "Asia/Jakarta",
    );
    const audit = await pool.query(
      'SELECT action,"actorId","targetId","requestId",details FROM audit_logs WHERE "workspaceId"=$1',
      [id],
    );
    expect(audit.rows).toHaveLength(write.status === 200 ? 5 : 4);
    expect(audit.rows).toContainEqual({
      action: "WORKSPACE_ARCHIVED",
      actorId: owner.profile.id,
      targetId: id,
      requestId: archived.headers["x-request-id"],
      details: {},
    });
    expect(audit.rows).toContainEqual(
      expect.objectContaining({
        action: "WORKSPACE_SETTINGS_UPDATED",
        actorId: teammate.profile.id,
        targetId: id,
        details: {
          fields: expect.arrayContaining([
            "name",
            "timezone",
            "allowMemberCreateProjects",
          ]),
        },
      }),
    );
  } finally {
    await pool.query("DELETE FROM workspaces WHERE id=$1", [id]);
  }
});

test("limits repeated normalized identifiers and independent requests from one IP", async () => {
  const email = randomUUID() + "@example.invalid";
  for (let i = 0; i < 10; i++)
    await post("login").send({ email, password }).expect(401);
  const limited = await post("login")
    .send({ email: email.toUpperCase(), password })
    .expect(429);
  expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
  // Invalid DTOs exercise the IP budget without hashing further passwords.
  for (let i = 0; i <= 60; i++) {
    const res = await post("register").send({});
    if (res.status === 429) {
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
      return;
    }
    expect(res.status).toBe(400);
  }
  throw new Error("IP limit was not enforced");
});
