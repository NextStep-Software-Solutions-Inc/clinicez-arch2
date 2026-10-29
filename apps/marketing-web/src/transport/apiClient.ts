import axios from "axios";
import { getPortalApiUrl } from "@/utils/urls";

export const apiBaseUrl = getPortalApiUrl();

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = getPortalApiUrl();
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    } else if (error.response?.data?.errors?.[0]?.message) {
      error.message = error.response.data.errors[0].message;
    }
    return Promise.reject(error);
  }
);
