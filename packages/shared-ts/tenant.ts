export interface TenantContext {
  tenantSlug: string | null;
  facilitySlug?: string | null;
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

/** Service subdomains used when no override is configured. */
export const DEFAULT_SERVICE_SUBDOMAINS: readonly string[] = ['clinic', 'lab', 'pharmacy', 'org'];

// `process` is provided by the bundler / runtime (Expo, Next.js, Bun, Node); reads below tolerate its absence.
declare const process: { env: Record<string, string | undefined> };

/**
 * Reads the configured service subdomain list (comma separated), e.g. "clinic,lab,pharmacy,org".
 * Configure via `EXPO_PUBLIC_SERVICE_SUBDOMAINS` (Expo apps) or `NEXT_PUBLIC_SERVICE_SUBDOMAINS` (Next.js).
 * Each read must stay a literal `process.env.NAME` expression so bundlers can inline the value.
 */
function readConfiguredServiceSubdomains(): string | undefined {
  let value: string | undefined;
  try {
    value = process.env.EXPO_PUBLIC_SERVICE_SUBDOMAINS;
  } catch {
    // process is not defined in this runtime
  }
  if (!value) {
    try {
      value = process.env.NEXT_PUBLIC_SERVICE_SUBDOMAINS;
    } catch {
      // process is not defined in this runtime
    }
  }
  return value;
}

/** Parses a comma / whitespace separated list into valid, lowercase, de-duplicated DNS labels. */
export function parseServiceSubdomains(raw: string | null | undefined): string[] {
  if (!raw) return [...DEFAULT_SERVICE_SUBDOMAINS];
  const labels = raw
    .split(/[\s,;]+/)
    .map((label) => label.trim().toLowerCase())
    .filter((label) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label));
  return labels.length > 0 ? Array.from(new Set(labels)) : [...DEFAULT_SERVICE_SUBDOMAINS];
}

/** Returns the service subdomains (clinic, lab, ...) recognised by this deployment. */
export function getServiceSubdomains(): string[] {
  return parseServiceSubdomains(readConfiguredServiceSubdomains());
}

/**
 * Builds a regex matching `<tenant>.<service>.<baseDomain>` hostnames for the configured services.
 * Capture groups: 1 = tenant/facility slug, 2 = service subdomain, 3 = base domain.
 */
export function buildServiceHostRegex(services: string[] = getServiceSubdomains()): RegExp {
  const alternatives = services.map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  return new RegExp(`^([a-z0-9-]+)\\.(${alternatives})\\.(.+)$`);
}

function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label) || getServiceSubdomains().includes(label);
}


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
  // e.g. clinic.<baseDomain>, clinic.localhost, lab.example.com, portal.example.com, www.example.com, dev.example.com
  if (isReservedSubdomain(parts[0])) {
    return true;
  }

  // Service roots on local or internal network (e.g. clinic.local, clinic.lan)
  const localServiceLabels = Array.from(new Set([...getServiceSubdomains(), 'portal', 'dev', 'admin', 'api']));
  if (new RegExp(`^(?:${localServiceLabels.join('|')})\.(?:local|internal|lan)$`).test(cleanHost)) {
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
  if (isReservedSubdomain(clean)) return false;
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

  // 1. Nested service on any base domain (e.g. <slug>.<service>.<baseDomain>; services come from getServiceSubdomains())
  const serviceMatch = cleanHost.match(buildServiceHostRegex());
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
 * Minimal synchronous key/value storage used to remember the active workspace.
 * Web uses `localStorage` automatically. Native apps (no `localStorage`, no `window.location`) register
 * their own persistent storage once at startup with {@link setTenantStorage}.
 */
export interface TenantStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

let customTenantStorage: TenantStorage | null = null;

/** Registers (or clears) the storage used for workspace persistence. Call once before first use on native. */
export function setTenantStorage(storage: TenantStorage | null): void {
  customTenantStorage = storage;
}

function tenantStorage(): TenantStorage | null {
  if (customTenantStorage) return customTenantStorage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access can throw in sandboxed frames / private mode.
  }
  return null;
}

/** React Native defines `window` but not `window.location`; only a real browser location is usable. */
function browserLocation(): Location | null {
  try {
    if (typeof window !== 'undefined' && window.location) return window.location;
  } catch {
    // ignore
  }
  return null;
}

function readStorage(key: string): string | null {
  try {
    return tenantStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    tenantStorage()?.setItem(key, value);
  } catch {
    // Storage may be full or unavailable; the workspace simply is not remembered.
  }
}

function removeStorage(key: string): void {
  try {
    tenantStorage()?.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Returns any previously stored valid workspace slug.
 */
export function getStoredTenantSlug(): string | null {
  const stored = readStorage(STORAGE_KEY_TENANT);
  return stored && isValidTenantSlug(stored) ? stored : null;
}

/**
 * Resolves tenant and facility context using priority order:
 * 1. Subdomain from hostname (if not a root domain; browsers only)
 * 2. URL Query parameters (?tenant=...&facilityId=...; browsers only)
 * 3. Stored workspace (if not a bare root access)
 */
export function resolveTenantContext(): TenantContext {
  const location = browserLocation();
  if (!location && !tenantStorage()) {
    return { tenantSlug: null, clinicId: null, source: 'none', isRoot: false };
  }

  const hostname = location?.hostname || '';
  const isRoot = location ? isRootHostname(hostname) : false;

  // 1. Subdomain Check (Only if not a recognized root domain)
  if (location && !isRoot) {
    const cleanHost = hostname.toLowerCase().split(':')[0].trim();
    const serviceMatch = cleanHost.match(buildServiceHostRegex());
    const facilitySlug = serviceMatch && isValidTenantSlug(serviceMatch[1]) ? serviceMatch[1] : null;

    const subdomainTenant = extractTenantFromHostname(hostname);
    if (subdomainTenant && isValidTenantSlug(subdomainTenant)) {
      const cachedClinic =
        readStorage(`${STORAGE_KEY_CLINIC}_${subdomainTenant}`) || readStorage(STORAGE_KEY_CLINIC);
      return {
        tenantSlug: subdomainTenant,
        facilitySlug: facilitySlug || undefined,
        clinicId: cachedClinic || null,
        source: 'subdomain',
        isRoot: false,
      };
    }
  }

  // 2. Query Parameters Check (?tenant=...&facilityId=...)
  if (location) {
    try {
      const searchParams = new URLSearchParams(location.search);
      const queryTenant = searchParams.get('tenant') || searchParams.get('tenantSlug');
      const queryClinic = searchParams.get('facilityId') || searchParams.get('clinicId');

      if (queryTenant && isValidTenantSlug(queryTenant)) {
        const cleanTenant = queryTenant.trim().toLowerCase();
        writeStorage(STORAGE_KEY_TENANT, cleanTenant);
        if (queryClinic) {
          writeStorage(`${STORAGE_KEY_CLINIC}_${cleanTenant}`, queryClinic);
          writeStorage(STORAGE_KEY_CLINIC, queryClinic);
        }
        return {
          tenantSlug: cleanTenant,
          clinicId: queryClinic || readStorage(`${STORAGE_KEY_CLINIC}_${cleanTenant}`),
          source: 'query',
          isRoot,
        };
      }
    } catch {
      // Ignore URLSearchParams parsing failure in non-browser environments
    }
  }

  // 3. Stored Tenant Check
  // Note: On service root domains (e.g. clinic.<baseDomain>),
  // we do not auto-bind storedTenant without explicit user selection, so the bare root
  // correctly displays the "Select Clinic Workspace" screen.
  const storedTenant = readStorage(STORAGE_KEY_TENANT);
  if (storedTenant) {
    if (isValidTenantSlug(storedTenant)) {
      if (!isRoot) {
        const storedClinic =
          readStorage(`${STORAGE_KEY_CLINIC}_${storedTenant}`) || readStorage(STORAGE_KEY_CLINIC);
        return {
          tenantSlug: storedTenant,
          clinicId: storedClinic,
          source: 'storage',
          isRoot: false,
        };
      }
    } else {
      // Purge invalid slug (e.g. 'clinic.dev' or reserved words)
      removeStorage(STORAGE_KEY_TENANT);
    }
  }

  return { tenantSlug: null, clinicId: null, source: 'none', isRoot };
}

export function setActiveTenantContext(tenantSlug: string, clinicId?: string): void {
  const cleanTenant = tenantSlug.trim().toLowerCase();
  if (isValidTenantSlug(cleanTenant)) {
    writeStorage(STORAGE_KEY_TENANT, cleanTenant);
    if (clinicId) {
      writeStorage(`${STORAGE_KEY_CLINIC}_${cleanTenant}`, clinicId);
      writeStorage(STORAGE_KEY_CLINIC, clinicId);
    }
  }
}

export function setActiveClinicId(clinicId: string, tenantSlug?: string): void {
  writeStorage(STORAGE_KEY_CLINIC, clinicId);
  if (tenantSlug && isValidTenantSlug(tenantSlug)) {
    writeStorage(`${STORAGE_KEY_CLINIC}_${tenantSlug.trim().toLowerCase()}`, clinicId);
  }
}

export function clearActiveTenantContext(): void {
  removeStorage(STORAGE_KEY_TENANT);
  removeStorage(STORAGE_KEY_CLINIC);
}
