"use client";

import { ROUTES } from "@/constants/routes";
import { FeedNotice } from "@/features/posts/components/feed-notice";
import { PostFeed } from "@/features/posts/components/post-feed";
import { useAuth } from "@/features/auth/hooks/use-auth";
import Link from "next/link";
import { Suspense } from "react";

export function PostsView() {
  const { user, loading } = useAuth();

  // Only a regular member can create a post — admins moderate but don't
  // author (the API rejects an admin's POST /posts with a 403), so the entry
  // point is hidden for them and for anonymous visitors. Nothing shows while
  // the session is still loading, so it can't flash in and out.
  const canCreate = !loading && user?.role === "user";

  return (
    <main className="flex flex-1 justify-center bg-neutral-950 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-emerald-400">Community</p>
            <h1 className="text-2xl font-bold tracking-tight text-white">Posts</h1>
          </div>

          {canCreate && (
            <Link
              href={ROUTES.POSTS_CREATE}
              className="shrink-0 rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
            >
              New post
            </Link>
          )}
        </div>

        {/* FeedNotice reads the URL's search params, which needs a Suspense
            boundary for `next build`. */}
        <Suspense fallback={null}>
          <FeedNotice />
        </Suspense>

        <PostFeed />
      </div>
    </main>
  );
}
