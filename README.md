# Developer Community Platform

I'm building a Developer Community Platform where members can authenticate, maintain a developer profile, publish posts, comment (threaded, with replies), react (like/dislike), and (eventually) search and browse ranked content. This repo covers the platform through Day 19 of my 20-day build plan. Days 1-12 are summarized in this paragraph; Days 13-17 (ranked and latest feeds, feed filters, full-text search, an AI post summarizer, and focused automated testing), Day 18 (session and security hardening: refresh tokens, `Secure` cookies, request limits) and Day 19 (the post purge job, and the Docker Compose setup with its release-candidate review) are in the Progress log below. Days 1-12: project foundations, authentication with role-based access, a full developer profile API and form, a Posts API with ownership, pagination, and admin moderation, the posts UI (infinite-scroll feed, post page, create/edit form), a threaded comments API (create, reply, list as a tree, cascade delete, and edit), and the comments UI itself (recursive reply/edit/delete, permission-gated, with full keyboard focus management), and the reaction engine on the backend (like/dislike on posts and comments with toggle behaviour, a unique index, and concurrency-safe counters; the reaction buttons with optimistic updates and a "who reacted" overlay are the Day 12 frontend on top of it). After Day 8 I also restructured the frontend into a feature-first layout (see the Day 8 section under Progress).

## Stack

- **Backend:** NestJS 12, MongoDB via Mongoose 9 (Atlas, or the `mongo:8` container in Docker Compose), class-validator/class-transformer, Passport-JWT, bcrypt, Swagger.
- **Frontend:** Next.js 16 (App Router), React 19, TanStack Query, axios, Tailwind CSS v4.

## Project structure

- `backend/` — NestJS API (`src/<feature>/` modules: `auth`, `users`, `profiles`, `posts`, `comments`, `reactions`, `summarizer`, `audit`, `notifications`, `health`; shared code in `src/common/`).
- `frontend/` — Next.js app, all source under `frontend/src/`: `app/` (thin routes), `features/<name>/` (auth, posts, comments, reactions, profile, users, audit, notifications, health), `services/api/` (the only code that calls the backend), `lib/`, `components/`, `hooks/`, `providers/`, `constants/`. The layout and data flow are described under Day 8 in Progress.
- `compose.yaml` and `.env.example` (repo root) — Docker Compose for MongoDB, the backend and the frontend, plus a one-off `seed` service for the first admin. See Running with Docker Compose.
- `docs/` — per-day spec and plan files, and a product requirements doc (local reference, not part of the public repo).
- `PROJECT_REPORT.md` — a detailed architecture and decisions write-up of the system as it stands today.
- `AI_USAGE.md` — how I used AI tooling on this project, and what I personally reviewed and caught.

## Getting started

**Requirements:** Node.js 24 with npm, and a MongoDB database (an Atlas cluster, or use Docker Compose below, which brings its own). The Docker images run `node:24-slim` and I develop on Node 24.21.0. The version is pinned only in the two Dockerfiles: the repo has no `engines` field and no `.nvmrc`, so a local install is not checked.

### 1. Clone and install

```bash
git clone https://github.com/abrar-faseeh01/Dev-Community.git
cd Dev-Community
```

The repository is public, so the HTTPS URL needs no token to clone.

### 2. Backend

```bash
cd backend
npm install
```

Create `backend/.env` (see `backend/.env.example`):

```env
MONGODB_URI=your_mongodb_connection_string
PORT=3000
JWT_SECRET=a_random_string_at_least_32_characters_long
JWT_REFRESH_SECRET=a_different_random_string_at_least_32_characters_long
JWT_EXPIRES_IN=15m
FRONTEND_ORIGIN=http://localhost:3001
```

`MONGODB_URI`, `JWT_SECRET` and `JWT_REFRESH_SECRET` are required — the app fails fast at startup if any is missing, if either secret is under 32 characters, or if the two secrets are equal (`backend/src/config/env.validation.ts`). Everything else has a default: `PORT` 3000, `JWT_EXPIRES_IN` (the access token) 15m, `JWT_REFRESH_EXPIRES_IN` 7d, `COOKIE_REFRESH_PATH` `/auth`, `COOKIE_SECURE` follows `NODE_ENV`, and `FRONTEND_ORIGIN` `http://localhost:3001` (it must be set when `NODE_ENV=production`).

Signup sends a welcome email through a background queue, which needs Redis, and locally the email goes to Mailpit, a fake SMTP server with a web inbox. Start both from the repo root (they need no `.env`):

```bash
docker compose up -d redis mailpit
```

`backend/.env.example` already points at them (`REDIS_HOST=localhost`, `SMTP_HOST=localhost`, `SMTP_PORT=1026`). The emails show up at `http://localhost:8025`. Without Redis the backend still starts and signup still works, but each signup waits 2 seconds for the queue and its welcome email is lost (see Known limitations).

```bash
npm run start:dev
```

The backend runs on `http://localhost:3000`. API docs are at `http://localhost:3000/docs` (Swagger). The queue dashboard (Bull Board) is at `http://localhost:3000/admin/queues`, for a signed-in admin only.

#### Bootstrapping the first admin

Signup (`POST /auth/signup`) always creates a `user`-role account — there's no way to create an `admin` through the API. To create the first admin, add these to `backend/.env` temporarily:

```env
ADMIN_FULLNAME=Admin Name
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=a_strong_password
```

Then run:

```bash
npm run seed:admin
```

This creates one `admin` account if none exists yet — it's a no-op if an admin already exists. You can remove the three `ADMIN_*` vars from `.env` afterward; they're only read by this script, never by the running app.

### 3. Frontend

In another terminal, from the project root:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

```bash
npm run dev
```

The frontend runs on `http://localhost:3001`.

## Running with Docker Compose

`compose.yaml` at the repo root runs MongoDB, Redis (the job queue), Mailpit (a fake SMTP server with a web inbox), the backend and the frontend together, so nothing needs installing except Docker. It does not read `backend/.env` or `frontend/.env.local`: the backend's settings are in `compose.yaml` itself, and the two JWT secrets come from a `.env` file next to it. A one-off `seed` service (profile `tools`) creates the first admin.

**Prerequisites:** Docker with Compose v2 (`docker compose`), internet access for the first build (base images from Docker Hub, and the frontend build downloads the Geist font from Google Fonts), and ports 3000, 3001, 27017, 6379, 1026 and 8025 free. Use Chrome, Edge or Firefox (see the limitations at the end of this section).

### 1. Create the root `.env`

The backend needs two secrets of at least 32 characters, and they must differ. In PowerShell, from the repo root, this writes them to `.env` without printing them:

```powershell
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
function New-Secret { $b = New-Object byte[] 36; $rng.GetBytes($b); [Convert]::ToBase64String($b) }
Set-Content -Path .env -Encoding ascii -Value @("JWT_SECRET=$(New-Secret)", "JWT_REFRESH_SECRET=$(New-Secret)")
```

In a POSIX shell: `printf 'JWT_SECRET=%s\nJWT_REFRESH_SECRET=%s\n' "$(openssl rand -base64 36)" "$(openssl rand -base64 36)" > .env`. `.env.example` shows the two keys; `.env` is git-ignored. Without them, `docker compose` refuses to start with "Set JWT_SECRET in the root .env".

### 2. Build and start

```bash
docker compose up -d --build
docker compose ps
```

The first build takes several minutes. When it is done, `docker compose ps` shows `mongo`, `redis`, `mailpit`, `backend` and `frontend` as `Up … (healthy)`; a start with the images already built takes about 15 to 30 seconds. The order is enforced: the backend waits for a healthy Mongo and Redis and a started Mailpit, and the frontend waits for a healthy backend.

| What | URL |
|---|---|
| Frontend | `http://localhost:3001` |
| Backend API | `http://localhost:3000` |
| Swagger docs | `http://localhost:3000/docs` |
| Health check | `http://localhost:3000/health` |
| Welcome emails (Mailpit inbox) | `http://localhost:8025` |

Inside the Compose network the backend reaches Redis at `redis:6379` and Mailpit at `mailpit:1025` (the container's own SMTP port; 1026 is only the mapping on the host). The backend runs with `NODE_ENV=production`, so the queue dashboard at `/admin/queues` is off and answers 404; add `BULL_BOARD_ENABLED: "true"` to the backend's `environment:` to turn it on (admins only).

Use `localhost`, not `127.0.0.1`: the backend allows exactly the origin `http://localhost:3001`.

### 3. Create the first admin

Signup always creates a regular member, so the first admin comes from the `seed` service. Pass the credentials from the shell for this one command; do not put them in `.env`.

```powershell
$env:ADMIN_FULLNAME = "Admin"
$env:ADMIN_EMAIL = "admin@example.com"
$env:ADMIN_PASSWORD = "<a strong password>"
docker compose run --rm --build seed
Remove-Item Env:ADMIN_FULLNAME, Env:ADMIN_EMAIL, Env:ADMIN_PASSWORD
```

In a POSIX shell, put the three variables in front of the `docker compose run --rm --build seed` line instead. It prints `Admin created: <email>`. Running it again prints `Admin already exists … Nothing to do` and changes nothing. The script is `backend/scripts/seed-admin.ts`; it reads only `MONGODB_URI` (set by `compose.yaml`) and these three variables.

### Stopping, resetting and cleaning up

- `docker compose stop` stops the containers; `docker compose down` removes them. Both keep the database, because it lives in the named volume `devcommunity_mongo-data`. The services have no restart policy, so after a reboot run `docker compose up -d` again.
- `docker compose down -v` also deletes that volume: every user, post and comment, and the seeded admin, are gone. Use it only to start from an empty database.
- After a change to the code, run `docker compose up -d --build`. `NEXT_PUBLIC_API_URL` is a build argument of the frontend image (the browser reads it from the bundle), so changing it needs a rebuild of the frontend, not just a restart.
- `down` does not remove everything. The Mongo image declares an anonymous volume for `/data/configdb`, and each time the Mongo container is recreated another one is left behind. `docker volume ls` lists them. `docker volume prune` removes unused anonymous volumes only (Docker 23 and later; it never touches `devcommunity_mongo-data` unless you add `-a`). `docker image prune` removes dangling images. The seed image is tagged, so `docker image prune` leaves it: remove it with `docker image rm devcommunity-seed` when you no longer need it.

### Running the backend e2e specs against the Compose Mongo

The e2e specs (`backend/test/*.e2e-spec.ts`) need a real database and are skipped unless `RUN_E2E=1`. With the stack up, run them from `backend/` against a separate database name so they cannot touch your data, and run them on their own (a run alongside other work on the same Mongo can exceed the 60-second hook timeout). With no `backend/.env`, the JWT secrets come from the process environment. In PowerShell:

```powershell
cd backend
npm ci
Get-Content ..\.env | ForEach-Object { if ($_ -match '^(JWT_SECRET|JWT_REFRESH_SECRET)=(.+)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }
$env:RUN_E2E = "1"
$env:NODE_ENV = "test"
$env:FRONTEND_ORIGIN = "http://localhost:3001"
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/devcommunity_e2e"
npm run test:e2e
```

The specs clean up after themselves. To drop the database afterwards: `docker compose exec mongo mongosh --quiet --eval "db.getSiblingDB('devcommunity_e2e').dropDatabase()"`. Port 27017 is published on `127.0.0.1` only, for exactly this.

### Ports, the project name and running two copies

The project name (`devcommunity`) and the host ports 3000 (backend), 3001 (frontend), 27017 (Mongo), 6379 (Redis), 1026 (Mailpit SMTP) and 8025 (Mailpit inbox) are fixed in `compose.yaml`. Mongo, Redis and Mailpit are published on `127.0.0.1` only. Mailpit's SMTP port is 1026 on the host because Windows blocked 1025 on my machine. Two checkouts therefore cannot run at the same time: they would share one project, one network and one database volume. The dev servers (`npm run start:dev`, `npm run dev`) use the same ports and must be stopped first, and a second copy needs a different `name:` as well as different ports.

If a port is already taken, Docker refuses to start that container with a "ports are not available … bind" error, and the services that depend on it are not started. Nothing reads the ports from the environment, so you change `compose.yaml` itself. Change only the left-hand (host) side of a mapping, such as `"3002:3001"`:

- A different frontend port also needs `FRONTEND_ORIGIN` to be the new browser URL (for example `http://localhost:3002`), because the backend allows exactly that one origin.
- A different backend port also needs the `NEXT_PUBLIC_API_URL` build argument of the frontend to be the new browser URL (for example `http://localhost:3005`), and then `docker compose up -d --build`.
- A different Mongo port only matters for tools on your machine, such as the e2e `MONGODB_URI` above.

### Limits of the Compose setup

- It works over `http://localhost` only. In production mode the backend forces `Secure` cookies and refuses `COOKIE_SECURE=false`. Chrome, Edge and Firefox accept `Secure` cookies from `http://localhost`; Safari rejects them over plain HTTP, so sign-in does not stick there. A real deployment needs HTTPS and a `FRONTEND_ORIGIN` that matches it.
- `http://127.0.0.1:3001` does not work: the backend answers every origin with the `http://localhost:3001` origin, so the browser rejects it.
- The summarizer runs on the built-in mock, because no Gemini key is passed through. Add `SUMMARIZER_PROVIDER` and `SUMMARIZER_API_KEY` to the backend's `environment:` in `compose.yaml` to use Gemini.
- The rest of the list is under Known limitations, in the Day 19 subsection.

## Testing

Run each command from the app's own folder, after `npm ci` (or `npm install`). Nothing in this table needs Docker.

| | Backend (`backend/`) | Frontend (`frontend/`) |
|---|---|---|
| Lint | `npm run lint` (oxlint on `src/` and `test/`) | `npm run lint` (eslint) |
| Unit and component tests | `npm test` (Jest) | `npm test` (Jest and React Testing Library) |
| Production build | `npm run build` (`nest build`) | `npm run build` (`next build`) |
| End-to-end tests | `npm run test:e2e`, with `RUN_E2E=1` | none |

At Day 19 that was 360 backend unit tests in 19 suites, 315 backend e2e tests in 17 suites, and 624 frontend tests in 60 suites, with lint and both builds clean.

- **Neither suite needs Redis or Mailpit.** The unit tests stub the queue and the mail service. The e2e app (`test/helpers/e2e-app.ts`) replaces the mail queue with an in-memory recorder, `MailService` with a fake that sends nothing, and the queue worker with an empty object, so a test run never connects to Redis (checked with Redis stopped and a listener on port 6379: no connection) and never sends mail. Signup's e2e test reads the recorder to check that exactly one welcome job, carrying only the user id, was added.
- **The unit tests need no database and no `.env`.** The backend's Jest runs with `--experimental-vm-modules` (the script sets it), so Node prints an "ExperimentalWarning: VM Modules" line; that is expected.
- **The frontend build needs internet** (it downloads the Geist font from Google Fonts) and `NEXT_PUBLIC_API_URL` set, for example from `frontend/.env.local`. Without it the build still passes, but the bundle sends every request to the wrong origin.
- **The e2e specs need a real MongoDB** and are skipped unless `RUN_E2E=1`; a skipped run says so and is not a pass. Outside Docker you need `MONGODB_URI` pointing at a database you can write to (an Atlas cluster, or the Compose Mongo as described under Running with Docker Compose), plus `JWT_SECRET` and `JWT_REFRESH_SECRET`, from `backend/.env` or from the shell (shell variables win over `backend/.env`). Use a database name of its own, such as `devcommunity_e2e`. The specs create throwaway users and delete everything they made; they never call Gemini (the mock summarizer is forced) and the purge job is off. In PowerShell:

  ```powershell
  cd backend
  $env:RUN_E2E = "1"
  $env:MONGODB_URI = "mongodb://127.0.0.1:27017/devcommunity_e2e"
  npm run test:e2e
  ```

  In a POSIX shell, put `RUN_E2E=1 MONGODB_URI=… ` in front of `npm run test:e2e`.
- **Run the e2e suite on its own.** It runs one file at a time (`maxWorkers: 1`) with a 60-second timeout per hook and test, and a run alongside other work against the same database can exceed that.

## Environment variables

Real `.env` files are gitignored in both apps. Use the committed example files as the source of truth:

- `backend/.env.example` — `MONGODB_URI`, `PORT`, `NODE_ENV`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRES_IN`, `COOKIE_SECURE`, `COOKIE_REFRESH_PATH`, `FRONTEND_ORIGIN`, the first-admin variables `ADMIN_FULLNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`, plus four optional summarizer settings: `SUMMARIZER_PROVIDER` (`mock` or `gemini`), `SUMMARIZER_API_KEY`, `SUMMARIZER_MODEL` (default `gemini-3.5-flash-lite`) and `SUMMARIZER_TIMEOUT_MS` (default 10000, allowed 1000-15000). With no key the app uses the built-in mock summarizer, so nothing needs configuring to run it. Three more optional settings control the post purge job (Day 19): `POST_PURGE_ENABLED` (default `true`), `POST_PURGE_RETENTION_DAYS` (whole days, 1-365, default 7) and `POST_PURGE_CRON` (a cron expression with 5 or 6 fields, default `0 3 * * *`, so every day at 03:00 server time). An invalid value, including a cron expression that doesn't parse, stops the app at startup. The welcome-email queue adds (all optional): `REDIS_HOST` (default `localhost`) and `REDIS_PORT` (6379); `SMTP_HOST` (default `localhost`), `SMTP_PORT` (default 1025; set 1026 for the Compose Mailpit from the host) and `MAIL_FROM`; `MAIL_CONCURRENCY` (emails sent at once, 1-50, default 5); `BULL_BOARD_ENABLED` (the `/admin/queues` dashboard; default on, except in production where it is off unless `true`). Four more are test switches for measuring the queue, and the app refuses to start in production with any of them on: `MAIL_MODE` (`queue`, the default, or `sync`, where signup sends the email itself and waits), `MAIL_DELAY_MS` (a delay before each send, 0-10000), `MAIL_FAILURE_RATE` (the share of sends that fail on purpose, 0-1) and `THROTTLE_DISABLED` (turns every rate limit off, for load tests).
- `frontend/.env.example` — `NEXT_PUBLIC_API_URL`.
- `.env.example` (repo root) — `JWT_SECRET` and `JWT_REFRESH_SECRET` for Docker Compose, which does not read the two files above. The first-admin variables `ADMIN_FULLNAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD` are read only by the seed script (`backend/.env.example` documents them).

## Authentication and roles

- A short-lived JWT (`{sub, email, role}`, 15 minutes by default) is issued on login and stored in an **httpOnly cookie** (`access_token`) — never in a client-readable form, and never sent as an `Authorization` header. A second httpOnly cookie, `refresh_token` (a separate JWT with its own secret, 7 days by default, sent only to the auth routes through `COOKIE_REFRESH_PATH`, default `/auth`), lets the frontend get a new access token from `POST /auth/refresh` when the first one expires, without asking the user to sign in again. Only a hash of each refresh token is stored, per device (up to 5 devices; a sixth login signs out the oldest), and logging out revokes that device's token. Both cookies are `SameSite=Lax`, and `Secure` follows `NODE_ENV` (on in production, where `COOKIE_SECURE=false` is rejected). The frontend's axios client sets `withCredentials: true`, so the browser attaches the cookies on every request.
- Roles are `admin | user`. Every signup is hard-coded to `role: "user"` server-side — there's no field a client can send to self-promote.
- Every route requires a valid session by default; only routes explicitly marked `@Public()` (signup, login, refresh, logout, health, and the public reads of posts, comments and reactions) skip that check.
- `PATCH /auth/me` (change your own password, full name, or — admin-only — email) always re-verifies your current password before applying any change, and re-issues both session cookies on success. Every other device's refresh token is revoked, so those devices are signed out once their access token expires.

## API reference

Every response follows one shape: `{success: true, data}` on success, or `{success: false, statusCode, message, errors}` on failure.

### Health

| Method & path | Access |
|---|---|
| `GET /` | Public |
| `GET /health` | Public — reports API and database connectivity |

### Auth (`/auth`)

| Method & path | Access | Notes |
|---|---|---|
| `POST /auth/signup` | Public | Throttled |
| `POST /auth/login` | Public | Sets the `access_token` and `refresh_token` cookies; throttled (5 a minute per IP) |
| `POST /auth/refresh` | Public (needs the `refresh_token` cookie) | Sets a new `access_token` cookie; the refresh token is not rotated. A missing, invalid, expired or revoked token is a `401` and clears both cookies; throttled (20 a minute per IP) |
| `POST /auth/logout` | Public | Clears both cookies and revokes this device's refresh token; always succeeds |
| `GET /auth/me` | Authenticated | Current user, read fresh from the database |
| `PATCH /auth/me` | Authenticated | Change password / full name / (admin-only) email; requires `currentPassword` |

### Profiles (`/profile`)

| Method & path | Access | Notes |
|---|---|---|
| `GET /profile/me` | Authenticated | Your own full profile: headline, bio, skills, experiences, portfolio projects |
| `PATCH /profile/me` | Authenticated | Update your own headline/bio/skills/portfolioProjects |
| `GET /profile/:id` | Authenticated | View any member's full profile |
| `PATCH /profile/:id/skills` | Owner or admin | Full replace |
| `PATCH /profile/:id/headline` | Owner or admin | |
| `PATCH /profile/:id/bio` | Owner or admin | |
| `PATCH /profile/:id/portfolio-projects` | Owner or admin | Full replace |
| `POST /profile/:id/experiences` | Owner or admin | Adds one experience entry |
| `PATCH /profile/:id/experiences/:experienceId` | Owner or admin | Partial update of one entry |
| `DELETE /profile/:id/experiences/:experienceId` | Owner or admin | |

An admin acting on someone else's profile through any of the write routes above is audit-logged and the affected user is notified; editing your own profile produces neither. No profile route ever accepts `email`, `password`, or `role`.

### Posts (`/posts`)

| Method & path | Access | Notes |
|---|---|---|
| `POST /posts` | Regular members only | Author is always the caller, never client-supplied. An admin gets `403` — admins moderate but don't author |
| `GET /posts` | Public | Cursor-paginated feed; `?limit=` (1-50, default 10), `?cursor=`, optional `?authorId=` (one author's posts, used by "Posts made by you"), and `?sort=latest\|top\|discussed` (default `latest`) |
| `GET /posts/search` | Public | Full-text search of titles and bodies: `?q=` (required, 1-100 characters) and `?limit=` (1-20); returns `{items, hasMore}`; throttled (40 a minute per IP) |
| `GET /posts/:id` | Public | A soft-deleted post 404s the same as a nonexistent one |
| `PATCH /posts/:id` | Owner or admin | Partial update — at least one of `title`/`body` required |
| `DELETE /posts/:id` | Owner or admin | Soft delete (`deletedAt`) — excluded from every read path afterward, and hard-deleted by the purge job once it has been deleted for 7 days (Day 19) |
| `POST /posts/:id/summarize` | Any signed-in user, admins included | Returns `{summary, tags, truncated, source}` (`source` is `mock` or `gemini`). `422` for a body under 200 characters, `400`/`404` for a bad or missing/soft-deleted post, `429` over 10 a minute per IP, `502`/`503`/`504` when the summarizer returns something unusable, is unavailable, or times out. Nothing is stored |

The list response shape is `{items, nextCursor}` — pass the previous response's `nextCursor` as `?cursor=` to get the next page; `nextCursor: null` means there are no more posts. Every write on `PATCH`/`DELETE` uses optimistic concurrency: a genuine conflicting concurrent edit returns `409`, never a silent overwrite. An admin editing or deleting someone else's post is audit-logged (identifying the specific post, not just the author) and the author is notified; a self-edit or self-delete produces neither.

`sort=latest` is unchanged (newest first, cursor on `_id`). `sort=discussed` orders by `commentCount` descending. `sort=top` ranks by a Wilson-score lower-bound confidence interval on the like/dislike ratio (weight 100) plus 2 points per comment, no time decay — `latest` already covers recency, so `top` ranks all-time engagement on purpose. Every post also carries `rankScore`: the exact value `sort=top` sorted it by, `null` under the other two sorts. `discussed` and `top` share one cursor format, distinct from `latest`'s; a cursor from one sort is rejected (`400`) if replayed against another.

### Comments (`/posts/:postId/comments`, `/comments/:id`)

| Method & path | Access | Notes |
|---|---|---|
| `POST /posts/:postId/comments` | Regular members only | Creates a top-level comment, or a reply when `parentCommentId` is given. A reply is accepted at any depth — there's no creation-time limit on how many times people can reply to each other |
| `GET /posts/:postId/comments` | Public | The whole tree for the post: top-level comments newest-first, each with its full reply thread (oldest-first) nested up to 2 levels; anything deeper still appears, flattened under its thread's root, keeping its real `parentCommentId` |
| `DELETE /comments/:id` | Comment author, the post's author, or an admin | Cascade: deletes the comment and every reply beneath it in one operation. An admin deleting someone else's comment is audit-logged and the author is notified; a post's own author removing someone else's comment is not |
| `PATCH /comments/:id` | Comment author only | Edits the body. No admin or post-owner override, unlike delete — nobody else may rewrite someone's words. Returns `{id, body, updatedAt}`, not the full comment |

Comments never expose the internal `ancestorIds` path or `deletedAt`. `Post.commentCount` is kept accurate through create and delete, including under concurrent requests. Deleting a post soft-deletes all of its own comments too.

### Reactions (`/posts/:id/reaction`, `/comments/:id/reaction`)

| Method & path | Access | Notes |
|---|---|---|
| `POST /posts/:id/reaction` | Regular members only | Body `{ "type": "like" \| "dislike" }`. One toggle for every change: no reaction creates it, the same type again removes it, the opposite type switches it in place (one counter down, the other up). Returns `{likeCount, dislikeCount, myReaction}` — the counts after the change and the caller's own reaction (`null` after a remove). `404` for a missing or deleted post, `403` for an admin. |
| `POST /comments/:id/reaction` | Regular members only | Same body, behaviour and response, for a comment. |
| `GET /posts/:id/reactions` | Public | Who reacted: `{ items: [{ user: { id, fullName, headline }, type }], likeCount, dislikeCount }`. Most recent reaction first, at most 50. `?type=like` or `?type=dislike` narrows the list. The two counts are the post's true totals, unaffected by the filter or the cap, so a client can say "showing 50 of 812". `404` for a missing or deleted post, `400` for a malformed id, an unknown `type` or any other query parameter. |
| `GET /comments/:id/reactions` | Public | Same list, parameters and response, for a comment. |

The reactor lists are public because the post or comment they belong to is public. Only a user's id, name and headline are returned (the same fields an author already exposes), and an account that has since been deleted shows as the `Deleted user` placeholder. They are served by a second index on `{targetType, targetId, createdAt}`; the unique index starts with `userId`, so it cannot serve a lookup by target.

It is a `POST` that returns `200`, not an idempotent `PUT`: sending the same request twice gives a different result (react, then un-react). A user has at most one reaction per post or comment, enforced by a unique database index, not only by the code.

`GET /posts`, `GET /posts/:id` and `GET /posts/:postId/comments` stay public and now also return `myReaction` on every post and comment: the signed-in caller's own reaction, or `null` for an anonymous reader (a missing, invalid or expired cookie is treated as anonymous, not a `401`). The feed and the comment tree fetch all of a page's or thread's reactions with one query. `PATCH /posts/:id` returns it too; a just-created post or comment returns `null`.

### Users / admin (`/users`)

| Method & path | Access | Notes |
|---|---|---|
| `GET /users` | Admin only | Full user list |
| `DELETE /users/:id` | Admin only | Refuses to delete any admin account, including by another admin |

### Admin (`/admin`)

| Method & path | Access |
|---|---|
| `GET /admin/audit-log` | Admin only — full audit trail, newest first |

### Notifications (`/notifications`)

| Method & path | Access | Notes |
|---|---|---|
| `GET /notifications` | Authenticated | Your own notifications only |
| `GET /notifications/unread-count` | Authenticated | Your own count only |
| `PATCH /notifications/:id/read` | Authenticated | 404s if the id isn't yours |

## Admin capabilities

Beyond the base member experience, an admin can:

- List every user and delete a non-admin account (`/admin/users` page).
- Edit any member's skills, experiences, headline, bio, and portfolio projects, and rename any non-admin member (`/profile/edit/[id]` page), with an optional reason recorded on each action.
- Edit or soft-delete any member's post from the post page, through the same edit form and delete dialog a member uses (marked "as admin", with an optional reason recorded on each action). There's no separate admin panel for posts.
- Review a full, append-only audit trail of every override action taken by any admin, with expandable before/after detail (`/admin/audit-log` page).

Every admin-override action creates one audit-log entry (who, what changed, before/after state, optional reason) and one in-app notification for the affected member.

## Known limitations

- No "log out everywhere" button. Logging out revokes that device's refresh token, and a password or credentials change revokes every other device's, but an access token someone has copied stays valid until its 15 minutes run out. Deleting an account ends its sessions at once, since every request re-reads the account from the database.
- No in-app way to promote a user to admin — the only path is the one-time `seed:admin` script (under Docker, the `seed` service: `docker compose run --rm --build seed`) or a direct database edit.
- No pagination on the admin user list, the audit log, or the notification list.
- No email verification on signup and no password-reset flow.
- Notifications are polled (every 45 seconds while the app is open and the tab is visible), not pushed in real time.
- No search or filtering on the admin user list or profile viewing — the full list is returned and any narrowing happens client-side, if at all.
- The posts list response carries every post's full `body` (there's no excerpt field), so a page of long posts is a large response; the feed cards only truncate visually.
- The feed API has `sort=latest|top|discussed` (Day 13) with a dropdown to choose between them (Day 14), plus a debounced, cancellable search box (Day 15) — no filtering beyond that. `commentCount` is accurate and rendered, in the comments section's "Comments (N)" heading.
- `sort=top` scores every matching post live in a Mongo aggregation rather than from a stored/indexed field, so it's a full collection scan past the `authorId` case (which does narrow via an index before scoring runs). Fine at this project's scale; a denormalized `rankScore` updated alongside the existing like/dislike/comment counters is the future optimization, not built.
- `sort=discussed` combined with `?authorId=` uses its index for ordering but isn't selective for one author — cost scales with the total post count, not that author's.
- `sort=top` has no time-decay term by design (`sort=latest` covers recency separately), so a highly-engaged old post can permanently outrank a fresh one with fewer votes under `sort=top`.
- `frontend/src/middleware.ts` still uses Next.js 16's deprecated `middleware` name (the current name is `proxy`); it works, and the rename is deliberately left as its own change.
- Soft-deleted posts are hard-deleted by a scheduled job once they have been deleted for 7 days (Day 19; see its entry under Progress). There is no restore path, so the 7 days is only a safety net for someone with database access. The job's limitations are listed with that entry.
- Admin-override actions (profile edits, post edits/deletes) aren't wrapped in a database transaction — if the audit-log/notification write fails after the underlying change already saved, the change persists with no audit trail. Not yet hit in practice; the guard that does fire (optimistic concurrency on a genuine conflicting edit) correctly returns `409`, not `500`.
- Server errors are logged thinly. For any response with a status of 500 or above, the global exception filter writes one line, `METHOD path -> status ErrorName`, plus the error's `code` when it has one. It deliberately leaves out the message, the stack, the query string and the body, because a driver's message can hold user data (a duplicate-key error quotes the email), and the client gets a generic message for an unexpected error. A genuine production bug therefore usually has to be reproduced, since the log names the error type but not its cause. There is no per-request logging.
- `GET /posts/:postId/comments` returns the whole tree with no pagination, so the response is unbounded on a very active post.
- Editing a comment keeps no history — only the current body is stored, and the "edited" signal is just `createdAt` differing from `updatedAt`.
- A reply created at the exact instant a concurrent delete cascades past it can end up live under a deleted parent: invisible in the tree but still counted, so `commentCount` can read one higher than what's shown. The count itself isn't wrong; fixing this fully needs multi-document transactions, which this backend doesn't have configured.
- Two deletes of the same comment subtree that truly overlap can each return a partial `deletedCount`, though the total decrement to `commentCount` is always exact (measured by forcing six simultaneous deletes together 25 times).
- When a post's own author removes someone else's comment, there's no audit entry and the comment's author isn't told — only an admin's removal is logged.
- No notification yet when someone comments or replies on a post.
- The comment routes have no route-specific rate limit. Only the global default applies: 100 requests a minute per IP, counted separately for each route.
- Deleting a user account doesn't yet remove or reassign their comments — they still show up, with the author shown as "Deleted user".
- Reactions from a deleted account stay in the database and keep counting toward the counters; nothing removes them. Reactions on a soft-deleted post and on its comments stay for the 7 days before the purge job removes them with the post; reactions on a comment that was soft-deleted on its own, under a post that is still live, are never removed.
- The reaction row and its counter are two separate writes with no transaction, so a server crash between them can leave a counter one off. A counter whose update fails while the server is running is repaired by a recount from the reaction rows; a crash is not.
- A counter that has drifted below zero is shown as `0` but is not corrected in storage.
- Signed-in reads (feed, post, comment tree) cost one extra user lookup for the session check, plus one reactions query per page or thread.
- Two reactions that settle in the same tick can each see the other as still in flight, and both skip the extra refetch after settling. The server's counts written on success keep the cache correct, so this only delays a reconcile.
- A failed reaction restores the snapshot taken when it started, so a change made to the same cache entry during that one request (for example a new post added to the feed) is not kept by the rollback.
- A reaction made in another browser or account does not appear until the feed is refetched: there is no polling or push, `refetchOnWindowFocus` is off, and posts go stale after 30 seconds. To test with two accounts, use two different browsers, because the session cookie is shared between tabs.
- The "who reacted" lists are capped at the 50 most recent, with no way to page further; the overlay says "Showing the 50 most recent of N" when there are more. They are ordered by when someone first reacted, so switching from like to dislike does not move them up.
- The "who reacted" lists are public, so who disliked a post or comment is visible to anyone who can read it. Making them sign-in only is a one-line change (drop `@Public()` on the two routes) if that turns out to matter.
- The summary line above the buttons ("You and 15 others reacted.") never names anyone: the list of people is only fetched when the overlay opens, so a name would need it fetched up front.
- If a reader's session expires while a comment composer or reply form is already open, the `401` on submit hard-redirects to `/login` before the typed text can be saved anywhere — fixed by Day 18's refresh-token flow.
- `ConfirmDialog`'s focus-restore on close is guarded against a removed element, but doesn't pick a replacement target itself — that's each caller's job. Comment delete does this (focuses the parent comment, or the heading for a root); deleting a post from "Posts made by you" doesn't yet.
- Summaries are never stored: every `POST /posts/:id/summarize` is computed fresh, so repeated clicks repeat the call (and spend model quota). I chose that over a cached field so an edited post can't show a stale summary and a manipulated one can't persist for every reader; the cost is only limited by the throttle.
- Without a key, the "summary" is the first two sentences of the post and the tags come from a fixed keyword list. That is extractive text matching, not a model, which is why the response carries `source: "mock"`. The keyword match is crude: a post that uses the verb "react" gets a React tag.
- A body over 8000 characters is cut to its first 8000 before summarizing (`truncated: true`), so anything later in a long post is never seen. A body under 200 characters is rejected with `422` rather than summarized.
- A tag from the summarizer that fails the checks (1-30 characters; letters, digits, space and `. + # / -`) is dropped silently, and only the first 5 valid tags are kept. The response is rejected (`502`) only when the summary is unusable or no valid tag is left. Dropped tags are counted in the server log, not shown to the user.
- The post body is untrusted text sent to a model, so it can try to steer the summary. I reduced that (the post is sent as JSON data after fixed instructions, no tools or secrets are in play, output is validated, and the result is rendered as plain text and shown only to the requester) but it can't be ruled out.
- Gemini's quota is shared by the whole project, not per user, so the 10-a-minute-per-IP throttle cannot guarantee it is never exceeded. When Google answers `429` (a per-minute limit or the day's quota used up, which resets at midnight Pacific), the endpoint returns `503` "temporarily unavailable". A retry right away may not help.
- For a post that is random text with nothing to summarize, the model is told to answer exactly "This post contains random and no meaningful content" with the tag `general`. That is an instruction to the model, not a check on my side, so the wording can still vary on a given call, and the mock summarizer cannot tell gibberish apart at all (it just returns the post's first sentences).
- On Gemini's free tier, Google may use submitted content to improve its products. Only a post's title and body are sent, never the author or the caller, but those are still sent.
- Leaving the page while a summary is being generated discards the result on the client, but the server call still completes and still counts against the quota.
- The frontend splits the summary into bullets by sentence ends, so an abbreviation such as "e.g. " ends up as two bullets. The API sends the summary as one plain string, and I kept that contract rather than change the backend for the layout.
- At Day 17 the 5-a-minute limit on signup and login was not covered by any automated test: the shared e2e app replaces the throttler's storage with one that never counts, so a `429` could not be provoked there, and I had only checked it by hand. Day 18 added `test/rate-limits.e2e-spec.ts`, which runs its own app with the real throttler and covers the `429` on login, signup, refresh, credential changes, search and summarize.
- At Day 17 the e2e login test checked the cookie's `HttpOnly`, `SameSite=Lax` and `Max-Age` flags but not `Secure`, because the controller then set `secure: false` for local http. Since Day 18 `Secure` follows `NODE_ENV` (on in production, and `COOKIE_SECURE=false` is rejected there), and `test/cookies-secure.e2e-spec.ts` covers it on login, refresh, credential changes and logout.
- A summarize request that times out and being offline look the same to the frontend (both arrive with no HTTP status), so one message covers both. A summarizer that is slow, as opposed to the server being unreachable, comes back as the server's own `504` and gets its own message.

### Welcome email queue

- **A crash between sending an email and recording it can send it twice.** The worker sends, then sets `welcomeEmailSentAt`. If the process dies after the SMTP server accepted the email but before that write, the job is retried after the restart and the user gets a second email. Every other retry, and a duplicate job, is skipped by that marker (tested: a second job for a user who already had the email sent nothing).
- **A job that fails all 5 attempts is dropped.** Nothing retries it later. The worker logs it at error level with the user id (not the address), and it stays in the queue's failed list for 24 hours, where an admin can retry it from Bull Board. With a 30% simulated failure rate this happened to 0 or 1 job per 100, close to the expected 0.3⁵ ≈ 0.24% per job.
- **With Redis down, signup still succeeds but the email is lost.** Adding a job does not fail when Redis is unreachable, it waits, so signup gives up on the queue after 2 seconds, logs the user id, and returns 201. No email is sent for that user later.
- **The worker runs inside the API process.** There is no separate worker to scale or restart on its own, and the sends share the API's event loop and thread pool.
- **Unexplained multi-second signup stalls, seen only in queue mode.** In some queue-mode load runs a few signups took 5 to 10 seconds while the median stayed normal (two runs at 30 signups 2 at a time, and one of the two 100-signup runs at worker concurrency 5). I never saw it in sync mode, and I did not find the cause.
- **After a crash, the jobs that were in flight wait about 60 seconds.** Their lock has to expire and the stalled-job check (every 30 seconds) has to pass before the restarted worker picks them up. Nothing is lost; it is only late (tested: 40 of 40 users got exactly one email).

### Docker release candidate (Day 19)

**Launch blockers: none found** (final check from a fresh clone of `beta`, 2026-10-06; written up 2026-10-07). Everything below is a known limitation, with its impact and a workaround.

- **HTTP on localhost only.** Compose runs the backend in production mode, which forces `Secure` cookies. Chrome, Edge and Firefox accept them from `http://localhost`; Safari rejects them over plain HTTP, so sign-in does not stick there. `http://127.0.0.1:3001` is blocked by CORS: the backend answers every origin with the `http://localhost:3001` origin, so a browser on any other origin rejects the response. Workaround: use `http://localhost:3001` in Chrome, Edge or Firefox. A real deployment needs HTTPS and a matching `FRONTEND_ORIGIN`.
- **The summarizer is the mock in Compose.** No Gemini key is passed through, so summaries are the extractive mock ones (`source: mock`). Workaround: add `SUMMARIZER_PROVIDER` and `SUMMARIZER_API_KEY` to the backend's `environment:` in `compose.yaml`.
- **No per-request logging.** Neither service logs a line per request; the backend logs startup and server errors, the frontend its start. Impact: harder to see what happened when debugging. No workaround yet.
- **`POST /auth/refresh` re-issues only the access cookie.** The refresh token is not rotated, which matches the Swagger text. Impact: a stolen refresh token stays usable for its 7 days unless the user logs out.
- **Signup does not sign the user in, and a duplicate signup says so.** A second signup with the same email returns `409 Email already in use`, which reveals that an email is registered; login gives the same `401` for an unknown email and a wrong password. The frontend signs the new user in with a login call right after signup. Workaround: none needed for this project's scope.
- **Logout does not revoke the access token.** It revokes the refresh token and clears both cookies, but an access token someone copied earlier stays valid until its 15-minute JWT expires.
- **A database outage gives `GET /posts` a 500.** It logs a raw `MongoServerSelectionError` instead of returning 503, while `GET /health` correctly returns 503. The backend reconnects on its own about 13 seconds after Mongo returns, with no restart.
- **Docker flags the backend unhealthy only about a minute after Mongo goes away** (5 failed checks, 15 seconds apart). `/health` itself turns 503 within seconds.
- **Ports 3000 and 3001 are published on all interfaces.** Mongo is bound to `127.0.0.1` only. Anything on the same network can reach the app. Workaround: put `127.0.0.1:` in front of those two mappings in `compose.yaml`.
- **Rate limits are per IP.** Login is 5 a minute (a 429 with `Retry-After: 60`), so clients behind one host or NAT share a bucket.
- **Fixed project name and ports.** `devcommunity` and 3000, 3001 and 27017 cannot be changed without editing `compose.yaml` (see Running with Docker Compose). Two checkouts cannot run together.
- **Leftovers accumulate.** `docker compose down` does not remove the anonymous `/data/configdb` volumes, the tagged seed image, or a stale `:build` image tag from a manual build. Workaround: the cleanup commands in Running with Docker Compose.
- **Backend e2e can time out under load.** Run alongside other work that hits the same Mongo, the first spec can exceed its 60-second hook timeout. It did not reproduce on a cold clone (315 of 315 passed in 87 seconds), so run it alone.
- **`npm audit` reports 29 backend and 27 frontend vulnerabilities** (one critical on each side). I have not investigated them.
- **`next build` prints the `middleware` to `proxy` deprecation warning.** The rename is deliberately left for a change of its own.
- **Responsive.** Below the `sm` breakpoint the Create Post button is hidden from the header (it is in the avatar menu). At 320px the search box is about 58px wide and the signed-out header is tight. The Admin Users and Audit log tables scroll sideways inside their container, so on a phone the last column (Edit and Delete, View details) needs a sideways scroll.
- **Not tested:** Safari, real phone browsers, the Gemini provider, and the 03:00 purge job firing in the container.

### Frontend error and loading states (release-candidate review)

These come from reading the frontend code for the Day 19 review; none is a launch blocker. They have not been reproduced in a browser unless it says so.

- **Not every load error has a Retry button.** The feed, the post page, the edit page, "Posts made by you", search results, the comments and the reactor lists do. The profile view, the two profile edit pages, Admin Users, the Audit log and the notification list show the error and nothing else. Workaround: reload the page.
- **"Request failed" when the server cannot be reached.** The API client's fallback message, used when there is no response at all, is shown as-is by the login, signup and settings forms, the profile pages, Admin Users, the Audit log, the notification list and the System Status card. The feed, the post page, the comments, reactions and the summarizer map it to "Couldn't reach the server…" instead. Workaround: none; the wording is the only problem.
- **Other server messages are shown unchanged too.** A `429` from login, signup or a credential change reads `ThrottlerException: Too Many Requests` in the form's error banner (that is the throttler's default message, and the API returns it for the `429`; only the summarizer maps its own `429`).
- **A failed `GET /auth/me` of any kind makes a signed-in user look signed out.** The call treats every failure (a `429`, a 5xx or no response) as "nobody is signed in", and the answer is cached until the page is reloaded, so protected pages send the user to `/login` even though the session is still valid. Workaround: reload once the server is back.
- **Signup is two calls, signup and then login.** If the second fails (for example with a `429` on login), the account exists but the page shows an error, and signing up again with the same email returns `409`. Workaround: sign in with the new account.
- **A logout that fails on the network still signs the user out of the UI** and goes to `/login`, but the server session and cookies are untouched, so a reload signs them back in. This is from the code, not reproduced.
- **No global error boundary.** `app/error.tsx` catches errors inside the pages; an error thrown by the root layout (the header, for example) would show Next's default error page, because there is no `global-error.tsx`.

## Progress

### Day 1 — Project setup and request lifecycle

- Set up the NestJS backend with Zod-validated environment configuration.
- Connected MongoDB through Mongoose (I used Atlas for development; Day 19 adds a local `mongo:8` container for Docker Compose).
- Added the `health` module and `GET /health`.
- Set up Next.js with the App Router and connected the frontend to the health check.
- Added `.env.example` for both apps.

### Day 2 — API contracts and TanStack Query foundation

- Added the global response envelope (`ResponseInterceptor`) and error shape (`HttpExceptionFilter`).
- Added Swagger, documenting the health endpoint's success and error responses.
- Added a typed axios API client, `QueryClientProvider`, and rebuilt the system-status check on `useQuery` with distinct loading/connected/error states and a manual retry.

### Day 3 — Backend authentication and role-based access

- Added the `User` schema (`fullName`, unique `email`, `passwordHash`, `role`).
- Implemented signup, login (JWT in an httpOnly cookie), and `GET /auth/me`.
- Added the global auth guard (protected by default, `@Public()` opts out) and a roles guard for admin-only routes.
- Added `seed:admin` as the only way to bootstrap the first admin account.

### Day 4 — Frontend authentication flow

- Built signup and login with React Hook Form + Zod, wired to the API through `useMutation`.
- Added route protection (middleware redirecting unauthenticated visitors to `/login`), logout, and a header that shows the current user and role.
- Guarded both forms against duplicate submission while a request is in flight.

### Day 5 — Developer profile API

- Added `headline`, `bio`, and `portfolioProjects` (with per-project URL, technology, and conditional end-date validation) to the developer profile, alongside the existing `skills` and `experiences`.
- Built `ProfilesModule`: `GET/PATCH /profile/me` for self-service, and `GET /profile/:id` plus owner-or-admin write routes for every profile field, so an admin can edit any member's profile with the same audit-logging and notification behavior that already existed for skills and experiences.
- Kept `UsersController` scoped to account administration only (list, delete) and extracted the shared owner-or-admin authorization logic so both controllers use one implementation. Full name stays out of that owner-or-admin surface entirely — it only ever changes through `PATCH /auth/me`, self-only.

### Day 6 — Complex developer profile form

- Built the profile edit form with React Hook Form and Zod, hydrating existing profile data via `reset()`.
- Used `useFieldArray` for portfolio projects (stable `field.id` keys), with add/remove and per-project technology tags.
- Moved experience editing to its own dedicated page, and added a profile view page that shows the full developer profile with entry points into editing.
- Wired save behavior through TanStack Query, invalidating the profile cache on success.

### Day 7 — Posts API with ownership and pagination

- Added the `Post` schema (`authorId`, `title`, `body`, `likeCount`/`dislikeCount`/`commentCount` as denormalized placeholders for Day 9/11, `deletedAt`) with optimistic concurrency, and built `PostsModule`: create, cursor-paginated list, detail, update, and soft delete.
- Pagination is cursor-based on `_id` alone (revised from an initial `{createdAt, _id}` design after `.explain()` showed the original shape couldn't get tight index bounds); the feed index is `{deletedAt: 1, _id: -1}`, confirmed via `.explain()` to produce a tight range scan rather than a full collection scan.
- `PATCH`/`DELETE /posts/:id` reuse the existing owner-or-admin authorization pattern, extended so an admin editing or deleting someone else's post is audit-logged (the audit entry identifies the specific post, not just the author) and the author is notified — the same `recordAdminOverride` helper now used by profiles, users, and posts.
- Verified against a real MongoDB database (Atlas at the time) throughout: forced genuine optimistic-concurrency conflicts via concurrent requests (confirmed `409`, never `500`), traced actual queries to confirm the list endpoint doesn't do N+1 author lookups (one batched query regardless of page size), and confirmed list/detail responses never expose `passwordHash` or `email` on the author.
- Added full Swagger/OpenAPI documentation across every existing module (auth, users, profiles, posts, audit, notifications) — not just health, which was all that existed before — including a cookie-based auth scheme matching this app's actual httpOnly-cookie transport.

### Day 8 — Feed and reusable post interface

- Built the posts UI: a public feed (`/posts`), a public post page (`/posts/[id]`), create (`/posts/create`), edit (`/posts/[id]/edit`), and "Posts made by you" (`/posts/mine`, reached from your own profile). The middleware protects only the three write pages, so anyone can browse and read; sign-in and sign-up now land on the feed.
- The feed loads with `useInfiniteQuery`, using the API's `nextCursor` as the next page param. An `IntersectionObserver` sentinel (400px margin) requests the next page before the reader reaches the bottom. Auto-loading runs only when there is a next page, nothing is already in flight, and the last next-page request didn't fail — after a failure the reader gets a "Try again" button instead of a retry loop. The feed shows distinct skeleton, empty, error-with-retry, next-page loading, next-page error, and end-of-list states.
- One `PostForm` (React Hook Form + Zod, mirroring the API's limits: trimmed title 1-200, body 1-20000) serves both create and edit, with character counters and a submit button locked while the request is in flight. Edit sends only the fields that changed, offers "Reload post" on a `409` conflict, and treats a `404` as "post is gone".
- After a create, edit, or delete, the feed, the post's detail entry, and the author's "mine" list are updated in the TanStack Query cache directly (new post prepended, edited post patched in place, deleted post removed) instead of refetching everything.
- One helper, `getPostActor`, decides who sees Edit and Delete (post owner, admin acting on someone else's post, or nobody), so the post page, the "mine" list, the edit page, and the delete flow can't disagree. Admins moderate through the same edit form and delete dialog, marked "as admin", with an optional reason that feeds the existing audit log and author notification. The feed cards carry no edit/delete controls.
- Admins can't create posts: the API now returns `403` for an admin's `POST /posts`, instead of the UI merely hiding the button.
- Supporting backend changes: `GET /posts` accepts an optional `authorId` filter (backed by a new `{authorId, deletedAt, _id}` index, so one author's page is an index scan), post title/body are trimmed before validation so whitespace-only input returns `400`, and an explicit `null` body on update is rejected.
- Verified with `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual testing against the running app.

#### Frontend restructure (after Day 8)

Once the posts UI was in, I reorganized the whole frontend from a flat `app/`, `lib/`, `components/` layout into a feature-first structure under `frontend/src/`. It changes no URLs, screens, or backend calls — it only changes where code lives and how data moves through it.

**Data flow.** A page never fetches data:

```
page (app/…/page.tsx)                        which URL renders what — 8-12 lines
  → feature component (features/x/components)   the screen
  → query / mutation hook (features/x/queries, mutations)   reads or writes data and keeps the cache correct
  → service (services/api/x.ts)                 which backend endpoint to call
  → axios client (lib/axios)                    cookies, error handling
  → backend
```

**Layout.**

```
frontend/src/
├── app/                routes only (login and signup sit in an (auth) route group)
├── features/           auth, posts, profile, users, audit, notifications, health
│   └── <name>/         components/ queries/ mutations/ schemas/ types/ utils/ (each created only when needed)
├── services/api/       one file per backend resource — the only code that calls the API
├── lib/                axios/ (client, interceptors, ApiError), tanstack/ (query client), utils/
├── components/         layout/ (header, user menu), common/ (confirm dialog), forms/ (password input)
├── hooks/              generic hooks (infinite scroll, dismiss-on-outside-click)
├── providers/  constants/ (routes, config)  types/  styles/  middleware.ts
```

**Decisions worth knowing.**

- The current user lives in the TanStack Query cache (`useAuth()` returns `{user, loading}`); login, signup, logout, and settings update it directly. There is no separate auth context provider.
- The axios interceptor turns every failure into an `ApiError` (message, per-field errors, HTTP status) and redirects to `/login` on a `401`, except for requests that set `skipAuthRedirect` (`/auth/me`, `/auth/login`, `/auth/signup`, where a `401` is expected). The exemption is a flag on the request rather than a URL list inside the interceptor. (That is the Day 8 behaviour. Since Day 18 a `401` on a protected call first starts one shared `POST /auth/refresh` and repeats the request once; only a refresh that fails sends the visitor to `/login?reason=session-expired`. Login, signup and the refresh call itself are never retried.)
- Forms use React Hook Form with Zod schemas kept in `features/<name>/schemas/`, and form types come from the schema. The settings form moved from plain state to this pattern, so its errors now appear inline instead of as browser pop-ups.
- Every route is referenced through `constants/routes.ts` instead of typed as a string.
- An ESLint rule fails the lint if a page or component imports `axios` or anything under `services/`, so the data flow above can't quietly erode.
- Two behavior notes: the unread-notification badge now stops polling while the browser tab is hidden, and the admin user list and audit log still refetch on every visit.

**Verification.** `npx tsc --noEmit`, `npm run lint` (0 errors, 0 warnings), and `npm run build` all pass, and the ESLint rule was checked against a deliberate violation. I then walked through login, signup, settings, the posts flows, profile and experience editing, notifications, and the admin pages by hand.

**Adding new code.** A new feature gets its own `features/<name>/` folder plus a `services/api/<name>.ts` file; its routes are added to `constants/routes.ts`. Something is moved into a shared folder only once a second feature needs it.

### Day 9 — Threaded comments API

- Added the `Comment` schema (`postId`, `authorId`, `parentCommentId` — explicitly `null` for a top-level comment, never absent — `ancestorIds` as a materialized path, `body`, `deletedAt`, full timestamps) and built `CommentsModule`: create a top-level comment or a reply, list a post's comments as a tree, cascade delete, and edit.
- A reply is accepted at **any** depth — creating one is never rejected for how deep the thread already runs. What's bounded is the *returned tree*: it only ever nests 2 levels deep, and anything past that attaches, flattened, under its thread's depth-1 root instead of nesting further, in chronological order, while still carrying its true `parentCommentId`.
- `DELETE /comments/:id` soft-deletes the comment and every reply beneath it in one atomic operation (matching on the target's id or its presence in a descendant's `ancestorIds`), not a "find then mark" two-step, so a reply created mid-delete can't slip through with a live parent. Allowed for the comment's author, the post's author, or an admin; only an admin's deletion of someone else's comment is audit-logged (`delete_comment`) and notified.
- `Post.commentCount` is kept accurate through concurrent creates and deletes: an atomic `$inc` on create, a clamped decrement pipeline on delete (so a drifted count can never go negative), and a self-healing recount if either write fails. Verified by forcing bursts of ~20 concurrent creates and deletes, and by mutation-testing each safety rule (temporarily breaking it and confirming the test suite catches it, then reverting).
- Deleting a post now cascades to soft-delete all of its own comments too, wired through `PostsModule` importing `CommentsModule` — a one-way dependency (`CommentsService` never imports `PostsService`), so no cycle forms.
- `PATCH /comments/:id` edits a comment's body — the comment's own author only, no admin or post-owner override, unlike delete. No time limit on when a comment may be edited. `updatedAt` exists solely so a client can detect an edit (`updatedAt !== createdAt`); the value itself is never meant to be displayed.
- Found and fixed an existing Day 7/8 bug while working on this: a post's read/edit/delete routes threw a bare 500 if the post's author account had been hard-deleted. A shared helper now returns `{id: null, fullName: "Deleted user"}` instead, used by both posts and comments; an admin acting on such an account is still audit-logged, just not notified (nobody to notify).
- Built a committed Jest e2e suite (158 tests across 6 files) against the real database, with throwaway accounts cleaned up after every run, rather than one-off manual scripts.

### Day 10 — Threaded comments interface

- Set up the frontend's first Jest/RTL test harness (`next/jest`, jsdom, `@testing-library/*`) — named in the stack since Day 1 but never actually wired up; Day 10 is the first day with real interactive/keyboard behavior worth unit-testing.
- Fixed a focus-management gap in `ConfirmDialog` deferred from Day 8: it now traps Tab within the dialog while open, focuses the reason input or Cancel button on open, and restores focus to whatever opened it on close (skipped if that element is gone). Comment delete becomes its 5th caller, alongside the 4 existing ones.
- Built `features/comments/`: a recursive comment tree (`CommentItem`/`CommentList`) with reply, edit, and delete, each gated by the same author/post-owner/admin rules the Day 9 backend already enforces. Structural changes (create, delete) invalidate and refetch rather than patch the cache locally, matching the backend's own depth-2 flattening rule instead of re-implementing it client-side; edit patches the body in place since it never changes the tree's shape.
- Coordinated forms across the whole tree so only one reply/edit draft can be open at a time, confirming before discarding an unsent one when switching targets.
- Managed focus through every action so keyboard users always land somewhere sensible afterward — the new comment, the edit button, a delete's parent comment or the "Comments" heading — with polite live-region announcements alongside each.
- Every reply shows "Replying to @X" naming its true parent, not just ones flattened past the backend's depth-2 display cutoff — direct nesting alone doesn't distinguish a reply from a flattened one once both sit at the same single indent level in the UI.
- Remapped a handful of accurate-but-technical backend error strings (e.g. "Parent comment not found") into reader-facing wording for the races that can actually trigger them — a parent, comment, or post deleted between page load and submit.
- Added a Comment button on the feed that deep-links into a post's comment section, sending a logged-out reader to `/login` first; an admin, who has no composer, lands on the section itself.
- Verified with tsc/lint/build plus ~98 unit and component tests, and manually against the real API for each rejection case before finalizing the error mapping.

### Day 11 — Reaction engine

- Added the `Reaction` schema (`userId`, `targetType` of `post` or `comment`, `targetId`, `type` of `like` or `dislike`) with a unique index on `{userId, targetType, targetId}`, so the database itself refuses a second reaction from the same user on the same target, and built `POST /posts/:id/reaction` and `POST /comments/:id/reaction`, restricted to regular members like posting and commenting.
- One toggle serves both targets. The reaction row is changed with atomic single-document operations — delete it if it already has the requested type, otherwise change it if it has the opposite type, otherwise insert it — so there is no read-then-write gap. If two requests race to insert, the loser hits the unique index, is caught, and reports what actually exists instead of failing with a 500. No transactions.
- The counters change by one atomic update whose result is also the response, so there is no follow-up query. `Comment` gained `likeCount` and `dislikeCount`; comments stored before then have none and read as `0`.
- Counters use a plain `$inc`, not the clamped update used for `commentCount`. An end-to-end run against the real database showed a floor on the write can lose an update when two requests race (a decrement that lands first on a counter at 0 is swallowed, so the increment that follows leaves it one too high; I confirmed that order-dependence directly). Increments commute, so the counters converge on the reaction rows in any order; the floor is applied when a count is shown instead.
- Posts (feed, detail, edit) and the comment tree return the caller's own reaction as `myReaction`, through one batched lookup per page or thread. The three read routes are public, and the global guard never identifies a caller on a public route, so I added `OptionalJwtAuthGuard` for them: it identifies a signed-in caller without ever rejecting anyone.
- Two things only showed up by running the real app. The first boot failed because the new guard couldn't be built inside the posts and comments modules, which type-checking and unit tests could not see; an explicit empty constructor fixed it. The counter race above surfaced once as a failed concurrency test that I could not reproduce afterwards, so I proved the mechanism directly rather than assume it was the cause.
- Tests: unit specs for the pure toggle helpers and for the service (real helpers, mocked models, every branch checked through the whole chain; I mutation-checked the service spec by breaking the service twice and confirming the tests fail), plus a 31-test end-to-end spec against the real database covering create/switch/remove on both targets, the unique index refusing a direct duplicate, bursts of 5 and 20 concurrent requests (stored counters must equal the reaction rows), every rejection case, and `myReaction` on every read. 94 backend unit tests pass and the reactions e2e spec passed 31 of 31 on three consecutive runs. The existing comments, posts and harness e2e specs still pass; the comments spec's two exact-field-list assertions were updated for the new comment fields.
- Frontend: only the `Post` and `Comment` types and their test fixtures changed (`myReaction`, and the comment counts). The reaction buttons and optimistic updates are Day 12.
- Added a `tsconfig.json` under `backend/test/` so the editor recognises the Jest globals; the root config only includes `src/`. Type-checking `test/` for the first time also surfaced two real type errors in the new spec, which I fixed.

### Day 12 — Optimistic reaction interface

- Like and dislike buttons on the feed cards, "Posts made by you" (and the Profile Posts tab, which shares it), the post page and every comment. A signed-in member can react; a signed-out visitor sees the counts and gets an inline "Sign in to react" link instead of a redirect; an admin sees the counts only, since the API refuses admins.
- The buttons update the counts and the selected state before the request returns. `onMutate` cancels in-flight reads, snapshots every cache entry the post lives in (the feed, its detail entry and each "Posts made by you" list, or the comment tree, where a reply may be nested) and writes the toggled state; `onSuccess` replaces the guess with the server's counts; `onError` puts back the exact snapshot and shows a short inline message; `onSettled` marks the caches stale, but only when it is the last reaction still in flight, so a refetch cannot overwrite another target's optimistic write.
- One request per target. The buttons disable while a request is out, and a second click is also refused by asking the mutation cache, because the pending state only reaches the component after React re-renders. I wrote a test that fires two clicks in the same tick, and the first version sent two requests; that is what led to the second check.
- A changed session no longer leaves the previous user's data behind. `myReaction` belongs to one user, and a 30-second `staleTime` would keep the old value on screen. Login, signup and logout now reset every cached query except the auth entry (and write the new user after that, in that order), and the reaction hooks skip their cache writes if the signed-in user changed while a request was out, so a rollback cannot put the old user's snapshot back.
- Structure: `features/reactions` holds only what posts and comments share (the presentational buttons, the pure toggle function, the shared mutation-key prefix). `usePostReaction` lives in the posts feature and `useCommentReaction` in the comments feature, so neither imports the other.
- Tests: the full frontend run is 278 tests in 31 suites, with `tsc --noEmit` and `eslint` clean. For reactions they cover the toggle function, the buttons in every mode, the cache helpers with snapshot and restore, both hooks against the real query client with only the API layer mocked (optimistic write before the response, exact rollback, a 404, no write after a user switch, reconcile only after the last reaction settles), both wrappers end to end, and the login, signup and logout reset and its order.
- Mutation check: I broke the Day 12 code on purpose in 122 places (the toggle function, the buttons, the cache helpers, both reaction hooks, the session reset, the summary wording, the overlay, the two lazy query hooks, and the "who reacted" service, mapper and routes) and ran only the tests that should notice. 107 of the first 119 were caught. Ten survived and two did not apply because my search text was wrong. The survivors were real gaps, for example the one-request lock still passing when it ignored which post was busy, a late server answer being able to overwrite the next user's cache, a 404 handler that was only "covered" because the settle handler happened to do the same thing, and no test that a Tab from the last control wraps. I added or fixed tests for each and re-ran them, plus three extra breaks that check each cancelled read on its own, until all 122 were caught. The routes were checked with four breaks run through the end-to-end spec against the real database. Not covered: where the summary line sits in the feed, "Posts made by you" and post page layouts, which has no test.
- Manual pass (the plan's checkpoint 7): I did this myself in a browser and everything worked. I did not write down per-case results, so the automated tests above remain the record.
- No backend change was needed for the buttons themselves. The "who reacted" routes below were added during the day, and the reactions collection gained a second index for them.

### Day 12 (extension) — Who reacted

Added on top of the Day 12 reaction interface: a line above the like/dislike buttons ("You and 15 others reacted.") on the feed cards, the post detail page, "Posts made by you" (and the Profile Posts tab, which shares it) and comment rows, which opens an overlay listing everyone who reacted, with All / Like / Dislike tabs.

- Backend: nothing listed reactors before, so I added `GET /posts/:id/reactions` and `GET /comments/:id/reactions` (see the Reactions table above). A capped list of the 50 most recent rather than pages, because it is a "see who reacted" view and not a feed; a flat list with a `type` on each entry plus an optional `?type=` filter, so each tab gets up to 50 people of its own type instead of a filter over a mixed 50; and the target's true totals in the same response. The target is read first, so a missing or deleted one is a `404` and its counters are the totals. A second index serves the lookup by target.
- Frontend: the list is fetched only when the overlay opens, once per tab, and refreshed on every open (`staleTime: 0`). `usePostReactors` lives in the posts feature and `useCommentReactors` in the comments feature, so neither imports the other. The presentational summary line and overlay live in `features/reactions`, and reuse the initials `Avatar`. The overlay closes with Escape or a click outside, keeps Tab inside, moves between tabs with the arrow keys, and returns focus to what opened it.
- Summary wording, decided rather than asked: nobody reacted, no line; only the viewer, "You reacted."; the viewer and one other, "You and 1 other reacted."; the viewer and more, "You and X others reacted."; the viewer did not react, "1 person reacted." or "N people reacted." X is likes and dislikes combined (the same number as the All tab), the viewer excluded. No names, because the list is not fetched until the overlay opens.
- Tests: 4 backend unit tests for the row mapper and 18 for the service's list methods (9 cases run for each of the two target types), and 16 new cases in the reactions e2e spec against the real database (`RUN_E2E=1`, 47 of 47 passed in one run). Frontend: the wording table, the summary line, the overlay (tabs, keyboard, avatar and name rendering, empty, loading and error states, the cap note, focus handling), both query hooks (nothing fetched while closed, one fetch per tab), and both wrapper components end to end with only the service mocked. I mutation-checked the whole Day 12 set (see above), and my manual pass in a browser covered it.

### Day 13 — Ranked and latest feed APIs

- `GET /posts` gained `?sort=latest|top|discussed` (default `latest`, unchanged behavior when omitted). `discussed` is a plain `commentCount desc, _id desc` sort on the raw stored field. `top` ranks by a Wilson-score lower-bound confidence interval on the like/dislike ratio (weight 100) plus 2 points per comment — deliberately no time-decay term, since `latest` already covers pure recency; the Wilson bound is what keeps a fresh 10-like/0-dislike post from outranking an established 500-like/50-dislike one just because its raw ratio is higher.
- The formula lives in one place, `posts/ranking.ts`'s `computeRankScore` (pure, unit-tested, 11 cases), and the `sort=top` aggregation pipeline expresses the identical arithmetic in Mongo operators — proven to match, not assumed, by an e2e test that asserts the database's returned order equals `computeRankScore` computed independently from the same fixture counters.
- `latest` keeps its original bare-`_id` cursor unchanged. `discussed` and `top` share a new keyset cursor carrying the sort's own name plus the last row's sort value and `_id`; a cursor from one sort replayed against another is rejected with `400` in both directions, rather than silently returning garbage order.
- The Wilson term can come out a hair below zero purely from floating-point rounding (verified: `likes=0, dislikes=5` produces `≈-3.14e-17`, not a hypothetical) — floored at zero in both the pure function and the aggregation, which is what actually satisfies the "no negative scores" requirement, since the formula isn't provably non-negative on its own.
- Every post response now carries `rankScore`: the exact value `sort=top`'s aggregation sorted it by, read off the database output rather than recomputed — `null` under `sort=latest`/`discussed`, where nothing is scored.
- A new `{deletedAt, commentCount, _id}` index backs `discussed`'s pagination. `top` scores live in an aggregation rather than from a stored field (denormalizing would need a write-path update on every reaction/comment for no benefit at this scale), so it's an accepted full scan past the `authorId` case.
- A controlled seed script (`seed:ranking`, mirroring `seed:admin`'s pattern) inserts fixtures with known counters — zero engagement, a small-unanimous-vs-large-mostly-approved pair, more dislikes than likes, a deliberately negative raw counter, a tie pair, a comment-heavy zero-vote post, and an author with no posts — so ranking order is checkable by hand or by test, independent of real usage data.
- Tests: 127 backend unit tests (11 new, for the formula), and the full e2e suite — 224 tests across 8 files, including a new `posts-ranking.e2e-spec.ts` covering order, pagination stability, the parity check above, empty results, and every cursor-rejection case — pass against the real database in one run. No frontend changes; the dropdown to choose a sort is Day 14.

### Day 14 — Feed filters and URL state

- A Sort dropdown above the feed (Top / Latest / Most Discussed) wired to Day 13's `sort` query param. The URL (`?sort=`) is the only source of truth for the active option: missing or unrecognized values render Latest without rewriting the URL, and the default sort is kept out of the URL entirely so `/posts` stays canonical.
- Each sort is a fully separate TanStack Query cache entry (`postKeys.feed(sort)`, nested under a `feedAll()` prefix used for cross-sort cache writes). An unvisited sort has no cache entry, so it shows the loading skeleton; a previously visited sort shows its own cached pages instantly. Nothing ever replays one sort's cursor against another — the backend already rejects that with 400.
- Choosing a sort uses `window.history.pushState`, not `router.push`: the App Router wraps `router.push` in a client-navigation transition, and once the `<Suspense>` boundary `useSearchParams` needs has already revealed content, a transition through it holds the previous sort's posts on screen for the whole pending request instead of showing the skeleton. `pushState` updates `usePathname`/`useSearchParams` without that transition, so `PostFeed`'s own pending state renders immediately, and it still adds its own history entry, which is what makes Back/Forward step between sorts.
- Two cache bugs found and fixed during implementation/testing, both mirroring the existing `feedAll()`/`mineAll()` prefix-write pattern: `applyPostUpdate` was writing to `feedAll()` as an exact key (which is a prefix, not a real cache entry), so an edited post's title/body change wasn't reaching any sort's feed; and `adjustPostCommentCount` (pre-dating Day 14) only ever wrote the post's detail cache entry, never any feed, so a new comment's count stayed stale in every feed view — including Most Discussed, whose own ordering is that exact number — until a refresh. Neither reorders Most Discussed by itself; that still waits for the next invalidation/refetch.
- Frontend `Post` type still doesn't carry `rankScore` (the backend already returns it under `sort=top`) — deliberately left out, nothing on Day 14 reads it.
- Tests: full frontend suite (355 tests, 37 suites), `tsc --noEmit`, and `eslint` all clean; production build succeeds with `/posts` still prerendering static despite the new `<Suspense>` boundary. Manually verified in a browser, including the wrong-sort-flash fix under artificial latency, since the automated component test mocks `next/navigation` and can't exercise the real App Router transition. No backend changes.

### Day 15 (backend) — Full-text search

- `GET /posts/search?q=` searches post titles and bodies through a MongoDB text index (`{title: 'text', body: 'text'}`, weighted 10:1 so a title match outranks a body that just repeats the word — text indexes can't be re-weighted without dropping and rebuilding, so I fixed the ratio now instead of leaving it a placeholder). Results are one capped page — up to `limit` (default 10, max 20) best matches, newest-first among ties — with a `hasMore` flag instead of a next-page cursor. A search box doesn't need infinite scroll, so I didn't build keyset pagination over a relevance score for a consumer that doesn't exist yet.
- `q` is required, trimmed, 1-100 characters; `limit` is 1-20, rejected outside that range rather than clamped, same as the feed's own `limit`. A zero-match query returns the normal `{items: [], hasMore: false}` shape, not an error or a different one. Every search result's `rankScore` is `null` — I projected the text-relevance score under its own field name (`textScore`) specifically so it can't collide with the `rankScore` field `sort=top` already owns.
- I rate-limited the route (`@Throttle`, 40 requests/minute/IP) since text search is the heaviest query in this controller; a debounced search box still fires one request per pause in typing, so I picked a number with headroom over ordinary use rather than the tighter limits on login/signup. It's a judgment call — Day 18 revisits rate limits for search once there's real usage to look at.
- Tests: 16 new e2e cases against the real database — matching, zero matches, tie-break ordering, every `q`/`limit` validation boundary, MongoDB's own `$text` syntax (a leading `-word` exclusion, an unbalanced quote), soft-delete exclusion, and `myReaction` for anonymous vs. signed-in callers — plus `tsc --noEmit` and lint clean. No frontend changes in this entry; the search box itself is Day 15 (frontend), directly below.

### Day 15 (frontend) — Full-text search UI

- A search box in the site header (visible only when signed in, alongside a "Create Post" link that's equally gated) debounces input 300ms, normalizes it (trimmed, collapsed whitespace, lowercased, capped at 100 characters) into the TanStack Query key, and passes the query's `AbortSignal` through to the request so an obsolete search in flight is cancelled instead of racing a newer one to resolve last.
- On `/posts`, the settled term is written into `?q=` in place (`window.history.replaceState`, for the same reason Day 14's sort dropdown avoids `router.push` — a transition through an already-revealed `<Suspense>` boundary would hold the previous results on screen instead of committing new ones); typed from anywhere else, it navigates to `/posts?q=...` for real. Leaving `/posts` for any reason clears the box, since a term left showing there no longer describes what's on screen anywhere else.
- Five states: the plain sorted feed while the box is empty, a "Searching…" status while a settled term's request is in flight (not for a background refetch of an already-cached term, which keeps showing what's there), the results themselves, a no-results message naming the normalized term, and an error with a Retry button that only shows when there's no cached data to fall back on.
- The sort dropdown (Day 14) hides while a search is active — sort has no meaning for search results — reading that straight from `?q=`, not from anything the search box exposes directly.
- Search results are read-only preview cards, not the feed's interactive ones: no reaction buttons, so no parallel set of cache-patch helpers for the search response's flat `{items, hasMore}` shape. A create, edit, or delete invalidates the cached search results instead of patching them, the one operation that shape needs.
- Two navigation bugs found and fixed after the feature was otherwise working: clicking a search result (or any other link) while a term was still active bounced straight back to `/posts?q=...` instead of letting the navigation happen, and separately, the search box only cleared when navigating to the plain Feed link — anywhere else it kept showing a term that no longer matched what was on screen. Both traced to the header search component's URL-sync logic; details in AI_USAGE.md.
- Tests: 162 passing across `components/layout` and `features/posts` (the search box, the sort dropdown, search results, and the cache invalidation above), `tsc --noEmit` and `eslint` clean throughout. No backend changes.

### Day 16 (backend) — Post summarizer

- `POST /posts/:id/summarize` lives in its own `SummarizerModule`, with its own controller and full route path, the same shape as the reactions and comments routes. It returns `{summary, tags, truncated, source}`. It is open to any signed-in user, admins included: unlike posting or reacting, summarizing creates nothing, so the "admins moderate but don't participate" rule doesn't apply. Checks run in order (sign-in, id shape, post exists and isn't soft-deleted, length rules, then the provider), so a bad or deleted post never costs a model call.
- A `Summarizer` interface has two implementations, chosen from env at startup and logged once: a deterministic extractive mock, used whenever no key is set (or `SUMMARIZER_PROVIDER=mock`), and a thin Gemini client using native `fetch` and `AbortSignal.timeout`, so the timeout also cancels the upstream request. The mock always returns at least one tag (`general` when no keyword matches), because zero valid tags counts as malformed. I checked the Gemini request and response shape against Google's current Interactions API docs before relying on it. The default model is `gemini-3.5-flash-lite`; changing only `SUMMARIZER_MODEL` switches it.
- Whatever a provider returns is validated by one Zod schema before it reaches the client: a summary of 1-600 characters and tags that are checked one by one. A bad tag is dropped, duplicates collapse case-insensitively, and the list is cut to 5; the response only fails if the summary is unusable or no valid tag remains.
- Errors use the existing envelope with generic messages (upstream text goes to the log only): `504` timeout, `502` malformed output, `503` unavailable or upstream rate limit, `422` body under 200 characters. A body over 8000 characters is truncated and flagged rather than rejected. Unexpected provider errors are now logged by the service before they become a bare `500`.
- Only the post's title and body are loaded (`select('title body')`) and sent: the author, the caller and every other field never reach the summarizer. `@Throttle` is 10 requests a minute per IP, on a judgment call; reviewed on Day 18 and kept at 10 per minute.
- Tests: unit tests for the output schema, the mock (including its determinism and the no-keyword fallback), the Gemini client against a stubbed `fetch` (success, timeout, malformed, 5xx/429, request contents), the service (length rules, payload, error mapping) and provider selection; 10 e2e cases against the real database, with the mock forced even if a key is in `.env`. Full backend unit suite: 246 tests, 14 suites, plus `tsc --noEmit`. Automated tests never call the real Gemini API; I checked that once by hand with a real key, along with the `429` throttle and the route's Swagger entry. No frontend changes in this entry.

### Day 16 (frontend) — Post summarizer UI

- A green "⚡ Summarize" button sits in the post page's author row, and a "AI Summarizer" side card shows the result: the summary as bullets, and the tags as green-outlined `#tag` chips. From 1024 px up the card sits beside the post (starting on the post's row, and sticky while scrolling), and its width follows its content, from 18 rem up to 24 rem, so its header ("AI Summarizer" plus the "Mock summary" label) never wraps onto a second line; below that it stacks under the post, and the page scrolls to it when the reader taps Summarize, so it isn't a long scroll away on a phone. The card doesn't exist until the first click, so until then the post page is the same single column as before.
- The button and the card are in different places but share one piece of state, so a hook (`useSummarizeAction`) owns it and one layout component (`SummarizeLayout`) hands the button to the post and places the card. The layout is rendered with `key={post.id}`, which is what stops one post's summary showing on the next when the page is reused for another id.
- Same rules as the reaction buttons: pending locks the button with `aria-disabled` (not `disabled`), so keyboard focus stays on it, and a `useRef` guard stops two clicks in the same tick from sending two requests. After success it reads "Summarize again", which sends a fresh call (nothing is cached); after a retryable error it reads "Try again". A post that is too short (`422`), gone, or a signed-out reader gets a message with no retry. Signed-out readers see a sign-in hint in the card and no request is made.
- Messages are announced through one always-mounted, screen-reader-only live region in the layout, not by the card: a card that appears together with its first text is often not announced. Focus never moves; only the scroll does, and that is instant for anyone with reduced motion turned on.
- The summary and tags come from a model (or the mock), so they are untrusted text: rendered as plain React text nodes only, with no HTML and no markdown. A "Mock summary" label shows when the extractive fallback produced it, and "Summary is based on the first part of this post" when the post was truncated.
- The request is a `useMutation`, not a query: it is user-triggered and costs quota, and queries here retry server errors twice, which would triple a paid call. It never retries on its own, has its own 20-second timeout (longer than the backend's 15-second maximum), and keeps its result in the mutation's state, not the query cache. A `404` removes the post from the feeds, the same as a reaction or delete that finds it gone.
- Tests: the full frontend suite (491 tests, 49 suites), `tsc --noEmit` and `eslint` are clean. They cover the service, the hook, the error wording per status, the bullet splitting, the scroll rules, and the layout: the hidden-until-clicked card, bullets and tags, pending and double clicks (including two in the same tick), retry and no-retry failures, signed-out and session-loading, hostile markup shown as literal text, and the reset when the post changes. No backend changes in this entry.

### Backend clean-up — Swagger decorators moved out of the controllers

- Controllers had become hard to read: the Swagger decorators (30 to 48 per controller in the big ones, many with long descriptions) buried the actual route logic and the comments about permissions. I moved them into one file per feature, `<feature>.swagger.ts`, next to the controller. Each route there has one composed decorator (for example `ApiCreatePost`), built with `applyDecorators` from the same `@nestjs/swagger` decorators as before, and the controller keeps only behaviour (`@Get`, `@Roles`, `@Public`, `@UseGuards`, `@HttpCode`, `@Throttle`) plus that one line. `@ApiTags` stays on the controller class.
- Two things that several controllers repeated word for word are now shared in `backend/src/common/swagger/session-required.ts`: the 401 "Missing, invalid, or expired session cookie." response, and `ApiSessionRequired()`, which adds the cookie-auth requirement and that 401 (used at class level on the profiles, users, notifications and audit controllers).
- Controller sizes, before to after: profiles 449 to 383, posts 433 to 297, comments 290 to 192, reactions 197 to 96, auth 174 to 137, summarizer 133 to 68, users 97 to 73, notifications 56 to 42, audit 33 to 20, health 30 to 18.
- Nothing about the API is meant to change, so I proved it instead of eyeballing it. Before touching any controller I added `backend/test/openapi.e2e-spec.ts`, which builds the full generated OpenAPI document (through `buildSwaggerConfig()`, extracted from `main.ts` so the test and the app share it) and compares it with a committed snapshot, written from the untouched controllers. It stayed green, with the snapshot never updated, after every controller was converted. It also fails when a description changes (I made one deliberate change to confirm). Decorator order matters for the document (the order of `parameters`), and TypeScript applies stacked decorators bottom to top while `applyDecorators` applies them in array order, so each route's decorators are listed in reverse; the snapshot is what guards that.
- I also compared every non-Swagger decorator in every controller before and after: all identical, so no `@Roles`, `@Public`, `@HttpCode` or guard moved or changed.
- Tests: the OpenAPI snapshot is a new e2e spec (`RUN_E2E=1`, like the others); backend unit tests unchanged at 246. When the API's documentation is meant to change, review the snapshot diff and update it on purpose (`-u`).

### Day 17 — Focused automated testing (backend and frontend)

- This day adds tests only; no production code, API or schema changed. I aimed at the places where a mistake would be a security or integrity problem (sign-in, who may do what, the signup rules) rather than at a coverage percentage. Reaction toggling and ranking were already covered by the Day 11 and Day 13 specs, so I left them alone.
- Backend unit tests: `auth.service.spec.ts` (20 cases) covers signup (a duplicate email is a 409, the stored value is a real bcrypt hash at cost 12, and a role smuggled into the dto never reaches `create`), login (an unknown email and a wrong password give the same 401, and the token carries `sub`, `email` and `role`) and `updateCredentials` in the order the service checks things (wrong current password 400, nothing to change 400, non-admin email change 403, duplicate email 409, a concurrent-update `VersionError` 409, any other save error rethrown). `roles.guard.spec.ts` and `jwt-auth.guard.spec.ts` cover the guards, using the real `Reflector` and decorators; for `JwtAuthGuard` the stock passport `canActivate` is spied on, so a `@Public()` route must not reach it and a protected one must. Only `UsersService` and `JwtService` are faked. bcrypt is real, because the service imports it as a namespace, which Jest's ESM mode cannot mock, and a real hash is what lets a test show that the stored value really is a hash of the password. Fixtures use cost 4, so only signup and the new-password path pay for a cost-12 hash.
- Backend e2e: `test/auth.e2e-spec.ts` (15 cases, `RUN_E2E=1`) signs a throwaway member up through the real `POST /auth/signup`, logs in through the real `POST /auth/login`, and uses that cookie, not a minted one, for the protected calls. Every other e2e spec mints a cookie directly, so this is the first one to exercise the login path itself. It checks the signup response and the stored row, a duplicate email (409), a client-sent `role` (400, no account created), the cookie's `HttpOnly`, `SameSite=Lax` and `Max-Age`, a body with exactly `id`, `fullName`, `email` and `role`, the same 401 for an unknown email and a wrong password, `GET /auth/me` and `POST /posts` with the cookie (200, 201) and without it (401), an admin on `POST /posts` (403), logout clearing the cookie, and that the cleanup removed what the test created. `E2eData` gained a small `nextEmail()` so a signed-up user carries the marker email the cleanup and the sweep recognise.
- Frontend: `auth-schema.test.ts` and `profile-details-schema.test.ts` run the real Zod schemas (34 cases: each message and its field, the 7-versus-8 character boundary, the confirmation mismatch, http(s)-only links, the three end-date rules, the length limits). `login-form.test.tsx` and `signup-form.test.tsx` mock the mutation hook and cover field errors with no submit, the disabled button and its label while pending, the server's message in the alert, the generic fallback message, and the redirect on success. `auth-forms.integration.test.tsx` runs the real form, the real mutation hook and a real `QueryClient`, with only `@/services/api/auth` and the router mocked: it checks the payloads, that the user lands in the `authKeys.me` cache, the redirect, and that a failed signup never attempts the automatic login. It lives in `features/auth/mutations/` and not in `components/`, because the lint rule forbids component folders from importing `@/services/**`.
- Proof the tests protect something: I broke the code on purpose, one change at a time, and confirmed the matching test failed before restoring it. Removing the duplicate-email check failed the service spec and the e2e 409; flipping `includes` in `RolesGuard` failed its spec; dropping `@Roles('user')` on `POST /posts` failed the e2e admin 403; loosening the signup `refine` failed the schema and form tests; dropping the `@Public()` bypass failed its spec and most of the auth e2e; passing `role` through the service failed the unit spec, and turning `forbidNonWhitelisted` off failed the e2e 400.
- Results: backend unit 277 tests in 17 suites, the full e2e suite 266 tests in 12 suites, frontend 543 tests in 54 suites; `tsc --noEmit`, oxlint and eslint clean. The new specs gave the same result on repeated runs, including a single test run with `-t`.

| Area | Scenario | Result |
|---|---|---|
| Auth service | duplicate email 409, hash stored (cost 12), role never taken from the dto | pass |
| Auth service | login: same 401 for unknown email and wrong password, token payload | pass |
| Auth service | `updateCredentials`: 400, 403, 409, `VersionError` 409, other errors rethrown | pass |
| Guards | `RolesGuard` 403 cases; `JwtAuthGuard` protected by default, `@Public()` bypass | pass |
| Auth API (e2e) | signup, login cookie flags, `/auth/me`, `POST /posts` with and without the cookie, admin 403, logout | pass |
| Reactions, ranking | toggle, unique index, concurrency; ranking function and feed (earlier days) | pass |
| Frontend schemas | login, signup, update-credentials, profile and portfolio rules | pass |
| Frontend forms | field errors, disabled while pending, server error, redirect; integration through the real hook | pass |
| Rate limiting | 429 on signup and login | not covered at Day 17; Day 18 added `rate-limits.e2e-spec.ts` |

### Day 18 — Security and session hardening

- **Sessions:** login now issues a 15-minute access token (the `access_token` cookie) and a 7-day refresh token (the `refresh_token` cookie), signed with its own `JWT_REFRESH_SECRET`. `POST /auth/refresh` renews the access token. Only a SHA-256 hash of each refresh token is stored, up to 5 per user (a sixth login evicts the oldest); logout revokes only that device's token and always succeeds; a credential change (`PATCH /auth/me`) signs out every other device. The refresh token is not rotated, so two tabs refreshing together cannot invalidate each other, and there is no reuse detection.
- **Cookies:** one options helper sets and clears both cookies, because a browser only drops a cookie when the clear names the same path. The refresh cookie is scoped to `COOKIE_REFRESH_PATH` (default `/auth`), so it is sent only to the auth routes. The access cookie lives as long as the refresh token has left, so the Next middleware (which only checks that the cookie exists) does not send a user with an expired access token to `/login` before the refresh can run. `SameSite=Lax` is fixed, and `Secure` follows `NODE_ENV`.
- **Environment:** new or changed settings are `JWT_EXPIRES_IN` (now 15m by default), `JWT_REFRESH_SECRET` (32 or more characters, different from `JWT_SECRET`), `JWT_REFRESH_EXPIRES_IN` (7d), `NODE_ENV`, `COOKIE_SECURE` (on by default in production, refused as off there) and `COOKIE_REFRESH_PATH`. `FRONTEND_ORIGIN` must now be an exact origin and is required in production. An existing `backend/.env` needs `JWT_REFRESH_SECRET`, or the app no longer starts.
- **Request bodies:** JSON only, 100 kb. A non-JSON body is a `415`, an oversized one a `413`, and malformed JSON a `400` with a fixed "Malformed JSON body" message, because Node's own parse error quoted part of the body, including password text. CORS is registered before body parsing, so these rejections still carry CORS headers. The exception filter answers any other non-`HttpException` 4xx error with a generic message and logs a 5xx as name, code, method and path only.
- **Rate limits:** `POST /auth/refresh` is new at 20 a minute per IP. Signup and login stay at 5, `PATCH /auth/me` at 10, search at 40 and summarize at 10; the search and summarize limits were reviewed and kept. Every other route falls under the global default of 100 a minute per IP. `test/rate-limits.e2e-spec.ts` keeps the real throttler and checks the `429`, its failure envelope and `Retry-After` on login, signup, refresh, credential changes, search and summarize.
- **Frontend:** on a `401` the axios interceptor starts one shared `POST /auth/refresh`, then retries the original request exactly once. Concurrent failures cost one refresh, and a late `401` from an older request is only retried. A refresh that returns `401` ends the session with a single redirect to `/login?reason=session-expired`; a `429`, a 5xx or a network error on the refresh does not log the user out. Login, signup and the refresh call itself never trigger a refresh. The login page shows a status notice only for that exact reason and never renders text from the URL.
- **After Day 18, a logout fix:** a normal logout was reported as an expired session. Logout resets the query cache, which refetches the queries that are mounted; the notification bell polls a protected route and was still mounted, so once the cookies were cleared it got a `401`, the refresh got a `401` too, and the interceptor redirected to `/login?reason=session-expired`. `useLogout` now marks the session as signed out before it sends the request (and clears the mark if the request fails), login and signup clear it before the cache reset, and while it is set the interceptor does not refresh, retry or redirect. The mark is read in three places, including after a refresh succeeds and inside the redirect, so a refresh that was already running at sign-out cannot send the visitor to `/login`. The post purge job added after Day 18 is under Day 19 below.
- **Tests:** backend `test/refresh.e2e-spec.ts`, `test/cookies-secure.e2e-spec.ts`, `test/request-limits.e2e-spec.ts` and `test/rate-limits.e2e-spec.ts`, plus more cases in `auth.service.spec.ts`, `env.validation.spec.ts` and the exception filter spec. The e2e app helper gained a `realThrottler` option, and the OpenAPI snapshot changed on purpose (the refresh route, the cookies, the 413 and 415 rules and the search `429`). Frontend: `lib/axios/interceptors.test.ts` (including 8 cases for the signed-out mark and a sign-out while a refresh is in flight, in both outcomes), the session-expired notice, the middleware, and 7 hook tests plus an integration test that reproduces the logout bug with a mounted bell.
- **Known limitations:**
  - A user can have 5 sessions at once; the sixth login signs the oldest device out, and that device's next refresh fails.
  - There is no refresh-token rotation and no reuse detection: a stolen refresh token works until it expires (7 days), is logged out, or is evicted.
  - Throttling is per IP, and `trust proxy` is not set, so behind a reverse proxy every client would share one bucket.
  - A signed-out visitor costs one failing `GET /auth/me` and one failing `POST /auth/refresh` on each page load.
  - `useCurrentUser` treats every failure of `GET /auth/me` as "signed out", so a `429`, a 5xx or a network error during a page load shows a signed-in user as signed out until the page is reloaded.

### Day 19 — Post purge job (scheduled hard delete)

- A post that was soft-deleted is now hard-deleted 7 days later by a scheduled job, together with all of its comments and all reactions on the post and on those comments. The 7 days count from the post's own `deletedAt`. This is the first scheduled job in the project, and I built it partly to learn how cron jobs work. It adds no endpoint and no schema field, so the Swagger document (the OpenAPI snapshot test is unchanged and green) and the database diagram needed no change.
- **Where it lives:** `backend/src/posts/post-purge.service.ts` (`PostPurgeService`), registered in `PostsModule`, with `ScheduleModule.forRoot()` in `AppModule`. `PostsModule` also registers the Comment and Reaction schemas, because the job deletes those collections directly.
- **How it is scheduled:** the service implements `OnApplicationBootstrap` and registers a `CronJob` (from the `cron` package) through Nest's `SchedulerRegistry`. I did not use `@Cron()`, because a decorator's expression is fixed when the class loads, before `ConfigService` can supply it. The job is created with `waitForCompletion: true`, so a slow run makes the next tick skip instead of overlapping it. `handleCron()` only catches, logs and never throws, so a failed run cannot become an unhandled rejection inside the timer. `cron` is a direct dependency pinned to `4.4.0`, the version `@nestjs/schedule` 12.0.2 pins, so there is one copy (`npm ls cron` shows it deduped). `app.close()` stops the job, because the scheduler deletes every registry job on shutdown.
- **What one run does:** it takes up to 100 posts with `deletedAt <= now - retention` (`PURGE_BATCH_SIZE`), then for those posts deletes, in this order, the reactions on the posts, the reactions on their comments, all their comments (selected by `postId`, so cascaded, individually deleted and still-live comments all go), and finally the posts. It repeats until a batch comes back short, and stops if a batch deletes 0 posts so it cannot loop forever. Posts go last on purpose: if the server dies part-way, the posts are still marked deleted, so the next run finds them and finishes. Every step can safely run twice. Reactions are deleted by `{targetType, targetId}` so the `{targetType, targetId, createdAt}` index is used; I checked with `explain()` on seeded data that all four queries use an index (a delete on `targetId` alone is a collection scan).
- **Settings** (all optional, validated at startup in `env.validation.ts`): `POST_PURGE_ENABLED` (default `true`), `POST_PURGE_RETENTION_DAYS` (1-365, default 7), `POST_PURGE_CRON` (checked with `validateCronExpression`, default `0 3 * * *`, server time).
- **Trying it by hand:** `backend/scripts/seed-purge-data.ts` is a dev-only tool that creates three marker accounts (`purge-seed-*@devcommunity.local`) and a chosen number of expired posts, each with three comments (one cascaded, one deleted earlier on its own, one still live) and three reactions, plus three posts that must survive. It only ever removes rows reachable through those three accounts. Workflow, from `backend/`:
  1. `npm run seed:purge -- seed 10` creates the data (it runs `clean` first, so repeating it is safe).
  2. `npm run seed:purge -- status` lists the posts, how old each deletion is, and the comment and reaction counts. Orphans should read 0.
  3. Start the backend with a fast schedule: in PowerShell, `$env:POST_PURGE_CRON='*/10 * * * * *'; npm run start:dev`. Watch for `Purged 10 posts, 30 comments, 30 reactions` in the log. Starting the backend purges every expired post in the database it points at, not only the seeded ones, so only do this against a database with no real expired posts.
  4. `npm run seed:purge -- status` again: 3 posts, 3 comments, 6 reactions, 0 orphans.
  5. `npm run seed:purge -- clean` removes the rest. Then stop the backend and unset the variable (`Remove-Item Env:POST_PURGE_CRON`).
- **Tests:** `post-purge.service.spec.ts` (17 cases, stubbed models, config and registry, no `jest.mock`) covers the cutoff and the retention override, the order of the deletes, the filters, batching, the stop conditions, the error handling in `handleCron`, and registration when enabled and disabled. `test/posts-purge.e2e-spec.ts` (10 cases, `RUN_E2E=1`) calls `purgeExpiredPosts()` against the real database: one post deleted 8 days ago with all three comment shapes and their reactions is removed completely; a post deleted 6 days ago, a live post, and an old individually-deleted comment on a live post are untouched; a second run does nothing; 105 expired posts take two batches. It also asserts the e2e app has no `post-purge` job registered, and it refuses to run if real expired posts already exist in the database, because calling the purge would delete them. I did not test that cron fires on time; that is the library's job.
- Results: backend unit 360 tests in 19 suites, the full backend e2e 315 tests in 17 suites, `tsc --noEmit` (app and tests) and oxlint clean. I did not re-run the frontend suite, since no frontend code changed.
- **Known limitations of the purge:**
  - A comment that was soft-deleted on its own under a post that is still live is never purged (the e2e spec documents this).
  - If the server is down at the scheduled time, that run is missed; the next run catches up, because it selects by age, not by day.
  - The schedule uses the server's timezone.
  - With more than one backend instance, every instance fires the job. The deletes are idempotent, so this is harmless but wasteful.
  - If a reaction or comment delete fails part-way, the posts are still there and the next run retries the whole batch.
  - The purge writes no audit entry or notification; it only logs the counts. Audit logs are for admin overrides, and they are never purged. A `delete_post` audit entry keeps the post's id and title as plain values in `previousState`, so after a purge that id no longer points at anything.
  - There is no restore, so the 7 days is only a safety net for someone with database access.

### Day 19 — Docker Compose and release-candidate review

- **What it adds:** `compose.yaml` runs MongoDB 8, the backend and the frontend, plus a one-off `seed` service (profile `tools`) that creates the first admin. A multi-stage `backend/Dockerfile` and `frontend/Dockerfile` (Next.js `output: "standalone"`) build the images on `node:24-slim`; both run as the non-root `node` user. The backend waits for a healthy Mongo and the frontend waits for a healthy backend; each has a health check that uses `node -e fetch(...)`, since the slim image has no curl. Setup is in the README section Running with Docker Compose. No API, schema or Swagger change.
- **Configuration:** the backend's settings are in `compose.yaml`; the two JWT secrets come from a root `.env` and `docker compose` fails fast if either is missing. `NEXT_PUBLIC_API_URL` is a build argument (`http://localhost:3000`, the browser's address for the API, not the service name), and the frontend Dockerfile fails the build if it is empty.
- **Responsive fix:** at 375px the signed-in header, the feed's sort menu and the account menu overflowed the screen. Create Post is now hidden below `sm` (it is also in the avatar menu), and both dropdowns are anchored to their button's right edge with a width cap. Measured in a real 375px viewport before and after: page width now equals the viewport at 375, 360, 320, 768 and 1280, with both menus closed and open.
- **Verified from a fresh clone of `beta`:** all three services healthy; backend lint, 360 unit tests and build; backend e2e 315 of 315 (17 suites) against the Compose Mongo; frontend lint, 624 tests (60 suites) and `next build`. By curl: cookie attributes, CORS, login, refresh and logout, authorization, the post, comment and reaction flow, validation (including a 413), and the 429 with `Retry-After`. Persistence across `down` and `up`, Mongo stopped and restarted (the backend recovers on its own in about 13 seconds), backend stopped (the frontend keeps serving), and `restart` of everything. The images contain no `.env` file and no secret, and the logs contain no secret, token, password or email.
- **Known limitations:** listed under Known limitations, in the Day 19 subsection. Launch blockers: none found.

### Welcome email queue (background jobs with BullMQ)

- **What it adds:** signup now sends a welcome email, through a background job instead of inside the request. I built it to learn message queues and background workers. Signup adds a `welcome-email` job (carrying only the user id) to a BullMQ queue in Redis and returns; a worker sends the email over SMTP (nodemailer) and records `welcomeEmailSentAt` on the user. No endpoint or response changed, so the OpenAPI snapshot is unchanged; the user schema gained `welcomeEmailSentAt`, which `toJSON` strips.
- **Where it lives:** `backend/src/mail/` (`mail.constants.ts` with the job options, `mail.service.ts`, `mail.processor.ts` for the worker, `mail.module.ts`), the enqueue step in `AuthService.signup()`, and the Bull Board dashboard in `backend/src/queue-board/` at `/admin/queues`, guarded by the access-token cookie and the admin role read from the database (404 when `BULL_BOARD_ENABLED` is off).
- **Reliability choices:** each job has a fixed id (`welcome-<userId>`), so the same user is never queued twice; 5 attempts with exponential backoff (2, 4, 8, 16 seconds); the worker skips a user whose `welcomeEmailSentAt` is already set and marks it with an atomic update; a malformed or deleted user finishes the job quietly instead of retrying. A job's last failed attempt is logged at error level with the user id. Signup gives up on the queue after 2 seconds when Redis is unreachable and still returns 201.
- **Measured** (local Mongo in Docker, the API built and run with `node dist/main.js`, a 500 ms simulated mail delay, a 10-signup warm-up before each run): at 30 signups 2 at a time, signup's median was 388-582 ms with the queue against 828-918 ms sending inline. At 100 signups 10 at a time the medians overlap (bcrypt dominates), but with 30% of sends failing, inline sending failed 31-33 signups out of 100 while the queue failed none and delivered 99-100 emails. The full tables are in the PR description.
- **Crash and duplicate tests:** killing the API mid-way through 40 emails left 2 jobs in flight; after a restart they were recovered as stalled about 60 seconds later and every one of the 40 users got exactly one email. A second job for a user who already had the email sent nothing and logged "already sent, skipping".
- **Tests:** `mail.processor.spec.ts` and `mail.service.spec.ts` (14 cases) and the signup cases in `auth.service.spec.ts`; the e2e app now uses a fake queue and mail service (see Testing). Fixed along the way: since Bull Board was added, the e2e suite could not start at all (a CommonJS/ESM load cycle in Jest); `e2e-app.ts` now loads `@nestjs/bullmq` first. Results: backend unit 400 tests in 22 suites, e2e 316 in 17 suites (against a local Mongo, with Redis stopped), `tsc` and oxlint clean.
- **Compose:** the backend container now gets `REDIS_HOST=redis`, `SMTP_HOST=mailpit` and `SMTP_PORT=1025`, and waits for a healthy Redis. Checked with the containerised backend: one signup's email reached Mailpit in about half a second, and `/admin/queues` answered 404.
- **Load-test tooling:** `npm run seed:signups` fires a burst of signups, waits for the emails in Mailpit, and reports per-user duplicates and misses, plus the queue's failed and pending jobs; `--cleanup` deletes only the `load-…@example.com` users it made. `npm run mail:test` and `npm run mail:enqueue` send one email or one job by hand.
- **Known limitations:** listed under Known limitations, in the Welcome email queue subsection.
