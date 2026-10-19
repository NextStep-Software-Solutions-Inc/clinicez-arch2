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

