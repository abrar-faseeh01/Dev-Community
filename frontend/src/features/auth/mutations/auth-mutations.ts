import { ROUTES } from "@/constants/routes";
import {
  login,
  logout,
  signup,
  updateCredentials,
  type SignupPayload,
} from "@/services/api/auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authKeys } from "../queries/auth-queries";
import type { AuthUser } from "../types/user";

function useSetCurrentUser() {
  const queryClient = useQueryClient();
  return (user: AuthUser | null) => queryClient.setQueryData(authKeys.me, user);
}

// Login, signup, and logout change the signed-in user.
// Clear all non-auth cached data to prevent showing the previous user's data.
// Cancel old requests and refetch active queries for the new user.
// Reset happens before saving the new user, so stale data cannot be shown.
// useUpdateCredentials doesn't need this because it doesn't change the signed-in user.
function useChangeSession() {
  const queryClient = useQueryClient();
  const setCurrentUser = useSetCurrentUser();
  return (user: AuthUser | null) => {
    void queryClient.resetQueries({
      predicate: (query) => query.queryKey[0] !== authKeys.me[0],
    });
    setCurrentUser(user);
  };
}

export function useLogin() {
  const changeSession = useChangeSession();
  return useMutation({ mutationFn: login, onSuccess: changeSession });
}

export function useSignup() {
  const changeSession = useChangeSession();
  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      await signup(payload);
      // Sign the new account straight in.
      return login({ email: payload.email, password: payload.password });
    },
    onSuccess: changeSession,
  });
}

export function useLogout() {
  const router = useRouter();
  const changeSession = useChangeSession();
  return useMutation({
    mutationFn: logout,
    // Always clear the local session and leave, even if the request itself
    // failed (e.g. a network error) — logging out must never leave the UI
    // stuck looking signed in.
    onSettled: () => {
      changeSession(null);
      router.push(ROUTES.LOGIN);
    },
  });
}

export function useUpdateCredentials() {
  const setCurrentUser = useSetCurrentUser();
  return useMutation({
    mutationFn: updateCredentials,
    onSuccess: setCurrentUser,
  });
}
