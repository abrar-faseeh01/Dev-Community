import { getChangelog } from "@/services/api/changelog";
import { useQuery } from "@tanstack/react-query";

export const changelogKeys = {
  all: () => ["changelog"] as const,
};

export function useChangelog(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: changelogKeys.all(),
    queryFn: getChangelog,
    enabled: options.enabled,
  });
}
