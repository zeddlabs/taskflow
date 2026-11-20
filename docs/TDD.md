# Technical Design Document (TDD)

# TaskFlow — Advanced Project Management SaaS

> **Versi:** 1.0.0  
> **Status:** Proposed / implementation-ready baseline, subject to validation  
> **Tanggal:** 20 November 2026  
> **Referensi utama:** `PRD.md` v1.0.0  
> **Target pengembang:** Solo Full-Stack Developer (intermediate → advanced)  
> **Stack:** Next.js App Router, NestJS, TypeScript, PostgreSQL, Prisma ORM, Redis, BullMQ  
> **Bahasa dokumen:** Indonesia; nama domain, API, dan kode menggunakan bahasa Inggris.

---

## 0. Cara menggunakan dokumen

Dokumen ini menerjemahkan kebutuhan produk dalam PRD menjadi keputusan implementasi, desain data, batas modul, kontrak API, pendekatan concurrency, strategi keamanan, dan test plan. Dokumen ini **bukan klaim bahwa implementasi sudah tersedia atau kode sudah dijalankan**. Semua contoh perlu diverifikasi di repository yang dibuat dan dijalankan lewat `prisma validate`, test, dan migration dry run.

Penanda scope:

- **P0 — Foundation + portfolio MVP:** harus selesai sebelum demo publik.
- **P1 — Advanced collaboration:** WebSocket, outbox, queues, notifications, status customization.
- **P2 — Stretch:** billing sandbox, automations, API tokens, integrations.
- **ADR:** keputusan arsitektur yang dapat direvisi secara eksplisit jika hasil pengujian berbeda.

**Urutan implementasi yang disarankan:** skema & auth → workspace isolation → membership/RBAC → private projects → task/board → komentar/audit → test/deploy → WebSocket/outbox → fitur advanced lain.

### 0.1 Acceptance terhadap PRD

| PRD                 | Bukti teknis dalam TDD                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| AUTH-01..03         | Session model, cookies, refresh rotation, auth endpoints dan tests        |
| WS-01..04           | WorkspaceMember, invitation state machine, transaction dan policy matrix  |
| PROJ-01..04         | Project visibility, ProjectMember, ProjectStatus, scoped repository       |
| TASK-01..07         | Number allocation, Task schema, optimistic concurrency, reorder, activity |
| VIEW-01 / REPORT-01 | Query `my tasks`, summary aggregates, pagination                          |
| COLLAB-01           | Gateway, project rooms, event versioning, reconnect rules (P1)            |
| NOTIF-01..02        | Outbox, BullMQ worker, deduplication, delivery lifecycle (P1)             |
| AUDIT-01            | Append-only audit entries dalam transaksi mutasi                          |
| AUTO / BILL / INT   | Extension points tanpa memaksakan implementasi P0 (P2)                    |

---

## 1. Technical goals, non-goals, dan asumsi

### 1.1 Tujuan teknik

1. **Strong tenant isolation:** semua operasi private menggunakan authorization berbasis user + workspace + project; tidak ada trust terhadap `workspaceId` dari request body.
2. **Deterministic business rules:** role, project privacy, task assignment, task status, serta invitation state memiliki aturan yang mudah diuji.
3. **Concurrency-safe writes:** task number, acceptance invitation, ownership transfer, dan task update dilindungi oleh constraint/transaksi/version.
4. **Recoverable UX:** kesalahan jaringan, konflik versi, pagination, dan reconnect tidak merusak state UI.
5. **Deployable architecture:** satu NestJS modular monolith, satu worker terpisah saat P1, satu Next.js app, shared PostgreSQL.
6. **Recruiter-friendly:** swagger, ERD, CI, seeded demo, tests, diagram, dan case study dapat dipresentasikan.

### 1.2 Non-goals P0

Billing nyata, microservices, database per tenant, offline-first sync, CRDT collaborative editing, WebSocket mutations sebagai sumber kebenaran, Elasticsearch, distributed event sourcing, complex Gantt, native mobile, RLS sebagai satu-satunya policy mechanism.

### 1.3 Baseline keputusan operasional

- **Tenant:** satu Workspace = satu tenant; User boleh masuk banyak tenant.
- **Private project:** owner workspace override; admin workspace **tidak** otomatis boleh membaca private project.
- **Project roles:** `MANAGER`, `CONTRIBUTOR`, `VIEWER`.
- **MVP statuses:** empat `ProjectStatus` awal (`BACKLOG`, `TODO`, `IN_PROGRESS`, `DONE`), disimpan sebagai baris sejak P0; P1 mengaktifkan pengelolaannya.
- **Task body:** Markdown/plain text tersimpan, dirender aman; tidak menerima HTML mentah secara default.
- **Soft-delete:** task `archivedAt`/`deletedAt` dengan kebijakan restore; project `archivedAt`; audit append-only.
- **Concurrency contract:** `PATCH`/`reorder` wajib `If-Match: "<version>"`; mismatch menghasilkan **412 Precondition Failed**; header hilang **428 Precondition Required**.
- **Pagination:** cursor opaque berbasis sort yang stabil, bukan offset untuk daftar besar.
- **Time:** database UTC; tanggal ditampilkan menurut timezone pengguna.
- **Auth:** access JWT cookie jangka pendek + refresh opaque cookie dengan rotasi; kedua cookie HttpOnly. Sesi dicatat di DB dan dicek untuk request terautentikasi.
- **Delivery:** setiap domain mutation yang penting menyimpan audit sinkron; event eksternal P1 memakai outbox dalam transaksi yang sama.

---

## 2. High-level architecture

```mermaid
flowchart TB
    B[Browser] -->|HTTPS| EDGE[Reverse proxy / same-origin /api/v1]
    EDGE --> NEXT[Next.js App Router]
    EDGE --> API[NestJS REST API]
    B <-->|WSS P1| GW[Socket Gateway in NestJS API]
    NEXT -->|Server-side HTTPS with forwarded session| API
    API --> AUTH[Auth and Policy Services]
    API --> DOMAIN[Workspace / Project / Task Modules]
    AUTH --> PG[(PostgreSQL)]
    DOMAIN --> PG
    API --> REDIS[(Redis P1)]
    API --> OUT[(outbox_events in PostgreSQL)]
    OUT --> POLLER[Outbox dispatcher P1]
    POLLER --> BULL[BullMQ Redis P1]
    BULL --> WORKER[NestJS Worker P1]
    WORKER --> PG
    WORKER --> MAIL[Email provider P1]
    GW <--> REDIS
```

**Topologi:** `app.example.com` menyajikan Next.js dan me-reverse-proxy `/api/v1` serta `/socket.io` ke NestJS. Sebaiknya jangan membuka dua browser origin tanpa kebutuhan; auth cookie, CSRF, dan CORS lebih mudah ditangani secara same-origin.

### 2.1 Batas tanggung jawab

| Komponen           | Boleh                                                                   | Tidak boleh                                             |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------- |
| `apps/web`         | UI, form validation, client cache, SSR fetch, query key, optimistic UI  | Menjadi sumber akhir permission atau mengakses DB       |
| `apps/api`         | Auth, resource policy, validation, transactional domain writes, OpenAPI | Mempercayai `workspaceId` dari body tanpa scoped lookup |
| `apps/worker` (P1) | Email, async notifications, scheduled retry, outbox processing          | Menerima job sebagai bukti authorization user           |
| PostgreSQL         | FK, unique/check constraints, transactions, audit/outbox persistence    | Menggantikan seluruh policy di service layer            |
| Redis (P1)         | Queue, rate limiting/caching, Socket.IO adapter                         | Menjadi source of truth task/membership                 |

### 2.2 Request lifecycle

```mermaid
sequenceDiagram
    participant Web as Next.js Browser
    participant API as NestJS API
    participant Auth as SessionGuard
    participant Policy as ProjectPolicy
    participant DB as PostgreSQL
    Web->>API: PATCH /api/v1/tasks/:id + cookie + If-Match
    API->>Auth: Validate JWT, session, CSRF/origin
    Auth-->>API: AuthContext(userId, sessionId)
    API->>Policy: canUpdateTask(userId, taskId)
    Policy->>DB: Scoped read workspace/project/member
    DB-->>Policy: Authorized entity or not found
    API->>DB: Transaction: compare version, write, activity, audit
    DB-->>API: Updated task + version
    API-->>Web: 200, ETag: "14"
    Web->>Web: Update TanStack Query cache
```

### 2.3 ADR ringkas

| ID      | Keputusan                                 | Rasional                                       | Konsekuensi                     |
| ------- | ----------------------------------------- | ---------------------------------------------- | ------------------------------- |
| ADR-001 | Modular monolith                          | Operasional minimal, transaksi terkelola       | Disiplin batas modul dibutuhkan |
| ADR-002 | Shared Postgres + tenant-scoped relations | Cocok untuk demo SaaS                          | Test BOLA/IDOR wajib            |
| ADR-003 | REST/OpenAPI                              | Tooling, contract tests, recruitment demo      | Response DTO harus dirancang    |
| ADR-004 | Role + resource policy                    | Private project lebih kompleks dari RBAC biasa | Policy tested per scenario      |
| ADR-005 | Task `version` + 412                      | Mencegah silent lost updates                   | UI conflict recovery diperlukan |
| ADR-006 | Persisted statuses from P0                | Migrasi ke custom workflow lebih ringan        | Lebih banyak tabel awal         |
| ADR-007 | DB outbox, at-least-once delivery (P1)    | Event tak hilang saat commit                   | Idempotency & polling kompleks  |
| ADR-008 | P1 Redis, bukan wajib di P0               | MVP lebih cepat stabil                         | P0 notification tidak real-time |

---

## 3. Repository & module design

### 3.1 Monorepo

```text
 taskflow/
 ├── apps/
 │   ├── web/                            # Next.js App Router
 │   │   ├── src/app/
 │   │   │   ├── (marketing)/
 │   │   │   ├── (auth)/login,register/
 │   │   │   └── (app)/w/[workspaceSlug]/
 │   │   │       ├── page.tsx
 │   │   │       ├── projects/[projectKey]/
 │   │   │       ├── my-tasks/
 │   │   │       └── settings/members/
 │   │   ├── src/features/{auth,workspace,project,task,board}/
 │   │   ├── src/components/{ui,layout}/
 │   │   ├── src/lib/{api,auth,query,utils}/
 │   │   └── src/types/
 │   ├── api/
 │   │   ├── prisma/
 │   │   │   ├── schema.prisma
 │   │   │   ├── migrations/
 │   │   │   └── seed.ts
 │   │   ├── prisma.config.ts
 │   │   ├── src/common/{auth,guards,filters,interceptors,decorators}/
 │   │   ├── src/modules/
 │   │   │   ├── identity/
 │   │   │   ├── workspaces/
 │   │   │   ├── invitations/
 │   │   │   ├── projects/
 │   │   │   ├── tasks/
 │   │   │   ├── comments/
 │   │   │   ├── activity/
 │   │   │   ├── audit/
 │   │   │   ├── reporting/
 │   │   │   └── health/
 │   │   └── test/{integration,e2e}/
 │   └── worker/                         # P1 only
 │       └── src/{outbox,notifications,email}/
 ├── packages/
 │   ├── contracts/                     # OpenAPI-derived types or shared DTO types
 │   ├── eslint-config/
 │   └── typescript-config/
 ├── infra/{docker,nginx}/
 ├── docs/{PRD.md,TDD.md,adr,api,runbooks}/
 ├── .github/workflows/ci.yml
 ├── docker-compose.yml
 ├── pnpm-workspace.yaml
 ├── turbo.json
 ├── .env.example
 └── README.md
```

**Catatan:** nama folder di atas merupakan _target structure_, bukan perintah membuat direktori berkarakter kurung kurawal secara literal. `apps/worker` dan modul P1 boleh dibuat setelah P0.

### 3.2 Konvensi NestJS

```text
src/modules/tasks/
├── dto/
│   ├── create-task.dto.ts
│   ├── update-task.dto.ts
│   ├── reorder-task.dto.ts
│   └── task-query.dto.ts
├── policies/task.policy.ts
├── tasks.controller.ts
├── tasks.service.ts
├── tasks.repository.ts
├── tasks.mapper.ts
├── tasks.module.ts
├── tasks.service.spec.ts
└── tasks.repository.int-spec.ts
```

- **Controller:** parsing DTO, auth guard, OpenAPI metadata, HTTP semantics.
- **Policy service:** user + resource + role + visibility → allow/deny, dipanggil pada service boundary.
- **Domain service:** validasi aturan bisnis, transactions, mutation, audit.
- **Repository:** query Prisma ter-scope dan query khusus; query spesifik tetap wajib memfilter tenant.
- **DTO/mapper:** jangan expose Prisma model mentah ke REST, terutama user, tokens, dan audit payload.
- **Shared contract:** idealnya derive TypeScript client dari OpenAPI yang dihasilkan NestJS; hindari duplikasi manual secara tidak terkontrol.

### 3.3 Domain-to-module dependency

```mermaid
flowchart LR
    Identity --> Workspace
    Workspace --> Project
    Project --> Task
    Task --> Comment
    Task --> Activity
    Workspace --> Audit
    Project --> Reporting
    Task --> Reporting
    Task --> Outbox[P1 Outbox]
    Outbox --> Worker[P1 Worker]
```

Module tidak boleh membuat _circular imports_ tanpa alasan; bila dibutuhkan, pindahkan interface/policy yang stabil ke shared domain abstraction.

---

## 4. Authentication, session, dan cookie design

### 4.1 Policy baseline

| Elemen            | Aturan                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Credential        | Email normalized + password hash Argon2id (parameter disesuaikan kapasitas server)                                       |
| Access JWT        | 10 menit; minimal `sub`, `sid`, `iat`, `exp`, `iss`, `aud`; cookie HttpOnly                                              |
| Refresh token     | 256-bit random opaque, 7 hari idle/30 hari absolute sebagai target awal; hanya hash SHA-256 disimpan                     |
| Rotation          | Setiap refresh mengonsumsi token lama dan mengeluarkan token baru, transaksi dengan lock/session serialization           |
| Reuse detection   | Token lama yang dipakai lagi menyebabkan session family revoked dan re-login                                             |
| Logout            | Revoke session dan hapus cookies                                                                                         |
| Cookie            | `HttpOnly`, `Secure` di production, `SameSite=Lax` same-origin, `Path` minimal                                           |
| CSRF              | Validasi Origin/Referer yang ketat **dan** synchronizer/double-submit CSRF token pada mutasi cookie-auth sesuai topologi |
| Brute-force       | Rate limit per IP + identifier, delay/backoff dan generic error message                                                  |
| Authorization     | Setiap request protected memvalidasi sesi aktif (bukan cuma signature JWT) dan resource policy                           |
| Password reset P1 | TTL singkat, single-use, hash token, revoke sessions pasca reset                                                         |

**Cookie paths:** access cookie `Path=/` agar autentikasi SSR/WS berfungsi; refresh cookie dapat dibatasi ke `/api/v1/auth/refresh` jika flow logout juga menangani secara eksplisit. Jangan mengekspos access/refresh ke `localStorage`. `Secure` aktif dalam deployment HTTPS.

### 4.2 Refresh rotation state machine

```mermaid
stateDiagram-v2
    [*] --> Issued
    Issued --> Consumed: Successful refresh
    Consumed --> ReuseDetected: Old token presented again
    Issued --> Expired: TTL passed
    Issued --> Revoked: Logout/admin revoke
    ReuseDetected --> SessionRevoked: Revoke all tokens in family
    Expired --> [*]
    SessionRevoked --> [*]
```

**Concurrency nuance:** dua refresh request yang benar-benar bersamaan dapat tampil sebagai reuse. Client harus melakukan _single-flight refresh_ (satu request refresh per tab, koordinasi beberapa tab dengan mekanisme yang sesuai). Server melakukan row lock atas session, mencatat consumed token, dan mempunyai kebijakan reuse yang teruji; jangan membuat grace window tanpa pertimbangan keamanan. Pada tab yang menerima 401, minta re-auth bila refresh benar-benar tidak valid.

### 4.3 Auth flow

1. `POST /auth/login`: cari user dari normalized email; verifikasi Argon2id; buat session dan refresh token dalam satu transaksi; kirim dua HttpOnly cookies.
2. `GET /auth/me`: decode+verify access JWT, cek session belum revoked/expired, keluarkan safe profile DTO.
3. `POST /auth/refresh`: cek token hash, session family, TTL dan usedAt; lakukan atomic rotation; keluarkan cookies baru.
4. `POST /auth/logout`: revoke session, clear cookies, tetap idempotent.
5. Request mutasi: cek session, Origin/CSRF, validate DTO, scoped authorization.

**User ID** hanya dibaca dari validated session, tidak pernah dari request body sebagai actor identity.

---

## 5. Authorization, RBAC, ABAC, dan resource scoping

Role saja tidak memadai karena sebuah workspace memiliki proyek `WORKSPACE` dan `PRIVATE`. Keputusan akses ditentukan dari **workspace role + project membership/role + visibility + action + resource state**.

### 5.1 Matriks workspace policy (default P0)

| Action                                 | OWNER |        ADMIN        |           MEMBER            |             GUEST             |
| -------------------------------------- | :---: | :-----------------: | :-------------------------: | :---------------------------: |
| Workspace read basic                   |  Ya   |         Ya          |             Ya              |           Terbatas            |
| Workspace settings update              |  Ya   |        Ya\*         |            Tidak            |             Tidak             |
| Members list                           |  Ya   |         Ya          | Ya (minimal public profile) |             Tidak             |
| Invite/member role change              |  Ya   |        Ya\*         |            Tidak            |             Tidak             |
| Transfer ownership / archive workspace |  Ya   |        Tidak        |            Tidak            |             Tidak             |
| Create project                         |  Ya   |         Ya          |         Policy flag         |             Tidak             |
| Read `WORKSPACE` project               |  Ya   |         Ya          |             Ya              | Hanya explicit project member |
| Read `PRIVATE` project                 |  Ya   | Jika project member |     Jika project member     |      Jika project member      |
| Read workspace audit                   |  Ya   |         Ya          |            Tidak            |             Tidak             |

`*` Admin tidak dapat mempromosikan orang menjadi OWNER, mengubah owner, atau mengurangi owner terakhir. Policy flag pada Workspace awalnya default `false`, kecuali diuji lain.

### 5.2 Project role matrix (jika resource visible)

| Action                                   | MANAGER | CONTRIBUTOR | VIEWER |
| ---------------------------------------- | :-----: | :---------: | :----: |
| Read task, activity, comments            |   Ya    |     Ya      |   Ya   |
| Create/update/assign/reorder task        |   Ya    |     Ya      | Tidak  |
| Comment                                  |   Ya    |     Ya      | Tidak  |
| Manage project members/settings/statuses |   Ya    |    Tidak    | Tidak  |
| Archive project                          |   Ya    |    Tidak    | Tidak  |

**Workspace OWNER** dapat mengelola seluruh project. **Workspace ADMIN** memiliki admin capability terhadap project `WORKSPACE`; untuk **PRIVATE** perlu project membership (sebagai MANAGER jika akan mengubah konfigurasi). `MEMBER` mendapat kemampuan default `CONTRIBUTOR` pada project `WORKSPACE` selama policy workspace membolehkan; private project selalu membutuhkan membership. `GUEST` hanya akses membership proyek eksplisit. Ini adalah _default policy_ yang harus ditetapkan dalam test fixture.

### 5.3 Scoped access algorithm

```text
authorizeTask(actorId, taskId, action):
  1. Lookup task + project + workspaceId melalui indexed read.
  2. Cari WorkspaceMember(actorId, workspaceId).
     Tidak ada -> 404 (conceal resource existence).
  3. Jika workspace OWNER -> allow (subject to archived state).
  4. Jika project PRIVATE -> require ProjectMember(actorId, projectId).
  5. Jika project WORKSPACE:
       - workspace ADMIN -> project manager capability
       - workspace MEMBER -> contributor capability (policy-dependent)
       - workspace GUEST -> require explicit project membership
  6. Jika explicit project role ada, gabungkan dengan workspace privilege
     tanpa memperluas akses private untuk non-member.
  7. Evaluasi action + archived/blocked resource state.
  8. Return authorized resource context; mutasi tetap menggunakan
     workspaceId/projectId dalam WHERE dan memeriksa version.
```

Jangan melakukan `findUnique({id})` lalu menganggap hasil valid hanya karena user sudah login. Setiap list, search, analytics, notification detail, attachment, dan WS room memiliki policy ekuivalen.

### 5.4 Service-layer assertion example (pseudocode)

```ts
const ctx = await projectPolicy.requireTaskAccess(
  user.id,
  taskId,
  "TASK_UPDATE",
);
await prisma.task.updateMany({
  where: {
    id: taskId,
    workspaceId: ctx.workspaceId,
    projectId: ctx.projectId,
    version: expectedVersion,
    deletedAt: null,
  },
  data: { title: input.title, version: { increment: 1 } },
});
```

`updateMany` return count **harus** dicek. Jika 0, lakukan scoped existence/version diagnosis agar mengembalikan 404/412 secara tepat. Contoh di atas bersifat skematis; activity/audit dan response seharusnya berada di transaction yang sama.

### 5.5 Ownership transfer

- Lock baris Workspace (`SELECT ... FOR UPDATE`) untuk menyerialisasi transfer.
- Target harus sudah WorkspaceMember; role `GUEST` tidak boleh langsung OWNER tanpa validasi.
- Dalam satu transaksi: demote owner lama ke `ADMIN` → promote target ke `OWNER` → tulis AuditLog.
- Constraint DB partial unique memastikan maksimum satu OWNER per workspace; transaksi/policy memastikan minimum satu setelah commit.
- Transfer gagal jika ada concurrent transfer atau owner saat ini telah berubah; gunakan retry terukur, jangan overwrite diam-diam.

---

## 6. Database architecture

### 6.1 Design invariants

1. Semua resource utama menyimpan `workspaceId` ketika relevan; `Project` juga menjadi parent scope.
2. User dapat memiliki banyak membership; **role tidak disimpan di tabel User**.
3. Satu `(workspaceId, userId)` hanya boleh satu kali dalam `WorkspaceMember`.
4. Satu `(projectId, userId)` hanya boleh satu kali dalam `ProjectMember`.
5. Project key unik dalam workspace; task number unik dalam project.
6. ProjectStatus selalu milik project yang sama dengan task: composite FK.
7. ProjectMember harus mengacu ke WorkspaceMember yang ada, bukan user asing tenant lain: composite FK.
8. `version` bertambah hanya untuk perubahan task yang relevan, sehingga mutasi kondisional bisa mendeteksi konflik.
9. Tabel audit tidak dihapus oleh normal user workflow; audit tidak merekam password, token, full comment text, dan payload rahasia.
10. Relasi dan unique constraint mencegah duplikat meski dua request datang bersamaan. Authorization tetap diverifikasi di service.

### 6.2 ERD ringkas P0

```mermaid
erDiagram
    User ||--o{ AuthSession : owns
    AuthSession ||--o{ RefreshToken : rotates
    User ||--o{ WorkspaceMember : joins
    Workspace ||--o{ WorkspaceMember : has
    Workspace ||--o{ WorkspaceInvitation : invites
    Workspace ||--o{ Project : contains
    Workspace ||--o{ Task : scopes
    Project ||--o{ ProjectMember : includes
    WorkspaceMember ||--o{ ProjectMember : qualifies
    Project ||--o{ ProjectStatus : defines
    Project ||--o{ Task : contains
    ProjectStatus ||--o{ Task : classifies
    User ||--o{ Task : reports
    Task ||--o{ TaskComment : has
    Task ||--o{ TaskActivity : records
    Workspace ||--o{ AuditLog : records
```

### 6.3 Contoh Prisma schema — P0 relational core

Contoh di bawah adalah **baseline skema model inti** untuk `apps/api/prisma/schema.prisma`. Prisma CLI/Client harus dipin ke satu major yang kompatibel dan divalidasi sebelum migration. Contoh konfigurasi mengikuti **Prisma ORM v7**; jika memilih versi lain, ikuti dokumentasi versi tersebut. Skema ini mencakup field inti, bukan seluruh fitur P1/P2.

```prisma
// apps/api/prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
  GUEST
}

enum ProjectRole {
  MANAGER
  CONTRIBUTOR
  VIEWER
}

enum ProjectVisibility {
  WORKSPACE
  PRIVATE
}

enum TaskStatusCategory {
  BACKLOG
  TODO
  IN_PROGRESS
  DONE
  CANCELED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

model User {
  id               String                @id @default(cuid())
  emailNormalized  String                @unique @db.VarChar(320)
  name             String                @db.VarChar(150)
  passwordHash     String                @db.VarChar(255)
  emailVerifiedAt  DateTime?
  timezone         String                @default("UTC") @db.VarChar(64)
  avatarUrl        String?               @db.Text
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt
  sessions         AuthSession[]
  memberships      WorkspaceMember[]
  invitationsSent  WorkspaceInvitation[] @relation("InvitedBy")
  invitationsTaken WorkspaceInvitation[] @relation("AcceptedBy")
  reportedTasks    Task[]                @relation("TaskReporter")
  assignedTasks    Task[]                @relation("TaskAssignee")
  comments         TaskComment[]         @relation("CommentAuthor")
  activities       TaskActivity[]        @relation("ActivityActor")
  auditEvents      AuditLog[]            @relation("AuditActor")

  @@map("users")
}

model AuthSession {
  id         String         @id @default(cuid())
  userId     String
  user       User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt  DateTime       @default(now())
  lastSeenAt DateTime?
  expiresAt  DateTime
  revokedAt  DateTime?
  tokens     RefreshToken[]

  @@index([userId, revokedAt, expiresAt])
  @@map("auth_sessions")
}

model RefreshToken {
  id        String       @id @default(cuid())
  sessionId String
  session   AuthSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  tokenHash String       @unique @db.VarChar(64)
  createdAt DateTime     @default(now())
  expiresAt DateTime
  usedAt    DateTime?

  @@index([sessionId, usedAt])
  @@map("refresh_tokens")
}

model Workspace {
  id                        String                @id @default(cuid())
  name                      String                @db.VarChar(150)
  slug                      String                @unique @db.VarChar(80)
  timezone                  String                @default("UTC") @db.VarChar(64)
  allowMemberCreateProjects Boolean               @default(false)
  createdAt                 DateTime              @default(now())
  updatedAt                 DateTime              @updatedAt
  archivedAt                DateTime?
  members                   WorkspaceMember[]
  invitations               WorkspaceInvitation[]
  projects                  Project[]
  tasks                     Task[]
  comments                  TaskComment[]
  activities                TaskActivity[]
  auditLogs                 AuditLog[]

  @@map("workspaces")
}

model WorkspaceMember {
  id                 String          @id @default(cuid())
  workspaceId        String
  userId             String
  role               WorkspaceRole   @default(MEMBER)
  createdAt          DateTime        @default(now())
  workspace          Workspace       @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user               User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  projectMemberships ProjectMember[]

  @@unique([workspaceId, userId])
  @@index([userId])
  @@index([workspaceId, role])
  @@map("workspace_members")
}

model WorkspaceInvitation {
  id              String           @id @default(cuid())
  workspaceId     String
  emailNormalized String           @db.VarChar(320)
  role            WorkspaceRole    @default(MEMBER)
  tokenHash       String           @unique @db.VarChar(64)
  status          InvitationStatus @default(PENDING)
  expiresAt       DateTime
  invitedById     String
  acceptedById    String?
  acceptedAt      DateTime?
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  workspace       Workspace        @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy       User             @relation("InvitedBy", fields: [invitedById], references: [id])
  acceptedBy      User?            @relation("AcceptedBy", fields: [acceptedById], references: [id])

  @@index([workspaceId, emailNormalized, status])
  @@index([expiresAt, status])
  @@map("workspace_invitations")
}

model Project {
  id             String            @id @default(cuid())
  workspaceId    String
  key            String            @db.VarChar(12)
  name           String            @db.VarChar(150)
  description    String?           @db.Text
  visibility     ProjectVisibility @default(WORKSPACE)
  nextTaskNumber Int               @default(1)
  startDate      DateTime?
  dueDate        DateTime?
  archivedAt     DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  workspace      Workspace         @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  members        ProjectMember[]
  statuses       ProjectStatus[]
  tasks          Task[]

  @@unique([workspaceId, id])
  @@unique([workspaceId, key])
  @@index([workspaceId, archivedAt, createdAt])
  @@map("projects")
}

model ProjectMember {
  id            String          @id @default(cuid())
  workspaceId   String
  projectId     String
  userId        String
  role          ProjectRole     @default(CONTRIBUTOR)
  createdAt     DateTime        @default(now())
  project       Project         @relation(fields: [workspaceId, projectId], references: [workspaceId, id], onDelete: Cascade)
  member        WorkspaceMember @relation(fields: [workspaceId, userId], references: [workspaceId, userId], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([workspaceId, userId])
  @@map("project_members")
}

model ProjectStatus {
  id        String             @id @default(cuid())
  projectId String
  name      String             @db.VarChar(80)
  category  TaskStatusCategory
  sortOrder Int
  color     String?            @db.VarChar(20)
  createdAt DateTime           @default(now())
  project   Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  tasks     Task[]

  @@unique([projectId, id])
  @@unique([projectId, name])
  @@unique([projectId, sortOrder])
  @@map("project_statuses")
}

model Task {
  id          String        @id @default(cuid())
  workspaceId String
  projectId   String
  statusId    String
  number      Int
  title       String        @db.VarChar(250)
  description String?       @db.Text
  priority    TaskPriority  @default(MEDIUM)
  reporterId  String
  assigneeId  String?
  startDate   DateTime?
  dueDate     DateTime?
  sortKey     Decimal       @default(0) @db.Decimal(30, 15)
  version     Int           @default(1)
  completedAt DateTime?
  archivedAt  DateTime?
  deletedAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  workspace   Workspace     @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  project     Project       @relation(fields: [workspaceId, projectId], references: [workspaceId, id])
  status      ProjectStatus @relation(fields: [projectId, statusId], references: [projectId, id])
  reporter    User          @relation("TaskReporter", fields: [reporterId], references: [id])
  assignee    User?         @relation("TaskAssignee", fields: [assigneeId], references: [id])
  comments    TaskComment[]
  activities  TaskActivity[]

  @@unique([workspaceId, id])
  @@unique([projectId, number])
  @@index([projectId, statusId, sortKey, id])
  @@index([workspaceId, assigneeId, dueDate])
  @@index([workspaceId, updatedAt, id])
  @@map("tasks")
}

model TaskComment {
  id          String    @id @default(cuid())
  workspaceId String
  taskId      String
  authorId    String
  content     String    @db.Text
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  task        Task      @relation(fields: [workspaceId, taskId], references: [workspaceId, id], onDelete: Cascade)
  author      User      @relation("CommentAuthor", fields: [authorId], references: [id])

  @@index([taskId, createdAt, id])
  @@map("task_comments")
}

model TaskActivity {
  id          String    @id @default(cuid())
  workspaceId String
  taskId      String
  actorId     String?
  action      String    @db.VarChar(100)
  change      Json
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  task        Task      @relation(fields: [workspaceId, taskId], references: [workspaceId, id], onDelete: Cascade)
  actor       User?     @relation("ActivityActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([taskId, createdAt, id])
  @@map("task_activities")
}

model AuditLog {
  id          String    @id @default(cuid())
  workspaceId String
  actorId     String?
  action      String    @db.VarChar(100)
  targetType  String    @db.VarChar(80)
  targetId    String    @db.VarChar(100)
  requestId   String?   @db.VarChar(100)
  details     Json
  createdAt   DateTime  @default(now())
  workspace   Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  actor       User?     @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([workspaceId, createdAt, id])
  @@index([workspaceId, targetType, targetId])
  @@map("audit_logs")
}
```

**Model notes:**

- `User.emailVerifiedAt` harus terisi sebelum akun menerima undangan dengan email tersebut; seeded demo accounts dapat verified secara eksplisit. Tambahkan verification token model saat mengimplementasikan self-service verification.
- `WorkspaceRole.OWNER` menjadi **sumber kebenaran kepemilikan**; tidak ada duplikasi owner ID di tabel Workspace. Tambahkan unique partial index SQL di §6.5 untuk maksimum satu owner.
- `ProjectMember` mengaitkan user ke `WorkspaceMember`, menjamin anggota project berasal dari workspace yang sama (FK komposit).
- `Task.status` dan `Task.project` menggunakan composite FK untuk mencegah task memakai status dari project lain. Tetap validasi ulang saat mutasi.
- `Task.sortKey` menggunakan tipe `Decimal`; serialisasi ke JSON berbentuk string bila perlu, bukan float untuk logika ranking.
- `TaskActivity` untuk feed per task; `AuditLog` untuk aksi keamanan/manajemen workspace. Satu aksi bisa menghasilkan keduanya.
- `onDelete: Cascade` mengilustrasikan integritas relasi saat **hard delete administratif**. Penghapusan tenant produksi memerlukan kebijakan export/retention serta job khusus; jangan menyajikan `DELETE workspace` langsung sebagai operasi biasa.
- Tidak ada `@@unique([workspaceId, role])` pada workspace member karena role lainnya boleh dimiliki banyak orang. Owner tunggal diproteksi dengan partial unique SQL.
- `@@unique([workspaceId,id])` yang tampak redundant disediakan agar composite foreign key dapat merujuk pasangan tersebut.

### 6.4 Prisma ORM v7 config (pinned example)

Pada Prisma v7, connection URL berada di `prisma.config.ts`, bukan dalam blok datasource schema.

```ts
// apps/api/prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
```

Contoh generator `provider = "prisma-client"` menghasilkan client ke folder output dan di Prisma v7 memerlukan PostgreSQL driver adapter pada runtime. Konfigurasi adapter, modul ESM, dan migration CLI **wajib** mengikuti versi paket yang dipin di lockfile. **Jangan mencampur snippet Prisma v6 (`url = env(...)` di schema) dengan v7**. Referensi: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction dan https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference.

### 6.5 SQL migration tambahan

Constraint tertentu perlu ditulis dalam SQL migration terkontrol setelah Prisma membuat migrasi awal:

```sql
-- Pastikan tepat maksimum satu OWNER per workspace.
CREATE UNIQUE INDEX workspace_members_one_owner
ON workspace_members ("workspaceId")
WHERE role = 'OWNER';

-- Defense-in-depth: email dan slug telah dinormalisasi sebelum insert.
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase
  CHECK ("emailNormalized" = lower("emailNormalized"));

ALTER TABLE workspaces
  ADD CONSTRAINT workspaces_slug_lowercase
  CHECK (slug = lower(slug));

ALTER TABLE tasks
  ADD CONSTRAINT tasks_date_order
  CHECK ("startDate" IS NULL OR "dueDate" IS NULL OR "dueDate" >= "startDate");

ALTER TABLE tasks
  ADD CONSTRAINT tasks_version_positive CHECK (version >= 1);

ALTER TABLE projects
  ADD CONSTRAINT projects_next_task_number_positive
  CHECK ("nextTaskNumber" >= 1);
```

Prisma menggunakan camelCase SQL column names pada field yang tidak memakai `@map`; karena itu SQL di atas mengutip identifier. **Uji di test database kosong**. Jika semua kolom dipetakan ke snake_case lewat `@map`, SQL harus disesuaikan. Untuk check constraint yang sama pada invitation email dan dates di project, tambahkan migration terpisah ketika fitur relevan.

**Penting:** partial unique index hanya membatasi _maksimum_ satu owner; aplikasi harus menjamin _minimum_ satu owner setelah create/transfer dan melarang delete/demotion owner terakhir.

### 6.6 Migration plan

1. Buat initial schema dan jalankan `pnpm prisma validate` di `apps/api`.
2. Jalankan `pnpm prisma migrate dev --name init_core` pada DB lokal kosong.
3. Tambahkan partial index dan check constraints di migration SQL lanjutan; jalankan test migrasi dari DB kosong.
4. Seed akun, 2 workspaces, project public/private, 4 statuses/project, dan 10–30 tasks.
5. CI menjalankan `migrate deploy` pada DB sementara sebelum integration/e2e tests.
6. Production: backup/restore smoke test dan `migrate deploy` sebagai deployment job serial; **jangan** memakai `db push` di production.
7. Feature P1 dipindah melalui migrasi forward-only yang disertai rollback prosedural bila schema tidak reversibel.

### 6.7 P1/P2 models (belum masuk contoh skema P0)

| Model                                  | Kolom / unique penting                                                               | Catatan                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| `OutboxEvent`                          | id, workspaceId, eventType, aggregateId, payload, availableAt, attempts, publishedAt | Atomic write bersama domain mutation      |
| `Notification`                         | id, workspaceId, userId, eventId, type, payload, readAt; unique(userId,eventId,type) | Cross-tenant safe target                  |
| `NotificationPreference`               | userId, channel, category, enabled                                                   | Jangan kirim isi task ke guest tanpa izin |
| `Attachment`                           | id, workspaceId, taskId, storageKey, mimeType, size, scanStatus                      | Private bucket + signed download          |
| `TaskDependency`                       | workspaceId, sourceTaskId, targetTaskId, relation                                    | Cycle detection, same workspace           |
| `TaskLabel`, `Label`                   | unique(taskId,labelId), scoped workspace                                             | Label scope validation                    |
| `AutomationRule`, `AutomationRun`      | ruleId, trigger, condition, action, runKey unique                                    | Idempotent execution                      |
| `Subscription`, `Plan`, `UsageCounter` | provider ref unique, quota fields                                                    | P2 sandbox first                          |

---

## 7. REST API contract

### 7.1 Konvensi global

- Prefix `/api/v1`; JSON `camelCase`; content-type `application/json`.
- Date-time ISO 8601 (`2026-11-20T09:00:00.000Z`).
- Request ID di middleware, `X-Request-Id` pada response.
- Session cookies pada request; CSRF header untuk seluruh unsafe HTTP methods.
- Semua routes protected kecuali auth/register/login dan endpoint public yang ditandai.
- Scope tenant diambil dari path + authorization lookup, **bukan** `workspaceId` yang dipercaya dari body.
- `GET` list menggunakan `limit` default 25, maksimum 100, `cursor` opaque dan `sort` allowlist.
- `PATCH` task dan `POST reorder` menggunakan `If-Match` precondition header.
- `ETag` response task berbentuk `"<version>"`; **bukan HTTP content checksum**, hanya concurrency validator yang secara konsisten ditangani API.
- Error body menggunakan `application/problem+json` dengan `code` dan `requestId`.
- Swagger UI boleh dibuka untuk demo tetapi endpoint mutasi tetap membutuhkan auth; disabled/secured untuk production jika diperlukan.

#### HTTP status

| Status      | Arti                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------- |
| 200/201/204 | Berhasil; 204 tidak punya body                                                                 |
| 400         | Invalid input/format atau business precondition non-version                                    |
| 401         | Tidak login / expired session                                                                  |
| 403         | Login, tetapi aksi dilarang untuk resource yang memang diketahui aksesnya                      |
| 404         | Resource tidak ada atau disembunyikan untuk menghindari enumeration                            |
| 409         | Unique conflict, invalid state transition, duplicate invite, rank retry exhausted              |
| 412         | `If-Match` tidak sesuai current `version`                                                      |
| 422         | Valid secara sintaks, tetapi gagal validasi domain yang terperinci (opsional; pilih konsisten) |
| 428         | Endpoint memerlukan `If-Match` tetapi header tidak ada                                         |
| 429         | Rate limited                                                                                   |
| 500         | Unexpected error; tidak mengekspos detail internal                                             |

#### Contoh error response

```json
{
  "type": "https://taskflow.example/problems/task-version-conflict",
  "title": "Precondition Failed",
  "status": 412,
  "code": "TASK_VERSION_CONFLICT",
  "detail": "Task has changed since you opened it. Refresh and try again.",
  "requestId": "req_01JX..."
}
```

### 7.2 Endpoint P0 lengkap

| Method | Path (setelah `/api/v1`)              | Auth/Policy                            | Success |
| ------ | ------------------------------------- | -------------------------------------- | ------- |
| POST   | `/auth/register`                      | Public + rate limit                    | 201     |
| POST   | `/auth/login`                         | Public + rate limit                    | 200     |
| GET    | `/auth/me`                            | Logged-in user                         | 200     |
| POST   | `/auth/refresh`                       | Valid refresh cookie, CSRF/origin      | 200     |
| POST   | `/auth/logout`                        | Session / idempotent                   | 204     |
| GET    | `/workspaces`                         | Logged-in user                         | 200     |
| POST   | `/workspaces`                         | Logged-in user                         | 201     |
| GET    | `/workspaces/:wid`                    | Workspace member                       | 200     |
| PATCH  | `/workspaces/:wid`                    | OWNER / allowed ADMIN                  | 200     |
| POST   | `/workspaces/:wid/transfer-ownership` | OWNER                                  | 200     |
| GET    | `/workspaces/:wid/members`            | Authorized workspace member            | 200     |
| PATCH  | `/workspaces/:wid/members/:userId`    | OWNER / allowed ADMIN                  | 200     |
| DELETE | `/workspaces/:wid/members/:userId`    | OWNER / allowed ADMIN                  | 204     |
| GET    | `/workspaces/:wid/invitations`        | OWNER / ADMIN                          | 200     |
| POST   | `/workspaces/:wid/invitations`        | OWNER / ADMIN                          | 201     |
| DELETE | `/workspaces/:wid/invitations/:iid`   | OWNER / ADMIN                          | 204     |
| POST   | `/invitations/accept`                 | Verified matching-email user           | 200     |
| GET    | `/workspaces/:wid/projects`           | Membership; result scoped per project  | 200     |
| POST   | `/workspaces/:wid/projects`           | OWNER/ADMIN/policy-allowed MEMBER      | 201     |
| GET    | `/projects/:pid`                      | Project read policy                    | 200     |
| PATCH  | `/projects/:pid`                      | Project manage policy                  | 200     |
| POST   | `/projects/:pid/archive`              | Project manage policy                  | 200     |
| GET    | `/projects/:pid/members`              | Project read policy                    | 200     |
| POST   | `/projects/:pid/members`              | Project manage policy                  | 201     |
| DELETE | `/projects/:pid/members/:userId`      | Project manage policy                  | 204     |
| GET    | `/projects/:pid/statuses`             | Project read policy                    | 200     |
| GET    | `/projects/:pid/tasks`                | Project read policy                    | 200     |
| POST   | `/projects/:pid/tasks`                | Task create policy                     | 201     |
| GET    | `/tasks/:tid`                         | Task read policy                       | 200     |
| PATCH  | `/tasks/:tid`                         | Task write policy + `If-Match`         | 200     |
| DELETE | `/tasks/:tid`                         | Task delete policy                     | 204     |
| POST   | `/tasks/:tid/reorder`                 | Task write policy + `If-Match`         | 200     |
| GET    | `/tasks/:tid/comments`                | Task read policy                       | 200     |
| POST   | `/tasks/:tid/comments`                | Comment create policy                  | 201     |
| PATCH  | `/comments/:cid`                      | Own comment/project policy             | 200     |
| DELETE | `/comments/:cid`                      | Own comment/project policy             | 204     |
| GET    | `/tasks/:tid/activities`              | Task read policy                       | 200     |
| GET    | `/me/tasks`                           | Logged-in user, authorized memberships | 200     |
| GET    | `/projects/:pid/summary`              | Project read policy                    | 200     |
| GET    | `/workspaces/:wid/audit-logs`         | OWNER/ADMIN                            | 200     |
| GET    | `/health/live`                        | Infra-safe public                      | 200     |
| GET    | `/health/ready`                       | Internal monitored                     | 200/503 |

**Catatan:** `:wid`, `:pid`, `:tid`, `:cid`, `:iid` adalah CUID string, bukan angka dan tidak memberikan otorisasi sendiri.

### 7.3 Create workspace

```http
POST /api/v1/workspaces
Content-Type: application/json
X-CSRF-Token: ...

{"name":"Acme Engineering","slug":"acme-engineering"}
```

```http
HTTP/1.1 201 Created
Location: /api/v1/workspaces/clw_workspace_123
Content-Type: application/json

{
  "id": "clw_workspace_123",
  "name": "Acme Engineering",
  "slug": "acme-engineering",
  "myRole": "OWNER",
  "createdAt": "2026-11-20T09:00:00.000Z"
}
```

Atomic transaction: insert Workspace → insert WorkspaceMember OWNER → insert AuditLog `WORKSPACE_CREATED`. Slug sudah lowercased dan dicek DB unique. Domain event P1 ditambahkan ke transaksi yang sama.

### 7.4 Send and accept invitation

**Invite**

```http
POST /api/v1/workspaces/:wid/invitations
Content-Type: application/json

{"email":"teammate@example.com","role":"MEMBER"}
```

Response P0 menyertakan **metadata saja**, bukan raw invitation token untuk logged-in UI. Pada local/dev bisa memakai fake mail adapter untuk mendapatkan link undangan; production email delivery diaktifkan ketika provider siap. Hindari mengirim raw token ke logging/telemetry.

**Accept**

```http
POST /api/v1/invitations/accept
Content-Type: application/json

{"token":"invite-raw-secret"}
```

Keberhasilan 200:

```json
{
  "workspace": { "id": "clw_workspace_123", "slug": "acme-engineering" },
  "membership": { "role": "MEMBER" }
}
```

Token di-hash dan dicari pada DB, email current verified user harus cocok dengan `emailNormalized` invitation. P0 perlu mekanisme verifikasi alamat email sebelum invitation acceptance ditandai siap production; untuk demo seeded users dapat ditandai verified secara eksplisit. Endpoint mengembalikan 409 untuk invitation revoked/expired/used; jangan mempublikasikan apakah email lain terdaftar.

### 7.5 Create project and default statuses

```json
{
  "key": "ENG",
  "name": "Platform Rebuild",
  "description": "Q1 improvements",
  "visibility": "PRIVATE"
}
```

Dalam satu transaction: create Project (`nextTaskNumber=1`) → create status rows dengan sortOrder `1000/2000/3000/4000`, category `BACKLOG/TODO/IN_PROGRESS/DONE` → create ProjectMember for creator (MANAGER) → AuditLog. Key `ENG` harus uppercase `[A-Z0-9]{2,12}` dan unik per workspace.

### 7.6 Create task

```http
POST /api/v1/projects/:pid/tasks
Content-Type: application/json

{
  "title": "Implement invitation acceptance",
  "description": "Validate email ownership and token expiry.",
  "priority": "HIGH",
  "statusId": "clw_status_01",
  "assigneeId": "clw_user_02",
  "dueDate": "2026-12-15T17:00:00.000Z"
}
```

```http
HTTP/1.1 201 Created
ETag: "1"
Content-Type: application/json

{
  "id": "clw_task_101",
  "key": "ENG-41",
  "number": 41,
  "title": "Implement invitation acceptance",
  "projectId": "clw_project_01",
  "statusId": "clw_status_01",
  "priority": "HIGH",
  "assigneeId": "clw_user_02",
  "version": 1,
  "sortKey": "2048.000000000000000",
  "dueDate": "2026-12-15T17:00:00.000Z"
}
```

Server mengambil project key untuk menurunkan `key`. Jangan menyimpan task key yang bisa drift jika project key suatu hari berubah. Untuk P0, project key immutable setelah create.

### 7.7 Update task with preconditions

```http
PATCH /api/v1/tasks/:tid
If-Match: "13"
Content-Type: application/json

{"title":"Implement secure invitation acceptance","priority":"URGENT"}
```

- Mismatch versi → `412` + code `TASK_VERSION_CONFLICT`.
- Tidak ada header → `428` + code `PRECONDITION_REQUIRED`.
- Sukses → `200` + `ETag: "14"`, sanitized Task DTO dengan `version=14`.
- Tidak boleh mengubah `workspaceId`, `projectId`, `number`, `reporterId`, atau `version` langsung dari payload.
- Semua field yang berubah dicatat dengan delta whitelist: `{ field: "priority", from: "HIGH", to: "URGENT" }`.

### 7.8 Reorder Kanban

```http
POST /api/v1/tasks/:tid/reorder
If-Match: "14"
Content-Type: application/json

{
  "destinationStatusId": "clw_status_in_progress",
  "afterTaskId": "clw_task_088",
  "beforeTaskId": "clw_task_091"
}
```

`afterTaskId` dan `beforeTaskId` boleh null untuk penempatan di awal/akhir; jika keduanya terisi, keduanya harus adjacent pada view kanonis untuk status tujuan, dan milik project yang sama. Server menghitung `sortKey` baru. Response `200` mencakup `statusId`, `sortKey` string, `version` dan `boardRevision` opsional (P1). Jika tidak ada gap ranking, lakukan rebalance terkunci dan retry transaction secara terbatas.

### 7.9 Paginated list

```http
GET /api/v1/projects/:pid/tasks?statusId=clw_status_01&limit=25&sort=updatedAt_desc
```

```json
{
  "data": [{ "id": "clw_task_01", "title": "API review", "version": 7 }],
  "pageInfo": {
    "nextCursor": "opaque-base64url-token",
    "hasNextPage": true
  }
}
```

Cursor mengandung nilai key sort + `id` untuk tiebreaker; disign atau diverifikasi agar parameter yang rusak/manipulatif ditolak. Query whitelist, index, dan stable ordering wajib. Tidak ada record private project yang bocor via aggregation/count response.

### 7.10 OpenAPI conventions

- DTO `class-validator` + `class-transformer` di NestJS, `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Response schema (`TaskDto`, `WorkspaceDto`, `ProjectDto`) didefinisikan eksplisit; serialized dates dan Decimal konsisten.
- Swagger `@ApiCookieAuth`/security scheme, `@ApiResponse`, params, tags, paginated DTO, problem responses.
- CI melakukan OpenAPI schema generation dan minimal schema lint/diff untuk breaking changes.
- Frontend API client typed dari OpenAPI agar request/response tidak drift.

---

## 8. Critical domain algorithms

### 8.1 Task number allocation (concurrency-safe)

```ts
// Pseudocode: run inside Prisma interactive transaction.
const result = await prisma.$transaction(async (tx) => {
  const project = await tx.project.update({
    where: { workspaceId_id: { workspaceId, id: projectId } },
    data: { nextTaskNumber: { increment: 1 } },
    select: { nextTaskNumber: true, key: true },
  });

  const number = project.nextTaskNumber - 1;
  const task = await tx.task.create({
    data: {
      workspaceId,
      projectId,
      number,
      statusId,
      title: dto.title,
      reporterId: actorId,
      assigneeId: validatedAssigneeId,
      sortKey: nextRank,
    },
  });

  await tx.taskActivity.create({
    data: {
      workspaceId,
      taskId: task.id,
      actorId,
      action: "CREATED",
      change: {},
    },
  });
  return { task, key: `${project.key}-${number}` };
});
```

**Wajib sebelum transaction:** policy project/actor dan target status divalidasi. Di dalam transaction, periksa ulang kondisi yang dapat berubah (project archived, assignee project access, status masih valid), atau lakukan guarded mutation; check di luar transaction saja tidak cukup untuk race-sensitive operations. Constraint `(projectId, number)` merupakan defense-in-depth.

### 8.2 Optimistic concurrency update

```text
1. Validasi auth, CSRF, DTO dan role.
2. Load scoped resource dan expect version dari If-Match.
3. Di dalam DB transaction:
   a. Atomic update task dengan WHERE id + workspaceId + version + deletedAt IS NULL.
   b. Jika updated rows = 0: lakukan scoped recheck → 404 atau 412.
   c. Tulis TaskActivity dan AuditLog (bila action sensitif).
   d. Tulis OutboxEvent (P1) dalam transaksi yang sama.
4. Return task updated + ETag version baru.
5. UI optimistic cache commit; bila 412, rollback dan refetch lalu tampilkan conflict dialog.
```

**Jangan** memakai `findUnique`, membandingkan versi di aplikasi, lalu `update` tanpa compare-and-swap: ada TOCTOU race.

### 8.3 Board ranking

- P0: `Decimal(30,15)` sebagai sortable rank; initial ranks dengan jarak `1024`.
- Insert di tengah: `(rankLeft + rankRight) / 2` menggunakan Prisma.Decimal atau library decimal yang benar.
- Insert sebelum awal: `rankRight - 1024`; setelah akhir: `rankLeft + 1024`.
- Jika rank terlalu rapat, lock/mutex per status melalui DB transaction, rebalance berurutan (`1024,2048,...`), increment version task yang dipindah bila perlu, dan publish event board invalidation P1.
- Sorting server: `status.sortOrder`, lalu `task.sortKey`, lalu `task.id` untuk tie-break.
- Pada dua simultaneous reorders, gunakan serializable transaction + limited retry. Satu client bisa menerima 412/409 dan harus refetch; jangan silently overwrite posisi.
- Status asal dan status tujuan wajib milik **project yang sama**. Mutasi tidak boleh memakai neighbor task dari tenant/project lain.

Untuk skala kecil ini cukup. P1 bisa dievaluasi migrasi ke LexoRank bila profil beban menunjukkan kebutuhan.

### 8.4 Invitation acceptance

```mermaid
sequenceDiagram
    participant U as User
    participant API as NestJS
    participant DB as PostgreSQL
    U->>API: POST /invitations/accept {token}
    API->>DB: Hash token and select invitation
    DB-->>API: Pending, matching email, valid TTL?
    API->>DB: Transaction: guard invite PENDING + TTL
    API->>DB: Insert workspace member (unique workspaceId,userId)
    API->>DB: Mark invite ACCEPTED, actorId/time + AuditLog
    DB-->>API: Commit
    API-->>U: 200 Workspace + membership
```

- Acquire invite row lock or guarded atomic state transition; two requests tidak boleh sama-sama consume token.
- Verifikasi user memiliki alamat email yang terbukti sama dengan invited email. Token bukan bukti kepemilikan akun.
- Jika sudah member, response disesuaikan kebijakan idempotency tanpa menciptakan duplicate/role escalation.
- Revoked, expired, already-used → 409 (atau 410 pada expired jika dipilih sebagai contract final); berikan error code eksplisit dan konsisten.
- Saat revoke/role change, audit dan invalidasi akses WebSocket (P1).

### 8.5 Membership revocation

Hapus WorkspaceMember / ProjectMember di transaksi; composite FK menghapus ProjectMember yang bergantung saat workspace member dihapus. `Task.assigneeId` boleh tetap untuk histori, **tetapi** task yang di-assign kepada user yang keluar tidak otomatis memberikan hak akses. UI menampilkan status non-member pada assignee lama, dan assignment berikutnya harus menolak user non-member. Untuk workflow operasional P1, tambahkan “unassign on removal” secara eksplisit jika dibutuhkan.

### 8.6 Completion timestamp

Ketika target `ProjectStatus.category == DONE` dan sebelumnya bukan DONE, set `completedAt=now()`. Saat keluar dari DONE, reset `completedAt=null` (riwayat penyelesaian tetap ada di TaskActivity). Tidak menyamakan `CANCELED` dengan DONE untuk angka completion.

### 8.7 Audit logging

- Tulis audit dalam domain transaction yang sama dengan perubahan role, invitation, ownership, project access, dan delete/archive.
- Payload whitelist, contoh `{fromRole: 'MEMBER', toRole: 'ADMIN'}`; jangan simpan invitation token, password hash, access token, file object signed URL.
- Hanya OWNER/ADMIN melihat workspace audit (kecuali metadata private project yang dirahasiakan menurut policy).
- Karena workspace owner/admin dapat melihat audit, jangan memasukkan judul atau isi task private ke audit summary.

---

## 9. Frontend technical design — Next.js

### 9.1 Route taxonomy

| Route                                                         | Rendering / UX                                    |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `/login`, `/register`                                         | Public form; validation, error, rate-limit hints  |
| `/w/[workspaceSlug]`                                          | Workspace overview, authorized SSR data           |
| `/w/[workspaceSlug]/projects`                                 | Project list; only visible projects               |
| `/w/[workspaceSlug]/projects/[projectKey]`                    | Project board/list tabs + Kanban client component |
| `/w/[workspaceSlug]/projects/[projectKey]/tasks/[taskNumber]` | Task detail dialog/page, comments & activity      |
| `/w/[workspaceSlug]/my-tasks`                                 | Aggregated assigned tasks, workspace scoped       |
| `/w/[workspaceSlug]/settings/members`                         | Invitations, members and role settings            |
| `/w/[workspaceSlug]/settings/audit`                           | Authorized audit search                           |

**Server Components** untuk shell, initial authenticated data, metadata; **Client Components** untuk drag-and-drop, forms, modals, filters, inline editing, realtime cache. Next.js route protection hanyalah UX layer—NestJS tetap harus memvalidasi semua resource.

### 9.2 Suggested feature package layout

```text
src/features/tasks/
├── api/{get-tasks,create-task,update-task,reorder-task}.ts
├── components/{task-card,task-detail,task-form}.tsx
├── hooks/{use-tasks,use-update-task,use-reorder-task}.ts
├── schemas/task.schema.ts
├── utils/{task-query-keys,task-formatters}.ts
└── types.ts

src/features/boards/
├── components/{board,board-column,sortable-task-card}.tsx
├── hooks/use-board.ts
└── utils/{board-reducer,optimistic-mutations}.ts
```

### 9.3 Query strategy

- TanStack Query query keys selalu memuat workspace dan project: `['workspace', wid, 'project', pid, 'tasks', filters]`.
- Setelah workspace switch, hilangkan/invalidasi cache tenant-sensitive yang tidak lagi relevan, terutama pada session/account changes.
- Hanya optimistic update untuk operasi yang dapat di-rollback dengan aman (task title/status/reorder); undo bila 412/403/network failure.
- Request server-side untuk auth user selalu dinamis, tidak public-cache; hindari SSR caching lintas user.
- Suspense/loading/empty/error state tersedia pada setiap board, dialog, list, dan dashboard.
- URL search params menyimpan filter/sort sehingga dapat dibagikan.

### 9.4 Kanban interaction

1. DnD library yang mendukung keyboard dan screen reader (mis. dnd-kit jika kompatibel dengan versi yang dipakai).
2. On drag start: simpan snapshot lama.
3. On drag end: optimistically move card dalam state/cached query.
4. Kirim reorder dengan last-known `version` dan neighbor IDs.
5. Sukses: replace status/rank/version dari server, invalidasi board summary.
6. 412/409: rollback; refetch; tampilkan non-destructive conflict toast/dialog.
7. Unauthorized: rollback dan redirect/access-denied bila perlu.
8. Keyboard alternative: menu `Move to status...` agar tidak bergantung pada pointer drag.

### 9.5 Form and accessibility

Zod pada client dan server DTO validation dua lapis; validasi server tetap sumber akhir. Form harus punya label, pesan error yang terhubung, focus management dialog, aria-live untuk operasi, skeleton secukupnya, dan kontras warna yang layak. P0 desktop-first tetapi form dan board tetap usable pada mobile.

### 9.6 Next.js auth boundary

Server-rendered data dibaca melalui same-origin/internal API dengan session cookie yang diteruskan secara aman. Jangan mengimpor `PrismaClient` di frontend. Middleware/Proxy route boleh memeriksa keberadaan token untuk navigasi cepat, tetapi bukan final auth/authorization. Jangan membocorkan token/sensitive session ke browser props maupun telemetry.

---

## 10. Advanced real-time collaboration — P1

### 10.1 Connection and authorization

Socket.IO gateway berjalan di NestJS API (atau gateway terpisah saat load meningkat). Browser menghubungkan ke `/socket.io` dengan credential cookie same-origin. Handshake memverifikasi session, origin, dan allowed transport; **join room** memanggil ProjectPolicy yang sama dengan REST.

Room naming hanya internal:

- `workspace:{workspaceId}:project:{projectId}` untuk task activity.
- `user:{userId}` untuk notification pribadi.
- Workspace-wide room **tidak** boleh menyiarkan detail private project kepada seluruh anggota.

Socket connection harus mengecek permission saat subscribe dan saat event aksi, tidak mengandalkan authorization hanya saat handshake. Pada removal member/session revoke, emit `membership:revoked`, kick socket dari affected rooms, dan enforce periodic session revalidation/short socket TTL sebagai fallback.

### 10.2 Event contract

| Event                 | Arah            | Payload minimum                                     |
| --------------------- | --------------- | --------------------------------------------------- |
| `project:subscribe`   | Client → Server | `{projectId}`                                       |
| `project:unsubscribe` | Client → Server | `{projectId}`                                       |
| `task:created`        | Server → Client | `{eventId,projectId,taskId,version}`                |
| `task:updated`        | Server → Client | `{eventId,projectId,taskId,version}`                |
| `task:reordered`      | Server → Client | `{eventId,projectId,taskId,version,boardRevision?}` |
| `task:archived`       | Server → Client | `{eventId,projectId,taskId}`                        |
| `comment:created`     | Server → Client | `{eventId,projectId,taskId,commentId}`              |
| `membership:revoked`  | Server → Client | `{workspaceId,projectId?}`                          |
| `notification:new`    | Server → Client | `{notificationId}`                                  |

**Payload sengaja minimal**, supaya penerima melakukan authorized GET dengan revalidation, dan event tidak membocorkan isi private task. `eventId` digunakan untuk dedupe dan memproses event at-least-once. Tidak ada jaminan urutan global antar-room; client membandingkan `version` resource, mengabaikan event yang lebih tua, dan refetch setelah reconnect.

### 10.3 Reconnect and multi-instance

- Socket client melakukan reconnect backoff dan re-subscribe hanya setelah auth berhasil.
- Setelah reconnect, invalidasi semua project/task queries terkait; WS bukan durable event log.
- Multi-instance gateway menggunakan Redis adapter untuk routing antarnode; Redis Pub/Sub tidak dipakai sebagai riwayat event.
- Saat network terputus, REST mutation tetap berfungsi; WS hanya lapisan sinkronisasi tampilan.
- Load test 2 browsers/2 sessions/2 workspaces, cek tidak ada cross-workspace broadcasts.

---

## 11. Background jobs, transactional outbox, notifications — P1

### 11.1 Mengapa outbox?

Tanpa outbox, alur `UPDATE task` → `publish WebSocket/queue` dapat kehilangan event jika process crash setelah DB commit tetapi sebelum publish. Outbox menyimpan perubahan domain dan event dalam satu transaksi, kemudian dispatcher yang terpisah mengirim event ke queue. Pengiriman diasumsikan **at least once**; consumer harus idempotent.

```mermaid
sequenceDiagram
    participant API as NestJS API
    participant PG as PostgreSQL
    participant D as Outbox Dispatcher
    participant Q as BullMQ
    participant W as Worker
    API->>PG: Transaction: UPDATE Task + INSERT Activity + INSERT Outbox
    PG-->>API: COMMIT
    API-->>API: Return response
    D->>PG: Claim pending outbox batch
    PG-->>D: Claimed events
    D->>Q: Add job(eventId), deduplicated
    Q-->>D: Enqueued
    D->>PG: Mark published (retry on failure)
    Q->>W: Deliver job (at least once)
    W->>PG: Process idempotently / store Notification
    W-->>Q: Acknowledge
```

### 11.2 Outbox design

```text
outbox_events
  id              string PK / eventId
  workspace_id    string
  aggregate_type  string
  aggregate_id    string
  event_type      string
  payload         jsonb (allowlisted)
  occurred_at     timestamptz
  available_at    timestamptz
  attempts        int
  claimed_until   timestamptz?
  published_at    timestamptz?
  last_error      text?
```

- Dispatcher claim menggunakan `FOR UPDATE SKIP LOCKED` atau lease semantics dan mengambil batch terbatas.
- Mem-publish ke BullMQ dengan `jobId=eventId`; jangan menganggap deduplication window sama dengan exactly-once.
- Jika dispatcher crash setelah enqueue sebelum menandai published, event dapat dikirim ulang; worker wajib dedupe.
- Jika queue unavailable, event tetap pending/retry; metrik backlog/outbox oldest age menunjukkan masalah.
- Worker melakukan dedupe dengan unique `(recipientId,eventId,notificationType)` pada Notification serta idempotency untuk integrasi eksternal.

### 11.3 Queues

| Queue           | Event/job                               | Retry policy awal                     | Idempotency                    |
| --------------- | --------------------------------------- | ------------------------------------- | ------------------------------ |
| `email`         | Invite, assignment, due reminder        | Exponential backoff, bounded attempts | template + recipient + eventId |
| `notifications` | In-app mention/assignment               | Exponential backoff                   | unique notification key        |
| `events`        | Fan-out websocket invalidation          | Short retry, minimal payload          | eventId + version              |
| `maintenance`   | Cleanup expired invites, stale sessions | Scheduled                             | per-entity state transition    |

Set failed-job retention dan dashboard metrik untuk retry/backlog. P0 **tidak wajib** membuat queue sampai core flows lulus test dan deployed.

---

## 12. Security design and threat model

### 12.1 Threats and controls

| Risiko               | Attack / failure scenario                   | Mitigasi                                         | Test                             |
| -------------------- | ------------------------------------------- | ------------------------------------------------ | -------------------------------- |
| BOLA/IDOR            | User A menebak task ID dari tenant B        | Scoped policy + tenant-aware query               | Cross-workspace 404              |
| Private project leak | Admin bukan member membaca task private     | Explicit membership requirement                  | Deny admin private               |
| Role escalation      | Admin promote dirinya menjadi OWNER         | Allowed transition matrix                        | 403/409                          |
| CSRF                 | Browser mengirim mutasi lewat site lain     | SameSite, Origin validation, CSRF token          | Missing/mismatched token denied  |
| XSS                  | Markdown/comment membawa HTML/script        | Safe renderer/sanitize, CSP                      | Malicious payload rendered inert |
| Token theft          | Log berisi session/invite raw token         | Hash tokens, redaction, HttpOnly                 | Log scan + unit test             |
| Replay refresh       | Refresh token bekas dipakai ulang           | UsedAt + family revocation                       | Reuse revokes session            |
| Lost updates         | Dua client mengubah title task yang sama    | If-Match/version CAS                             | One success, one 412             |
| Unauthorized WS      | User subscribe project private              | Handshake + join policy + revoke                 | Subscription denied              |
| Malicious file P1    | Executable/object download dari tenant lain | MIME allowlist, scan, private bucket, signed URL | Cross-tenant download denied     |
| Resource abuse       | Brute force/login spam/huge page            | Rate limit, payload limits, cursor cap           | 429, 413                         |
| Mass assignment      | Client mengirim role/version/workspaceId    | Strict DTO whitelist                             | 400 or ignored explicitly        |
| Data race            | Two invitation accepts/owner transfers      | Tx lock + unique constraints                     | Concurrency integration test     |

### 12.2 Data classification

- **Secret:** password hash, refresh-token hash, signing keys, invite/reset raw tokens. Never log/export to client.
- **Sensitive tenant data:** project names/desc, task titles/desc/comments, attachments. Returned only after policy checks.
- **Operational metadata:** requestId, latency, error code, queue age, sanitized action fields. Use for observability.
- **PII:** email, name, avatar URL. Limit storage, avoid copying into audit/queue payload unnecessarily.

### 12.3 Operational safeguards

- Validate env on startup using schema validation.
- Apply Helmet/security headers, CSP appropriate to Next.js/shadcn usage, trusted proxy configuration.
- Enforce HTTPS/TLS in production; secure cookie flags.
- Restrict DB user permissions and network connectivity; no public PostgreSQL access.
- DB backup policy and restore test; encrypted credentials/secrets in deployment platform.
- Do not expose metrics, BullMQ dashboard, or health details publicly without access controls.
- API routes use row-level resource policy; PostgreSQL RLS optional as P2 defense-in-depth only after pooling context tests.
- Avoid returning `passwordHash`, tokenHash, or invitation raw token in DTO serialization.
- S3-compatible attachments P1: random object keys, short-lived signed URLs, size/type limits and scan as appropriate.

---

## 13. Testing strategy and acceptance test matrix

### 13.1 Test layers

| Layer       | Tools                                     | Scope                                                         | Release gate  |
| ----------- | ----------------------------------------- | ------------------------------------------------------------- | ------------- |
| Unit        | Jest                                      | Authorization policy, mapper, rank algorithm, validation      | P0            |
| Integration | Jest + PostgreSQL container / isolated DB | Prisma composite FK, transactions, uniqueness, token rotation | P0            |
| E2E API     | Supertest                                 | Auth, workspace, project, task contracts                      | P0            |
| E2E UI      | Playwright                                | Onboarding, drag-drop/keyboard move, permissions              | P0 core paths |
| Contract    | OpenAPI generation + client typecheck     | Typed frontend-backend compatibility                          | P0            |
| Load        | k6 or autocannon                          | task listings, board query, fan-out WS P1                     | P1            |
| Security    | negative test suite + dependency scanning | BOLA, CSRF, XSS, session reuse                                | P0            |

### 13.2 Must-pass test cases

| ID       | Scenario                                                      | Expected                            |
| -------- | ------------------------------------------------------------- | ----------------------------------- |
| AUTH-01  | Login valid/invalid                                           | 200 cookie / 401 generic            |
| AUTH-02  | Logout then refresh                                           | Revoked refresh rejected            |
| AUTH-03  | Previously used refresh token replay                          | Family/session revoked              |
| TEN-01   | User A reads workspace B by CUID                              | 404                                 |
| TEN-02   | Workspace member enumerates private project                   | Project absent from list            |
| TEN-03   | Admin workspace reads private task without project membership | 404                                 |
| TEN-04   | Guest tries task update with VIEWER role                      | 403                                 |
| WS-01    | Two create-workspace requests with same slug                  | One 201, one 409                    |
| WS-02    | Two accepts with same invitation token                        | Exactly one effective membership    |
| WS-03    | Demote/delete last OWNER                                      | Rejected                            |
| WS-04    | Concurrent ownership transfers                                | Exactly one final owner             |
| PROJ-01  | Duplicate project key within tenant                           | 409                                 |
| PROJ-02  | ProjectMember from foreign workspace                          | FK/validation rejects               |
| TASK-01  | Two concurrent creates in same project                        | Unique sequential numbers           |
| TASK-02  | Status from different project                                 | Validation/DB rejects               |
| TASK-03  | Assign user not authorized for project                        | 403 or 422                          |
| TASK-04  | Two PATCH with same If-Match                                  | One success, other 412              |
| TASK-05  | Missing If-Match                                              | 428                                 |
| TASK-06  | Reorder neighbor from another project                         | 400/422                             |
| TASK-07  | Move to DONE then reopen                                      | completedAt set then cleared        |
| TASK-08  | Archived project member mutation                              | Denied                              |
| AUDIT-01 | Role or ownership changed                                     | Audit record in same transaction    |
| UI-01    | Kanban optimistic request fails                               | Rollback + useful error             |
| UI-02    | User switches workspace                                       | Stale sensitive cache not displayed |
| WS-P1    | Revoked user remains connected to room                        | Disconnected/denied                 |
| EVT-P1   | Worker processes event twice                                  | One notification/effect             |

### 13.3 Example test pseudocode — tenant boundary

```ts
it("does not expose a private task to a workspace admin who is not a project member", async () => {
  const privateTask = await fixtures.taskInPrivateProject({
    workspaceId: workspaceA.id,
    ownerId: ownerA.id,
  });
  const admin = await fixtures.workspaceMember(workspaceA.id, "ADMIN");

  const result = await request(app.getHttpServer())
    .get(`/api/v1/tasks/${privateTask.id}`)
    .set("Cookie", await fixtures.cookiesFor(admin));

  expect(result.status).toBe(404);
  expect(JSON.stringify(result.body)).not.toContain(privateTask.title);
});
```

### 13.4 Release quality gates

**P0 gate:** lint, typecheck, production build, Prisma schema validation, migrations on clean DB, unit tests, core integration tests, Playwright smoke, critical authorization matrix, demo seed, API docs, no secrets in repository.

**P1 gate:** reconnect authorization test, outbox retry/duplicate test, queue failure drill, WebSocket cross-tenant isolation, live demo multiple browser sessions.

---

## 14. Performance and reliability targets

Semua metrik di bawah adalah **sasaran pengukuran**, bukan hasil yang sudah diverifikasi.

| Metric                            | Sasaran awal                                   | Cara ukur                     |
| --------------------------------- | ---------------------------------------------- | ----------------------------- |
| GET task detail p95               | < 300 ms at representative low load            | API load test                 |
| GET board p95 (project 500 tasks) | < 700 ms                                       | API load test + query plan    |
| Successful optimistic update UX   | Feedback < 150 ms client-side                  | Browser profiling             |
| Concurrent task creation          | 0 duplicate `(projectId,number)`               | 50–100 parallel requests test |
| Authorization leakage             | 0 cross-workspace/private access in test suite | Negative cases                |
| Failed job recovery P1            | Eventually retried; no lost outbox             | Kill worker/restart drill     |
| Backup/restore                    | Recovery runbook tested                        | Restore to staging            |

### 14.1 Query/index strategy

- Index `workspace_members(userId)` for workspace switch.
- Index `projects(workspaceId, archivedAt, createdAt)` for tenant project list.
- Index `tasks(projectId, statusId, sortKey, id)` for board columns.
- Index `tasks(workspaceId, assigneeId, dueDate)` for My Tasks.
- Index `task_activities(taskId, createdAt, id)` for activity feed.
- Index `audit_logs(workspaceId, createdAt, id)` for audit pagination.

Untuk query list yang kompleks, jalankan `EXPLAIN (ANALYZE, BUFFERS)` dengan seeded data. Hindari N+1; ambil assignee summary/status sekali melalui include/select yang dibatasi. Agregasi dashboard yang mahal bisa di-cache singkat kemudian invalidated berdasarkan versi/task mutation jika memang diperlukan.

### 14.2 Degraded modes

- **Redis down P1:** authenticated REST/task CRUD tetap tersedia; realtime dan notifications dinyatakan temporarily unavailable, outbox tetap menyimpan event.
- **DB down:** readiness fail, jangan menerima mutasi; liveness dapat tetap lulus sebagai sinyal process aktif.
- **Mail provider down:** invitations disimpan, jobs retry; response UI menyatakan email pengiriman masih pending bila status belum dipastikan.
- **WebSocket disconnected:** client tetap dapat mutate via REST dan refetch berkala/ketika reconnect.

---

## 15. Infrastructure and deployment

### 15.1 Local docker-compose topology

```text
Docker Compose (development)
├── postgres: database taskflow_dev
├── redis: optional P1
├── api: NestJS (local process or container)
├── web: Next.js (local process or container)
└── worker: optional P1
```

Gunakan named volumes untuk Postgres, health check, `depends_on` tidak menggantikan retry connection. Redis wajib password bila terekspos di network. Jangan commit `.env` berisi password nyata.

### 15.2 Environment schema

```dotenv
# apps/api/.env.example
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/taskflow_dev
WEB_ORIGIN=http://localhost:3000
JWT_ACCESS_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
JWT_ISSUER=taskflow-api
JWT_AUDIENCE=taskflow-web
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
CSRF_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
RATE_LIMIT_ENABLED=true

# P1
REDIS_URL=redis://localhost:6379
EMAIL_FROM=no-reply@example.com
SMTP_HOST=localhost
SMTP_PORT=1025

# apps/web/.env.example
NEXT_PUBLIC_APP_URL=http://localhost:3000
API_INTERNAL_URL=http://localhost:4000/api/v1
```

**Peringatan:** nilai env contoh bukan credential. Secret asli dibuat melalui secret manager, tidak ditulis di README, source control, atau screenshot. Pertimbangkan apakah `API_INTERNAL_URL` berbeda antara browser dan server; browser cukup mengakses `/api/v1` same-origin, sedangkan SSR dapat memakai URL server-private.

### 15.3 Deployment stages

1. **Development:** local Compose + fast refresh.
2. **Preview:** branch PR, DB/test data terisolasi; jangan menyalin production PII.
3. **Production demo:** Next.js hosting, Node-compatible NestJS service, managed PostgreSQL, Redis/worker baru ketika P1 aktif.
4. Reverse proxy memastikan `/api/v1` dan `/socket.io` memakai origin yang konsisten dan mengekspresikan forwarding headers dengan benar.
5. Migration dieksekusi satu kali lewat release job sebelum aplikasi baru menerima trafik. Rollback aplikasi tidak selalu berarti rollback schema.

### 15.4 CI/CD pipeline

```mermaid
flowchart LR
    A[Pull Request] --> B[Install & cache dependencies]
    B --> C[Lint + typecheck]
    C --> D[Prisma validate & generate]
    D --> E[Unit tests]
    E --> F[DB migrations & integration tests]
    F --> G[Build web + API]
    G --> H[Playwright smoke]
    H --> I[Deploy preview]
    I --> J[Manual review / merge]
    J --> K[Migrate production + deploy]
```

- Lockfile commit wajib; pins untuk major versions Next/Nest/Prisma yang saling cocok.
- Migrasi dan app deploy harus idempotent; track release SHA.
- Tambahkan secret scanning, dependency auditing, dan container vulnerability scanning bila feasible.
- Gunakan manual gate untuk perubahan DB berisiko di production.

### 15.5 Observability

JSON log per request `{requestId,userIdHash?,workspaceId?,route,status,durationMs}`; jangan simpan token dan isi task. Metrics: request count/latency, DB pool usage, 5xx, 401/403 ratio, queue backlog, outbox oldest age, websocket connections, message errors. Traces dapat mengikuti `requestId` dari API ke domain event dan worker; simpan data minimal.

---

## 16. Implementation roadmap and work breakdown

Estimasi di bawah melanjutkan PRD advanced: **8 minggu untuk P0+P1 utama**, dengan tambahan 4+ minggu untuk hardening/stretch. Estimasi hanya planning assumption dan harus disesuaikan dengan jam coding aktual.

| Milestone              | Durasi indikatif | Deliverables                                                    | Gate                           |
| ---------------------- | ---------------- | --------------------------------------------------------------- | ------------------------------ |
| M0 — Foundation        | Minggu 1         | Monorepo, compose, Prisma, auth register/login, session refresh | auth flow tests                |
| M1 — Tenant core       | Minggu 2         | Workspace, memberships, invites, roles, private project         | isolation/ownership tests      |
| M2 — Task core         | Minggu 3         | Task number, CRUD, status, assignment, comments/activity        | concurrency tests              |
| M3 — Portfolio MVP     | Minggu 4         | Kanban reorder, My Tasks, summary, API docs, deployment         | demo end-to-end                |
| M4 — Async & realtime  | Minggu 5–6       | Outbox, BullMQ, Redis, WS, notifications                        | no lost event, revocation test |
| M5 — Advanced planning | Minggu 7–8       | Custom statuses, subtask/dependency, search, analytics          | feature-specific tests         |
| M6 — SaaS hardening P2 | Minggu 9–12+     | Billing sandbox, automation, storage, scale drills              | conditional                    |

### 16.1 Suggested issue list — first 15 issues

| #   | Issue                                                     | Priority | Dependencies |
| --- | --------------------------------------------------------- | -------- | ------------ |
| 001 | Initialize pnpm/Turborepo, ESLint, TS configs             | P0       | -            |
| 002 | Docker Compose PostgreSQL and .env.example                | P0       | 001          |
| 003 | Prisma schema/migrations + seed                           | P0       | 002          |
| 004 | NestJS global ValidationPipe, exception filter, requestId | P0       | 001          |
| 005 | Register/login/session tokens + tests                     | P0       | 003,004      |
| 006 | Refresh rotation/logout/CSRF guards                       | P0       | 005          |
| 007 | Workspace create/list/switch + owner                      | P0       | 006          |
| 008 | Membership policy engine + negative auth tests            | P0       | 007          |
| 009 | Invitation create/accept/revoke                           | P0       | 008          |
| 010 | Project create/list/private membership/default statuses   | P0       | 008          |
| 011 | Task CRUD, number allocation, status & assignment rules   | P0       | 010          |
| 012 | Optimistic version/ETag + activity/audit                  | P0       | 011          |
| 013 | Kanban board/reorder API & UI                             | P0       | 011,012      |
| 014 | My Tasks, summary, comments                               | P0       | 011          |
| 015 | API docs, CI, E2E, deployment, demo fixtures              | P0       | 001–014      |

### 16.2 Definition of Done per issue

- Feature sesuai acceptance criteria PRD dan policy matrix TDD.
- Negative auth cases tersedia untuk resource baru.
- DTO validation dan documented errors tercakup.
- Migrations dapat diterapkan ke DB baru.
- Unit/integration/e2e yang relevan lulus lokal dan CI.
- Tidak ada credential/secret maupun data user nyata dalam test fixtures.
- UI menampilkan loading, empty, error, success, dan permission state yang wajar.
- README/docs/API updated dan screenshot bila user-visible.

---

## 17. Unresolved decisions and implementation checks

| ID   | Keputusan belum final                  | Pilihan baseline / aksi verifikasi                                                 |
| ---- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| D-01 | Major library versions                 | Pin Next/Nest/Prisma di lockfile dan validasi semua snippet                        |
| D-02 | Prisma model validation                | Jalankan `prisma validate`; perbaiki generated relations jika ada perubahan major  |
| D-03 | Email verification P0 atau P1          | P0 untuk external invite production; demo seeded account boleh verified            |
| D-04 | CSRF transport detail                  | Implement double-submit/synchronizer di same-origin topology; integrasi Playwright |
| D-05 | Refresh concurrency across tabs        | Single-flight client; integration test token rotation/reuse                        |
| D-06 | Status delete migration P1             | Harus remap task status sebelum menghapus status used                              |
| D-07 | Decimal rank edge cases                | Rebalance threshold, negative rank, tie, serialization test                        |
| D-08 | Workspace member project create policy | Default false, owner configurable kemudian                                         |
| D-09 | Activity privacy                       | Audit hanya sanitized action metadata; private task content tidak bocor            |
| D-10 | Admin private project access           | Tetap denied tanpa project membership, sesuai PRD                                  |
| D-11 | Archived task deletion policy          | UI hide by default; restore endpoint P1                                            |
| D-12 | Deployment reverse proxy               | Pastikan cookies, WS upgrade, trusted headers dan routing benar                    |
| D-13 | Performance SLO validation             | Ukur sebelum mengklaim hasil di portfolio                                          |

---

## 18. Implementation readiness checklist

### Before first migration

- [ ] Pin framework/Prisma major versions; commit `pnpm-lock.yaml`.
- [ ] Validate Prisma schema using actual CLI version.
- [ ] Review SQL partial indexes and constraints against generated migration.
- [ ] Decide all env key names; add `.env.example`.
- [ ] Docker PostgreSQL boots and healthcheck passes.

### Before P0 release

- [ ] Register/login/logout/refresh with cookie + CSRF tested.
- [ ] OWNER unique partial index in DB and transfer transaction tested.
- [ ] Tenant isolation, private project policy, and resource-scoped list tested.
- [ ] Task number creation race test passes.
- [ ] PATCH/reorder `If-Match` 412/428 behavior tested.
- [ ] Kanban board accessible by keyboard and handles rollback.
- [ ] Swagger, README, architecture diagram, seeded demo ready.
- [ ] CI and deploy URL green; no secrets or real customer data.

### Before P1 release

- [ ] Outbox event saved atomically with mutation.
- [ ] Event replay/duplicates handled idempotently.
- [ ] Revoked members disconnected/denied WebSocket access.
- [ ] Notifications avoid private project data leakage.
- [ ] Redis outage degrades gracefully; reconnect triggers refetch.

---

## 19. References

**Primary specification:** `TaskFlow_Advanced_PRD.md` v1.0.0, 20 November 2026.

Official technical documentation (verify exact pinned versions before implementation):

- Next.js App Router — Server and Client Components: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Next.js Authentication: https://nextjs.org/docs/app/guides/authentication
- NestJS Authentication: https://docs.nestjs.com/security/authentication
- NestJS Authorization: https://docs.nestjs.com/security/authorization
- NestJS Guards: https://docs.nestjs.com/guards
- NestJS Queues: https://docs.nestjs.com/techniques/queues
- Prisma v7 Schema overview: https://www.prisma.io/docs/orm/v7/prisma-schema/overview
- Prisma v7 Client setup: https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction
- Prisma v7 Config: https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10: https://owasp.org/API-Security/

---

## 20. First implementation command sequence (plan)

> Ilustrasi urutan setup; exact commands bergantung package manager dan major versions yang dipin. Gunakan generator resmi untuk membuat boilerplate; jangan paste perintah ini sebagai shell script otomatis tanpa penyesuaian.

```bash
# 1) Initialize monorepo; create Next.js, NestJS apps, and shared packages.
# 2) Start PostgreSQL via Docker Compose.
# 3) Configure apps/api/prisma.config.ts and schema.prisma.
cd apps/api
pnpm prisma validate
pnpm prisma migrate dev --name init_core
pnpm prisma generate

# 4) Run auth/tenant integration tests and dev apps.
# 5) Run E2E smoke and deploy preview after P0 is complete.
```

**Langkah coding pertama setelah membaca TDD:** buat monorepo dan selesaikan **Issue 001–004**, lalu validasi model Prisma + SQL constraints. Jangan mulai dengan WebSocket, billing, ataupun dashboard analytics sebelum alur auth dan workspace isolation terbukti bekerja.
