import type { Profile } from "@/features/profile/types/profile";
import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

// Every write below takes an optional `reason`: only an admin editing
// someone else's profile ever sets it, and it lands in the audit log.
type WithReason = { reason?: string };

export type PortfolioProjectPayload = {
  title: string;
  description?: string;
  liveUrl: string;
  githubUrl: string;
  technologies: string[];
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
};

export type ExperiencePayload = {
  title: string;
  company: string;
  from: string;
  to?: string;
  description?: string;
} & WithReason;

export async function getProfile(id: string): Promise<Profile> {
  const res = await apiClient.get<ApiSuccess<Profile>>(`/profile/${id}`);
  return res.data.data;
}

async function patchSection(
  id: string,
  section: string,
  payload: object,
): Promise<Profile> {
  const res = await apiClient.patch<ApiSuccess<Profile>>(
    `/profile/${id}/${section}`,
    payload,
  );
  return res.data.data;
}

export const updateHeadline = (id: string, payload: { headline: string } & WithReason) =>
  patchSection(id, "headline", payload);

export const updateBio = (id: string, payload: { bio: string } & WithReason) =>
  patchSection(id, "bio", payload);

export const updateSkills = (id: string, payload: { skills: string[] } & WithReason) =>
  patchSection(id, "skills", payload);

export const updatePortfolioProjects = (
  id: string,
  payload: { portfolioProjects: PortfolioProjectPayload[] } & WithReason,
) => patchSection(id, "portfolio-projects", payload);

export async function addExperience(
  id: string,
  payload: ExperiencePayload,
): Promise<Profile> {
  const res = await apiClient.post<ApiSuccess<Profile>>(
    `/profile/${id}/experiences`,
    payload,
  );
  return res.data.data;
}

export async function updateExperience(
  id: string,
  experienceId: string,
  payload: ExperiencePayload,
): Promise<Profile> {
  const res = await apiClient.patch<ApiSuccess<Profile>>(
    `/profile/${id}/experiences/${experienceId}`,
    payload,
  );
  return res.data.data;
}

export async function removeExperience(
  id: string,
  experienceId: string,
  reason?: string,
): Promise<Profile> {
  const res = await apiClient.delete<ApiSuccess<Profile>>(
    `/profile/${id}/experiences/${experienceId}`,
    { data: { reason } },
  );
  return res.data.data;
}
