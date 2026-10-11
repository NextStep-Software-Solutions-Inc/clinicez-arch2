import { Platform } from 'react-native';
import { ensureApiPrefix } from '@shared/safe';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { normalizeServerUrl } from './serverUrl';

/**
 * Where the laboratory API lives. Resolution order on the web:
 *  1. `/config.json` published next to the web build at run time (`EXPO_PUBLIC_LAB_API_URL`),
 *  2. the build-time `EXPO_PUBLIC_LAB_API_URL`,
 *  3. local development: the page's own host on the dev port 5245,
 *  4. otherwise the page's own origin (an ingress that proxies `/api`).
 * The value `/` explicitly means "same origin as the page".
 * On a phone/tablet the server address is entered once on the connection screen and saved on the device
 * (falling back to the build-time `EXPO_PUBLIC_LAB_API_URL`); there is no localhost fallback.
 */
const LAB_API_URL_KEY = 'EXPO_PUBLIC_LAB_API_URL';
const SERVER_URL_KEY = 'clinicez.lab.serverUrl';
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

/** The server a phone/tablet talks to: the address entered on the connection screen, else the build-time one. */
function nativeServerUrl(): string | null {
  return getStoredServerUrl() ?? normalizeServerUrl(runtimeUrl ?? readUrl(process.env.EXPO_PUBLIC_LAB_API_URL));
}

/** Base URL of the API including the `/api/v1` prefix. Resolved on every call, so it reflects `loadRuntimeConfig`. */
export function getLabApiBaseUrl(): string {
  if (isNative) {
    // A phone/tablet has no page origin, so there is no localhost/same-origin fallback.
    const server = nativeServerUrl();
    if (!server) throw new Error('The laboratory server address is not configured.');
    return ensureApiPrefix(server);
  }

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

/** The server address saved on this device (native only), or `null` when none was entered yet. */
export function getStoredServerUrl(): string | null {
  return normalizeServerUrl(getDeviceItem(SERVER_URL_KEY));
}

export function setStoredServerUrl(url: string | null): void {
  setDeviceItem(SERVER_URL_KEY, url);
}

/** Web always knows its server (config.json / same origin); a native device needs a saved or build-time address. */
export function isServerConfigured(): boolean {
  return !isNative || nativeServerUrl() !== null;
}
