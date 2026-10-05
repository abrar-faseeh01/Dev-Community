import type { AuthUser } from "@/features/auth/types/user";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

// How a 401 is handled for the auth endpoints (see lib/axios/interceptors.ts,
// which refreshes the session and retries once on a 401 and sends the visitor
// to /login if that fails). Two flags opt a call out of that:
//
// - GET /auth/me: how the app learns "nobody's logged in" on mount, fired on
//   every page (including /login and /signup) whether or not anyone is signed
//   in. A 401 here is routine and handled by the caller (useCurrentUser turns
//   it into "no user"), so it never redirects. It DOES try a refresh: a visitor
//   whose 15-minute access token lapsed while the tab was closed is still
//   signed in through the refresh cookie.
// - POST /auth/login and /auth/signup: a wrong password also 401s, and refreshing
//   can never fix that, so these neither redirect (the form shows the error
//   inline instead of navigating away) nor refresh.
//
// A blanket redirect on any 401 would force-navigate anonymous visitors off
// public pages and away from a failed login attempt, and would infinite-loop
// on /login and /signup for anyone not signed in (each mount re-checks
// /auth/me, gets 401, "redirects" to the page it's already on, which reloads
// and repeats).
const expected401 = { skipAuthRedirect: true };
const credentialCheck = { skipAuthRedirect: true, skipAuthRefresh: true };

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
    credentialCheck,
  );
  return res.data.data;
}

export async function signup(payload: SignupPayload): Promise<void> {
  await apiClient.post("/auth/signup", payload, credentialCheck);
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
