import { getComments } from "@/services/api/comments";
import { useQuery } from "@tanstack/react-query";

// One factory for every comments cache key, so a mutation can target exactly
// the entry it affects. There is no pagination, so there is no cursor
// variant the way postKeys.feed() has — one post has exactly one comments
// query.
export const commentKeys = {
  all: ["comments"] as const,
  list: (postId: string) => [...commentKeys.all, "list", postId] as const,
};

// The public GET posts/:postId/comments — no login needed to read the
// discussion under a public post.
export function useComments(postId: string) {
  return useQuery({
    queryKey: commentKeys.list(postId),
    queryFn: () => getComments(postId),
  });
}
