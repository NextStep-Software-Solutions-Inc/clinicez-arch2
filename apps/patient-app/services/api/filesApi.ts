import { ensureApiPrefix, joinApiUrl } from '@shared/safe';
import type { DocumentTypeResponse } from '../files/types';
import { api } from './apiClient';

export function hasFileApi(): boolean {
  return ensureApiPrefix(process.env.EXPO_PUBLIC_API_URL ?? '').length > 0;
}

export interface RemoteFileRecordDto {
  id: string;
  clientId: string;
  fileName: string;
  mimeType?: string | null;
  extension?: string | null;
  sizeBytes: number;
  documentTypeId: string;
  documentTypeName?: string | null;
  title: string;
  documentDate?: string | null;
  facilityName?: string | null;
  notes?: string | null;
  uploadedAt: string;
  storageKey: string;
}

export function fetchDocumentTypes(
  getToken: () => Promise<string | null>
): Promise<DocumentTypeResponse[]> {
  return api.get<DocumentTypeResponse[]>(getToken, '/document-types');
}

export function fetchPatientRecords(
  patientId: string,
  getToken: () => Promise<string | null>,
  options?: { documentTypeId?: string; searchTerm?: string }
) {
  const params = new URLSearchParams();
  if (options?.documentTypeId) params.set('documentTypeId', options.documentTypeId);
  if (options?.searchTerm) params.set('searchTerm', options.searchTerm);
  const qs = params.toString() ? `?${params.toString()}` : '';
  return api.get<RemoteFileRecordDto[]>(getToken, `/patients/${patientId}/records${qs}`);
}

export function deletePatientRecord(
  patientId: string,
  fileId: string,
  getToken: () => Promise<string | null>
) {
  return api.delete(getToken, `/patients/${patientId}/records/${fileId}`);
}

export function getPatientRecordStreamUrl(patientId: string, fileId: string): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  return joinApiUrl(baseUrl, `/api/v1/patients/${patientId}/records/${fileId}/stream`);
}
