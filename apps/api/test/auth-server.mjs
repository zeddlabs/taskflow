import { createApp } from "../dist/app.js";

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { VerificationMailer } from "../dist/auth/verification-mailer.js";
import { SmtpMailer } from "../dist/auth/smtp-mailer.js";

const app = await createApp();
// This entry point is only used by test suites. Production starts dist/main.js.
const inbox = process.env.TASKFLOW_TEST_MAILBOX;
if (inbox) {
  await mkdir(inbox, { recursive: true, mode: 0o700 });
  app.get(SmtpMailer).send = async (email, _subject, text) => {
    const filename =
      "invite-" + createHash("sha256").update(email).digest("hex");
    await writeFile(join(inbox, filename), text, { mode: 0o600 });
  };
  app.get(VerificationMailer).send = async (email, code) => {
    const filename = createHash("sha256").update(email).digest("hex");
    await writeFile(join(inbox, filename), code, { mode: 0o600 });
  };
}
await app.listen(process.send ? 0 : Number(process.env.PORT), "127.0.0.1");
process.send?.(await app.getUrl());
process.on("disconnect", () => app.close());
