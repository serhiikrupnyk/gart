# Gart

Vertical SaaS for personal trainers (Ukrainian market). Product scope and roadmap live in planning
documents kept outside version control.

This repository is currently at **Step 5: design system and app shell**. Trainers can register, sign
in, add clients and invite them, inside a themed application shell. No workout features yet.

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
open http://localhost:3000/register # => create a trainer account
open http://localhost:3000/login    # => sign in, lands on /dashboard
```

The seeded demo trainer is `demo@gart.fit` with the password from `SEED_DEMO_PASSWORD`.

`/health` returns **503** with `{"status":"error","db":"error"}` when the database is unreachable.

Override ports with `PORT` in `apps/api/.env` and `POSTGRES_PORT` in `.env`. The default 5433
avoids colliding with a Postgres already running on 5432.

To run a single app: `pnpm --filter @gart/api dev` or `pnpm --filter @gart/web dev`.

## Environment

| File                  | Read by            | Holds                                                                      |
| --------------------- | ------------------ | -------------------------------------------------------------------------- |
| `.env`                | `docker compose`   | superuser + app role credentials, `POSTGRES_PORT`                          |
| `apps/api/.env`       | API and Prisma CLI | database URLs, `PORT`, `WEB_ORIGIN`, throttle limits, `SEED_DEMO_PASSWORD` |
| `apps/web/.env.local` | Next.js            | `NEXT_PUBLIC_API_URL` — where the browser sends credentialed requests      |

`WEB_ORIGIN` is the single origin allowed to hold a session cookie for this API. It must match the
web app's URL exactly, or the browser will refuse the credentialed request.

`SHADOW_DATABASE_URL` points at a second, pre-created database that Prisma needs for
`migrate dev`. Pre-creating it is what allows the app role to stay `NOCREATEDB` — the credentials
the API runs with can never create a database.

## Database

The schema lives in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma): `User`
(identity), `Trainer` (the tenant), `Session`, `TeamMember` (who may act inside a tenant — the OWNER
row is created with the trainer at registration), `Client`, and `ClientInvite`. Everything a trainer
owns cascades from `Trainer`.

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

`pnpm test` runs against the separate `gart_test` database, which the container provisions
alongside the others. The suite truncates it between tests, so never point `TEST_DATABASE_URL` at a
database holding anything you want to keep.

The seed creates one `User` + `Trainer` for `demo@gart.fit`. Both writes are upserts keyed on a
unique column, so running it twice updates rather than duplicates.

Prisma 7 generates its client as TypeScript **into the repository**, at
`apps/api/src/generated/prisma`. That directory is git-ignored and rebuilt from the schema; never
edit or commit it.

## Authentication

Trainers register with an email, a password and a display name; registration creates the `User` and
its `Trainer` tenant in a single transaction, so neither can exist without the other.

| Endpoint              | Behaviour                                                     |
| --------------------- | ------------------------------------------------------------- |
| `POST /auth/register` | Creates the account, starts a session, returns user + trainer |
| `POST /auth/login`    | Starts a session, returns user + trainer                      |
| `POST /auth/logout`   | Revokes the session and clears the cookie                     |
| `GET /auth/me`        | Current user + trainer, or 401                                |

Decisions worth knowing:

- **argon2id**, OWASP parameters `m=19456, t=2, p=1`. Parameters live in the stored PHC string, so
  they can be raised later without invalidating existing hashes.
- **Server-side sessions, not stateless JWT.** The guard has to load the `Trainer` tenant on every
  protected request anyway, which removes JWT's only real advantage here — and a session row buys
  genuine revocation, so logging out actually ends the session.
- The cookie carries a 256-bit random token; the database stores **only its SHA-256**, so a database
  leak yields no usable sessions.
- **Login never reveals whether an email exists.** A wrong password and an unknown address return
  byte-identical responses, and an unknown address still performs an argon2 verification against a
  decoy hash so the timing matches too.
- Rate limiting is applied per route via `@nestjs/throttler`, `helmet` sets security headers, and
  CORS admits exactly one origin — no wildcard is possible alongside credentials, and none is wanted.

## Clients and invites

A trainer adds a client by name and email; the API creates the client as `INVITED` together with a
one-time invite link. The client opens the link, sets a password, and their account is created and
linked in a single transaction.

| Endpoint                   | Behaviour                                                       |
| -------------------------- | --------------------------------------------------------------- |
| `POST /clients`            | Creates the client and returns the one-time invite link         |
| `GET /clients`             | This trainer's clients; `?status=` filters                      |
| `GET /clients/:id`         | One client, or 404                                              |
| `PATCH /clients/:id`       | Rename, or archive                                              |
| `POST /clients/:id/invite` | Issues a fresh link and invalidates the previous one            |
| `GET /invites/:token`      | Public. Who invited whom — 410 if expired, 404 otherwise        |
| `POST /auth/accept-invite` | Public. Creates the account, links the client, starts a session |

**Tenant isolation** is enforced in three places rather than by discipline. Every `ClientsService`
method takes `trainerId` as its first parameter and there is no overload that omits it; the
controller's only source for that value is the AuthGuard. Single-record access goes through one
helper using `findFirst({ id, trainerId })` — never `findUnique` plus a check that a later edit
could drop. A miss raises **404, not 403**, because 403 would confirm the record exists.

**Invites** carry a 256-bit random token of which only the SHA-256 is stored, exactly as sessions
do. They expire after 7 days, are single-use, and regenerating deletes the previous one so its hash
no longer resolves. An invite naming an address that already has an account is refused rather than
linked: otherwise an invite would be a way to overwrite that account's password.

## Design system

Tokens are CSS custom properties declared in [globals.css](apps/web/src/app/globals.css) and wired
into Tailwind v4's `@theme`, so utilities such as `bg-surface` resolve to `var(--color-surface)`.
Dark theme redefines the same variables under `.dark`; nothing else changes.

Contrast was measured rather than assumed, and two results shaped the palette's use:

- **White text fails AA on almost every solid fill** — the ember accent is 3.55:1 in light theme and
  2.85:1 in dark. Ink `#14171F` passes on both (5.05 / 6.30), so `--accent-contrast` is ink, as the
  brand notes anticipated. `info` is the exception and keeps white, which is why on-colours are
  per-token rather than one global value.
- **Solid buttons therefore lighten on hover, not darken.** Darkening moves the fill toward the ink
  label and drops contrast to 4.04:1; `--accent-solid-hover` lightens instead, reaching 5.50:1.
  `--accent-hover` keeps its role on ghost and link hovers, where the label is not on the fill.
- `--text-muted` is below AA for body copy (3.10:1), so it is reserved for decorative marks and
  disabled controls. Anything that must be read — captions, hints, placeholders — uses
  `--text-secondary`.

Components live in [apps/web/src/components/ui](apps/web/src/components/ui) and are the only place
raw colour utilities should appear.

### Theming

The preference (`light` / `dark` / `system`) is a cookie, not `localStorage`, so the **server** reads
it and emits the correct `class` on `<html>` — there is no flash and it works with JavaScript off.
`system` is the one case the server cannot resolve, since no request header carries the OS setting;
a small inline script settles that before first paint.

The trade-off: reading cookies in the root layout opts the whole app into dynamic rendering. Every
route is now server-rendered per request rather than static.

## Workspace

```
apps/api          NestJS API — auth, clients, invites, Prisma
apps/web          Next.js App Router + Tailwind v4 — design system, shell, screens
packages/shared   @gart/shared — public wire types shared by api and web
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
| `pnpm test`         | Auth unit and e2e suites          |
| `pnpm lint`         | ESLint across the workspace       |
| `pnpm format`       | Prettier write                    |
| `pnpm format:check` | Prettier check (CI-friendly)      |

TypeScript strict mode is on everywhere via [tsconfig.base.json](tsconfig.base.json); ESLint and
Prettier are configured once at the root and shared by all packages.
