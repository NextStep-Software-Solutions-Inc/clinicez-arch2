/**
 * One idempotency key per payment *attempt*. A retry of the same payment (same bill, method, amount, reference...) after a
 * network failure or timeout reuses the key, so billing-api returns the original payment instead of charging twice. A
 * changed payment, or a payment that went through, starts a new key.
 */

export interface PaymentAttempt {
  signature: string;
  key: string;
}

export function newIdempotencyKey(): string {
  const cryptoApi = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();

  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function paymentSignature(parts: ReadonlyArray<string | number | null>): string {
  return parts.map((p) => (p === null ? '' : String(p))).join('|');
}

/** The key to send for a payment: the previous one when it is the same payment, a new one otherwise. */
export function attemptFor(previous: PaymentAttempt | null, signature: string): PaymentAttempt {
  if (previous && previous.signature === signature) return previous;
  return { signature, key: newIdempotencyKey() };
}

/** An outcome that may mean the payment was recorded (no answer, or a server error): keep the key and retry. */
export function isIndeterminate(status: number): boolean {
  return status === 0 || status === 408 || status >= 500;
}
