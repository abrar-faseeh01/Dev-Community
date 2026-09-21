"use client";

import { ROUTES } from "@/constants/routes";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { describeSaveError, hasStatus } from "@/features/posts/utils/errors";
import type { PostActor } from "@/features/posts/utils/permissions";
import { feedNoticeUrl } from "@/features/posts/utils/notices";
import { useDeletePost } from "@/features/posts/mutations/post-mutations";
import type { Post } from "@/features/posts/types/post";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Edit and Delete for one post. They are separate pieces because they live in
// different places: on the post page the Edit link sits next to the title and
// the Delete button at the bottom, while on "Posts made by you" both sit
// together on each row (PostActions, below). The feed carries neither.
//
// `actor` comes from getPostActor. The caller only renders these for a
// non-null actor, so an unauthorised viewer never gets a button. An admin
// acting on someone else's post ("moderator") gets the same controls marked
// "as admin", an Admin badge, and a delete dialog that says whose post it is
// and asks for a reason.

const actionClass =
  "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2";

export function AdminBadge() {
  return (
    <span className="rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
      Admin
    </span>
  );
}

type EditLinkProps = { post: Post; actor: PostActor };

export function PostEditLink({ post, actor }: EditLinkProps) {
  return (
    <Link
      href={ROUTES.postEdit(post.id)}
      className={`${actionClass} border-border text-foreground hover:bg-background focus:ring-accent/30`}
    >
      {actor === "moderator" ? "Edit as admin" : "Edit"}
    </Link>
  );
}

// The API words its 403 and 409 for edits ("You can only edit your own
// post", "Reload it and try again"), which reads wrong in a delete dialog.
function describeDeleteError(error: unknown): string {
  if (hasStatus(error, 403)) {
    return "You don't have permission to delete this post.";
  }
  if (hasStatus(error, 409)) {
    return "The post was changed by someone else while you were deleting it. Try again.";
  }
  return describeSaveError(error, "Failed to delete the post.");
}

type DeleteButtonProps = {
  post: Post;
  actor: PostActor;
  // Button text. Defaults to "Delete" / "Delete as admin".
  label?: string;
  // Called once the post is gone, either because this delete succeeded or
  // because it turned out to be gone already. The post's own page uses it to
  // navigate away, and the list page to say what happened. When omitted the
  // reader is sent to the feed with a notice.
  onRemoved?: (info: { alreadyGone: boolean }) => void;
};

export function PostDeleteButton({
  post,
  actor,
  label,
  onRemoved,
}: DeleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const moderating = actor === "moderator";
  const authorName = post.author.fullName;

  // A second click can arrive before `isPending` has reached the DOM, so the
  // guard is a ref, set synchronously. It is released only on failure: after
  // a success the post is gone and this component is on its way out.
  const inFlight = useRef(false);

  const deleteMutation = useDeletePost(post.id, {
    onSuccess: () => {
      setConfirming(false);
      if (onRemoved) onRemoved({ alreadyGone: false });
      else router.replace(feedNoticeUrl("post-deleted"), { scroll: false });
    },
    onError: (error) => {
      // Already deleted by someone else: it is gone either way, which is
      // what the reader wanted. Same cleanup, different wording.
      if (hasStatus(error, 404)) {
        setConfirming(false);
        if (onRemoved) onRemoved({ alreadyGone: true });
        else router.replace(feedNoticeUrl("post-gone"), { scroll: false });
        return;
      }
      inFlight.current = false;
    },
  });

  function requestDelete(reason?: string) {
    if (inFlight.current || deleteMutation.isPending) return;
    inFlight.current = true;
    deleteMutation.mutate(moderating ? reason : undefined);
  }

  function openDialog() {
    deleteMutation.reset();
    setConfirming(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={`${actionClass} border-red-200 text-red-700 hover:bg-red-50 focus:ring-red-300`}
      >
        {label ?? (moderating ? "Delete as admin" : "Delete")}
      </button>

      <ConfirmDialog
        open={confirming}
        title={
          moderating
            ? `Delete ${authorName}'s post as admin?`
            : "Delete this post?"
        }
        message={
          moderating
            ? `This is not your post. ${authorName} will be notified, and the deletion is recorded in the audit log.`
            : "This can't be undone."
        }
        badge={moderating ? "Admin action" : undefined}
        showReasonInput={moderating}
        confirmLabel={moderating ? "Delete as admin" : "Delete"}
        pendingLabel="Deleting…"
        isPending={deleteMutation.isPending}
        error={
          deleteMutation.isError
            ? describeDeleteError(deleteMutation.error)
            : undefined
        }
        onConfirm={requestDelete}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

type ActionsProps = {
  post: Post;
  actor: PostActor;
  onRemoved?: DeleteButtonProps["onRemoved"];
};

// Both controls side by side — for a row in "Posts made by you".
export function PostActions({ post, actor, onRemoved }: ActionsProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PostEditLink post={post} actor={actor} />
      <PostDeleteButton post={post} actor={actor} onRemoved={onRemoved} />
      {actor === "moderator" && <AdminBadge />}
    </div>
  );
}
