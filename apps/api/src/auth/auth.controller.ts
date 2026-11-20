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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { parse } from "cookie";
import type { Request, Response } from "express";
import { requestIdResponseHeaders } from "../http/openapi";
import {
  accessCookie,
  accessSeconds,
  AuthConfig,
  refreshCookie,
  refreshSeconds,
} from "./auth.config";
import { LoginDto, ProfileDto, RegisterDto } from "./auth.dto";
import { AuthService } from "./auth.service";
import { AuthWriteGuard } from "./auth-write.guard";

@ApiTags("Authentication")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AuthConfig,
  ) {}

  @Post("register")
  @UseGuards(AuthWriteGuard)
  @Header("Cache-Control", "no-store")
  @ApiCreatedResponse({ type: ProfileDto, headers: requestIdResponseHeaders })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post("login")
  @HttpCode(200)
  @UseGuards(AuthWriteGuard)
  @Header("Cache-Control", "no-store")
  @ApiOkResponse({
    type: ProfileDto,
    headers: requestIdResponseHeaders,
    description: "Sets the access and refresh HttpOnly cookies.",
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.auth.login(dto);
    const options = {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: "lax" as const,
    };
    res.cookie(accessCookie, accessToken, {
      ...options,
      path: "/",
      maxAge: accessSeconds * 1000,
    });
    res.cookie(refreshCookie, refreshToken, {
      ...options,
      path: "/api/v1/auth/refresh",
      maxAge: refreshSeconds * 1000,
    });
    return user;
  }

  @Get("me")
  @Header("Cache-Control", "no-store")
  @ApiCookieAuth()
  @ApiOkResponse({ type: ProfileDto, headers: requestIdResponseHeaders })
  me(@Req() req: Request) {
    return this.auth.me(parse(req.headers.cookie ?? "")[accessCookie]);
  }
}
