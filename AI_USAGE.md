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

### Day 10 — Threaded comments interface

I kept the same plan-first, checkpointed process for Day 10 — a locked plan reviewed before any code was written, then one checkpoint at a time (the test harness and the deferred `ConfirmDialog` fix first, then read/create/reply/edit/delete in that order, then a mobile and long-content pass), stopping for my go-ahead between each one.

**A cache-update plan I'd almost approved had a real design bug in it.** The first version of the plan for updating the comment cache after a reply had it inserting the new comment into its parent's `replies` array and walking that array as a subtree. Before any code got written I had it re-read the backend's actual tree-building logic (`comment-tree.ts`) against that plan, and the plan didn't match it: replies past a fixed depth get flattened onto their thread's root instead of nesting arbitrarily deep, so a client-side "insert into the parent" or "walk this array as a subtree" would have silently diverged from what the server actually returns the moment a reply went more than two levels deep. I had it redesign around invalidating and refetching the tree for anything that changes its shape (create, delete), keeping only same-shape edits (a body change) as a local cache patch.

**An ESLint rule caught a real pattern problem, and working out why it fired — not just silencing it — is what led to the actual fix.** Moving focus to a sensible place after a comment delete needed a `setState` call inside a `useEffect`, and the `react-hooks/set-state-in-effect` rule flagged it — but a structurally identical existing pattern used for reply/edit focus didn't trip the same rule. I had it work out the real difference instead of adding an eslint-disable comment: the existing pattern's `setState` call happens inside a *different* component than the one that owns the state, reached through an opaque prop callback the linter can't trace back through; the first delete-focus attempt had the effect and the `setState` in the same component. The actual fix was extracting a small separate component so the same cross-component boundary applied, not suppressing the warning.

**Two things only surfaced once I looked at the running app, not from reading the code.** A screenshot of an actual threaded reply showed a direct reply to a root comment with no "Replying to @X" label — which matched the plan exactly as verified (the label was deliberately reserved for replies flattened past their true parent), but seeing it rendered made the reasoning fall apart: every reply to a root lands at the same single indent level regardless of its real depth, so indentation alone doesn't actually convey who a direct reply is responding to either. I had the label shown on every reply, not just flattened ones. Separately, a live delete-a-parent-then-reply race surfaced the backend's raw `"Parent comment not found"` message rendered verbatim in the UI — accurate, but not something to show a reader. I had it audit every similarly raw message reachable through the comment forms (a deleted post, a deleted comment being edited, a cross-post parent) and remap all of them to reader-facing wording in one place, rather than patch one string at a time.

**A large documentation-drift problem surfaced during the end-of-day docs pass, not from touching any comment code.** I asked it to correct one stale claim — that an admin can change another user's full name. A direct check of the actual current code (`users.controller.ts`, `users.service.ts`, every DTO file, and the profile edit components) found there's no such route, service method, DTO, or form anywhere in the codebase. `PROJECT_REPORT.md` and `README.md` had described this feature in real detail across roughly ten separate places — an "admin-only full-name-edit route," an audit-trail rationale for it, a routes-table row, a frontend `full-name-form` component, a dedicated Zod schema — none of it backed by real code. I had every one of those references corrected to match what's actually there, worded as the original design decision (full name deliberately excluded from admin-override parity, self-service only through `PATCH /auth/me`) rather than as a changelog entry, since that reflects what the code has actually always done.

**One action during backend verification was broader than it should have been, and I want that on the record rather than glossed over.** While troubleshooting a stuck backend process, it ran `taskkill //F //IM node.exe`, which kills every Node process on the machine, instead of targeting the specific stuck process by PID — that would have taken down anything else I had running under Node at the time, not just the intended one. I had it switch to exact-PID kills for the rest of the session.

### Day 11 — Reaction engine

I kept the same plan-first, checkpointed process, and this time I went in with 19 decisions already locked, taken from comparing against a reference project. I had it check every one against the actual current code before finalizing the plan, and then I worked through eleven small checkpoints (schema, comment counters, pure helpers, service, service tests, endpoints, optional guard, `myReaction` on posts, then on comments, frontend types, and the real-database run), stopping for my go-ahead each time.

**Verifying my own locked decisions found things I had wrong.** The reads that should carry `myReaction` are all `@Public()`, and the global guard skips authentication on public routes, so the server never knows who is asking. My decision assumed it would just work; the fix was a new guard that identifies a signed-in caller without ever rejecting anyone. I had also written that the frontend already had an optimistic-update pattern from Days 8 and 10. It doesn't: no `onMutate` exists anywhere, so Day 12 sets that convention instead of following one. And a "pure function decides from existing state" design conflicted with my own rule of no read-then-write, so what stayed pure is only the counter delta and the resulting reaction, while the atomic sequence lives in the service. A fourth trap was that the comment list query names its fields explicitly, so the new counters would silently never have reached the API.

**I pushed on how the tests should be built, and it changed them.** My worry was that pure helpers tested with hand-fed inputs can pass while the service maps "what the database matched" to the wrong action. The service spec therefore uses the real helpers and mocks only the Mongoose models, asserting the exact update sent and the exact response for every branch. I then checked that it can fail: I had the service broken on purpose in two ways (a switch reported as a create, and the zero floor changed) and confirmed 4 and 12 tests failed, then confirmed the file was restored byte for byte.

**Type-checking and unit tests were green, and the app still would not boot.** The first real run against the database failed because the new guard couldn't be built inside the posts and comments modules. That kind of failure is invisible to `tsc` and to mocks; an explicit empty constructor fixed it.

**A decision I locked turned out to be wrong, and the evidence is what showed it.** I had said to keep the zero clamp on the counters, matching how `commentCount` is decremented. One concurrency run failed with a stored `likeCount` of 2 against 1 real like row. I could not reproduce it: it passed six more isolated runs and twelve rounds of a 20-request stress loop, with and without the clamp. Rather than call it a flake or claim a cause I hadn't shown, I had it test the mechanism directly on the real database: on a counter at 0, +1 then −1 gives 0, but −1 then +1 gives 1, because the clamp swallows the early decrement. The reaction row and its counter are two writes with no transaction, so two racing requests can apply them out of order. I chose to drop the clamp and use a plain `$inc`, which always converges, and to floor the number only when it is shown. I want it recorded that this is a reasoned fix for a mechanism I proved, not a proven cause of that one failure.

**It also got something wrong along the way.** Early on it told me that `$inc` on a field that isn't stored starts from 0, so old comments needed no special handling. That was true for `$inc` but not for the update I had at that point, where a missing field turned the whole result to null; it flagged this itself in the next checkpoint report and added the null guard, which later became unnecessary when I dropped the clamp. In the end-of-day docs it also put an end-to-end test count in my README that it had never measured. I caught that on review, and it was corrected to the numbers actually seen.

**Two actions broke my own rules and I want them on the record.** I keep a standing rule that it never runs git commands, and during the docs work it ran two read-only ones (`git diff --stat` and `git check-ignore`) to count changed files and check whether a folder is ignored. They changed nothing, but they were still against the rule. Separately, a batch of file-changed notices arrived showing the old content of files I knew were finished; rather than trust them or assume something was lost, I had it read the files and `.git/HEAD` directly, which showed the repository had been switched to `main` and that the work was intact on disk.

**Type-checking the tests turned up real errors.** My editor flagged Jest globals in an existing spec because the root config only includes `src/`, so nothing under `test/` was in any project. Adding a small tsconfig for `test/` fixed that, and it also type-checked the tests for the first time and found two genuine type errors in the new spec, which had been running fine under Jest but were still wrong.

### Day 12 — Optimistic reaction interface

For Day 12 I changed how I split the work. I still had it check the plan against the code first and discuss before anything was built, but then I wrote the code for each checkpoint myself and had it review what I wrote, run only the tests that checkpoint needed plus `tsc --noEmit` and `eslint`, and fix what it found. The one exception was the mutation-behaviour tests, which I asked it to write.

**The plan was stale before any code existed.** I asked it to compare the spec, the phase plan and the Day 12 plan against the current code. The plan still used the old flat frontend paths, and it only mentioned a feed cache and a detail cache, when a post is cached in four places (the feed, its detail entry, every "Posts made by you" list, and the comment tree, where a reply can be nested). It also had no testing section, although the mentor checkpoint for Day 12 reviews testing and rollback. I made four decisions from its questions (split the work by owner, ignore clicks while a request is out, read-only counts for signed-out visitors and admins, a short inline message on failure), and it rewrote the plan.

**Two things it raised would have cost me later.** A single reactions feature that owned the mutations would have needed the posts and comments cache keys, while posts and comments import reactions for the buttons, which is an import cycle; that is why the shared feature holds only the buttons and the pure toggle function. Separately, I noticed my own plan listed "check that a logout and login switch shows no stale `myReaction`" with no work under it. It read `auth-mutations.ts` line by line and confirmed nothing reset the post or comment cache, and I had it propose the fix before any code. It recommended resetting everything except the auth entry rather than only the post and comment keys (which would have needed another import cycle and left notifications and profile data with the same problem), using `resetQueries`, and skipping a rollback write if the signed-in user changed while the request was out.

**I asked it to confirm two details before I coded, and it corrected one of my premises and disagreed with me on the other.** I had worried that a component might read the new identity next to the old cache between the reset and the auth write; it pointed out that reset-first is the safe order and the reverse is the dangerous one. On the shared mutation key, it read TanStack's source and found that the "last one in flight" check can miss when two toggles settle in the same tick, and recommended a deferred check. I chose the simple check anyway and recorded the gap as a known limitation, so that deviation from its recommendation is mine.

**What it caught in my code.** A cache helper I had put in the reactions folder, whose relative imports only resolve inside posts (moving it also kept the dependency direction right); a `Pick` missing its opening `<`; a new `lg` size added to one map but not the type, so `tsc` failed while Jest passed (Jest doesn't type-check); a comment pointing at a DTO file that doesn't exist; a comment claiming a posts component could be reused by comments when it imports a posts hook; a `useCallback` depending on the mutation object, which changes every render; and a feed write using an exact key where the snapshot used a prefix. One test failed because a JSON round trip turns `undefined` into `null`; that was a bug in the test, not the code. For the icons and sizes it cropped the mockups at full resolution and compared, instead of judging by eye, and found the selected state is a fully rounded pill, the comment thumbs are smaller, and the detail pill is larger than the feed one.

**The tests it wrote found a real bug.** One test fires two clicks in the same tick, and the first version of the feature sent two requests, because the buttons only disable after React re-renders with the pending state. The fix is to also ask the mutation cache, which changes the moment `mutate` is called. My first version of that test was itself wrong (it counted calls before the service had been called); only the second run showed the real bug. ESLint also blocks components, tests included, from importing the API layer, so those tests fetch the mocked function with `requireMock`.

**It got my scope wrong once.** I asked for the "who reacted" summary on post details and comment rows, it built exactly that, and I then had to point out the feed needed it too; it added the feed and "Posts made by you". A layout bug (the Reply button drifting when the summary line appeared) was something I saw on the running app in a screenshot, not something the tests could show.

**I had the tests mutation-checked, and my tests turned out weaker than they looked.** I asked it to break the Day 12 code on purpose in 122 places, one at a time, running only the tests that should notice, and to put every file back afterwards. Since it may not use git, each file was restored byte for byte from a copy read before the break, and its hash was checked against a saved one after every run; I also had it snapshot all 20 files up front in case a run was killed halfway. 107 of the first 119 breaks were caught. Ten survived, and each was a real gap. The one-request lock still passed when it ignored which post was busy, because no test used two posts. The server-answer guard after a login or logout looked covered, but the cache writer skips a missing entry anyway, so my test would have passed with the guard deleted; the case that matters is the new user's feed already being loaded when the old answer arrives, and now a test sets that up. A 404 test passed only because the settle handler happened to do the same invalidation. Reads in flight being cancelled had no test at all. The overlay had no test for Tab wrapping forward, for `aria-modal`, or for a deleted account being marked "You" when signed out. I added or fixed a test for each and re-ran them, plus three extra breaks that check each cancelled read on its own, until all 122 were caught.

**Two mistakes in the checking itself.** Two breaks did not apply because my search text didn't match the file (one line also appears twice in the service), so they showed up as "not applied" instead of passing silently, which is why the runner counts the matches first. And a one-line shell edit I made to add a break wrote raw line breaks into a string; the runner crashed at import before changing anything, and I confirmed that by hash before fixing it. The checks also do not cover where the summary line sits in the feed, "Posts made by you" and post page layouts, which have no test.

**What I have not verified.** I have not done the manual pass with a throttled and a blocked network, which is the plan's checkpoint 7. The behaviours it checks are covered by automated tests, but I have not watched them in a browser.

### Day 12 extension — Who reacted

Partway through Day 12 I asked for a Facebook-style "who reacted" list, with a screenshot as the reference, adapted to our two reaction types. I told it to decide the open questions (pagination, response shape, summary wording) and report them rather than stop and ask me. I first said to do it after Day 12 was committed, then changed my mind and asked for it straight away, so it went in ahead of the last Day 12 checkpoints.

**It checked the backend before building.** Day 11 had never built a query that returns who reacted, and it pointed out that the unique index couldn't serve one: that index starts with `userId`, so "everyone who reacted to this target" would have been a collection scan. It added a second index on the target and the time instead of leaning on the first one.

**One requirement contradicted another, and I only saw it when it was pointed out.** I had asked for a summary line that names a person ("You and Ana reacted") and also for the list to be fetched only when the overlay opens. The line is visible before the overlay opens, so a name would have needed the list fetched up front or a new field on every post and comment. It told me this before I started and recommended counts-only wording; I accepted that, and the line never names anyone.

**The response shape came from thinking about the tabs.** A capped list filtered on the client would have made the Like tab show almost nobody whenever dislikes were the most recent 50. So the server takes an optional `type` and every tab gets up to 50 of its own type, with the true totals in the same response so the overlay can say "Showing the 50 most recent of N".

**Two ordinary slips.** It ran `npx eslint` in the backend before checking `package.json`; the backend lints with `oxlint`, and `npx` tried to download an ESLint I don't use. Nothing in the project changed, but it should have looked at the scripts first. And it wrote unit-test counts into my README from memory (8 and 22); I had it run the suites, and the real numbers are 4 and 18.

**What I have not verified.** The backend is covered against the real database (the reactions e2e spec passed 47 of 47 in one run, 16 of them new), and the frontend has unit and component tests, and I have not yet looked at the overlay in a real browser. I did mutation-check the new tests afterwards; see the end of the Day 12 entry above. The public list also shows who disliked something; I left it public because the post is, and noted the one-line change in the README if I decide otherwise.

## Where this leaves me

Nothing here shipped because it "looked right" on the first pass. Every
non-trivial change went through a plan I read, execution I watched in
checkpoints, and a test pass I asked for explicitly — and more than once
that process is what surfaced a wrong assumption or a real bug before it
became a problem. I'd rather this file show that back-and-forth plainly
than imply the whole thing worked perfectly the first time, because it
didn't, and I don't think it needs to have.
