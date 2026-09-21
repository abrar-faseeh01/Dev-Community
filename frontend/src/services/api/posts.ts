import type {
  DeletedPost,
  Post,
  PostPage,
} from "@/features/posts/types/post";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export const POSTS_PAGE_SIZE = 10;

// The query string is built here with URLSearchParams, which encodes the
// cursor — it's base64, so it may contain characters that are special in a
// URL.
export async function getPostPage(
  cursor?: string,
  authorId?: string,
): Promise<PostPage> {
  const params = new URLSearchParams({ limit: String(POSTS_PAGE_SIZE) });
  if (cursor) params.set("cursor", cursor);
  if (authorId) params.set("authorId", authorId);
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
