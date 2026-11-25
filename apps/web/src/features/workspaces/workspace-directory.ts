import type { Settings, Workspace } from "./workspace-api";

export type WorkspaceSnapshot = {
  directory: Workspace[];
  active?: Workspace | Settings;
};
export async function readDirectory<T = Workspace>(
  read: (path: string) => Promise<Response>,
) {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
    const response = await read("?" + params);
    const page: { data: T[]; pageInfo: { nextCursor: string | null } } =
      await response.json();
    rows.push(...page.data);
    cursor = page.pageInfo.nextCursor;
  } while (cursor);
  return rows;
}
