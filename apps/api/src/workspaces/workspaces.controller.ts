import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Patch,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { accessCookie, csrfHeader } from "../auth/auth.config";
import { requestIdHeader } from "../http/request-log";
import { requestIdResponseHeaders } from "../http/openapi";
import { WorkspacesService } from "./workspaces.service";
import {
  CreateWorkspaceDto,
  CreatedWorkspace,
  WorkspaceListQuery,
  WorkspacePage,
  WorkspaceSummary,
  UpdateWorkspaceDto,
  WorkspaceSettings,
} from "./workspaces.dto";

@Controller("workspaces")
@ApiTags("Workspaces")
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: "A current session is required." })
export class WorkspacesController {
  constructor(
    private readonly auth: AuthService,
    private readonly workspaces: WorkspacesService,
  ) {}

  private async actor(req: Request) {
    const session = await this.auth.activeSession(
      parse(req.headers.cookie ?? "")[accessCookie],
    );
    return session.user.id;
  }

  @Post()
  @Header("Cache-Control", "no-store")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiCreatedResponse({
    type: CreatedWorkspace,
    headers: {
      ...requestIdResponseHeaders,
      Location: {
        description: "Created workspace resource",
        schema: { type: "string" },
      },
    },
  })
  @ApiBadRequestResponse({
    description: "Invalid workspace name, slug or fields.",
  })
  @ApiForbiddenResponse({
    description: "Invalid origin or session CSRF proof.",
  })
  @ApiConflictResponse({
    description: "The normalized slug is already in use.",
  })
  async create(
    @Req() req: Request,
    @Body() dto: CreateWorkspaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const workspace = await this.workspaces.create(
      await this.actor(req),
      dto,
      String(res.getHeader(requestIdHeader)),
    );
    res.location("/api/v1/workspaces/" + workspace.id);
    return workspace;
  }

  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: WorkspacePage, headers: requestIdResponseHeaders })
  @ApiBadRequestResponse({ description: "Invalid pagination parameters." })
  async list(@Req() req: Request, @Query() query: WorkspaceListQuery) {
    return this.workspaces.list(await this.actor(req), query);
  }

  @Get(":wid/settings")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: WorkspaceSettings, headers: requestIdResponseHeaders })
  @ApiForbiddenResponse({
    description: "Workspace settings require OWNER or ADMIN.",
  })
  @ApiNotFoundResponse({
    description: "No active membership for this workspace.",
  })
  async settings(@Req() req: Request, @Param("wid") id: string) {
    return this.workspaces.settings(await this.actor(req), id);
  }

  @Patch(":wid")
  @Header("Cache-Control", "no-store")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiOkResponse({ type: WorkspaceSettings, headers: requestIdResponseHeaders })
  @ApiForbiddenResponse({
    description: "Invalid origin, CSRF proof or workspace permission.",
  })
  @ApiNotFoundResponse({
    description: "No active membership for this workspace.",
  })
  @ApiBadRequestResponse({
    description: "Provide at least one valid workspace setting.",
  })
  @ApiConflictResponse({
    description: "The normalized slug is already in use.",
  })
  async update(
    @Req() req: Request,
    @Param("wid") id: string,
    @Body() dto: UpdateWorkspaceDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.workspaces.update(
      await this.actor(req),
      id,
      dto,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Post(":wid/archive")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiNoContentResponse({ headers: requestIdResponseHeaders })
  @ApiForbiddenResponse({
    description: "Archival requires OWNER and a valid origin and CSRF proof.",
  })
  @ApiNotFoundResponse({
    description: "No active membership for this workspace.",
  })
  async archive(
    @Req() req: Request,
    @Param("wid") id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.workspaces.archive(
      await this.actor(req),
      id,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Get(":wid")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: WorkspaceSummary, headers: requestIdResponseHeaders })
  @ApiNotFoundResponse({
    description: "No active membership for this workspace.",
  })
  async detail(@Req() req: Request, @Param("wid") id: string) {
    return this.workspaces.detail(await this.actor(req), id);
  }
}
