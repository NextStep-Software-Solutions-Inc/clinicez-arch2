export interface CrossSurfaceUrlOptions {
  baseDomain?: string;
  isLocalDev?: boolean;
}

function getConfiguredBaseDomain(): string {
  if (typeof import.meta === 'undefined') return '';
  return import.meta.env?.VITE_BASE_DOMAIN?.trim().replace(/^\.+/, '') || '';
}

function getConfiguredPortalUrl(): string {
  if (typeof import.meta === 'undefined') return '';
  return import.meta.env?.VITE_PORTAL_WEB_URL?.trim().replace(/\/+$/, '') || '';
}

/**
 * Returns true if the client is running on localhost or a local test host.
 */
export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined' || !window.location || typeof window.location.hostname !== 'string') return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname.endsWith('.lvh.me');
}

function resolveBaseDomain(): string {
  const configured = getConfiguredBaseDomain();
  if (configured) return configured;

  if (typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string' && !isLocalEnvironment()) {
    return window.location.hostname.trim().toLowerCase().replace(/^admin\./, '');
  }

  return '';
}

function resolveLocalPortalOrigin(): string {
  const configuredPortal = getConfiguredPortalUrl();
  if (configuredPortal) return configuredPortal;

  if (typeof window !== 'undefined' && window.location && typeof window.location.hostname === 'string') {
    const protocol = window.location.protocol || 'http:';
    const port = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PORTAL_WEB_PORT?.trim()) || '3000';
    return `${protocol}//${window.location.hostname}:${port}`;
  }

  return '';
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
 * In local dev: ${localPortalOrigin}/${slug}${path}
 * In production: https://${slug}.${baseDomain}${path}
 * Strictly sanitizes slug so malicious inputs cannot escape the authority component.
 */
export function getTenantWorkspaceUrl(slug: string, path: string = '/dashboard'): string {
  const cleanSlug = sanitizeTenantSlug(slug);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (isLocalEnvironment()) {
    const localOrigin = resolveLocalPortalOrigin();
    return cleanSlug
      ? `${localOrigin}/${cleanSlug}${normalizedPath}`
      : `${localOrigin}${normalizedPath}`;
  }

  const portalUrl = getConfiguredPortalUrl();
  if (portalUrl) {
    return cleanSlug
      ? `${portalUrl}/${cleanSlug}${normalizedPath}`
      : `${portalUrl}${normalizedPath}`;
  }

  const baseDomain = resolveBaseDomain();
  if (baseDomain) {
    return cleanSlug
      ? `https://${cleanSlug}.${baseDomain}${normalizedPath}`
      : `https://${baseDomain}${normalizedPath}`;
  }

  return cleanSlug ? `/${cleanSlug}${normalizedPath}` : normalizedPath;
}

/**
 * Resolves the destination URL for public marketing pages (such as live blog posts).
 * In local dev: ${localPortalOrigin}${path}
 * In production: https://${baseDomain}${path}
 */
export function getPublicSiteUrl(path: string = '/'): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (isLocalEnvironment()) {
    const localOrigin = resolveLocalPortalOrigin();
    return `${localOrigin}${normalizedPath}`;
  }

  const portalUrl = getConfiguredPortalUrl();
  if (portalUrl) {
    return `${portalUrl}${normalizedPath}`;
  }

  const baseDomain = resolveBaseDomain();
  if (baseDomain) {
    return `https://${baseDomain}${normalizedPath}`;
  }

  return normalizedPath;
}
