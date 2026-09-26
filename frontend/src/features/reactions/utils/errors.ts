import { ApiError } from "@/lib/axios/api-error";

// Mirrors posts/utils/errors.ts's describeSaveError, but kept as its own
// copy rather than an import: features/reactions must not depend on
// features/posts, and features/comments reuses this same file in CP5.
export function describeReactionError(error: unknown): string {
  if (error instanceof ApiError && error.status === undefined) {
    return "Couldn't reach the server, so your reaction wasn't saved.";
  }
  if (error instanceof ApiError && error.status === 404) {
    return "This post or comment is no longer available.";
  }
  return "Couldn't save your reaction. Please try again.";
}
