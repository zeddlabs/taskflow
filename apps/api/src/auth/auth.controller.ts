import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApiCookieAuth,
  ApiHeader,
  ApiNoContentResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { problemResponse, requestIdResponseHeaders } from "../http/openapi";
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
  ApiServiceUnavailableResponse,
} from "@nestjs/swagger";
import { EmailVerificationService } from "./email-verification.service";
import {
  accessCookie,
  accessSeconds,
  AuthConfig,
  refreshCookie,
  refreshSeconds,
  refreshPath,
  logoutPath,
  logoutCookie,
  csrfHeader,
} from "./auth.config";
import {
  LoginDto,
  ProfileDto,
  RegisterDto,
  VerificationCodeDto,
} from "./auth.dto";
import { AuthService } from "./auth.service";
import { AuthWriteGuard } from "./auth-write.guard";
import { CsrfMode } from "./session-csrf.guard";

const sessionHeaders = {
  ...requestIdResponseHeaders,
  [csrfHeader]: {
    description: "Session-bound proof for unsafe requests",
    schema: { type: "string" },
  },
};

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
    private readonly verification: EmailVerificationService,
  ) {}

  @Post("register")
  @CsrfMode("pre-login")
  @UseGuards(AuthWriteGuard)
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: ProfileDto, headers: requestIdResponseHeaders })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  @CsrfMode("pre-login")
  @HttpCode(200)
  @UseGuards(AuthWriteGuard)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({
    type: ProfileDto,
    headers: sessionHeaders,
    description:
      "Sets the session cookies and returns the session's CSRF proof in a header.",
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const credentials = await this.auth.login(dto);
    this.setCredentials(res, credentials);
    return credentials.user;
  }

  private cookieOptions(path: string) {
    return {
      path,
      httpOnly: true,
      secure: this.config.secure,
      sameSite: "lax" as const,
    };
  }

  private setProof(res: Response, session: { id: string; expiresAt: Date }) {
    res.set(csrfHeader, this.auth.csrfToken(session.id));
    res.cookie(logoutCookie, session.id, {
      ...this.cookieOptions(logoutPath),
      maxAge: Math.max(0, session.expiresAt.getTime() - Date.now()),
    });
  }

  private setCredentials(
    res: Response,
    credentials: Awaited<ReturnType<AuthService["rotate"]>>,
  ) {
    const { accessToken, refreshToken, remaining, session } = credentials;
    res.cookie(accessCookie, accessToken, {
      ...this.cookieOptions("/"),
      maxAge: Math.min(remaining, accessSeconds * 1000),
    });
    res.cookie(refreshCookie, refreshToken, {
      ...this.cookieOptions(refreshPath),
      maxAge: Math.min(remaining, refreshSeconds * 1000),
    });
    this.setProof(res, session);
  }

  @Get("refresh/csrf")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth("refresh")
  @ApiNoContentResponse({ headers: sessionHeaders })
  async bootstrap(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.bootstrap(
      parse(req.headers.cookie ?? "")[refreshCookie],
    );
    this.setProof(res, session);
  }

  @Post("refresh")
  @CsrfMode("session-operation")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth("refresh")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiOkResponse({ headers: sessionHeaders })
  async rotate(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const credentials = await this.auth.rotate(
      parse(req.headers.cookie ?? "")[refreshCookie],
      req.get(csrfHeader),
    );
    this.setCredentials(res, credentials);
  }

  @Post("logout")
  @CsrfMode("session-operation")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth("logout")
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiNoContentResponse({ headers: requestIdResponseHeaders })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = parse(req.headers.cookie ?? "");
    if (!cookies[logoutCookie] && !cookies[accessCookie]) return;
    await this.auth.logout(
      cookies[logoutCookie],
      cookies[accessCookie],
      req.get(csrfHeader),
    );
    res.clearCookie(accessCookie, this.cookieOptions("/"));
    res.clearCookie(refreshCookie, this.cookieOptions(refreshPath));
    res.clearCookie(logoutCookie, this.cookieOptions(logoutPath));
  }

  @Post("email-verification/request")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiNoContentResponse({
    headers: requestIdResponseHeaders,
    description: "Mail accepted for delivery or address already verified.",
  })
  @ApiUnauthorizedResponse(problemResponse("Sign in to request a code."))
  @ApiForbiddenResponse(problemResponse("Invalid origin or CSRF proof."))
  @ApiTooManyRequestsResponse(
    problemResponse("Allow one minute between requests."),
  )
  @ApiServiceUnavailableResponse(problemResponse("Mail delivery unavailable."))
  async requestVerification(@Req() req: Request) {
    const session = await this.auth.activeSession(
      parse(req.headers.cookie ?? "")[accessCookie],
    );
    await this.verification.request(session.user.id);
  }

  @Post("email-verification/consume")
  @HttpCode(204)
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @ApiHeader({ name: csrfHeader, required: true })
  @ApiNoContentResponse({
    headers: requestIdResponseHeaders,
    description: "Email address verified.",
  })
  @ApiUnauthorizedResponse(problemResponse("Sign in to verify your email."))
  @ApiForbiddenResponse(problemResponse("Invalid origin or CSRF proof."))
  @ApiBadRequestResponse(problemResponse("Enter an eight-digit code."))
  @ApiConflictResponse(problemResponse("Invalid, expired or used code."))
  @ApiTooManyRequestsResponse(
    problemResponse("Attempt limit reached. Request a new code."),
  )
  async consumeVerification(
    @Req() req: Request,
    @Body() dto: VerificationCodeDto,
  ) {
    const session = await this.auth.activeSession(
      parse(req.headers.cookie ?? "")[accessCookie],
    );
    await this.verification.consume(session.user.id, dto.code);
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @ApiOkResponse({ type: ProfileDto, headers: requestIdResponseHeaders })
  me(@Req() req: Request) {
    return this.auth.me(parse(req.headers.cookie ?? "")[accessCookie]);
  }
}
