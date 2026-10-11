import { describe, expect, test } from 'bun:test';
import { normalizeServerUrl, probeServer } from '../services/serverUrl';

describe('normalizeServerUrl', () => {
  test('adds http:// to a bare LAN address', () => {
    expect(normalizeServerUrl('192.168.1.20:5245')).toBe('http://192.168.1.20:5245');
  });

  test('keeps https and strips trailing slashes, /api/v1, credentials, query and hash', () => {
    expect(normalizeServerUrl('https://lab.example.com/')).toBe('https://lab.example.com');
    expect(normalizeServerUrl('http://10.0.0.5:5245/api/v1/')).toBe('http://10.0.0.5:5245');
    expect(normalizeServerUrl('http://user:pass@10.0.0.5:5245/?x=1#top')).toBe('http://10.0.0.5:5245');
  });

  test('keeps a path prefix behind an ingress', () => {
    expect(normalizeServerUrl('https://example.com/lab/api/v1')).toBe('https://example.com/lab');
  });

  test('rejects empty input and non-http schemes', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
    expect(normalizeServerUrl(null)).toBeNull();
    expect(normalizeServerUrl(undefined)).toBeNull();
    expect(normalizeServerUrl('ftp://10.0.0.5')).toBeNull();
    expect(normalizeServerUrl('javascript://x')).toBeNull();
  });
});

describe('probeServer', () => {
  test('is reachable on a 2xx /health', async () => {
    let requested = '';
    const fetchImpl = (async (input: RequestInfo | URL) => {
      requested = String(input);
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245/', fetchImpl);

    expect(requested).toBe('http://10.0.0.5:5245/health');
    expect(result).toEqual({ reachable: true, status: 200 });
  });

  test('reports a non-2xx response', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', fetchImpl);

    expect(result.reachable).toBe(false);
    expect(result.status).toBe(503);
  });

  test('reports a connection failure', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', fetchImpl);

    expect(result.reachable).toBe(false);
    expect(result.message).toContain('Could not connect');
  });

  test('reports a timeout', async () => {
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      })) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', fetchImpl, 20);

    expect(result.reachable).toBe(false);
    expect(result.message).toContain('did not respond in time');
  });
});
