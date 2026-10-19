import { Platform } from 'react-native';
import { ensureApiPrefix } from '@shared/safe';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { normalizeServerUrl } from './serverUrl';

/**
 * Where the pharmacy API lives. Resolution order:
 *  0. native phones/tablets: the server address entered once on the device (`EXPO_PUBLIC_PHARMACY_API_URL` pre-seeds it),
 *  1. `/config.json` published next to the web build at run time (`EXPO_PUBLIC_PHARMACY_API_URL`),
 *  2. the build-time `EXPO_PUBLIC_PHARMACY_API_URL`,
 *  3. local development: the page's own host on the dev port 5245,
 *  4. otherwise the page's own origin (an ingress that proxies `/api`).
 * The value `/` explicitly means "same origin as the page".
 */
const PHARMACY_API_URL_KEY = 'EXPO_PUBLIC_PHARMACY_API_URL';
const SERVER_URL_KEY = 'clinicez.pharmacy.serverUrl';
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
      runtimeUrl = readUrl((body as Record<string, unknown>)[PHARMACY_API_URL_KEY]);
    }
  } catch {
    // Offline or no config file - keep the build-time value.
  }
}

/** Server address entered on this device (native only), as a clean origin without `/api/v1`. */
export function getStoredServerUrl(): string | null {
  return normalizeServerUrl(getDeviceItem(SERVER_URL_KEY));
}

/** Saves (or clears with `null`) the server address entered on this device. */
export function setStoredServerUrl(url: string | null): string | null {
  if (url === null) {
    setDeviceItem(SERVER_URL_KEY, null);
    return null;
  }
  const normalized = normalizeServerUrl(url);
  if (!normalized) throw new Error('Enter a valid server address, for example 192.168.1.20:5245.');
  setDeviceItem(SERVER_URL_KEY, normalized);
  return normalized;
}

/**
 * Whether the app knows where its pharmacy server is. The web build always does (config.json, build-time value or the
 * page's own origin); a phone or tablet must be pointed at a server once, unless the build pre-seeds one.
 */
export function isServerConfigured(): boolean {
  if (!isNative) return true;
  return getStoredServerUrl() !== null || normalizeServerUrl(readUrl(process.env.EXPO_PUBLIC_PHARMACY_API_URL)) !== null;
}

/** Base URL of the API including the `/api/v1` prefix. Resolved on every call, so it reflects `loadRuntimeConfig`. */
export function getPharmacyApiBaseUrl(): string {
  if (isNative) {
    const native = getStoredServerUrl() ?? normalizeServerUrl(readUrl(process.env.EXPO_PUBLIC_PHARMACY_API_URL));
    if (native) return ensureApiPrefix(native);
  }

  const page = pageLocation();
  const configured = runtimeUrl ?? readUrl(process.env.EXPO_PUBLIC_PHARMACY_API_URL);

  if (configured === '/') {
    return ensureApiPrefix(page?.origin ?? `http://localhost:${DEV_PORT}`);
  }
  if (configured) return ensureApiPrefix(configured);
  if (page && isLocalHost(page.hostname)) return ensureApiPrefix(`${page.protocol}//${page.hostname}:${DEV_PORT}`);
  if (page) return ensureApiPrefix(page.origin);
  return ensureApiPrefix(`http://localhost:${DEV_PORT}`);
}
