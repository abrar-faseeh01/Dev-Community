import { apiClient } from "@/lib/axios/client";
import type { ApiSuccess } from "@/types/api";

export type HealthData = { api: string; database: string };

export async function getHealth(): Promise<HealthData> {
  const res = await apiClient.get<ApiSuccess<HealthData>>("/health");
  return res.data.data;
}
