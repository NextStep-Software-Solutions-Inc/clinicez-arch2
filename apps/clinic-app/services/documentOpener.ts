import { clinicApiClient } from './apiClient';
import { getApiBaseUrl } from './runtimeConfig';

/**
 * Opens a document (PDF, attachment) from the clinic API in a new tab.
 *
 * Every clinic endpoint now requires a signed-in session, and a plain `window.open(url)` cannot send an
 * Authorization header. So the file is fetched with the session token and shown through a short-lived blob URL.
 * URLs that do not belong to the clinic API are opened as-is.
 */
export async function openDocument(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const base = getApiBaseUrl();
  if (!base || !url.startsWith(base)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return true;
  }

  // Reserve the tab synchronously (inside the user's click) so popup blockers do not discard it after the download.
  const reserved = window.open('', '_blank');
  const [blob, error] = await clinicApiClient.getBlob(url);
  if (!blob || error) {
    reserved?.close();
    return false;
  }

  const objectUrl = URL.createObjectURL(blob);
  if (reserved) {
    reserved.location.href = objectUrl;
  } else {
    window.open(objectUrl, '_blank');
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
  return true;
}
