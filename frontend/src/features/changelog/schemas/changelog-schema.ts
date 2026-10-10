import { z } from "zod";

// Same rule as REPO_PATTERN in backend/src/changelog/dto/sync-changelog.dto.ts.
// The backend is the authority; this only saves a round trip.
const REPO_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9._-]{1,100}$/;

export const syncChangelogSchema = z.object({
  repo: z
    .string()
    .trim()
    .min(1, "Repository is required")
    .regex(REPO_PATTERN, 'Use the form "owner/repo"'),
});

export type SyncChangelogValues = z.infer<typeof syncChangelogSchema>;
