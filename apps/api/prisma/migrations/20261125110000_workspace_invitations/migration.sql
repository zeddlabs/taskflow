BEGIN;

CREATE TYPE "InvitationStatus" AS ENUM ('PENDING','ACCEPTED','REVOKED','EXPIRED');

CREATE TABLE "workspace_invitations" (
    "id" TEXT PRIMARY KEY,
    "workspaceId" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "emailNormalized" VARCHAR(320) NOT NULL CHECK ("emailNormalized" <> '' AND "emailNormalized" = lower("emailNormalized") AND "emailNormalized" !~ '[[:space:]]'),
    "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER' CHECK ("role" <> 'OWNER'),
    "tokenHash" VARCHAR(64) NOT NULL CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "acceptedById" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "workspace_invitations_tokenHash_key" ON "workspace_invitations" ("tokenHash");
CREATE UNIQUE INDEX "workspace_invitations_one_pending" ON "workspace_invitations" ("workspaceId","emailNormalized") WHERE "status"='PENDING';
CREATE INDEX "workspace_invitations_workspaceId_status_id_idx" ON "workspace_invitations" ("workspaceId","status","id");
CREATE INDEX "workspace_invitations_expiresAt_status_idx" ON "workspace_invitations" ("expiresAt","status");

COMMIT;
