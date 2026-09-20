# Developer Community Platform

I'm building a Developer Community Platform where members can authenticate, maintain a developer profile, publish posts, and (eventually) comment, react, search, and browse ranked content. This repo covers the platform through Day 7 of my 20-day build plan: project foundations, authentication with role-based access, a full developer profile API and form, and a Posts API with ownership, pagination, and admin moderation.

## Stack

- **Backend:** NestJS 12, MongoDB Atlas via Mongoose 9, class-validator/class-transformer, Passport-JWT, bcrypt, Swagger.
- **Frontend:** Next.js 16 (App Router), React 19, TanStack Query, axios, Tailwind CSS v4.

## Project structure

- `backend/` — NestJS API (`src/<feature>/` modules: `auth`, `users`, `profiles`, `posts`, `audit`, `notifications`, `health`; shared code in `src/common/`).
- `frontend/` — Next.js app (`app/` routes, `components/`, `lib/`).
- `docs/` — per-day spec and plan files, and a product requirements doc (local reference, not part of the public repo).
- `PROJECT_REPORT.md` — a detailed architecture and decisions write-up of the system as it stands today.
- `AI_USAGE.md` — how I used AI tooling on this project, and what I personally reviewed and caught.

## Getting started

### 1. Clone and install

```bash
git clone git@github.com:abrar-faseeh01/Week-1_6Sense.git
cd Week-1_6Sense
```

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
JWT_EXPIRES_IN=2h
FRONTEND_ORIGIN=http://localhost:3001
```

`MONGODB_URI` and `JWT_SECRET` are required — the app fails fast at startup if either is missing, or if `JWT_SECRET` is under 32 characters (`backend/src/config/env.validation.ts`).

```bash
npm run start:dev
```

The backend runs on `http://localhost:3000`. API docs are at `http://localhost:3000/docs` (Swagger).

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

## Environment variables

Real `.env` files are gitignored in both apps. Use the committed example files as the source of truth:

- `backend/.env.example` — `MONGODB_URI`, `PORT`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `FRONTEND_ORIGIN`.
- `frontend/.env.example` — `NEXT_PUBLIC_API_URL`.

## Authentication and roles

- A JWT (`{sub, email, role}`) is issued on login and stored in an **httpOnly cookie** (`access_token`) — never in a client-readable form, and never sent as an `Authorization` header. The frontend just sends `credentials: "include"` on every request.
- Roles are `admin | user`. Every signup is hard-coded to `role: "user"` server-side — there's no field a client can send to self-promote.
- Every route requires a valid session by default; only routes explicitly marked `@Public()` (signup, login, logout, health) skip that check.
- `PATCH /auth/me` (change your own password, full name, or — admin-only — email) always re-verifies your current password before applying any change, and re-issues a fresh cookie on success.

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
| `POST /auth/login` | Public | Sets the session cookie; throttled |
| `POST /auth/logout` | Public | Clears the cookie; always succeeds |
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
| `POST /posts` | Authenticated | Author is always the caller, never client-supplied |
| `GET /posts` | Public | Cursor-paginated feed, newest first; `?limit=` (1-50, default 10) and `?cursor=` |
| `GET /posts/:id` | Public | A soft-deleted post 404s the same as a nonexistent one |
| `PATCH /posts/:id` | Owner or admin | Partial update — at least one of `title`/`body` required |
| `DELETE /posts/:id` | Owner or admin | Soft delete (`deletedAt`) — excluded from every read path afterward, never hard-deleted |

The list response shape is `{items, nextCursor}` — pass the previous response's `nextCursor` as `?cursor=` to get the next page; `nextCursor: null` means there are no more posts. Every write on `PATCH`/`DELETE` uses optimistic concurrency: a genuine conflicting concurrent edit returns `409`, never a silent overwrite. An admin editing or deleting someone else's post is audit-logged (identifying the specific post, not just the author) and the author is notified; a self-edit or self-delete produces neither.

### Users / admin (`/users`)

| Method & path | Access | Notes |
|---|---|---|
| `GET /users` | Admin only | Full user list |
| `DELETE /users/:id` | Admin only | Refuses to delete any admin account, including by another admin |
| `PATCH /users/:id/fullname` | Admin only | Rejects targeting your own id — use `PATCH /auth/me` for that |

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
- Edit or soft-delete any member's post via the API (`PATCH`/`DELETE /posts/:id`), with an optional reason recorded on each action — no dedicated admin UI for this yet, only the API.
- Review a full, append-only audit trail of every override action taken by any admin, with expandable before/after detail (`/admin/audit-log` page).

Every admin-override action creates one audit-log entry (who, what changed, before/after state, optional reason) and one in-app notification for the affected member.

## Known limitations

- No session revocation / "log out everywhere" — a JWT stays valid until it expires. The one exception: deleting an account immediately kills its sessions, since every request re-reads the account from the database.
- No in-app way to promote a user to admin — the only path is the one-time `seed:admin` script or a direct database edit.
- No pagination on the admin user list, the audit log, or the notification list.
- No email verification on signup and no password-reset flow.
- Notifications are polled (every 45 seconds while the app is open), not pushed in real time.
- The admin audit-log page's action labels don't yet cover the three newest actions (`update_headline`, `update_bio`, `update_portfolio_projects`) — it falls back to showing the raw action name for those instead of a friendly label.
- No search or filtering on the admin user list or profile viewing — the full list is returned and any narrowing happens client-side, if at all.
- No frontend UI for posts yet beyond a placeholder "coming soon" create-post page — the Posts API (Day 7) is backend-only until Day 8 builds the feed, post details, and create/edit UI.
- Soft-deleted posts are retained in the database indefinitely — there's no scheduled purge (TTL index or cron job) that hard-deletes them after any retention period, and no restore path either.
- Admin-override actions (profile edits, post edits/deletes) aren't wrapped in a database transaction — if the audit-log/notification write fails after the underlying change already saved, the change persists with no audit trail. Not yet hit in practice; the guard that does fire (optimistic concurrency on a genuine conflicting edit) correctly returns `409`, not `500`.
- No structured server-side logging for unexpected (non-`HttpException`) errors — the global exception filter returns a generic 500 to the client without logging the real error anywhere, which would make a genuine production bug hard to diagnose from logs alone.

## Progress

### Day 1 — Project setup and request lifecycle

- Set up the NestJS backend with Zod-validated environment configuration.
- Connected MongoDB Atlas through Mongoose.
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
- Built `ProfilesModule`: `GET/PATCH /profile/me` for self-service, and `GET /profile/:id` plus owner-or-admin write routes for every profile field, so an admin can edit any member's profile with the same audit-logging and notification behavior that already existed for skills, experiences, and full-name changes.
- Kept `UsersController` scoped to account administration only (list, delete, admin rename) and extracted the shared owner-or-admin authorization logic so both controllers use one implementation.

### Day 6 — Complex developer profile form

- Built the profile edit form with React Hook Form and Zod, hydrating existing profile data via `reset()`.
- Used `useFieldArray` for portfolio projects (stable `field.id` keys), with add/remove and per-project technology tags.
- Moved experience editing to its own dedicated page, and added a profile view page that shows the full developer profile with entry points into editing.
- Wired save behavior through TanStack Query, invalidating the profile cache on success.

### Day 7 — Posts API with ownership and pagination

- Added the `Post` schema (`authorId`, `title`, `body`, `likeCount`/`dislikeCount`/`commentCount` as denormalized placeholders for Day 9/11, `deletedAt`) with optimistic concurrency, and built `PostsModule`: create, cursor-paginated list, detail, update, and soft delete.
- Pagination is cursor-based on `_id` alone (revised from an initial `{createdAt, _id}` design after `.explain()` showed the original shape couldn't get tight index bounds); the feed index is `{deletedAt: 1, _id: -1}`, confirmed via `.explain()` to produce a tight range scan rather than a full collection scan.
- `PATCH`/`DELETE /posts/:id` reuse the existing owner-or-admin authorization pattern, extended so an admin editing or deleting someone else's post is audit-logged (the audit entry identifies the specific post, not just the author) and the author is notified — the same `recordAdminOverride` helper now used by profiles, users, and posts.
- Verified against a real MongoDB Atlas database throughout: forced genuine optimistic-concurrency conflicts via concurrent requests (confirmed `409`, never `500`), traced actual queries to confirm the list endpoint doesn't do N+1 author lookups (one batched query regardless of page size), and confirmed list/detail responses never expose `passwordHash` or `email` on the author.
- Added full Swagger/OpenAPI documentation across every existing module (auth, users, profiles, posts, audit, notifications) — not just health, which was all that existed before — including a cookie-based auth scheme matching this app's actual httpOnly-cookie transport.
