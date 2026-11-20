# Implementation status

[M0 — Foundation](https://github.com/zeddlabs/taskflow/milestone/1) covers a runnable local stack, the authentication flow, a responsive web shell and pull-request quality checks. GitHub tracks issue closure and owner merges.

| Issue                                                                                           | Dependencies | Status                                                         |
| ----------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------- |
| [#1 Initialize the monorepo](https://github.com/zeddlabs/taskflow/issues/1)                     | None         | [AWAITING_REVIEW](https://github.com/zeddlabs/taskflow/pull/9) |
| [#2 Local PostgreSQL](https://github.com/zeddlabs/taskflow/issues/2)                            | #1           | TODO                                                           |
| [#3 Prisma models, migrations and seed](https://github.com/zeddlabs/taskflow/issues/3)          | #2           | TODO                                                           |
| [#4 NestJS request and error handling](https://github.com/zeddlabs/taskflow/issues/4)           | #1           | TODO                                                           |
| [#5 Registration, login and profile](https://github.com/zeddlabs/taskflow/issues/5)             | #3, #4       | TODO                                                           |
| [#6 Refresh, logout and CSRF](https://github.com/zeddlabs/taskflow/issues/6)                    | #5           | TODO                                                           |
| [#7 Browser authentication and responsive shell](https://github.com/zeddlabs/taskflow/issues/7) | #6           | TODO                                                           |
| [#8 M0 CI quality gates](https://github.com/zeddlabs/taskflow/issues/8)                         | #7           | TODO                                                           |

TDD §16.1 items 001–006 correspond to the first six M0 issues. Items 007–010 belong to M1 and 011–012 to M2. Item 013 goes to M3. Item 014 splits comments into M2 and personal views and summary into M3. Item 015 spans milestones, with foundation CI and auth smoke in M0 and the complete P0 demonstration, API docs and deployment gate in M3.
