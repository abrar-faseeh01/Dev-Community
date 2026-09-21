import { deleteUser } from "@/services/api/users";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { userKeys } from "../queries/user-queries";
import type { AdminUser } from "../types/admin-user";

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      deleteUser(id, reason),
    // Drop the row from the cached list instead of refetching it.
    onSuccess: (_data, { id }) => {
      queryClient.setQueryData<AdminUser[]>(userKeys.list(), (users) =>
        users?.filter((u) => u.id !== id),
      );
    },
  });
}
