import { describe, expect, test } from 'bun:test';
import { attemptFor, isIndeterminate, newIdempotencyKey, paymentSignature } from '../utils/idempotency';

describe('payment idempotency', () => {
  test('a retry of the same payment reuses the key', () => {
    const signature = paymentSignature(['anchor-1', 'Cash', 100, '', null, null]);
    const first = attemptFor(null, signature);
    const retry = attemptFor(first, signature);
    expect(retry.key).toBe(first.key);
  });

  test('a changed payment gets a new key', () => {
    const first = attemptFor(null, paymentSignature(['anchor-1', 'Cash', 100, '', null, null]));
    const changed = attemptFor(first, paymentSignature(['anchor-1', 'Cash', 150, '', null, null]));
    expect(changed.key).not.toBe(first.key);
  });

  test('keys are unique', () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });

  test('only lost answers keep the key for a retry', () => {
    expect(isIndeterminate(0)).toBe(true);
    expect(isIndeterminate(408)).toBe(true);
    expect(isIndeterminate(503)).toBe(true);
    expect(isIndeterminate(400)).toBe(false);
    expect(isIndeterminate(409)).toBe(false);
    expect(isIndeterminate(403)).toBe(false);
  });
});
