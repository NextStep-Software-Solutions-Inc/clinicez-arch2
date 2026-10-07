/**
 * Pure rules for the offline outbox (kept free of React Native imports so they are unit-testable).
 *
 * Outcome of a failed attempt:
 * - `offline`: the server could not be reached. Nothing is wrong with the item; keep it and try again when the
 *   connection returns. These never count towards the attempt limit (a clinic can be offline for days).
 * - `retry`: the server answered with a transient error (5xx, 429, ...). Retried with exponential backoff, up to
 *   `MAX_ATTEMPTS` times.
 * - `dead`: the server rejected the item itself (validation, conflict, forbidden). Retrying cannot help, so it is parked
 *   in the failed list for a person to fix or discard.
 */
export type FailureKind = 'offline' | 'retry' | 'dead';

export const MAX_ATTEMPTS = 8;
export const BASE_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 5 * 60_000;

const TRANSIENT_STATUSES = new Set([401, 408, 425, 429]);

export function classifyFailure(status: number): FailureKind {
  if (status === 0) return 'offline';
  if (status === 502 || status === 503 || status === 504) return 'offline';
  if (status >= 500 || TRANSIENT_STATUSES.has(status)) return 'retry';
  return 'dead';
}

/** True when saving locally and syncing later is the right response to this failure. */
export function shouldQueueOffline(status: number): boolean {
  return classifyFailure(status) === 'offline';
}

/** Delay before attempt number `attempts + 1`: 5s, 10s, 20s ... capped at five minutes. */
export function backoffDelayMs(attempts: number): number {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** exponent);
}

export function isDue(nextAttemptAt: string | null | undefined, now: Date = new Date()): boolean {
  if (!nextAttemptAt) return true;
  const due = Date.parse(nextAttemptAt);
  return Number.isNaN(due) || due <= now.getTime();
}

/** Whole years between the date of birth and `now`; 0 when the date is missing or invalid. */
export function ageFromDateOfBirth(dateOfBirth: string | undefined, now: Date = new Date()): number {
  if (!dateOfBirth) return 0;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return 0;
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age--;
  return Math.max(0, age);
}
