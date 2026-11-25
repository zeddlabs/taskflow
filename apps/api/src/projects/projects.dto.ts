import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from "class-validator";
import {
  ProjectVisibility,
  TaskStatusCategory,
} from "../generated/prisma/enums";
import { WorkspacePageInfo } from "../workspaces/workspaces.dto";

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

  @ApiPropertyOptional({ format: "date", example: "2027-01-01" })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  startDate?: string;

  @ApiPropertyOptional({ format: "date", example: "2027-01-31" })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  dueDate?: string;
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
