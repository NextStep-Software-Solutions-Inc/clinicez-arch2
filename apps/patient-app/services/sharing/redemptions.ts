export const SHARE_REDEMPTION_OPTIONS = [1, 2, 3, 5, 10] as const;
export type ShareRedemptions = (typeof SHARE_REDEMPTION_OPTIONS)[number];

export const DEFAULT_SHARE_REDEMPTIONS: ShareRedemptions = 1;

export const SHARE_REDEMPTIONS_EXPLANATION =
  'Each scan gives the clinic a fresh copy of the sections you picked. The QR still expires on its own.';

export function redemptionLabel(count: ShareRedemptions): string {
  return count === 1 ? '1 scan' : `${count} scans`;
}