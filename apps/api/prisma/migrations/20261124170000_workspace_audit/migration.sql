BEGIN;

CREATE TABLE "audit_logs" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "actorId" TEXT REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(80) NOT NULL,
  "targetId" VARCHAR(100) NOT NULL,
  "requestId" VARCHAR(100),
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "audit_logs_workspaceId_createdAt_id_idx" ON "audit_logs" ("workspaceId", "createdAt", "id");
CREATE INDEX "audit_logs_workspaceId_targetType_targetId_idx" ON "audit_logs" ("workspaceId", "targetType", "targetId");

COMMIT;
