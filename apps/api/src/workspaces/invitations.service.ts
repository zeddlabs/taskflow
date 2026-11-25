import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AuthConfig } from "../auth/auth.config";
import { SmtpMailer } from "../auth/smtp-mailer";
import { DatabaseService } from "../database.service";
import type { Prisma } from "../generated/prisma/client";
import {
  authorizeWorkspaceWrite,
  requireAssignableRole,
  requireWorkspacePermission,
} from "./workspace-policy";
import { directoryAfter, directoryCursor } from "./directory-cursor";
import {
  CreateInvitationDto,
  AcceptedInvitation,
  InvitationSummary,
  InvitationPage,
} from "./invitations.dto";
import { WorkspaceListQuery } from "./workspaces.dto";

const invitationSelect = {
  id: true,
  workspaceId: true,
  emailNormalized: true,
  role: true,
  status: true,
  invitedById: true,
  expiresAt: true,
  createdAt: true,
} as const;
type Invitation = Prisma.WorkspaceInvitationGetPayload<{
  select: typeof invitationSelect;
}>;
function summary({
  emailNormalized,
  ...metadata
}: Invitation): InvitationSummary {
  return { ...metadata, email: emailNormalized };
}
function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

@Injectable()
export class InvitationsService {
  private readonly ttlHours = Number(process.env.INVITATION_TTL_HOURS ?? 168);
  constructor(
    private readonly db: DatabaseService,
    private readonly mail: SmtpMailer,
    private readonly config: AuthConfig,
  ) {
    if (
      !Number.isInteger(this.ttlHours) ||
      this.ttlHours < 1 ||
      this.ttlHours > 720
    )
      throw new Error("Set INVITATION_TTL_HOURS to an integer from 1 to 720.");
  }

  async list(
    actorId: string,
    workspaceId: string,
    query: WorkspaceListQuery,
  ): Promise<InvitationPage> {
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
        requireWorkspacePermission(actor.role, "manageInvitations");
        const scope = ["invitation-list-v1", actorId, workspaceId];
        const after =
          query.cursor === undefined
            ? undefined
            : directoryAfter(this.config.secret, scope, query.cursor);
        const rows = await tx.workspaceInvitation.findMany({
          where: {
            workspaceId,
            status: "PENDING",
            expiresAt: { gt: new Date() },
            id: { gt: after },
          },
          select: invitationSelect,
          orderBy: { id: "asc" },
          take: query.limit + 1,
        });
        const data = rows.slice(0, query.limit).map(summary);
        const hasNextPage = rows.length > query.limit;
        return {
          data,
          pageInfo: {
            hasNextPage,
            nextCursor: hasNextPage
              ? directoryCursor(
                  this.config.secret,
                  scope,
                  data[data.length - 1].id,
                )
              : null,
          },
        };
      },
      { isolationLevel: "RepeatableRead" },
    );
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    invite: Invitation,
    action: string,
    requestId: string,
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId: invite.workspaceId,
        actorId,
        action,
        targetType: "WorkspaceInvitation",
        targetId: invite.id,
        requestId,
        details: { role: invite.role },
      },
    });
  }

  private async pending(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    id: string,
  ) {
    const invite = await tx.workspaceInvitation.findFirst({
      where: { id, workspaceId },
      select: invitationSelect,
    });
    if (!invite) throw new NotFoundException();
    if (invite.status !== "PENDING" || invite.expiresAt.getTime() <= Date.now())
      throw new ConflictException();
    return invite;
  }

  // SMTP is outside the transaction. Failed deliveries remain pending and can be retried with a fresh token.
  private async deliver(
    { workspace, ...invite }: Invitation & { workspace: { name: string } },
    token: string,
  ) {
    try {
      await this.mail.send(
        invite.emailNormalized,
        "Your TaskFlow workspace invitation",
        "You have been invited to join " +
          workspace.name +
          " on TaskFlow. Verify your email in Account before accepting: " +
          this.config.origin +
          "/app/account\n\nInvitation token: " +
          token +
          "\n\nExpires at " +
          invite.expiresAt.toISOString() +
          ".",
      );
    } catch {
      throw new ServiceUnavailableException();
    }
    return summary(invite);
  }

  async create(
    actorId: string,
    workspaceId: string,
    dto: CreateInvitationDto,
    requestId: string,
  ) {
    const token = randomBytes(32).toString("base64url");
    const invite = await this.db.$transaction(async (tx) => {
      await authorizeWorkspaceWrite(
        tx,
        actorId,
        workspaceId,
        "manageInvitations",
      );
      requireAssignableRole(dto.role);
      const member = await tx.workspaceMember.findFirst({
        where: { workspaceId, user: { emailNormalized: dto.email } },
        select: { id: true },
      });
      if (member) throw new ConflictException();
      const previous = await tx.workspaceInvitation.findFirst({
        where: { workspaceId, emailNormalized: dto.email, status: "PENDING" },
        select: invitationSelect,
      });
      const now = Date.now();
      if (previous) {
        if (previous.expiresAt.getTime() > now) throw new ConflictException();
        await tx.workspaceInvitation.update({
          where: { id: previous.id },
          data: { status: "EXPIRED" },
        });
        await this.audit(
          tx,
          actorId,
          previous,
          "INVITATION_EXPIRED",
          requestId,
        );
      }
      const created = await tx.workspaceInvitation.create({
        data: {
          workspaceId,
          emailNormalized: dto.email,
          role: dto.role,
          invitedById: actorId,
          tokenHash: digest(token),
          expiresAt: new Date(now + this.ttlHours * 3600000),
        },
        select: { ...invitationSelect, workspace: { select: { name: true } } },
      });
      await this.audit(tx, actorId, created, "INVITATION_CREATED", requestId);
      return created;
    });
    return this.deliver(invite, token);
  }

  async resend(
    actorId: string,
    workspaceId: string,
    id: string,
    requestId: string,
  ) {
    const token = randomBytes(32).toString("base64url");
    const invite = await this.db.$transaction(async (tx) => {
      await authorizeWorkspaceWrite(
        tx,
        actorId,
        workspaceId,
        "manageInvitations",
      );
      await this.pending(tx, workspaceId, id);
      const rotated = await tx.workspaceInvitation.update({
        where: { id },
        data: {
          tokenHash: digest(token),
          expiresAt: new Date(Date.now() + this.ttlHours * 3600000),
        },
        select: { ...invitationSelect, workspace: { select: { name: true } } },
      });
      await this.audit(tx, actorId, rotated, "INVITATION_RESENT", requestId);
      return rotated;
    });
    return this.deliver(invite, token);
  }

  async revoke(
    actorId: string,
    workspaceId: string,
    id: string,
    requestId: string,
  ) {
    await this.db.$transaction(async (tx) => {
      await authorizeWorkspaceWrite(
        tx,
        actorId,
        workspaceId,
        "manageInvitations",
      );
      const invite = await this.pending(tx, workspaceId, id);
      await tx.workspaceInvitation.update({
        where: { id },
        data: { status: "REVOKED" },
      });
      await this.audit(tx, actorId, invite, "INVITATION_REVOKED", requestId);
    });
  }

  async accept(
    actorId: string,
    token: string,
    requestId: string,
  ): Promise<AcceptedInvitation> {
    const tokenHash = digest(token);
    return this.db.$transaction(async (tx) => {
      // Match the token to a tenant, then acquire the same workspace lock as all membership writes.
      const [workspace] = await tx.$queryRaw<{ id: string; slug: string }[]>`
        SELECT w.id,w.slug FROM workspaces w JOIN workspace_invitations i ON i."workspaceId"=w.id
        WHERE i."tokenHash"=${tokenHash} AND w."archivedAt" IS NULL FOR UPDATE OF w`;
      if (!workspace) throw new ConflictException();
      const invite = await tx.workspaceInvitation.findFirst({
        where: {
          tokenHash,
          workspaceId: workspace.id,
          status: "PENDING",
          expiresAt: { gt: new Date() },
        },
        select: invitationSelect,
      });
      if (!invite) throw new ConflictException();
      const [actor] = await tx.$queryRaw<
        { emailNormalized: string; emailVerifiedAt: Date | null }[]
      >`
        SELECT "emailNormalized","emailVerifiedAt" FROM users WHERE id=${actorId} FOR SHARE`;
      if (
        !actor?.emailVerifiedAt ||
        actor.emailNormalized !== invite.emailNormalized
      )
        throw new ForbiddenException();
      requireAssignableRole(invite.role);
      const existing = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: { workspaceId: workspace.id, userId: actorId },
        },
        select: { role: true },
      });
      const acceptedAt = new Date();
      const consumed = await tx.workspaceInvitation.updateMany({
        where: {
          id: invite.id,
          tokenHash,
          status: "PENDING",
          expiresAt: { gt: acceptedAt },
        },
        data: { status: "ACCEPTED", acceptedById: actorId, acceptedAt },
      });
      if (consumed.count !== 1) throw new ConflictException();
      const membership =
        existing ??
        (await tx.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: actorId,
            role: invite.role,
          },
          select: { role: true },
        }));
      await this.audit(tx, actorId, invite, "INVITATION_ACCEPTED", requestId);
      return { workspace, membership };
    });
  }
}
