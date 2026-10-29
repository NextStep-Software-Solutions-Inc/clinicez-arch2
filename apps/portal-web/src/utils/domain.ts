class CaseInsensitiveSlugSet extends Set<string> {
  constructor(values: Iterable<string>) {
    super(Array.from(values, (v) => v.trim().toLowerCase()));
  }

  override has(value: string): boolean {
    if (typeof value !== "string") return false;
    return super.has(value.trim().toLowerCase());
  }
}

/**
 * Reserved tenant URL slugs matching portal-api validation rules.
 * Lookup is case-insensitive via both `RESERVED_TENANT_SLUGS.has(...)` and `isReservedTenantSlug(...)`.
 */
export const RESERVED_TENANT_SLUGS: ReadonlySet<string> = new CaseInsensitiveSlugSet([
  "home",
  "www",
  "portal",
  "admin",
  "app",
  "api",
  "dev",
  "stage",
  "staging",
  "prod",
  "production",
  "test",
  "clinic",
  "clinics",
  "lab",
  "laboratory",
  "laboratories",
  "pharmacy",
  "pharmacies",
  "org",
  "organization",
  "organizations",
  "cashier",
  "patient",
  "patients",
  "hub",
  "interop",
  "interop-hub",
  "billing",
  "billing-api",
  "portal-api",
  "clinic-api",
  "laboratory-api",
  "pharmacy-api",
  "organization-api",
  "patient-api",
  "comms-api",
  "media-broker",
  "philhealth",
  "philhealth-proxy",
  "clerk",
  "auth",
  "login",
  "mail",
  "smtp",
  "imap",
  "pop",
  "cdn",
  "static",
  "assets",
  "media",
  "files",
  "docs",
  "status",
  "support",
  "help",
  "blog",
  "blogs",
  "marketing",
  "go",
  "web",
  "site",
  "dashboard",
  "console",
  "workspace",
  "root",
  "localhost",
]);

export function isReservedTenantSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  return RESERVED_TENANT_SLUGS.has(slug.trim().toLowerCase());
}

/** Common multi-part public suffix TLDs so registrable domains like `acme.com.ph` keep all 3 root labels. */
export const MULTI_PART_TLDS: ReadonlySet<string> = new Set([
  "com.ph",
  "gov.ph",
  "org.ph",
  "net.ph",
  "edu.ph",
  "mil.ph",
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "net.au",
  "org.au",
  "co.nz",
  "co.jp",
  "com.sg",
  "com.my",
  "com.hk",
]);

const ENV_TIER_LABELS: ReadonlySet<string> = new Set(["dev", "stage", "staging"]);
const VALID_TENANT_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function extractCleanHostname(rawHost: string): string {
  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed || trimmed === "::1" || trimmed.startsWith("[::1]")) {
    return "";
  }
  return trimmed.split(":")[0].trim().replace(/^\.+|\.+$/g, "");
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
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
  ) {
    return true;
  }
  return false;
}

function getRootDomainLabelCount(labels: string[]): number {
  if (labels.length < 2) return labels.length;
  const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  return MULTI_PART_TLDS.has(lastTwo) ? 3 : 2;
}

function normalizeUrlPath(path: string = "/"): string {
  const trimmed = (path || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Resolves the active base domain for consoles and subdomains across environments.
 * Priority:
 * 1. process.env.NEXT_PUBLIC_BASE_DOMAIN (explicit override via env var)
 * 2. Explicit hostname or active browser window hostname (stripping service/tenant prefixes)
 * 3. Fallback: empty string (never hardcodes static domains)
 */
export function getConsoleBaseDomain(explicitHostname?: string): string {
  const configured = process.env.NEXT_PUBLIC_BASE_DOMAIN?.trim().replace(/^\.+/, "");
  if (configured) {
    return configured;
  }

  const rawHost =
    explicitHostname !== undefined
      ? explicitHostname
      : typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "";

  const host = extractCleanHostname(rawHost);
  if (!host || isLocalOrIpHostname(host)) {
    return "";
  }

  // Strip known surface prefixes if accessing via portal.<domain>, admin.<domain>, home.<domain>, etc.
  if (/^(?:portal|admin|app|dashboard|www|home)\./.test(host)) {
    const stripped = host.replace(/^(?:portal|admin|app|dashboard|www|home)\./, "");
    return stripped.includes(".") ? stripped : "";
  }

  const labels = host.split(".");
  if (labels.length < 2) {
    return "";
  }

  const rootLabelCount = getRootDomainLabelCount(labels);
  if (labels.length <= rootLabelCount) {
    return host;
  }

  // Check if an environment tier label (dev, stage, staging) sits immediately above the root domain
  const envCandidateIndex = labels.length - rootLabelCount - 1;
  const envCandidate = labels[envCandidateIndex];
  if (envCandidate && ENV_TIER_LABELS.has(envCandidate)) {
    return labels.slice(envCandidateIndex).join(".");
  }

  // Otherwise strip leading tenant/service subdomain labels down to the registrable root domain
  return labels.slice(labels.length - rootLabelCount).join(".");
}

export const getFacilityBaseDomain = getConsoleBaseDomain;

/**
 * Resolves the public marketing surface URL:
 * 1. Explicit NEXT_PUBLIC_MARKETING_URL override
 * 2. Domain-derived https://<baseDomain><path>
 * 3. Localhost development fallback http://localhost:<NEXT_PUBLIC_MARKETING_PORT || 3002><path>
 */
export function getMarketingSiteUrl(path: string = "/", explicitHostname?: string): string {
  const normalizedPath = normalizeUrlPath(path);
  const configured = process.env.NEXT_PUBLIC_MARKETING_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/+$/, "")}${normalizedPath}`;
  }

  const baseDomain = getConsoleBaseDomain(explicitHostname);
  if (baseDomain) {
    return `https://${baseDomain}${normalizedPath}`;
  }

  const port = process.env.NEXT_PUBLIC_MARKETING_PORT?.trim() || "3002";
  return `http://localhost:${port}${normalizedPath}`;
}

/**
 * Resolves the portal entry surface URL (`portal.<baseDomain>`):
 * 1. Explicit NEXT_PUBLIC_PORTAL_URL override
 * 2. Domain-derived https://portal.<baseDomain><path>
 * 3. Localhost development fallback http://localhost:<NEXT_PUBLIC_PORTAL_PORT || 3000><path>
 */
export function getPortalEntryUrl(path: string = "/", explicitHostname?: string): string {
  const normalizedPath = normalizeUrlPath(path);
  const configured = process.env.NEXT_PUBLIC_PORTAL_URL?.trim();
  if (configured) {
    return `${configured.replace(/\/+$/, "")}${normalizedPath}`;
  }

  const baseDomain = getConsoleBaseDomain(explicitHostname);
  if (baseDomain) {
    return `https://portal.${baseDomain}${normalizedPath}`;
  }

  const port = process.env.NEXT_PUBLIC_PORTAL_PORT?.trim() || "3000";
  return `http://localhost:${port}${normalizedPath}`;
}

/**
 * Returns true when the active host (without port) has a valid non-reserved tenant workspace subdomain
 * (e.g. `<slug>.dev.<domain>`, `<slug>.<domain>`, `<slug>.localhost`, `<slug>.lvh.me`), and false on
 * `localhost`, `127.0.0.1`, `portal.*`, `admin.*`, `www.*`, `home.*`, or bare root domains.
 */
export function isTenantSubdomainHost(explicitHostname?: string): boolean {
  const rawHost =
    explicitHostname !== undefined
      ? explicitHostname
      : typeof window !== "undefined" && window.location?.hostname
        ? window.location.hostname
        : "";

  const cleanHost = extractCleanHostname(rawHost);
  if (
    !cleanHost ||
    cleanHost === "localhost" ||
    cleanHost === "lvh.me" ||
    cleanHost === "127.0.0.1" ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(cleanHost)
  ) {
    return false;
  }

  // Local wildcard subdomain: <slug>.localhost or <slug>.lvh.me
  const localMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:localhost|lvh\.me)$/);
  if (localMatch) {
    const candidate = localMatch[1];
    return VALID_TENANT_SLUG_REGEX.test(candidate) && !isReservedTenantSlug(candidate);
  }
  if (cleanHost.endsWith(".localhost") || cleanHost.endsWith(".lvh.me")) {
    return false;
  }

  // If NEXT_PUBLIC_BASE_DOMAIN is configured and matches cleanHost suffix, extract single-label prefix
  const configuredBase = process.env.NEXT_PUBLIC_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+/, "");
  if (configuredBase) {
    if (cleanHost === configuredBase) {
      return false;
    }
    if (cleanHost.endsWith(`.${configuredBase}`)) {
      const prefix = cleanHost.slice(0, cleanHost.length - configuredBase.length - 1);
      return (
        !prefix.includes(".") &&
        VALID_TENANT_SLUG_REGEX.test(prefix) &&
        !isReservedTenantSlug(prefix)
      );
    }
  }

  const labels = cleanHost.split(".");
  const rootLabelCount = getRootDomainLabelCount(labels);
  if (labels.length <= rootLabelCount) {
    return false;
  }

  // Single subdomain above root (<slug>.<root>) or single subdomain above env (<slug>.dev.<root>)
  if (
    labels.length === rootLabelCount + 1 ||
    (labels.length === rootLabelCount + 2 && ENV_TIER_LABELS.has(labels[1]))
  ) {
    const candidate = labels[0];
    return VALID_TENANT_SLUG_REGEX.test(candidate) && !isReservedTenantSlug(candidate);
  }

  return false;
}

/**
 * Builds the canonical URL for a tenant workspace (`https://<slug>.<baseDomain><subPath>` in cloud,
 * `http://<slug>.<localRoot>[:port]<subPath>` on local wildcard hosts, or `/<slug><subPath>` on plain localhost).
 */
export function getTenantWorkspaceUrl(
  slug: string,
  subPath: string = "/dashboard",
  explicitHostWithPort?: string
): string {
  const cleanSlug = (slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
  const normalizedSubPath = !subPath
    ? "/dashboard"
    : subPath.startsWith("/")
      ? subPath
      : `/${subPath}`;

  if (!cleanSlug) {
    return normalizedSubPath;
  }

  const hostWithPort = (
    explicitHostWithPort !== undefined
      ? explicitHostWithPort
      : typeof window !== "undefined" && window.location?.host
        ? window.location.host
        : ""
  )
    .trim()
    .toLowerCase();

  const baseDomain =
    explicitHostWithPort !== undefined
      ? getConsoleBaseDomain(explicitHostWithPort)
      : getConsoleBaseDomain();

  if (baseDomain) {
    return `https://${cleanSlug}.${baseDomain}${normalizedSubPath}`;
  }

  const localWildcardMatch = hostWithPort.match(/^[a-z0-9-]+\.(localhost|lvh\.me)(:\d+)?$/);
  if (localWildcardMatch) {
    const localRoot = localWildcardMatch[1];
    const portSuffix = localWildcardMatch[2] || "";
    return `http://${cleanSlug}.${localRoot}${portSuffix}${normalizedSubPath}`;
  }

  return `/${cleanSlug}${normalizedSubPath}`;
}

/**
 * Resolves the patient-api base URL following the architecture contract:
 * 1. Explicit NEXT_PUBLIC_PATIENT_API_URL override if configured
 * 2. Domain-derived https://patient-api.<baseDomain>/api/v1 if running on a real domain
 * 3. Localhost development fallback http://localhost:5150/api/v1
 */
export function getPatientApiUrl(explicitHostname?: string): string {
  if (process.env.NEXT_PUBLIC_PATIENT_API_URL) {
    const configured = process.env.NEXT_PUBLIC_PATIENT_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  const baseDomain = getConsoleBaseDomain(explicitHostname);
  if (baseDomain) {
    return `https://patient-api.${baseDomain}/api/v1`;
  }
  return "http://localhost:5150/api/v1";
}

/**
 * Resolves the portal-api base URL following the architecture contract:
 * 1. Explicit NEXT_PUBLIC_PORTAL_API_URL, PORTAL_API_URL, or NEXT_PUBLIC_API_URL
 * 2. Domain-derived https://portal-api.<baseDomain>/api/v1
 * 3. Localhost development fallback http://localhost:5000/api/v1
 */
export function getPortalApiUrl(explicitHostname?: string): string {
  if (process.env.NEXT_PUBLIC_PORTAL_API_URL) {
    const configured = process.env.NEXT_PUBLIC_PORTAL_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  if (process.env.PORTAL_API_URL) {
    const configured = process.env.PORTAL_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    const configured = process.env.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, "");
    return configured.endsWith("/api/v1") ? configured : `${configured}/api/v1`;
  }
  const baseDomain = getConsoleBaseDomain(explicitHostname);
  if (baseDomain) {
    return `https://portal-api.${baseDomain}/api/v1`;
  }
  return "http://localhost:5000/api/v1";
}
