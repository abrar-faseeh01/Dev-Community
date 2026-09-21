import { getHealth } from "@/services/api/health";
import { useQuery } from "@tanstack/react-query";

export const healthKeys = {
  status: () => ["health"] as const,
};

export function useHealth() {
  return useQuery({
    queryKey: healthKeys.status(),
    queryFn: getHealth,
  });
}
