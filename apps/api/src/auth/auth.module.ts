import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EmailVerificationService } from "./email-verification.service";
import { VerificationMailer } from "./verification-mailer";
import { SessionCsrfGuard } from "./session-csrf.guard";
import { DatabaseModule } from "../database.module";
import { AuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthWriteGuard } from "./auth-write.guard";

@Module({
  imports: [DatabaseModule],
  exports: [AuthService, AuthConfig],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    AuthService,
    AuthWriteGuard,
    VerificationMailer,
    EmailVerificationService,
    { provide: APP_GUARD, useClass: SessionCsrfGuard },
  ],
})
export class AuthModule {}
