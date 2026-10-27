import { clinicApiClient } from './apiClient';
import { getApiBaseUrl } from './runtimeConfig';

function triggerDownload(objectUrl: string, fallbackName?: string) {
  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.target = '_blank';
    const match = fallbackName?.match(/\/([^/?#]+)(?:[?#]|$)/);
    if (match && match[1]) {
      a.download = match[1].endsWith('.pdf') ? match[1] : `${match[1]}.pdf`;
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    // Graceful fallback if DOM is unavailable
  }
}

/**
 * Opens a document (PDF, attachment) from the clinic API in a new tab.
 *
 * Every clinic endpoint now requires a signed-in session, and a plain `window.open(url)` cannot send an
 * Authorization header. So the file is fetched with the session token and shown through a short-lived blob URL.
 * URLs that do not belong to the clinic API are opened as-is.
 */
export async function openDocument(url: string, _contentType?: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  const base = getApiBaseUrl();
  const isClinicApi = (Boolean(base) && url.startsWith(base!)) || url.startsWith('/');
  if (!isClinicApi) {
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

  const mimeType = _contentType || blob.type || 'application/pdf';
  const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const objectUrl = URL.createObjectURL(typedBlob);
  if (reserved && !reserved.closed) {
    try {
      reserved.location.href = objectUrl;
    } catch {
      const opened = window.open(objectUrl, '_blank');
      if (!opened) {
        triggerDownload(objectUrl, url);
      }
    }
  } else {
    const opened = window.open(objectUrl, '_blank');
    if (!opened) {
      triggerDownload(objectUrl, url);
    }
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
  return true;
}

/**
 * Opens an in-memory document Blob (such as a dynamic backend QuestPDF preview) in a new tab.
 */
export function openDocumentBlob(blob: Blob, _contentType?: string): boolean {
  if (typeof window === 'undefined') return false;
  const mimeType = _contentType || blob.type || 'application/pdf';
  const typedBlob = blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  const objectUrl = URL.createObjectURL(typedBlob);
  const opened = window.open(objectUrl, '_blank', 'noopener,noreferrer');
  if (!opened) {
    triggerDownload(objectUrl, 'document.pdf');
  }
  setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
  return true;
}
