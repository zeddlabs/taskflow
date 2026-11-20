# Implementation decisions

## M0 monorepo bootstrap

Issue [#1](https://github.com/zeddlabs/taskflow/issues/1) pins Node.js 24.x, pnpm 10 and the application dependencies in the package manifests and lockfile. Turborepo runs package-level scripts. Both apps inherit strict TypeScript settings from the root and select their own module settings for NestJS and Next.js.

The bootstrap smoke tests use Node's built-in test runner and temporary HTTP listeners to exercise the compiled applications. Domain and authentication tests are planned in their respective issues.
