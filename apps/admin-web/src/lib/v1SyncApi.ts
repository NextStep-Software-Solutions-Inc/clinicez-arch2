import axios from 'axios';

export function ensureV1SyncPrefix(url?: string | null): string {
  const trimmed = (url ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) return '/api/v1/v1-sync';
  const deduped = trimmed.replace(/(?:\/api\/v1\/v1-sync)+$/i, '');
  return `${deduped}/api/v1/v1-sync`;
}

export function resolveV1SyncBaseUrl(env?: Record<string, string | undefined>): string {
  const explicit = env?.VITE_V1_SYNC_API_URL?.trim();
  if (explicit) return ensureV1SyncPrefix(explicit);

  const portalApi = env?.VITE_PORTAL_API_URL?.trim();
  if (portalApi) {
    try {
      const parsed = new URL(portalApi);
      if (/^portal\./i.test(parsed.hostname)) {
        const host = parsed.hostname.replace(/^portal\./i, 'v1-sync.');
        return ensureV1SyncPrefix(
          `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}`
        );
      }
      if (/^clinicez-portal\./i.test(parsed.hostname)) {
        const host = parsed.hostname.replace(/^clinicez-portal\./i, 'clinicez-v1-sync.');
        return ensureV1SyncPrefix(
          `${parsed.protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}`
        );
      }
    } catch {
      // Relative or non-URL portal API — fall back to local proxy path
    }
  }

  return '/api/v1/v1-sync';
}

export const v1SyncBaseUrl = resolveV1SyncBaseUrl(
  typeof import.meta !== 'undefined'
    ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    : undefined
);

export const v1SyncClient = axios.create({
  baseURL: v1SyncBaseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

let tokenGetterRef: (() => Promise<string | null>) | null = null;
let isV1SyncInterceptorSetup = false;

async function resolveV1SyncAuthToken(): Promise<string | null> {
  if (tokenGetterRef) {
    try {
      const token = await tokenGetterRef();
      if (token) return token;
    } catch (err) {
      console.error('Error retrieving Clerk token for v1-sync-api', err);
    }
  }

  if (typeof window !== 'undefined') {
    const clerkGlobal = (window as unknown as { Clerk?: { session?: { getToken?: () => Promise<string | null> } } }).Clerk;
    if (clerkGlobal?.session?.getToken) {
      try {
        return await clerkGlobal.session.getToken();
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function setupV1SyncAxiosInterceptors(getToken: () => Promise<string | null>) {
  tokenGetterRef = getToken;
  if (isV1SyncInterceptorSetup) return;

  v1SyncClient.interceptors.request.use(
    async (config) => {
      const token = await resolveV1SyncAuthToken();
      if (token) {
        if (config.headers && typeof (config.headers as { set?: unknown }).set === 'function') {
          (config.headers as { set: (k: string, v: string) => void }).set('Authorization', `Bearer ${token}`);
        } else {
          config.headers = (config.headers || {}) as typeof config.headers;
          (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  v1SyncClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.data?.message) {
        error.message = error.response.data.message;
      }
      return Promise.reject(error);
    }
  );

  isV1SyncInterceptorSetup = true;
}
