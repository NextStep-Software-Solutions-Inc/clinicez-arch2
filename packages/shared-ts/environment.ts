import { parseServiceHost } from './apiUrl';

export interface DevEnvironmentSignals {
  /** Explicit environment override (e.g. `EXPO_PUBLIC_APP_ENV`: `'development' | 'production' | 'staging'`). */
  appEnv?: string | null;
  /** Vercel environment marker (e.g. `EXPO_PUBLIC_VERCEL_ENV`: `'development' | 'preview' | 'production'`). */
  vercelEnv?: string | null;
  /** Bundler dev flag (`__DEV__`). */
  isDevBundle?: boolean;
  /** Node environment (`process.env.NODE_ENV`). */
  nodeEnv?: string | null;
  /** Current browser hostname (`window.location.hostname`). */
  hostname?: string | null;
  /** Service subdomain used by this app (defaults to `'clinic'`). */
  serviceSubdomain?: string | null;
  /** Configured base domain (`EXPO_PUBLIC_BASE_DOMAIN`). */
  baseDomain?: string | null;
  /** Resolved API base URL (`getApiBaseUrl()`). */
  apiBaseUrl?: string | null;
  /** Raw configured API URL (`EXPO_PUBLIC_CLINIC_API_URL`), used to detect same-origin `'/'` on-prem proxies. */
  configuredApiUrl?: string | null;
}

const DEV_DOMAIN_TOKEN_REGEX = /(^|[.-])(dev|development)([.-]|$)/i;

function extractHost(urlOrHost?: string | null): string {
  const raw = (urlOrHost ?? '').trim();
  if (!raw || raw === '/') return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
    } catch {
      return '';
    }
  }

  const withoutPath = raw.split('/')[0] ?? '';
  let host = withoutPath.toLowerCase();
  if (host.startsWith('[')) {
    host = host.replace(/\]:\d+$/, ']');
  } else if ((host.match(/:/g)?.length ?? 0) === 1) {
    host = host.replace(/:\d+$/, '');
  }
  return host.replace(/^\.+|\.+$/g, '');
}

function isLoopbackHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host.startsWith('127.') ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '[::1]' ||
    host === 'lvh.me' ||
    host.endsWith('.lvh.me')
  );
}

function hasDevDomainToken(host: string): boolean {
  return Boolean(host) && DEV_DOMAIN_TOKEN_REGEX.test(host);
}

/**
 * Fail-closed classifier determining whether the clinic app is running in a development environment.
 * Returns `false` in production, staging, and on-premise LAN/Edge deployments unless explicit dev signals are present.
 */
export function isDevelopmentEnvironment(signals: DevEnvironmentSignals = {}): boolean {
  // 1. Explicit environment override wins
  const appEnv = (signals.appEnv ?? '').trim().toLowerCase();
  if (appEnv === 'production' || appEnv === 'prod' || appEnv === 'staging' || appEnv === 'stage') {
    return false;
  }
  if (appEnv === 'development' || appEnv === 'dev' || appEnv === 'local') {
    return true;
  }

  // 2. Explicit Vercel environment override
  const vercelEnv = (signals.vercelEnv ?? '').trim().toLowerCase();
  if (vercelEnv === 'production') {
    return false;
  }
  if (vercelEnv === 'development' || vercelEnv === 'preview') {
    return true;
  }

  // 3. Bundler development mode (__DEV__ or NODE_ENV === 'development')
  if (signals.isDevBundle === true || (signals.nodeEnv ?? '').trim().toLowerCase() === 'development') {
    return true;
  }

  // 4. Configured base domain & API base URL signals
  const baseDomainHost = extractHost(signals.baseDomain);
  if (hasDevDomainToken(baseDomainHost)) {
    return true;
  }

  const isSameOriginProxy = (signals.configuredApiUrl ?? '').trim() === '/';
  const apiHost = extractHost(signals.apiBaseUrl);
  if (apiHost) {
    if (hasDevDomainToken(apiHost)) {
      return true;
    }
    if (!isSameOriginProxy && isLoopbackHost(apiHost)) {
      return true;
    }
  }

  // 5. Browser hostname signals (stripping <facility>.<service>. so facility slugs like `dev-medical` do not false-positive)
  const pageHost = extractHost(signals.hostname);
  if (pageHost) {
    const serviceSubdomain = (signals.serviceSubdomain ?? 'clinic').trim().toLowerCase() || 'clinic';
    const serviceParts = parseServiceHost(pageHost, serviceSubdomain);
    const effectiveDomain = serviceParts ? serviceParts.baseDomain : pageHost;

    if (hasDevDomainToken(effectiveDomain)) {
      return true;
    }

    const hasExplicitNonDevTarget =
      (Boolean(baseDomainHost) && !hasDevDomainToken(baseDomainHost) && !isLoopbackHost(baseDomainHost)) ||
      (Boolean(apiHost) &&
        !isSameOriginProxy &&
        !hasDevDomainToken(apiHost) &&
        !isLoopbackHost(apiHost) &&
        !apiHost.endsWith('.vercel.app'));

    if (pageHost.endsWith('.vercel.app') && !hasExplicitNonDevTarget) {
      return true;
    }

    if (!isSameOriginProxy && isLoopbackHost(pageHost) && !hasExplicitNonDevTarget) {
      return true;
    }
  }

  return false;
}
