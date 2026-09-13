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

export interface CreateUploadIntentRequest {
  fileId: string;
  documentTypeId: string;
  folderId?: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export function createUploadIntent(
  patientId: string,
  getToken: () => Promise<string | null>,
  payload: Record<string, unknown>,
) {
  return api.post<FileUploadIntentResponse>(getToken, `/patients/${patientId}/files/uploads/intent`, payload);
}

export function completeUpload(
  patientId: string,
  getToken: () => Promise<string | null>,
  payload: Record<string, unknown>,
) {
  return api.post<{ fileId: string }>(
    getToken,
    `/patients/${patientId}/files/uploads/complete`,
    payload
  );
}

export function fetchFiles(
  patientId: string,
  getToken: () => Promise<string | null>,
) {
  return api.get<{ folders: any[]; files: any[] }>(
    getToken,
    `/patients/${patientId}/files`
  );
}

export function getFileDownloadUrl(
  patientId: string,
  fileId: string,
  getToken: () => Promise<string | null>,
) {
  return api.get<{ downloadUrl: string }>(
    getToken,
    `/patients/${patientId}/files/${fileId}/download-url`
  );
}

