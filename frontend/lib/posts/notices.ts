// One-off messages the feed can show after a redirect, keyed by the value of
// its `?notice=` search param. Only keys listed here are ever rendered, so a
// crafted link can't put arbitrary text on the page.
export const FEED_NOTICES = {
  "admin-cannot-post":
    "Administrator accounts can't create posts. You can still edit or delete any member's post from the feed.",
  "post-deleted": "The post was deleted.",
  "post-gone":
    "That post no longer exists — it was probably deleted already, so it has been removed from the list.",
} as const;

export type FeedNoticeKey = keyof typeof FEED_NOTICES;

export const feedNoticeUrl = (key: FeedNoticeKey) => `/posts?notice=${key}`;

export const ADMIN_CANNOT_POST_URL = feedNoticeUrl("admin-cannot-post");

export function isFeedNoticeKey(value: string | null): value is FeedNoticeKey {
  return value !== null && Object.hasOwn(FEED_NOTICES, value);
}
