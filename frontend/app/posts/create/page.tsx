"use client";

import { PostForm } from "@/components/posts/post-form";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth/auth-context";
import { ADMIN_CANNOT_POST_URL } from "@/lib/posts/notices";
import { applyPostCreated } from "@/lib/queries/post-mutations";
import { createPost } from "@/lib/queries/posts";
import type { PostFormValues } from "@/lib/schemas/post";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function CreatePostPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  // Only a regular member can create a post. The API refuses an admin's
  // POST /posts with a 403; here an admin is sent to the feed with an
  // explanation before the form is ever shown. A cookie that no longer maps
  // to a session (expired) can't post either, so it goes to login now rather
  // than after the reader has typed something.
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (isAdmin) router.replace(ADMIN_CANNOT_POST_URL);
  }, [loading, user, isAdmin, router]);

  const createMutation = useMutation({
    mutationFn: (values: PostFormValues) =>
      createPost({ title: values.title, body: values.body }),
    onSuccess: (post) => {
      // Seed the detail page, put the post at the top of the cached feed and
      // of the author's "Posts made by you" list, and mark both stale so the
      // server's own ordering is what ends up on screen.
      applyPostCreated(queryClient, post);
      router.push(`/posts/${post.id}`);
    },
    onError: (error) => {
      // POST /posts only answers 403 for the admin rule (a missing session is
      // a 401, which the API client turns into a redirect to login) — so this
      // is an admin whose role changed mid-session, or who got here some
      // other way. Same destination and message as the redirect above; the
      // raw "Insufficient role" text is never shown.
      if (error instanceof ApiError && error.status === 403) {
        router.replace(ADMIN_CANNOT_POST_URL);
      }
    },
  });

  const canShowForm = !loading && !!user && !isAdmin;
  const rejectedAsAdmin =
    createMutation.error instanceof ApiError &&
    createMutation.error.status === 403;

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7">
          <p className="mb-1 text-sm font-medium text-accent">Posts</p>
          <h1 className="text-2xl font-bold tracking-tight">Create post</h1>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          {canShowForm ? (
            <PostForm
              submitLabel="Publish post"
              pendingLabel="Publishing…"
              // Stays true after success too, until the navigation lands, so
              // the button can't be pressed again in between.
              isPending={createMutation.isPending || createMutation.isSuccess}
              error={rejectedAsAdmin ? undefined : createMutation.error}
              onSubmit={(values) => createMutation.mutateAsync(values)}
              cancelHref="/posts"
            />
          ) : (
            // While the session loads, and for the moment before an admin or
            // signed-out visitor is redirected: never the form.
            <div role="status" aria-busy="true">
              <span className="text-sm text-muted">Loading…</span>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
