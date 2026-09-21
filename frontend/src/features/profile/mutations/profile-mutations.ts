import {
  addExperience,
  removeExperience,
  updateBio,
  updateExperience,
  updateHeadline,
  updatePortfolioProjects,
  updateSkills,
  type ExperiencePayload,
} from "@/services/api/profile";
import { updateFullName } from "@/services/api/users";
import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { profileKeys } from "../queries/profile-queries";
import type { ProfileDetailsFormValues } from "../schemas/profile-details-schema";
import type { Profile } from "../types/profile";

// Every section saves on its own, immediately, and writes the server's fresh
// response back into the shared profile cache entry — so a save in one
// section is reflected everywhere else without a reload.
function useSetProfile(profileId: string) {
  const queryClient = useQueryClient();
  return (next: Profile) =>
    queryClient.setQueryData(profileKeys.detail(profileId), next);
}

type Callbacks<TData, TVars> = Pick<
  UseMutationOptions<TData, Error, TVars>,
  "onSuccess" | "onError"
>;

type DetailsSection = "headline" | "bio" | "skills" | "portfolioProjects";

export function useUpdateProfileDetails(
  profileId: string,
  options: Pick<
    Callbacks<Profile | null, unknown>,
    "onError"
  > = {},
) {
  const setProfile = useSetProfile(profileId);
  return useMutation({
    // Only the dirty sub-sections are sent, as separate PATCH calls —
    // sending all three on every save would fire near-identical
    // admin-override audit entries even when only one field changed.
    // Sequential (not Promise.all): if an earlier request fails, later ones
    // are simply never attempted, rather than leaving an ambiguous
    // partial-success state where some requests succeeded and others failed
    // concurrently.
    mutationFn: async ({
      values,
      dirty,
    }: {
      values: ProfileDetailsFormValues;
      dirty: Partial<Record<DetailsSection, unknown>>;
    }) => {
      const reason = values.reason.trim() || undefined;
      let latest: Profile | null = null;

      if (dirty.headline) {
        latest = await updateHeadline(profileId, {
          headline: values.headline,
          reason,
        });
      }
      if (dirty.bio) {
        latest = await updateBio(profileId, { bio: values.bio, reason });
      }
      if (dirty.skills) {
        latest = await updateSkills(profileId, {
          skills: values.skills,
          reason,
        });
      }
      if (dirty.portfolioProjects) {
        latest = await updatePortfolioProjects(profileId, {
          // Hand-picked fields, no _id — the backend DTO has no _id field
          // and the global ValidationPipe is forbidNonWhitelisted, so an
          // unstripped _id (present on every project the server returned)
          // would 400 the whole request.
          portfolioProjects: values.portfolioProjects.map((p) => ({
            title: p.title,
            description: p.description.trim() || undefined,
            liveUrl: p.liveUrl,
            githubUrl: p.githubUrl,
            technologies: p.technologies,
            startDate: p.startDate,
            endDate: p.isCurrent ? undefined : p.endDate,
            isCurrent: p.isCurrent,
          })),
          reason,
        });
      }
      return latest;
    },
    onSuccess: (latest) => {
      if (latest) setProfile(latest);
    },
    onError: options.onError,
  });
}

// Admin editing someone else's name only.
export function useUpdateFullName(profileId: string) {
  const setProfile = useSetProfile(profileId);
  return useMutation({
    mutationFn: (values: { fullName: string; reason?: string }) =>
      updateFullName(profileId, values),
    onSuccess: setProfile,
  });
}

export function useAddExperience(
  profileId: string,
  options: Pick<Callbacks<Profile, ExperiencePayload>, "onSuccess"> = {},
) {
  const setProfile = useSetProfile(profileId);
  return useMutation({
    mutationFn: (payload: ExperiencePayload) =>
      addExperience(profileId, payload),
    onSuccess: (...args) => {
      setProfile(args[0]);
      return options.onSuccess?.(...args);
    },
  });
}

type EditExperienceVars = { experienceId: string; payload: ExperiencePayload };

export function useUpdateExperience(
  profileId: string,
  options: Pick<Callbacks<Profile, EditExperienceVars>, "onSuccess"> = {},
) {
  const setProfile = useSetProfile(profileId);
  return useMutation({
    mutationFn: ({ experienceId, payload }: EditExperienceVars) =>
      updateExperience(profileId, experienceId, payload),
    onSuccess: (...args) => {
      setProfile(args[0]);
      return options.onSuccess?.(...args);
    },
  });
}

export function useDeleteExperience(profileId: string) {
  const setProfile = useSetProfile(profileId);
  return useMutation({
    mutationFn: ({
      experienceId,
      reason,
    }: {
      experienceId: string;
      reason?: string;
    }) => removeExperience(profileId, experienceId, reason),
    onSuccess: setProfile,
  });
}
