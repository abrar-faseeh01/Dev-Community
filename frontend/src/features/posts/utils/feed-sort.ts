// The feed's sort options. POST_SORTS mirrors the backend's list-posts.dto.ts
// array (same values, same name), so a value that passes isPostSort is one
// GET /posts accepts. The array is the source of truth: the type, the
// validator and the labels below all derive from it or are checked against it.
export const POST_SORTS = ["latest", "top", "discussed"] as const;
export type PostSort = (typeof POST_SORTS)[number];

// Bare /posts (no ?sort=) is the latest feed.
export const DEFAULT_POST_SORT: PostSort = "latest";

// Typed as a Record so adding a sort to POST_SORTS without a label is a
// compile error.
export const FEED_SORT_LABELS: Record<PostSort, string> = {
  latest: "Latest",
  top: "Top",
  discussed: "Most Discussed",
};

// The order the tabs are shown in (Top, Latest, Most Discussed). Deliberately
// separate from POST_SORTS, whose order is the backend's and has no meaning
// for the UI.
export const FEED_SORT_ORDER: readonly PostSort[] = [
  "top",
  "latest",
  "discussed",
];

// Exact, case-sensitive match against the list — `includes` on an array, not
// an object lookup, so "constructor" or "__proto__" can never pass.
export function isPostSort(
  value: string | null | undefined,
): value is PostSort {
  return value != null && (POST_SORTS as readonly string[]).includes(value);
}

// Anything that isn't a known sort — missing, empty, unknown, wrong case —
// falls back to the default rather than erroring. The caller does not rewrite
// the URL; the feed just renders the default.
export function parsePostSort(value: string | null | undefined): PostSort {
  return isPostSort(value) ? value : DEFAULT_POST_SORT;
}
// The URL for a sort tab: the current pathname and search params with only
// `sort` changed. Other params (e.g. ?notice=) are kept. The default sort is
// the bare pathname, so /posts stays the canonical URL for Latest.
export function feedSortHref(
  pathname: string,
  params: { toString(): string },
  sort: PostSort,
): string {
  const next = new URLSearchParams(params.toString());
  if (sort === DEFAULT_POST_SORT) next.delete("sort");
  else next.set("sort", sort);
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}
