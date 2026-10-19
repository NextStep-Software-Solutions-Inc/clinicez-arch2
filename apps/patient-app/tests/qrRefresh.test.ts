import { describe, expect, test } from 'bun:test';
import {
  QR_MIN_REFRESH_MS,
  createQrRefresher,
  refreshDelayMs,
  remainingFraction,
  remainingSeconds,
  type QrSession,
  type QrToken,
  type TimerApi,
} from '../services/sharing/qrRefresh';

interface Scheduled {
  id: number;
  at: number;
  callback: () => void;
}

/** Deterministic clock + timer queue standing in for setTimeout. */
function createFakeClock() {
  let time = 0;
  let nextId = 1;
  let queue: Scheduled[] = [];

  const timers: TimerApi = {
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      queue.push({ id, at: time + delayMs, callback });
      return id;
    },
    clearTimeout: (handle) => {
      queue = queue.filter((entry) => entry.id !== handle);
    },
  };

  return {
    timers,
    now: () => time,
    pending: () => queue.length,
    nextDelay: () => (queue.length === 0 ? null : Math.min(...queue.map((entry) => entry.at)) - time),
    advance: (ms: number) => {
      const target = time + ms;
      for (;;) {
        const due = queue.filter((entry) => entry.at <= target).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        queue = queue.filter((entry) => entry.id !== due.id);
        time = due.at;
        due.callback();
      }
      time = target;
    },
  };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(ttlSeconds: number, requestImpl?: () => Promise<QrToken>) {
  const clock = createFakeClock();
  const sessions: QrSession<QrToken>[] = [];
  const errors: unknown[] = [];
  let calls = 0;
  const refresher = createQrRefresher<QrToken>({
    request:
      requestImpl ??
      (async () => {
        calls += 1;
        return { token: `token-${calls}`, ttlSeconds };
      }),
    onSession: (session) => sessions.push(session),
    onError: (error) => errors.push(error),
    timers: clock.timers,
    now: clock.now,
  });
  return { clock, sessions, errors, refresher, calls: () => calls };
}

describe('refreshDelayMs', () => {
  test('refreshes at 70% of the ttl', () => {
    expect(refreshDelayMs(60)).toBe(42_000);
    expect(refreshDelayMs(120)).toBe(84_000);
  });

  test('never schedules faster than the minimum delay', () => {
    expect(refreshDelayMs(1)).toBe(QR_MIN_REFRESH_MS);
    expect(refreshDelayMs(0)).toBe(QR_MIN_REFRESH_MS);
  });
});

describe('countdown helpers', () => {
  const session: QrSession<QrToken> = {
    token: { token: 't', ttlSeconds: 60 },
    receivedAt: 1_000,
    refreshAt: 43_000,
    expiresAt: 61_000,
  };

  test('remainingFraction runs from 1 to 0 and is clamped', () => {
    expect(remainingFraction(session, 1_000)).toBe(1);
    expect(remainingFraction(session, 31_000)).toBe(0.5);
    expect(remainingFraction(session, 61_000)).toBe(0);
    expect(remainingFraction(session, 90_000)).toBe(0);
    expect(remainingFraction(session, 0)).toBe(1);
  });

  test('remainingSeconds rounds up and never goes negative', () => {
    expect(remainingSeconds(session, 1_000)).toBe(60);
    expect(remainingSeconds(session, 60_500)).toBe(1);
    expect(remainingSeconds(session, 70_000)).toBe(0);
  });
});

describe('createQrRefresher', () => {
  test('requests immediately and schedules the next refresh at 70% of the ttl', async () => {
    const { clock, sessions, refresher } = setup(60);
    refresher.start();
    await flush();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].token.token).toBe('token-1');
    expect(sessions[0].expiresAt - sessions[0].receivedAt).toBe(60_000);
    expect(sessions[0].refreshAt - sessions[0].receivedAt).toBe(42_000);
    expect(clock.nextDelay()).toBe(42_000);
  });

  test('keeps rotating: a new token arrives every 70% of the ttl', async () => {
    const { clock, sessions, refresher } = setup(60);
    refresher.start();
    await flush();

    clock.advance(41_999);
    await flush();
    expect(sessions).toHaveLength(1);

    clock.advance(1);
    await flush();
    expect(sessions).toHaveLength(2);
    expect(sessions[1].token.token).toBe('token-2');

    clock.advance(42_000);
    await flush();
    expect(sessions).toHaveLength(3);
    refresher.stop();
  });

  test('stop cancels the pending refresh', async () => {
    const { clock, sessions, refresher } = setup(60);
    refresher.start();
    await flush();
    refresher.stop();

    expect(clock.pending()).toBe(0);
    clock.advance(120_000);
    await flush();
    expect(sessions).toHaveLength(1);
  });

  test('stop discards a response that is still in flight', async () => {
    let resolveRequest: (token: QrToken) => void = () => undefined;
    const { clock, sessions, refresher } = setup(
      60,
      () => new Promise<QrToken>((resolve) => (resolveRequest = resolve)),
    );
    refresher.start();
    refresher.stop();
    resolveRequest({ token: 'late', ttlSeconds: 60 });
    await flush();

    expect(sessions).toHaveLength(0);
    expect(clock.pending()).toBe(0);
  });

  test('errors are reported and retried after the retry delay', async () => {
    let attempt = 0;
    const { clock, sessions, errors, refresher } = setup(60, async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('offline');
      return { token: 'recovered', ttlSeconds: 60 };
    });
    refresher.start();
    await flush();

    expect(errors).toHaveLength(1);
    expect(sessions).toHaveLength(0);

    clock.advance(5_000);
    await flush();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token.token).toBe('recovered');
    refresher.stop();
  });

  test('restarting does not leave two refresh loops running', async () => {
    const { clock, refresher, calls } = setup(60);
    refresher.start();
    await flush();
    refresher.start();
    await flush();

    expect(clock.pending()).toBe(1);
    clock.advance(42_000);
    await flush();
    expect(calls()).toBe(3);
    refresher.stop();
  });
});
