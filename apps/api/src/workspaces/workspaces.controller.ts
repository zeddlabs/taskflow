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
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiCreatedResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
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
