import { getUsers } from "@/services/api/users";
import { useQuery } from "@tanstack/react-query";

export const userKeys = {
  all: ["users"] as const,
  list: () => [...userKeys.all, "list"] as const,
};

// Refetched on every visit (staleTime 0), as the page always did — an admin
// list that shows yesterday's accounts would be worse than a short spinner.
export function useUsers(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: userKeys.list(),
    queryFn: getUsers,
    enabled: options.enabled,
    staleTime: 0,
  });
}
