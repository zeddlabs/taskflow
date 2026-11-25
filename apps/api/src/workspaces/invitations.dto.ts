import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsString, Matches } from "class-validator";
import { EmailDto } from "../auth/auth.dto";
import { InvitationStatus, WorkspaceRole } from "../generated/prisma/enums";
import { WorkspacePageInfo } from "./workspaces.dto";

export class CreateInvitationDto extends EmailDto {
  @ApiPropertyOptional({
    enum: WorkspaceRole,
    default: "MEMBER",
    description: "OWNER is reserved for ownership transfer.",
  })
  @IsEnum(WorkspaceRole)
  role: WorkspaceRole = "MEMBER";
}

export class AcceptInvitationDto {
  @ApiProperty({ writeOnly: true, pattern: "^[A-Za-z0-9_-]{43}$" })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{43}$/)
  token!: string;
}

export class InvitationSummary {
  @ApiProperty() id!: string;
  @ApiProperty() workspaceId!: string;
  @ApiProperty({ format: "email" }) email!: string;
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
  @ApiProperty({ enum: InvitationStatus }) status!: InvitationStatus;
  @ApiProperty() invitedById!: string;
  @ApiProperty({ format: "date-time" }) expiresAt!: Date;
  @ApiProperty({ format: "date-time" }) createdAt!: Date;
}

export class InvitationPage {
  @ApiProperty({ type: [InvitationSummary] }) data!: InvitationSummary[];
  @ApiProperty({ type: WorkspacePageInfo }) pageInfo!: WorkspacePageInfo;
}

class JoinedWorkspace {
  @ApiProperty() id!: string;
  @ApiProperty() slug!: string;
}
class JoinedMembership {
  @ApiProperty({ enum: WorkspaceRole }) role!: WorkspaceRole;
}
export class AcceptedInvitation {
  @ApiProperty({ type: JoinedWorkspace }) workspace!: JoinedWorkspace;
  @ApiProperty({ type: JoinedMembership }) membership!: JoinedMembership;
}
