"use client";

import { ROUTES } from "@/constants/routes";
import { useRequireAuth } from "@/features/auth/hooks/use-require-auth";
import { PostForm } from "@/features/posts/components/post-form";
import { useCreatePost } from "@/features/posts/mutations/post-mutations";
import { ADMIN_CANNOT_POST_URL } from "@/features/posts/utils/notices";
import { ApiError } from "@/lib/axios/api-error";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function CreatePostView() {
  // Signed-out visitors (an expired cookie gets past the middleware) go to
  // login now rather than after they have typed something.
  const { user, loading } = useRequireAuth();
  const router = useRouter();

  // Only a regular member can create a post. The API refuses an admin's
  // POST /posts with a 403; here an admin is sent to the feed with an
  // explanation before the form is ever shown.
  const isAdmin = user?.role === "admin";
  useEffect(() => {
    if (!loading && isAdmin) router.replace(ADMIN_CANNOT_POST_URL);
  }, [loading, isAdmin, router]);

  const createMutation = useCreatePost({
    onSuccess: (post) => router.push(ROUTES.post(post.id)),
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
              onSubmit={(values) =>
                createMutation.mutateAsync({
                  title: values.title,
                  body: values.body,
                })
              }
              cancelHref={ROUTES.POSTS}
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
