"use client";

import { Avatar } from "@/components/common/avatar";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import type { Comment } from "@/features/comments/types/comment";
import {
  useDeleteComment,
  type useCreateComment,
  type useUpdateComment,
} from "@/features/comments/mutations/comment-mutations";
import { commentKeys } from "@/features/comments/queries/comment-queries";
import { canComment, getCommentActor } from "@/features/comments/utils/permissions";
import { describeSaveError, hasStatus } from "@/features/comments/utils/errors";
import { formatFullDateTime, formatRelativeTime } from "@/lib/utils/format-time";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CommentForm } from "./comment-form";

export type ActiveForm = { commentId: string; kind: "reply" | "edit" } | null;

// A character-count heuristic rather than measuring actual rendered
// overflow (scrollHeight vs. clientHeight via a ref+effect): comments cap
// at 2000 chars (MAX_COMMENT_BODY_LENGTH on the backend), so a fixed
// threshold is simple, needs no DOM measurement, and behaves identically in
// tests/SSR — it won't be pixel-perfect for every line-wrap width, but a
// "Show more" on an already-short comment is a harmless false positive, not
// a bug.
const LONG_COMMENT_THRESHOLD = 500;

// Coordination state/handlers owned by comment-list.tsx and threaded down
// through the recursion — see "Open-form coordination". Passed as its own
// object (not spread into individual props) so every level of the recursion
// forwards the same identity unchanged; the pieces that actually go into a
// useEffect dependency array below are read off it individually, not by
// depending on this object itself.
export type FormCoordination = {
  activeForm: ActiveForm;
  // The id of a comment just created by a reply, so the matching node can
  // focus itself once it appears in the refetched tree — see "Cache
  // strategy" (a synchronous focus right after the mutation promise
  // resolves would target a DOM node that doesn't exist yet).
  justCreatedId: string | null;
  clearJustCreated: () => void;
  // The id of a comment whose edit just saved, so its Edit button can
  // refocus once React has re-rendered it back into the "not editing"
  // branch — same "effect after the render, not a synchronous call in the
  // handler" reasoning, just for a render rather than a refetch.
  justSavedId: string | null;
  clearJustSaved: () => void;
  requestForm: (commentId: string, kind: "reply" | "edit") => void;
  closeForm: () => void;
  onFormDirtyChange: (dirty: boolean) => void;
  // Called after a successful delete with the focus fallback captured
  // *before* the delete request went out (this comment's parentCommentId,
  // or "heading" for a root — see "Focus management"'s delete-success case)
  // and the cascade's deletedCount, for the live-region announcement.
  // comment-list.tsx owns resolving this to an actual DOM node, since it's
  // the one place with visibility into the whole tree.
  onCommentDeleted: (focusTarget: string | "heading", deletedCount: number) => void;
};

type Viewer = { id: string; role: "admin" | "user" } | null;

type CommentItemProps = {
  comment: Comment;
  // The author of the comment this one is actually replying to — shown on
  // every reply, not just ones flattened past MAX_COMMENT_DEPTH
  // (backend/src/comments/comment-tree.ts): every reply in a root's
  // `replies` array sits at the same single indent level regardless of its
  // true depth, so nesting alone doesn't tell a reader who a given reply is
  // actually responding to. null only for a root (nothing to reply to).
  replyingToAuthor?: string | null;
  viewer: Viewer;
  // Null when the post's own author is unknown yet (never in practice here —
  // post-page-view.tsx only renders CommentList once the post has loaded).
  postAuthorId: string | null;
  coordination: FormCoordination;
  replyMutation: ReturnType<typeof useCreateComment>;
  updateMutation: ReturnType<typeof useUpdateComment>;
};

export function CommentItem({
  comment,
  replyingToAuthor = null,
  viewer,
  postAuthorId,
  coordination,
  replyMutation,
  updateMutation,
}: CommentItemProps) {
  const edited = comment.updatedAt !== comment.createdAt;
  const actor = getCommentActor(viewer, comment, postAuthorId);
  const isLong = comment.body.length > LONG_COMMENT_THRESHOLD;
  const [expanded, setExpanded] = useState(false);
  const isReplyOpen =
    coordination.activeForm?.commentId === comment.id &&
    coordination.activeForm.kind === "reply";
  const isEditOpen =
    coordination.activeForm?.commentId === comment.id &&
    coordination.activeForm.kind === "edit";

  // Returns focus to the Reply trigger once this comment's reply form
  // closes — whether by Cancel, Escape, a successful reply, or a different
  // form taking over. Tracked with a ref rather than comparing to the
  // previous activeForm prop directly, so this only fires on MY OWN open ->
  // closed transition, not on every unrelated activeForm change elsewhere
  // in the tree. Same idea, separately, for the Edit trigger below.
  const replyTriggerRef = useRef<HTMLButtonElement>(null);
  const wasReplyOpenRef = useRef(false);
  useEffect(() => {
    if (wasReplyOpenRef.current && !isReplyOpen) {
      replyTriggerRef.current?.focus();
    }
    wasReplyOpenRef.current = isReplyOpen;
  }, [isReplyOpen]);

  const editTriggerRef = useRef<HTMLButtonElement>(null);
  const wasEditOpenRef = useRef(false);
  useEffect(() => {
    if (wasEditOpenRef.current && !isEditOpen) {
      editTriggerRef.current?.focus();
    }
    wasEditOpenRef.current = isEditOpen;
  }, [isEditOpen]);

  // Focuses this node once it's the one a reply mutation just created and
  // the refetched tree has landed (this effect only runs once that render
  // has happened — it can't fire before the node exists).
  const rootRef = useRef<HTMLLIElement>(null);
  const { justCreatedId, clearJustCreated, justSavedId, clearJustSaved } = coordination;
  useEffect(() => {
    if (justCreatedId === comment.id) {
      rootRef.current?.focus();
      clearJustCreated();
    }
  }, [justCreatedId, comment.id, clearJustCreated]);

  // Same shape for a just-saved edit, but focusing the Edit button rather
  // than the whole node — the edit form is gone and the button is back in
  // its place by the time this effect runs.
  useEffect(() => {
    if (justSavedId === comment.id) {
      editTriggerRef.current?.focus();
      clearJustSaved();
    }
  }, [justSavedId, comment.id, clearJustSaved]);

  // Delete — a modal (ConfirmDialog), not a slot in the one-open-form
  // coordination above, so it's local state: nothing about it needs to be
  // visible to other comments the way activeForm does.
  const queryClient = useQueryClient();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteMutation = useDeleteComment(comment.postId);

  function openDeleteConfirm() {
    deleteMutation.reset();
    setConfirmingDelete(true);
  }

  async function confirmDelete(reason?: string) {
    if (deleteMutation.isPending) return;
    // Captured before the request goes out, not derived afterward — this
    // comment's parentCommentId is stable regardless of what the cache
    // looks like by the time the response (and refetch) lands.
    const focusTarget = comment.parentCommentId ?? "heading";
    try {
      const result = await deleteMutation.mutateAsync({ id: comment.id, reason });
      setConfirmingDelete(false);
      coordination.onCommentDeleted(focusTarget, result.deletedCount);
    } catch (err) {
      // A concurrent delete already won this race — it's gone either way,
      // which is what the reader wanted. Same 404-is-fine handling as
      // PostDeleteButton, just via invalidate here since there's no local
      // "forget it" cache helper for a single comment.
      if (hasStatus(err, 404)) {
        setConfirmingDelete(false);
        queryClient.invalidateQueries({ queryKey: commentKeys.list(comment.postId) });
        return;
      }
      // Any other failure: dialog stays open, shows deleteMutation.error.
    }
  }

  return (
    <li
      ref={rootRef}
      tabIndex={-1}
      data-comment-id={comment.id}
      className="list-none rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30"
    >
      <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex items-start gap-3">
          <Avatar name={comment.author.fullName} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-neutral-400">
              <span className="font-medium text-white">{comment.author.fullName}</span>
              <span aria-hidden="true">·</span>
              <time
                dateTime={comment.createdAt}
                title={formatFullDateTime(comment.createdAt)}
              >
                {formatRelativeTime(comment.createdAt)}
              </time>
              {edited && <span className="text-xs">(edited)</span>}
            </div>

            {replyingToAuthor && (
              <p className="mt-0.5 text-xs text-neutral-400">
                Replying to <span className="font-medium">@{replyingToAuthor}</span>
              </p>
            )}

            {isEditOpen ? (
              <div className="mt-2">
                <CommentForm
                  placeholder="Edit your comment…"
                  initialValue={comment.body}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  isPending={updateMutation.isPending}
                  error={updateMutation.isError ? updateMutation.error : undefined}
                  autoFocus
                  onCancel={coordination.closeForm}
                  onDirtyChange={coordination.onFormDirtyChange}
                  onSubmit={(body) => updateMutation.mutateAsync({ id: comment.id, body })}
                />
              </div>
            ) : (
              <>
                <p
                  className={`mt-2 whitespace-pre-wrap text-sm text-neutral-200 wrap-anywhere ${
                    isLong && !expanded ? "line-clamp-6" : ""
                  }`}
                >
                  {comment.body}
                </p>
                {isLong && (
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => !e)}
                    className="mt-1 text-xs font-medium text-emerald-400 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                )}
              </>
            )}

            {!isEditOpen && !isReplyOpen && (
              <div className="mt-2 flex items-center gap-3">
                {canComment(viewer) && (
                  <button
                    ref={replyTriggerRef}
                    type="button"
                    onClick={() => coordination.requestForm(comment.id, "reply")}
                    className="text-xs font-medium text-emerald-400 hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  >
                    Reply
                  </button>
                )}
                {actor === "author" && (
                  <button
                    ref={editTriggerRef}
                    type="button"
                    onClick={() => coordination.requestForm(comment.id, "edit")}
                    className="text-xs font-medium text-neutral-400 hover:text-white hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                  >
                    Edit
                  </button>
                )}
                {actor !== null && (
                  <button
                    type="button"
                    onClick={openDeleteConfirm}
                    className="text-xs font-medium text-red-400 hover:underline focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}

            {isReplyOpen && (
              <div className="mt-3">
                <CommentForm
                  placeholder={`Reply to ${comment.author.fullName}…`}
                  submitLabel="Reply"
                  pendingLabel="Posting…"
                  isPending={replyMutation.isPending}
                  error={replyMutation.isError ? replyMutation.error : undefined}
                  autoFocus
                  onCancel={coordination.closeForm}
                  onDirtyChange={coordination.onFormDirtyChange}
                  onSubmit={(body) =>
                    replyMutation.mutateAsync({ body, parentCommentId: comment.id })
                  }
                />
              </div>
            )}
          </div>
        </div>
      </article>

      <ConfirmDialog
        open={confirmingDelete}
        title={
          actor === "admin"
            ? `Delete ${comment.author.fullName}'s comment as admin?`
            : actor === "post-owner"
              ? `Delete ${comment.author.fullName}'s comment from your post?`
              : "Delete this comment?"
        }
        message={
          actor === "admin"
            ? `${comment.author.fullName} will be notified, and the deletion is recorded in the audit log. This can't be undone — any replies will be deleted too.`
            : actor === "post-owner"
              ? `This can't be undone — any replies will be deleted too. ${comment.author.fullName} won't be notified.`
              : "This can't be undone — any replies will be deleted too."
        }
        badge={actor === "admin" ? "Admin action" : undefined}
        showReasonInput={actor === "admin"}
        confirmLabel={actor === "admin" ? "Delete as admin" : "Delete"}
        pendingLabel="Deleting…"
        isPending={deleteMutation.isPending}
        error={
          deleteMutation.isError
            ? describeSaveError(deleteMutation.error, "Failed to delete the comment.")
            : undefined
        }
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      {comment.replies.length > 0 && (
        <ul className="mt-3 flex flex-col gap-3 border-l border-neutral-800 pl-4">
          {comment.replies.map((reply) => {
            // A direct child's parentCommentId is this node's own id; a
            // flattened deeper reply's parentCommentId points at some other
            // comment that — per the flattening invariant — is guaranteed to
            // be another entry in this same replies array, so it can always
            // be found here rather than needing its own fetch.
            const replyReplyingTo =
              reply.parentCommentId === comment.id
                ? comment.author.fullName
                : comment.replies.find((c) => c.id === reply.parentCommentId)
                    ?.author.fullName ?? comment.author.fullName;
            return (
              <CommentItem
                key={reply.id}
                comment={reply}
                replyingToAuthor={replyReplyingTo}
                viewer={viewer}
                postAuthorId={postAuthorId}
                coordination={coordination}
                replyMutation={replyMutation}
                updateMutation={updateMutation}
              />
            );
          })}
        </ul>
      )}
    </li>
  );
}
