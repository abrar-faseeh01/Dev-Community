import { getProfile } from "@/services/api/profile";
import { useQuery } from "@tanstack/react-query";

export const profileKeys = {
  // One shared entry per profile: the view page and both edit pages read it,
  // and every save writes the server's fresh response straight back into it
  // (see profile-mutations.ts), so navigating between them shows saved data
  // from cache — no stale flash, no extra round trip.
  detail: (id: string) => ["profile", id] as const,
};

export function useProfile(id: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: profileKeys.detail(id),
    queryFn: () => getProfile(id),
    enabled: options.enabled,
  });
}
