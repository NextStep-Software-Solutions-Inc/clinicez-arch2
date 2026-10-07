import { Alert } from 'react-native';
import * as Print from 'expo-print';
import { openDocument } from '../services/documentOpener';
import { buildReceiptHtml } from './receiptHtml';
import type { PrintLetterhead } from './receiptHtml';

export type { PrintLetterhead } from './receiptHtml';

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are downloaded with it and handed to the share sheet.
  return openDocument(url);
}

/** Opens the system print sheet (AirPrint / Android print service) with the receipt. */
export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  Print.printAsync({ html: buildReceiptHtml(title, details, letterhead) }).catch((error: unknown) => {
    // Dismissing the print sheet rejects on some platforms; only report real failures.
    const message = error instanceof Error ? error.message : '';
    if (/cancel|dismiss/i.test(message)) return;
    Alert.alert('Could not print', message || 'The print service is not available on this device.');
  });
}
