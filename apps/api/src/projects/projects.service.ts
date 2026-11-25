import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuthConfig } from "../auth/auth.config";
import { DatabaseService } from "../database.service";
import { Prisma } from "../generated/prisma/client";
import { InvalidDtoException } from "../http/problem-details";
import {
  directoryAfter,
  directoryCursor,
} from "../workspaces/directory-cursor";
import { authorizeWorkspaceWrite } from "../workspaces/workspace-policy";
import { WorkspaceListQuery } from "../workspaces/workspaces.dto";
import { readableProjects } from "./project-policy";
import {
  CreateProjectDto,
  ProjectPage,
  ProjectSummary,
  ProjectStatusSummary,
} from "./projects.dto";

export const projectSummarySelect = {
  id: true,
  workspaceId: true,
  key: true,
  name: true,
  description: true,
  visibility: true,
  startDate: true,
  dueDate: true,
  archivedAt: true,
} as const;
const defaults = [
  { name: "Backlog", category: "BACKLOG", sortOrder: 1000 },
  { name: "To Do", category: "TODO", sortOrder: 2000 },
  { name: "In Progress", category: "IN_PROGRESS", sortOrder: 3000 },
  { name: "Done", category: "DONE", sortOrder: 4000 },
] satisfies Prisma.ProjectStatusCreateWithoutProjectInput[];

@Injectable()
export class ProjectsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateProjectDto,
    requestId: string,
  ): Promise<ProjectSummary> {
    if (dto.startDate && dto.dueDate && dto.dueDate < dto.startDate)
      throw new InvalidDtoException();
    return this.db.$transaction(async (tx) => {
      const role = await authorizeWorkspaceWrite(
        tx,
        userId,
        workspaceId,
        "createProject",
      );
      if (role === "MEMBER") {
        const workspace = await tx.workspace.findUniqueOrThrow({
          where: { id: workspaceId },
          select: { allowMemberCreateProjects: true },
        });
        if (!workspace.allowMemberCreateProjects)
          throw new ForbiddenException();
      }
      const project = await tx.project
        .create({
          data: {
            workspaceId,
            key: dto.key,
            name: dto.name,
            description: dto.description,
            visibility: dto.visibility,
            startDate: dto.startDate ? new Date(dto.startDate) : undefined,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          },
          select: projectSummarySelect,
        })
        .catch((error: unknown) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            throw new ConflictException();
          throw error;
        });
      await tx.projectStatus.createMany({
        data: defaults.map((status) => ({ ...status, projectId: project.id })),
      });
      await tx.projectMember.create({
        data: { workspaceId, projectId: project.id, userId, role: "MANAGER" },
      });
      await tx.auditLog.create({
        data: {
          workspaceId,
          actorId: userId,
          action: "PROJECT_CREATED",
          targetType: "Project",
          targetId: project.id,
          requestId,
          details: {},
        },
      });
      return project;
    });
  }

  async list(
    userId: string,
    workspaceId: string,
    query: WorkspaceListQuery,
  ): Promise<ProjectPage> {
    const scope = ["projects:v1", userId, workspaceId];
    const after =
      query.cursor === undefined
        ? undefined
        : directoryAfter(this.config.secret, scope, query.cursor);
    const workspace = await this.db.workspace.findFirst({
      where: {
        id: workspaceId,
        archivedAt: null,
        members: { some: { userId } },
      },
      select: {
        projects: {
          where: {
            ...readableProjects(userId),
            archivedAt: null,
            id: { gt: after },
          },
          orderBy: { id: "asc" },
          take: query.limit + 1,
          select: projectSummarySelect,
        },
      },
    });
    if (!workspace) throw new NotFoundException();
    const data = workspace.projects.slice(0, query.limit);
    const hasNextPage = workspace.projects.length > query.limit;
    return {
      data,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage
          ? directoryCursor(this.config.secret, scope, data[data.length - 1].id)
          : null,
      },
    };
  }

  async detail(userId: string, id: string): Promise<ProjectSummary> {
    const project = await this.db.project.findFirst({
      where: { id, ...readableProjects(userId) },
      select: projectSummarySelect,
    });
    if (!project) throw new NotFoundException();
    return project;
  }

  async statuses(userId: string, id: string): Promise<ProjectStatusSummary[]> {
    const project = await this.db.project.findFirst({
      where: { id, ...readableProjects(userId) },
      select: {
        statuses: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            category: true,
            sortOrder: true,
            color: true,
          },
        },
      },
    });
    if (!project) throw new NotFoundException();
    return project.statuses;
  }
}
