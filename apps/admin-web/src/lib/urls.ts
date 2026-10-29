export interface CrossSurfaceUrlOptions {
  baseDomain?: string;
  isLocalDev?: boolean;
}

const DEFAULT_BASE_DOMAIN = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BASE_DOMAIN?.trim().replace(/^\.+/, "")) || "clinicez.com";
const PORTAL_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_WEB_URL?.trim().replace(/\/+$/, "")) || "";

/**
 * Returns true if the client is running on localhost or a local test host.
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location || typeof window.location.hostname !== 'string') return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname.endsWith('.lvh.me');
}

/**
 * Sanitizes a tenant slug to conform strictly to DNS hostname label rules:
 * lowercase alphanumeric characters and hyphens [a-z0-9-],
 * stripping any leading/trailing hyphens.
 * Characters like ':', '/', '#', whitespace, and non-alphanumeric characters are stripped.
 */
export function sanitizeTenantSlug(slug: string): string {
  if (!slug || typeof slug !== 'string') return '';
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
}

/**
 * Resolves the destination URL for a tenant workspace.
 * In local dev: http://localhost:3000/${slug}${path}
 * In production: https://${slug}.${baseDomain}${path}
 * Strictly sanitizes slug so malicious inputs cannot escape the authority component.
 */
export function getTenantWorkspaceUrl(slug: string, path: string = "/dashboard"): string {
  const cleanSlug = sanitizeTenantSlug(slug);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (isLocalEnvironment()) {
    return cleanSlug
      ? `http://localhost:3000/${cleanSlug}${normalizedPath}`
      : `http://localhost:3000${normalizedPath}`;
  }

  if (PORTAL_URL) {
    return cleanSlug
      ? `${PORTAL_URL}/${cleanSlug}${normalizedPath}`
      : `${PORTAL_URL}${normalizedPath}`;
  }

  return cleanSlug
    ? `https://${cleanSlug}.${DEFAULT_BASE_DOMAIN}${normalizedPath}`
    : `https://${DEFAULT_BASE_DOMAIN}${normalizedPath}`;
}

/**
 * Resolves the destination URL for public marketing pages (such as live blog posts).
 * In local dev: http://localhost:3000${path}
 * In production: https://${baseDomain}${path}
 */
export function getPublicSiteUrl(path: string = "/"): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (isLocalEnvironment()) {
    return `http://localhost:3000${normalizedPath}`;
  }

  if (PORTAL_URL) {
    return `${PORTAL_URL}${normalizedPath}`;
  }

  return `https://${DEFAULT_BASE_DOMAIN}${normalizedPath}`;
}
