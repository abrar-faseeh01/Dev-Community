"use client";

import { FEED_NOTICES, isFeedNoticeKey } from "@/lib/posts/notices";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// A dismissible message the feed shows once after a redirect (an admin sent
// away from /posts/create, a post deleted, a post that turned out to be
// gone). It reads `?notice=`, then removes the
// param from the URL so a refresh or a copied link doesn't bring it back;
// the message itself is held in state, so removing the param doesn't remove
// it from the screen.
//
// useSearchParams makes the page render on the client, so callers wrap this
// in <Suspense> — without it `next build` refuses the route.
export function FeedNotice() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // The feed page stays mounted when a delete on it redirects to
  // /posts?notice=..., so the param can arrive after the first render. State
  // is adjusted during render when the param's value changes (React's
  // documented pattern for state that follows a value), not from an effect.
  const noticeParam = searchParams.get("notice");
  const [handledParam, setHandledParam] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  if (noticeParam !== handledParam) {
    setHandledParam(noticeParam);
    if (isFeedNoticeKey(noticeParam)) setMessage(FEED_NOTICES[noticeParam]);
  }

  const hasNoticeParam = searchParams.has("notice");
  useEffect(() => {
    if (!hasNoticeParam) return;
    const next = new URLSearchParams(searchParams.toString());
    next.delete("notice");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [hasNoticeParam, searchParams, pathname, router]);

  if (!message) return null;

  return (
    <div
      role="status"
      className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-accent/25 bg-accent/10 px-4 py-3 text-sm text-foreground"
    >
      <p>{message}</p>
      <button
        type="button"
        onClick={() => setMessage(null)}
        className="shrink-0 rounded px-1 font-medium text-accent hover:underline focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        Dismiss
      </button>
    </div>
  );
}
