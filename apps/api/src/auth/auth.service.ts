import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { verify as verifyPassword } from "@node-rs/argon2";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
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

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

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
    const session = await this.db.authSession.create({
      data: {
        userId: user.id,
        expiresAt: new Date(now + sessionSeconds * 1000),
        tokens: {
          create: {
            tokenHash: digest(refreshToken),
            expiresAt: new Date(now + refreshSeconds * 1000),
          },
        },
      },
      select: { id: true, expiresAt: true, userId: true },
    });
    return { ...this.credentials(session, refreshToken), user: profile(user) };
  }

  private credentials(
    session: { id: string; userId: string; expiresAt: Date },
    refreshToken: string,
  ) {
    const remaining = Math.max(0, session.expiresAt.getTime() - Date.now());
    const accessToken = jwt.sign({ sid: session.id }, this.config.secret, {
      algorithm: "HS256",
      subject: session.userId,
      issuer: this.config.issuer,
      audience: this.config.audience,
      expiresIn: Math.min(accessSeconds, Math.floor(remaining / 1000)),
    });
    return { session, remaining, accessToken, refreshToken };
  }

  csrfToken(sessionId: string) {
    return createHmac("sha256", this.config.csrfSecret)
      .update(sessionId)
      .digest("base64url");
  }

  assertCsrf(sessionId: string, proof?: string) {
    const expected = Buffer.from(this.csrfToken(sessionId));
    const supplied = Buffer.from(proof ?? "");
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(expected, supplied)
    )
      throw new ForbiddenException();
  }

  async bootstrap(refreshToken?: string) {
    if (!refreshToken) throw new UnauthorizedException();
    const now = new Date();
    const token = await this.db.refreshToken.findFirst({
      where: {
        tokenHash: digest(refreshToken),
        usedAt: null,
        expiresAt: { gt: now },
        session: { revokedAt: null, expiresAt: { gt: now } },
      },
      select: { session: { select: { id: true, expiresAt: true } } },
    });
    if (!token) throw new UnauthorizedException();
    return token.session;
  }

  async rotate(refreshToken?: string, proof?: string) {
    if (!refreshToken) throw new UnauthorizedException();
    const tokenHash = digest(refreshToken);
    const result = await this.db.$transaction(
      async (tx) => {
        const known = await tx.refreshToken.findUnique({
          where: { tokenHash },
          select: { sessionId: true },
        });
        if (!known) return null;
        this.assertCsrf(known.sessionId, proof);
        // Serialize every generation of the family before reading consumption state.
        const [session] = await tx.$queryRaw<
          {
            id: string;
            userId: string;
            revokedAt: Date | null;
            expiresAt: Date;
          }[]
        >`SELECT id, "userId", "revokedAt", "expiresAt" FROM auth_sessions WHERE id = ${known.sessionId} FOR UPDATE`;
        const now = new Date();
        if (!session || session.revokedAt || session.expiresAt <= now)
          return null;
        const token = await tx.refreshToken.findUniqueOrThrow({
          where: { tokenHash },
        });
        if (token.usedAt) {
          await tx.authSession.update({
            where: { id: session.id },
            data: { revokedAt: now },
          });
          return null; // Commit family revocation before reporting the failure.
        }
        if (token.expiresAt <= now) return null;
        const successor = randomBytes(32).toString("base64url");
        const expiresAt = new Date(
          Math.min(
            session.expiresAt.getTime(),
            now.getTime() + refreshSeconds * 1000,
          ),
        );
        await tx.refreshToken.update({
          where: { id: token.id },
          data: { usedAt: now },
        });
        await tx.refreshToken.create({
          data: {
            sessionId: session.id,
            tokenHash: digest(successor),
            expiresAt,
          },
        });
        await tx.authSession.update({
          where: { id: session.id },
          data: { lastSeenAt: now },
        });
        return this.credentials(session, successor);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
    if (!result) throw new UnauthorizedException();
    return result;
  }

  async logout(
    sessionId: string | undefined,
    access: string | undefined,
    proof?: string,
  ) {
    const sid = sessionId ?? this.accessClaims(access).sid;
    this.assertCsrf(sid, proof);
    await this.db.authSession.updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private accessClaims(accessToken: string | undefined) {
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
    return { sid: claims.sid as string, sub: claims.sub };
  }

  async activeSession(accessToken: string | undefined) {
    const claims = this.accessClaims(accessToken);
    const session = await this.db.authSession.findFirst({
      where: {
        id: claims.sid,
        userId: claims.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, user: { select: profileSelect } },
    });
    if (!session) throw new UnauthorizedException();
    return session;
  }

  async me(accessToken: string | undefined) {
    return profile((await this.activeSession(accessToken)).user);
  }
}
