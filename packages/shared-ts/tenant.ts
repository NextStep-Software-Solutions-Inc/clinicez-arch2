export interface TenantContext {
  tenantSlug: string | null;
  clinicId: string | null;
  source: 'subdomain' | 'query' | 'storage' | 'none';
  isRoot: boolean;
}

export const RESERVED_SUBDOMAINS = new Set([
  'www',
  'app',
  'api',
  'admin',
  'clinic',
  'lab',
  'pharmacy',
  'org',
  'dev',
  'portal',
  'localhost',
  'console',
  'auth',
  'static',
  'assets',
  'cdn',
]);

export const ROOT_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
]);

const STORAGE_KEY_TENANT = 'clinicez_active_tenant';
const STORAGE_KEY_CLINIC = 'clinicez_active_clinic';

/**
 * Checks whether a hostname represents a root or system service entry point
 * rather than a specific tenant instance.
 */
export function isRootHostname(hostname: string): boolean {
  if (!hostname) return true;
  const cleanHost = hostname.toLowerCase().split(':')[0].trim();
  if (!cleanHost) return true;

  if (ROOT_HOSTNAMES.has(cleanHost)) {
    return true;
  }

  // IPv4 or IPv6 address (direct access)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost) || cleanHost.includes(':')) {
    return true;
  }

  const parts = cleanHost.split('.');

  // Single label (like "localhost" or local network machine name)
  if (parts.length <= 1) {
    return true;
  }

  // Common two-part ccTLDs like .co.uk, .com.ph, .org.uk
  const isTwoPartTld =
    parts.length >= 3 &&
    ['co', 'com', 'org', 'net', 'edu', 'gov', 'mil', 'ac'].includes(parts[parts.length - 2]) &&
    parts[parts.length - 1].length === 2;

  // Root apex domain (e.g. "domain.com" or "domain.co.uk", but not "<tenant>.localhost")
  if (parts[parts.length - 1] !== 'localhost') {
    if (parts.length === 2 || (isTwoPartTld && parts.length === 3)) {
      return true;
    }
  }

  // Service root where the first label is a reserved keyword:
  // e.g. clinic.dev.example.com, clinic.localhost, lab.example.com, portal.example.com, www.example.com, dev.example.com
  if (RESERVED_SUBDOMAINS.has(parts[0])) {
    return true;
  }

  // Service roots on local or internal network (e.g. clinic.local, clinic.lan)
  if (/^(?:clinic|lab|pharmacy|org|portal|dev|admin|api)\.(?:local|internal|lan)$/.test(cleanHost)) {
    return true;
  }

  return false;
}

/**
 * Validates whether a candidate string is a well-formed tenant identifier.
 */
export function isValidTenantSlug(slug: string | null | undefined): slug is string {
  if (!slug || typeof slug !== 'string') return false;
  const clean = slug.trim().toLowerCase();
  if (clean.length < 2 || clean.length > 63) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) return false;
  if (RESERVED_SUBDOMAINS.has(clean)) return false;
  return true;
}

/**
 * Extracts the tenant slug from the active browser window hostname.
 * Works dynamically across any domain (custom enterprise, dev, staging, prod, localhost).
 * Returns null for all root domains.
 */
export function extractTenantFromHostname(hostname: string): string | null {
  if (!hostname) return null;
  const cleanHost = hostname.toLowerCase().split(':')[0].trim();
  if (!cleanHost) return null;

  // Immediate check: recognized root domains have no tenant subdomain
  if (isRootHostname(cleanHost)) {
    return null;
  }

  let candidate: string | null = null;

  // 1. Nested service on any base domain (e.g. <slug>.(clinic|lab|pharmacy|org).<baseDomain>)
  const serviceMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:clinic|lab|pharmacy|org)\.(.+)$/);
  // 2. Portal tenant on localhost or virtual host (e.g. <tenant>.localhost or <tenant>.lvh.me)
  const localPortalMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:localhost|lvh\.me)$/);
  // 3. Portal tenant on dev wildcard (e.g. <tenant>.dev.<baseDomain>)
  const devPortalMatch = cleanHost.match(/^([a-z0-9-]+)\.dev\.(.+)$/);
  // 4. Portal tenant directly on any base domain: <tenant>.<domain>.<tld>
  const directTenantMatch = cleanHost.match(/^([a-z0-9-]+)\.([a-z0-9-]+\.[a-z0-9-.]+)$/);

  if (serviceMatch) {
    candidate = serviceMatch[1];
  } else if (localPortalMatch) {
    candidate = localPortalMatch[1];
  } else if (devPortalMatch) {
    candidate = devPortalMatch[1];
  } else if (directTenantMatch) {
    candidate = directTenantMatch[1];
  }

  if (candidate && isValidTenantSlug(candidate)) {
    return candidate;
  }

  return null;
}

/**
 * Returns any previously stored valid workspace slug from localStorage.
 */
export function getStoredTenantSlug(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY_TENANT);
    if (stored && isValidTenantSlug(stored)) {
      return stored;
    }
  } catch {
    // Ignore error
  }
  return null;
}

/**
 * Resolves tenant and facility context using priority order:
 * 1. Subdomain from hostname (if not a root domain)
 * 2. URL Query parameters (?tenant=...&facilityId=...)
 * 3. LocalStorage persistence (if not a bare root access)
 */
export function resolveTenantContext(): TenantContext {
  if (typeof window === 'undefined') {
    return { tenantSlug: null, clinicId: null, source: 'none', isRoot: false };
  }

  const hostname = window.location.hostname || '';
  const isRoot = isRootHostname(hostname);

  // 1. Subdomain Check (Only if not a recognized root domain)
  if (!isRoot) {
    const subdomainTenant = extractTenantFromHostname(hostname);
    if (subdomainTenant && isValidTenantSlug(subdomainTenant)) {
      const cachedClinic =
        localStorage.getItem(`${STORAGE_KEY_CLINIC}_${subdomainTenant}`) ||
        localStorage.getItem(STORAGE_KEY_CLINIC);
      return {
        tenantSlug: subdomainTenant,
        clinicId: cachedClinic || null,
        source: 'subdomain',
        isRoot: false,
      };
    }
  }

  // 2. Query Parameters Check (?tenant=...&facilityId=...)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const queryTenant = searchParams.get('tenant') || searchParams.get('tenantSlug');
    const queryClinic = searchParams.get('facilityId') || searchParams.get('clinicId');

    if (queryTenant && isValidTenantSlug(queryTenant)) {
      const cleanTenant = queryTenant.trim().toLowerCase();
      localStorage.setItem(STORAGE_KEY_TENANT, cleanTenant);
      if (queryClinic) {
        localStorage.setItem(`${STORAGE_KEY_CLINIC}_${cleanTenant}`, queryClinic);
        localStorage.setItem(STORAGE_KEY_CLINIC, queryClinic);
      }
      return {
        tenantSlug: cleanTenant,
        clinicId: queryClinic || localStorage.getItem(`${STORAGE_KEY_CLINIC}_${cleanTenant}`),
        source: 'query',
        isRoot,
      };
    }
  } catch {
    // Ignore URLSearchParams parsing failure in non-browser environments
  }

  // 3. Stored Tenant Check
  // Note: On root domains (e.g. clinic.dev.clinicez.net, clinic.clinicez.net),
  // we do not auto-bind storedTenant without explicit user selection, so the bare root
  // correctly displays the "Select Clinic Workspace" screen.
  try {
    const storedTenant = localStorage.getItem(STORAGE_KEY_TENANT);
    if (storedTenant) {
      if (isValidTenantSlug(storedTenant)) {
        if (!isRoot) {
          const storedClinic =
            localStorage.getItem(`${STORAGE_KEY_CLINIC}_${storedTenant}`) ||
            localStorage.getItem(STORAGE_KEY_CLINIC);
          return {
            tenantSlug: storedTenant,
            clinicId: storedClinic,
            source: 'storage',
            isRoot: false,
          };
        }
      } else {
        // Purge invalid slug (e.g. 'clinic.dev' or reserved words)
        localStorage.removeItem(STORAGE_KEY_TENANT);
      }
    }
  } catch {
    // Ignore localStorage access failure in sandboxed environments
  }

  return { tenantSlug: null, clinicId: null, source: 'none', isRoot };
}

export function setActiveTenantContext(tenantSlug: string, clinicId?: string): void {
  if (typeof window === 'undefined') return;
  const cleanTenant = tenantSlug.trim().toLowerCase();
  if (isValidTenantSlug(cleanTenant)) {
    localStorage.setItem(STORAGE_KEY_TENANT, cleanTenant);
    if (clinicId) {
      localStorage.setItem(`${STORAGE_KEY_CLINIC}_${cleanTenant}`, clinicId);
      localStorage.setItem(STORAGE_KEY_CLINIC, clinicId);
    }
  }
}

export function setActiveClinicId(clinicId: string, tenantSlug?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CLINIC, clinicId);
  if (tenantSlug && isValidTenantSlug(tenantSlug)) {
    localStorage.setItem(`${STORAGE_KEY_CLINIC}_${tenantSlug.trim().toLowerCase()}`, clinicId);
  }
}

export function clearActiveTenantContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_TENANT);
  localStorage.removeItem(STORAGE_KEY_CLINIC);
}
