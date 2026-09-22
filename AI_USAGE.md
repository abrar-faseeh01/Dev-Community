# AI Usage

## Which tools, and for what

I used Claude Code as my coding assistant for implementation work on
this project — writing and editing backend/frontend code, running the
app locally, and executing test requests against it. I used it inside
this same conversational tool for planning too, rather than a separate
planning tool: before any non-trivial change, I had it lay out a plan
(what files, what order, what could break) and I reviewed that plan
before letting it touch code.

## How I worked with it

I didn't let it freely refactor whatever it judged best. For anything
that touched authorization, audit logging, or existing working routes, I
gave it explicit standing rules up front, repeated across tasks: read
the actual current files first (not its own memory of them, not a prior
summary), don't touch anything outside the task's stated scope, confirm
no regressions, and never use real admin credentials in any script or
command — every test had to use a throwaway account it created and
deleted itself.

For the profile-routes consolidation specifically (moving skills/
experience/headline/bio/portfolio-project management from
`UsersController` into `ProfilesModule`), I made it run two full
read-only verification passes — report the exact current routes,
behavior, and audit/notification wiring, then assess a proposed plan
against that — **before** I let it change a single line of code. Once I
approved the plan, I had it work in checkpoints (build → test
exhaustively → report → wait for my go-ahead → next checkpoint) instead
of doing the whole thing in one uninterrupted pass, specifically so I
could catch a wrong turn early rather than after everything was already
built on top of it.

## What I reviewed, caught, and corrected, day by day

This is the part I want to be specific and honest about, because a
write-up that implies everything went smoothly on the first try isn't
useful evidence of anything. I'm only itemizing the days below where
something specific actually came up worth disclosing — Days 1-4 and 6
followed the same review discipline described above (I read the plan,
watched execution in checkpoints, and tested before accepting), but I
don't have a specific incident from those days detailed enough to write
up honestly, so I'd rather leave them out than pad this section with
generic filler.

### Day 5 — Developer profile API (profile-routes consolidation)

**I caught a wrong assumption in my own first version of the plan.**
Before writing the corrected consolidation plan, I asked for a read-only
report on the actual current code. It came back showing that what I'd
been calling "the admin-override version" of the skills/experience
routes didn't exist as a separate thing — self-editing and admin-editing
went through the exact same route and method, branching only on who was
making the request. My first plan had implicitly assumed two parallel
implementations to relocate. I corrected the plan before any code was
touched, based on that finding.

**I asked for a second verification pass on the corrected plan, and it
found more gaps.** The corrected plan claimed `GET /profile/me` already
returned the complete profile — it didn't; `experiences` was missing
from that response entirely. It also claimed the frontend blast radius
was one file with six call sites; a full grep across the whole frontend
(not just the two profile pages I'd assumed were the only ones) turned
up eight call sites across three files, including one in the admin users
page I hadn't accounted for. Both gaps went into the plan before
implementation started.

**I asked it to double-check its own plan against a real code
dependency, and it found a step that would have broken something.** The
plan called for deleting `getProfileById` from `UsersService` once
skills/experience moved out. While actually implementing that deletion
step, it re-checked every remaining caller first and found that
`updateFullName` — which was staying in `UsersController`, not moving —
still called `getProfileById` for its "before" snapshot. Deleting it as
planned would have broken full-name editing. I had it keep the method
and update the comment explaining why, instead of following the
original plan literally.

**I found a real bug through deliberate edge-case testing, not by
inspection.** After adding admin-override routes for `headline` and
`bio` (fields with no schema default), I had it test the very first
edit of a field that had never been set on a given account. The
resulting audit-log entry was missing its `previousState` key entirely
— not `null`, just silently absent — because MongoDB drops object keys
whose value is `undefined`, and an unset string field reads as
`undefined`, not `null`. `skills` never hit this because Mongoose
auto-defaults arrays to `[]`. I had it fix this by coercing to `null`
explicitly, then re-tested against a fresh account specifically to
confirm the fix, rather than trusting the code read correctly.

**I caught one of my own flawed test cases before accepting it as a
pass.** During a later regression pass, a test meant to confirm an admin
gets blocked from renaming themselves through the admin-only route used
a one-character name. That request correctly got rejected — but with a
400 validation error, not the 403 the test was actually supposed to
prove. The DTO validation ran before the self-block check ever executed,
so the test hadn't actually exercised the thing it claimed to. I
re-ran it with a valid name and confirmed the real 403 before counting
it as verified.

**I found and corrected my own research mistake, not the AI's.** Earlier
in this project, I'd concluded from a grep search that no controller
existed for the audit log. When I later needed to write accurate
documentation, I re-checked directly and found `audit.controller.ts` did
exist and always had — my earlier grep pattern had a syntax error that
silently matched nothing. The route itself was never affected by this;
it was purely a gap in my own record of the codebase, and I corrected it
before writing it into the documentation.

### Day 7 — Posts API with ownership and pagination

I kept the same checkpointed, verify-before-code process for Day 7, and it kept paying off — twice before any code was written, and twice more during testing.

**I asked for a fresh check of a given implementation prompt before letting it touch code, and the check turned up two real gaps.** The prompt for wiring admin-moderation into the posts routes explicitly claimed one prerequisite already existed (`AuditAction` already had `'update_post'`/`'delete_post'` values from an earlier step). A fresh grep showed that was false — those values had never actually been added. The same check also showed that the post-deletion path didn't populate the author's name, which the admin-notification code needed and had no other source for. Both went into a corrected version of the prompt before any code changed.

**Live testing surfaced a real bug that code review alone hadn't caught.** An admin editing a post with a reason attached returned a bare 500. Since the app's global exception filter silently swallows the details of any unexpected error, I had it add a temporary debug log, reproduce the failure, and read the real error: a Mongoose validation failure caused by passing a populated author *object* where a plain user-id string was expected. The root cause was that `.populate()` mutates the post document in place, so a variable read a second time after that call no longer held what it held the first time. I had it fix this by capturing the id once, before the mutating call, then revert the temporary debug logging and confirm via `git diff` that nothing else in that file had changed.

**That same bug exposed a real, still-open architectural gap, which I asked it to document rather than silently fix.** The first (buggy) admin request had already saved its change to the database before the failure happened — meaning a real edit went through with zero audit trail while the client saw a 500 implying nothing had happened. This isn't unique to posts; the same admin-override pattern is used across profiles and users, and none of it is wrapped in a database transaction. I chose not to have it fixed now, since a real fix means introducing Mongoose sessions across every controller that uses this pattern — bigger than one day's scope — but had it recorded as a known limitation rather than left undocumented.

**A full final verification pass, run deliberately as its own step against the original plan's checklist, found one more thing worth knowing rather than "fixing."** Forcing genuine concurrent requests at the same post to test optimistic-concurrency handling, I noticed the delete path sometimes returned `404` instead of the expected `409` for a losing request. That turned out to be correct, not a bug — a request whose read happens after a competing delete has already committed correctly gets filtered out as "not found" before it ever reaches the version-conflict check. I had it explain why, rather than accept the first plausible-looking explanation.

**I also had it audit the Swagger documentation for correctness, not just trust that adding decorators was enough.** After annotating every route, I had it fetch the actual generated OpenAPI document and diff that against real HTTP responses instead of eyeballing the source. That caught two real problems that would otherwise have shipped invisibly: a `null`-typed response field that crashed the server on boot with a circular-schema error, and a cookie-auth security scheme registered under the wrong internal name (`addCookieAuth` defaults to `'cookie'`, not the cookie's own name), which would have made Swagger UI's Authorize button silently non-functional for every protected route in the document.

### Day 8 — Feed and reusable post interface (and the frontend restructure)

Day 8 followed the same plan-first, checkpointed process. I had a Day 8 plan written against the actual current files before any UI code existed, and that plan records its own revision: the first version put Edit and Delete on every feed card, and after a regression pass I moved them to the post page and a "Posts made by you" page, so the feed stays a reading surface. A few small backend fixes landed as separate commits after the UI was working (whitespace-only titles and bodies, blocking admins from creating posts at the API instead of only hiding the button, and rejecting an explicit `null` update body).

After Day 8 I had the whole frontend moved to a feature-first structure. This was a large change (about 120 files), so I put more checks around it than usual.

**I asked for the plan to be cross-checked against the reference structure document instead of accepting it, and the check found real gaps.** The login and signup Zod schemas were defined inside the page files, against the document's rule that schemas live in the feature; the axios interceptor hard-coded a list of `/auth/*` URLs, which is feature-specific logic in a global place; and the same "signed out, go to login" and "not an admin, go home" effects were copy-pasted across several pages. All three went into the plan before any code moved.

**I questioned a structural choice and it changed.** The first plan put admin, posts, profile, and settings inside a `(dashboard)` route group. I pointed out that nothing shares a dashboard layout and that posts and profile pages are public, so the group was misleading; they became plain top-level route folders and only `(auth)` stayed a group.

**I asked for a re-verification against the real code and the installed Next.js 16 docs, not memory, and I asked how confident it was before approving.** The re-check turned up that `middleware` is deprecated in favor of `proxy` in this Next version (I left the rename out of scope and documented it), that the settings schema had to mirror the backend's `UpdateCredentialsDto`, and how the header's notification polling and refetch-on-open actually behaved, so the replacement matched it. It also caught a wrong claim in the plan itself — that the full-name schema was defined inline in a page; when the file was read during implementation it was already in the schemas file, and the plan was corrected rather than the code bent to fit it. The confidence answer named the four riskiest areas (auth provider, notification polling, post-delete cache timing, the 401 redirect flag), and those were the flows I tested by hand.

**Before anything moved I set up a way back:** committed my Day 8 work first, created a git tag and a separate branch, and copied the git-ignored files (`.env.local`, planning docs) to a backup folder. The first attempt to move the folders then failed with "permission denied"; instead of forcing it, the assistant checked the running processes and found my `next dev` server holding the `app/` folder open, and asked me to stop it.

**A tooling mistake was caught by the tool it was adding.** The new ESLint rule that blocks components from importing axios used a glob pattern `"axios"`, which also matched my own `@/lib/axios/api-error` import, so the first lint run failed on two legitimate files. I only knew because I ran lint rather than assuming the rule was right; the fix was an exact-name restriction for the `axios` package, re-tested against a deliberately bad file to confirm it still failed when it should. Separately, after moving routes, `tsc` reported errors in generated route types that didn't reflect any real problem; regenerating them with `next typegen` cleared them, rather than editing code to silence them.

**One design change was made mid-implementation and disclosed afterward.** The approved plan kept a separate auth context provider; while writing it, the assistant found that only the auth forms and the header used the login/logout functions, so it moved the current user into the query cache and dropped the provider. It said so plainly in its final summary along with two small behavior changes — settings validation now shows inline instead of browser pop-ups, and notification polling pauses while the tab is hidden — and I accepted them after testing.

**Verification was deliberately proportionate.** `tsc`, lint (0 errors, 0 warnings), and a production build after each group of changes, plus one manual walk-through of the flows the change could have affected — not a large ad-hoc test suite, since there's no frontend test runner until Day 17.

### Day 9 — Threaded comments API

I kept the same plan-first, checkpointed process, splitting the work into small steps (harness, then one comment feature at a time, then the post-delete cascade, then editing) and stopping for my go-ahead between each one.

**Planning the harness surfaced a real, unrelated bug before any comment code existed.** While reading the actual current files to plan Day 9 (not trusting an older summary), I found that `UsersService.deleteUser` does a hard delete, and posts by a deleted user crashed `GET /posts` with a bare 500 — a real Day 7/8 defect, not something Day 9 introduced. I had it reproduce all four affected requests (the feed, the detail route, an admin edit, an admin delete) before writing any fix, confirmed the fix against those same four requests afterward, and had it recorded as an incidental fix in `docs/plan/day-07/plan.md` rather than silently folded into Day 9's own work.

**A concurrency claim I accepted turned out to be wrong, and the evidence corrected it, not my assumption about the code.** For the cascade delete (removing a comment and every reply beneath it in one operation), I had it run six simultaneous delete requests against the same comment four times in a row, all landing on "exactly one request succeeds, the other five get 404" — and I accepted that as the guarantee. During a later, unrelated check it failed once. Rather than dismiss that as a flake, I had it measure the real behavior directly: forcing the same six-way race together twenty-five times showed that MongoDB's `updateMany` is atomic per document, not across the whole call, so two overlapping deletes can each flip *part* of the same subtree — eighteen clean single winners and seven split outcomes out of twenty-five. What never broke was the actual guarantee that matters: every row is flipped exactly once, so the counter always ends up exactly right. I had the original test rewritten to assert that real guarantee instead of the false stronger one, and the incorrect claim removed from the plan before it could pass as tested.

**Two library-level gotchas were caught by actually running the code, not by reading it.** Mongoose 9 throws on a pipeline-style update unless `updatePipeline: true` is set explicitly — the counter's clamp logic failed the first time it ran for real, not in review. Separately, `findOneAndUpdate`'s `new: true` option is deprecated in favor of `returnDocument: 'after'`; I only noticed because the deprecation warning showed up in a real test run's output, and had it changed everywhere the pattern was used.

**Adding comment editing exposed test debt from earlier in the same day, and it got fixed rather than left inconsistent.** Comments originally had no `updatedAt` at all, by design, since nothing could edit them. Once editing was added and that changed, three existing tests from earlier in the day still asserted the *old* behavior (that no `updatedAt` existed, or that a specific field list excluded it) — assertions that were correct when written and wrong the moment the schema changed under them. I had these found and corrected as part of the same change that introduced editing, rather than left as silently-stale coverage that happened to keep passing for the wrong reason.

## Where this leaves me

Nothing here shipped because it "looked right" on the first pass. Every
non-trivial change went through a plan I read, execution I watched in
checkpoints, and a test pass I asked for explicitly — and more than once
that process is what surfaced a wrong assumption or a real bug before it
became a problem. I'd rather this file show that back-and-forth plainly
than imply the whole thing worked perfectly the first time, because it
didn't, and I don't think it needs to have.
