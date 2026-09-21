"use client";

import { FeedNotice } from "@/components/posts/feed-notice";
import { PostFeed } from "@/components/posts/post-feed";
import { useAuth } from "@/lib/auth/auth-context";
import Link from "next/link";
import { Suspense } from "react";

export default function PostsPage() {
  const { user, loading } = useAuth();

  // Only a regular member can create a post — admins moderate but don't
  // author (the API rejects an admin's POST /posts with a 403), so the entry
  // point is hidden for them and for anonymous visitors. Nothing shows while
  // the session is still loading, so it can't flash in and out.
  const canCreate = !loading && user?.role === "user";

  return (
    <main className="flex flex-1 justify-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-sm font-medium text-accent">Community</p>
            <h1 className="text-2xl font-bold tracking-tight">Posts</h1>
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
