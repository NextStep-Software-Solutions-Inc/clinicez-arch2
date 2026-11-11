// token-guard:ignore-file
/**
 * Utility functions for Patient Self-Enlistment, Join Link Security,
 * Expiration calculation, URL formatting, and Document Quarantine review.
 */

import { publicRoutes } from '@shared/safe';

export function generateRandomJoinCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export type ExpirationWindow = '24h' | '7d' | '30d' | 'never' | 'custom';

export const BLANK_PASSCODE_EXPIRATION_HELPER =
  'Enter or generate a Join Passcode first to set an expiration window.';

export const UUID_LIKE_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-/i;

export interface PublicJoinTenantContext {
  tenantSlug?: string | null;
  facilitySlug?: string | null;
}

export interface PublicJoinSlugSettings {
  tenantId?: string | null;
  tenantSlug?: string | null;
  facilitySlug?: string | null;
  clinicSlug?: string | null;
}

export interface PublicJoinSlugs {
  tenantSlug: string;
  facilitySlug: string;
}

/**
 * Returns a trimmed non-empty slug only when it is NOT a raw UUID.
 */
export function sanitizePublicJoinSlug(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || UUID_LIKE_REGEX.test(trimmed)) return null;
  return trimmed;
}

/**
 * Resolves public `/join/<tenantSlug>/<facilitySlug>` route slugs while strictly
 * preventing raw GUID/UUID `tenantId` values from leaking into public URLs (#168).
 */
export function resolvePublicJoinSlugs(
  ctx?: PublicJoinTenantContext | null,
  settings?: PublicJoinSlugSettings | null
): PublicJoinSlugs {
  const ctxTenant = sanitizePublicJoinSlug(ctx?.tenantSlug);
  const ctxFacility = sanitizePublicJoinSlug(ctx?.facilitySlug);
  const settingsTenant = sanitizePublicJoinSlug(settings?.tenantSlug);
  const settingsFacility =
    sanitizePublicJoinSlug((settings as any)?.facilitySlug) ||
    sanitizePublicJoinSlug((settings as any)?.clinicSlug);

  if (ctxTenant && ctxFacility) {
    return {
      tenantSlug: ctxTenant,
      facilitySlug: ctxFacility,
    };
  }

  if (!ctxTenant && ctxFacility) {
    return {
      tenantSlug: settingsTenant || ctxFacility || 'clinic',
      facilitySlug: settingsFacility || 'main',
    };
  }

  return {
    tenantSlug: ctxTenant || settingsTenant || 'clinic',
    facilitySlug: ctxFacility || settingsFacility || 'main',
  };
}

/**
 * Forces expiration window to `'never'` whenever `joinCode` is blank (#160),
 * matching backend persistence rules where empty passcodes cannot expire.
 */
export function resolveEffectiveExpirationWindow(
  joinCode: string | null | undefined,
  window: ExpirationWindow
): ExpirationWindow {
  if (!joinCode || joinCode.trim() === '') {
    return 'never';
  }
  return window;
}

export interface JoinLinkBaselineSettings {
  isJoinEnabled?: boolean | null;
  joinCode?: string | null;
  joinCodeExpiresAt?: string | null;
}

export interface JoinLinkFormBaseline {
  isEnabled: boolean;
  joinCode: string;
  expirationWindow: ExpirationWindow;
  customDate: Date | null;
  customDateStr: string;
}

/**
 * Derives normalized form baseline state from loaded clinic settings.
 */
export function deriveJoinLinkFormBaseline(
  settings?: JoinLinkBaselineSettings | null,
  nowMs: number = Date.now()
): JoinLinkFormBaseline {
  if (!settings) {
    return {
      isEnabled: true,
      joinCode: '',
      expirationWindow: 'never',
      customDate: null,
      customDateStr: '',
    };
  }

  const nextCode = (settings.joinCode ?? '').trim().toUpperCase();
  const isEnabled = settings.isJoinEnabled ?? true;

  if (nextCode.length > 0 && settings.joinCodeExpiresAt) {
    const expDate = new Date(settings.joinCodeExpiresAt);
    const customDateStr = Number.isNaN(expDate.getTime()) ? '' : expDate.toISOString().split('T')[0];
    const diffHours = (expDate.getTime() - nowMs) / (3600 * 1000);
    let expirationWindow: ExpirationWindow = 'custom';
    if (diffHours > 20 && diffHours <= 26) expirationWindow = '24h';
    else if (diffHours > 140 && diffHours <= 175) expirationWindow = '7d';
    else if (diffHours > 650 && diffHours <= 750) expirationWindow = '30d';

    return {
      isEnabled,
      joinCode: nextCode,
      expirationWindow,
      customDate: Number.isNaN(expDate.getTime()) ? null : expDate,
      customDateStr,
    };
  }

  return {
    isEnabled,
    joinCode: nextCode,
    expirationWindow: 'never',
    customDate: null,
    customDateStr: '',
  };
}

/**
 * Computes whether current Join Link form controls differ from the loaded settings baseline.
 */
export function isJoinLinkSettingsDirty(
  current: {
    isEnabled: boolean;
    joinCode: string;
    effectiveExpirationWindow: ExpirationWindow;
    customDateStr: string;
  },
  settings?: JoinLinkBaselineSettings | null,
  nowMs: number = Date.now()
): boolean {
  const normalizedCode = current.joinCode.trim().toUpperCase();
  if (!settings) {
    return current.isEnabled !== true || normalizedCode.length > 0;
  }

  const baseline = deriveJoinLinkFormBaseline(settings, nowMs);
  if (current.isEnabled !== baseline.isEnabled) return true;
  if (normalizedCode !== baseline.joinCode) return true;
  if (current.effectiveExpirationWindow !== baseline.expirationWindow) return true;
  if (
    current.effectiveExpirationWindow === 'custom' &&
    current.customDateStr !== baseline.customDateStr
  ) {
    return true;
  }

  return false;
}

export function computeJoinCodeExpiration(
  window: ExpirationWindow,
  customDate?: Date
): Date | null {
  const now = new Date();
  switch (window) {
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    case 'never':
      return null;
    default:
      return customDate || null;
  }
}

export function isJoinCodeActive(
  isEnabled: boolean,
  expiresAt: Date | string | null | undefined
): boolean {
  if (!isEnabled) return false;
  if (!expiresAt) return true;
  const expiry = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  return expiry.getTime() > Date.now();
}

export function formatReceptionCodeUrl(
  baseUrl: string,
  code: string
): string {
  return publicRoutes.join({ baseUrl, code });
}

export function formatReceptionQrUrl(
  baseUrl: string,
  tenantSlug: string,
  facilitySlug: string,
  code?: string
): string {
  return publicRoutes.facilityJoin(tenantSlug, facilitySlug, { baseUrl, code });
}

export function formatJoinCodeExpiration(expiresAt: Date | string | null | undefined): string {
  if (!expiresAt) return 'Never expires (Permanent link)';
  const date = typeof expiresAt === 'string' ? new Date(expiresAt) : expiresAt;
  const now = Date.now();
  const diff = date.getTime() - now;
  if (diff <= 0) return 'Expired';

  const days = Math.floor(diff / (24 * 3600 * 1000));
  const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
  const timeStr = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  if (days > 0) return `${timeStr} (in ${days}d ${hours}h)`;
  return `${timeStr} (in ${hours}h)`;
}

export interface QuarantinedDoc {
  id: string;
  title: string;
  verificationStatus: 'PendingVerification' | 'Verified' | 'Rejected';
  rejectionReason?: string;
}

export function reviewDocument(
  doc: QuarantinedDoc,
  isApproved: boolean,
  reason?: string
): QuarantinedDoc {
  if (isApproved) {
    return {
      ...doc,
      verificationStatus: 'Verified',
      rejectionReason: undefined,
    };
  } else {
    if (!reason || !reason.trim()) {
      throw new Error('A rejection reason is mandatory when rejecting outside documents');
    }
    return {
      ...doc,
      verificationStatus: 'Rejected',
      rejectionReason: reason.trim(),
    };
  }
}
