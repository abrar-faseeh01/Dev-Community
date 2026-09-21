"use client";

import { MyPosts } from "@/components/posts/my-posts";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// "Posts made by you": the one place to manage your own posts. The feed and
// the post page are for reading; editing and deleting live here (and on the
// post's own page).
export default function MyPostsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // The middleware only checks that a cookie exists, so an expired session
  // gets here — send it to login rather than showing a list it can't load.
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const canCreate = !loading && user?.role === "user";

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <Link
          href={user ? `/profile/${user.id}` : "/posts"}
          className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          <span aria-hidden="true">←</span> Back to profile
        </Link>

        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-accent">Profile</p>
            <h1 className="text-2xl font-bold tracking-tight">
              Posts made by you
            </h1>
          </div>

          {canCreate && (
            <Link
              href="/posts/create"
              className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
            >
              New post
            </Link>
          )}
        </div>

        {loading || !user ? (
          <div role="status" aria-busy="true">
            <span className="text-sm text-muted">Loading…</span>
          </div>
        ) : (
          <MyPosts user={user} />
        )}
      </div>
    </main>
  );
}
