"use client";

import { ROUTES } from "@/constants/routes";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { searchHref } from "@/features/posts/utils/search-href";
import { SEARCH_MAX_QUERY_LENGTH } from "@/features/posts/utils/search-limits";
import { normalizeSearchTerm } from "@/features/posts/utils/search-term";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const SEARCH_DEBOUNCE_MS = 300;

// The site-wide search box, signed-in readers only (the header hides it
// otherwise, same as post-search-results.tsx hides its results). It lives in
// the header, so it renders on every page, but search results only exist on
// /posts:
//  - already on /posts: the settled term is written into ?q= in place, via
//    window.history.replaceState — a router navigation through an
//    already-revealed <Suspense> boundary would hold the previous results on
//    screen instead of committing the new ones (same reasoning
//    sorted-post-feed.tsx and the old post-search.tsx both relied on).
//  - anywhere else: the settled term navigates there for real, via the
//    router, since there is no query string to update in place on a
//    different page.
//  - leaving /posts for any reason (a search result, any other link) clears
//    the box — a term left showing there no longer describes what's on
//    screen anywhere else.
//
// Callers wrap this in <Suspense> — it reads the URL's search params, which
// `next build` refuses without one.
export function HeaderSearch() {
  const { user, loading } = useAuth();
  const canSearch = !loading && !!user;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onPostsPage = pathname === ROUTES.POSTS;
  // ?q= only means anything on /posts — elsewhere there's nothing to follow.
  const urlTerm = onPostsPage ? (searchParams.get("q") ?? "") : "";

  const [rawInput, setRawInput] = useState(() =>
    urlTerm.slice(0, SEARCH_MAX_QUERY_LENGTH),
  );
  const [seenUrlTerm, setSeenUrlTerm] = useState(urlTerm);

  const debouncedRaw = useDebouncedValue(rawInput, SEARCH_DEBOUNCE_MS);
  const searchTerm = normalizeSearchTerm(debouncedRaw);
  const urlSearchTerm = normalizeSearchTerm(urlTerm);

  // The last term this box has already caused /posts's URL to reflect —
  // either by writing it in place while there, or by navigating there from
  // somewhere else. Without this, leaving /posts for *any* reason (clicking
  // a search result, or any other link at all) while a term is still sitting
  // in the box looks, to the effect below, exactly like "a fresh term was
  // just typed somewhere other than /posts" — urlSearchTerm is forced to ""
  // off /posts, so every render off /posts would otherwise look like a brand
  // new search and immediately bounce the reader back to /posts?q=...,
  // undoing whatever navigation they just made.
  //
  // A ref, not state: it is only ever read and written from inside effects,
  // never during render, so there is nothing for a re-render to do with it —
  // exactly the case refs are for, and setting state from inside an effect
  // body is its own lint error (react-hooks/set-state-in-effect).
  const syncedTermRef = useRef(urlSearchTerm);

  // Follows /posts's ?q= when it changes for a reason other than this box's
  // own settled write (Back, a sort change, a same-page link to bare
  // /posts) — and follows leaving /posts entirely too, since urlTerm above
  // is forced to "" off /posts: a stale term left in the box after
  // navigating anywhere else (a post's own page, Create Post, Settings...)
  // would look like an active search for a page that isn't showing one, so
  // it clears the same way going back to bare /posts already does. The same
  // "adjust state during render" idiom post-search.tsx's own history used.
  if (urlTerm !== seenUrlTerm) {
    setSeenUrlTerm(urlTerm);
    if (urlSearchTerm !== searchTerm) {
      setRawInput(urlTerm.slice(0, SEARCH_MAX_QUERY_LENGTH));
    }
  }

  const settled = rawInput === debouncedRaw;
  useEffect(() => {
    if (!canSearch || !settled) return;
    if (onPostsPage) {
      if (searchTerm === urlSearchTerm) return;
      syncedTermRef.current = searchTerm;
      window.history.replaceState(
        null,
        "",
        searchHref(pathname, searchParams, searchTerm),
      );
    } else if (searchTerm.length > 0 && searchTerm !== syncedTermRef.current) {
      syncedTermRef.current = searchTerm;
      router.push(searchHref(ROUTES.POSTS, new URLSearchParams(), searchTerm));
    }
  }, [canSearch, settled, onPostsPage, searchTerm, urlSearchTerm, pathname, searchParams, router]);

  // Forgets the last-synced term once we've actually left /posts, so typing
  // that same term again from a different page is treated as a fresh search
  // rather than something the effect above believes it already handled.
  // Independent of the effect above's settled/canSearch gate on purpose: the
  // render that first leaves /posts clears rawInput synchronously (the block
  // above), which makes debouncedRaw briefly stale and settled false for
  // that same render — the effect above would bail before ever reaching this
  // reset if it lived there too.
  useEffect(() => {
    if (!onPostsPage) syncedTermRef.current = "";
  }, [onPostsPage]);

  if (!canSearch) return null;

  return (
    <div role="search" className="w-full max-w-md">
      <label htmlFor="site-search" className="sr-only">
        Search posts
      </label>
      <input
        id="site-search"
        type="search"
        value={rawInput}
        onChange={(event) => setRawInput(event.target.value)}
        maxLength={SEARCH_MAX_QUERY_LENGTH}
        placeholder="Search posts…"
        autoComplete="off"
        className="h-10 w-full rounded-lg border border-neutral-800 bg-neutral-900 px-3.5 text-sm text-white outline-none transition-shadow placeholder:text-neutral-500 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20"
      />
    </div>
  );
}
