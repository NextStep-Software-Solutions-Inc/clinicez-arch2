import type { PrintLetterhead } from './printHelper';
import { buildReceiptHtml } from './receiptHtml';
import { openDocument } from '../services/documentOpener';

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are fetched and shown through a blob URL.
  return openDocument(url);
}

export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', 'width=450,height=600');
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(buildReceiptHtml(title, details, letterhead));
  printWindow.document.close();
  // Printed from here rather than by a script inside the page, so the app's strict Content-Security-Policy holds.
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}
