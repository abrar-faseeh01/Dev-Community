"use client";

import { useEffect, useRef, type RefObject } from "react";

type Options = {
  open: boolean;
  onDismiss: () => void;
  // The panel plus whatever opens it: a mousedown inside this is not "outside".
  containerRef: RefObject<HTMLElement | null>;
  // Escape hands focus back here. A closed panel is visibility:hidden, which
  // drops focus from anything inside it, so without this focus would be lost.
  triggerRef: RefObject<HTMLElement | null>;
};

// Closes a popup panel on a click outside it or on Escape, for as long as it
// is open.
export function useDismissible({
  open,
  onDismiss,
  containerRef,
  triggerRef,
}: Options) {
  // Always call the latest callback without re-registering the listeners on
  // every render.
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onDismissRef.current();
      }
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onDismissRef.current();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, containerRef, triggerRef]);
}
