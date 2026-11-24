import "dotenv/config";
import { fork, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { join } from "node:path";
import { Pool } from "pg";
import request from "supertest";

jest.setTimeout(30000);
export const origin = "https://web.example.invalid";
export const secret = randomBytes(32).toString("hex");
export const password = randomBytes(32).toString("base64url");
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const fixtureEmails: string[] = [];
let api: ChildProcess;
export let base: string;
export let logs = "";

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

export function account() {
  const email = randomUUID() + "@example.invalid";
  fixtureEmails.push(email);
  return { email, password, name: "Test member" };
}
export function post(path: string) {
  return request(base)
    .post("/api/v1/auth/" + path)
    .set("Origin", origin);
}
export function me(access: string) {
  return request(base)
    .get("/api/v1/auth/me")
    .set("Cookie", "access_token=" + access);
}
export function cookieValue(cookies: string[], name: string) {
  return cookies
    .find((cookie) => cookie.startsWith(name + "="))!
    .split(";")[0]
    .slice(name.length + 1);
}
export function renew(token: string, proof: string) {
  return post("refresh")
    .set("Cookie", "refresh_token=" + token)
    .set("X-CSRF-Token", proof);
}
export async function signedIn() {
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
