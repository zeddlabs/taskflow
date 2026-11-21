import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import next from "next";

test("the built web app routes home to the dashboard and serves the public sign-in form", async (t) => {
  const app = next({ dev: false });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(base, { redirect: "manual" });
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/app");
  const response = await fetch(base + "/login");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Welcome back/);
});
