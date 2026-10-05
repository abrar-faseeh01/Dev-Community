import { ROUTES } from "@/constants/routes";
import {
  isAxiosError,
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from "axios";
import { ApiError } from "./api-error";

declare module "axios" {
  interface AxiosRequestConfig {
    // Opt a request out of the "401 means the session is dead, go to /login"
    // redirect, for calls where a 401 is an expected outcome the caller
    // already handles itself (see services/api/auth.ts).
    skipAuthRedirect?: boolean;
    // Opt a request out of "401 means the access token may have expired, try a
    // refresh". For calls where a 401 can never be fixed by refreshing: a wrong
    // password on login or signup, and the refresh request itself.
    skipAuthRefresh?: boolean;
    // Set by the interceptor only, never by a caller. `_retried` marks the one
    // repeat of a request after a refresh, so a second 401 cannot start another
    // refresh. `_sentAt` is the order the request was sent in (see tick below).
    _retried?: boolean;
    _sentAt?: number;
  }
}

export const REFRESH_URL = "/auth/refresh";

export type InterceptorOptions = {
  // Where to go when the session is over. Injected so a test can watch it
  // instead of navigating; the default is a full page load, which also throws
  // away the TanStack cache so nothing of the old session stays on screen.
  redirectToLogin?: () => void;
};

function redirectToSessionExpiredLogin() {
  window.location.href = ROUTES.LOGIN_SESSION_EXPIRED;
}

// Every failure leaves here as an ApiError, so callers get the backend's own
// message (and per-field `errors`, and the HTTP `status`) instead of
// axios's generic ones.
function toApiError(error: AxiosError): ApiError {
  const body = error.response?.data as
    | { message?: string; errors?: string[] }
    | undefined;
  return new ApiError(
    body?.message || "Request failed",
    body?.errors ?? [],
    error.response?.status,
  );
}

// The session lifecycle on a 401, in one place:
//
//   1. A protected call 401s (the 15-minute access token expired).
//   2. One refresh is started, or joined if one is already running, so any
//      number of calls failing together cost a single POST /auth/refresh.
//   3. If it worked, the original request is sent again, exactly once.
//   4. If the refresh itself 401s, the session is over: go to /login.
//
// A loop is impossible by construction: the refresh request and a repeated
// request are both marked so a 401 on either never starts another refresh.
export function attachInterceptors(
  client: AxiosInstance,
  { redirectToLogin = redirectToSessionExpiredLogin }: InterceptorOptions = {},
) {
  // The one refresh in flight, shared by every request that needs it.
  let refreshInFlight: Promise<void> | null = null;
  // A counter, not a clock, so "sent before the refresh finished" is exact
  // even for two events in the same millisecond. Each request is stamped when
  // it is sent and each finished refresh takes the next number.
  let tick = 0;
  let lastRefreshAt = 0;
  let redirecting = false;

  client.interceptors.request.use((config) => {
    config._sentAt = ++tick;
    return config;
  });

  function refreshSession(): Promise<void> {
    refreshInFlight ??= client
      .post(REFRESH_URL, undefined, {
        skipAuthRefresh: true,
        skipAuthRedirect: true,
      })
      .then(() => {
        lastRefreshAt = ++tick;
      })
      .finally(() => {
        refreshInFlight = null;
      });
    return refreshInFlight;
  }

  function ensureFreshSession(config: InternalAxiosRequestConfig) {
    if (refreshInFlight) return refreshInFlight;
    // A request sent before the last refresh finished carried the old cookie;
    // its 401 says nothing about the new one. It only needs repeating.
    if ((config._sentAt ?? 0) < lastRefreshAt) return Promise.resolve();
    return refreshSession();
  }

  function endSession() {
    if (redirecting) return; // several calls can fail together; leave once
    redirecting = true;
    redirectToLogin();
  }

  client.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!isAxiosError(error)) return Promise.reject(error);

      const config = error.config;
      if (
        typeof window !== "undefined" &&
        config &&
        error.response?.status === 401
      ) {
        if (!config.skipAuthRefresh && !config._retried) {
          try {
            await ensureFreshSession(config);
          } catch (refreshError) {
            // Only a 401 from the refresh itself means the session is over.
            // A 429, a 5xx or a network failure says nothing about the
            // session, so the user stays signed in and sees that error.
            if (refreshError instanceof ApiError && refreshError.status === 401) {
              if (!config.skipAuthRedirect) endSession();
              return Promise.reject(toApiError(error));
            }
            return Promise.reject(refreshError);
          }
          return client.request({ ...config, _retried: true });
        }

        // No refresh to try: a repeated request that still 401s, or a call
        // that opted out of refreshing. Same outcome as before this day's work.
        if (!config.skipAuthRedirect) endSession();
      }

      return Promise.reject(toApiError(error));
    },
  );
}
