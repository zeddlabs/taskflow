# Implementation decisions

## M0 monorepo bootstrap

Issue [#1](https://github.com/zeddlabs/taskflow/issues/1) pins Node.js 24.x, pnpm 10 and the application dependencies in the package manifests and lockfile. Turborepo runs package-level scripts. Both apps inherit strict TypeScript settings from the root and select their own module settings for NestJS and Next.js.

The bootstrap smoke tests use Node's built-in test runner and temporary HTTP listeners to exercise the compiled applications. Domain and authentication tests are planned in their respective issues.

## M0 identity and membership storage

Issue [#3](https://github.com/zeddlabs/taskflow/issues/3) uses Prisma 7.10.1 with the PostgreSQL driver adapter and generates the client in CommonJS format for the NestJS package. One session can retain several refresh-token digests, including consumed tokens, so the authentication service can later detect reuse.

Workspace ownership is represented by the membership role. PostgreSQL enforces a maximum of one owner per workspace through a partial unique index. Workspace creation and ownership transfer must maintain the minimum of one owner in a transaction when the M1 workflows are implemented.

## M0 registration and login

Issue [#5](https://github.com/zeddlabs/taskflow/issues/5) uses the same Argon2id settings for registration and development seed accounts. Login creates the session and the first refresh-token digest in one transaction. The session has a 30-day absolute expiry and the first refresh credential has a seven-day expiry. Each profile read verifies the JWT signature, algorithm, issuer, audience and timestamps, then checks the session's subject, expiry and revocation in PostgreSQL.

The M0 API runs as a single process. Auth throttling uses expiring in-memory counters keyed independently by peer IP and normalized email digest. A restart clears these counters. A deployment with multiple API replicas requires shared counters and explicit trusted-proxy configuration.
