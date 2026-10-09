import { describe, expect, test } from 'bun:test';
import { pollForOrder } from '../utils/claimFlow';

const notFound = { status: 404, message: 'not found', errors: [{ code: 'not_found' }] };
const noSleep = async () => {};

describe('pollForOrder', () => {
  test('returns as soon as the order exists', async () => {
    let calls = 0;
    const result = await pollForOrder(
      async () => {
        calls += 1;
        return calls < 3 ? [null, notFound] : [{ id: 'order-1' }, null];
      },
      { sleep: noSleep }
    );

    expect(result).toEqual({ status: 'found', value: { id: 'order-1' } });
    expect(calls).toBe(3);
  });

  test('times out after the bounded number of attempts when the order never arrives', async () => {
    let calls = 0;
    const result = await pollForOrder(
      async () => {
        calls += 1;
        return [null, notFound];
      },
      { intervalMs: 1500, timeoutMs: 20_000, sleep: noSleep }
    );

    expect(result).toEqual({ status: 'timeout' });
    expect(calls).toBe(14);
  });

  test('sleeps the configured interval between attempts only', async () => {
    const sleeps: number[] = [];
    await pollForOrder(async () => [null, notFound], {
      intervalMs: 1000,
      timeoutMs: 3000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  test('keeps polling through connectivity blips', async () => {
    let calls = 0;
    const result = await pollForOrder(
      async () => {
        calls += 1;
        return calls === 1
          ? [null, { status: 0, message: 'network', errors: [{ code: 'API_ERROR' }] }]
          : [{ id: 'order-2' }, null];
      },
      { sleep: noSleep }
    );

    expect(result).toEqual({ status: 'found', value: { id: 'order-2' } });
  });

  test('stops immediately on a real failure', async () => {
    let calls = 0;
    const forbidden = { status: 403, message: 'forbidden', errors: [{ code: 'FORBIDDEN' }] };
    const result = await pollForOrder(
      async () => {
        calls += 1;
        return [null, forbidden];
      },
      { sleep: noSleep }
    );

    expect(result).toEqual({ status: 'failed', error: forbidden });
    expect(calls).toBe(1);
  });

  test('stops when cancelled', async () => {
    const result = await pollForOrder(async () => [null, notFound], {
      sleep: noSleep,
      isCancelled: () => true,
    });

    expect(result).toEqual({ status: 'cancelled' });
  });
});
