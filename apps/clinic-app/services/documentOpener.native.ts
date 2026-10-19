import { Linking } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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
  if (!base || !url.startsWith(base)) {
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
    const downloads = new Directory(Paths.cache, 'clinicez-documents');
    if (!downloads.exists) downloads.create();

    const file = await File.downloadFileAsync(url, downloads, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
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
