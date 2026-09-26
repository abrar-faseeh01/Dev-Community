import { authKeys } from "@/features/auth/queries/auth-queries";
import type { AuthUser } from "@/features/auth/types/user";
import type { QueryClient } from "@tanstack/react-query";

// The signed-in user's id right now, read straight from the query cache
// rather than a hook — this runs inside mutation callbacks, not a
// component. undefined (query never ran) and null (nobody signed in) both
// mean "no current user".
export function currentUserId(queryClient: QueryClient): string | null {
  const user = queryClient.getQueryData<AuthUser | null>(authKeys.me);
  return user?.id ?? null;
}

// True only when `userId` (the user a mutation started under, captured in
// onMutate) is still the signed-in user now. False for a null userId
// (never captured, or nobody was signed in then) and false once the session
// has since changed — see auth-mutations.ts's useChangeSession — so a
// mutation that outlives a login/logout switch can't write its result into
// the new session's cache. Decision 7 from the plan.
export function isSameSession(
  queryClient: QueryClient,
  userId: string | null,
): boolean {
  return userId !== null && userId === currentUserId(queryClient);
}
