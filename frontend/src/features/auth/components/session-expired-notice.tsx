"use client";

import {
  LOGIN_REASON_PARAM,
  LOGIN_REASON_SESSION_EXPIRED,
} from "@/constants/routes";
import { useSearchParams } from "next/navigation";

// Shown on /login when the axios interceptor sent the visitor here because
// their session ended (the refresh failed), so being asked to sign in again
// does not look like a glitch. Only the exact value the interceptor writes
// counts, and nothing from the URL is ever rendered, so a crafted link cannot
// put its own text on the page.
//
// useSearchParams needs a <Suspense> boundary for `next build`, so the caller
// (the login page) wraps this.
export function SessionExpiredNotice() {
  const searchParams = useSearchParams();

  if (searchParams.get(LOGIN_REASON_PARAM) !== LOGIN_REASON_SESSION_EXPIRED) {
    return null;
  }

  // role="status", not "alert": it is information, not an error, and the form's
  // own error banner is the page's alert.
  return (
    <p
      role="status"
      className="rounded-lg border border-amber-900/50 bg-amber-950/60 px-3.5 py-3 text-sm text-amber-300"
    >
      Your session has expired. Sign in again to continue.
    </p>
  );
}
