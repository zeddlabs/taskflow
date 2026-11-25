# Implementation decisions

## M1 project creation and visibility

Issue #41 uses one read policy for the project directory, detail and statuses. The workspace must be active. Its owner can read all projects. Admins and members can read workspace-visible projects. Every other grant requires explicit project membership. Composite foreign keys tie that grant to both the project and a current membership in the same workspace. Removing a workspace member removes their project grants. Rejoining requires new grants.

The default directory excludes archived projects and signs its continuation for the caller and workspace. Authorized direct reads preserve access to archived project history. Creation follows the existing workspace write lock, checks the member-creation setting and commits the project, four ordered statuses, creator's manager membership and audit event together. The initial task number is 1. Project keys use 2–12 uppercase letters or digits and remain reserved in their workspace after archival.

## M1 workspace invitations

Owner and admin can list active pending invitations, invite a normalized email address to a non-owner role, rotate a pending invitation through resend, or revoke it. Issuance generates 32 random bytes and sends the bearer token only by email. The database stores the SHA-256 digest. A partial unique index permits one pending invitation per workspace and address. The default lifetime is seven days (`INVITATION_TTL_HOURS`). Reads and mutations enforce the deadline immediately. A new invitation marks any elapsed pending predecessor EXPIRED before claiming its slot.

Authenticated `POST /api/v1/invitations/accept` resolves the workspace from the digest and rechecks the invitation under the workspace lock. Acceptance requires the current verified email to match and uses a guarded state transition in the same transaction as membership and audit. If the user joined through another path, acceptance preserves the existing role. Reuse, rotation, expiration and revocation yield 409. A current token presented by the wrong or unverified account yields 403.

SMTP runs after commit. A delivery error returns 503 and leaves a pending invitation in the administrative directory. Resend generates a fresh token. Audit records identify the workspace, invitation, actor, role and request. The member-facing browser flow is tracked in #44.

## M1 account email verification

Issue #39 adds authenticated, CSRF-protected POST operations at `/api/v1/auth/email-verification/request` and `/consume`. The session determines the recipient. The API returns a verification flag in the safe profile. Invitation acceptance will use the stored verification timestamp in #40.

One challenge row per user holds the normalized destination, a domain-separated HMAC of the account, address and random eight-digit code, expiry, issue time and failed-attempt count. Request and consume serialize on the user row. A challenge lasts 15 minutes, allows five failed guesses and can be replaced once per minute. Failed guesses commit before the API returns an error. Successful consumption deletes the challenge and sets the verification timestamp in one transaction. Rotating the signing secret invalidates outstanding codes.

SMTP delivery runs after the transaction. Delivery failure expires only the challenge that failed to send. Logs and API responses omit codes. The SMTP adapter can be replaced in tests through the Nest provider.

## M1 workspace creation and audit

`POST /api/v1/workspaces` accepts a display name and a globally unique slug. Slugs are trimmed, lowercased and validated as alphanumeric segments separated by hyphens. The database unique constraint arbitrates concurrent requests. A committed creation returns 201 with the new resource location; a colliding slug returns 409.

Workspace creation, the creator's OWNER membership and the WORKSPACE_CREATED audit row share one PostgreSQL transaction. The actor comes from the authenticated session and the request ID from server middleware. This event stores an empty JSON object for details. The audit table requires a workspace and retains events with a null actor reference when the actor is deleted.

## M1 workspace membership and ownership

Issue #38 uses the active workspace membership for every directory read and mutation. The directory returns only user ID, display name, avatar URL and workspace role to owners, admins and members. Guests cannot list members. The cursor sorts by user ID and is signed for the current actor and workspace.

Owners and admins may change or remove a non-owner membership. PATCH accepts ADMIN, MEMBER or GUEST. Repeating the current role succeeds without recording another event. Only the current owner can transfer ownership to an existing admin or member. Transfer demotes the former owner to ADMIN and promotes the target to OWNER. A guest must first be explicitly assigned an eligible role.

Membership, settings and archive writes acquire the workspace lock before rechecking the actor. The unique owner index and demotion/promotion transaction preserve exactly one owner. Each effective membership change commits alongside its audit event. Removing a member revokes access to that workspace on the next request. Other workspace memberships and the account session stay valid.

## M1 workspace settings and archival

Issue #37 centralizes workspace permissions. Owners and admins can read settings through `GET /api/v1/workspaces/:wid/settings` and update the name, slug, timezone and member project-creation setting through `PATCH /api/v1/workspaces/:wid`. An owner can archive through `POST /api/v1/workspaces/:wid/archive`. The ordinary workspace detail remains available to every active member. An insufficient role yields 403. A missing membership or inactive workspace yields 404.

Settings writes and archival lock the active workspace and the actor's current membership in PostgreSQL through commit. Concurrent writes are serialized and an archived workspace cannot accept another settings change. Each successful mutation records the actor, workspace, target, action and request ID in the same transaction. Settings events record field names. Archival preserves memberships and audit history.

## M1 workspace directory

The directory reads the caller's current membership together with the active workspace. The session establishes identity and the database query establishes access, so removal takes effect on the next request. The list orders by workspace ID and uses a signed continuation bound to the actor and the directory version. Rotating the signing secret invalidates existing cursors. A client can restart pagination from the first page.

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
