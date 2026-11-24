import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsString, Length } from "class-validator";
import { WorkspaceRole } from "../generated/prisma/enums";
import { WorkspacePageInfo } from "./workspaces.dto";

export class ChangeMemberRoleDto {
  @ApiProperty({
    enum: WorkspaceRole,
    description: "OWNER can only be assigned through transfer-ownership.",
  })
  @IsEnum(WorkspaceRole)
  role!: WorkspaceRole;
}

export class TransferOwnershipDto {
  @ApiProperty({ description: "User ID of an existing admin or member." })
  @IsString()
  @Length(1, 100)
  newOwnerUserId!: string;
}

export class MemberProfile {
  @ApiProperty() userId!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) avatarUrl!: string | null;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
}

export class MemberPage {
  @ApiProperty({ type: [MemberProfile] }) data!: MemberProfile[];
  @ApiProperty({ type: WorkspacePageInfo }) pageInfo!: WorkspacePageInfo;
}
