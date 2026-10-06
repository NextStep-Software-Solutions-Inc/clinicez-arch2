/**
 * Resolves the active base domain for consoles and subdomains across environments.
 * Priority:
 * 1. process.env.NEXT_PUBLIC_BASE_DOMAIN (explicit override via env var)
 * 2. Active browser window hostname (stripping known service prefixes like portal, admin, app, www)
 * 3. Default fallback: dev.clinicez.net (if on localhost/dev), or clinicez.net (in production)
 */
export function getConsoleBaseDomain(): string {
  if (process.env.NEXT_PUBLIC_BASE_DOMAIN) {
    return process.env.NEXT_PUBLIC_BASE_DOMAIN;
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") {
      return "dev.clinicez.net";
    }

    // Strip service/portal prefix if accessing via portal.<domain>, admin.<domain>, etc.
    const stripped = host.replace(/^(?:portal|admin|app|dashboard|www)\./, "");
    if (stripped.includes(".")) {
      return stripped;
    }
  }

  return process.env.NODE_ENV === "production" ? "clinicez.net" : "dev.clinicez.net";
}
