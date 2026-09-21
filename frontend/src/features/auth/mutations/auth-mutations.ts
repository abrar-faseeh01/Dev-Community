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

export function useLogin() {
  const setCurrentUser = useSetCurrentUser();
  return useMutation({ mutationFn: login, onSuccess: setCurrentUser });
}

export function useSignup() {
  const setCurrentUser = useSetCurrentUser();
  return useMutation({
    mutationFn: async (payload: SignupPayload) => {
      await signup(payload);
      // Sign the new account straight in.
      return login({ email: payload.email, password: payload.password });
    },
    onSuccess: setCurrentUser,
  });
}

export function useLogout() {
  const router = useRouter();
  const setCurrentUser = useSetCurrentUser();
  return useMutation({
    mutationFn: logout,
    // Always clear the local session and leave, even if the request itself
    // failed (e.g. a network error) — logging out must never leave the UI
    // stuck looking signed in.
    onSettled: () => {
      setCurrentUser(null);
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
