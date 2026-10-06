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
  'clinicez.net',
  'www.clinicez.net',
  'dev.clinicez.net',
  'clinic.clinicez.net',
  'clinic.dev.clinicez.net',
  'clinic.localhost',
  'lab.clinicez.net',
  'lab.dev.clinicez.net',
  'lab.localhost',
  'pharmacy.clinicez.net',
  'pharmacy.dev.clinicez.net',
  'pharmacy.localhost',
  'portal.clinicez.net',
  'portal.dev.clinicez.net',
  'portal.localhost',
  'admin.clinicez.net',
  'admin.dev.clinicez.net',
  'admin.localhost',
  'api.clinicez.net',
  'api.dev.clinicez.net',
  'api.localhost',
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

  // IPv4 or IPv6 address (direct on-premise IP access)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost) || cleanHost.includes(':')) {
    return true;
  }

  // Service roots on local or internal network (e.g. clinic.local, clinic.lan)
  if (/^(?:clinic|lab|pharmacy|portal|dev|admin|api)\.(?:local|internal|lan)$/.test(cleanHost)) {
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
 * Supports:
 * - <tenant>.clinic.dev.clinicez.net  -> "<tenant>"
 * - <tenant>.clinic.clinicez.net      -> "<tenant>"
 * - <tenant>.clinic.localhost         -> "<tenant>"
 * - <tenant>.dev.clinicez.net         -> "<tenant>"
 * - <tenant>.clinicez.net             -> "<tenant>"
 * - <tenant>.localhost                -> "<tenant>"
 * Returns null for all root domains (clinic.dev.clinicez.net, clinic.clinicez.net, etc.)
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

  // 1. Nested service on dev wildcard (e.g. <tenant>.clinic.dev.clinicez.net)
  const devServiceMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:clinic|lab|pharmacy|org)\.dev\.clinicez\.net$/);
  // 2. Nested service on prod wildcard (e.g. <tenant>.clinic.clinicez.net)
  const prodServiceMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:clinic|lab|pharmacy|org)\.clinicez\.net$/);
  // 3. Nested service on localhost or virtual host (e.g. <tenant>.clinic.localhost)
  const localServiceMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:clinic|lab|pharmacy|org)\.(?:localhost|lvh\.me)$/);
  // 4. Portal on dev wildcard (e.g. <tenant>.dev.clinicez.net)
  const devPortalMatch = cleanHost.match(/^([a-z0-9-]+)\.dev\.clinicez\.net$/);
  // 5. Portal on prod wildcard (e.g. <tenant>.clinicez.net)
  const prodPortalMatch = cleanHost.match(/^([a-z0-9-]+)\.clinicez\.net$/);
  // 6. Portal on localhost (e.g. <tenant>.localhost)
  const localPortalMatch = cleanHost.match(/^([a-z0-9-]+)\.(?:localhost|lvh\.me)$/);

  if (devServiceMatch) {
    candidate = devServiceMatch[1];
  } else if (prodServiceMatch) {
    candidate = prodServiceMatch[1];
  } else if (localServiceMatch) {
    candidate = localServiceMatch[1];
  } else if (devPortalMatch) {
    candidate = devPortalMatch[1];
  } else if (prodPortalMatch) {
    candidate = prodPortalMatch[1];
  } else if (localPortalMatch) {
    candidate = localPortalMatch[1];
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
