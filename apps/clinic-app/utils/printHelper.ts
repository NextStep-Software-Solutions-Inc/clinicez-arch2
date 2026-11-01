import { Alert } from 'react-native';
import { openDocument } from '../services/documentOpener';
import {
  buildReceiptHtml,
  buildThermalReceiptHtml,
  buildThermalQueueTicketHtml,
  buildProfessionalReceiptHtml,
  buildInvoicePdfHtml,
} from './receiptHtml';
import type {
  PrintLetterhead,
  ReceiptData,
  InvoicePdfData,
  ReceiptItem,
  ThermalQueueTicketData,
} from './receiptHtml';

export type {
  PrintLetterhead,
  ReceiptData,
  InvoicePdfData,
  ReceiptItem,
  ThermalQueueTicketData,
} from './receiptHtml';

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are downloaded with it and handed to the share sheet.
  return openDocument(url);
}

function handlePrintError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/cancel|dismiss/i.test(message)) return;
  Alert.alert('Could not print', message || 'The print service is not available on this device.');
}

async function printHtmlAsync(html: string): Promise<void> {
  try {
    const Print = await import('expo-print');
    await Print.printAsync({ html });
  } catch (error) {
    handlePrintError(error);
  }
}

/** Opens the system print sheet (AirPrint / Android print service) with legacy receipt text. */
export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  printHtmlAsync(buildReceiptHtml(title, details, letterhead));
}

/** Prints a POS 58mm/80mm thermal paper receipt via AirPrint / Bluetooth / print service. */
export function printThermalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  printHtmlAsync(buildThermalReceiptHtml(data, letterhead));
}

/** Prints a POS 58mm/80mm thermal paper queue ticket via AirPrint / Bluetooth / print service. */
export function printThermalQueueTicket(data: ThermalQueueTicketData, letterhead?: PrintLetterhead) {
  printHtmlAsync(buildThermalQueueTicketHtml(data, letterhead));
}

/** Prints a formal A4/Letter official receipt PDF with BIR VAT breakdown and signature line. */
export function printProfessionalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  printHtmlAsync(buildProfessionalReceiptHtml(data, letterhead));
}

/** Prints or exports a Statement of Account / Approved Billing Invoice as a print-ready PDF. */
export function printInvoicePdf(invoice: InvoicePdfData, letterhead?: PrintLetterhead) {
  printHtmlAsync(buildInvoicePdfHtml(invoice, letterhead));
}
