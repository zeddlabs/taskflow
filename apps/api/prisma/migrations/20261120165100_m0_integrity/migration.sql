BEGIN;

ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized"
    CHECK ("emailNormalized" <> '' AND "emailNormalized" = lower("emailNormalized")
           AND "emailNormalized" !~ '[[:space:]]');

ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_slug_normalized"
    CHECK ("slug" <> '' AND "slug" = lower("slug") AND "slug" !~ '[[:space:]]');

ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_sha256_hex"
    CHECK ("tokenHash" ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX "workspace_members_one_owner"
    ON "workspace_members" ("workspaceId") WHERE "role" = 'OWNER';

COMMIT;
