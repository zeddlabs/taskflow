import { cookies } from "next/headers";
import { apiOrigin } from "./api-origin";
import { ProtectedShell } from "../shell/protected-shell";
import type { Profile } from "./session";

export async function ProtectedPage({
  view,
}: {
  view: "overview" | "account";
}) {
  const access = (await cookies()).get("access_token");
  let profile: Profile | undefined;
  if (access) {
    try {
      const response = await fetch(apiOrigin() + "/api/v1/auth/me", {
        headers: { cookie: "access_token=" + encodeURIComponent(access.value) },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) profile = await response.json();
    } catch {
      // The browser retries through the same-origin API and renders its error state.
    }
  }
  return <ProtectedShell view={view} initialProfile={profile} />;
}
