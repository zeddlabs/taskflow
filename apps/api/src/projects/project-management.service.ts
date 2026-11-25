import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuthConfig } from "../auth/auth.config";
import { DatabaseService } from "../database.service";
import type { Prisma } from "../generated/prisma/client";
import type { ProjectRole } from "../generated/prisma/enums";
import { InvalidDtoException } from "../http/problem-details";
import {
  directoryAfter,
  directoryCursor,
} from "../workspaces/directory-cursor";
import { WorkspaceListQuery } from "../workspaces/workspaces.dto";
import { authorizeProjectWrite, readableProjects } from "./project-policy";
import {
  AddProjectMemberDto,
  ProjectMembersPage,
  UpdateProjectDto,
} from "./projects.dto";
import { projectSummarySelect } from "./projects.service";

type ManagedProject = Awaited<ReturnType<typeof authorizeProjectWrite>>;
type Audit = (action: string, details: Prisma.InputJsonObject) => Promise<void>;

const profileSelect = {
  userId: true,
  role: true,
  member: { select: { user: { select: { name: true, avatarUrl: true } } } },
} as const;
function profile(
  row: Prisma.ProjectMemberGetPayload<{ select: typeof profileSelect }>,
) {
  return { userId: row.userId, role: row.role, ...row.member.user };
}

function patchDate(input: string | null | undefined, current: Date | null) {
  if (input === undefined) return current;
  return input === null ? null : new Date(input);
}

@Injectable()
export class ProjectManagementService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  private mutate<T>(
    actorId: string,
    projectId: string,
    requestId: string,
    write: (
      tx: Prisma.TransactionClient,
      project: ManagedProject,
      audit: Audit,
    ) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      const project = await authorizeProjectWrite(tx, actorId, projectId);
      const audit: Audit = async (action, details) => {
        await tx.auditLog.create({
          data: {
            workspaceId: project.workspaceId,
            actorId,
            action,
            targetType: "Project",
            targetId: projectId,
            requestId,
            details,
          },
        });
      };
      return write(tx, project, audit);
    });
  }

  update(
    actorId: string,
    id: string,
    dto: UpdateProjectDto,
    requestId: string,
  ) {
    return this.mutate(actorId, id, requestId, async (tx, project, audit) => {
      const fields = Object.entries(dto)
        .filter(([, value]) => value !== undefined)
        .map(([field]) => field);
      if (!fields.length) throw new InvalidDtoException();
      const startDate = patchDate(dto.startDate, project.startDate);
      const dueDate = patchDate(dto.dueDate, project.dueDate);
      if (startDate && dueDate && startDate > dueDate)
        throw new InvalidDtoException();
      const result = await tx.project.update({
        where: { workspaceId_id: { workspaceId: project.workspaceId, id } },
        select: projectSummarySelect,
        data: {
          name: dto.name,
          visibility: dto.visibility,
          description: dto.description,
          startDate,
          dueDate,
        },
      });
      await audit("PROJECT_UPDATED", {
        fields,
        ...(result.visibility !== project.visibility
          ? {
              fromVisibility: project.visibility,
              toVisibility: result.visibility,
            }
          : {}),
      });
      return result;
    });
  }

  archive(actorId: string, id: string, requestId: string) {
    return this.mutate(actorId, id, requestId, async (tx, project, audit) => {
      const result = await tx.project.update({
        where: { workspaceId_id: { workspaceId: project.workspaceId, id } },
        data: { archivedAt: new Date() },
        select: projectSummarySelect,
      });
      await audit("PROJECT_ARCHIVED", {});
      return result;
    });
  }

  async members(
    actorId: string,
    projectId: string,
    query: WorkspaceListQuery,
  ): Promise<ProjectMembersPage> {
    const scope = ["project-members:v1", actorId, projectId];
    const after =
      query.cursor === undefined
        ? undefined
        : directoryAfter(this.config.secret, scope, query.cursor);
    const [project] = await this.db.$transaction(
      [
        this.db.project.findFirst({
          where: { id: projectId, ...readableProjects(actorId) },
          select: {
            members: {
              where: { userId: { gt: after } },
              orderBy: { userId: "asc" },
              take: query.limit + 1,
              select: profileSelect,
            },
          },
        }),
      ],
      { isolationLevel: "RepeatableRead" },
    );
    if (!project) throw new NotFoundException();
    const data = project.members.slice(0, query.limit).map(profile);
    const hasNextPage = query.limit < project.members.length;
    return {
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage
          ? directoryCursor(
              this.config.secret,
              scope,
              data[data.length - 1].userId,
            )
          : null,
      },
    };
  }

  private async requireAssignable(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    userId: string,
    role: ProjectRole,
  ) {
    const target = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    if (!target) throw new NotFoundException();
    if (target.role === "GUEST" && role === "MANAGER")
      throw new ForbiddenException();
  }

  add(
    actorId: string,
    projectId: string,
    dto: AddProjectMemberDto,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      projectId,
      requestId,
      async (tx, project, audit) => {
        const { userId, role } = dto;
        await this.requireAssignable(tx, project.workspaceId, userId, role);
        const existing = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId } },
          select: { id: true },
        });
        if (existing) throw new ConflictException();
        const row = await tx.projectMember.create({
          data: { workspaceId: project.workspaceId, projectId, userId, role },
          select: profileSelect,
        });
        await audit("PROJECT_MEMBER_ADDED", { userId, toRole: role });
        return profile(row);
      },
    );
  }

  changeRole(
    actorId: string,
    projectId: string,
    userId: string,
    role: ProjectRole,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      projectId,
      requestId,
      async (tx, project, audit) => {
        const where = {
          workspaceId: project.workspaceId,
          projectId_userId: { projectId, userId },
        };
        const existing = await tx.projectMember.findUnique({
          where,
          select: profileSelect,
        });
        if (!existing) throw new NotFoundException();
        await this.requireAssignable(tx, project.workspaceId, userId, role);
        if (existing.role === role) return profile(existing);
        const row = await tx.projectMember.update({
          where,
          data: { role },
          select: profileSelect,
        });
        await audit("PROJECT_MEMBER_ROLE_CHANGED", {
          userId,
          fromRole: existing.role,
          toRole: role,
        });
        return profile(row);
      },
    );
  }

  remove(
    actorId: string,
    projectId: string,
    userId: string,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      projectId,
      requestId,
      async (tx, project, audit) => {
        const where = {
          workspaceId: project.workspaceId,
          projectId_userId: { projectId, userId },
        };
        const existing = await tx.projectMember.findUnique({
          where,
          select: { role: true },
        });
        if (!existing) throw new NotFoundException();
        await tx.projectMember.delete({ where });
        await audit("PROJECT_MEMBER_REMOVED", {
          userId,
          fromRole: existing.role,
        });
      },
    );
  }
}
