export function apiOrigin() {
  const value = process.env.TASKFLOW_API_ORIGIN ?? "http://127.0.0.1:4000";
  const url = new URL(value);
  if (url.origin !== value || !["https:", "http:"].includes(url.protocol))
    throw new Error("TASKFLOW_API_ORIGIN must be an exact HTTP(S) origin.");
  return value;
}
