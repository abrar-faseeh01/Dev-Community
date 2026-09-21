import { getAuditLog } from "@/services/api/audit";
import { useQuery } from "@tanstack/react-query";

export const auditKeys = {
  log: () => ["audit", "log"] as const,
};

// Refetched on every visit (staleTime 0): the log grows whenever any admin
// acts, so a cached copy would quietly hide the newest entries.
export function useAuditLog(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: auditKeys.log(),
    queryFn: getAuditLog,
    enabled: options.enabled,
    staleTime: 0,
  });
}
