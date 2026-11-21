import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { parse } from "cookie";
import type { Request } from "express";
import { AuthConfig, accessCookie, csrfHeader } from "./auth.config";
import { AuthService } from "./auth.service";

// Credential endpoints either establish a session or check their own session proof.
export const CsrfMode = Reflector.createDecorator<
  "pre-login" | "session-operation"
>();

@Injectable()
export class SessionCsrfGuard implements CanActivate {
  constructor(
    private readonly config: AuthConfig,
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
    if (req.headers.origin !== undefined) {
      if (req.headers.origin !== this.config.origin)
        throw new ForbiddenException();
    } else {
      const referer = URL.parse(req.headers.referer ?? "");
      if (
        !referer ||
        !["http:", "https:"].includes(referer.protocol) ||
        referer.origin !== this.config.origin
      )
        throw new ForbiddenException();
    }
    if (this.reflector.get(CsrfMode, context.getHandler())) return true;
    const session = await this.auth.activeSession(
      parse(req.headers.cookie ?? "")[accessCookie],
    );
    this.auth.assertCsrf(session.id, req.get(csrfHeader));
    return true;
  }
}
