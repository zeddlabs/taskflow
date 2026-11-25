import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client";
import { lockWorkspaceForMember } from "../workspaces/workspace-policy";

// All project and workspace membership writes acquire the same workspace lock.
export async function authorizeProjectWrite(
  tx: Prisma.TransactionClient,
  actorId: string,
  projectId: string,
) {
  const where = { id: projectId, ...readableProjects(actorId) };
  const scope = await tx.project.findFirst({
    where,
    select: { workspaceId: true },
  });
  if (!scope) throw new NotFoundException();
  const role = await lockWorkspaceForMember(tx, actorId, scope.workspaceId);
  const project = await tx.project.findFirst({
    where: { ...where, workspaceId: scope.workspaceId },
    select: {
      id: true,
      workspaceId: true,
      visibility: true,
      archivedAt: true,
      startDate: true,
      dueDate: true,
      members: { where: { userId: actorId }, select: { role: true } },
    },
  });
  if (!project) throw new NotFoundException();
  const manages =
    role === "OWNER" ||
    (role === "ADMIN" && project.visibility === "WORKSPACE") ||
    (role !== "GUEST" && project.members[0]?.role === "MANAGER");
  if (!manages) throw new ForbiddenException();
  if (project.archivedAt) throw new ConflictException();
  return project;
}

// ProjectMember's composite foreign keys require current membership in this
// project's workspace. Workspace owners retain access without a project role.
export function readableProjects(userId: string): Prisma.ProjectWhereInput {
  return {
    workspace: { archivedAt: null },
    OR: [
      { workspace: { members: { some: { userId, role: "OWNER" } } } },
      {
        visibility: "WORKSPACE",
        workspace: {
          members: { some: { userId, role: { in: ["ADMIN", "MEMBER"] } } },
        },
      },
      { members: { some: { userId } } },
    ],
  };
}
