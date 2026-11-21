# TaskFlow

TaskFlow is a multi-tenant project management application under development. The foundation currently includes a Next.js web app and a NestJS API with a public process-liveness endpoint.

## Run locally

Use Node.js 24.15 or newer within the 24.x series and pnpm 10.34.9. With Corepack installed, run `corepack enable pnpm` and verify that `pnpm --version` from the repository root prints `10.34.9`. Turborepo also resolves pnpm from your PATH.

Run `pnpm install --frozen-lockfile`. Set up [local PostgreSQL](#local-postgresql) and [migrate the development database](#migrate-and-seed-a-development-database), then start the web and API with `pnpm dev`.

Open the web app at http://localhost:3000. Request http://localhost:4000/api/v1/health/live to check that the API process is serving HTTP. Its response is `{"status":"ok"}`.

Open `/register` to create an account or `/login` to sign in. Both flows open the protected overview at `/app`. The web app forwards `/api/v1` to `http://127.0.0.1:4000`. To change the upstream, set `TASKFLOW_API_ORIGIN` for both the web build and the running server. The API's `WEB_ORIGIN` must match the origin in the browser.

### API contract

In development, open http://localhost:4000/api/v1/docs for Swagger UI or fetch http://localhost:4000/api/v1/openapi.json for the generated specification. The API assigns a fresh `X-Request-Id` to each request. Use this value to find the corresponding JSON request log.

DTO validation rejects invalid and unknown fields with HTTP 400 and code `VALIDATION_ERROR`. Error responses use `application/problem+json` and include `type`, `title`, `status`, `code`, `detail`, and `requestId`. The request log contains the method, matched route pattern, status, duration in milliseconds and request ID. Swagger routes are disabled when `NODE_ENV=production`.

### Accounts and sessions

| Method and path                 | Request                                                        | Success                                                                |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `POST /api/v1/auth/register`    | JSON with `name`, `email`, and a password of 15–128 characters | 201 with the profile. A duplicate normalized email returns 409.        |
| `POST /api/v1/auth/login`       | JSON with `email` and `password`                               | 200 with the profile, HttpOnly cookies and an `X-CSRF-Token` header    |
| `GET /api/v1/auth/me`           | Access cookie from login                                       | 200 with the active session user's profile                             |
| `GET /api/v1/auth/refresh/csrf` | Current refresh cookie                                         | 204 with `X-CSRF-Token` for this session                               |
| `POST /api/v1/auth/refresh`     | Refresh cookie and `X-CSRF-Token`                              | 200 with rotated credentials in cookies                                |
| `POST /api/v1/auth/logout`      | Logout cookie and `X-CSRF-Token`                               | 204 after revocation and cookie clearing. Repeated logout returns 204. |

Send the configured `Origin` with registration and login. When the header is absent the API checks the origin of `Referer`. Both endpoints share per-process limits of 60 attempts per IP and 10 per normalized email per minute. A 429 response includes `Retry-After` in seconds.

Use same-origin requests through the web proxy. Keep the `X-CSRF-Token` response header in memory and send it on every authenticated unsafe request. After a page reload, recover it with `GET /api/v1/auth/refresh/csrf`. This read leaves the refresh credential available for rotation. Let the browser send cookies and the configured origin or referer. A rejected origin or session proof returns 403.

Access cookies expire after ten minutes. Each successful refresh starts a new seven-day idle window, capped at 30 days from login. Serialize refresh calls across tabs. Reusing a consumed cookie revokes that login's entire session, including its latest credentials. After a refresh returns 401, prompt the user to sign in again.

The refresh cookie is scoped to `/api/v1/auth/refresh`. A separate HttpOnly session identifier scoped to `/api/v1/auth/logout` lets the browser log out even after access expiry. Logout requires the matching CSRF proof. All session cookies are host-only, use SameSite=Lax and require HTTPS in production.

### Local PostgreSQL

From the repository root, copy `.env.example` to `.env` and set `POSTGRES_PASSWORD` to a unique local password. Use single quotes around passwords containing literal dollar signs. The example creates database `taskflow_dev` and role `taskflow`. If port 5432 is in use, change `POSTGRES_PORT` in `.env`.

```sh
docker compose config --quiet
docker compose up -d --wait postgres
docker compose ps postgres
```

Connect a local PostgreSQL client to `127.0.0.1` using the port, database, user and password from `.env`. For a client that expects `DATABASE_URL`, use the form `postgresql://USER:PASSWORD@127.0.0.1:PORT/DATABASE` and percent-encode special characters in the credentials.

Run `docker compose down` to stop the database and retain its named volume. The next `docker compose up -d --wait postgres` reuses the data. PostgreSQL reads the initialization credentials when the volume is first created. To change an existing role's password, use the interactive psql command `\password`, then update `.env` to match.

### Migrate and seed a development database

Copy `apps/api/.env.example` to `apps/api/.env` and fill in `DATABASE_URL` for your local PostgreSQL database. Run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` twice and set `JWT_ACCESS_SECRET` and `CSRF_SECRET` to the two independent values. Set `WEB_ORIGIN` to the exact web origin including the port, without a trailing slash. Run the following from the repository root.

```sh
pnpm --filter @taskflow/api exec prisma validate
pnpm --filter @taskflow/api exec prisma generate
pnpm --filter @taskflow/api exec prisma migrate deploy
pnpm --filter @taskflow/api exec prisma db seed
```

The development seed creates one synthetic owner for Acme Studio and Northwind Labs. It hashes a random password with Argon2id, discards the password, and preserves existing fixture records on subsequent runs. To run the database integration tests, point `DATABASE_URL` at a disposable PostgreSQL database, run the four commands above, then run `pnpm --filter @taskflow/api test:db`.

## Verify a change

### Browser authentication tests

Set `DATABASE_URL` in the shell to a disposable, migrated PostgreSQL database. Run the following from the repository root. Playwright starts the built API and web server on loopback, generates temporary signing secrets and registers synthetic accounts. By default it uses API port 4000 and web port 3107. Use the same `TASKFLOW_API_ORIGIN` for build and test if changing the API port. Screenshots of the sign-in screen and desktop and mobile dashboards are written under `apps/web/test-results`.

```sh
pnpm build
pnpm --filter @taskflow/web exec playwright install chromium
pnpm --filter @taskflow/web test:e2e
```

### Workspace checks

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
