import type { ChangelogEntry } from "@/features/changelog/types/changelog";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const res = await apiClient.get<ApiSuccess<ChangelogEntry[]>>("/changelog");
  return res.data.data;
}

// null when the repository has no PR merged into main.
export async function syncChangelog(
  repo: string,
): Promise<ChangelogEntry | null> {
  const res = await apiClient.post<ApiSuccess<ChangelogEntry | null>>(
    "/changelog/sync",
    { repo },
  );
  return res.data.data;
}
