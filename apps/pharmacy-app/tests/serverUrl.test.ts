import { describe, expect, it } from 'bun:test';
import { normalizeServerUrl, probeServer } from '../services/serverUrl';

describe('normalizeServerUrl', () => {
  it('adds http:// when no scheme is given', () => {
    expect(normalizeServerUrl('192.168.1.20:5245')).toBe('http://192.168.1.20:5245');
  });

  it('keeps https and strips credentials, query, hash and trailing slashes', () => {
    expect(normalizeServerUrl('https://pharmacy.local/?a=1#x')).toBe('https://pharmacy.local');
    expect(normalizeServerUrl('http://user:pw@10.0.0.5:8080///')).toBe('http://10.0.0.5:8080');
  });

  it('strips a trailing /api/v1 so the stored value is always the origin', () => {
    expect(normalizeServerUrl('http://10.0.0.5:5245/api/v1')).toBe('http://10.0.0.5:5245');
    expect(normalizeServerUrl('http://10.0.0.5/pharmacy/api/v1/')).toBe('http://10.0.0.5/pharmacy');
  });

  it('rejects empty input, other schemes and garbage', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
    expect(normalizeServerUrl(null)).toBeNull();
    expect(normalizeServerUrl('ftp://10.0.0.5')).toBeNull();
    expect(normalizeServerUrl('http://')).toBeNull();
  });
});

describe('probeServer', () => {
  it('is reachable when /health answers 2xx', async () => {
    let requested = '';
    const fakeFetch = (async (input: RequestInfo | URL) => {
      requested = String(input);
      return new Response('ok', { status: 200 });
    }) as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245/', fakeFetch);

    expect(result).toEqual({ reachable: true, status: 200 });
    expect(requested).toBe('http://10.0.0.5:5245/health');
  });

  it('reports the HTTP status when the server answers with an error', async () => {
    const fakeFetch = (async () => new Response('no', { status: 503 })) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', fakeFetch);

    expect(result.reachable).toBe(false);
    expect(result.status).toBe(503);
  });

  it('explains a connection failure without leaking the raw error', async () => {
    const fakeFetch = (async () => {
      throw new Error('ECONNREFUSED 10.0.0.5:5245');
    }) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', fakeFetch);

    expect(result.reachable).toBe(false);
    expect(result.message).toContain('Could not connect');
    expect(result.message).not.toContain('ECONNREFUSED');
  });

  it('times out with a distinct message', async () => {
    const hanging = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
      })) as unknown as typeof fetch;

    const result = await probeServer('http://10.0.0.5:5245', hanging, 20);

    expect(result.reachable).toBe(false);
    expect(result.message).toContain('did not respond in time');
  });
});
