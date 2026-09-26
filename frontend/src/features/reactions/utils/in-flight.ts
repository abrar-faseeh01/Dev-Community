import type { QueryClient } from "@tanstack/react-query";
import { reactionMutationKeys } from "../mutations/reaction-mutation-keys";

// Whether a reaction request for this exact target is already out. Read from
// the mutation cache, which changes the moment mutate() is called, rather than
// from a mutation's `isPending`: that only reaches a component after React has
// re-rendered, so a second click landing before then would slip through. The
// disabled buttons are the visible half of the lock; this is the half that
// cannot be raced.
export function isReactionInFlight(
  queryClient: QueryClient,
  type: "post" | "comment",
  id: string,
): boolean {
  return (
    queryClient.isMutating({
      mutationKey: reactionMutationKeys.target(type, id),
    }) > 0
  );
}
