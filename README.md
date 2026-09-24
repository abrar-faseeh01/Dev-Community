# Developer Community Platform

I'm building a Developer Community Platform where members can authenticate, maintain a developer profile, publish posts, comment (threaded, with replies), react (like/dislike), and (eventually) search and browse ranked content. This repo covers the platform through Day 11 of my 20-day build plan: project foundations, authentication with role-based access, a full developer profile API and form, a Posts API with ownership, pagination, and admin moderation, the posts UI (infinite-scroll feed, post page, create/edit form), a threaded comments API (create, reply, list as a tree, cascade delete, and edit), and the comments UI itself (recursive reply/edit/delete, permission-gated, with full keyboard focus management), and the reaction engine on the backend (like/dislike on posts and comments with toggle behaviour, a unique index, and concurrency-safe counters; the reaction buttons themselves are Day 12). After Day 8 I also restructured the frontend into a feature-first layout (see the Day 8 section under Progress).

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

- No session revocation / "log out everywhere" — a JWT stays valid until it expires. The one exception: deleting an account immediately kills its sessions, since every request re-reads the account from the database.
- No in-app way to promote a user to admin — the only path is the one-time `seed:admin` script or a direct database edit.
- No pagination on the admin user list, the audit log, or the notification list.
- No email verification on signup and no password-reset flow.
- Notifications are polled (every 45 seconds while the app is open and the tab is visible), not pushed in real time.
- No search or filtering on the admin user list or profile viewing — the full list is returned and any narrowing happens client-side, if at all.
- The posts list response carries every post's full `body` (there's no excerpt field), so a page of long posts is a large response; the feed cards only truncate visually.
- The feed has no search, filtering, or alternative sort yet (Day 14), and post cards don't show like/dislike counts or reaction buttons yet — the API returns them since Day 11, but the UI is Day 12. `commentCount` is accurate and now rendered, in the comments section's "Comments (N)" heading.
- `frontend/src/middleware.ts` still uses Next.js 16's deprecated `middleware` name (the current name is `proxy`); it works, and the rename is deliberately left as its own change.
- Soft-deleted posts are retained in the database indefinitely — there's no scheduled purge (TTL index or cron job) that hard-deletes them after any retention period, and no restore path either.
- Admin-override actions (profile edits, post edits/deletes) aren't wrapped in a database transaction — if the audit-log/notification write fails after the underlying change already saved, the change persists with no audit trail. Not yet hit in practice; the guard that does fire (optimistic concurrency on a genuine conflicting edit) correctly returns `409`, not `500`.
- No structured server-side logging for unexpected (non-`HttpException`) errors — the global exception filter returns a generic 500 to the client without logging the real error anywhere, which would make a genuine production bug hard to diagnose from logs alone.
- `GET /posts/:postId/comments` returns the whole tree with no pagination, so the response is unbounded on a very active post.
- Editing a comment keeps no history — only the current body is stored, and the "edited" signal is just `createdAt` differing from `updatedAt`.
- A reply created at the exact instant a concurrent delete cascades past it can end up live under a deleted parent: invisible in the tree but still counted, so `commentCount` can read one higher than what's shown. The count itself isn't wrong; fixing this fully needs multi-document transactions, which this backend doesn't have configured.
- Two deletes of the same comment subtree that truly overlap can each return a partial `deletedCount`, though the total decrement to `commentCount` is always exact (measured by forcing six simultaneous deletes together 25 times).
- When a post's own author removes someone else's comment, there's no audit entry and the comment's author isn't told — only an admin's removal is logged.
- No notification yet when someone comments or replies on a post.
- No rate limiting on comment routes yet (planned for the security-hardening day).
- Deleting a user account doesn't yet remove or reassign their comments — they still show up, with the author shown as "Deleted user".
- Reactions from a deleted account, and reactions on a post or comment that has since been soft-deleted, stay in the database and keep counting toward the counters; nothing removes them yet.
- The reaction row and its counter are two separate writes with no transaction, so a server crash between them can leave a counter one off. A counter whose update fails while the server is running is repaired by a recount from the reaction rows; a crash is not.
- A counter that has drifted below zero is shown as `0` but is not corrected in storage.
- Signed-in reads (feed, post, comment tree) cost one extra user lookup for the session check, plus one reactions query per page or thread.
- If a reader's session expires while a comment composer or reply form is already open, the `401` on submit hard-redirects to `/login` before the typed text can be saved anywhere — fixed by Day 18's refresh-token flow.
- `ConfirmDialog`'s focus-restore on close is guarded against a removed element, but doesn't pick a replacement target itself — that's each caller's job. Comment delete does this (focuses the parent comment, or the heading for a root); deleting a post from "Posts made by you" doesn't yet.

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
