/**
 * Domain-neutral URL and API origin resolvers for `@clinicez/marketing-web`.
 *
 * Serves `{domain}` (root), `www.{domain}`, and `home.{domain}` with zero hardcoded
 * company domains. Every environment (local dev, staging, production, white-label)
 * derives cross-surface URLs from `NEXT_PUBLIC_*` overrides or the active hostname.
 */

const MARKETING_AND_SERVICE_PREFIX_RE = /^(?:www|home|portal|admin|app|dashboard)\./i;
const IPV4_RE = /^\d{1,3}(?:\.\d{1,3}){3}$/;

function normalizePath(path: string = "/"): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, "");
}

function ensureApiV1Suffix(url: string): string {
  const trimmed = stripTrailingSlashes(url.trim());
  if (!trimmed) return "";
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}

function extractCleanHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase().replace(/\.+$/, "");
  if (!trimmed) return "";

  if (trimmed.startsWith("[")) {
    const closeIdx = trimmed.indexOf("]");
    return closeIdx > 1 ? trimmed.slice(1, closeIdx) : trimmed;
  }

  // Raw IPv6 literal without brackets (e.g. ::1)
  if (trimmed.includes("::")) {
    return trimmed;
  }

  // Strip optional `:port`
  const colonIdx = trimmed.indexOf(":");
  return colonIdx > -1 ? trimmed.slice(0, colonIdx) : trimmed;
}

function isLocalOrIpHostname(host: string): boolean {
  if (!host) return true;
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "lvh.me" ||
    host.endsWith(".localhost") ||
    host.endsWith(".lvh.me") ||
    IPV4_RE.test(host)
  ) {
    return true;
  }
  return false;
}

/**
 * Resolves the root deployment domain (e.g. `example.health`).
 * 1) `process.env.NEXT_PUBLIC_BASE_DOMAIN` if configured.
 * 2) Active `hostname` (or `window.location.hostname` in browser), returning `""`
 *    for localhost / loopback / `*.localhost` / `*.lvh.me` / raw IPv4, or stripping
 *    known surface prefixes (`www.`, `home.`, `portal.`, `admin.`, `app.`, `dashboard.`).
 */
export function resolveBaseDomain(hostname?: string): string {
  const configured = process.env.NEXT_PUBLIC_BASE_DOMAIN?.trim()
    .replace(/^\.+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (configured) {
    return configured;
  }

  const rawHost =
    hostname !== undefined
      ? hostname
      : typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "";

  const host = extractCleanHostname(rawHost);
  if (isLocalOrIpHostname(host)) {
    return "";
  }

  const stripped = host.replace(MARKETING_AND_SERVICE_PREFIX_RE, "");
  return stripped.includes(".") ? stripped : "";
}

/**
 * Resolves an absolute URL on the public marketing surface (`{domain}`).
 * 1) `process.env.NEXT_PUBLIC_MARKETING_URL` + normalized path
 * 2) `https://${baseDomain}${normalizedPath}` when a base domain is resolved
 * 3) `http://localhost:${process.env.NEXT_PUBLIC_MARKETING_PORT || "3002"}${normalizedPath}`
 */
export function getMarketingBaseUrl(path: string = "/", hostname?: string): string {
  const normalizedPath = normalizePath(path);

  const configured = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (configured) {
    return `${stripTrailingSlashes(configured)}${normalizedPath}`;
  }

  const baseDomain = resolveBaseDomain(hostname);
  if (baseDomain) {
    return `https://${baseDomain}${normalizedPath}`;
  }

  const port = process.env.NEXT_PUBLIC_MARKETING_PORT?.trim() || "3002";
  return `http://localhost:${port}${normalizedPath}`;
}

function appendPathAndParams(
  origin: string,
  path: string = "/",
  params?: Record<string, string | undefined | null>
): string {
  const [rawPathname, existingQuery] = path.trim().split("?", 2);
  const normalizedPathname = normalizePath(rawPathname || "/");
  const searchParams = new URLSearchParams(existingQuery || "");

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== "") {
        searchParams.set(key, value);
      }
    }
  }

  const queryString = searchParams.toString();
  return queryString
    ? `${origin}${normalizedPathname}?${queryString}`
    : `${origin}${normalizedPathname}`;
}

/**
 * Resolves a destination URL on the authenticated portal app (`portal.{domain}` or `localhost:3000`).
 * 1) `process.env.NEXT_PUBLIC_PORTAL_URL` (trimmed, no trailing slash)
 * 2) `https://portal.${baseDomain}` when a base domain is resolved
 * 3) `http://localhost:${process.env.NEXT_PUBLIC_PORTAL_PORT || "3000"}`
 */
export function getPortalAppUrl(
  path: string = "/",
  params?: Record<string, string | undefined | null>,
  hostname?: string
): string {
  let origin: string;
  const configured = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (configured) {
    origin = stripTrailingSlashes(configured);
  } else {
    const baseDomain = resolveBaseDomain(hostname);
    if (baseDomain) {
      origin = `https://portal.${baseDomain}`;
    } else {
      const port = process.env.NEXT_PUBLIC_PORTAL_PORT?.trim() || "3000";
      origin = `http://localhost:${port}`;
    }
  }

  return appendPathAndParams(origin, path, params);
}

/**
 * Resolves a destination URL on the patient web app (`patient.{domain}` or `localhost:3003`).
 */
export function getPatientAppUrl(
  path: string = "/",
  params?: Record<string, string | undefined | null>,
  hostname?: string
): string {
  let origin: string;
  const configured = process.env.NEXT_PUBLIC_PATIENT_APP_URL?.trim();
  if (configured) {
    origin = stripTrailingSlashes(configured);
  } else {
    const baseDomain = resolveBaseDomain(hostname);
    if (baseDomain) {
      origin = `https://patient.${baseDomain}`;
    } else {
      const port = process.env.NEXT_PUBLIC_PATIENT_APP_PORT?.trim() || "3003";
      origin = `http://localhost:${port}`;
    }
  }

  return appendPathAndParams(origin, path, params);
}

/**
 * Resolves the `portal-api` `/api/v1` base URL.
 * 1) `NEXT_PUBLIC_PORTAL_API_URL` || `PORTAL_API_URL` || `NEXT_PUBLIC_API_URL` (ensuring `/api/v1` suffix)
 * 2) `https://portal-api.${baseDomain}/api/v1` when a base domain is resolved
 * 3) `http://localhost:5000/api/v1`
 */
export function getPortalApiUrl(hostname?: string): string {
  const configured =
    process.env.NEXT_PUBLIC_PORTAL_API_URL?.trim() ||
    process.env.PORTAL_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();

  if (configured) {
    return ensureApiV1Suffix(configured);
  }

  const baseDomain = resolveBaseDomain(hostname);
  if (baseDomain) {
    return `https://portal-api.${baseDomain}/api/v1`;
  }

  return "http://localhost:5000/api/v1";
}
