"use client";

import { useEffect } from "react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-sm"
      >
        <h1 className="text-lg font-semibold text-foreground">
          Something went wrong
        </h1>
        <p className="mt-1 text-sm text-muted">
          An unexpected error occurred. You can try again.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="mt-5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
