import {
  applyDecorators,
  Body,
  Delete,
  HttpCode,
  Patch,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { accessCookie, csrfHeader } from "../auth/auth.config";
import { AuthService } from "../auth/auth.service";
import { AuthWriteGuard } from "../auth/auth-write.guard";
import { problemResponse, requestIdResponseHeaders } from "../http/openapi";
import { requestIdHeader } from "../http/request-log";
import { WorkspaceListQuery } from "../workspaces/workspaces.dto";
import {
  CreateProjectDto,
  AddProjectMemberDto,
  ProjectRoleDto,
  ProjectMembersPage,
  ProjectMemberProfile,
  UpdateProjectDto,
  ProjectPage,
  ProjectStatusSummary,
  ProjectSummary,
} from "./projects.dto";
import { ProjectsService } from "./projects.service";

import { ProjectManagementService } from "./project-management.service";

function ProjectMutation() {
  return applyDecorators(
    UseGuards(AuthWriteGuard),
    Header("Cache-Control", "no-store"),
    ApiHeader({ name: csrfHeader, required: true }),
    ApiForbiddenResponse(
      problemResponse(
        "Project management permission and valid session proof are required.",
      ),
    ),
    ApiConflictResponse(
      problemResponse("The project is archived or the grant already exists."),
    ),
    ApiTooManyRequestsResponse(problemResponse("Request rate limit reached.")),
  );
}

@ApiTags("Projects")
@ApiCookieAuth()
@ApiUnauthorizedResponse(problemResponse("A current session is required."))
@ApiNotFoundResponse(problemResponse("Workspace or project unavailable."))
@Controller()
export class ProjectsController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
    private readonly management: ProjectManagementService,
  ) {}
  private async actor(req: Request) {
    return (
      await this.auth.activeSession(
        parse(req.headers.cookie ?? "")[accessCookie],
      )
    ).user.id;
  }

  @Post("workspaces/:wid/projects")
  @UseGuards(AuthWriteGuard)
  @Header("Cache-Control", "no-store")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiCreatedResponse({
    type: ProjectSummary,
    headers: {
      ...requestIdResponseHeaders,
      Location: {
        description: "Project detail URL.",
        schema: { type: "string" },
      },
    },
  })
  @ApiBadRequestResponse(
    problemResponse("Invalid project fields or date range."),
  )
  @ApiForbiddenResponse(
    problemResponse(
      "Project creation is forbidden or session proof is invalid.",
    ),
  )
  @ApiConflictResponse(
    problemResponse("The workspace already contains this project key."),
  )
  @ApiTooManyRequestsResponse(problemResponse("Request rate limit reached."))
  async create(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Body() dto: CreateProjectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const project = await this.projects.create(
      await this.actor(req),
      wid,
      dto,
      String(res.getHeader(requestIdHeader)),
    );
    res.location("/api/v1/projects/" + project.id);
    return project;
  }

  @Get("workspaces/:wid/projects")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: ProjectPage, headers: requestIdResponseHeaders })
  @ApiBadRequestResponse(problemResponse("Invalid page parameters."))
  async list(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Query() query: WorkspaceListQuery,
  ) {
    return this.projects.list(await this.actor(req), wid, query);
  }

  @Get("projects/:pid")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: ProjectSummary, headers: requestIdResponseHeaders })
  async detail(@Req() req: Request, @Param("pid") pid: string) {
    return this.projects.detail(await this.actor(req), pid);
  }

  @Patch("projects/:pid")
  @ProjectMutation()
  @ApiBadRequestResponse(
    problemResponse(
      "Invalid or empty changes, immutable key or inconsistent dates.",
    ),
  )
  @ApiOkResponse({ type: ProjectSummary, headers: requestIdResponseHeaders })
  async update(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Body() dto: UpdateProjectDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.management.update(
      await this.actor(req),
      pid,
      dto,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Post("projects/:pid/archive")
  @HttpCode(200)
  @ProjectMutation()
  @ApiOkResponse({ type: ProjectSummary, headers: requestIdResponseHeaders })
  async archive(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.management.archive(
      await this.actor(req),
      pid,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Get("projects/:pid/members")
  @Header("Cache-Control", "no-store")
  @ApiBadRequestResponse(problemResponse("Invalid page parameters."))
  @ApiOkResponse({
    type: ProjectMembersPage,
    headers: requestIdResponseHeaders,
  })
  async members(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Query() query: WorkspaceListQuery,
  ) {
    return this.management.members(await this.actor(req), pid, query);
  }

  @Post("projects/:pid/members")
  @ProjectMutation()
  @ApiBadRequestResponse(problemResponse("Invalid user ID or project role."))
  @ApiCreatedResponse({
    type: ProjectMemberProfile,
    headers: requestIdResponseHeaders,
  })
  async addMember(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Body() dto: AddProjectMemberDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.management.add(
      await this.actor(req),
      pid,
      dto,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Patch("projects/:pid/members/:userId")
  @ProjectMutation()
  @ApiBadRequestResponse(problemResponse("Invalid project role."))
  @ApiOkResponse({
    type: ProjectMemberProfile,
    headers: requestIdResponseHeaders,
  })
  async changeRole(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Param("userId") userId: string,
    @Body() dto: ProjectRoleDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.management.changeRole(
      await this.actor(req),
      pid,
      userId,
      dto.role,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Delete("projects/:pid/members/:userId")
  @HttpCode(204)
  @ProjectMutation()
  @ApiNoContentResponse({ headers: requestIdResponseHeaders })
  async removeMember(
    @Req() req: Request,
    @Param("pid") pid: string,
    @Param("userId") userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.management.remove(
      await this.actor(req),
      pid,
      userId,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Get("projects/:pid/statuses")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({
    type: [ProjectStatusSummary],
    headers: requestIdResponseHeaders,
  })
  async statuses(@Req() req: Request, @Param("pid") pid: string) {
    return this.projects.statuses(await this.actor(req), pid);
  }
}
