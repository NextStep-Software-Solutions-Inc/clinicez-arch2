// token-guard:ignore-file
/**
 * Utility functions for Patient Self-Enlistment, Join Link Security,
 * Expiration calculation, URL formatting, and Document Quarantine review.
 */

export function generateRandomJoinCode(length: number = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export type ExpirationWindow = '24h' | '7d' | '30d' | 'never' | 'custom';

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

export function formatReceptionQrUrl(
  baseUrl: string,
  tenantSlug: string,
  facilitySlug: string,
  code?: string
): string {
  const cleanBase = baseUrl.replace(/\/+$/, '');
  const url = `${cleanBase}/join/${tenantSlug}/${facilitySlug}`;
  return code && code.trim() ? `${url}?code=${encodeURIComponent(code.trim())}` : url;
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
