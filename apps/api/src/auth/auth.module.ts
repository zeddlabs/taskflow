import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SmtpMailer } from "./smtp-mailer";
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
  exports: [AuthService, AuthConfig, SmtpMailer],
  controllers: [AuthController],
  providers: [
    AuthConfig,
    AuthService,
    AuthWriteGuard,
    VerificationMailer,
    SmtpMailer,
    EmailVerificationService,
    { provide: APP_GUARD, useClass: SessionCsrfGuard },
  ],
})
export class AuthModule {}
