import { ForbiddenException } from "@nestjs/common";
import type { WorkspaceRole } from "../generated/prisma/enums";

const workspacePermissions = {
  settings: ["OWNER", "ADMIN"],
  archive: ["OWNER"],
} satisfies Record<string, WorkspaceRole[]>;

export type WorkspaceAction = keyof typeof workspacePermissions;

export function requireWorkspacePermission(
  role: WorkspaceRole,
  action: WorkspaceAction,
) {
  const permitted: readonly WorkspaceRole[] = workspacePermissions[action];
  if (!permitted.includes(role)) throw new ForbiddenException();
}
