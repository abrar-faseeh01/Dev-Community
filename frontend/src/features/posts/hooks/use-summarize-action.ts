import { useAuth } from "@/features/auth/hooks/use-auth";
import { useSummarizePost } from "@/features/posts/mutations/post-mutations";
import type { PostSummary } from "@/features/posts/types/post";
import {
  describeSummarizeError,
  type SummarizeFailure,
} from "@/features/posts/utils/summarize-errors";
import { useRef, useState } from "react";

export type SummarizeAction = {
  // The button's text for the current state.
  label: string;
  // Busy, still loading who is signed in, or a failure that asking again
  // can't fix. Shown as aria-disabled, never `disabled`: focus stays put.
  locked: boolean;
  onClick: () => void;
  isPending: boolean;
  result: PostSummary | null;
  failure: SummarizeFailure | null;
  showSignInHint: boolean;
  // The summary panel only exists once the reader has asked for something.
  panelVisible: boolean;
  // Plain text for the screen-reader live region.
  announcement: string;
};

// All the state behind the Summarize button and the summary panel, which sit
// in different parts of the post page, so one owner has to hand it to both.
// Call it from a component keyed by post id (see SummarizeLayout): the result
// lives in the mutation's own state, so a new key is what keeps a summary from
// carrying over from one post to the next.
export function useSummarizeAction(postId: string): SummarizeAction {
  const { user, loading } = useAuth();
  const mutation = useSummarizePost(postId);
  const [signInHintShown, setSignInHintShown] = useState(false);

  // A second click can arrive before `isPending` has reached the DOM, so the
  // guard is a ref, set synchronously and released when the request settles.
  const inFlight = useRef(false);

  const result = mutation.isSuccess ? mutation.data : null;
  const failure = mutation.isError
    ? describeSummarizeError(mutation.error)
    : null;
  const signedOut = !loading && !user;
  const showSignInHint = signedOut && signInHintShown;
  // A failure that asking again can't fix (post too short or gone).
  const blocked = failure !== null && !failure.retryable;
  // Signed-out stays clickable: the click is what shows the sign-in hint.
  const locked = mutation.isPending || loading || blocked;

  function onClick() {
    if (signedOut) {
      setSignInHintShown(true);
      return;
    }
    if (locked || inFlight.current) return;
    inFlight.current = true;
    mutation.mutate(undefined, {
      onSettled: () => {
        inFlight.current = false;
      },
    });
  }

  const label = mutation.isPending
    ? "Summarizing…"
    : result
      ? "Summarize again"
      : failure && failure.retryable
        ? "Try again"
        : "Summarize";

  const announcement = showSignInHint
    ? "Sign in to summarize this post."
    : mutation.isPending
      ? "Summarizing…"
      : failure
        ? failure.message
        : result
          ? "Summary ready."
          : "";

  return {
    label,
    locked,
    onClick,
    isPending: mutation.isPending,
    result,
    failure,
    showSignInHint,
    panelVisible:
      mutation.isPending || result !== null || failure !== null || showSignInHint,
    announcement,
  };
}
