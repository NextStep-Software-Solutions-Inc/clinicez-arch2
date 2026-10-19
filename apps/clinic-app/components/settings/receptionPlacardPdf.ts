// token-guard:ignore-file
import { Platform } from 'react-native';
import { theme } from '../../constants/theme';
import { generateQrMatrix } from './qrGenerator';
import { buildReceptionPlacardHtml, type ReceptionPlacardData } from './receptionPlacardHtml';

function escapePdfText(value: string): string {
  return value
    .replace(/[\u2022\u00b7]/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function hexToPdfRgb(hex: string): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)}`;
}

function estimateTextWidth(text: string, fontSize: number, isMonospace = false): number {
  const avgFactor = isMonospace ? 0.6 : 0.52;
  return text.length * fontSize * avgFactor;
}

function drawCenteredText(
  ops: string[],
  text: string,
  y: number,
  font: 'F1' | 'F2' | 'F3' | 'F4',
  fontSize: number,
  colorHex: string,
  pageWidth = 612
) {
  const safe = text.trim();
  if (!safe) return;
  const isMono = font === 'F3' || font === 'F4';
  const width = estimateTextWidth(safe, fontSize, isMono);
  const x = Math.max(56, (pageWidth - width) / 2);
  ops.push(`${hexToPdfRgb(colorHex)} rg`);
  ops.push(`BT /${font} ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(safe)}) Tj ET`);
}

function drawLeftText(
  ops: string[],
  text: string,
  x: number,
  y: number,
  font: 'F1' | 'F2' | 'F3' | 'F4',
  fontSize: number,
  colorHex: string
) {
  const safe = text.trim();
  if (!safe) return;
  ops.push(`${hexToPdfRgb(colorHex)} rg`);
  ops.push(`BT /${font} ${fontSize} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(safe)}) Tj ET`);
}

/**
 * Generates a standalone, print-ready US Letter (612 x 792 pt) vector PDF 1.4 binary
 * for the clinic reception self-enlistment QR placard.
 */
export function buildReceptionPlacardPdfBytes(data: ReceptionPlacardData): Uint8Array {
  const pageWidth = 612;
  const facilityName = (data.letterhead?.header || data.facilityName || 'Clinic EZ Healthcare').toUpperCase();
  const subHeader = data.letterhead?.subHeader || 'Patient Self-Registration & Enlistment Station';
  const address = data.letterhead?.address;
  const contact = data.letterhead?.contact;
  const joinCode = data.joinCode?.trim() || '';
  const expiresAt = data.expiresAtFormatted?.trim() || '';

  const ops: string[] = [];

  // 1. Page background
  ops.push(`${hexToPdfRgb(theme.colors.surface)} rg`);
  ops.push(`0 0 612 792 re f`);

  // 2. Outer Placard Card Frame
  ops.push(`${hexToPdfRgb(theme.colors.surface)} rg`);
  ops.push(`${hexToPdfRgb(theme.colors.primary)} RG`);
  ops.push(`2.5 w`);
  ops.push(`46 44 520 704 re B`);

  // Top primary accent banner inside card
  ops.push(`${hexToPdfRgb(theme.colors.primary)} rg`);
  ops.push(`46 740 520 8 re f`);

  // 3. Facility Header
  drawCenteredText(ops, facilityName, 704, 'F2', 19, theme.colors.primaryDark, pageWidth);
  drawCenteredText(ops, subHeader, 684, 'F1', 11, theme.colors.textSecondary, pageWidth);
  if (address) {
    drawCenteredText(ops, address, 668, 'F1', 9.5, theme.colors.textSecondary, pageWidth);
  }

  // Header divider line
  ops.push(`${hexToPdfRgb(theme.colors.primaryLight)} RG`);
  ops.push(`1.5 w`);
  ops.push(`76 652 m 536 652 l S`);

  // 4. Headline & Subhead
  drawCenteredText(ops, 'WALK-IN PATIENT SELF-ENLISTMENT', 624, 'F2', 16, theme.colors.text, pageWidth);
  drawCenteredText(
    ops,
    'Point your smartphone camera at the QR code below to register your visit',
    604,
    'F1',
    10.5,
    theme.colors.textSecondary,
    pageWidth
  );

  // 5. Vector QR Code Card (centered 220 x 220 pt at x=196, y=364)
  const qrBoxX = 196;
  const qrBoxY = 364;
  const qrBoxSize = 220;
  ops.push(`${hexToPdfRgb(theme.colors.surface)} rg`);
  ops.push(`${hexToPdfRgb(theme.colors.border)} RG`);
  ops.push(`1.5 w`);
  ops.push(`${qrBoxX} ${qrBoxY} ${qrBoxSize} ${qrBoxSize} re B`);

  const qrMatrix = generateQrMatrix(data.qrUrl);
  const quietZone = 2;
  const totalModules = qrMatrix.size + quietZone * 2;
  const innerSize = 196;
  const cellSize = innerSize / totalModules;
  const qrStartX = qrBoxX + (qrBoxSize - innerSize) / 2;
  const qrTopY = qrBoxY + qrBoxSize - (qrBoxSize - innerSize) / 2;

  ops.push(`${hexToPdfRgb(theme.colors.text)} rg`);
  for (let r = 0; r < qrMatrix.size; r++) {
    for (let c = 0; c < qrMatrix.size; c++) {
      if (qrMatrix.modules[r][c]) {
        const mx = qrStartX + (c + quietZone) * cellSize;
        const my = qrTopY - (r + quietZone + 1) * cellSize;
        ops.push(`${mx.toFixed(2)} ${my.toFixed(2)} ${(cellSize + 0.08).toFixed(2)} ${(cellSize + 0.08).toFixed(2)} re`);
      }
    }
  }
  ops.push(`f`);

  // 6. Access Passcode Pill (if joinCode present)
  if (joinCode) {
    ops.push(`${hexToPdfRgb(theme.colors.primaryLight)} rg`);
    ops.push(`${hexToPdfRgb(theme.colors.primaryBorder)} RG`);
    ops.push(`1 w`);
    ops.push(`186 292 240 54 re B`);

    drawCenteredText(ops, 'ACCESS PASSCODE', 330, 'F2', 8.5, theme.colors.primaryDark, pageWidth);
    drawCenteredText(ops, joinCode, 304, 'F4', 20, theme.colors.primaryDark, pageWidth);

    if (expiresAt) {
      drawCenteredText(ops, `Passcode validity: ${expiresAt}`, 276, 'F1', 8.5, theme.colors.textSecondary, pageWidth);
    }
  }

  // 7. Instructions for Patients Box
  const stepsBoxY = 144;
  const stepsBoxH = 116;
  ops.push(`${hexToPdfRgb(theme.colors.surfaceSubtle)} rg`);
  ops.push(`${hexToPdfRgb(theme.colors.border)} RG`);
  ops.push(`1 w`);
  ops.push(`76 ${stepsBoxY} 460 ${stepsBoxH} re B`);

  drawLeftText(ops, 'INSTRUCTIONS FOR PATIENTS', 94, stepsBoxY + 92, 'F2', 10, theme.colors.textSecondary);
  drawLeftText(
    ops,
    '1. Scan QR code with your mobile camera or barcode scanner.',
    94,
    stepsBoxY + 68,
    'F1',
    10.5,
    theme.colors.text
  );
  drawLeftText(
    ops,
    '2. Fill in your patient demographics, PhilHealth PIN, and visit reason.',
    94,
    stepsBoxY + 44,
    'F1',
    10.5,
    theme.colors.text
  );
  drawLeftText(
    ops,
    '3. Receive your Queue Ticket pass and proceed to the triage nurse.',
    94,
    stepsBoxY + 20,
    'F1',
    10.5,
    theme.colors.text
  );

  // 8. Public Registration URL & Footer
  const displayUrl = data.qrUrl.length > 76 ? `${data.qrUrl.slice(0, 73)}...` : data.qrUrl;
  drawCenteredText(ops, displayUrl, 116, 'F3', 9, theme.colors.textMuted, pageWidth);

  ops.push(`${hexToPdfRgb(theme.colors.borderDark)} RG`);
  ops.push(`0.75 w`);
  ops.push(`76 96 m 536 96 l S`);

  const footerText = contact
    ? `Need assistance? Please approach the clinic reception desk. - Contact: ${contact}`
    : 'Need assistance? Please approach the clinic reception desk.';
  drawCenteredText(ops, footerText, 74, 'F1', 9.5, theme.colors.textSecondary, pageWidth);

  const contentStream = ops.join('\n');
  const encoder = new TextEncoder();
  const streamBytesLen = encoder.encode(contentStream).length;

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R /F4 7 0 R >> >> /Contents 8 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `7 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`,
    `8 0 obj\n<< /Length ${streamBytesLen} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += obj;
  }

  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return encoder.encode(pdf);
}

/**
 * Generates or downloads the Reception Placard PDF and opens it ready to be printed
 * across Web and Native platforms.
 */
export async function openReceptionPlacardPdf(
  data: ReceptionPlacardData,
  pdfUrl?: string
): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    // Reserve the tab synchronously inside the user's click so popup blockers do not discard it.
    const reserved = typeof window.open === 'function' ? window.open('', '_blank') : null;

    let pdfBlob: Blob | null = null;
    try {
      const { getApiBaseUrl } = await import('../../services/runtimeConfig');
      const { clinicApiClient } = await import('../../services/apiClient');
      const base = getApiBaseUrl();
      if (pdfUrl && base && pdfUrl.startsWith(base)) {
        const [serverBlob, error] = await clinicApiClient.getBlob(pdfUrl);
        if (serverBlob && !error && serverBlob.size > 0) {
          pdfBlob =
            serverBlob.type === 'application/pdf'
              ? serverBlob
              : new Blob([serverBlob], { type: 'application/pdf' });
        }
      }
    } catch {
      // Fall back to local vector PDF generation below
    }

    if (!pdfBlob) {
      const pdfBytes = buildReceptionPlacardPdfBytes(data);
      pdfBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    }

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const objectUrl = URL.createObjectURL(pdfBlob);
      if (reserved) {
        reserved.location.href = objectUrl;
      } else if (typeof window.open === 'function') {
        const opened = window.open(objectUrl, '_blank');
        if (!opened && typeof document !== 'undefined') {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = 'ReceptionPlacard.pdf';
          link.target = '_blank';
          document.body?.appendChild(link);
          link.click();
          document.body?.removeChild(link);
        }
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5 * 60_000);
      return true;
    }

    reserved?.close();
    return false;
  }

  // Native (Android / iOS)
  if (pdfUrl) {
    try {
      const { openPrintableUrl } = await import('../../utils/printHelper');
      const opened = await openPrintableUrl(pdfUrl);
      if (opened) return true;
    } catch {
      // Fall back to local PDF file generation below
    }
  }

  try {
    const { Directory, File, Paths } = await import('expo-file-system');
    const Sharing = await import('expo-sharing');
    const downloads = new Directory(Paths.cache, 'clinicez-documents');
    if (!downloads.exists) downloads.create();

    const pdfFile = new File(downloads, 'ReceptionPlacard.pdf');
    pdfFile.write(buildReceptionPlacardPdfBytes(data));

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfFile.uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
      return true;
    }
  } catch {
    // Fall back to expo-print PDF file generation below
  }

  try {
    const Print = await import('expo-print');
    const html = buildReceptionPlacardHtml(data);
    if (Print?.printToFileAsync) {
      const file = await Print.printToFileAsync({ html });
      if (file?.uri && Print?.printAsync) {
        await Print.printAsync({ uri: file.uri });
        return true;
      }
    }
    if (Print?.printAsync) {
      await Print.printAsync({ html });
      return true;
    }
  } catch {
    return false;
  }

  return false;
}
