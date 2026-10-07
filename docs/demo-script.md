# Demo script (15 minutes)

Primary workflows, one failure scenario, and one frontend and one backend decision.

## Before the demo (do this the day before and again 10 minutes before)

- [ ] `docker compose up -d --build`, then `docker compose ps` shows `mongo`, `backend` and `frontend` as healthy.
- [ ] First admin exists (`docker compose run --rm --build seed`, credentials passed from the shell, never in `.env`).
- [ ] Open `http://localhost:3001` (not `127.0.0.1`) in Chrome, Edge or Firefox. Swagger is at `http://localhost:3000/docs`.
- [ ] Two different browsers (for example Chrome and Edge), one for a member and one for the admin. Tabs and windows of the same browser share the session cookie, so they cannot hold two accounts.
- [ ] Throwaway member account ready to sign up fresh during the demo (use a new email each run).
- [ ] Run the whole script once start to finish. If anything fails, fix or cut it from the script; do not discover it live.
- [ ] Backend and frontend tests were green at the last check (`npm test` in each; e2e on its own with `RUN_E2E=1`).

## Timeline

| Min         | What I do                                                                                                                                                                                                                                                                                                                         | What it shows                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 0:00-1:00   | Say what the project is: a developer community platform, NestJS and MongoDB behind a Next.js frontend, run here with Docker Compose. Show `docker compose ps`.                                                                                                                                                                    | Release candidate runs from one command                                              |
| 1:00-3:00   | Sign up a new member, land on the feed, open the avatar menu. Point out the cookie in dev tools: `access_token` is `HttpOnly`.                                                                                                                                                                                                    | Zod-validated form, httpOnly session, no token in JavaScript                         |
| 3:00-4:30   | Open my profile and edit it: headline, bio, a skill, one portfolio project (add a second, remove it). Save and reload.                                                                                                                                                                                                            | React Hook Form with `useFieldArray`, data persisted, validation messages            |
| 4:30-6:30   | Create a post. In the feed, change the sort (Top, Latest, Most Discussed) and show the URL change. Type a word in the header search.                                                                                                                                                                                              | Cursor-paginated feed, URL as state, debounced and cancellable search                |
| 6:30-8:30   | Open the post. Comment, reply to the comment, edit my comment, then like the post and watch the count move at once. Click the "who reacted" line.                                                                                                                                                                                 | Threaded comments, optimistic reactions, public reactor list                         |
| 8:30-9:30   | Click Summarize. Point at the "Mock summary" label.                                                                                                                                                                                                                                                                               | Summarizer behind a provider interface, mock by default, output treated as untrusted |
| 9:30-12:00  | Switch to the admin browser. Open the member's post, edit it with a reason, then open `/admin/audit-log` and show the entry. Switch back: the member sees a notification. Optionally show that an admin cannot author a post: `POST /posts` answers `403` (check in Swagger or the Network tab; rehearse what the UI does first). | Roles, owner-or-admin permissions, audit log, notification                           |
| 12:00-13:00 | **Failure scenario.** See below.                                                                                                                                                                                                                                                                                                  | Graceful failure and recovery                                                        |
| 13:00-15:00 | Explain one frontend and one backend decision (below), then limitations and next improvements from the README.                                                                                                                                                                                                                    | Understanding                                                                        |

## Failure scenario: the backend goes down

1. With the home page (`/`) open, run `docker compose stop backend`.
2. Click the status card's retry. It shows the error state (it does not spin forever or crash the page), and the frontend itself keeps serving.
3. Run `docker compose start backend`, wait about 15 seconds for it to turn healthy, click retry: the card goes back to connected.

Say what it proves: the frontend has distinct loading, connected and error states, and the backend recovers by itself. If the demo machine is slow, rehearse the wait.

Backup scenario (no Docker needed): six wrong logins in a minute return `429` (limit 5 a minute per IP). The form shows the throttler's raw message, which is a known limitation.

## Decision to explain: frontend

**Optimistic reactions with an exact rollback.** The buttons update the count before the server answers: `onMutate` cancels in-flight reads, snapshots every cache entry the post lives in (the feed, its detail entry, "Posts made by you", or the comment tree) and writes the toggled state. `onSuccess` replaces the guess with the server's counts, `onError` restores the snapshot, and `onSettled` only refetches when it is the last reaction still in flight. A double click in the same tick once sent two requests, which is why a second check asks the mutation cache. Trade-off: more cache code than a plain refetch, in exchange for an interface that feels instant. Where to point: `features/reactions`, `features/posts/mutations`.

## Decision to explain: backend

**One reaction per user per target, enforced by a unique index, with atomic toggling.** The database refuses a second reaction from the same user (`{userId, targetType, targetId}`), so correctness does not depend on the code being careful. The toggle uses single-document atomic operations (delete if the same type, switch if the opposite, insert otherwise), and a request that loses an insert race catches the duplicate-key error and reports what actually exists instead of returning a 500. Counters use a plain `$inc`: a floor on the write lost an update under concurrency in my own test, so the floor is applied when a count is shown. Trade-off: no transactions, so a crash between the reaction and its counter can leave a counter off by one. Where to point: `backend/src/reactions/`, the 20-concurrent-request cases in `test/reactions.e2e-spec.ts`.

## If asked

- **Where are the permission rules?** README, Authentication and roles, and the API reference tables. Routes are protected by default (`APP_GUARD`), `@Public()` opts out, `@Roles('admin')` requires a role.
- **Is the AI real?** No key is set in Compose, so it is the mock; Gemini is wired and checked by hand once, never called from tests.
- **What would you do next?** README, Next improvements.
