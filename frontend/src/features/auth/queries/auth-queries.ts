import { getMe } from "@/services/api/auth";
import { useQuery } from "@tanstack/react-query";
import type { AuthUser } from "../types/user";

export const authKeys = {
  me: ["auth", "me"] as const,
};

// The current user, or null when nobody is signed in. Any failure of
// GET /auth/me (a 401, or the backend being down) means "no user" — the
// query itself never errors, so `data` is the whole answer. Fetched once and
// then kept: login/signup/logout/settings update it directly with
// setQueryData rather than refetching.
export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await getMe();
      } catch {
        return null;
      }
    },
    staleTime: Infinity,
    retry: false,
  });
}
