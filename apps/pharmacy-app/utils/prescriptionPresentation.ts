import type {
  DispenseBlockedReason,
  PaymentStatus,
  PrescriptionOrderDto,
  PrescriptionOrderStatus,
} from '../services/pharmacyService';

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface ChipSpec {
  label: string;
  tone: ChipTone;
}

/** The shape of a failed API call that the helpers below care about (matches `ApiError` from @shared/safe). */
export interface ApiErrorLike {
  status: number;
  message: string;
  errors: ReadonlyArray<{ code: string }>;
}

const STATUS_CHIPS: Record<PrescriptionOrderStatus, ChipSpec> = {
  Pending: { label: 'Pending', tone: 'warning' },
  Accepted: { label: 'Accepted', tone: 'info' },
  PartiallyAccepted: { label: 'Partially accepted', tone: 'info' },
  Rejected: { label: 'Rejected', tone: 'danger' },
  InPreparation: { label: 'In preparation', tone: 'info' },
  ReadyForPickup: { label: 'Ready for pickup', tone: 'info' },
  Dispensed: { label: 'Dispensed', tone: 'success' },
  Cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function describeStatusChip(status: PrescriptionOrderStatus): ChipSpec {
  return STATUS_CHIPS[status] ?? { label: status, tone: 'neutral' };
}

/**
 * Payment chip for an order. Orders that need no payment get no chip on queue rows; the detail view passes
 * `showNotRequired` to render a neutral "No payment required" chip instead.
 */
export function describePaymentChip(
  paymentStatus: PaymentStatus,
  options: { showNotRequired?: boolean } = {}
): ChipSpec | null {
  switch (paymentStatus) {
    case 'AwaitingPayment':
      return { label: 'Awaiting payment', tone: 'warning' };
    case 'Paid':
      return { label: 'Paid', tone: 'success' };
    case 'Voided':
      return { label: 'Voided', tone: 'neutral' };
    case 'Refunded':
      return { label: 'Refunded', tone: 'neutral' };
    default:
      return options.showNotRequired ? { label: 'No payment required', tone: 'neutral' } : null;
  }
}

export function describeDispenseBlock(reason: DispenseBlockedReason | null): string | null {
  switch (reason) {
    case 'payment_required':
      return 'Awaiting payment at the cashier';
    case 'acceptance_required':
      return 'Accept the prescription first';
    default:
      return null;
  }
}

/** A short, friendly message for a dispense attempt the server blocked, or `null` for any other failure. */
export function dispenseBlockedMessage(error: ApiErrorLike): string | null {
  const code = error.errors[0]?.code.toLowerCase();
  if (code === 'payment_required') {
    return 'Dispensing is blocked: this prescription is still awaiting payment at the cashier. Dispense once payment is recorded.';
  }
  if (code === 'acceptance_required') {
    return 'Dispensing is blocked: accept the prescription first, then dispense.';
  }
  return null;
}

/** Maps a claim failure to a message a pharmacy counter can act on. */
export function claimErrorMessage(error: ApiErrorLike): string {
  const code = error.errors[0]?.code.toLowerCase();
  switch (code) {
    case 'claim_not_found':
      return 'This prescription code was not recognised. Check the code and scan or enter it again.';
    case 'claim_already_redeemed':
      return 'This prescription has already been claimed. Check the queue for the order.';
    case 'claim_expired':
      return 'This prescription code has expired. Ask the patient to generate a new one.';
    case 'claim_forbidden':
      return 'This prescription was issued for a different pharmacy and cannot be claimed here.';
    case 'claim_wrong_facility_type':
      return 'This code is not a pharmacy prescription and cannot be claimed here.';
    default:
      return error.message || 'The prescription could not be claimed. Please try again.';
  }
}

export function isReviewable(order: Pick<PrescriptionOrderDto, 'status'>): boolean {
  return order.status === 'Pending';
}

export function isRejectedItem(item: { status: string }): boolean {
  return item.status === 'Rejected';
}

export function formatPeso(amount: number): string {
  return `₱${amount.toFixed(2)}`;
}
