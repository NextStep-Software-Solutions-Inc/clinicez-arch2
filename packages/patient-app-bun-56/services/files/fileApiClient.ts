import type { FileApiConfigResponse, FileUploadIntentResponse } from './types';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';

export function hasFileApi(): boolean {
  return baseUrl.length > 0;
}

class FileApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'FileApiError';
  }
}

async function authJson<T>(
  getToken: () => Promise<string | null>,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!baseUrl) {
    throw new FileApiError('File API URL is not configured.', 0, 'NO_API_URL');
  }

  const token = await getToken();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
      Authorization: token ? `Bearer ${token}` : '',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new FileApiError(payload.message ?? `Request failed with ${response.status}`, response.status, payload.code);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function fetchFileConfig(getToken: () => Promise<string | null>) {
  return authJson<FileApiConfigResponse>(getToken, '/v1/patient/files/config');
}

export function createUploadIntent(
  getToken: () => Promise<string | null>,
  payload: Record<string, unknown>,
) {
  return authJson<FileUploadIntentResponse>(getToken, '/v1/patient/files/uploads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function completeUpload(
  getToken: () => Promise<string | null>,
  serverFileId: string,
  payload: Record<string, unknown>,
) {
  return authJson<{ success: true; serverUpdatedAt?: number; wrappedKeyJson?: string }>(
    getToken,
    `/v1/patient/files/${serverFileId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}
