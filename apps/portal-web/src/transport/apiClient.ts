import axios from "axios";
import { ensureApiPrefix } from "@shared/safe";

// Create the Axios instance
export const apiClient = axios.create({
  baseURL: ensureApiPrefix(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1"),
  headers: {
    "Content-Type": "application/json",
  },
});

// A variable to track if interceptors have been setup to avoid duplicates
let isInterceptorSetup = false;

/**
 * Configures the Axios interceptors to automatically attach the Clerk token.
 * This should be called once from a Client Component that has access to Clerk's useAuth().
 */
export const setupAxiosInterceptors = (getToken: () => Promise<string | null>) => {
  if (isInterceptorSetup) return;

  apiClient.interceptors.request.use(
    async (config) => {
      try {
        const token = await getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error("Error retrieving Clerk token", error);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      // Global error handling, e.g., logging out on 401
      if (error.response?.status === 401) {
        console.error("Unauthorized request, possibly expired token.");
        // We could redirect here if needed
      }

      // Extract our custom backend error message
      if (error.response?.data?.message) {
        error.message = error.response.data.message;
      } else if (error.response?.data?.errors?.[0]?.message) {
        error.message = error.response.data.errors[0].message;
      }

      return Promise.reject(error);
    }
  );

  isInterceptorSetup = true;
};
