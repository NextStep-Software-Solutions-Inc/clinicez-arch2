/**
 * Pure helpers for the server (API) address. No React Native imports so they are unit-testable with `bun test`.
 */

/**
 * Turns whatever a user typed into a clean server origin, or `null` when it cannot be a server address.
 *  - adds `http://` when no scheme was given (typical LAN entry: `192.168.1.20:5245`)
 *  - accepts only http/https
 *  - strips credentials, query, hash, trailing slashes and a trailing `/api/v1`
 */
export function normalizeServerUrl(input: string | null | undefined): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;

  const path = url.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
  return `${url.protocol}//${url.host}${path}`;
}

/** Resolves a runtime `apiUrl` value from `config.json`: `""`/`"/"` mean "same origin as the page". */
export function resolveRuntimeApiUrl(value: unknown, pageOrigin: string | null): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return pageOrigin;
  return normalizeServerUrl(trimmed);
}

export interface ServerProbeResult {
  reachable: boolean;
  status?: number;
  message?: string;
}

/** Checks `<serverUrl>/health`. Any 2xx means the clinic server is reachable on this network. */
export async function probeServer(
  serverUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 6000,
): Promise<ServerProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${serverUrl.replace(/\/+$/, '')}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain' },
      signal: controller.signal,
    });
    return response.ok
      ? { reachable: true, status: response.status }
      : { reachable: false, status: response.status, message: `Server responded with HTTP ${response.status}.` };
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      reachable: false,
      message: aborted
        ? 'The server did not respond in time. Check the address and that this device is on the same network.'
        : 'Could not connect. Check the address and that this device is on the same network.',
    };
  } finally {
    clearTimeout(timer);
  }
}
