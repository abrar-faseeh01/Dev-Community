import { markNotificationRead } from "@/services/api/notifications";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationKeys } from "../queries/notification-queries";
import type { NotificationItem } from "../types/notification";

// On success the notification turns read in the cached list and the badge
// drops by one. On failure nothing changes, so it stays unread in the UI —
// no silent lie.
export function useMarkNotificationRead(userId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: (_data, id) => {
      queryClient.setQueryData<NotificationItem[]>(
        notificationKeys.list(userId),
        (list) => list?.map((n) => (n._id === id ? { ...n, read: true } : n)),
      );
      queryClient.setQueryData<number>(
        notificationKeys.unreadCount(userId),
        (count) => Math.max(0, (count ?? 0) - 1),
      );
    },
  });
}
