/**
 * Resolves the active base domain for consoles and subdomains across environments.
 * Priority:
 * 1. process.env.NEXT_PUBLIC_BASE_DOMAIN (explicit override via env var)
 * 2. Active browser window hostname (stripping known service prefixes like portal, admin, app, dashboard, www)
 * 3. Fallback: empty string (never hardcodes static domains)
 */
export function getConsoleBaseDomain(): string {
  if (process.env.NEXT_PUBLIC_BASE_DOMAIN) {
    return process.env.NEXT_PUBLIC_BASE_DOMAIN.trim().replace(/^\.+/, "");
  }

  if (typeof window !== "undefined" && window.location?.hostname) {
    const host = window.location.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
    ) {
      return "";
    }

    // Strip service/portal prefix if accessing via portal.<domain>, admin.<domain>, etc.
    const stripped = host.replace(/^(?:portal|admin|app|dashboard|www)\./, "");
    if (stripped.includes(".")) {
      return stripped;
    }
    return host;
  }

  return "";
}

export const getFacilityBaseDomain = getConsoleBaseDomain;

/**
 * Resolves the patient-api base URL following the architecture contract:
 * 1. Explicit NEXT_PUBLIC_PATIENT_API_URL override if configured
 * 2. Domain-derived https://patient-api.<baseDomain>/api/v1 if running on a real domain
 * 3. Localhost development fallback http://localhost:5150/api/v1
 */
export function getPatientApiUrl(): string {
  if (process.env.NEXT_PUBLIC_PATIENT_API_URL) {
    const configured = process.env.NEXT_PUBLIC_PATIENT_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  const baseDomain = getConsoleBaseDomain();
  if (baseDomain) {
    return `https://patient-api.${baseDomain}/api/v1`;
  }
  return "http://localhost:5150/api/v1";
}

/**
 * Resolves the portal-api base URL following the architecture contract:
 * 1. Explicit NEXT_PUBLIC_PORTAL_API_URL or NEXT_PUBLIC_API_URL
 * 2. Domain-derived https://portal-api.<baseDomain>/api/v1
 * 3. Localhost development fallback http://localhost:5000/api/v1
 */
export function getPortalApiUrl(): string {
  if (process.env.NEXT_PUBLIC_PORTAL_API_URL) {
    const configured = process.env.NEXT_PUBLIC_PORTAL_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    const configured = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  const baseDomain = getConsoleBaseDomain();
  if (baseDomain) {
    return `https://portal-api.${baseDomain}/api/v1`;
  }
  return "http://localhost:5000/api/v1";
}
