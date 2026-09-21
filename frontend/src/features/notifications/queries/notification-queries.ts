import {
  getNotifications,
  getUnreadCount,
} from "@/services/api/notifications";
import { useQuery } from "@tanstack/react-query";

// Keys include the user id, so signing in as someone else on the same tab
// never shows the previous user's cached notifications.
export const notificationKeys = {
  unreadCount: (userId: string) =>
    ["notifications", userId, "unread-count"] as const,
  list: (userId: string) => ["notifications", userId, "list"] as const,
};

// Polling over invalidating-on-navigation: this app has no websocket/push
// channel, and a user can easily sit on one page (e.g. editing a profile)
// long enough for a notification to arrive without ever navigating — route
// changes alone would miss that. 45s keeps the badge reasonably fresh
// without meaningfully denting the global rate limit (100 req/60s).
const UNREAD_POLL_INTERVAL_MS = 45_000;

// A failed badge refresh isn't worth surfacing an error for, so callers just
// read `data ?? 0` and ignore the error state.
export function useUnreadCount(userId: string) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(userId),
    queryFn: getUnreadCount,
    refetchInterval: UNREAD_POLL_INTERVAL_MS,
    staleTime: 0,
  });
}

// Loaded each time the panel opens (staleTime 0), not once per session.
export function useNotifications(userId: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: notificationKeys.list(userId),
    queryFn: getNotifications,
    enabled: options.enabled,
    staleTime: 0,
  });
}
