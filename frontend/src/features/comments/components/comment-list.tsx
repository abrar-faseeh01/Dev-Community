"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useComments } from "@/features/comments/queries/comment-queries";
import {
  useCreateComment,
  useUpdateComment,
} from "@/features/comments/mutations/comment-mutations";
import { canComment } from "@/features/comments/utils/permissions";
import {
  COMMENT_COMPOSER_CONTAINER_ID,
  COMMENTS_HEADING_ID,
} from "@/features/comments/utils/comment-focus";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CommentForm } from "./comment-form";
import { CommentItem, type ActiveForm } from "./comment-item";

type CommentListProps = {
  postId: string;
  // The post's own commentCount, passed down from post-page-view.tsx's
  // usePost() rather than re-derived by counting the fetched tree — that
  // keeps one source of truth, and it's what the mutation checkpoints'
  // adjustPostCommentCount (comment-cache-updates.ts) already keeps in sync.
  commentCount: number;
  // The post's own author id — getCommentActor needs it to resolve the
  // "post-owner" case (Delete only; Edit is author-only regardless).
  // Threaded from here since this is where the post's own data already
  // lives, not derived downstream.
  postAuthorId: string | null;
};

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-900/50 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/40 focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-60";

// A separate component, not an effect inline in CommentList, so its own
// effect calling onDone (an opaque prop from this component's point of
// view) isn't traced back to the setState call that defines it one
// component up — the same reason comment-item.tsx's justCreatedId/
// justSavedId effects (calling a passed-down clear callback) don't trip
// react-hooks/set-state-in-effect either. Renders nothing; only resolves
// the captured focus target to a live DOM node once the post-delete
// refetch's render has landed (see comment-item.tsx's confirmDelete, which
// sets the target only after awaiting the mutation, and that await
// encompasses the refetch) and moves focus there. A comment target that's
// gone too (a rare concurrent delete of the parent) falls back to the
// heading via the ?? below — the same "always land somewhere real" rule
// CP0.5 established for ConfirmDialog.
function DeleteFocusEffect({
  target,
  onDone,
}: {
  target: string | "heading" | null;
  onDone: () => void;
}) {
  useEffect(() => {
    if (target === null) return;
    const selector = target === "heading" ? null : `[data-comment-id="${target}"]`;
    const element =
      (selector ? document.querySelector<HTMLElement>(selector) : null) ??
      document.getElementById(COMMENTS_HEADING_ID);
    element?.focus();
    onDone();
  }, [target, onDone]);

  return null;
}

export function CommentList({ postId, commentCount, postAuthorId }: CommentListProps) {
  const { user, loading } = useAuth();
  const commentsQuery = useComments(postId);
  const createMutation = useCreateComment(postId);

  // Exactly one reply/edit form open across the whole tree at a time — see
  // "Open-form coordination". Not a ref: the tree needs to re-render when
  // this changes (it decides which comment shows a form instead of a
  // trigger).
  const [activeForm, setActiveForm] = useState<ActiveForm>(null);
  const [justCreatedId, setJustCreatedId] = useState<string | null>(null);
  const [justSavedId, setJustSavedId] = useState<string | null>(null);
  // A comment id (focus it directly) or "heading" (no parent to fall back
  // to), captured by the deleting comment-item *before* its request went
  // out — see comment-item.tsx's confirmDelete. Resolved to an actual DOM
  // node here, since this is the one place with visibility into the whole
  // tree and the heading.
  const [justDeletedFocusTarget, setJustDeletedFocusTarget] = useState<
    string | "heading" | null
  >(null);
  // A single sr-only live region for both edit and delete success — the
  // plan calls for "Comment updated."/"Comment deleted." announcements
  // alongside the focus moves above; one region is enough since only one of
  // these can happen at a time.
  const [liveMessage, setLiveMessage] = useState("");
  // Whether the currently open form has unsent text. A ref, not state: it's
  // only ever read at the moment of a click (requestForm), never rendered,
  // so it doesn't need to trigger a re-render on every keystroke.
  const activeFormDirtyRef = useRef(false);

  const replyMutation = useCreateComment(postId, {
    onSuccess: (created) => {
      setActiveForm(null);
      setJustCreatedId(created.id);
    },
  });

  const updateMutation = useUpdateComment(postId, {
    onSuccess: (edited) => {
      setActiveForm(null);
      setJustSavedId(edited.id);
      setLiveMessage("Comment updated.");
    },
  });

  const closeForm = useCallback(() => setActiveForm(null), []);
  const clearJustCreated = useCallback(() => setJustCreatedId(null), []);
  const clearJustSaved = useCallback(() => setJustSavedId(null), []);
  const onFormDirtyChange = useCallback((dirty: boolean) => {
    activeFormDirtyRef.current = dirty;
  }, []);
  const clearJustDeletedFocusTarget = useCallback(
    () => setJustDeletedFocusTarget(null),
    [],
  );
  const onCommentDeleted = useCallback(
    (focusTarget: string | "heading", deletedCount: number) => {
      setJustDeletedFocusTarget(focusTarget);
      setLiveMessage(
        deletedCount > 1
          ? `Comment deleted, along with ${deletedCount - 1} repl${
              deletedCount - 1 === 1 ? "y" : "ies"
            }.`
          : "Comment deleted.",
      );
    },
    [],
  );

  // Not wrapped in useCallback: it reads activeForm directly (not via a
  // setState updater), because the confirm() below is a side effect and
  // React may invoke a setState updater function more than once (e.g.
  // Strict Mode's double-invoke checks), which would risk showing the
  // confirmation dialog twice. It's only ever called from an onClick, never
  // from inside another effect's dependency array, so its identity changing
  // every render has no correctness cost.
  function requestForm(commentId: string, kind: "reply" | "edit") {
    if (activeForm?.commentId === commentId && activeForm.kind === kind) {
      // Same trigger clicked again — toggle off, same as Cancel.
      setActiveForm(null);
      return;
    }
    if (activeForm !== null && activeFormDirtyRef.current) {
      if (!window.confirm("Discard your unsent text?")) return;
    }
    activeFormDirtyRef.current = false;
    setActiveForm({ commentId, kind });
  }

  return (
    <section aria-labelledby={COMMENTS_HEADING_ID}>
      <h2
        id={COMMENTS_HEADING_ID}
        tabIndex={-1}
        className="text-lg font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/30 rounded"
      >
        Comments ({commentCount})
      </h2>

      <div role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
      <DeleteFocusEffect
        target={justDeletedFocusTarget}
        onDone={clearJustDeletedFocusTarget}
      />

      <div className="mt-4">
        {/* A null viewer covers both "logged out" and "auth still loading",
            same convention as getPostActor — but the composer needs to tell
            those two apart (sign-in link vs. nothing yet), so `loading` is
            checked first and separately. Reply buttons further down don't
            need this: canComment(null) is false either way, so they simply
            don't render during the loading window either, without a
            redundant per-comment sign-in prompt. */}
        {loading ? null : user === null ? (
          <p className="mb-5 text-sm text-neutral-400">
            <Link
              href={ROUTES.LOGIN}
              className="font-medium text-emerald-400 hover:underline"
            >
              Sign in
            </Link>{" "}
            to comment.
          </p>
        ) : canComment(user) ? (
          <div id={COMMENT_COMPOSER_CONTAINER_ID} className="mb-5">
            <CommentForm
              placeholder="Write a comment…"
              submitLabel="Comment"
              pendingLabel="Posting…"
              isPending={createMutation.isPending}
              error={createMutation.isError ? createMutation.error : undefined}
              onSubmit={(body) => createMutation.mutateAsync({ body })}
            />
          </div>
        ) : null}

        {commentsQuery.isPending ? (
          <div role="status" aria-busy="true" className="text-sm text-neutral-400">
            Loading comments…
          </div>
        ) : commentsQuery.isError ? (
          <div
            role="alert"
            className="flex flex-col gap-3 rounded-lg border border-red-900/50 bg-red-950/40 p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="text-sm text-red-300">Couldn&rsquo;t load comments.</p>
            <button
              type="button"
              onClick={() => commentsQuery.refetch()}
              disabled={commentsQuery.isFetching}
              className={retryButtonClass}
            >
              {commentsQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : commentsQuery.data.length === 0 ? (
          <p className="text-sm text-neutral-400">No comments yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {commentsQuery.data.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                viewer={user}
                postAuthorId={postAuthorId}
                coordination={{
                  activeForm,
                  justCreatedId,
                  clearJustCreated,
                  justSavedId,
                  clearJustSaved,
                  requestForm,
                  closeForm,
                  onFormDirtyChange,
                  onCommentDeleted,
                }}
                replyMutation={replyMutation}
                updateMutation={updateMutation}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
