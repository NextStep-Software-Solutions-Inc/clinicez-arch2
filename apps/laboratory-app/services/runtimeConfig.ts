import { Platform } from 'react-native';
import { ensureApiPrefix } from '@shared/safe';

/**
 * Where the laboratory API lives. Resolution order:
 *  1. `/config.json` published next to the web build at run time (`EXPO_PUBLIC_LAB_API_URL`),
 *  2. the build-time `EXPO_PUBLIC_LAB_API_URL`,
 *  3. local development: the page's own host on the dev port 5245,
 *  4. otherwise the page's own origin (an ingress that proxies `/api`).
 * The value `/` explicitly means "same origin as the page".
 */
const LAB_API_URL_KEY = 'EXPO_PUBLIC_LAB_API_URL';
const DEV_PORT = 5245;

let runtimeUrl: string | null = null;

const isNative = Platform.OS !== 'web';

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.lvh.me') ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
  );
}

function pageLocation(): { origin: string; hostname: string; protocol: string } | null {
  if (typeof window === 'undefined' || !window.location?.hostname) return null;
  return {
    origin: window.location.origin,
    hostname: window.location.hostname.toLowerCase(),
    protocol: window.location.protocol || 'http:',
  };
}

function readUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/** Loads the optional web `config.json`. Safe on every platform; a missing file leaves the build-time value in place. */
export async function loadRuntimeConfig(): Promise<void> {
  if (isNative || typeof fetch === 'undefined') return;
  try {
    const response = await fetch('/config.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.includes('json')) return;
    const body: unknown = await response.json();
    if (body && typeof body === 'object') {
      runtimeUrl = readUrl((body as Record<string, unknown>)[LAB_API_URL_KEY]);
    }
  } catch {
    // Offline or no config file - keep the build-time value.
  }
}

/** Base URL of the API including the `/api/v1` prefix. Resolved on every call, so it reflects `loadRuntimeConfig`. */
export function getLabApiBaseUrl(): string {
  const page = pageLocation();
  const configured = runtimeUrl ?? readUrl(process.env.EXPO_PUBLIC_LAB_API_URL);

  if (configured === '/') {
    return ensureApiPrefix(page?.origin ?? `http://localhost:${DEV_PORT}`);
  }
  if (configured) return ensureApiPrefix(configured);
  if (page && isLocalHost(page.hostname)) return ensureApiPrefix(`${page.protocol}//${page.hostname}:${DEV_PORT}`);
  if (page) return ensureApiPrefix(page.origin);
  return ensureApiPrefix(`http://localhost:${DEV_PORT}`);
}
