import axios from 'axios';

export const apiBaseUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_API_URL) || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

let isInterceptorSetup = false;

/**
 * Configures Axios interceptors to attach Clerk token on requests.
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
        console.error('Error retrieving Clerk token', error);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.warn('Unauthorized administrative request, session may be invalid or expired.');
      }

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
