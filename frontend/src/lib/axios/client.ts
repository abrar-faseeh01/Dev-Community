import { API_URL } from "@/constants/config";
import axios from "axios";
import { attachInterceptors } from "./interceptors";

// The one axios instance for every API call. Only services/api/* imports it.
export const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true, // sends the httpOnly access_token cookie
  headers: { "Content-Type": "application/json" },
});

attachInterceptors(apiClient);
