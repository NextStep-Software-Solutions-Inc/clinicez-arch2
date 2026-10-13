// token-guard:ignore-file
import { theme } from '../../constants/theme';
import type { PrintLetterhead } from '../../utils/receiptHtml';
import { generateQrMatrix, buildQrSvgString } from './qrGenerator';

export interface ReceptionPlacardData {
  facilityName: string;
  qrUrl: string;
  joinCode?: string | null;
  expiresAtFormatted?: string;
  letterhead?: PrintLetterhead;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildReceptionPlacardHtml(data: ReceptionPlacardData): string {
  const qrMatrix = generateQrMatrix(data.qrUrl);
  const qrSvg = buildQrSvgString(qrMatrix, theme.colors.text, theme.colors.surface);
  const facilityName = data.letterhead?.header || data.facilityName || 'ClinicEZ Healthcare';
  const subHeader = data.letterhead?.subHeader || 'Patient Self-Registration & Enlistment Station';
  const address = data.letterhead?.address;
  const contact = data.letterhead?.contact;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Reception Placard — ${escapeHtml(facilityName)}</title>
  <style>
    @page {
      size: portrait;
      margin: 12mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: ${theme.colors.text};
      background: ${theme.colors.surface};
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .placard-container {
      width: 100%;
      max-width: 650px;
      border: 3px solid ${theme.colors.primary};
      border-radius: ${theme.radii.xl}px;
      padding: 36px 32px;
      text-align: center;
      box-shadow: 0 4px 16px ${theme.colors.borderDark};
    }
    .facility-header {
      border-bottom: 2px solid ${theme.colors.primaryLight};
      padding-bottom: 18px;
      margin-bottom: 24px;
    }
    .facility-name {
      font-size: 28px;
      font-weight: 800;
      color: ${theme.colors.primaryDark};
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .facility-sub {
      font-size: 14px;
      color: ${theme.colors.textSecondary};
      margin-top: 4px;
    }
    .headline {
      font-size: 22px;
      font-weight: 700;
      color: ${theme.colors.text};
      margin-bottom: 8px;
    }
    .subhead {
      font-size: 14px;
      color: ${theme.colors.textSecondary};
      margin-bottom: 24px;
    }
    .qr-card {
      display: inline-block;
      width: 260px;
      height: 260px;
      padding: 14px;
      background: ${theme.colors.surface};
      border: 2px solid ${theme.colors.border};
      border-radius: ${theme.radii.lg}px;
      margin-bottom: 20px;
    }
    .passcode-pill {
      background: ${theme.colors.primaryLight};
      border: 1px solid ${theme.colors.primaryBorder};
      border-radius: ${theme.radii.md}px;
      padding: 10px 20px;
      display: inline-block;
      margin-bottom: 24px;
    }
    .passcode-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: ${theme.colors.primaryDark};
      font-weight: 600;
    }
    .passcode-val {
      font-size: 24px;
      font-weight: 800;
      letter-spacing: 3px;
      color: ${theme.colors.primaryDark};
      font-family: 'Courier New', Courier, monospace;
    }
    .steps-container {
      background: ${theme.colors.surfaceSubtle};
      border-radius: ${theme.radii.md}px;
      padding: 16px 20px;
      text-align: left;
      margin-bottom: 24px;
    }
    .steps-title {
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      color: ${theme.colors.textSecondary};
      margin-bottom: 10px;
    }
    .step-item {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 6px;
      color: ${theme.colors.text};
    }
    .step-num {
      font-weight: 700;
      color: ${theme.colors.primary};
      margin-right: 4px;
    }
    .url-text {
      font-size: 11px;
      color: ${theme.colors.textMuted};
      font-family: monospace;
      word-break: break-all;
      margin-bottom: 16px;
    }
    .footer-note {
      font-size: 12px;
      color: ${theme.colors.textSecondary};
      border-top: 1px dashed ${theme.colors.borderDark};
      padding-top: 14px;
    }
  </style>
</head>
<body>
  <div class="placard-container">
    <div class="facility-header">
      <div class="facility-name">${escapeHtml(facilityName)}</div>
      <div class="facility-sub">${escapeHtml(subHeader)}</div>
      ${address ? `<div class="facility-sub">${escapeHtml(address)}</div>` : ''}
    </div>

    <div class="headline">WALK-IN PATIENT SELF-ENLISTMENT</div>
    <div class="subhead">Point your smartphone camera at the QR code below to register your visit</div>

    <div class="qr-card">
      ${qrSvg}
    </div>

    ${data.joinCode ? `
      <div class="passcode-pill">
        <div class="passcode-label">Access Passcode</div>
        <div class="passcode-val">${escapeHtml(data.joinCode)}</div>
      </div>
    ` : ''}

    <div class="steps-container">
      <div class="steps-title">Instructions for Patients</div>
      <div class="step-item"><span class="step-num">1.</span> Scan QR code with your mobile camera or barcode scanner.</div>
      <div class="step-item"><span class="step-num">2.</span> Fill in your patient demographics, PhilHealth PIN, and visit reason.</div>
      <div class="step-item"><span class="step-num">3.</span> Receive your Queue Ticket pass and proceed to the triage nurse.</div>
    </div>

    <div class="url-text">${escapeHtml(data.qrUrl)}</div>

    <div class="footer-note">
      Need assistance? Please approach the clinic reception desk.
      ${contact ? ` &bull; Contact: ${escapeHtml(contact)}` : ''}
    </div>
  </div>
</body>
</html>`;
}
