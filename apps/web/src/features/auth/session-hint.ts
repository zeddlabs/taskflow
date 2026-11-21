// Tab-local presentation state. Only the API can establish a valid session.
const key = "taskflow.sign-in-context";
type Hint = "authenticated" | "ended";

export function readSessionHint() {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSessionHint(hint: Hint | null) {
  try {
    if (hint === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, hint);
  } catch {
    // Storage can be unavailable. The ordinary sign-in flow still works.
  }
}
