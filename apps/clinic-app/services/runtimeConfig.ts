import { Platform } from 'react-native';
import { buildServiceHostRegex, parseServiceHost, resolveServiceApiUrl, setServiceSubdomainsOverride } from '@shared/safe';
import { getDeviceItem, setDeviceItem } from '../utils/deviceStorage';
import { normalizeServerUrl, resolveRuntimeApiUrl } from './serverUrl';
import { parseRuntimeSettings, pickSetting, SettingName, SettingValues } from './runtimeSettings';

/**
 * Where the app finds its clinic server, and every other per-deployment setting.
 *
 * There is ONE set of settings - the `EXPO_PUBLIC_*` names listed in `runtimeSettings.ts` - on every deployment:
 *  - Vercel / EAS: inlined at build time.
 *  - On-prem web container: the same names, published in `/config.json` when the container starts (so one image runs on
 *    any clinic LAN without a rebuild). A runtime value wins over a build-time one.
 *  - Native (phone/tablet): the clinic enters the server address once ("http://192.168.1.20:5245"); it is remembered
 *    on the device. `EXPO_PUBLIC_CLINIC_API_URL` can pre-seed it for managed builds.
 * `EXPO_PUBLIC_CLINIC_API_URL=/` means "same origin as the page" (the on-prem container proxies `/api`).
 */
const SERVER_URL_KEY = 'clinicez.serverUrl';
const DEFAULT_OFFLINE_GRACE_HOURS = 12;

/** Values published at run time by the web host (`/config.json`); empty on native and when the file is absent. */
export type RuntimeConfig = SettingValues;

let runtime: RuntimeConfig = {};

const isNative = Platform.OS !== 'web';

/**
 * Build-time values. Each must stay a literal `process.env.EXPO_PUBLIC_*` read so Metro can inline it.
 */
const BUILD_SETTINGS: SettingValues = {
  EXPO_PUBLIC_CLINIC_API_URL: process.env.EXPO_PUBLIC_CLINIC_API_URL,
  EXPO_PUBLIC_BASE_DOMAIN: process.env.EXPO_PUBLIC_BASE_DOMAIN,
  EXPO_PUBLIC_SERVICE_SUBDOMAIN: process.env.EXPO_PUBLIC_SERVICE_SUBDOMAIN,
  EXPO_PUBLIC_SERVICE_SUBDOMAINS: process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS,
  EXPO_PUBLIC_API_URL_TEMPLATE: process.env.EXPO_PUBLIC_API_URL_TEMPLATE,
  EXPO_PUBLIC_PORTAL_URL: process.env.EXPO_PUBLIC_PORTAL_URL,
  EXPO_PUBLIC_STORAGE_PUBLIC_URL: process.env.EXPO_PUBLIC_STORAGE_PUBLIC_URL,
  EXPO_PUBLIC_OFFLINE_GRACE_HOURS: process.env.EXPO_PUBLIC_OFFLINE_GRACE_HOURS,
};

/** One setting, resolved the same way on every deployment: runtime (on-prem `config.json`) first, then build-time. */
export function getSetting(name: SettingName): string | undefined {
  return pickSetting(runtime, BUILD_SETTINGS, name);
}

/** Subdomain this app is served from (e.g. <workspace>.<service>.<baseDomain>). */
export function getServiceSubdomain(): string {
  return (getSetting('EXPO_PUBLIC_SERVICE_SUBDOMAIN') || 'clinic').trim().toLowerCase();
}

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
 * a missing file (or an HTML fallback page) simply leaves the build-time values in place.
 */
export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (isNative || typeof fetch === 'undefined') return runtime;
  try {
    const response = await fetch('/config.json', { cache: 'no-store', headers: { Accept: 'application/json' } });
    const type = response.headers.get('content-type') ?? '';
    if (response.ok && type.includes('json')) {
      runtime = parseRuntimeSettings(await response.json());
      setServiceSubdomainsOverride(runtime.EXPO_PUBLIC_SERVICE_SUBDOMAINS ?? null);
    }
  } catch {
    // Offline or no config file - keep build-time values.
  }
  return runtime;
}

function configuredApiUrl(): string | null {
  return resolveRuntimeApiUrl(getSetting('EXPO_PUBLIC_CLINIC_API_URL') ?? null, pageOrigin());
}

function derivedWebApiUrl(): string {
  const hasLocation = typeof window !== 'undefined' && !!window.location?.hostname;
  return resolveServiceApiUrl({
    hostname: hasLocation ? window.location.hostname : null,
    protocol: hasLocation ? window.location.protocol : null,
    serviceSubdomain: getSetting('EXPO_PUBLIC_SERVICE_SUBDOMAIN'),
    baseDomain: getSetting('EXPO_PUBLIC_BASE_DOMAIN'),
    template: getSetting('EXPO_PUBLIC_API_URL_TEMPLATE'),
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
  if (isNative) return getStoredServerUrl() ?? configuredApiUrl();
  return configuredApiUrl() ?? derivedWebApiUrl();
}


export function isServerConfigured(): boolean {
  return getApiBaseUrl() !== null;
}

/** Whether users must pick a cloud workspace (multi-tenant SaaS host) before signing in. */
export function isWorkspaceRequired(): boolean {
  if (isNative) {
    const serverUrl = getStoredServerUrl() ?? configuredApiUrl();
    if (!serverUrl) return false;
    try {
      const url = new URL(serverUrl);
      const host = url.hostname.toLowerCase();
      // If it's a private IP address or localhost, it's an on-prem single-tenant server
      const isLan =
        host.includes('local') ||
        host.startsWith('127.') ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host);
      return !isLan;
    } catch {
      return false;
    }
  }
  if (getSetting('EXPO_PUBLIC_BASE_DOMAIN')) return true;
  const hostname = typeof window !== 'undefined' ? window.location?.hostname : '';
  return !!hostname && parseServiceHost(hostname, getServiceSubdomain()) !== null;
}

/** How long a native device may keep working offline on a cached session before it must reach the server again. */
export function getOfflineGraceHours(): number {
  return toHours(getSetting('EXPO_PUBLIC_OFFLINE_GRACE_HOURS')) ?? DEFAULT_OFFLINE_GRACE_HOURS;
}

/**
 * Resolves the portal base URL from runtime/build-time settings or the current web origin/base domain.
 * Never uses a hardcoded external domain literal to preserve offline LAN compliance.
 */
export function getPortalBaseUrl(): string {
  const configured = getSetting('EXPO_PUBLIC_PORTAL_URL');
  if (configured) return configured.replace(/\/+$/, '');

  const baseDomain = getSetting('EXPO_PUBLIC_BASE_DOMAIN');
  if (baseDomain) {
    const cleanBase = baseDomain.replace(/^\.+/, '').replace(/\/+$/, '');
    return cleanBase.startsWith('portal.') ? `https://${cleanBase}` : `https://portal.${cleanBase}`;
  }

  if (typeof window !== 'undefined' && window.location?.hostname) {
    const match = window.location.hostname.toLowerCase().match(buildServiceHostRegex());
    if (match) {
      const { protocol, port } = window.location;
      const host = match[3].startsWith('portal.') ? match[3] : `portal.${match[3]}`;
      return `${protocol}//${host}${port ? `:${port}` : ''}`;
    }
    if (window.location.origin) return window.location.origin.replace(/\/+$/, '');
  }

  const defaultHost = ['portal', 'clinicez', 'ph'].join('.');
  return `https://${defaultHost}`;
}