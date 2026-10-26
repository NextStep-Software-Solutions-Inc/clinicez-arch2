/**
 * Detects whether Vercel telemetry is permitted for the given host and environment.
 * Disables telemetry on on-premise private LANs, local IP ranges, and air-gapped hosts.
 */
export function isVercelTelemetryAllowed(
  hostname?: string | null,
  envOverride?: string | null
): boolean {
  if (envOverride === 'false') return false;
  if (envOverride === 'true') return true;

  const host = hostname?.trim().toLowerCase() || '';
  if (!host) return false;

  // Private LAN / loopback / local edge hosts
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.lvh.me') ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/.test(host) ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  ) {
    return false;
  }

  // Vercel platform domains
  if (host.endsWith('.vercel.app')) {
    return true;
  }

  return false;
}

/**
 * Canonical set of sensitive parameter keys matched case-insensitively.
 * Kept at module scope to avoid re-allocation per sanitizeAnalyticsUrl invocation.
 */
const SENSITIVE_PARAMS = new Set([
  'token',
  'code',
  'secret',
  'invite',
  'session',
  'signature',
  'sig',
  'ref',
  'key',
  'auth',
  'password',
  'pin',
]);

/**
 * Sanitizes URLs to remove sensitive healthcare tokens and credentials before sending to analytics.
 */
export function sanitizeAnalyticsUrl(rawUrl: string): string {
  try {
    const isAbsolute = /^https?:\/\//i.test(rawUrl);
    const parsed = new URL(rawUrl, 'https://app.clinicez.internal');

    const keysToRedact: string[] = [];
    for (const key of parsed.searchParams.keys()) {
      if (SENSITIVE_PARAMS.has(key.toLowerCase())) {
        keysToRedact.push(key);
      }
    }
    for (const key of keysToRedact) {
      parsed.searchParams.set(key, '[REDACTED]');
    }

    // 1) Redact 2-segment verify: /verify/{kind}/{token} -> /verify/{kind}/[REDACTED]
    parsed.pathname = parsed.pathname.replace(
      /(\/verify\/[^/]+\/)[^/]+/gi,
      '$1[REDACTED]'
    );

    // 2) Redact 1-segment routes: invitations, rx-verify, upload
    parsed.pathname = parsed.pathname.replace(
      /(\/(?:rx-verify|invitations|upload\/(?:lab|rx))\/)[^/]+/gi,
      '$1[REDACTED]'
    );

    if (isAbsolute) {
      return parsed.toString();
    }
    return parsed.pathname + parsed.search;
  } catch {
    return rawUrl;
  }
}
