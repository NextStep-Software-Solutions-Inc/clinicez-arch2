import { Linking } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { joinApiUrl, resolveTenantContext } from '@shared/safe';
import { getApiBaseUrl } from './runtimeConfig';
import { ensureFreshToken, getAccessToken } from './authSession';

/**
 * Opens a document from the clinic API on a phone/tablet.
 *
 * The file is downloaded into the app cache with the session's bearer token, then handed to the system share sheet
 * (view in a PDF reader, print, save, send). URLs outside the clinic API are opened with the system handler.
 */
export async function openDocument(url: string, contentType?: string): Promise<boolean> {
  const base = getApiBaseUrl();
  const isClinicApi = (Boolean(base) && url.startsWith(base!)) || url.startsWith('/');
  if (!isClinicApi) {
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await ensureFreshToken();
    const token = getAccessToken();
    const context = resolveTenantContext();
    const downloads = new Directory(Paths.cache, 'clinicez-documents');
    if (!downloads.exists) downloads.create();

    const fullUrl = url.startsWith('/') && base ? joinApiUrl(base, url) : url;

    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (context.tenantSlug) headers['X-Tenant-Id'] = context.tenantSlug;
    if (context.facilitySlug) headers['X-Facility-Slug'] = context.facilitySlug;
    if (context.clinicId) headers['X-Clinic-Id'] = context.clinicId;

    const file = await File.downloadFileAsync(fullUrl, downloads, {
      headers,
      idempotent: true,
    });

    if (!(await Sharing.isAvailableAsync())) return false;
    const mimeType = contentType || 'application/pdf';
    await Sharing.shareAsync(file.uri, {
      mimeType,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Opens an in-memory document Blob (such as a dynamic backend QuestPDF preview) on native.
 */
export async function openDocumentBlob(blob: Blob, contentType?: string): Promise<boolean> {
  try {
    const downloads = new Directory(Paths.cache, 'clinicez-documents');
    if (!downloads.exists) downloads.create();

    const file = new File(downloads, `document-${Date.now()}.pdf`);
    const arrayBuffer = await blob.arrayBuffer();
    file.write(new Uint8Array(arrayBuffer));

    if (!(await Sharing.isAvailableAsync())) return false;
    const mimeType = contentType || 'application/pdf';
    await Sharing.shareAsync(file.uri, {
      mimeType,
      UTI: mimeType === 'application/pdf' ? 'com.adobe.pdf' : undefined,
    });
    return true;
  } catch {
    return false;
  }
}
