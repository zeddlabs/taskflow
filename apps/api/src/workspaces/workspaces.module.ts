import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database.module";
import { WorkspacesController } from "./workspaces.controller";
import { WorkspacesService } from "./workspaces.service";

import { WorkspaceMembersService } from "./workspace-members.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspaceMembersService],
})
export class WorkspacesModule {}
