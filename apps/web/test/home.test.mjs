import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import next from "next";

test("the built web app serves the TaskFlow home page", async (t) => {
  const app = next({ dev: false });
  await app.prepare();
  const server = createServer(app.getRequestHandler());
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const response = await fetch(`http://127.0.0.1:${server.address().port}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<h1>TaskFlow<\/h1>/);
});
