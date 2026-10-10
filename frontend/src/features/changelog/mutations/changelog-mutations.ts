import { syncChangelog } from "@/services/api/changelog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { changelogKeys } from "../queries/changelog-queries";

// Only a success refreshes the list. A failure changes nothing, so the stored
// entries stay on screen next to the error message.
export function useSyncChangelog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncChangelog,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: changelogKeys.all() }),
  });
}
