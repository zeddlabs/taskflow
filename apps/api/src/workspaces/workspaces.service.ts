import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import {
  requireWorkspacePermission,
  authorizeWorkspaceWrite,
} from "./workspace-policy";
import { directoryCursor, directoryAfter } from "./directory-cursor";
import { AuthConfig } from "../auth/auth.config";
import { DatabaseService } from "../database.service";
import { InvalidDtoException } from "../http/problem-details";
import {
  CreateWorkspaceDto,
  CreatedWorkspace,
  WorkspaceListQuery,
  WorkspacePage,
  WorkspaceSummary,
  UpdateWorkspaceDto,
  WorkspaceSettings,
} from "./workspaces.dto";

const membershipSelect = {
  role: true,
  workspace: { select: { id: true, name: true, slug: true } },
} as const;

const settingsSelect = {
  ...membershipSelect.workspace.select,
  timezone: true,
  allowMemberCreateProjects: true,
} as const;

function workspaceConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  )
    throw new ConflictException();
  throw error;
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  async create(
    userId: string,
    dto: CreateWorkspaceDto,
    requestId: string,
  ): Promise<CreatedWorkspace> {
    return this.db.$transaction(async (tx) => {
      const workspace = await tx.workspace
        .create({
          data: { name: dto.name, slug: dto.slug },
          select: { id: true, name: true, slug: true, createdAt: true },
        })
        .catch(workspaceConflict);
      await tx.workspaceMember.create({
        data: { workspaceId: workspace.id, userId, role: "OWNER" },
      });
      await tx.auditLog.create({
        data: {
          workspaceId: workspace.id,
          actorId: userId,
          action: "WORKSPACE_CREATED",
          targetType: "Workspace",
          targetId: workspace.id,
          requestId,
          details: {},
        },
      });
      return { ...workspace, myRole: "OWNER" };
    });
  }

  async settings(
    userId: string,
    workspaceId: string,
  ): Promise<WorkspaceSettings> {
    const member = await this.db.workspaceMember.findFirst({
      where: { userId, workspaceId, workspace: { archivedAt: null } },
      select: { role: true, workspace: { select: settingsSelect } },
    });
    if (!member) throw new NotFoundException();
    requireWorkspacePermission(member.role, "settings");
    return { ...member.workspace, myRole: member.role };
  }

  async update(
    userId: string,
    workspaceId: string,
    dto: UpdateWorkspaceDto,
    requestId: string,
  ): Promise<WorkspaceSettings> {
    return this.db.$transaction(async (tx) => {
      const role = await authorizeWorkspaceWrite(
        tx,
        userId,
        workspaceId,
        "settings",
      );
      const data = {
        name: dto.name,
        slug: dto.slug,
        timezone: dto.timezone,
        allowMemberCreateProjects: dto.allowMemberCreateProjects,
      };
      const fields = Object.entries(data)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      if (!fields.length) throw new InvalidDtoException();
      const workspace = await tx.workspace
        .update({ where: { id: workspaceId }, data, select: settingsSelect })
        .catch(workspaceConflict);
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          targetType: "Workspace",
          targetId: workspaceId,
          requestId,
          action: "WORKSPACE_SETTINGS_UPDATED",
          details: { fields },
        },
      });
      return { ...workspace, myRole: role };
    });
  }

  async archive(userId: string, workspaceId: string, requestId: string) {
    await this.db.$transaction(async (tx) => {
      await authorizeWorkspaceWrite(tx, userId, workspaceId, "archive");
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { archivedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          targetType: "Workspace",
          targetId: workspaceId,
          requestId,
          action: "WORKSPACE_ARCHIVED",
          details: {},
        },
      });
    });
  }

  async list(
    userId: string,
    query: WorkspaceListQuery,
  ): Promise<WorkspacePage> {
    const after =
      query.cursor === undefined
        ? undefined
        : directoryAfter(
            this.config.secret,
            ["workspace-list-v1", userId],
            query.cursor,
          );
    const rows = await this.db.workspaceMember.findMany({
      where: {
        userId,
        workspace: { archivedAt: null },
        workspaceId: { gt: after },
      },
      orderBy: { workspaceId: "asc" },
      take: query.limit + 1,
      select: membershipSelect,
    });
    const hasNextPage = rows.length > query.limit;
    const data = rows
      .slice(0, query.limit)
      .map(({ workspace, role }) => ({ ...workspace, myRole: role }));
    return {
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage
          ? directoryCursor(
              this.config.secret,
              ["workspace-list-v1", userId],
              data[data.length - 1].id,
            )
          : null,
      },
    };
  }

  async detail(userId: string, workspaceId: string): Promise<WorkspaceSummary> {
    const row = await this.db.workspaceMember.findFirst({
      where: { workspaceId, userId, workspace: { archivedAt: null } },
      select: membershipSelect,
    });
    if (!row) throw new NotFoundException();
    return { ...row.workspace, myRole: row.role };
  }
}
