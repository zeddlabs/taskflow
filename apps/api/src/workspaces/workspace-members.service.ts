import { Injectable, NotFoundException } from "@nestjs/common";
import { AuthConfig } from "../auth/auth.config";
import { DatabaseService } from "../database.service";
import type { Prisma } from "../generated/prisma/client";
import type { WorkspaceRole } from "../generated/prisma/enums";
import { directoryAfter, directoryCursor } from "./directory-cursor";
import {
  authorizeWorkspaceWrite,
  requireMemberTarget,
  requireAssignableRole,
  requireWorkspacePermission,
} from "./workspace-policy";
import { MemberPage, MemberProfile } from "./workspace-members.dto";
import { WorkspaceListQuery } from "./workspaces.dto";

const profileSelect = {
  userId: true,
  role: true,
  user: { select: { name: true, avatarUrl: true } },
} as const;
type Member = Prisma.WorkspaceMemberGetPayload<{
  select: typeof profileSelect;
}>;

function profile(member: Member): MemberProfile {
  return { userId: member.userId, role: member.role, ...member.user };
}

@Injectable()
export class WorkspaceMembersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly config: AuthConfig,
  ) {}

  async list(
    actorId: string,
    workspaceId: string,
    query: WorkspaceListQuery,
  ): Promise<MemberPage> {
    const scope = ["member-list-v1", actorId, workspaceId];
    // Permissions and returned profiles must describe the same database snapshot.
    return this.db.$transaction(
      async (tx) => {
        const actor = await tx.workspaceMember.findFirst({
          where: {
            workspaceId,
            userId: actorId,
            workspace: { archivedAt: null },
          },
          select: { role: true },
        });
        if (!actor) throw new NotFoundException();
        requireWorkspacePermission(actor.role, "listMembers");
        const after =
          query.cursor === undefined
            ? undefined
            : directoryAfter(this.config.secret, scope, query.cursor);
        const members = await tx.workspaceMember.findMany({
          where: { workspaceId, userId: { gt: after } },
          orderBy: { userId: "asc" },
          take: query.limit + 1,
          select: profileSelect,
        });
        const hasNextPage = members.length > query.limit;
        const data = members.slice(0, query.limit).map(profile);
        return {
          data,
          pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage
              ? directoryCursor(
                  this.config.secret,
                  scope,
                  data[data.length - 1].userId,
                )
              : null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  private mutate<T>(
    actorId: string,
    workspaceId: string,
    targetUserId: string,
    action: "manageMembers" | "transferOwnership",
    write: (tx: Prisma.TransactionClient, target: Member) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      await authorizeWorkspaceWrite(tx, actorId, workspaceId, action);
      const target = await tx.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        select: profileSelect,
      });
      if (!target) throw new NotFoundException();
      requireMemberTarget(action, target.role);
      return write(tx, target);
    });
  }

  async changeRole(
    actorId: string,
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      workspaceId,
      userId,
      "manageMembers",
      async (tx, target) => {
        requireAssignableRole(role);
        if (target.role === role) return profile(target);
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId } },
          data: { role },
        });
        await this.audit(
          tx,
          workspaceId,
          actorId,
          userId,
          requestId,
          "MEMBER_ROLE_CHANGED",
          { fromRole: target.role, toRole: role },
        );
        return profile({ ...target, role });
      },
    );
  }

  async remove(
    actorId: string,
    workspaceId: string,
    userId: string,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      workspaceId,
      userId,
      "manageMembers",
      async (tx, target) => {
        await tx.workspaceMember.delete({
          where: { workspaceId_userId: { workspaceId, userId } },
        });
        await this.audit(
          tx,
          workspaceId,
          actorId,
          userId,
          requestId,
          "MEMBER_REMOVED",
          { fromRole: target.role },
        );
      },
    );
  }

  async transfer(
    actorId: string,
    workspaceId: string,
    userId: string,
    requestId: string,
  ) {
    return this.mutate(
      actorId,
      workspaceId,
      userId,
      "transferOwnership",
      async (tx, target) => {
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId: actorId } },
          data: { role: "ADMIN" },
        });
        await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId } },
          data: { role: "OWNER" },
        });
        await this.audit(
          tx,
          workspaceId,
          actorId,
          userId,
          requestId,
          "OWNERSHIP_TRANSFERRED",
          { fromRole: target.role, toRole: "OWNER" },
        );
        return profile({ ...target, role: "OWNER" });
      },
    );
  }

  private audit(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    actorId: string,
    userId: string,
    requestId: string,
    action: "MEMBER_ROLE_CHANGED" | "MEMBER_REMOVED" | "OWNERSHIP_TRANSFERRED",
    details: { fromRole: WorkspaceRole; toRole?: WorkspaceRole },
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        targetType: "User",
        targetId: userId,
        requestId,
        action,
        details,
      },
    });
  }
}
