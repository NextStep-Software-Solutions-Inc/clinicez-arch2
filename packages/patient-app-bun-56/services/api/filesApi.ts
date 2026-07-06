import type { FileApiConfigResponse, FileUploadIntentResponse } from '../files/types';
import { api } from './apiClient';

const baseUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, '') ?? '';

export function hasFileApi(): boolean {
  return baseUrl.length > 0;
}

export function fetchFileConfig(patientId: string, getToken: () => Promise<string | null>) {
  return api.get<FileApiConfigResponse>(getToken, `/patients/${patientId}/files/config`);
}

export function saveFileConfig(
  patientId: string,
  getToken: () => Promise<string | null>,
  encryptedMAK: string,
) {
  return api.post<{ success: true }>(getToken, `/patients/${patientId}/files/config`, { encryptedMAK });
}

export function createUploadIntent(
  patientId: string,
  getToken: () => Promise<string | null>,
  payload: Record<string, unknown>,
) {
  return api.post<FileUploadIntentResponse>(getToken, `/patients/${patientId}/files/uploads/presigned-url`, payload);
}

export function completeUpload(
  patientId: string,
  getToken: () => Promise<string | null>,
  serverFileId: string, // Unused but kept for signature compatibility
  payload: Record<string, unknown>,
) {
  return api.post<{ success: true; serverUpdatedAt?: number; wrappedKeyJson?: string }>(
    getToken,
    `/patients/${patientId}/files/uploads/complete`,
    payload
  );
}

