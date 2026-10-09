import type { Chip } from '../documents/presentation';

/** Presentation mapping for access grants. Pure so it can be unit tested. */

export function grantStatusChip(status: string): Chip {
  switch (status) {
    case 'active':
      return { label: 'Active', tone: 'success', icon: 'checkCircle' };
    case 'revoked':
      return { label: 'Revoked', tone: 'danger', icon: 'lock' };
    case 'expired':
      return { label: 'Expired', tone: 'neutral', icon: 'clock' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function grantSourceLabel(source: string): string {
  switch (source) {
    case 'qr':
      return 'Shared by QR code';
    case 'booking':
      return 'Shared with a booking';
    case 'manual':
      return 'Added manually';
    default:
      return source;
  }
}

export function canRevokeGrant(status: string): boolean {
  return status === 'active';
}

export function revokeConfirmationMessage(facilityName: string | null): string {
  const who = facilityName ?? 'This facility';
  return `${who} will no longer be able to fetch your records. Information it has already imported into its own chart stays there and cannot be taken back.`;
}
