# Gart

Vertical SaaS for personal trainers (Ukrainian market). See [gart-master-plan.md](gart-master-plan.md)
for product scope and roadmap.

This repository is currently at **Step 2: database layer**. Postgres, Prisma and the two identity
models are in place. No auth, no design system, no feature modules yet.

## Requirements

- Node.js **20.9+** (`.nvmrc` pins 20)
- Docker with Compose v2, for Postgres
- pnpm **10** — enable it with Corepack, which ships with Node:

  ```bash
  corepack enable pnpm
  ```

  If `/usr/local/bin` is not writable, install the shim somewhere on your `PATH` instead:

  ```bash
  corepack enable pnpm --install-directory ~/.local/bin
  ```

## First-time setup

```bash
pnpm install

cp .env.example .env                    # Postgres container settings
cp apps/api/.env.example apps/api/.env  # API connection strings

docker compose up -d                    # start Postgres
pnpm --filter @gart/api db:migrate      # create the schema
pnpm --filter @gart/api db:seed         # one demo trainer
```

Set a real password in `.env` before starting the container, and use the **same** password in
`apps/api/.env`. Both files are git-ignored and must never be committed.

The container provisions itself on first start: it creates the `gart_app` role
(`NOSUPERUSER NOCREATEDB NOCREATEROLE`), the `gart` and `gart_shadow` databases owned by it, and
the `citext` extension. That provisioning only runs when the data volume is empty — after changing
credentials in `.env`, run `docker compose down -v` to recreate it.

## Run

```bash
pnpm dev
```

Starts both apps in parallel via Turborepo:

| App           | Package     | URL                   |
| ------------- | ----------- | --------------------- |
| Web (Next.js) | `@gart/web` | http://localhost:3000 |
| API (NestJS)  | `@gart/api` | http://localhost:4001 |
| Postgres      | docker      | localhost:5433        |

Verify:

```bash
curl http://localhost:4001/health   # => {"status":"ok","db":"ok"}
open http://localhost:3000          # => centered "Gart"
```

`/health` returns **503** with `{"status":"error","db":"error"}` when the database is unreachable.

Override ports with `PORT` in `apps/api/.env` and `POSTGRES_PORT` in `.env`. The default 5433
avoids colliding with a Postgres already running on 5432.

To run a single app: `pnpm --filter @gart/api dev` or `pnpm --filter @gart/web dev`.

## Environment

| File                  | Read by            | Holds                                             |
| --------------------- | ------------------ | ------------------------------------------------- |
| `.env`                | `docker compose`   | superuser + app role credentials, `POSTGRES_PORT` |
| `apps/api/.env`       | API and Prisma CLI | `DATABASE_URL`, `SHADOW_DATABASE_URL`, `PORT`     |
| `apps/web/.env.local` | Next.js            | `NEXT_PUBLIC_API_URL` (unused so far)             |

`SHADOW_DATABASE_URL` points at a second, pre-created database that Prisma needs for
`migrate dev`. Pre-creating it is what allows the app role to stay `NOCREATEDB` — the credentials
the API runs with can never create a database.

## Database

The schema lives in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma) and holds two
models: `User` (identity) and `Trainer` (the tenant, one-to-one with a user, cascading on delete).

`User.email` is a `citext` column, so uniqueness is case-insensitive in the database itself and no
code path can bypass it by forgetting to lowercase. `citext` has been a _trusted_ extension since
PostgreSQL 13, which is why the non-superuser app role can install it — the initial migration does
so with `CREATE EXTENSION IF NOT EXISTS citext`.

Run from `apps/api` (or with `pnpm --filter @gart/api`):

| Command            | Does                                                       |
| ------------------ | ---------------------------------------------------------- |
| `pnpm db:migrate`  | Create and apply a migration from schema changes           |
| `pnpm db:generate` | Regenerate the Prisma client (Turborepo runs this for you) |
| `pnpm db:seed`     | Create the demo trainer — idempotent, safe to re-run       |

The seed creates one `User` + `Trainer` for `demo@gart.fit`. Both writes are upserts keyed on a
unique column, so running it twice updates rather than duplicates.

Prisma 7 generates its client as TypeScript **into the repository**, at
`apps/api/src/generated/prisma`. That directory is git-ignored and rebuilt from the schema; never
edit or commit it.

## Workspace

```
apps/api          NestJS API — Prisma, GET /health
apps/web          Next.js App Router + TailwindCSS — one page: /
packages/shared   @gart/shared — PublicUser / PublicTrainer, shared by api and web
docker/postgres   container provisioning (app role, databases, citext)
```

`packages/shared` holds the API's **wire contract**: timestamps are ISO 8601 strings rather than
`Date`, because that is what survives JSON and what the web client actually receives. Secrets never
appear in these types. It compiles to `dist/` and Turborepo builds it before either app.

## Scripts

Run from the repository root; each fans out to every package via Turborepo.

| Command             | Does                              |
| ------------------- | --------------------------------- |
| `pnpm dev`          | Run API and web together          |
| `pnpm build`        | Production build of every package |
| `pnpm typecheck`    | TypeScript strict check, no emit  |
| `pnpm lint`         | ESLint across the workspace       |
| `pnpm format`       | Prettier write                    |
| `pnpm format:check` | Prettier check (CI-friendly)      |

TypeScript strict mode is on everywhere via [tsconfig.base.json](tsconfig.base.json); ESLint and
Prettier are configured once at the root and shared by all packages.
