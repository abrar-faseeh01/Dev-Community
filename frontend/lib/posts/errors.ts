import { ApiError } from "../api-client";

// No response at all (server down, offline) reaches a caller as an ApiError
// with no status and the generic message "Request failed" — not something to
// show a reader. Anything the server did answer already carries its own
// message.
export function describeLoadError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === undefined) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return error instanceof Error ? error.message : fallback;
}

// Same idea for a write. With no response, the reader needs to know their
// text was NOT saved (the request may not have reached the server at all).
export function describeSaveError(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status === undefined) {
    return "Couldn't reach the server, so nothing was saved. Check your connection and try again.";
  }
  return error instanceof Error ? error.message : fallback;
}

export type PostFormErrors = {
  // Server validation messages that concern one field, keyed by field.
  fields: { title?: string; body?: string };
  // Whatever is left over, for the banner above the form. null when every
  // message landed on a field.
  banner: string | null;
};

// Sorts a failed save into per-field messages and a banner. class-validator
// messages start with the property name ("title should not be empty"), which
// is how they're matched to a field; anything else — including a 409 or a
// network failure — goes in the banner.
export function splitPostFormErrors(
  error: unknown,
  fallback: string,
): PostFormErrors {
  const fields: PostFormErrors["fields"] = {};
  const rest: string[] = [];

  if (error instanceof ApiError && error.errors.length > 0) {
    for (const message of error.errors) {
      if (message.startsWith("title") && !fields.title) fields.title = message;
      else if (message.startsWith("body") && !fields.body) fields.body = message;
      else rest.push(message);
    }
    return { fields, banner: rest.length > 0 ? rest.join(" ") : null };
  }

  return { fields, banner: describeSaveError(error, fallback) };
}

// GET /posts/:id answers 404 for a post that doesn't exist or was
// soft-deleted, and 400 for an id that isn't a valid ObjectId. To a reader
// those are the same thing — there's no post at this address — so the detail
// page shows one "not found" view for both.
export function hasStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status;
}

export function isPostNotFound(error: unknown): boolean {
  return (
    error instanceof ApiError && (error.status === 404 || error.status === 400)
  );
}
