import { SEARCH_MAX_QUERY_LENGTH } from "@/features/posts/utils/search-limits";

// The one form a search term takes once it leaves the input: whitespace runs
// collapsed to a single space, trimmed, lowercased (the search is
// case-insensitive, so "React" and "react" are the same search and share a
// cache entry), and cut to the longest term the API accepts. Empty means
// "nothing to search for".
export function normalizeSearchTerm(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, SEARCH_MAX_QUERY_LENGTH)
    .trimEnd();
}
