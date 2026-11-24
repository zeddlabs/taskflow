import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
  Length,
  Matches,
  IsBoolean,
  IsTimeZone,
  ValidateIf,
} from "class-validator";
import { WorkspaceRole } from "../generated/prisma/enums";

export class WorkspaceListQuery {
  @ApiPropertyOptional({ type: Number, default: 25, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;

  @ApiPropertyOptional({ enum: ["id_asc"] })
  @IsOptional()
  @IsIn(["id_asc"])
  sort?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;
}

export class WorkspaceSummary {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty({ enum: WorkspaceRole }) myRole!: WorkspaceRole;
}

export class CreateWorkspaceDto {
  @ApiProperty({ minLength: 1, maxLength: 150 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @Length(1, 150)
  name!: string;

  @ApiProperty({ maxLength: 80, example: "acme-engineering" })
  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug!: string;
}

export class CreatedWorkspace extends WorkspaceSummary {
  @ApiProperty({ type: String, format: "date-time" }) createdAt!: Date;
}

export class UpdateWorkspaceDto extends PartialType(CreateWorkspaceDto, {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional({ example: "Asia/Jakarta" })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  allowMemberCreateProjects?: boolean;
}

export class WorkspaceSettings extends WorkspaceSummary {
  @ApiProperty() timezone!: string;
  @ApiProperty() allowMemberCreateProjects!: boolean;
}
export class WorkspacePageInfo {
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasNextPage!: boolean;
}
export class WorkspacePage {
  @ApiProperty({ type: [WorkspaceSummary] }) data!: WorkspaceSummary[];
  @ApiProperty({ type: WorkspacePageInfo }) pageInfo!: WorkspacePageInfo;
}
