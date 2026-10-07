import { Platform } from 'react-native';
import { parseServiceHost, resolveServiceApiUrl } from '@shared/safe';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { normalizeServerUrl, resolveRuntimeApiUrl } from './serverUrl';

/**
 * Where the app finds its clinic server.
 *
 *  - Native (phone/tablet): the clinic enters the server address once ("http://192.168.1.20:5245"); it is remembered
 *    on the device. `EXPO_PUBLIC_CLINIC_API_URL` can pre-seed it for managed builds.
 *  - Web, on-prem: served by the clinic's own web container, which publishes `/config.json` (same-origin `/api`),
 *    so the same static build runs on any LAN without a rebuild.
 *  - Web, cloud: `EXPO_PUBLIC_CLINIC_API_URL`, or derived from the workspace host.
 */
const SERVER_URL_KEY = 'clinicez.serverUrl';
const DEFAULT_OFFLINE_GRACE_HOURS = 12;

export interface RuntimeConfig {
  apiUrl: string | null;
  workspaceRequired: boolean | null;
  offlineGraceHours: number | null;
}

let runtime: RuntimeConfig = { apiUrl: null, workspaceRequired: null, offlineGraceHours: null };

const isNative = Platform.OS !== 'web';

function pageOrigin(): string | null {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  } catch {
    // ignore
  }
  return null;
}

function toHours(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Loads the optional web `config.json` published next to the app. Safe to call on every platform and never throws:
 * a missing file (or an HTML fallback page) simply leaves the build-time defaults in place.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (isNative || typeof fetch === 'undefined') return runtime;
  try {
    const response = await fetch('/config.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.includes('json')) {
      const json = (await response.json()) as Record<string, unknown>;
      runtime = {
        apiUrl: 'apiUrl' in json ? resolveRuntimeApiUrl(json.apiUrl, pageOrigin()) : null,
        workspaceRequired: typeof json.workspaceRequired === 'boolean' ? json.workspaceRequired : null,
        offlineGraceHours: toHours(json.offlineGraceHours),
      };
    }
  } catch {
    // Offline or no config file - keep defaults.
  }
  return runtime;
}

function envApiUrl(): string | null {
  // Literal `process.env.EXPO_PUBLIC_*` reads so Metro inlines them at build time.
  return normalizeServerUrl(process.env.EXPO_PUBLIC_CLINIC_API_URL);
}

function derivedWebApiUrl(): string {
  const hasLocation = typeof window !== 'undefined' && !!window.location?.hostname;
  return resolveServiceApiUrl({
    hostname: hasLocation ? window.location.hostname : null,
    protocol: hasLocation ? window.location.protocol : null,
    serviceSubdomain: process.env.EXPO_PUBLIC_SERVICE_SUBDOMAIN,
    baseDomain: process.env.EXPO_PUBLIC_BASE_DOMAIN,
    template: process.env.EXPO_PUBLIC_API_URL_TEMPLATE,
    fallbackPort: 5245,
  }).replace(/\/+$/, '');
}

/** Server address the user entered on this device (native only). */
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

/** Origin of the clinic API (without `/api/v1`), or `null` while a native device has not been pointed at a server. */
export function getApiBaseUrl(): string | null {
  if (isNative) return getStoredServerUrl() ?? envApiUrl();
  return runtime.apiUrl ?? envApiUrl() ?? derivedWebApiUrl();
}


export function isServerConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

/** Whether users must pick a cloud workspace (multi-tenant SaaS host) before signing in. */
export function isWorkspaceRequired(): boolean {
  if (isNative) return false;
  if (runtime.workspaceRequired !== null) return runtime.workspaceRequired;
  if (process.env.EXPO_PUBLIC_BASE_DOMAIN) return true;
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : '';
  const service = (process.env.EXPO_PUBLIC_SERVICE_SUBDOMAIN || 'clinic').trim().toLowerCase();
  return !!hostname && parseServiceHost(hostname, service) !== null;
}

/** How long a native device may keep working offline on a cached session before it must reach the server again. */
export function getOfflineGraceHours(): number {
  return runtime.offlineGraceHours ?? toHours(process.env.EXPO_PUBLIC_OFFLINE_GRACE_HOURS) ?? DEFAULT_OFFLINE_GRACE_HOURS;
}
