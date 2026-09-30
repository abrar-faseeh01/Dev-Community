// Mirrors backend/src/posts/dto/search-posts.dto.ts: the longest search term
// the API accepts, and the most results it returns in one response. Anything
// longer is rejected with a 400, so the UI clamps to these before sending.
export const SEARCH_MAX_QUERY_LENGTH = 100;
export const SEARCH_MAX_LIMIT = 20;
