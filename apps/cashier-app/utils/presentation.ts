import type { InvoiceStatus, PaymentMethod, DiscountKind, FacilityKind } from '../types/billing';

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ChipSpec {
  label: string;
  tone: ChipTone;
}

export function invoiceChip(status: InvoiceStatus): ChipSpec {
  switch (status) {
    case 'Open':
      return { label: 'Unpaid', tone: 'warning' };
    case 'PartiallyPaid':
      return { label: 'Partly paid', tone: 'info' };
    case 'Paid':
      return { label: 'Paid', tone: 'success' };
    case 'Void':
      return { label: 'Void', tone: 'neutral' };
    case 'Refunded':
      return { label: 'Refunded', tone: 'danger' };
  }
}

export const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'GCash', label: 'GCash' },
  { value: 'Maya', label: 'Maya' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Other', label: 'Other' },
];

export const DISCOUNT_KINDS: ReadonlyArray<{ value: DiscountKind; label: string; statutory: boolean }> = [
  { value: 'Senior', label: 'Senior citizen (20%)', statutory: true },
  { value: 'Pwd', label: 'PWD (20%)', statutory: true },
  { value: 'Promo', label: 'Promo', statutory: false },
  { value: 'Other', label: 'Other', statutory: false },
];

export function facilityLabel(kind: FacilityKind): string {
  switch (kind) {
    case 'Clinic':
      return 'Clinic';
    case 'Laboratory':
      return 'Laboratory';
    case 'Pharmacy':
      return 'Pharmacy';
    case 'Organization':
      return 'Organization';
  }
}

/** Local calendar date as `yyyy-MM-dd` (the report's day boundaries are local). */
export function localDateString(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function isDateString(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

/** The device's UTC offset in minutes (east positive), as the report endpoint expects. */
export function deviceUtcOffsetMinutes(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}
