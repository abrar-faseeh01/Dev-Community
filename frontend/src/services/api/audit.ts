import type { AuditLogEntry } from "@/features/audit/types/audit";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const res = await apiClient.get<ApiSuccess<AuditLogEntry[]>>(
    "/admin/audit-log",
  );
  return res.data.data;
}
