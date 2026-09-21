import type { NotificationItem } from "@/features/notifications/types/notification";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export async function getUnreadCount(): Promise<number> {
  const res = await apiClient.get<ApiSuccess<number>>(
    "/notifications/unread-count",
  );
  return res.data.data;
}

export async function getNotifications(): Promise<NotificationItem[]> {
  const res = await apiClient.get<ApiSuccess<NotificationItem[]>>(
    "/notifications",
  );
  return res.data.data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.patch(`/notifications/${id}/read`);
}
