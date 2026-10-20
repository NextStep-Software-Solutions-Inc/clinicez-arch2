import { Alert } from 'react-native';
import * as Print from 'expo-print';
import { openDocument } from '../services/documentOpener';
import {
  buildReceiptHtml,
  buildThermalReceiptHtml,
  buildProfessionalReceiptHtml,
  buildInvoicePdfHtml,
} from './receiptHtml';
import type {
  PrintLetterhead,
  ReceiptData,
  InvoicePdfData,
  ReceiptItem,
} from './receiptHtml';

export type { PrintLetterhead, ReceiptData, InvoicePdfData, ReceiptItem } from './receiptHtml';

export async function openPrintableUrl(url: string): Promise<boolean> {
  // Clinic API documents need the session token, so they are downloaded with it and handed to the share sheet.
  return openDocument(url);
}

function handlePrintError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (/cancel|dismiss/i.test(message)) return;
  Alert.alert('Could not print', message || 'The print service is not available on this device.');
}

/** Opens the system print sheet (AirPrint / Android print service) with legacy receipt text. */
export function printReceiptDialog(title: string, details: string, letterhead?: PrintLetterhead) {
  Print.printAsync({ html: buildReceiptHtml(title, details, letterhead) }).catch(handlePrintError);
}

/** Prints a POS 58mm/80mm thermal paper receipt via AirPrint / Bluetooth / print service. */
export function printThermalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  Print.printAsync({ html: buildThermalReceiptHtml(data, letterhead) }).catch(handlePrintError);
}

/** Prints a formal A4/Letter official receipt PDF with BIR VAT breakdown and signature line. */
export function printProfessionalReceipt(data: ReceiptData, letterhead?: PrintLetterhead) {
  Print.printAsync({ html: buildProfessionalReceiptHtml(data, letterhead) }).catch(handlePrintError);
}

/** Prints or exports a Statement of Account / Approved Billing Invoice as a print-ready PDF. */
export function printInvoicePdf(invoice: InvoicePdfData, letterhead?: PrintLetterhead) {
  Print.printAsync({ html: buildInvoicePdfHtml(invoice, letterhead) }).catch(handlePrintError);
}
