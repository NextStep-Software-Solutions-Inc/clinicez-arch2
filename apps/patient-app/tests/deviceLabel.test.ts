import { describe, expect, test } from 'bun:test';
import { resolveDeviceId, summarizeUserAgent, type DeviceIdStore } from '../services/devices/deviceLabel';

const UA = {
  chromeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  edgeWindows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

describe('summarizeUserAgent', () => {
  test('names browser and operating system', () => {
    expect(summarizeUserAgent(UA.chromeWindows)).toBe('Chrome on Windows');
    expect(summarizeUserAgent(UA.edgeWindows)).toBe('Edge on Windows');
    expect(summarizeUserAgent(UA.firefoxLinux)).toBe('Firefox on Linux');
    expect(summarizeUserAgent(UA.safariMac)).toBe('Safari on macOS');
    expect(summarizeUserAgent(UA.safariIphone)).toBe('Safari on iOS');
    expect(summarizeUserAgent(UA.chromeAndroid)).toBe('Chrome on Android');
  });

  test('falls back to a generic label', () => {
    expect(summarizeUserAgent('')).toBe('Web browser');
    expect(summarizeUserAgent('curl/8.0')).toBe('Web browser');
  });
});

describe('resolveDeviceId', () => {
  function fakeStore(initial: string | null) {
    let value = initial;
    let writes = 0;
    const store: DeviceIdStore = {
      get: async () => value,
      set: async (id) => {
        value = id;
        writes += 1;
      },
    };
    return { store, writes: () => writes };
  }

  test('returns the stored id without generating a new one', async () => {
    const { store, writes } = fakeStore('existing-id');
    let generated = 0;
    const id = await resolveDeviceId(store, () => {
      generated += 1;
      return 'new-id';
    });
    expect(id).toBe('existing-id');
    expect(generated).toBe(0);
    expect(writes()).toBe(0);
  });

  test('creates and persists once, then stays stable', async () => {
    const { store, writes } = fakeStore(null);
    let generated = 0;
    const generate = () => {
      generated += 1;
      return `id-${generated}`;
    };
    const first = await resolveDeviceId(store, generate);
    const second = await resolveDeviceId(store, generate);
    expect(first).toBe('id-1');
    expect(second).toBe('id-1');
    expect(generated).toBe(1);
    expect(writes()).toBe(1);
  });
});
