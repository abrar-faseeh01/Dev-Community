import { apiFetch } from "../api-client";
import type { DeletedPost, Post, PostPage } from "../types/post";

export const FEED_PAGE_SIZE = 10;

// One factory for every posts cache key, so a mutation can target exactly
// the entries it affects. Everything nests under ["posts"], so
// invalidating postKeys.all would hit both feed and detail. Day 14 adds a
// filter argument to feed().
export const postKeys = {
  all: ["posts"] as const,
  feed: () => [...postKeys.all, "feed"] as const,
  detail: (id: string) => [...postKeys.all, "detail", id] as const,
  // One author's posts ("Posts made by you"). mineAll is the prefix for every
  // author, so a mutation can update or invalidate all of them at once.
  mineAll: () => [...postKeys.all, "mine"] as const,
  mine: (authorId: string) => [...postKeys.mineAll(), authorId] as const,
};

// apiFetch has no query-param support, so the string is built here.
// URLSearchParams encodes the cursor — it's base64, so it may contain
// characters that are special in a URL.
export async function fetchPostPage(
  cursor?: string,
  authorId?: string,
): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(FEED_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  if (authorId) params.set("authorId", authorId);
  return (await apiFetch<PostPage>(`/posts?${params}`)).data;
}

export async function fetchPost(id: string): Promise<Post> {
  return (await apiFetch<Post>(`/posts/${encodeURIComponent(id)}`)).data;
}

// PATCH /posts/:id — a partial update. Only what's passed is sent, so the
// caller decides which of title/body actually changed. `reason` is only ever
// set by an admin editing someone else's post.
export async function updatePost(
  id: string,
  changes: { title?: string; body?: string; reason?: string },
): Promise<Post> {
  return (
    await apiFetch<Post>(`/posts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(changes),
    })
  ).data;
}

// DELETE /posts/:id (a soft delete). With no reason there is no body at all.
export async function deletePost(
  id: string,
  reason?: string,
): Promise<DeletedPost> {
  return (
    await apiFetch<DeletedPost>(`/posts/${encodeURIComponent(id)}`, {
      method: "DELETE",
      body: reason ? JSON.stringify({ reason }) : undefined,
    })
  ).data;
}

// POST /posts. Only title and body are sent — the DTO is whitelisted and
// rejects anything else.
export async function createPost(input: {
  title: string;
  body: string;
}): Promise<Post> {
  return (
    await apiFetch<Post>("/posts", {
      method: "POST",
      body: JSON.stringify({ title: input.title, body: input.body }),
    })
  ).data;
}
