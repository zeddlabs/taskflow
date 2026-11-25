import {
  Body,
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
  ProjectPage,
  ProjectStatusSummary,
  ProjectSummary,
} from "./projects.dto";
import { ProjectsService } from "./projects.service";

@ApiTags("Projects")
@ApiCookieAuth()
@ApiUnauthorizedResponse(problemResponse("A current session is required."))
@ApiNotFoundResponse(problemResponse("Workspace or project unavailable."))
@Controller()
export class ProjectsController {
  constructor(
    private readonly auth: AuthService,
    private readonly projects: ProjectsService,
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
