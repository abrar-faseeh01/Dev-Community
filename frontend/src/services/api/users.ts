import type { Profile } from "@/features/profile/types/profile";
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

// Admin changing someone else's name. Changing your own goes through
// PATCH /auth/me (services/api/auth.ts), which requires the current password.
export async function updateFullName(
  id: string,
  payload: { fullName: string; reason?: string },
): Promise<Profile> {
  const res = await apiClient.patch<ApiSuccess<Profile>>(
    `/users/${id}/fullname`,
    payload,
  );
  return res.data.data;
}
