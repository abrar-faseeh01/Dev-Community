import { ROUTES } from "@/constants/routes";

// A one-time "take me to the comment box" navigation from a post's feed
// card, mirroring features/posts/utils/notices.ts's feedNoticeUrl: a query
// param read once by the destination page, then stripped from the URL.
export const commentFocusUrl = (postId: string) => `${ROUTES.post(postId)}?comment=1`;

// Stable DOM ids comment-list.tsx and comment-focus-handler.tsx both need to
// agree on — the handler locates these after the post (and so CommentList)
// has mounted. COMMENTS_HEADING_ID is also the fallback target CP7's delete
// flow uses when a comment's own focus target is gone.
export const COMMENTS_HEADING_ID = "comments-heading";
export const COMMENT_COMPOSER_CONTAINER_ID = "comment-composer";
