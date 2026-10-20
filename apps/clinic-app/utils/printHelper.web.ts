import type { PrintLetterhead, ReceiptData, InvoicePdfData, ReceiptItem } from './printHelper';
import {
  buildReceiptHtml,
  buildThermalReceiptHtml,
  buildProfessionalReceiptHtml,
  buildInvoicePdfHtml,
} from './receiptHtml';
import { openDocument } from '../services/documentOpener';

export type { PrintLetterhead, ReceiptData, InvoicePdfData, ReceiptItem } from './printHelper';

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are fetched and shown through a blob URL.
  return openDocument(url);
}

function openWebPrintWindow(html: string, width = 800, height = 900) {
  if (typeof window === 'undefined') return;

  const printWindow = window.open('', '_blank', `width=${width},height=${height}`);
  if (!printWindow) {
    window.print();
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();
  // Printed from here rather than by a script inside the page, so the app's strict Content-Security-Policy holds.
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  openWebPrintWindow(buildReceiptHtml(title, details, letterhead), 450, 600);
}

export function printThermalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  openWebPrintWindow(buildThermalReceiptHtml(data, letterhead), 380, 650);
}

export function printProfessionalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  openWebPrintWindow(buildProfessionalReceiptHtml(data, letterhead), 820, 950);
}

export function printInvoicePdf(invoice: InvoicePdfData, letterhead?: PrintLetterhead) {
  openWebPrintWindow(buildInvoicePdfHtml(invoice, letterhead), 820, 950);
}
