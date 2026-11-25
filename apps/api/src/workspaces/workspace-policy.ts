import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import type { WorkspaceRole } from "../generated/prisma/enums";

const workspacePermissions = {
  settings: ["OWNER", "ADMIN"],
  createProject: ["OWNER", "ADMIN", "MEMBER"],
  archive: ["OWNER"],
  listMembers: ["OWNER", "ADMIN", "MEMBER"],
  manageMembers: ["OWNER", "ADMIN"],
  manageInvitations: ["OWNER", "ADMIN"],
  transferOwnership: ["OWNER"],
} satisfies Record<string, WorkspaceRole[]>;

export type WorkspaceAction = keyof typeof workspacePermissions;

export function requireWorkspacePermission(
  role: WorkspaceRole,
  action: WorkspaceAction,
) {
  const permitted: readonly WorkspaceRole[] = workspacePermissions[action];
  if (!permitted.includes(role)) throw new ForbiddenException();
}

// Take the workspace lock first for every lifecycle write. Read the actor again
// after acquiring it so a queued request observes transfers and removals.
export async function authorizeWorkspaceWrite(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
  action: WorkspaceAction,
) {
  const workspace = await tx.$queryRaw<{ id: string }[]>`
    SELECT w.id FROM workspaces w
    WHERE w.id = ${workspaceId} AND w."archivedAt" IS NULL AND EXISTS (
      SELECT 1 FROM workspace_members WHERE "workspaceId" = w.id AND "userId" = ${userId}
    ) FOR UPDATE OF w`;
  if (!workspace.length) throw new NotFoundException();
  const [actor] = await tx.$queryRaw<{ role: WorkspaceRole }[]>`
    SELECT role FROM workspace_members WHERE "workspaceId" = ${workspaceId}
    AND "userId" = ${userId} FOR UPDATE`;
  if (!actor) throw new NotFoundException();
  requireWorkspacePermission(actor.role, action);
  return actor.role;
}

export function requireAssignableRole(role: WorkspaceRole) {
  if (role === "OWNER") throw new ForbiddenException();
}

export function requireMemberTarget(
  action: "manageMembers" | "transferOwnership",
  role: WorkspaceRole,
) {
  if (role === "OWNER" || (action === "transferOwnership" && role === "GUEST"))
    throw new ForbiddenException();
}
