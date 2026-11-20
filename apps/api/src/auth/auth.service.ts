import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { verify as verifyPassword } from "@node-rs/argon2";
import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { DatabaseService } from "../database.service";
import { Prisma } from "../generated/prisma/client";
import {
  accessSeconds,
  AuthConfig,
  refreshSeconds,
  sessionSeconds,
} from "./auth.config";
import { LoginDto, ProfileDto, RegisterDto } from "./auth.dto";
import { hashPassword } from "./password";

const profileSelect = {
  id: true,
  name: true,
  emailNormalized: true,
  timezone: true,
  avatarUrl: true,
} as const;
function profile(
  user: Prisma.UserGetPayload<{ select: typeof profileSelect }>,
): ProfileDto {
  return {
    id: user.id,
    name: user.name,
    email: user.emailNormalized,
    timezone: user.timezone,
    avatarUrl: user.avatarUrl,
  };
}

@Injectable()
export class AuthService {
  private readonly dummyHash = hashPassword(randomBytes(32));

  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.db.user.create({
        data: { name: dto.name, emailNormalized: dto.email, passwordHash },
        select: profileSelect,
      });
      return profile(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException();
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({
      where: { emailNormalized: dto.email },
      select: { ...profileSelect, passwordHash: true },
    });
    const valid = await verifyPassword(
      user?.passwordHash ?? (await this.dummyHash),
      dto.password,
    );
    if (!valid || !user) throw new UnauthorizedException();
    const now = Date.now();
    const refreshToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const accessToken = await this.db.$transaction(async (tx) => {
      const session = await tx.authSession.create({
        data: {
          userId: user.id,
          expiresAt: new Date(now + sessionSeconds * 1000),
          tokens: {
            create: {
              tokenHash,
              expiresAt: new Date(now + refreshSeconds * 1000),
            },
          },
        },
        select: { id: true },
      });
      return jwt.sign({ sid: session.id }, this.config.secret, {
        algorithm: "HS256",
        subject: user.id,
        issuer: this.config.issuer,
        audience: this.config.audience,
        expiresIn: accessSeconds,
      });
    });
    return { accessToken, refreshToken, user: profile(user) };
  }

  async me(accessToken: string | undefined) {
    if (!accessToken) throw new UnauthorizedException();
    let claims: string | jwt.JwtPayload;
    try {
      claims = jwt.verify(accessToken, this.config.secret, {
        algorithms: ["HS256"],
        issuer: this.config.issuer,
        audience: this.config.audience,
        maxAge: accessSeconds,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (
      typeof claims === "string" ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      typeof claims.sid !== "string" ||
      !claims.sid ||
      !Number.isSafeInteger(claims.exp) ||
      !Number.isSafeInteger(claims.iat) ||
      claims.iat! > Math.floor(Date.now() / 1000) ||
      claims.exp! <= claims.iat! ||
      claims.exp! - claims.iat! > accessSeconds
    )
      throw new UnauthorizedException();
    const session = await this.db.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { user: { select: profileSelect } },
    });
    if (!session) throw new UnauthorizedException();
    return profile(session.user);
  }
}
