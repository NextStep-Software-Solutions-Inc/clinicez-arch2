export interface TenantContext {
  tenantSlug: string | null;
  clinicId: string | null;
  source: 'subdomain' | 'query' | 'storage' | 'none';
}

const RESERVED_SUBDOMAINS = new Set([
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
]);

const STORAGE_KEY_TENANT = 'clinicez_active_tenant';
const STORAGE_KEY_CLINIC = 'clinicez_active_clinic';

/**
 * Extracts the tenant slug from the active browser window hostname.
 * Supports:
 * - <tenant>.clinic.dev.clinicez.net  -> "<tenant>"
 * - <tenant>.clinic.clinicez.net      -> "<tenant>"
 * - <tenant>.clinic.localhost         -> "<tenant>"
 * - <tenant>.dev.clinicez.net         -> "<tenant>"
 * - <tenant>.clinicez.net             -> "<tenant>"
 * - <tenant>.localhost                -> "<tenant>"
 */
export function extractTenantFromHostname(hostname: string): string | null {
  if (!hostname) return null;
  const cleanHost = hostname.toLowerCase().split(':')[0];

  // Pattern 1: Nested service subdomains (e.g. <tenant>.clinic.dev.clinicez.net or <tenant>.clinic.clinicez.net)
  if (cleanHost.includes('.clinic.') || cleanHost.includes('.lab.') || cleanHost.includes('.pharmacy.')) {
    const parts = cleanHost.split(/\.(?:clinic|lab|pharmacy)\./);
    if (parts.length >= 2 && parts[0] && !RESERVED_SUBDOMAINS.has(parts[0])) {
      return parts[0];
    }
  }

  // Pattern 2: Dev wildcard domain (e.g. <tenant>.dev.clinicez.net)
  if (cleanHost.endsWith('.dev.clinicez.net')) {
    const slug = cleanHost.replace('.dev.clinicez.net', '');
    if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
      return slug;
    }
  }

  // Pattern 3: Production wildcard domain (e.g. <tenant>.clinicez.net)
  if (cleanHost.endsWith('.clinicez.net')) {
    const slug = cleanHost.replace('.clinicez.net', '');
    if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
      return slug;
    }
  }

  // Pattern 4: Local development virtual host (e.g. <tenant>.localhost or <tenant>.lvh.me)
  if (cleanHost.includes('.localhost') || cleanHost.includes('.lvh.me')) {
    const slug = cleanHost.split(/\.(?:localhost|lvh\.me)/)[0];
    if (slug && !RESERVED_SUBDOMAINS.has(slug)) {
      return slug;
    }
  }

  return null;
}

/**
 * Resolves tenant and facility context using priority order:
 * 1. Subdomain from hostname
 * 2. URL Query parameters (?tenant=...&facilityId=...)
 * 3. LocalStorage persistence
 */
export function resolveTenantContext(): TenantContext {
  if (typeof window === 'undefined') {
    return { tenantSlug: null, clinicId: null, source: 'none' };
  }

  // 1. Subdomain Check
  const subdomainTenant = extractTenantFromHostname(window.location.hostname);
  if (subdomainTenant) {
    const cachedClinic = localStorage.getItem(`${STORAGE_KEY_CLINIC}_${subdomainTenant}`) ||
                         localStorage.getItem(STORAGE_KEY_CLINIC);
    return {
      tenantSlug: subdomainTenant,
      clinicId: cachedClinic || null,
      source: 'subdomain',
    };
  }

  // 2. Query Parameters Check
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const queryTenant = searchParams.get('tenant') || searchParams.get('tenantSlug');
    const queryClinic = searchParams.get('facilityId') || searchParams.get('clinicId');

    if (queryTenant) {
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
      };
    }
  } catch {
    // Ignore URLSearchParams parsing failure in non-browser environments
  }

  // 3. Stored Tenant Check
  try {
    const storedTenant = localStorage.getItem(STORAGE_KEY_TENANT);
    if (storedTenant) {
      const storedClinic = localStorage.getItem(`${STORAGE_KEY_CLINIC}_${storedTenant}`) ||
                           localStorage.getItem(STORAGE_KEY_CLINIC);
      return {
        tenantSlug: storedTenant,
        clinicId: storedClinic,
        source: 'storage',
      };
    }
  } catch {
    // Ignore localStorage access failure in sandboxed environments
  }

  return { tenantSlug: null, clinicId: null, source: 'none' };
}

export function setActiveTenantContext(tenantSlug: string, clinicId?: string): void {
  if (typeof window === 'undefined') return;
  const cleanTenant = tenantSlug.trim().toLowerCase();
  localStorage.setItem(STORAGE_KEY_TENANT, cleanTenant);
  if (clinicId) {
    localStorage.setItem(`${STORAGE_KEY_CLINIC}_${cleanTenant}`, clinicId);
    localStorage.setItem(STORAGE_KEY_CLINIC, clinicId);
  }
}

export function setActiveClinicId(clinicId: string, tenantSlug?: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY_CLINIC, clinicId);
  if (tenantSlug) {
    localStorage.setItem(`${STORAGE_KEY_CLINIC}_${tenantSlug.trim().toLowerCase()}`, clinicId);
  }
}

export function clearActiveTenantContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY_TENANT);
  localStorage.removeItem(STORAGE_KEY_CLINIC);
}
