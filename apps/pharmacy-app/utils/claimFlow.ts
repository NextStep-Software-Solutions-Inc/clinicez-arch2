import type { ApiErrorLike } from './prescriptionPresentation';

export const CLAIM_POLL_INTERVAL_MS = 1500;
export const CLAIM_POLL_TIMEOUT_MS = 20_000;

export type PollResult<T> =
  | { status: 'found'; value: T }
  | { status: 'timeout' }
  | { status: 'failed'; error: ApiErrorLike }
  | { status: 'cancelled' };

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  isCancelled?: () => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Polls until the prescription delivered by a claim shows up in the queue. A 404 (not delivered yet) or a
 * connectivity blip (status 0) keeps polling; any other failure ends it immediately.
 */
export async function pollForOrder<T>(
  fetchOnce: () => Promise<[T | null, ApiErrorLike | null]>,
  options: PollOptions = {}
): Promise<PollResult<T>> {
  const intervalMs = options.intervalMs ?? CLAIM_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? CLAIM_POLL_TIMEOUT_MS;
  const sleep = options.sleep ?? defaultSleep;
  const attempts = Math.floor(timeoutMs / intervalMs) + 1;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (options.isCancelled?.()) return { status: 'cancelled' };

    const [value, error] = await fetchOnce();
    if (value) return { status: 'found', value };
    if (error && error.status !== 404 && error.status !== 0) return { status: 'failed', error };

    if (attempt < attempts - 1) await sleep(intervalMs);
  }

  return { status: 'timeout' };
}
