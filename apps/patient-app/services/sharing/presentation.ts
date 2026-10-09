import type { AccessGrantSource, AccessGrantStatus } from '../api/wireEnums';
import type { Chip } from '../documents/presentation';

/** Presentation mapping for access grants. Pure so it can be unit tested. */

const GRANT_STATUS_CHIPS: Record<AccessGrantStatus, Chip> = {
  Active: { label: 'Active', tone: 'success', icon: 'checkCircle' },
  Revoked: { label: 'Revoked', tone: 'danger', icon: 'lock' },
  Expired: { label: 'Expired', tone: 'neutral', icon: 'clock' },
};

const GRANT_SOURCE_LABELS: Record<AccessGrantSource, string> = {
  Qr: 'Shared by QR code',
  Booking: 'Shared with a booking',
  Manual: 'Added manually',
};

export function grantStatusChip(status: AccessGrantStatus): Chip {
  return GRANT_STATUS_CHIPS[status];
}

export function grantSourceLabel(source: AccessGrantSource): string {
  return GRANT_SOURCE_LABELS[source];
}

export function canRevokeGrant(status: AccessGrantStatus): boolean {
  return status === 'Active';
}

export function revokeConfirmationMessage(facilityName: string | null): string {
  const who = facilityName ?? 'This facility';
  return `${who} will no longer be able to fetch your records. Information it has already imported into its own chart stays there and cannot be taken back.`;
}
