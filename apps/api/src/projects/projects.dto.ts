import {
  ApiProperty,
  ApiPropertyOptional,
  PartialType,
  PickType,
} from "@nestjs/swagger";
import { applyDecorators } from "@nestjs/common";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import {
  ProjectRole,
  ProjectVisibility,
  TaskStatusCategory,
} from "../generated/prisma/enums";
import { WorkspacePageInfo } from "../workspaces/workspaces.dto";

function ProjectDate(nullable = false) {
  return applyDecorators(
    ApiPropertyOptional({ type: String, format: "date", nullable }),
    nullable
      ? IsOptional()
      : ValidateIf((_object, value) => value !== undefined),
    Matches(/^\d{4}-\d{2}-\d{2}$/),
    IsDateString({ strict: true }),
  );
}

export class CreateProjectDto {
  @ApiProperty({ pattern: "^[A-Z0-9]{2,12}$", example: "ENG" })
  @IsString()
  @Matches(/^[A-Z0-9]{2,12}$/)
  key!: string;

  @ApiProperty({ minLength: 1, maxLength: 150 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiPropertyOptional({ maxLength: 10000 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: ProjectVisibility, default: "WORKSPACE" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsEnum(ProjectVisibility)
  visibility?: ProjectVisibility;

  @ProjectDate()
  startDate?: string;

  @ProjectDate()
  dueDate?: string;
}

export class UpdateProjectDto extends PartialType(
  PickType(CreateProjectDto, ["name", "visibility"] as const),
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({ type: String, maxLength: 10000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null;

  @ProjectDate(true) startDate?: string | null;
  @ProjectDate(true) dueDate?: string | null;
}

export class ProjectRoleDto {
  @ApiProperty({ enum: ProjectRole }) @IsEnum(ProjectRole) role!: ProjectRole;
}

export class AddProjectMemberDto extends ProjectRoleDto {
  @ApiProperty() @IsString() @Length(1, 100) userId!: string;
}

export class ProjectMemberProfile {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: ProjectRole }) role!: ProjectRole;
}

export class ProjectMembersPage {
  @ApiProperty({ type: [ProjectMemberProfile] }) data!: ProjectMemberProfile[];
  @ApiProperty({ type: WorkspacePageInfo }) pageInfo!: WorkspacePageInfo;
}

export class ProjectSummary {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) description!: string | null;
  @ApiProperty({ enum: ProjectVisibility }) visibility!: ProjectVisibility;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  startDate!: Date | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  dueDate!: Date | null;
  @ApiProperty({ type: String, format: "date-time", nullable: true })
  archivedAt!: Date | null;
}

export class ProjectPage {
  @ApiProperty({ type: [ProjectSummary] }) data!: ProjectSummary[];
  @ApiProperty({ type: WorkspacePageInfo }) pageInfo!: WorkspacePageInfo;
}

export class ProjectStatusSummary {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: TaskStatusCategory }) category!: TaskStatusCategory;
  @ApiProperty() sortOrder!: number;
  @ApiProperty({ type: String, nullable: true }) color!: string | null;
}
