import type { AuthUser } from "@/features/auth/types/user";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

// Endpoints where a 401 is an expected, routine outcome — not a dead
// session — and is already handled locally by the caller:
// - GET /auth/me: how the app learns "nobody's logged in" on mount, fired
//   on every page (including /login and /signup) whether or not anyone is
//   signed in.
// - POST /auth/login: a wrong password also 401s; the login form shows that
//   inline rather than navigating away.
// - POST /auth/signup: same reasoning as login.
// A blanket redirect on any 401 would force-navigate anonymous visitors off
// public pages and away from a failed login attempt, and would infinite-loop
// on /login and /signup for anyone not signed in (each mount re-checks
// /auth/me, gets 401, "redirects" to the page it's already on, which reloads
// and repeats).
const expected401 = { skipAuthRedirect: true };

export type LoginPayload = { email: string; password: string };
export type SignupPayload = LoginPayload & { fullName: string };
export type UpdateCredentialsPayload = {
  currentPassword: string;
  newFullName?: string;
  newEmail?: string;
  newPassword?: string;
};

export async function getMe(): Promise<AuthUser> {
  const res = await apiClient.get<ApiSuccess<AuthUser>>("/auth/me", expected401);
  return res.data.data;
}

export async function login(payload: LoginPayload): Promise<AuthUser> {
  const res = await apiClient.post<ApiSuccess<AuthUser>>(
    "/auth/login",
    payload,
    expected401,
  );
  return res.data.data;
}

export async function signup(payload: SignupPayload): Promise<void> {
  await apiClient.post("/auth/signup", payload, expected401);
}

export async function logout(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function updateCredentials(
  payload: UpdateCredentialsPayload,
): Promise<AuthUser> {
  const res = await apiClient.patch<ApiSuccess<AuthUser>>("/auth/me", payload);
  return res.data.data;
}
