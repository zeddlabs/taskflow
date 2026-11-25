import {
  applyDecorators,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
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
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { AuthService } from "../auth/auth.service";
import { AuthWriteGuard } from "../auth/auth-write.guard";
import { accessCookie, csrfHeader } from "../auth/auth.config";
import { problemResponse, requestIdResponseHeaders } from "../http/openapi";
import { requestIdHeader } from "../http/request-log";
import {
  AcceptInvitationDto,
  AcceptedInvitation,
  CreateInvitationDto,
  InvitationPage,
  InvitationSummary,
} from "./invitations.dto";
import { InvitationsService } from "./invitations.service";
import { WorkspaceListQuery } from "./workspaces.dto";

function InvitationWrite() {
  return applyDecorators(
    Header("Cache-Control", "no-store"),
    UseGuards(AuthWriteGuard),
    ApiHeader({ name: csrfHeader, required: true }),
    ApiTooManyRequestsResponse(problemResponse("Request rate limit reached.")),
  );
}
const unavailable = problemResponse("Workspace or invitation unavailable.");
const smtpUnavailable = problemResponse(
  "Delivery could not be confirmed. List the pending invitation and resend.",
);
@ApiTags("Workspace invitations")
@ApiCookieAuth()
@ApiUnauthorizedResponse(problemResponse("A current session is required."))
@ApiForbiddenResponse(
  problemResponse(
    "Insufficient permission, mismatched verified email or invalid session proof.",
  ),
)
@Controller()
export class InvitationsController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitations: InvitationsService,
  ) {}
  private async actor(req: Request) {
    return (
      await this.auth.activeSession(
        parse(req.headers.cookie ?? "")[accessCookie],
      )
    ).user.id;
  }

  @Get("workspaces/:wid/invitations")
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({ type: InvitationPage, headers: requestIdResponseHeaders })
  @ApiNotFoundResponse(unavailable)
  @ApiBadRequestResponse(problemResponse("Invalid page parameters."))
  async list(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Query() query: WorkspaceListQuery,
  ) {
    return this.invitations.list(await this.actor(req), wid, query);
  }

  @Post("workspaces/:wid/invitations")
  @InvitationWrite()
  @ApiCreatedResponse({
    type: InvitationSummary,
    headers: requestIdResponseHeaders,
  })
  @ApiBadRequestResponse(problemResponse("Invalid recipient or role."))
  @ApiConflictResponse(
    problemResponse(
      "A pending invitation or workspace membership already exists.",
    ),
  )
  @ApiNotFoundResponse(unavailable)
  @ApiServiceUnavailableResponse(smtpUnavailable)
  async create(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Body() dto: CreateInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.invitations.create(
      await this.actor(req),
      wid,
      dto,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Post("workspaces/:wid/invitations/:iid/resend")
  @HttpCode(200)
  @InvitationWrite()
  @ApiOkResponse({ type: InvitationSummary, headers: requestIdResponseHeaders })
  @ApiNotFoundResponse(unavailable)
  @ApiConflictResponse(problemResponse("Invitation is no longer pending."))
  @ApiServiceUnavailableResponse(smtpUnavailable)
  async resend(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Param("iid") iid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.invitations.resend(
      await this.actor(req),
      wid,
      iid,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Delete("workspaces/:wid/invitations/:iid")
  @HttpCode(204)
  @InvitationWrite()
  @ApiNoContentResponse({ headers: requestIdResponseHeaders })
  @ApiNotFoundResponse(unavailable)
  @ApiConflictResponse(problemResponse("Invitation is no longer pending."))
  async revoke(
    @Req() req: Request,
    @Param("wid") wid: string,
    @Param("iid") iid: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.invitations.revoke(
      await this.actor(req),
      wid,
      iid,
      String(res.getHeader(requestIdHeader)),
    );
  }

  @Post("invitations/accept")
  @HttpCode(200)
  @InvitationWrite()
  @ApiOkResponse({
    type: AcceptedInvitation,
    headers: requestIdResponseHeaders,
  })
  @ApiBadRequestResponse(problemResponse("Invalid token format."))
  @ApiConflictResponse(
    problemResponse("Invitation is invalid, expired, revoked or used."),
  )
  async accept(
    @Req() req: Request,
    @Body() dto: AcceptInvitationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.invitations.accept(
      await this.actor(req),
      dto.token,
      String(res.getHeader(requestIdHeader)),
    );
  }
}
