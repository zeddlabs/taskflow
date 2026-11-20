import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../dist/app.js";

test("the built API exposes process liveness under /api/v1", async (t) => {
  const app = await createApp();
  t.after(() => app.close());
  await app.listen(0, "127.0.0.1");
  const response = await fetch(
    new URL("/api/v1/health/live", await app.getUrl()),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
