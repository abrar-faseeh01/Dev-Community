# Developer Community Platform

I'm building a Developer Community Platform where members can authenticate, maintain a developer profile, publish posts, and (eventually) comment, react, search, and browse ranked content. This repo covers the platform through Day 8 of my 20-day build plan: project foundations, authentication with role-based access, a full developer profile API and form, a Posts API with ownership, pagination, and admin moderation, and the posts UI (infinite-scroll feed, post page, create/edit form). After Day 8 I also restructured the frontend into a feature-first layout (see the Day 8 section under Progress).

## Stack

- **Backend:** NestJS 12, MongoDB Atlas via Mongoose 9, class-validator/class-transformer, Passport-JWT, bcrypt, Swagger.
- **Frontend:** Next.js 16 (App Router), React 19, TanStack Query, axios, Tailwind CSS v4.

## Project structure

- `backend/` — NestJS API (`src/<feature>/` modules: `auth`, `users`, `profiles`, `posts`, `audit`, `notifications`, `health`; shared code in `src/common/`).
- `frontend/` — Next.js app, all source under `frontend/src/`: `app/` (thin routes), `features/<name>/` (auth, posts, profile, users, audit, notifications, health), `services/api/` (the only code that calls the backend), `lib/`, `components/`, `hooks/`, `providers/`, `constants/`. The layout and data flow are described under Day 8 in Progress.
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

- A JWT (`{sub, email, role}`) is issued on login and stored in an **httpOnly cookie** (`access_token`) — never in a client-readable form, and never sent as an `Authorization` header. The frontend's axios client sets `withCredentials: true`, so the browser attaches the cookie on every request.
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
| `POST /posts` | Regular members only | Author is always the caller, never client-supplied. An admin gets `403` — admins moderate but don't author |
| `GET /posts` | Public | Cursor-paginated feed, newest first; `?limit=` (1-50, default 10), `?cursor=`, and optional `?authorId=` (one author's posts, used by "Posts made by you") |
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
- Edit or soft-delete any member's post from the post page, through the same edit form and delete dialog a member uses (marked "as admin", with an optional reason recorded on each action). There's no separate admin panel for posts.
- Review a full, append-only audit trail of every override action taken by any admin, with expandable before/after detail (`/admin/audit-log` page).

Every admin-override action creates one audit-log entry (who, what changed, before/after state, optional reason) and one in-app notification for the affected member.

## Known limitations

- No session revocation / "log out everywhere" — a JWT stays valid until it expires. The one exception: deleting an account immediately kills its sessions, since every request re-reads the account from the database.
- No in-app way to promote a user to admin — the only path is the one-time `seed:admin` script or a direct database edit.
- No pagination on the admin user list, the audit log, or the notification list.
- No email verification on signup and no password-reset flow.
- Notifications are polled (every 45 seconds while the app is open and the tab is visible), not pushed in real time.
- No search or filtering on the admin user list or profile viewing — the full list is returned and any narrowing happens client-side, if at all.
- The posts list response carries every post's full `body` (there's no excerpt field), so a page of long posts is a large response; the feed cards only truncate visually.
- The feed has no search, filtering, or alternative sort yet (Day 14), and post cards don't show like/dislike/comment counts — those are always 0 until Days 9 and 11, so showing them would imply features that don't exist.
- There's no frontend test runner yet (Jest and React Testing Library arrive on Day 17); frontend changes are verified with `npm run lint`, `npx tsc --noEmit`, `npm run build`, and manual testing against the running app.
- `frontend/src/middleware.ts` still uses Next.js 16's deprecated `middleware` name (the current name is `proxy`); it works, and the rename is deliberately left as its own change.
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
- The axios interceptor turns every failure into an `ApiError` (message, per-field errors, HTTP status) and redirects to `/login` on a `401`, except for requests that set `skipAuthRedirect` (`/auth/me`, `/auth/login`, `/auth/signup`, where a `401` is expected). The exemption is a flag on the request rather than a URL list inside the interceptor.
- Forms use React Hook Form with Zod schemas kept in `features/<name>/schemas/`, and form types come from the schema. The settings form moved from plain state to this pattern, so its errors now appear inline instead of as browser pop-ups.
- Every route is referenced through `constants/routes.ts` instead of typed as a string.
- An ESLint rule fails the lint if a page or component imports `axios` or anything under `services/`, so the data flow above can't quietly erode.
- Two behavior notes: the unread-notification badge now stops polling while the browser tab is hidden, and the admin user list and audit log still refetch on every visit.

**Verification.** `npx tsc --noEmit`, `npm run lint` (0 errors, 0 warnings), and `npm run build` all pass, and the ESLint rule was checked against a deliberate violation. I then walked through login, signup, settings, the posts flows, profile and experience editing, notifications, and the admin pages by hand.

**Adding new code.** A new feature gets its own `features/<name>/` folder plus a `services/api/<name>.ts` file; its routes are added to `constants/routes.ts`. Something is moved into a shared folder only once a second feature needs it.
