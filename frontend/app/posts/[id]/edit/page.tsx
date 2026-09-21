"use client";

import { PostForm } from "@/components/posts/post-form";
import { useAuth } from "@/lib/auth/auth-context";
import { getPostChanges } from "@/lib/posts/changes";
import {
  describeLoadError,
  hasStatus,
  isPostNotFound,
} from "@/lib/posts/errors";
import { feedNoticeUrl } from "@/lib/posts/notices";
import { getPostActor, type PostActor } from "@/lib/posts/permissions";
import { applyPostUpdate, forgetPost } from "@/lib/queries/post-mutations";
import { fetchPost, postKeys, updatePost } from "@/lib/queries/posts";
import type { PostFormValues } from "@/lib/schemas/post";
import type { Post } from "@/lib/types/post";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

const retryButtonClass =
  "shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-300 disabled:cursor-not-allowed disabled:opacity-60";

export default function EditPostPage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // The middleware only checks that a cookie exists, so an expired session
  // gets here. Sending it to login now beats letting it type an edit first.
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // Shares the detail page's cache entry, so opening Edit from a post you were
  // just reading needs no request.
  const postQuery = useQuery({
    queryKey: postKeys.detail(id),
    queryFn: () => fetchPost(id),
  });
  const post = postQuery.data;
  const actor = post ? getPostActor(user, post) : null;

  // "Reload post" after a conflict re-mounts the form (via `key`) so it
  // starts over from the server's copy. A refetch alone never does: the form
  // is mounted once, with the values it loaded, so a background refetch can't
  // overwrite what the reader is typing.
  const [formVersion, setFormVersion] = useState(0);

  // See app/posts/[id]/page.tsx: a post found to be gone can only be dropped
  // from the cache once this page, which is watching it, has unmounted.
  const goneRef = useRef(false);
  useEffect(
    () => () => {
      if (goneRef.current) {
        queryClient.removeQueries({ queryKey: postKeys.detail(id), exact: true });
      }
    },
    [queryClient, id],
  );

  async function reloadPost(): Promise<boolean> {
    const result = await postQuery.refetch();
    if (result.isSuccess) {
      setFormVersion((v) => v + 1);
      return true;
    }
    if (isPostNotFound(result.error)) {
      goneRef.current = true;
      forgetPost(queryClient, id);
      router.replace(feedNoticeUrl("post-gone"));
    }
    return false;
  }

  function onGone() {
    goneRef.current = true;
    forgetPost(queryClient, id);
    router.replace(feedNoticeUrl("post-gone"));
  }

  let content;
  if (authLoading || !user) {
    // Who is asking isn't known yet (or they are signed out and about to be
    // redirected), so nothing about the post — least of all "not allowed" —
    // is shown.
    content = (
      <div role="status" aria-busy="true">
        <span className="text-sm text-muted">Loading…</span>
      </div>
    );
  } else if (post) {
    // Checked on `post`, not on the query's state: a background refetch that
    // fails must not throw away a form the reader is halfway through.
    content = actor ? (
      <EditPostForm
        key={formVersion}
        post={post}
        actor={actor}
        onReload={reloadPost}
        onGone={onGone}
      />
    ) : (
      <div className="flex flex-col gap-3">
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
        >
          You can only edit your own posts.
        </p>
        <Link
          href={`/posts/${id}`}
          className="text-sm font-medium text-accent hover:underline"
        >
          Back to the post
        </Link>
      </div>
    );
  } else if (postQuery.isPending) {
    content = (
      <div role="status" aria-busy="true">
        <span className="text-sm text-muted">Loading post…</span>
      </div>
    );
  } else if (isPostNotFound(postQuery.error)) {
    content = (
      <div className="text-center">
        <p className="text-base font-semibold text-foreground">
          Post not found
        </p>
        <p className="mt-1 text-sm text-muted">
          It may have been deleted, or the link may be wrong.
        </p>
        <Link
          href="/posts"
          className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Go to the feed
        </Link>
      </div>
    );
  } else {
    content = (
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <p className="text-sm font-semibold text-red-700">
            Couldn&rsquo;t load this post
          </p>
          <p className="text-sm text-red-700">
            {describeLoadError(postQuery.error, "Failed to load post.")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => postQuery.refetch()}
          disabled={postQuery.isFetching}
          className={retryButtonClass}
        >
          {postQuery.isFetching ? "Retrying…" : "Retry"}
        </button>
      </div>
    );
  }

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Posts</p>
          <h1 className="text-2xl font-bold tracking-tight">Edit post</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          {content}
        </div>
      </div>
    </main>
  );
}

type EditPostFormProps = {
  post: Post;
  actor: PostActor;
  // Refetches the post and, if that worked, restarts the form from it.
  // Resolves false if the reload itself failed.
  onReload: () => Promise<boolean>;
  // The post no longer exists (a save came back 404).
  onGone: () => void;
};

function EditPostForm({ post, actor, onReload, onGone }: EditPostFormProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const moderating = actor === "moderator";

  // What the post looked like when this form opened. Changes are worked out
  // against this, not against whatever the cache holds by the time Save is
  // pressed.
  const [original] = useState({ title: post.title, body: post.body });
  const [reloading, setReloading] = useState(false);
  const [reloadFailed, setReloadFailed] = useState(false);

  const updateMutation = useMutation({
    mutationFn: (values: PostFormValues) =>
      updatePost(post.id, {
        ...getPostChanges(original, values),
        // Only an admin acting on someone else's post has a reason to give.
        reason: moderating ? values.reason.trim() || undefined : undefined,
      }),
    onSuccess: (updated) => {
      applyPostUpdate(queryClient, updated);
      router.push(`/posts/${updated.id}`);
    },
    onError: (error) => {
      if (hasStatus(error, 404)) onGone();
    },
  });

  const conflict = hasStatus(updateMutation.error, 409);

  // Everything except a conflict (which has its own panel below) goes to the
  // form's banner. The API's 403 text is worded for "edit your own", which is
  // wrong for an admin, so it is replaced.
  const formError = useMemo(() => {
    const error = updateMutation.error;
    if (!error || hasStatus(error, 409) || hasStatus(error, 404)) return undefined;
    if (hasStatus(error, 403)) {
      return new Error("You don't have permission to edit this post.");
    }
    return error;
  }, [updateMutation.error]);

  async function reload() {
    setReloading(true);
    setReloadFailed(false);
    const ok = await onReload();
    // On success this component is remounted by its `key`, so there is
    // nothing to reset.
    if (!ok) {
      setReloadFailed(true);
      setReloading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {moderating && (
        <div className="rounded-lg border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-foreground">
          <span className="mr-2 rounded-full border border-accent/25 bg-surface px-2 py-0.5 text-xs font-medium text-accent">
            Admin
          </span>
          You&rsquo;re editing {post.author.fullName}&rsquo;s post as an
          administrator. They&rsquo;ll be notified, and this is recorded in the
          audit log.
        </div>
      )}

      {conflict && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="text-sm text-red-700">
            <p className="font-semibold">
              {updateMutation.error instanceof Error
                ? updateMutation.error.message
                : "This post was changed by someone else."}
            </p>
            <p>
              Reloading replaces what you&rsquo;ve typed with the current
              version.
            </p>
            {reloadFailed && (
              <p className="mt-1 font-medium">
                Couldn&rsquo;t reload the post. Try again.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={reload}
            disabled={reloading}
            className={retryButtonClass}
          >
            {reloading ? "Reloading…" : "Reload post"}
          </button>
        </div>
      )}

      <PostForm
        defaultValues={{ title: post.title, body: post.body }}
        submitLabel={moderating ? "Save as admin" : "Save changes"}
        pendingLabel="Saving…"
        // Stays locked after a success too, until the navigation lands.
        isPending={updateMutation.isPending || updateMutation.isSuccess}
        error={formError}
        onSubmit={(values) => updateMutation.mutateAsync(values)}
        cancelHref={`/posts/${post.id}`}
        requireChange
        showReasonField={moderating}
      />
    </div>
  );
}
