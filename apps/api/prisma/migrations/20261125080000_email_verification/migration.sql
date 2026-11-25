CREATE TABLE "email_verification_challenges" (
  "userId" TEXT PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "emailNormalized" VARCHAR(320) NOT NULL,
  "tokenHash" CHAR(64) NOT NULL CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" BETWEEN 0 AND 5)
);
