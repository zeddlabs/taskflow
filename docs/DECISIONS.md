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

## M0 session rotation and browser transport

Issue #6 serializes refreshes on the PostgreSQL session row. A second use of any consumed generation commits revocation before the API returns 401. Browser clients must coordinate refresh across tabs.

The API derives a session-bound CSRF proof using HMAC-SHA-256 and an independent secret. Login and refresh return the proof in a response header. A same-origin client can recover the proof after reload using its current refresh cookie. A logout-path cookie identifies the session for revocation after the access cookie expires. That identifier grants no access or renewal, and revocation requires the matching proof.

## M0 browser sessions

Issue #7 uses the Web Locks API on HTTPS or loopback to serialize session writes across same-origin tabs. Each waiting tab checks its access again after acquiring the lock, so one successful refresh also serves the other tabs. BroadcastChannel messages carry only login or logout events. On session changes, the shell clears its query cache and navigates with a fresh document. The protected overview and account page check the active profile with uncached API requests. When the access cookie expires, the browser can reach the path-scoped refresh cookie through the same-origin rewrite.
