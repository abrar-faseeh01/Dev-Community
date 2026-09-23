"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import {
  COMMENT_COMPOSER_CONTAINER_ID,
  COMMENTS_HEADING_ID,
} from "@/features/comments/utils/comment-focus";
import { canComment } from "@/features/comments/utils/permissions";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

type CommentFocusHandlerProps = {
  // Whether the post (and so CommentList, and the composer inside it, if
  // any) has finished its first successful render. The redirect-to-login
  // branch doesn't need this — an unauthenticated visitor is sent away
  // regardless of whether the post has loaded — but the two branches that
  // touch the page's own DOM do.
  postLoaded: boolean;
};

// Handles ?comment=1, set by CommentFeedLink on a post's feed card:
//   - logged out (or a stale cookie that turns out to be expired) -> off to
//     /login, same as useRequireAuth's own redirect. No comment box exists
//     for them to be taken to, so there's nothing to wait for or scroll to.
//   - a `user`-role viewer -> scrolls to and focuses the composer's textarea
//     once the post has loaded.
//   - an admin -> scrolls to the comments heading instead. There is no
//     composer for them (canComment is role-based, not just "logged in") —
//     "taking them to the comment section" means the section, not a box
//     that isn't there.
// useSearchParams needs a Suspense boundary for `next build`, the same
// reason feed-notice.tsx is its own component — see post-page-view.tsx.
export function CommentFocusHandler({ postLoaded }: CommentFocusHandlerProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  const wantsCommentFocus = searchParams.get("comment") === "1";

  useEffect(() => {
    if (!wantsCommentFocus || loading) return;

    if (user === null) {
      router.replace(ROUTES.LOGIN);
      return;
    }

    if (!postLoaded) return;

    const targetId = canComment(user)
      ? COMMENT_COMPOSER_CONTAINER_ID
      : COMMENTS_HEADING_ID;
    const container = document.getElementById(targetId);
    container?.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusTarget = canComment(user)
      ? container?.querySelector<HTMLTextAreaElement>("textarea")
      : container;
    focusTarget?.focus();

    // Strip the param so a refresh, a copied link, or Back doesn't redo
    // this — the same convention feed-notice.tsx uses for ?notice=.
    const next = new URLSearchParams(searchParams.toString());
    next.delete("comment");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [wantsCommentFocus, loading, user, postLoaded, searchParams, pathname, router]);

  return null;
}
