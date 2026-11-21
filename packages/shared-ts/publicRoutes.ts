/**
 * Canonical public route builders and join code validation for ClinicEZ.
 * Single source of truth across TypeScript frontend applications.
 */

function cleanBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl) return '';
  return baseUrl.trim().replace(/\/+$/, '');
}

function normalizeSig(sig?: string | null): string | null {
  if (!sig) return null;
  const trimmed = sig.trim();
  if (!trimmed) return null;
  const prefix = 'SEC-SHA256-';
  if (trimmed.toUpperCase().startsWith(prefix)) {
    const clean = trimmed.slice(prefix.length);
    return clean.length >= 12 ? clean.slice(0, 12) : clean;
  }
  return trimmed;
}

export const publicRoutes = {
  /**
   * Generates canonical unauthenticated join URL:
   * - /join
   * - /join?code=...
   * - https://portal.clinicez.ph/join[?code=...]
   */
  join(options?: { baseUrl?: string | null; code?: string | null }): string {
    const base = cleanBaseUrl(options?.baseUrl);
    const code = options?.code?.trim();
    const query = code ? `?code=${encodeURIComponent(code)}` : '';
    return `${base}/join${query}`;
  },

  /**
   * Generates canonical facility join URL:
   * - /join/{tenantSlug}/{facilitySlug}
   * - /join/{tenantSlug}/{facilitySlug}?code=...
   */
  facilityJoin(
    tenantSlug: string,
    facilitySlug: string,
    options?: { baseUrl?: string | null; code?: string | null }
  ): string {
    if (!tenantSlug?.trim() || !facilitySlug?.trim()) {
      throw new Error('tenantSlug and facilitySlug are required');
    }
    const base = cleanBaseUrl(options?.baseUrl);
    const code = options?.code?.trim();
    const query = code ? `?code=${encodeURIComponent(code)}` : '';
    return `${base}/join/${encodeURIComponent(tenantSlug.trim())}/${encodeURIComponent(facilitySlug.trim())}${query}`;
  },

  /**
   * Generates canonical account claim URL:
   * - /claim?token=...
   */
  claim(token: string, options?: { baseUrl?: string | null }): string {
    if (!token?.trim()) {
      throw new Error('token is required');
    }
    const base = cleanBaseUrl(options?.baseUrl);
    return `${base}/claim?token=${encodeURIComponent(token.trim())}`;
  },

  /**
   * Generates canonical manual verify lookup URL:
   * - /verify
   * - /verify?ref=...[&sig=...]
   */
  verifyLookup(options?: { baseUrl?: string | null; ref?: string | null; sig?: string | null }): string {
    const base = cleanBaseUrl(options?.baseUrl);
    const params: string[] = [];
    if (options?.ref?.trim()) {
      params.push(`ref=${encodeURIComponent(options.ref.trim())}`);
    }
    const sig = normalizeSig(options?.sig);
    if (sig) {
      params.push(`sig=${encodeURIComponent(sig)}`);
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return `${base}/verify${query}`;
  },

  /**
   * Generates canonical typed verify URL:
   * - /verify/{kind}/{token}[?sig=...]
   */
  verifyKind(
    kind: string,
    token: string,
    options?: { baseUrl?: string | null; sig?: string | null }
  ): string {
    if (!kind?.trim() || !token?.trim()) {
      throw new Error('kind and token are required');
    }
    const base = cleanBaseUrl(options?.baseUrl);
    const sig = normalizeSig(options?.sig);
    const query = sig ? `?sig=${encodeURIComponent(sig)}` : '';
    return `${base}/verify/${encodeURIComponent(kind.trim().toLowerCase())}/${encodeURIComponent(token.trim())}${query}`;
  },

  /**
   * Generates canonical prescription verification URL:
   * - /verify/rx/{token}
   */
  verifyRx(token: string, options?: { baseUrl?: string | null }): string {
    return publicRoutes.verifyKind('rx', token, options);
  },

  /**
   * Generates canonical guest teleconsultation landing URL:
   * - /teleconsult/join
   * - /teleconsult/join?token=...
   */
  teleconsultJoin(options?: { baseUrl?: string | null; token?: string | null }): string {
    const base = cleanBaseUrl(options?.baseUrl);
    const token = options?.token?.trim();
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    return `${base}/teleconsult/join${query}`;
  },

  /**
   * Generates canonical guest teleconsultation invitation URL:
   * - /teleconsult/join/{token}
   */
  teleconsultInvite(token: string, options?: { baseUrl?: string | null }): string {
    if (!token?.trim()) {
      throw new Error('token is required');
    }
    const base = cleanBaseUrl(options?.baseUrl);
    return `${base}/teleconsult/join/${encodeURIComponent(token.trim())}`;
  },

  /**
   * Generates mobile app deep link for clinic join intake:
   * - clinicez://join
   * - clinicez://join?code=...
   */
  mobileJoinDeepLink(code?: string | null): string {
    const trimmed = code?.trim();
    return trimmed ? `clinicez://join?code=${encodeURIComponent(trimmed)}` : 'clinicez://join';
  },

  /**
   * Validates join code format:
   * - Unprefixed alphanumeric: 3 to 50 characters (e.g. APEX2026, VIP888)
   * - Facility-prefixed: 4-character alphanumeric prefix + hyphen + 1 to 45 alphanumeric characters (total length <= 50)
   */
  isValidJoinCode(code?: string | null): boolean {
    if (!code) return false;
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 3 || trimmed.length > 50) return false;
    const unprefixedRegex = /^[A-Z0-9]{3,50}$/;
    const prefixedRegex = /^[A-Z0-9]{4}-[A-Z0-9]{1,45}$/;
    return unprefixedRegex.test(trimmed) || prefixedRegex.test(trimmed);
  },

  /**
   * Normalizes join code by trimming and converting to uppercase.
   */
  normalizeJoinCode(code?: string | null): string {
    return code ? code.trim().toUpperCase() : '';
  },
};
