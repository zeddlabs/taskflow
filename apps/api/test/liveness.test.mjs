import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../dist/app.js";

test("the built API exposes process liveness under /api/v1", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://127.0.0.1/taskflow_smoke";
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  process.env.WEB_ORIGIN = "https://web.example.invalid";
  const app = await createApp();
  t.after(() => app.close());
  await app.listen(0, "127.0.0.1");
  const response = await fetch(
    new URL("/api/v1/health/live", await app.getUrl()),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  const { paths, components } = await (
    await fetch(new URL("/api/v1/openapi.json", await app.getUrl()))
  ).json();
  assert.ok(paths["/api/v1/auth/register"].post.responses["201"]);
  assert.ok(paths["/api/v1/auth/login"].post.responses["200"]);
  assert.deepEqual(paths["/api/v1/auth/me"].get.security, [{ cookie: [] }]);
  assert.equal(components.securitySchemes.cookie.name, "access_token");
});
