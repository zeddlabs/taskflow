import {
  ConflictException,
  HttpException,
  Injectable,
  Inject,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { DatabaseService } from "../database.service";
import type { Prisma } from "../generated/prisma/client";
import { AuthConfig } from "./auth.config";
import { VerificationMailer } from "./verification-mailer";

@Injectable()
export class EmailVerificationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
    @Inject(VerificationMailer)
    private readonly mail: Pick<VerificationMailer, "send">,
  ) {}

  private hash(userId: string, email: string, code: string) {
    return createHmac("sha256", this.config.secret)
      .update(JSON.stringify(["email-verification-v1", userId, email, code]))
      .digest("hex");
  }

  private async lockAccount(tx: Prisma.TransactionClient, userId: string) {
    const [account] = await tx.$queryRaw<
      { emailNormalized: string; emailVerifiedAt: Date | null }[]
    >`
      SELECT "emailNormalized", "emailVerifiedAt" FROM users WHERE id = ${userId} FOR UPDATE`;
    if (!account) throw new UnauthorizedException();
    return account;
  }

  async request(userId: string) {
    const delivery = await this.db.$transaction(async (tx) => {
      const user = await this.lockAccount(tx, userId);
      if (user.emailVerifiedAt) return;
      const previous = await tx.emailVerificationChallenge.findUnique({
        where: { userId },
      });
      const now = Date.now();
      if (previous && now - previous.issuedAt.getTime() < 60_000)
        throw new HttpException("Too many requests", 429);
      let code: string;
      let tokenHash: string;
      do {
        code = randomInt(100_000_000).toString().padStart(8, "0");
        tokenHash = this.hash(userId, user.emailNormalized, code);
      } while (tokenHash === previous?.tokenHash);
      const data = {
        emailNormalized: user.emailNormalized,
        tokenHash,
        issuedAt: new Date(now),
        expiresAt: new Date(now + 900_000),
        attempts: 0,
      };
      await tx.emailVerificationChallenge.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      return { email: user.emailNormalized, code, tokenHash };
    });
    if (!delivery) return;
    try {
      await this.mail.send(delivery.email, delivery.code);
    } catch {
      // Invalidate only this delivery. Preserve the resend limit even on provider failure.
      await this.db.emailVerificationChallenge.updateMany({
        where: { userId, tokenHash: delivery.tokenHash },
        data: { expiresAt: new Date() },
      });
      throw new ServiceUnavailableException();
    }
  }

  async consume(userId: string, code: string) {
    const outcome = await this.db.$transaction(async (tx) => {
      const user = await this.lockAccount(tx, userId);
      const row = await tx.emailVerificationChallenge.findUnique({
        where: { userId },
      });
      if (
        user.emailVerifiedAt ||
        !row ||
        row.emailNormalized !== user.emailNormalized ||
        row.expiresAt.getTime() <= Date.now()
      )
        return "invalid";
      if (row.attempts >= 5) return "limited";
      if (
        !timingSafeEqual(
          Buffer.from(row.tokenHash),
          Buffer.from(this.hash(userId, user.emailNormalized, code)),
        )
      ) {
        await tx.emailVerificationChallenge.update({
          where: { userId },
          data: { attempts: { increment: 1 } },
        });
        return row.attempts === 4 ? "limited" : "invalid";
      }
      await tx.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
      await tx.emailVerificationChallenge.delete({ where: { userId } });
      return "verified";
    });
    if (outcome === "limited")
      throw new HttpException("Too many attempts", 429);
    if (outcome !== "verified") throw new ConflictException();
  }
}
