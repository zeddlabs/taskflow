import type { Prisma } from "../generated/prisma/client";

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
