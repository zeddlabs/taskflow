# Implementation status

The post-M0 [design system baseline (#17)](https://github.com/zeddlabs/taskflow/issues/17) is [DONE](https://github.com/zeddlabs/taskflow/pull/18).

The post-M0 [control contrast improvement (#19)](https://github.com/zeddlabs/taskflow/issues/19) is [DONE](https://github.com/zeddlabs/taskflow/pull/25).

The post-M0 [dashboard text reflow improvement (#20)](https://github.com/zeddlabs/taskflow/issues/20) is [DONE](https://github.com/zeddlabs/taskflow/pull/26).

The post-M0 [dashboard font loading improvement (#21)](https://github.com/zeddlabs/taskflow/issues/21) is [DONE](https://github.com/zeddlabs/taskflow/pull/27).

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
