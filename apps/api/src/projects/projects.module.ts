import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DatabaseModule } from "../database.module";
import { ProjectsController } from "./projects.controller";
import { ProjectsService } from "./projects.service";
import { ProjectManagementService } from "./project-management.service";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectManagementService],
})
export class ProjectsModule {}
