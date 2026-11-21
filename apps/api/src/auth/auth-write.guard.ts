import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { RateLimiterMemory, RateLimiterRes } from "rate-limiter-flexible";
import { normalizeEmail } from "./auth.dto";

@Injectable()
export class AuthWriteGuard implements CanActivate {
  private readonly byIp = new RateLimiterMemory({ points: 60, duration: 60 });
  private readonly byEmail = new RateLimiterMemory({
    points: 10,
    duration: 60,
  });

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    try {
      await this.byIp.consume(req.ip ?? req.socket.remoteAddress ?? "unknown");
      const email = req.body?.email;
      if (typeof email === "string") {
        const key = createHash("sha256")
          .update(normalizeEmail(email))
          .digest("hex");
        await this.byEmail.consume(key);
      }
    } catch (error) {
      if (!(error instanceof RateLimiterRes)) throw error;
      http
        .getResponse<Response>()
        .setHeader(
          "Retry-After",
          Math.max(1, Math.ceil(error.msBeforeNext / 1000)),
        );
      throw new HttpException("Too Many Requests", 429);
    }
    return true;
  }
}
