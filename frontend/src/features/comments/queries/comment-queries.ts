import type { ReactorTab } from "@/features/reactions/types/reactor";
import { getComments } from "@/services/api/comments";
import { getCommentReactors } from "@/services/api/reactions";
import { useQuery } from "@tanstack/react-query";

// One factory for every comments cache key, so a mutation can target exactly
// the entry it affects. There is no pagination, so there is no cursor
// variant the way postKeys.feed() has — one post has exactly one comments
// query.
export const commentKeys = {
  all: ["comments"] as const,
  list: (postId: string) => [...commentKeys.all, "list", postId] as const,
  // The "who reacted" list of one comment, one entry per tab.
  reactors: (commentId: string, tab: ReactorTab) =>
    [...commentKeys.all, "reactors", commentId, tab] as const,
};

// The public GET posts/:postId/comments — no login needed to read the
// discussion under a public post.
export function useComments(postId: string) {
  return useQuery({
    queryKey: commentKeys.list(postId),
    queryFn: () => getComments(postId),
  });
}

// Who reacted to a comment, for the overlay. Same rules as usePostReactors:
// fetched only while `enabled` (the overlay is open), and always refreshed on
// open. Its own hook — comments must not import from the posts feature.
export function useCommentReactors(
  commentId: string,
  tab: ReactorTab,
  enabled: boolean,
) {
  return useQuery({
    queryKey: commentKeys.reactors(commentId, tab),
    queryFn: () =>
      getCommentReactors(commentId, tab === "all" ? undefined : tab),
    enabled,
    staleTime: 0,
  });
}
