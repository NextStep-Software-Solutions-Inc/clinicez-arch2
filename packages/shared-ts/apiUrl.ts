/**
 * Resolves the backend API base URL for a web client without hardcoding any company domain.
 *
 * Resolution order (the first match wins):
 *  1. Local / direct-IP access           -> `<protocol>//<host>:<fallbackPort>`
 *  2. A base domain is known             -> template with `{service}`, `{baseDomain}`, `{facility}` substituted.
 *     The base domain comes from `baseDomain` (e.g. EXPO_PUBLIC_BASE_DOMAIN) or is inferred from a
 *     `[<facility>.]<service>.<baseDomain>` hostname.
 *  3. Anything else                      -> same origin as the page (reverse-proxy ingress).
 *
 * Callers that know the exact API URL should bypass this entirely (e.g. EXPO_PUBLIC_CLINIC_API_URL).
 */
export interface ResolveServiceApiUrlOptions {
  hostname?: string | null;
  protocol?: string | null;
  /** Service subdomain this app is served from. Defaults to `clinic`. */
  serviceSubdomain?: string | null;
  /** Explicit base domain; when omitted it is inferred from the hostname. */
  baseDomain?: string | null;
  /** URL template. Placeholders: {service}, {baseDomain}, {facility}. */
  template?: string | null;
  fallbackPort?: number;
}

export const DEFAULT_API_URL_TEMPLATE = 'https://{service}-api.{baseDomain}';

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isLocalHost = (hostname: string): boolean =>
  hostname === 'localhost' ||
  hostname.endsWith('.localhost') ||
  hostname.endsWith('.lvh.me') ||
  /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);

export interface ServiceHostParts {
  /** Facility / tenant label in front of the service subdomain, or null on the service root host. */
  facility: string | null;
  /** Everything after `<service>.` (the deployment's base domain). */
  baseDomain: string;
}

/**
 * Splits `[<facility>.]<service>.<baseDomain>` into its parts without knowing the base domain.
 * Returns null when the hostname does not follow that shape for the given service subdomain.
 */
export function parseServiceHost(hostname: string, serviceSubdomain: string = 'clinic'): ServiceHostParts | null {
  const host = hostname.trim().toLowerCase().split(':')[0];
  const service = serviceSubdomain.trim().toLowerCase();
  if (!host || !service) return null;
  const match = host.match(new RegExp(`^(?:([a-z0-9-]+)\\.)?${escapeRegex(service)}\\.(.+)$`));
  if (!match) return null;
  return { facility: match[1] ?? null, baseDomain: match[2] };
}
export function resolveServiceApiUrl(options: ResolveServiceApiUrlOptions = {}): string {
  const fallbackPort = options.fallbackPort ?? 5245;
  const hostname = options.hostname?.trim().toLowerCase();

  if (!hostname) {
    return `http://localhost:${fallbackPort}`;
  }

  const protocol = options.protocol || 'http:';

  if (isLocalHost(hostname)) {
    return `${protocol}//${hostname}:${fallbackPort}`;
  }

  const service = (options.serviceSubdomain?.trim().toLowerCase() || 'clinic').replace(/^\.+|\.+$/g, '');
  let baseDomain = options.baseDomain?.trim().toLowerCase().replace(/^\.+|\.+$/g, '') || '';
  let facility = '';

  const hostParts = parseServiceHost(hostname, service);
  if (hostParts) {
    facility = hostParts.facility ?? '';
    if (!baseDomain) {
      baseDomain = hostParts.baseDomain;
    }
  }

  if (baseDomain) {
    const template = options.template?.trim() || DEFAULT_API_URL_TEMPLATE;
    return template
      .replace(/\{service\}/g, service)
      .replace(/\{baseDomain\}/g, baseDomain)
      .replace(/\{facility\}/g, facility)
      .replace(/\/+$/, '');
  }

  // Default to same-origin for ingress reverse-proxy routing
  return `${protocol}//${hostname}`;
}
