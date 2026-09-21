import { ApiError } from "@/lib/axios/api-error";
import { QueryClient } from "@tanstack/react-query";

// A 4xx means the server understood and refused (not found, forbidden, bad
// id) — retrying can't change the answer and just delays the error state by
// the backoff (~3s at retry: 2). 408/429 are the exceptions: those are
// "try again later" by definition. A network failure has no status and a
// 5xx may be transient, so both keep retrying, up to twice.
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

// A factory, not a module-level singleton: the provider creates one per
// browser session so server-rendered requests never share a client (and its
// cache) across users.
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
    },
  });
}
