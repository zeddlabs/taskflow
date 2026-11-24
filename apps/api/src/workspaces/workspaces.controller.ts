import { Controller, Get, Header, Param, Query, Req } from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiTags,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request } from "express";
import { AuthService } from "../auth/auth.service";
import { accessCookie } from "../auth/auth.config";
import { requestIdResponseHeaders } from "../http/openapi";
import { WorkspacesService } from "./workspaces.service";
import {
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
