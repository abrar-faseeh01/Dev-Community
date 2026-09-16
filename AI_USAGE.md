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

## What I reviewed, caught, and corrected

This is the part I want to be specific and honest about, because a
write-up that implies everything went smoothly on the first try isn't
useful evidence of anything.

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

## Where this leaves me

Nothing here shipped because it "looked right" on the first pass. Every
non-trivial change went through a plan I read, execution I watched in
checkpoints, and a test pass I asked for explicitly — and more than once
that process is what surfaced a wrong assumption or a real bug before it
became a problem. I'd rather this file show that back-and-forth plainly
than imply the whole thing worked perfectly the first time, because it
didn't, and I don't think it needs to have.
