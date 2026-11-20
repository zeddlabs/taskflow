# Implementation decisions

## M0 monorepo bootstrap

Issue [#1](https://github.com/zeddlabs/taskflow/issues/1) pins Node.js 24.x, pnpm 10 and the application dependencies in the package manifests and lockfile. Turborepo runs package-level scripts. Both apps inherit strict TypeScript settings from the root and select their own module settings for NestJS and Next.js.

The bootstrap smoke tests use Node's built-in test runner and temporary HTTP listeners to exercise the compiled applications. Domain and authentication tests are planned in their respective issues.

## M0 identity and membership storage

Issue [#3](https://github.com/zeddlabs/taskflow/issues/3) uses Prisma 7.10.1 with the PostgreSQL driver adapter and generates the client in CommonJS format for the NestJS package. One session can retain several refresh-token digests, including consumed tokens, so the authentication service can later detect reuse.

Workspace ownership is represented by the membership role. PostgreSQL enforces a maximum of one owner per workspace through a partial unique index. Workspace creation and ownership transfer must maintain the minimum of one owner in a transaction when the M1 workflows are implemented.
