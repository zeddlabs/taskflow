import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { logs, mailbox, me, pool, post, signedIn } from "./integration-fixture";

type Session = Awaited<ReturnType<typeof signedIn>>;
function action(user: Session, operation: "request" | "consume") {
  return post("email-verification/" + operation)
    .set("Cookie", "access_token=" + user.access)
    .set("X-CSRF-Token", user.csrf);
}
const table = "email_verification_challenges";
async function deliver(user: Session) {
  const result = await action(user, "request").send({}).expect(204);
  const code = await readFile(
    join(
      mailbox,
      createHash("sha256").update(user.profile.email).digest("hex"),
    ),
    "utf8",
  );
  expect(code).toMatch(/^[0-9]{8}$/);
  expect(result.text).toBe("");
  return code;
}

test("only the matching signed-in account verifies once, including concurrent submissions", async () => {
  const owner = await signedIn(),
    other = await signedIn();
  await post("email-verification/request").expect(401);
  await action(owner, "request").unset("X-CSRF-Token").expect(403);
  const code = await deliver(owner);
  const { rows } = await pool.query(
    "SELECT * FROM " + table + ' WHERE "userId"=$1',
    [owner.profile.id],
  );
  expect(rows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(rows[0].tokenHash).not.toBe(code);
  expect(rows[0].expiresAt.getTime() - rows[0].issuedAt.getTime()).toBe(900000);
  await action(other, "consume").send({ code }).expect(409);
  await action(owner, "consume")
    .unset("X-CSRF-Token")
    .send({ code })
    .expect(403);
  await action(owner, "consume")
    .send({ code, userId: other.profile.id })
    .expect(400);
  const pair = await Promise.all([
    action(owner, "consume").send({ code }),
    action(owner, "consume").send({ code }),
  ]);
  expect(pair.map((r) => r.status).sort()).toEqual([204, 409]);
  await action(owner, "consume").send({ code }).expect(409);
  expect((await me(owner.access).expect(200)).body.emailVerified).toBe(true);
  expect((await me(other.access).expect(200)).body.emailVerified).toBe(false);
  await action(owner, "request").expect(204);
  expect(
    (
      await pool.query("SELECT 1 FROM " + table + ' WHERE "userId"=$1', [
        owner.profile.id,
      ])
    ).rowCount,
  ).toBe(0);
  expect(logs).not.toContain(code);
});
test("resend, expiry, address changes and failed attempt limits protect a challenge", async () => {
  const user = await signedIn();
  const id = user.profile.id;
  const first = await deliver(user);
  await action(user, "request").expect(429);
  await pool.query(
    "UPDATE " + table + ' SET "expiresAt"=now() WHERE "userId"=$1',
    [id],
  );
  await action(user, "consume").send({ code: first }).expect(409);
  await pool.query(
    "UPDATE " +
      table +
      ' SET "issuedAt"=now()-interval \'2 minutes\' WHERE "userId"=$1',
    [id],
  );
  const code = await deliver(user);
  const wrong = code === "00000000" ? "11111111" : "00000000";
  expect(code).not.toBe(first);
  await action(user, "consume").send({ code: first }).expect(409);
  await pool.query(
    "UPDATE " +
      table +
      ' SET attempts=0, "emailNormalized"=$2 WHERE "userId"=$1',
    [id, "old@example.invalid"],
  );
  await action(user, "consume").send({ code }).expect(409);
  await pool.query(
    "UPDATE " + table + ' SET "emailNormalized"=$2 WHERE "userId"=$1',
    [id, user.profile.email],
  );
  for (let i = 1; i <= 5; i++)
    await action(user, "consume")
      .send({ code: wrong })
      .expect(i === 5 ? 429 : 409);
  await action(user, "consume").send({ code }).expect(429);
  expect((await me(user.access)).body.emailVerified).toBe(false);
});
