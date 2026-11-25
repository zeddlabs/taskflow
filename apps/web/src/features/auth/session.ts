"use client";

export interface Profile {
  id: string;
  name: string;
  email: string;
  timezone: string;
  emailVerified: boolean;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null = null,
  ) {
    super("Request failed (" + status + ")");
  }
}
const authPath = "/api/v1/auth/";
const channelName = "taskflow-session";
let csrf: string | null = null;

async function call(path: string, options?: RequestInit) {
  const response = await fetch(authPath + path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
  if (!response.ok)
    throw new ApiError(response.status, response.headers.get("Retry-After"));
  const proof = response.headers.get("X-CSRF-Token");
  if (proof) csrf = proof;
  return response;
}
function unauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}
function currentProfile(): Promise<Profile> {
  return call("me").then((response) => response.json());
}

async function proof() {
  await call("refresh/csrf");
  if (!csrf) throw new Error("Session proof unavailable");
  return csrf;
}
function withSessionLock<T>(action: () => Promise<T>) {
  // A rotation in another tab can invalidate every credential for this login.
  // Never rotate without an origin-wide lock.
  if (!navigator.locks)
    throw new Error("Session coordination requires HTTPS or localhost.");
  return navigator.locks.request("taskflow-session-write", action);
}
export async function loadProfile(): Promise<Profile> {
  try {
    return await currentProfile();
  } catch (error) {
    if (!unauthorized(error)) throw error;
  }
  return withSessionLock(async () => {
    // The request which held the lock before us may already have restored access.
    try {
      return await currentProfile();
    } catch (error) {
      if (!unauthorized(error)) throw error;
    }
    await call("refresh", {
      method: "POST",
      headers: { "X-CSRF-Token": await proof() },
    });
    return currentProfile();
  });
}
export function listenForSessionChange(onChange: (signedIn: boolean) => void) {
  const channel = new BroadcastChannel(channelName);
  channel.onmessage = ({ data }) => {
    if (data === "login" || data === "logout") {
      csrf = null;
      onChange(data === "login");
    }
  };
  return () => channel.close();
}
function notify(event: "login" | "logout") {
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(event);
  channel.close();
}
function submit(path: string, values: object) {
  return call(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
}
export function register(values: {
  name: string;
  email: string;
  password: string;
}) {
  return submit("register", values);
}
export function login(email: string, password: string) {
  return withSessionLock(async () => {
    await submit("login", { email, password });
    notify("login");
  });
}
export async function verifyEmail(code?: string) {
  await loadProfile();
  return withSessionLock(async () => {
    await call(
      "email-verification/" + (code === undefined ? "request" : "consume"),
      {
        method: "POST",
        headers: {
          "X-CSRF-Token": await proof(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(code === undefined ? {} : { code }),
      },
    );
  });
}

// Tenant requests use the same refresh coordination as the personal shell.
export async function workspaceRequest(
  actorId: string,
  path: string,
  method = "GET",
  body?: object,
  signal?: AbortSignal,
) {
  const send = async (token?: string) => {
    const response = await fetch("/api/v1/workspaces" + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: token
        ? { "X-CSRF-Token": token, "Content-Type": "application/json" }
        : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok)
      throw new ApiError(response.status, response.headers.get("Retry-After"));
    return response;
  };
  const checkedRequest = () =>
    navigator.locks.request(
      "taskflow-session-write",
      { mode: method === "GET" ? "shared" : "exclusive", signal },
      async () => {
        if ((await currentProfile()).id !== actorId) throw new ApiError(401);
        return send(method === "GET" ? undefined : await proof());
      },
    );
  try {
    return await checkedRequest();
  } catch (error) {
    if (!unauthorized(error)) throw error;
  }
  if ((await loadProfile()).id !== actorId) throw new ApiError(401);
  return checkedRequest();
}

export function logout() {
  return withSessionLock(async () => {
    // A reload loses the in-memory proof. Login and refresh cookies remain HttpOnly.
    let token = csrf;
    if (!token) {
      try {
        token = await proof();
      } catch (error) {
        if (!unauthorized(error)) throw error;
      }
    }
    await call("logout", {
      method: "POST",
      headers: token ? { "X-CSRF-Token": token } : {},
    });
    csrf = null;
    notify("logout");
  });
}
export function errorMessage(error: unknown, loginForm = false) {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return loginForm
        ? "The email or password is incorrect."
        : "Your session has ended. Sign in again.";
    if (error.status === 403)
      return "Access denied. Reload the page and try again.";
    if (error.status === 409)
      return "This email is already registered. Sign in to continue.";
    if (error.status === 429)
      return error.retryAfter
        ? "Too many attempts. Try again in " + error.retryAfter + " seconds."
        : "Too many attempts. Please try again later.";
    if (error.status === 400) return "Check your details and try again.";
  }
  return "Unable to reach your account. Check your connection and try again.";
}
