import type { ApiError } from '@shared/safe';
import type { LabRequisitionItem } from '../services/laboratoryService';

export type PaymentChipTone = 'paid' | 'blocked' | 'neutral';

export interface PaymentChip {
  label: string;
  tone: PaymentChipTone;
}

export const PAYMENT_REQUIRED_CODE = 'payment_required';

export const PAYMENT_REQUIRED_MESSAGE =
  'Payment required: this order is prepaid and has not been paid yet. Ask the patient to pay at the cashier, then refresh the payment status.';

const CLAIM_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  claim_not_found: 'This slip was not recognised. Check the QR code and try again.',
  claim_already_redeemed: 'This slip has already been used to claim an order.',
  claim_expired: 'This slip has expired. Ask the clinic to issue a new one.',
  claim_forbidden: 'This slip belongs to a different clinic account and cannot be claimed here.',
  claim_wrong_facility_type: 'This slip is not addressed to a laboratory.',
  claim_unavailable: 'The claim service is unavailable right now. Please try again shortly.',
};

/** The prepaid block is enforced by the API as HTTP 409 with the `payment_required` error code. */
export function isPaymentRequiredError(error: ApiError | null): boolean {
  return error?.status === 409 && error.errors.some((e) => e.code === PAYMENT_REQUIRED_CODE);
}

/** Prefers the fixed friendly claim message for a known error code, falling back to the server message. */
export function describeClaimError(error: ApiError): string {
  for (const fieldError of error.errors) {
    const friendly = CLAIM_ERROR_MESSAGES[fieldError.code];
    if (friendly) return friendly;
  }
  return error.message;
}

/** Message shown when an action on an order fails, with the payment block called out explicitly. */
export function describeActionError(error: ApiError): string {
  return isPaymentRequiredError(error) ? PAYMENT_REQUIRED_MESSAGE : error.message;
}

/** Null when the order carries no payment information (older orders or no payment policy). */
export function paymentChipFor(order: Pick<LabRequisitionItem, 'paymentPolicy' | 'paymentRequired' | 'paid' | 'stage'>): PaymentChip | null {
  if (order.stage === 'Rejected' || order.stage === 'Cancelled') return null;
  if (order.paid) return { label: 'Paid at cashier', tone: 'paid' };
  if (order.paymentRequired) return { label: 'Awaiting payment', tone: 'blocked' };
  if (order.paymentPolicy === 'Postpaid') return { label: 'Bill after results', tone: 'neutral' };
  return null;
}

export function formatMoney(amount: number | undefined, currency: string | undefined): string | null {
  if (amount === undefined || amount === null) return null;
  return `${currency ?? 'PHP'} ${amount.toFixed(2)}`;
}
