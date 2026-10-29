import axios from 'axios';

export function ensureApiPrefix(url?: string | null, prefix: string = '/api/v1'): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const deduped = trimmed.replace(/(?:\/api\/v1)+$/i, '');
  return `${deduped}${prefix}`;
}

export const apiBaseUrl = ensureApiPrefix(
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_API_URL) ||
    'http://localhost:5000/api/v1'
);

export const apiClient = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

let currentTokenGetter: (() => Promise<string | null>) | null = null;
let isInterceptorSetup = false;

async function resolveAuthToken(): Promise<string | null> {
  if (currentTokenGetter) {
    try {
      const token = await currentTokenGetter();
      if (token) return token;
    } catch (error) {
      console.error('Error retrieving Clerk token from active auth provider', error);
    }
  }

  // Fallback to global Clerk browser SDK session when available
  if (typeof window !== 'undefined') {
    const clerkGlobal = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;
    if (clerkGlobal?.session?.getToken) {
      try {
        const fallbackToken = await clerkGlobal.session.getToken();
        if (fallbackToken) return fallbackToken;
      } catch (error) {
        console.error('Error retrieving Clerk token from window.Clerk.session', error);
      }
    }
  }

  return null;
}

/**
 * Configures Axios interceptors to attach the live Clerk Bearer token on every request.
 * Safe to invoke on every render: updates the active getToken reference without duplicating interceptors.
 */
export const setupAxiosInterceptors = (getToken: () => Promise<string | null>) => {
  currentTokenGetter = getToken;

  if (isInterceptorSetup) return;

  apiClient.interceptors.request.use(
    async (config) => {
      const token = await resolveAuthToken();
      if (token) {
        if (config.headers && typeof (config.headers as { set?: unknown }).set === 'function') {
          (config.headers as { set: (k: string, v: string) => void }).set(
            'Authorization',
            `Bearer ${token}`
          );
        } else {
          config.headers = (config.headers || {}) as typeof config.headers;
          (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        }
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
