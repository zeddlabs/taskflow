import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { createApp } from "../dist/app.js";

test("the built API exposes process liveness under /api/v1", async (t) => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = "postgresql://127.0.0.1/taskflow_smoke";
  process.env.JWT_ACCESS_SECRET = randomBytes(32).toString("hex");
  process.env.CSRF_SECRET = randomBytes(32).toString("hex");
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
  const directory = paths["/api/v1/workspaces"].get;
  const patch = paths["/api/v1/workspaces/{wid}"].patch;
  const archive = paths["/api/v1/workspaces/{wid}/archive"].post;
  for (const operation of [patch, archive]) {
    assert.deepEqual(operation.security, [{ cookie: [] }]);
    assert.ok(
      operation.parameters.some((p) => p.name === "X-CSRF-Token" && p.required),
    );
    assert.ok(operation.responses["403"]);
    assert.ok(operation.responses["404"]);
  }
  assert.ok(patch.responses["200"]);
  assert.ok(archive.responses["204"]);
  const memberPath = paths["/api/v1/workspaces/{wid}/members/{userId}"];
  const transfer = paths["/api/v1/workspaces/{wid}/transfer-ownership"].post;
  assert.ok(paths["/api/v1/workspaces/{wid}/members"].get.responses["200"]);
  for (const [operation, success] of [
    [memberPath.patch, "200"],
    [memberPath.delete, "204"],
    [transfer, "200"],
  ]) {
    assert.deepEqual(operation.security, [{ cookie: [] }]);
    assert.ok(
      operation.parameters.some((p) => p.name === "X-CSRF-Token" && p.required),
    );
    assert.ok(operation.responses[success]);
    for (const code of ["401", "403", "404"])
      assert.equal(
        operation.responses[code].content["application/problem+json"].schema
          .$ref,
        "#/components/schemas/ProblemDetails",
      );
  }
  const createWorkspace = paths["/api/v1/workspaces"].post;
  assert.deepEqual(createWorkspace.security, [{ cookie: [] }]);
  assert.ok(
    createWorkspace.parameters.some(
      (p) => p.name === "X-CSRF-Token" && p.required,
    ),
  );
  assert.ok(createWorkspace.responses["201"].headers.Location);
  assert.ok(createWorkspace.responses["409"]);
  assert.deepEqual(directory.security, [{ cookie: [] }]);
  assert.ok(directory.responses["400"]);
  assert.ok(directory.responses["401"]);
  assert.equal(
    directory.responses["200"].content["application/json"].schema.$ref,
    "#/components/schemas/WorkspacePage",
  );
  assert.ok(paths["/api/v1/workspaces/{wid}"].get.responses["404"]);
  assert.deepEqual(paths["/api/v1/auth/me"].get.security, [{ cookie: [] }]);
  assert.equal(components.securitySchemes.cookie.name, "access_token");
  assert.equal(components.securitySchemes.refresh.name, "refresh_token");
  assert.equal(components.securitySchemes.logout.name, "logout_session");
  for (const action of ["request", "consume"]) {
    const operation = paths["/api/v1/auth/email-verification/" + action].post;
    assert.deepEqual(operation.security, [{ cookie: [] }]);
    assert.ok(
      operation.parameters.some((p) => p.name === "X-CSRF-Token" && p.required),
    );
    for (const code of ["204", "401", "403", "429"])
      assert.ok(operation.responses[code]);
  }
  const invitations = paths["/api/v1/workspaces/{wid}/invitations"];
  assert.ok(invitations.get.responses["200"]);
  for (const [operation, success] of [
    [invitations.post, "201"],
    [paths["/api/v1/workspaces/{wid}/invitations/{iid}/resend"].post, "200"],
    [paths["/api/v1/workspaces/{wid}/invitations/{iid}"].delete, "204"],
    [paths["/api/v1/invitations/accept"].post, "200"],
  ]) {
    assert.deepEqual(operation.security, [{ cookie: [] }]);
    assert.ok(
      operation.parameters.some((p) => p.name === "X-CSRF-Token" && p.required),
    );
    assert.ok(operation.responses[success]);
    assert.ok(operation.responses["409"].content["application/problem+json"]);
  }
  const bootstrap = paths["/api/v1/auth/refresh/csrf"].get;
  assert.ok(bootstrap.responses["204"].headers["X-CSRF-Token"]);
  for (const [path, code] of [
    ["refresh", "200"],
    ["logout", "204"],
  ]) {
    const operation = paths["/api/v1/auth/" + path].post;
    assert.ok(operation.responses[code]);
    assert.ok(
      operation.parameters.some(
        (header) => header.name === "X-CSRF-Token" && header.required,
      ),
    );
  }
});
