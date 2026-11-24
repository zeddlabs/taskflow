import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
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
    { provide: APP_GUARD, useClass: SessionCsrfGuard },
  ],
})
export class AuthModule {}
