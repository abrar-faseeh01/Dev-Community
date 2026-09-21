import { ROUTES } from "@/constants/routes";
import { isAxiosError, type AxiosInstance } from "axios";
import { ApiError } from "./api-error";

declare module "axios" {
  interface AxiosRequestConfig {
    // Opt a request out of the "401 means the session is dead, go to /login"
    // redirect, for calls where a 401 is an expected outcome the caller
    // already handles itself (see services/api/auth.ts).
    skipAuthRedirect?: boolean;
  }
}

// Every failure leaves here as an ApiError, so callers get the backend's own
// message (and per-field `errors`, and the HTTP `status`) instead of
// axios's generic ones.
export function attachInterceptors(client: AxiosInstance) {
  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (!isAxiosError(error)) return Promise.reject(error);

      if (
        typeof window !== "undefined" &&
        error.response?.status === 401 &&
        !error.config?.skipAuthRedirect
      ) {
        window.location.href = ROUTES.LOGIN;
      }

      const body = error.response?.data as
        | { message?: string; errors?: string[] }
        | undefined;
      return Promise.reject(
        new ApiError(
          body?.message || "Request failed",
          body?.errors ?? [],
          error.response?.status,
        ),
      );
    },
  );
}
