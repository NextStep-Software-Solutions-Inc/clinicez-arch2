import { describe, expect, test } from 'bun:test';
import {
  claimErrorMessage,
  describeDispenseBlock,
  describePaymentChip,
  describeStatusChip,
  dispenseBlockedMessage,
  isRejectedItem,
  isReviewable,
} from '../utils/prescriptionPresentation';

const apiError = (status: number, code: string, message = 'server message') => ({
  status,
  message,
  errors: [{ code }],
});

describe('describeStatusChip', () => {
  test('labels the acceptance statuses', () => {
    expect(describeStatusChip('Accepted')).toEqual({ label: 'Accepted', tone: 'info' });
    expect(describeStatusChip('PartiallyAccepted')).toEqual({ label: 'Partially accepted', tone: 'info' });
    expect(describeStatusChip('Rejected')).toEqual({ label: 'Rejected', tone: 'danger' });
  });

  test('keeps the existing statuses readable', () => {
    expect(describeStatusChip('Pending').label).toBe('Pending');
    expect(describeStatusChip('Dispensed').tone).toBe('success');
  });
});

describe('describePaymentChip', () => {
  test('flags orders awaiting payment and paid orders', () => {
    expect(describePaymentChip('AwaitingPayment')).toEqual({ label: 'Awaiting payment', tone: 'warning' });
    expect(describePaymentChip('Paid')).toEqual({ label: 'Paid', tone: 'success' });
  });

  test('shows billing corrections on dispensed orders as neutral chips', () => {
    expect(describePaymentChip('Voided')).toEqual({ label: 'Voided', tone: 'neutral' });
    expect(describePaymentChip('Refunded')).toEqual({ label: 'Refunded', tone: 'neutral' });
  });

  test('shows nothing for NotRequired unless the detail view asks for it', () => {
    expect(describePaymentChip('NotRequired')).toBeNull();
    expect(describePaymentChip('NotRequired', { showNotRequired: true })).toEqual({
      label: 'No payment required',
      tone: 'neutral',
    });
  });
});

describe('describeDispenseBlock', () => {
  test('explains why dispensing is blocked', () => {
    expect(describeDispenseBlock('payment_required')).toBe('Awaiting payment at the cashier');
    expect(describeDispenseBlock('acceptance_required')).toBe('Accept the prescription first');
  });

  test('is null when nothing blocks dispensing', () => {
    expect(describeDispenseBlock(null)).toBeNull();
  });
});

describe('dispenseBlockedMessage', () => {
  test('recognises the payment and acceptance blocks', () => {
    expect(dispenseBlockedMessage(apiError(409, 'payment_required'))).toContain('awaiting payment');
    expect(dispenseBlockedMessage(apiError(409, 'acceptance_required'))).toContain('accept the prescription first');
  });

  test('leaves other failures to the generic handler', () => {
    expect(dispenseBlockedMessage(apiError(409, 'insufficient_stock'))).toBeNull();
    expect(dispenseBlockedMessage({ status: 500, message: 'boom', errors: [] })).toBeNull();
  });
});

describe('claimErrorMessage', () => {
  test.each([
    ['claim_not_found', 'not recognised'],
    ['claim_already_redeemed', 'already been claimed'],
    ['claim_expired', 'expired'],
    ['claim_forbidden', 'different pharmacy'],
    ['claim_wrong_facility_type', 'not a pharmacy prescription'],
  ])('maps %s to a friendly message', (code, fragment) => {
    expect(claimErrorMessage(apiError(400, code))).toContain(fragment);
  });

  test('falls back to the server message for unknown codes', () => {
    expect(claimErrorMessage(apiError(500, 'something_else', 'Server exploded'))).toBe('Server exploded');
  });
});

describe('order predicates', () => {
  test('only pending orders can be reviewed', () => {
    expect(isReviewable({ status: 'Pending' })).toBe(true);
    expect(isReviewable({ status: 'Accepted' })).toBe(false);
  });

  test('detects items that were not accepted', () => {
    expect(isRejectedItem({ status: 'Rejected' })).toBe(true);
    expect(isRejectedItem({ status: 'Pending' })).toBe(false);
  });
});
