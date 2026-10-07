import { Alert } from 'react-native';
import { openDocument } from '../services/documentOpener';

/**
 * Facility letterhead printed around a receipt. Every field is optional so callers
 * can pass `useClinic().letterhead` straight through; empty values are skipped.
 */
export interface PrintLetterhead {
  header?: string;
  subHeader?: string;
  address?: string;
  contact?: string;
  footer?: string;
}

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are downloaded with it and handed to the share sheet.
  return openDocument(url);
}

export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  const footer = letterhead?.footer?.trim();
  Alert.alert(title, footer ? `${details}\n\n${footer}` : details);
}
