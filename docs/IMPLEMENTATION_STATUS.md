# Implementation status

## M1 — Tenant Core

[Milestone](https://github.com/zeddlabs/taskflow/milestone/2). The public authentication redesign [#33](https://github.com/zeddlabs/taskflow/issues/33) was merged in [#34](https://github.com/zeddlabs/taskflow/pull/34). All eight M0 issues are closed. The following order keeps each delivery independently reviewable.

| Issue                                                                                                                  | Dependencies | Snapshot    |
| ---------------------------------------------------------------------------------------------------------------------- | ------------ | ----------- |
| [#35 List and read workspaces through current membership](https://github.com/zeddlabs/taskflow/issues/35)              | #7, #8       | IN_PROGRESS |
| [#36 Create workspaces with an owner and transactional audit](https://github.com/zeddlabs/taskflow/issues/36)          | #35          | TODO        |
| [#37 Enforce workspace policies, settings and archival](https://github.com/zeddlabs/taskflow/issues/37)                | #36          | TODO        |
| [#38 Manage workspace members and transfer ownership](https://github.com/zeddlabs/taskflow/issues/38)                  | #37          | TODO        |
| [#39 Verify account email for invitation acceptance](https://github.com/zeddlabs/taskflow/issues/39)                   | #36          | TODO        |
| [#40 Issue, resend, revoke and accept workspace invitations](https://github.com/zeddlabs/taskflow/issues/40)           | #38, #39     | TODO        |
| [#41 Create and read visibility-scoped projects with default statuses](https://github.com/zeddlabs/taskflow/issues/41) | #37          | TODO        |
| [#42 Manage project lifecycle and project memberships](https://github.com/zeddlabs/taskflow/issues/42)                 | #38, #41     | TODO        |
| [#43 Build workspace onboarding, switcher and settings](https://github.com/zeddlabs/taskflow/issues/43)                | #37          | TODO        |
| [#44 Build member, ownership and invitation flows](https://github.com/zeddlabs/taskflow/issues/44)                     | #40, #43     | TODO        |
| [#45 Build project directory, settings and access management](https://github.com/zeddlabs/taskflow/issues/45)          | #42, #43     | TODO        |

Issue #35 provides two cookie-authenticated GET routes under `/api/v1/workspaces`. The collection accepts `limit` (1–100, default 25), `sort=id_asc` and an actor-bound cursor. Each summary contains id, name, slug and the caller's membership role. Lists exclude archived tenants. Unavailable details return 404. Both reads reuse the M0 tables. Membership and archive filters are evaluated in the database on every read.

Local validation for #35 passed API lint, typecheck, production build, smoke and eight HTTP contract tests, four PostgreSQL constraint tests, twelve API integration tests and ten Chromium regression tests. Prisma validated the existing schema and applied both migrations on a disposable database. See [local database test setup](ISSUES.md).

## Foundation and post-M0 history

The post-M0 [design system baseline (#17)](https://github.com/zeddlabs/taskflow/issues/17) is [DONE](https://github.com/zeddlabs/taskflow/pull/18).

The post-M0 [control contrast improvement (#19)](https://github.com/zeddlabs/taskflow/issues/19) is [DONE](https://github.com/zeddlabs/taskflow/pull/25).

The post-M0 [dashboard text reflow improvement (#20)](https://github.com/zeddlabs/taskflow/issues/20) is [DONE](https://github.com/zeddlabs/taskflow/pull/26).

The post-M0 [dashboard font loading improvement (#21)](https://github.com/zeddlabs/taskflow/issues/21) is [DONE](https://github.com/zeddlabs/taskflow/pull/27).

The post-M0 [sign-in guidance after session loss (#22)](https://github.com/zeddlabs/taskflow/issues/22) is [DONE](https://github.com/zeddlabs/taskflow/pull/28).

The post-M0 [mobile header touch target improvement (#23)](https://github.com/zeddlabs/taskflow/issues/23) is [DONE](https://github.com/zeddlabs/taskflow/pull/29).

The post-M0 [design metadata update (#24)](https://github.com/zeddlabs/taskflow/issues/24) is [DONE](https://github.com/zeddlabs/taskflow/pull/30).

The post-M0 [Cove dashboard redesign (#31)](https://github.com/zeddlabs/taskflow/issues/31) is [DONE](https://github.com/zeddlabs/taskflow/pull/32).

[M0 — Foundation](https://github.com/zeddlabs/taskflow/milestone/1) covers a runnable local stack, the authentication flow, a responsive web shell and pull-request quality checks. GitHub tracks issue closure and owner merges.

| Issue                                                                                           | Dependencies | Status                                               |
| ----------------------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------- |
| [#1 Initialize the monorepo](https://github.com/zeddlabs/taskflow/issues/1)                     | None         | [DONE](https://github.com/zeddlabs/taskflow/pull/9)  |
| [#2 Local PostgreSQL](https://github.com/zeddlabs/taskflow/issues/2)                            | #1           | [DONE](https://github.com/zeddlabs/taskflow/pull/10) |
| [#3 Prisma models, migrations and seed](https://github.com/zeddlabs/taskflow/issues/3)          | #2           | [DONE](https://github.com/zeddlabs/taskflow/pull/11) |
| [#4 NestJS request and error handling](https://github.com/zeddlabs/taskflow/issues/4)           | #1           | [DONE](https://github.com/zeddlabs/taskflow/pull/12) |
| [#5 Registration, login and profile](https://github.com/zeddlabs/taskflow/issues/5)             | #3, #4       | [DONE](https://github.com/zeddlabs/taskflow/pull/13) |
| [#6 Refresh, logout and CSRF](https://github.com/zeddlabs/taskflow/issues/6)                    | #5           | [DONE](https://github.com/zeddlabs/taskflow/pull/14) |
| [#7 Browser authentication and responsive shell](https://github.com/zeddlabs/taskflow/issues/7) | #6           | [DONE](https://github.com/zeddlabs/taskflow/pull/15) |
| [#8 M0 CI quality gates](https://github.com/zeddlabs/taskflow/issues/8)                         | #7           | [DONE](https://github.com/zeddlabs/taskflow/pull/16) |

TDD §16.1 items 001–006 correspond to the first six M0 issues. Items 007–010 belong to M1 and 011–012 to M2. Item 013 goes to M3. Item 014 splits comments into M2 and personal views and summary into M3. Item 015 spans milestones, with foundation CI and auth smoke in M0 and the complete P0 demonstration, API docs and deployment gate in M3.
