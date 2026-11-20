import { Injectable } from "@nestjs/common";

export const accessCookie = "access_token";
export const refreshCookie = "refresh_token";
export const logoutCookie = "logout_session";
export const refreshPath = "/api/v1/auth/refresh";
export const logoutPath = "/api/v1/auth/logout";
export const csrfHeader = "X-CSRF-Token";
export const accessSeconds = 10 * 60;
export const refreshSeconds = 7 * 24 * 60 * 60;
export const sessionSeconds = 30 * 24 * 60 * 60;

@Injectable()
export class AuthConfig {
  readonly secret: string;
  readonly csrfSecret: string;
  readonly origin: string;
  readonly issuer = process.env.JWT_ISSUER || "taskflow-api";
  readonly audience = process.env.JWT_AUDIENCE || "taskflow-web";
  readonly secure =
    process.env.NODE_ENV === "production" ||
    process.env.COOKIE_SECURE === "true";

  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || Buffer.byteLength(secret) < 32)
      throw new Error("Set JWT_ACCESS_SECRET to at least 32 random bytes.");
    this.secret = secret;
    const csrfSecret = process.env.CSRF_SECRET;
    if (
      !csrfSecret ||
      Buffer.byteLength(csrfSecret) < 32 ||
      csrfSecret === secret
    )
      throw new Error(
        "Set CSRF_SECRET to an independent secret of at least 32 random bytes.",
      );
    this.csrfSecret = csrfSecret;
    const origin = URL.parse(process.env.WEB_ORIGIN ?? "");
    if (
      !origin ||
      !["https:", "http:"].includes(origin.protocol) ||
      origin.origin !== process.env.WEB_ORIGIN ||
      (process.env.NODE_ENV === "production" && origin.protocol !== "https:")
    ) {
      throw new Error(
        "Set WEB_ORIGIN to the web application's exact origin. Production requires HTTPS.",
      );
    }
    this.origin = origin.origin;
  }
}
