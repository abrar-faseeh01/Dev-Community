"use client";

import {
  QueryClient,
  QueryClientProvider as TanstackQueryClientProvider,
} from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "./api-client";

// A 4xx means the server understood and refused (not found, forbidden, bad
// id) — retrying can't change the answer and just delays the error state by
// the backoff (~3s at retry: 2). 408/429 are the exceptions: those are
// "try again later" by definition. A network failure has no status and a
// 5xx may be transient, so both keep retrying, up to twice, as before.
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (
    error instanceof ApiError &&
    error.status !== undefined &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < 2;
}

export function QueryClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Created once per browser session (useState initializer, not module
  // scope) so server-rendered requests never share a client across users.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: shouldRetry,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <TanstackQueryClientProvider client={queryClient}>
      {children}
    </TanstackQueryClientProvider>
  );
}
