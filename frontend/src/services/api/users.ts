import type { AdminUser } from "@/features/users/types/admin-user";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export async function getUsers(): Promise<AdminUser[]> {
  const res = await apiClient.get<ApiSuccess<AdminUser[]>>("/users");
  return res.data.data;
}

// Admin only. Admin accounts can't be deleted (the API answers 403).
export async function deleteUser(id: string, reason?: string): Promise<void> {
  await apiClient.delete(`/users/${id}`, { data: { reason } });
}
