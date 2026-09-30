import { useEffect, useState } from "react";

// Returns `value`, but only after it has stopped changing for `delayMs`. Each
// change restarts the timer, so a burst of updates (typing) produces one
// settled value at the end, not one per update. The first render returns the
// initial value immediately.
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
