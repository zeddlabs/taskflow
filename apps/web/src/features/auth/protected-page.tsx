import { cookies } from "next/headers";
import { apiOrigin } from "./api-origin";
import { ProtectedShell } from "../shell/protected-shell";
import type { Profile } from "./session";
import {
  readDirectory,
  type WorkspaceSnapshot,
} from "../workspaces/workspace-directory";

export async function ProtectedPage({
  view,
  slug,
}: {
  view: import("../shell/protected-shell").View;
  slug?: string;
}) {
  const access = (await cookies()).get("access_token");
  let profile: Profile | undefined;
  let snapshot: WorkspaceSnapshot | undefined;
  if (access) {
    try {
      const read = (path: string) =>
        fetch(apiOrigin() + "/api/v1" + path, {
          headers: {
            cookie: "access_token=" + encodeURIComponent(access.value),
          },
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(5000),
        });
      const response = await read("/auth/me");
      if (response.ok) profile = await response.json();
      if (profile && (slug || view === "overview")) {
        const directory = await readDirectory(async (path) => {
          const page = await read("/workspaces" + path);
          if (!page.ok) throw new Error("Workspace directory unavailable");
          return page;
        });
        snapshot = { directory };
        const selected = slug && directory.find((w) => w.slug === slug);
        if (selected) {
          const detail = await read(
            "/workspaces/" +
              encodeURIComponent(selected.id) +
              (view === "settings" ? "/settings" : ""),
          );
          if (detail.ok) snapshot.active = await detail.json();
        }
      }
    } catch {
      // The browser retries through the same-origin API and renders its error state.
    }
  }
  return (
    <ProtectedShell
      key={[profile?.id, view, slug].join("/")}
      view={view}
      initialProfile={profile}
      snapshot={snapshot}
      slug={slug}
    />
  );
}
