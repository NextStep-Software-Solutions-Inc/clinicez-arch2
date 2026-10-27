/**
 * Route detection utility for the unauthenticated public waiting area TV display kiosk.
 * Matches both path-based (/queue-display) and hash-based (#/queue-display) routes.
 */
export function isQueueDisplayPath(pathname?: string | null, hash?: string | null): boolean {
  const p = (pathname || '').toLowerCase();
  const h = (hash || '').toLowerCase();

  return (
    p === '/queue-display' ||
    p.startsWith('/queue-display/') ||
    p === '/queue-tv' ||
    p.startsWith('/queue-tv/') ||
    h === '#/queue-display' ||
    h.startsWith('#/queue-display') ||
    h === '#queue-display' ||
    h.startsWith('#queue-display') ||
    h === '#/queue-tv' ||
    h.startsWith('#/queue-tv')
  );
}

export function isCurrentRouteQueueDisplay(): boolean {
  if (typeof window !== 'undefined' && window.location) {
    return isQueueDisplayPath(window.location.pathname, window.location.hash);
  }
  return false;
}

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGuidOrUuid(val?: string | null): boolean {
  return Boolean(val && UUID_REGEX.test(val.trim()));
}

/**
 * Resolves human-readable URL slugs for tenant and facility.
 * STRICT SECURITY INVARIANT: Under no circumstances may a UUID/GUID be returned.
 * Leaked or internal GUIDs (like TenantId or ClinicId) must NEVER appear in public TV URLs.
 */
export function resolveTvDisplaySlugs(
  settings?: { tenantSlug?: string | null; facilitySlug?: string | null; tenantId?: string | null } | null,
  ctx?: { tenantSlug?: string | null; facilitySlug?: string | null } | null
): { tenantSlug: string; facilitySlug: string } {
  let tenantSlug = '';
  if (settings?.tenantSlug && !isGuidOrUuid(settings.tenantSlug)) {
    tenantSlug = settings.tenantSlug.trim();
  } else if (ctx?.tenantSlug && !isGuidOrUuid(ctx.tenantSlug)) {
    tenantSlug = ctx.tenantSlug.trim();
  } else if (ctx?.facilitySlug && !isGuidOrUuid(ctx.facilitySlug)) {
    // In clinic subdomains like nextstep.clinic.dev.clinicez.net, resolveTenantContext sets facilitySlug = "nextstep"
    tenantSlug = ctx.facilitySlug.trim();
  } else if (settings?.facilitySlug && !isGuidOrUuid(settings.facilitySlug)) {
    tenantSlug = settings.facilitySlug.trim();
  }

  if (!tenantSlug || isGuidOrUuid(tenantSlug)) {
    tenantSlug = 'clinic';
  }

  let facilitySlug = '';
  if (settings?.facilitySlug && !isGuidOrUuid(settings.facilitySlug) && settings.facilitySlug.trim() !== tenantSlug) {
    facilitySlug = settings.facilitySlug.trim();
  } else if (ctx?.facilitySlug && !isGuidOrUuid(ctx.facilitySlug) && ctx.facilitySlug.trim() !== tenantSlug) {
    facilitySlug = ctx.facilitySlug.trim();
  }

  if (!facilitySlug || isGuidOrUuid(facilitySlug)) {
    facilitySlug = 'main';
  }

  return { tenantSlug, facilitySlug };
}

/**
 * Constructs the canonical public Cloud TV display URL.
 * Guarantees zero UUID exposure and optionally appends configured PIN for authenticated setup.
 */
export function buildCloudTvDisplayUrl(
  portalBase: string,
  settings?: { tenantSlug?: string | null; facilitySlug?: string | null; tenantId?: string | null; tvDisplayPin?: string | null } | null,
  ctx?: { tenantSlug?: string | null; facilitySlug?: string | null } | null,
  includePin: boolean = false
): string {
  const { tenantSlug, facilitySlug } = resolveTvDisplaySlugs(settings, ctx);
  const base = `${portalBase.replace(/\/+$/, '')}/queue-display/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(facilitySlug)}`;
  if (includePin && settings?.tvDisplayPin && settings.tvDisplayPin.trim()) {
    return `${base}?pin=${encodeURIComponent(settings.tvDisplayPin.trim())}`;
  }
  return base;
}
