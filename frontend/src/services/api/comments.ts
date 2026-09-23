import type {
  CommentTree,
  CreatedComment,
  DeletedComment,
  EditedComment,
} from "@/features/comments/types/comment";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

// GET posts/:postId/comments — public, no login needed. The whole tree comes
// back in one response; there is no pagination (see the backend's Day 9
// plan: "Returning the whole tree is the simplest correct behaviour for a
// day about hierarchy and counters").
export async function getComments(postId: string): Promise<CommentTree> {
  const res = await apiClient.get<ApiSuccess<CommentTree>>(
    `/posts/${encodeURIComponent(postId)}/comments`,
  );
  return res.data.data;
}

// POST posts/:postId/comments. Creates a top-level comment when
// parentCommentId is omitted, a reply otherwise — there is no separate reply
// endpoint.
export async function createComment(
  postId: string,
  input: { body: string; parentCommentId?: string },
): Promise<CreatedComment> {
  const res = await apiClient.post<ApiSuccess<CreatedComment>>(
    `/posts/${encodeURIComponent(postId)}/comments`,
    input,
  );
  return res.data.data;
}

// PATCH comments/:id. Author only — see comment-permissions.ts on the
// backend. Only ever changes body/updatedAt, never replies or parentage.
export async function updateComment(
  id: string,
  body: string,
): Promise<EditedComment> {
  const res = await apiClient.patch<ApiSuccess<EditedComment>>(
    `/comments/${encodeURIComponent(id)}`,
    { body },
  );
  return res.data.data;
}

// DELETE comments/:id (a cascading soft delete: the comment and every reply
// beneath it). With no reason there is no body at all, the same convention
// as deletePost.
export async function deleteComment(
  id: string,
  reason?: string,
): Promise<DeletedComment> {
  const res = await apiClient.delete<ApiSuccess<DeletedComment>>(
    `/comments/${encodeURIComponent(id)}`,
    { data: reason ? { reason } : undefined },
  );
  return res.data.data;
}
