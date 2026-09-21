import { useEffect, useRef } from "react";

type Options = {
  // Whether observing should be live right now. The caller folds every
  // reason NOT to fetch into this one flag — nothing left to load, a fetch
  // already in flight, or a failed fetch waiting on the user.
  enabled: boolean;
  onIntersect: () => void;
  // How far below the viewport the sentinel counts as "near the bottom", so
  // the next page starts loading before the reader actually runs out.
  rootMargin?: string;
};

// Calls `onIntersect` when the element the returned ref is attached to comes
// near the bottom of the viewport.
//
// Two failure modes this is built around:
//
// 1. Stalling. An IntersectionObserver only reports when visibility
//    *changes*, plus once when it starts observing. If a page loads and the
//    sentinel is still on screen (a tall window, short cards) nothing would
//    change, so nothing would fire and the feed would stop short. Because
//    `enabled` goes false while a fetch runs and true again when it settles,
//    the effect below tears the observer down and builds a fresh one each
//    time — and a fresh observer's first report is the sentinel's current
//    state, which is what re-arms it.
//
// 2. Loops and doubled requests. After a failed fetch the sentinel is still
//    on screen, so an observer left running would retry forever in a tight
//    loop; the caller turns `enabled` off on failure and offers a button
//    instead. `fired` additionally makes one observer trigger at most once,
//    so two reports before React re-renders can't send two requests.
export function useInfiniteScroll<T extends Element>({
  enabled,
  onIntersect,
  rootMargin = "400px",
}: Options) {
  const sentinelRef = useRef<T>(null);

  // Always call the latest callback without re-creating the observer every
  // render (which would re-arm it and re-fire it on each one).
  const onIntersectRef = useRef(onIntersect);
  useEffect(() => {
    onIntersectRef.current = onIntersect;
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!enabled || !sentinel) return;

    let fired = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (fired || !entries.some((entry) => entry.isIntersecting)) return;
        fired = true;
        onIntersectRef.current();
      },
      { rootMargin },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [enabled, rootMargin]);

  return sentinelRef;
}
