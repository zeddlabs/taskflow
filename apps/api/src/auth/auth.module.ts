import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { SessionCsrfGuard } from "./session-csrf.guard";
import { DatabaseService } from "../database.service";
import { AuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthWriteGuard } from "./auth-write.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthConfig,
    DatabaseService,
    AuthService,
    AuthWriteGuard,
    { provide: APP_GUARD, useClass: SessionCsrfGuard },
  ],
})
export class AuthModule {}
