import type {
  DeletedPost,
  Post,
  PostPage,
  PostSearchPage,
  PostSummary,
} from "@/features/posts/types/post";
import type { PostSort } from "@/features/posts/utils/feed-sort";
import { SEARCH_MAX_LIMIT } from "@/features/posts/utils/search-limits";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export const POSTS_PAGE_SIZE = 10;

export type PostPageParams = {
  cursor?: string;
  authorId?: string;
  sort?: PostSort;
};

// The query string is built here with URLSearchParams, which encodes the
// cursor — it's base64, so it may contain characters that are special in a
// URL. `sort` is sent whenever the caller gives one, including "latest", so
// the request always matches the cache key it is stored under. The cursor
// belongs to the sort that produced it: the API rejects a cursor replayed
// against another sort with a 400, which the per-sort query keys prevent.
export async function getPostPage({
  cursor,
  authorId,
  sort,
}: PostPageParams = {}): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(POSTS_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  if (authorId) params.set("authorId", authorId);
  if (sort) params.set("sort", sort);
  const res = await apiClient.get<ApiSuccess<PostPage>>(`/posts?${params}`);
  return res.data.data;
}

export async function getPost(id: string): Promise<Post> {
  const res = await apiClient.get<ApiSuccess<Post>>(
    `/posts/${encodeURIComponent(id)}`,
  );
  return res.data.data;
}

// POST /posts. Only title and body are sent — the DTO is whitelisted and
// rejects anything else.
export async function createPost(input: {
  title: string;
  body: string;
}): Promise<Post> {
  const res = await apiClient.post<ApiSuccess<Post>>("/posts", {
    title: input.title,
    body: input.body,
  });
  return res.data.data;
}

// PATCH /posts/:id — a partial update. Only what's passed is sent, so the
// caller decides which of title/body actually changed. `reason` is only ever
// set by an admin editing someone else's post.
export async function updatePost(
  id: string,
  changes: { title?: string; body?: string; reason?: string },
): Promise<Post> {
  const res = await apiClient.patch<ApiSuccess<Post>>(
    `/posts/${encodeURIComponent(id)}`,
    changes,
  );
  return res.data.data;
}

// DELETE /posts/:id (a soft delete). With no reason there is no body at all.
export async function deletePost(
  id: string,
  reason?: string,
): Promise<DeletedPost> {
  const res = await apiClient.delete<ApiSuccess<DeletedPost>>(
    `/posts/${encodeURIComponent(id)}`,
    { data: reason ? { reason } : undefined },
  );
  return res.data.data;
}
// GET /posts/search. `q` is sent as given — the caller normalizes it — and
// URLSearchParams encodes it. `limit` defaults to the backend's maximum: there
// is no "load more", so one request should return as many matches as the API
// allows. `signal` is handed to axios so that TanStack Query can cancel the
// request when its query is no longer wanted.
export async function searchPosts({
  q,
  limit = SEARCH_MAX_LIMIT,
  signal,
}: {
  q: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<PostSearchPage> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  const res = await apiClient.get<ApiSuccess<PostSearchPage>>(
    `/posts/search?${params}`,
    { signal },
  );
  return res.data.data;
}

// The backend gives its summarizer at most 15 s (SUMMARIZER_TIMEOUT_MS is
// capped there). This is longer than that, so a slow summarizer is reported
// by the server as a 504 first; it only fires when the server itself is hung,
// so the page can't sit on "Summarizing…" forever. axios reports it as an
// error with no status, the same as being offline.
export const SUMMARIZE_TIMEOUT_MS = 20_000;

// POST /posts/:id/summarize. No body: the server reads the post itself and
// only ever sends its title and body to the summarizer.
export async function summarizePost(id: string): Promise<PostSummary> {
  const res = await apiClient.post<ApiSuccess<PostSummary>>(
    `/posts/${encodeURIComponent(id)}/summarize`,
    undefined,
    { timeout: SUMMARIZE_TIMEOUT_MS },
  );
  return res.data.data;
}
