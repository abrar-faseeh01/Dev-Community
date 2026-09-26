import type { ReactionResult } from "@/features/reactions/types/reaction-result";
import type { ReactorList } from "@/features/reactions/types/reactor";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";
import type { ReactionType } from "@/types/reaction";

// POST posts/:id/reaction — toggle the caller's own reaction (like/dislike)
// on a post. Create/remove/switch is decided server-side from the caller's
// existing reaction row; the frontend only ever asks for the type it wants
// to be its new reaction and reads back the authoritative counts and
// myReaction in the response.
export async function togglePostReaction(
  id: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const res = await apiClient.post<ApiSuccess<ReactionResult>>(
    `/posts/${encodeURIComponent(id)}/reaction`,
    { type },
  );
  return res.data.data;
}

// POST comments/:id/reaction — the same toggle, for a comment.
export async function toggleCommentReaction(
  id: string,
  type: ReactionType,
): Promise<ReactionResult> {
  const res = await apiClient.post<ApiSuccess<ReactionResult>>(
    `/comments/${encodeURIComponent(id)}/reaction`,
    { type },
  );
  return res.data.data;
}

// GET posts/:id/reactions — who reacted, most recent first, capped by the
// server. Public: no login needed, the same as reading the post. `type`
// narrows the list to likes or dislikes; leave it out for everyone.
export async function getPostReactors(
  id: string,
  type?: ReactionType,
): Promise<ReactorList> {
  const res = await apiClient.get<ApiSuccess<ReactorList>>(
    `/posts/${encodeURIComponent(id)}/reactions`,
    { params: type ? { type } : undefined },
  );
  return res.data.data;
}

// GET comments/:id/reactions — the same list, for a comment.
export async function getCommentReactors(
  id: string,
  type?: ReactionType,
): Promise<ReactorList> {
  const res = await apiClient.get<ApiSuccess<ReactorList>>(
    `/comments/${encodeURIComponent(id)}/reactions`,
    { params: type ? { type } : undefined },
  );
  return res.data.data;
}
