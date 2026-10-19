import { describe, expect, test } from 'bun:test';
import { normalizeServerUrl, probeServer, resolveRuntimeApiUrl } from '../services/serverUrl';

describe('normalizeServerUrl', () => {
  test('adds http:// to a bare LAN address', () => {
    expect(normalizeServerUrl('192.168.1.20:5245')).toBe('http://192.168.1.20:5245');
  });

  test('keeps https and strips trailing slashes, query, hash and credentials', () => {
    expect(normalizeServerUrl('https://clinic.local/?a=1#x')).toBe('https://clinic.local');
    expect(normalizeServerUrl('http://user:pw@10.0.0.5:8080///')).toBe('http://10.0.0.5:8080');
  });

  test('strips a trailing /api/v1', () => {
    expect(normalizeServerUrl('http://10.0.0.5:5245/api/v1')).toBe('http://10.0.0.5:5245');
    expect(normalizeServerUrl('http://10.0.0.5/clinic/api/v1/')).toBe('http://10.0.0.5/clinic');
  });

  test('rejects empty, non-http and malformed values', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
    expect(normalizeServerUrl(null)).toBeNull();
    expect(normalizeServerUrl(undefined)).toBeNull();
    expect(normalizeServerUrl('ftp://host')).toBeNull();
    expect(normalizeServerUrl('http://')).toBeNull();
  });
});

describe('resolveRuntimeApiUrl', () => {
  test('empty or "/" means the page origin', () => {
    expect(resolveRuntimeApiUrl('', 'http://clinic.lan')).toBe('http://clinic.lan');
    expect(resolveRuntimeApiUrl('/', 'http://clinic.lan')).toBe('http://clinic.lan');
    expect(resolveRuntimeApiUrl('/', null)).toBeNull();
  });

  test('absolute values are normalized; non-strings are ignored', () => {
    expect(resolveRuntimeApiUrl('10.0.0.9:5245', 'http://x')).toBe('http://10.0.0.9:5245');
    expect(resolveRuntimeApiUrl(42, 'http://x')).toBeNull();
  });
});

describe('probeServer', () => {
  test('reachable on 2xx and calls /health', async () => {
    let called = '';
    const fakeFetch = (async (url: string) => {
      called = url;
      return { ok: true, status: 200 } as Response;
    }) as unknown as typeof fetch;
    const result = await probeServer('http://10.0.0.5:5245/', fakeFetch);
    expect(result.reachable).toBe(true);
    expect(called).toBe('http://10.0.0.5:5245/health');
  });

  test('unreachable on a non-2xx response', async () => {
    const fakeFetch = (async () => ({ ok: false, status: 502 }) as Response) as unknown as typeof fetch;
    const result = await probeServer('http://x', fakeFetch);
    expect(result.reachable).toBe(false);
    expect(result.status).toBe(502);
  });

  test('unreachable when the network fails', async () => {
    const fakeFetch = (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch;
    const result = await probeServer('http://x', fakeFetch);
    expect(result.reachable).toBe(false);
    expect(result.message).toContain('Could not connect');
  });

  test('reports a timeout when the request is aborted', async () => {
    const fakeFetch = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      })) as unknown as typeof fetch;
    const result = await probeServer('http://x', fakeFetch, 10);
    expect(result.reachable).toBe(false);
    expect(result.message).toContain('did not respond in time');
  });
});
