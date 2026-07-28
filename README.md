# Gart

Vertical SaaS for personal trainers (Ukrainian market). See [gart-master-plan.md](gart-master-plan.md)
for product scope and roadmap.

This repository is currently at **Step 1: monorepo scaffold**. No database, no auth, no design
system yet.

## Requirements

- Node.js **20.9+** (`.nvmrc` pins 20)
- pnpm **10** — enable it with Corepack, which ships with Node:

  ```bash
  corepack enable pnpm
  ```

  If `/usr/local/bin` is not writable, install the shim somewhere on your `PATH` instead:

  ```bash
  corepack enable pnpm --install-directory ~/.local/bin
  ```

## Install

```bash
pnpm install
```

## Run

```bash
pnpm dev
```

Starts both apps in parallel via Turborepo:

| App           | Package     | URL                   |
| ------------- | ----------- | --------------------- |
| Web (Next.js) | `@gart/web` | http://localhost:3000 |
| API (NestJS)  | `@gart/api` | http://localhost:4001 |

Verify:

```bash
curl http://localhost:4001/health   # => {"status":"ok"}
open http://localhost:3000          # => centered "Gart"
```

Override the API port with `PORT` in `apps/api/.env`.

To run a single app: `pnpm --filter @gart/api dev` or `pnpm --filter @gart/web dev`.

## Environment

Each app ships an `.env.example`. Copy it before overriding defaults — real `.env` files are
git-ignored and must never be committed.

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
```

Both apps run with working defaults if you skip this.

## Workspace

```
apps/api          NestJS API — one endpoint: GET /health
apps/web          Next.js App Router + TailwindCSS — one page: /
packages/shared   @gart/shared — shared types, empty for now
```

`packages/shared` compiles to `dist/` and is a workspace dependency of both apps, so either can
import from `@gart/shared` as soon as it has something to export. Turborepo builds it first.

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
