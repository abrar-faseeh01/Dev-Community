import axios, { isAxiosError, type Method } from "axios";

// Generic axios instance for all API calls — no auth-specific assumptions
// baked in beyond the interceptor below, so future features (profiles,
// posts, comments, reactions, ...) can use it as-is.
export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true, // sends the httpOnly cookie
  headers: { "Content-Type": "application/json" },
});

// Endpoints where a 401 is an expected, routine outcome — not a dead
// session — and is already handled locally by the caller:
// - GET /auth/me: how AuthProvider learns "nobody's logged in" on mount,
//   fired on every page (including /login and /signup) whether or not
//   anyone is signed in.
// - POST /auth/login: a wrong password also 401s; the login page shows
//   that inline rather than navigating away.
// A blanket redirect on any 401 would force-navigate anonymous visitors
// off public pages and away from a failed login attempt, and would
// infinite-loop on /login and /signup for anyone not signed in (each
// mount re-checks /auth/me, gets 401, "redirects" to the page it's
// already on, which reloads and repeats).
const AUTH_REDIRECT_EXEMPT_PATHS = ["/auth/me", "/auth/login", "/auth/signup"];

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      typeof window !== "undefined" &&
      isAxiosError(error) &&
      error.response?.status === 401 &&
      !AUTH_REDIRECT_EXEMPT_PATHS.includes(error.config?.url ?? "")
    ) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// The envelope every successful backend response follows (see
// backend/src/common/interceptors/response.interceptor.ts). apiFetch always
// throws on a {success:false, ...} error response (see below), so callers
// only ever see the success shape.
export type ApiSuccess<T> = { success: true; data: T };

// On a validation failure, backend/src/common/filters/http-exception.filter.ts
// puts class-validator's per-field messages in `errors` and a generic
// "Validation failed" in `message`. Plain `Error` (below) only ever kept
// `message`, so callers had no way to map a specific message back onto the
// form field it concerns — ApiError carries `errors` through instead.
// Still an instanceof Error, so every existing `catch` block is unaffected.
export class ApiError extends Error {
  errors: string[];

  constructor(message: string, errors: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.errors = errors;
  }
}

// T defaults to `any` (not `unknown`) so existing untyped call sites
// (`apiFetch("/path")`) keep working without every caller needing to
// annotate a type — pass `apiFetch<MyDataType>("/path")` to get `res.data`
// typed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<ApiSuccess<T>> {
  try {
    const response = await apiClient.request<ApiSuccess<T>>({
      url: path,
      method: options.method as Method | undefined,
      data: options.body,
      headers: options.headers as Record<string, string> | undefined,
    });
    return response.data;
  } catch (err) {
    if (isAxiosError(err)) {
      const body = err.response?.data as
        | { message?: string; errors?: string[] }
        | undefined;
      throw new ApiError(body?.message || "Request failed", body?.errors ?? []);
    }
    throw err;
  }
}
