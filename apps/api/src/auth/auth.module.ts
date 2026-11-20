import { Module } from "@nestjs/common";
import { DatabaseService } from "../database.service";
import { AuthConfig } from "./auth.config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthWriteGuard } from "./auth-write.guard";

@Module({
  controllers: [AuthController],
  providers: [AuthConfig, DatabaseService, AuthService, AuthWriteGuard],
})
export class AuthModule {}
