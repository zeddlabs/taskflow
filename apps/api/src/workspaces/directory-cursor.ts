import { createHmac, timingSafeEqual } from "node:crypto";
import { InvalidDtoException } from "../http/problem-details";

export function directoryCursor(secret: string, scope: string[], id: string) {
  const key = Buffer.from(id).toString("base64url");
  const mac = createHmac("sha256", secret)
    .update(JSON.stringify([...scope, key]))
    .digest("base64url");
  return key + "." + mac;
}

export function directoryAfter(
  secret: string,
  scope: string[],
  cursor: string,
) {
  const id = Buffer.from(cursor.split(".")[0], "base64url").toString();
  const expected = Buffer.from(directoryCursor(secret, scope, id));
  const supplied = Buffer.from(cursor);
  if (
    !id ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    throw new InvalidDtoException();
  return id;
}
