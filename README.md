# Gart

Vertical SaaS for personal trainers (Ukrainian market). Product scope and roadmap live in planning
documents kept outside version control.

Phase 1 is complete — the core loop runs end to end: a trainer builds a program, assigns it, the
client sees today's workout and records what they actually did, and the trainer sees planned
against actual, adherence, and who needs attention.

This repository is currently at **Step 18: notification infrastructure** — in-app notifications,
web push, and the trainer's client-activity feed, on top of Phase 2's progress measurement (Step 16) and habits (Step 17).

## Requirements

- Node.js **20.9+** (`.nvmrc` pins 20)
- Docker with Compose v2, for Postgres, MinIO and Redis
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

docker compose up -d                    # start Postgres, MinIO and Redis
pnpm --filter @gart/api db:migrate      # create the schema
pnpm --filter @gart/api db:seed         # one demo trainer

npx web-push generate-vapid-keys        # paste the pair into apps/api/.env
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
| Redis         | docker      | localhost:6380        |

Verify:

```bash
curl http://localhost:4001/health   # => {"status":"ok","db":"ok","queue":"ok"}
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

### Two kinds of principal

A session is issued wearing one of two hats and never changes it: `Session.context` is `TRAINER` or
`CLIENT`, set by which door issued it (`/auth/login` and registration issue trainer sessions;
`/auth/client/login` and accept-invite issue client ones). Guards check the row, never guess from
what the user could be — one person may be both a trainer and someone's client, and a client-context
cookie must stay powerless on trainer routes no matter what its owner becomes. A database CHECK
enforces that client sessions (and only they) bind to a specific client profile, which also fixes
the tenant for the session's lifetime and leaves multi-trainer switching open as "issue another
session".

Client endpoints: `POST /auth/client/login` (same hardening as trainer login — generic errors, decoy
verification, rate limit; an address that is a trainer but nobody's client gets the same generic
refusal) and `GET /auth/client/me`, which returns the client's profile plus their trainer's brand
and nothing else. `/auth/logout` revokes either kind of session. Wrong-context requests get a bare
401 identical to having no cookie at all — a 403 would confirm the cookie names a real session of
the other type. Archived clients are cut off at the guard, not just at login.

## Exercise library

Exercises and categories share one ownership model: `trainerId` NULL is the global base library,
visible to every trainer and mutable by none; a set `trainerId` is one trainer's custom row,
invisible to the rest. The policy lives in three private helpers per service — reads go through
`visibleTo` (global OR own), writes through `requireOwned`, whose `{ id, trainerId }` clause can
never match a NULL row — so globals are immutable **by construction**, with no "if global" branch to
forget. Misses are bare 404s, indistinguishable from nonexistent ids.

| Endpoint                            | Behaviour                                                        |
| ----------------------------------- | ---------------------------------------------------------------- |
| `GET /exercises`                    | Global + own; `?muscleGroup=`, `?categoryId=`, `?search=`, paged |
| `GET /exercises/:id`                | Global or own, else 404                                          |
| `POST /exercises`                   | Creates a custom exercise for the caller                         |
| `PATCH /exercises/:id`              | Own only — globals and foreign rows 404                          |
| `DELETE /exercises/:id`             | Own only; hard delete while nothing references exercises         |
| `GET /muscle-groups`                | The anatomical vocabulary with Ukrainian labels                  |
| `GET/POST/PATCH/DELETE /categories` | Same split; deleting a category uncategorises its exercises      |

Details that matter:

- **Muscle groups are a Postgres enum** (closed anatomical vocabulary), with Ukrainian labels in
  `@gart/shared` — the same enum-plus-labels split as `ClientStatus`. Categories are a table,
  because trainers create their own.
- A `categoryId` in a request body is a cross-tenant reference vector: it must resolve to a global
  or own category, else 400 — with one body for "foreign" and "nonexistent" alike.
- Media URLs are plain strings until Step 8, but validated http(s)-only now, so a `javascript:` URL
  can never be stored and later rendered into the client app.
- The wire shape exposes `isCustom`, never the raw `trainerId`.
- Deletes are hard while nothing references exercises. Step 10's `ProgramExercise` FK will be
  `onDelete: Restrict`, and the delete endpoint then maps the violation to a 409.
- The seed provides five global categories and six common exercises; the full Ukrainian base
  library is a separate Phase 1 content task.

## Programs

A program is a trainer-owned template: an ordered tree of typed sections, each an ordered list of
prescribed exercise lines. One `WorkoutType` vocabulary serves both levels — the program's type is
the headline and the UI default, each section's type governs execution, so one session can mix a
strength warm-up with an AMRAP finisher.

- **Type-specific structure is four fields, not a forest**: `timeCapSeconds` (AMRAP, required
  there), `intervalSeconds` + `rounds` (EMOM), `rounds` (CIRCUIT; optional elsewhere — 8×400 м is
  rounds of a running section), `restBetweenRoundsSeconds` (only alongside rounds). The whole
  required/forbidden table lives in [program-rules.ts](apps/api/src/programs/program-rules.ts).
- **Prescriptions are validated as structure, not legislated as methodology**: every field
  (`sets/reps`, `durationSeconds/distanceMeters`, `restSeconds/tempo/notes`) is optional, because a
  strength section legitimately holds a timed plank. The one coherence rule: load is either
  `loadValue + loadUnit` (кг | %1ПМ | RPE, `Decimal(6,2)`) **or** `loadText` («до відмови») — never
  both, so Phase 2 progression math gets numbers while coaching intent stays honest text.
- **The array is the order.** Requests carry no `order` or `id` fields; the server writes array
  indexes, backed by `@@unique([programId, order])` / `@@unique([sectionId, order])`. Saving a tree
  replaces it wholesale in one transaction — section/line ids churn on save _by design_, because
  nothing durable may reference the live tree: Step 12 assignments and Step 14 logs snapshot
  prescriptions, since editing a template must never rewrite an assigned program or a logged
  workout.
- Every `exerciseId` in a payload passes the same `visibleTo` gate as everything else (via
  `ExercisesService.assertAllVisible`) — a foreign custom exercise 400s identically to a
  nonexistent one.
- **The Step 7 delete contract is settled**: `ProgramExercise.exerciseId` is `onDelete: Restrict`,
  and deleting a referenced exercise answers 409 «Вправа використовується у програмі»; unreferenced
  customs still delete (and now also retire their media objects from storage). Deleting a program
  cascades its tree and never touches Exercise rows.

## Assignments

Assigning a program **snapshots** it — the invariant Steps 10–11 designed toward. The tree
(sections + prescriptions + type config) is copied into `AssignmentSection`/`AssignmentExercise`
rows in one transaction; afterwards the template can be edited beyond recognition or deleted
outright and the assignment cannot change, because _no code path updates the snapshot tree_ and
`sourceProgramId` is provenance only (SET NULL on template delete). Snapshot rows are written once,
so their ids are durable — exactly what Step 14's logs will reference as real foreign keys.

Two deliberate boundaries:

- **Prescriptions are frozen; exercise identity stays live.** Snapshot lines keep their FK to the
  library (Restrict, extending the Step 7/10 delete contract) so the client always sees the
  exercise's current name, instructions and video — a typo fix or a better clip should reach them;
  the prescribed numbers must not drift.
- **The assigned tree is not editable** — PATCH covers schedule and status only. Per-client
  tweaking of an assigned copy is a real future feature with its own invariants (especially once
  logs exist), not a PATCH away.

Schedule is weekly recurrence: `startDate`, optional `endDate`, ISO weekdays (Пн=1). Step 13's
«today» is one query; Step 14 addresses an occurrence as (assignmentExerciseId, date). Assigning to
an archived client is refused; a foreign template ≡ nonexistent (identical 400), a foreign client ≡
nonexistent (identical 404) — the house rule for body vs path references.

The UI lives on the **client detail page** («Програми клієнта»): assignment cards with schedule and
status, a row menu (Завершити / Архівувати / Активувати / Видалити), and the assign dialog —
template select, dates, weekday chips — which states the snapshot semantics in one quiet line.

## Client workout view («Сьогодні»)

The client's own reads live under `/me`, behind `ClientGuard` — the tenant scope IS the session
(`clientAuth.trainer.id` + `clientAuth.client.id` pin every query), so there are no ids in the
path prefix and nothing to enumerate. A foreign assignment ≡ nonexistent (identical bare 404); an
archived client is cut at the guard with the uniform 401.

```
GET /me/workouts?date=YYYY-MM-DD    the day's workouts, full trees
GET /me/assignments                 ACTIVE plan summaries, newest first
GET /me/assignments/:id             one plan's tree
```

- **The device owns «сьогодні».** The server never consults its own clock: the client app sends
  its local calendar date and the API answers `status = ACTIVE ∧ startDate ≤ day ≤ (endDate ?? ∞)
∧ isoWeekday(day) ∈ daysOfWeek`. Schedules mean the client's day, wherever they wake up. The
  date param is validated against the real calendar — V8 would quietly roll `2026-02-31` into
  March, so the parse round-trips before it queries.
- **Frozen numbers, live library.** The wire shape pairs each snapshot prescription line (durable
  id — the future log anchor) with the exercise's current name, instructions and media metadata.
  A typo fix or a better clip reaches the client at once; the prescribed numbers cannot drift.
  Client shapes carry no provenance (`sourceProgramId`) and no storage keys.
- **Media plays through the existing `GET /exercises/:id/media-url`** — same guard, same
  trainer-library scope, same short-lived URLs; there is no parallel client media path.

The home screen is phone-first: «Сьогодні» with a tappable week strip (dots on scheduled days,
today ringed — tapping re-queries that date), workout cards with the prescription as the big line
(«5×5 · 82,5 кг · відпочинок 90 с»), technique notes and media behind a tap (nothing streams
uninvited), a calm rest-day state that names the next session, and «Мій план» with the active
programs.

## Workout logging

A record is addressed by **(snapshot exercise, date)** — the durable `AssignmentExercise` id that
mirror tables were chosen for, as a real foreign key. Logs never reference the template or the
library, so a template edited beyond recognition cannot change what a record means.

```
PUT    /me/assignment-exercises/:id/logs/:date   upsert, returns the record
DELETE /me/assignment-exercises/:id/logs/:date   undo a mis-tap
GET    /me/workouts?date=                        each exercise now carries `log`
```

- **Per-set, because the one-tap path costs nothing.** «Виконано» materialises the prescribed
  sets, so the common case needs no typing; deviations stay honest per set («останній підхід — 3»),
  which is what a coach reads and what Phase 2's volume, top-set and e1RM math needs. A
  per-exercise average would be lossy the day it was written.
- **Actual load is always kilograms.** %1ПМ and RPE are prescription languages for _choosing_ a
  weight; the log records the weight that moved. One unit keeps aggregation correct and keeps the
  load XOR rule out of the actuals entirely. Prefill happens only when the prescription was itself
  in kilograms.
- **Upsert, not append.** `@@unique([assignmentExerciseId, date])` puts the invariant in the
  database: editing today's record updates it, and no retried request can double-count. Set rows
  are replaced wholesale per write — the same contract as program trees and snapshots.
- **The prescription is never touched.** Logging only ever _reads_ `AssignmentExercise`; planned
  and actual live in different tables and cannot contaminate each other.
- **Three states, deliberately distinct**: no record; `completed: true` (did it); `completed:
false` (skipped, with the reason in notes — real signal for the trainer).
- **You may log exactly what the day's workout view would have shown you** — the same schedule
  predicate, shared as one function. Plus a window: **14 days back**, so a missed Friday can be
  filled in over the weekend but a month of recall cannot be invented. This is the one place the
  server reads its own clock, and only for bounds — a date's _meaning_ still comes from the device
  (one day of forward tolerance covers calendars running ahead of UTC).
- Deleting an assignment takes its records with it; the trainer's confirm dialog says so.

On the card: «Виконано» (one tap) or «Записати інакше», which opens numbered set rows offering
exactly the fields the prescription used — a plank asks for seconds, not reps and kilograms. A
recorded exercise shows «Факт: 5×5 · 82,5 кг», reopens with the _logged_ values for correction,
and can be undone. The workout header counts «2 з 5 виконано». Past days of the week are logged
the same way through the week strip; a day that has not happened yet shows why it cannot be.

## Trainer monitoring

The loop closes here: `GET /clients/:id/workout-history?from&to` returns every session the schedule
called for, with what the client recorded laid over it. Ownership is the usual gate
(`ClientsService.requireOwned` → bare 404), and the assignment query is scoped
`{ trainerId, clientId }`, which puts every log reached through it inside the tenant by
construction. The range **is** the pagination: 28 days by default, 92 at most.

**Four states, and one of them cannot be read from a table.** `DONE`, `DEVIATED` and `SKIPPED` all
come from a log row; `MISSING` is a scheduled occurrence with **no** row, so it has to be generated
by expanding the schedule — the same predicate Step 13/14 use to filter one day, walked over a
range ([occurrences.ts](apps/api/src/monitoring/occurrences.ts)). Sessions take the same four
shapes one level up (`DONE` / `PARTIAL` / `SKIPPED` / `MISSED`), and the last two stay apart on
purpose: a client who wrote «біль у коліні» against every exercise did something very different
from one who never appeared.

**Comparison is conservative**, so the trainer is never shown a deviation that is really an
apples-to-oranges artefact ([log-state.ts](apps/api/src/monitoring/log-state.ts)): load counts only
when the prescription was in kilograms (`%1ПМ` and `RPE` prescribe how to _choose_ a weight, not
the weight), reps/duration/distance only where the prescription named them, and a blank actual
field is silence rather than disagreement.

Two more decisions worth knowing:

- **A completed cycle stays in history; an archived one does not.** `COMPLETED` means a plan
  finished properly, so its past sessions still count; `ARCHIVED` means retired or assigned by
  mistake, and its phantom «missed» sessions would only drag adherence down.
- **Today is never missed before the day is over.** A scheduled session with no record appears only
  once its date has passed — otherwise every morning would open red.

Adherence is five integers over the range — `scheduled`, `done`, `partial`, `skipped`, `missed`,
summing to `scheduled`. That is the Step 15/16 line: **this step answers "did the plan happen?"**
in session counts, while Step 16's `ProgressVariable`/`ProgressEntry` answer "is the body
changing?" with measurements and the graphs over them.

The clients list carries just enough pulse to triage by, computed for the whole page in two
queries — this is what `WorkoutLog`'s denormalised `trainerId`/`clientId` were for. `attention` is
`SKIPPED` (a stated reason in the last 14 days — deliberately not keyword-matched for «біль»; a
reason is the signal, and reading it is the trainer's job) or `MISSED` (two or more silent
sessions — one missed day is life), otherwise the row just shows «Тренувався 3 дні тому».

On the client page, «Активність» sits above «Програми клієнта»: a range selector, the adherence
line, and one row per session that expands into Вправа | План | Факт | Стан with the two numbers
side by side («5×5 · 82,5 кг» vs «5×4 · 80 кг»). Skip reasons are pulled up to the session row in
`danger` tone — they are the first thing to read, not a footnote in row four.

## Progress measurement

Custom variables, their measurements, private photos, and the first longitudinal charts.

- **A variable belongs to one client**, not to a trainer as a template. A trainer tracks a handful
  of dimensions per person and _which_ ones is itself a coaching decision, so one table says that
  without an assignment lifecycle or the template-versus-instance questions (what a rename means
  for history, what unassigning does to past entries). The retyping cost is paid off with
  suggestions, not a second table.
- **`unit` is a free display label, and that does not contradict the load lesson from programs** —
  there it was the VALUE that had to escape free text. The value here is always
  `Decimal(8, 2)`, never a float, because a chart of 84.10 → 83.95 must not drift; the unit is
  never read by a chart, so constraining it would only stop a trainer tracking «год сну».
- **Entries upsert on `(variable, date)`**, the same reasoning as workout logs: a measurement is a
  fact about a date, not an event stream. The unique index is also the longitudinal index, so a
  series is one ordered range scan.
- **Photos reuse the exercise-media path exactly** — same `StorageService`, same policy table
  (extended with JPEG/PNG/WebP magic numbers and a 10 MB cap), same presign → direct PUT →
  verify-and-finalize, same delete-on-failed-verification. Serving is a presigned GET minted per
  request behind `TrainerOrClientGuard`, narrowed to the owning trainer **and that client**: a
  sibling client of the same trainer gets the same 404 as for a photo that does not exist.
  Progress photos are more sensitive than exercise clips, which is the argument for reusing this
  path rather than writing a second one.

```
GET/POST   /clients/:id/progress[/variables]        the whole view, or its dimensions
PATCH/DEL  /progress/variables/:id                  one dimension
PUT/DEL    /progress/variables/:id/entries/:date    one measurement, upserted
POST       /clients/:id/progress/photos[/presign]   the Step 8 flow, images only
GET/DEL    /progress/photos/:id[/url]               presigned per view
GET        /clients/:id/progress/exercises[/:id]    derived load history
GET/PUT    /me/progress[/variables/:id/entries/:d]  the client's own view and self-log
```

**Per-exercise load history is derived, never stored** — the numbers already live in
`WorkoutSetLog`, and a second table would be a copy that could disagree. One query reaches them
through the columns denormalised onto `WorkoutLog`, and three metrics come out of the same rows
because coaches read three different questions from one session: **топ-сет** (the heaviest set),
**обʼєм** (Σ reps × kg, whether the workload is climbing) and **оцінка 1ПМ** (Epley, computed only
for 1–12 reps where the estimate means anything — it is what makes 5×5 at 82,5 comparable with 3×3
at 92,5). Two assignments carrying one exercise on the same day merge into one training day.

**The client sees everything of their own and records only what the trainer opens up** — `selfLog`
per variable, off by default. The flag exists because entries upsert per date: without it, a
client's bathroom-scale reading would silently replace the trainer's caliper measurement for that
day. A closed variable answers exactly like one that does not exist.

**Charts are hand-rolled SVG — 0 KB of dependency.** A line is a `polyline` and some `circle`s;
taking Recharts (~100 KB) or Chart.js (~70 KB) would make charting the largest thing in a bundle
serving a phone-first PWA. Accessibility is the reason to hand-roll rather than a cost of it: the
figure carries an `aria-label` that states the trend in words («Вага: 12 замірів з 3 січня по 28
лютого, від 84,2 до 81,0 кг»), every point is a marker so nothing depends on colour, and one
button reveals a real data table — which trainers want for the exact numbers anyway.

## Habits

The trainer defines daily habits for a client; the client records them; streaks do the motivating.

- **A checkbox habit is not a special case in storage — it is a target of 1.** Both kinds carry a
  numeric target and a numeric value, so **one comparison** (`value >= targetValue`) decides
  whether a day counts, and streaks, day strips and adherence never branch on kind. `kind`
  (`CHECK` | `AMOUNT`) governs only how the client is _asked_ — a checkbox or a number — and
  [habit-rules.ts](apps/api/src/habits/habit-rules.ts) makes «checkbox habit with a target of 8»
  unrepresentable, the same way section config rules work for programs.
- **`HabitLog` upserts on `(habit, date)`** — the third time in this codebase, for the third time
  because a day is a fact rather than an event stream. There is no explicit zero: untapping
  **deletes** the row, so «нічого не записано» and «записав нуль» never become two states nobody
  can tell apart. A partial amount (5 of 8) is real data — recorded, shown, and simply not counted.
- **Streaks are derived, never stored** ([streaks.ts](apps/api/src/habits/streaks.ts)): a counter
  in a row is a copy that drifts the first time a log is corrected. `currentStreak` counts
  consecutive met days, and **today is grace** — an unticked today does not break the count until
  the day is over, so a streak reads alive all day instead of zero every morning.
  `longestStreak` is kept so a broken streak leaves an achievement rather than only a loss. A day
  below target breaks the streak: one that survived 2 of 8 glasses would mean nothing, and a
  meaningless streak motivates nobody. The reference date is the **device's**, per Step 13 — a
  streak must not break at 02:00 because the server runs on UTC.
- **The logging window is 7 days**, half the workout window and deliberately so: «скільки води я
  випив 12 днів тому» is invention, and here invention would rewrite a streak.
- **There is no trainer write path for a day.** A habit is the client's own act, which removes a
  whole category of ownership mistakes. Client routes are scoped `{ trainerId, clientId }` per the
  Step 16 refinement, so a sibling client of the same trainer gets the same bare 404 as a stranger.

```
GET/POST   /clients/:id/habits          the view (with streaks), and definitions
PATCH/DEL  /habits/:id                  one habit
GET        /me/habits?date=             the client's own view
PUT/DEL    /me/habits/:id/logs/:date    record a day, or untap it
```

On the client's home, «Звички» sits between the day's workout and «Мій план» — on a rest day that
puts it directly under the calm empty state, which is the daily reason to open the app. A checkbox
habit is one tap; a measured one prefills today's value and reads «5 з 8 склянок». Nothing is
coloured as failure: a missed day in the seven-day strip is simply empty, a zero streak reads
«Найдовша серія: 4» or «Почніть сьогодні», and finishing the last one earns «Усі звички на
сьогодні виконано». The trainer sees the same shape — target, both streaks, and the strip.

## Notifications

Two channels, one of which always works. Every notification is a row in Postgres — that is the
durable channel, and the bell reads it. Web push is the best-effort second channel, delivered
asynchronously through Redis.

**The trainer's activity feed IS their notification list.** «Client X did Y» is exactly what a
notification is for a trainer, so a second table would only duplicate emission, read state,
scoping and paging. `audience` (TRAINER | CLIENT) is stored rather than derived for the same
reason `Session.context` is: one person can be both a trainer and someone's client, and a
client-side notification must never surface in the trainer app. Reads are scoped by the hat the
session wears — a trainer to their tenant, a client to their own row.

**One method, four call sites.** Services call `NotificationService.notifyTrainer(...)` and know
nothing about queues, VAPID or subscriptions. Emission is deliberately low-noise:

| Trigger                                       | Reaches    | Notification                                             |
| --------------------------------------------- | ---------- | -------------------------------------------------------- |
| First record of a session (Step 14)           | trainer    | «Запис тренування» — once, however many exercises follow |
| A skip with a reason (Step 14)                | trainer    | «Пропуск вправи: біль у коліні»                          |
| A client's own measurement (Step 16)          | trainer    | «Новий замір: Вага 83 кг»                                |
| A habit streak milestone — 7/30/100 (Step 17) | trainer    | «Серія звички: Вода — 7 днів поспіль»                    |
| A program assigned (Step 12)                  | **client** | «Нова програма»                                          |

Habits fire every day, so only milestones travel: five habits across twenty clients would
otherwise be a hundred notifications a day, and the signals worth acting on would drown.
**Emission is best effort and swallows its own failures** — a missing notification is a nuisance,
a lost workout log is data loss.

### Redis, behind a seam

`bullmq` over `ioredis`, chosen for retries with backoff and for the delayed jobs Step 19's
inactivity checks will need. Two abstract classes are the only contact the app has with any of it
— `NotificationQueue` and `WebPushSender`, bound to real implementations in production and to
in-memory fakes in tests, exactly as `StorageService` is. **No test run needs Redis or a push
service**, and the queue's contents are directly assertable.

Degradation is designed, not hoped for: `ioredis` runs with `lazyConnect` and its offline queue
**disabled**, so enqueueing fails fast instead of buffering into memory a restart would lose. The
notification row is written first and the enqueue is wrapped — **Redis being down costs push and
nothing else**, which a test asserts by making the queue throw. `/health` reports
`queue: 'ok' | 'error'` without turning the overall status red, because the service really is
still serving.

### Web push

VAPID keys live in `apps/api/.env` (`npx web-push generate-vapid-keys`); the private one never
leaves it and the public one is served by `GET /notifications/push/key` rather than baked into the
web bundle, so rotating it needs no rebuild. Subscriptions belong to a **user**, not a tenant —
the same person may hold both hats on one device.

A subscription is pruned when the push service answers **404 or 410**, and only then: a 500 is a
bad minute at the push service, and deleting a working subscription over it would silently
unsubscribe someone for ever.

The permission prompt is never fired on load — an unprompted dialog is how notifications get
blocked permanently. A quiet card in the bell panel explains why, and only its button registers
[the service worker](apps/web/public/sw.js), asks permission and subscribes. Denial shows one calm
line and is never asked again; a browser that cannot do push renders no control at all.

## Inactivity alerts and messages

The first triggers on Step 18's delivery mechanism. Both are call sites of `notifyTrainer` /
`notifyClient` and nothing more — there is no second notification path.

### When a client goes quiet

**Inactive = recorded nothing for more than 7 days, with something to have been doing.** No workout
log, no habit log, no measurement — and, crucially, at least one scheduled session (via Step 15's
`occurrenceDates`, so COMPLETED plans still count and ARCHIVED ones stop) or at least one habit.
That second clause is what keeps the alert worth reading: a client invited last week with no
programme and no habits is a fact about the trainer's backlog, not about the client.

Every date compared is a `@db.Date` holding the **client's own calendar day**, which is what Steps
13–17 stored — so date-to-date comparison is honest whatever hour the server keeps. The threshold
is strict: recording exactly seven days ago is not a lapse, the eighth day is.

**One alert per episode, derived rather than stored.** The sweep alerts only when there is no
`CLIENT_INACTIVE` notification newer than the client's last recorded day (or their creation date,
if they have never recorded anything). No `alertedAt` column to drift when a log is corrected —
the same instinct as derived streaks in Step 17 — and the lifecycle falls out for free: silent on
days 9, 10, 11; alerts again only after the client returns and lapses once more.

The sweep is a BullMQ **repeatable job** (`INACTIVITY_SWEEP_CRON`, 09:00 daily) — the delayed-jobs
capability that justified BullMQ in Step 18. `upsertJobScheduler` is idempotent, so restarts
re-declare rather than duplicate it, and if Redis is unreachable the scheduler simply is not
installed: alerts resume when it returns and nothing else notices. The rule itself lives in a plain
`InactivityService.sweep()` the worker merely calls, so **it is tested without Redis**.

### Messaging a client

```
POST /clients/:id/messages   { text }
```

Behind `TrainerGuard` and `requireOwned`, so another trainer's client answers with the same bare
404 as one that does not exist. Plain text, trimmed, 1–500 characters — it reaches two renderers
and neither interprets markup: React escapes it in the panel, and the service worker hands it to
`showNotification` as a string.

**Rate limited per trainer, not per address.** The stock guard tracks by IP, which would throttle a
gym's whole office together and give one trainer with two devices two budgets — and it cannot be
fixed by overriding the tracker, because the global throttler runs _before_ route guards, when no
tenant is attached yet. So [TrainerThrottlerGuard](apps/api/src/auth/trainer-throttler.guard.ts)
counts explicitly against the same storage with the key it actually wants (20/hour by default), and
the global per-address limit stays underneath as a coarse backstop.

Broadcasting to every client is deliberately **not** here: audience selection, per-client wording
and a delivery report make that a feature of its own rather than a variation on this one.

On the client page, an inactivity banner states exactly what it measures — days since the last
recorded workout — and carries «Написати клієнту» beside it, so the alert produces an action rather
than just a worry.

## Program builder UI

«Тренування» now lands on `/dashboard/programs` (the library moved behind a sub-tab row —
Програми | Бібліотека вправ). The builder is a routed document editor, not a modal: all edits are
local, saving sends the whole tree per Step 10's full-replace contract.

- **The client mirrors `program-rules` as existence, not validation**: each section type renders
  only its own config fields (AMRAP → time cap; EMOM → interval + rounds; CIRCUIT → rounds + rest),
  and retyping a section drops now-forbidden values from the draft — a stale AMRAP time cap cannot
  ride into a STRENGTH payload. Prescription inputs per line are likewise type-driven. The API
  stays the authority; its 400s surface as the form error.
- **The load XOR rule is unrepresentable**: one mode select (— | кг | %1ПМ | RPE | текст) renders
  one input; switching clears the other representation.
- **Reordering**: ↑/↓ move buttons on every section and line are the accessible, tested path (with
  a polite `aria-live` announcement); dependency-free HTML5 drag on the ⋮⋮ handles is sugar on the
  same array operations. Requests still carry no order fields — the array is the order.
- **The exercise picker is Step 9's composition reused verbatim** (ExerciseFilters + paged
  listExercises in a modal), multi-add, without losing builder state.
- **Unsaved changes**: `beforeunload` guards close/refresh; the builder's own exits confirm via a
  modal. Honest boundary: App Router offers no supported route-blocking, so sidebar navigation
  mid-edit stays unguarded rather than monkey-patched.

## Exercise library UI

«Тренування» in the trainer shell now opens `/dashboard/exercises`: a paged table of the global
library plus the trainer's customs (accent «Моя» badge from `isCustom`), with combining filters —
debounced Cyrillic-aware search, muscle group (labels from `@gart/shared`), category — and real
pagination against the paged API. Detail, create/edit and delete-confirm are modals over the list,
so filters, page and scroll survive every round-trip.

Choices that matter:

- **Media is never fetched for browsing.** The list shows presence glyphs from metadata alone; the
  detail modal shows a placeholder card, and only an explicit «Відтворити» fetches a presigned URL
  and mounts the player — matching the Step 8 egress model. Expiry mid-session is handled by one
  silent re-fetch on playback error.
- **Uploads run the Step 8 flow verbatim**: save the exercise, then per staged file presign with
  `file.type`/`file.size` unchanged → XHR PUT (progress bar) with the exact Content-Type →
  finalize. Files are pre-checked against `MEDIA_RULES` from `@gart/shared` — the same table the
  API enforces — so oversized or wrong-type files fail instantly, client-side, with no presign. A
  media failure never loses the exercise: the row saves first, the error stays inline, saving again
  retries only the media.
- **Global exercises show no edit/delete affordances at all** — absent, not disabled, mirroring the
  API's 404 stance.
- Custom categories can be created inline from the form («+ Нова категорія…»); rename/delete stay
  API-only until a management UI is warranted.

## Exercise media

Uploads go **direct to storage** — the API never carries the bytes. It authorises an upload by
issuing a presigned PUT whose key, content type and byte count are all part of the signature, so
MinIO/S3 itself rejects an upload that deviates (verified live: wrong type → 403, wrong size → 403,
exact match → 200). The media record exists only after finalize re-verifies what actually landed:
existence, size, allowlisted type, and **magic bytes** — a well-formed request wrapping non-media
bytes is refused and the stray object deleted.

```
POST /exercises/:id/media/presign   own exercise only; type allowlist + size cap enforced
PUT  <presigned url>                browser → storage, constraints in the signature
POST /exercises/:id/media           finalize: verify object, then record
GET  /exercises/:id/media-url       short-lived play URL — trainer, or that trainer's client
DELETE /exercises/:id/media         own only; removes object and record
```

The rules, in one place ([media-types.ts](apps/api/src/exercises/media-types.ts)): `video/mp4`,
`video/webm` ≤ 100 MB; `audio/mpeg`, `audio/mp4` ≤ 20 MB. Keys are server-generated and random
under `exercises/{id}/{kind}/` — no user filename ever becomes a key, and finalize refuses a key
outside the exercise's own prefix. The bucket is private; nothing public-read exists, no permanent
URL ever leaves the API, and play URLs are presigned per request (10-minute TTL). Read access uses
the same `visibleTo` gate as everything else, through `TrainerOrClientGuard`: a trainer sees their
library, a client sees their trainer's.

**Cost model.** 100 MB ≈ 45–60 s of phone-quality 1080p — a demo clip cap, not a training film.
Storage is cents (20 GB per heavy trainer ≈ $0.30/mo); **egress is the real video cost**, since
every client view re-streams the clip. Hence: private presigned serving (no hotlinking), and prod
should sit on an egress-free S3 provider (R2/B2-class). Transcoding to a single ~720p rendition and
a thumbnail would hook into finalize later; a storage lifecycle rule for never-finalized objects is
recommended once volume warrants it.

Dev storage is MinIO in docker-compose (`localhost:9000`, console `:9001`); a one-shot `mc`
container creates the private `gart-media` bucket. Tests bind an in-memory fake to the
StorageService token — no bucket needed in CI.

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
