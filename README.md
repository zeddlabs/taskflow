# TaskFlow

TaskFlow is a multi-tenant project management application under development. The foundation currently includes a Next.js web app and a NestJS API with a public process-liveness endpoint.

## Run locally

Use Node.js 24.15 or newer within the 24.x series and pnpm 10.34.9. With Corepack installed, run `corepack enable pnpm` and verify that `pnpm --version` from the repository root prints `10.34.9`. Turborepo also resolves pnpm from your PATH.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open the web app at http://localhost:3000. Request http://localhost:4000/api/v1/health/live to check that the API process is serving HTTP. Its response is `{"status":"ok"}`.

### Local PostgreSQL

From the repository root, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` to a unique local password. Use single quotes around passwords containing literal dollar signs. The example creates database `taskflow_dev` and role `taskflow`. If port 5432 is in use, change `POSTGRES_PORT` in `.env`.

```sh
docker compose config --quiet
docker compose up -d --wait postgres
docker compose ps postgres
```

Connect a local PostgreSQL client to `127.0.0.1` using the port, database, user and password from `.env`. For a client that expects `DATABASE_URL`, use the form `postgresql://USER:PASSWORD@127.0.0.1:PORT/DATABASE` and percent-encode special characters in the credentials.

Run `docker compose down` to stop the database and retain its named volume. The next `docker compose up -d --wait postgres` reuses the data. PostgreSQL reads the initialization credentials when the volume is first created. To change an existing role's password, use the interactive psql command `\password`, then update `.env` to match.

## Verify a change

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

The test command builds both apps and runs HTTP smoke tests against the production output on temporary loopback ports. To start each production app manually, run these commands in separate terminals after the build.

```sh
pnpm --filter @taskflow/web start
pnpm --filter @taskflow/api start
```

## Repository

- `apps/web` contains the Next.js App Router entry point.
- `apps/api` contains the NestJS bootstrap and liveness controller.
- [Product requirements](docs/PRD.md), [technical design](docs/TDD.md) and [implementation status](docs/IMPLEMENTATION_STATUS.md) describe the roadmap and current scope.
