import { theme } from '../constants/theme';

/**
 * Facility letterhead printed around a receipt or invoice.
 * Sourced directly from clinic settings / license.
 */
export interface PrintLetterhead {
  header?: string;
  subHeader?: string;
  address?: string;
  contact?: string;
  footer?: string;
  tin?: string;
  accreditationNumber?: string;
  dohLto?: string;
  logoUrl?: string;
}

export interface ReceiptItem {
  id?: string;
  code?: string;
  description: string;
  category?: string;
  unitPrice: number;
  quantity: number;
  totalPrice?: number;
}

export interface ReceiptData {
  orNumber: string;
  invoiceNumber?: string;
  patientName: string;
  patientId?: string;
  patientAge?: number | string;
  patientGender?: string;
  cashierName: string;
  paidAt: string;
  paymentMethod: string;
  referenceNumber?: string;
  grossAmount: number;
  discountType?: string;
  discountIdNumber?: string;
  discountAmount: number;
  netAmount: number;
  cashTendered?: number;
  change: number;
  items?: ReceiptItem[];
  notes?: string;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  invoiceDate: string;
  status: 'Draft' | 'Approved' | 'PartiallyPaid' | 'Paid' | 'Voided' | string;
  patientName: string;
  patientId?: string;
  patientAge?: number | string;
  patientGender?: string;
  attendingDoctorName?: string;
  doctorPrc?: string;
  queueNumber?: string;
  grossAmount: number;
  discountType?: string;
  discountIdNumber?: string;
  discountPercentage?: number;
  discountAmount: number;
  netAmount: number;
  amountPaid?: number;
  balanceDue?: number;
  notes?: string;
  items: ReceiptItem[];
  payments?: Array<{
    paymentNumber: string;
    paymentDate?: string;
    amount: number;
    method: string;
    referenceNumber?: string;
  }>;
}

function escapeHtml(value?: string | number | null): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLines(lines: Array<string | undefined>): string {
  return lines
    .map((line) => line?.trim())
    .filter((line): line is string => !!line)
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');
}

function formatMoney(amount?: number | null): string {
  const val = amount ?? 0;
  return `₱${val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * 1. Thermal Paper Receipt (POS 58mm / 80mm Roll Printer Format).
 * Formatted for standard POS roll printers with clean monospace layout,
 * dashed dividers, itemized table, and statutory BIR notices.
 */
export function buildThermalReceiptHtml(
  data: ReceiptData,
  letterhead?: PrintLetterhead
): string {
  const clinicName = letterhead?.header || 'CLINIC EZ HEALTHCARE';
  const subHeader = letterhead?.subHeader || '';
  const address = letterhead?.address || '';
  const contact = letterhead?.contact || '';
  const tin = letterhead?.tin || '';
  const accreditation = letterhead?.accreditationNumber || '';
  const items = data.items ?? [];

  const itemsHtml = items.length > 0
    ? items.map((it) => {
        const qty = it.quantity || 1;
        const total = it.totalPrice ?? (it.unitPrice * qty);
        return `
          <div class="thermal-row">
            <span class="thermal-item-name">${escapeHtml(it.description)}</span>
          </div>
          <div class="thermal-row thermal-item-sub">
            <span>${qty} x ${formatMoney(it.unitPrice)}</span>
            <span class="thermal-amount">${formatMoney(total)}</span>
          </div>
        `;
      }).join('')
    : `
      <div class="thermal-row">
        <span>Clinical Consultation &amp; Services</span>
        <span class="thermal-amount">${formatMoney(data.grossAmount)}</span>
      </div>
    `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Receipt #${escapeHtml(data.orNumber)}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          * {
            box-sizing: border-box;
          }
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 72mm;
            margin: 0 auto;
            padding: ${theme.spacing.sm}px ${theme.spacing.xs}px;
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.text};
            line-height: 1.35;
            background: ${theme.colors.surface};
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider {
            border-top: 1px dashed ${theme.colors.textMuted};
            margin: ${theme.spacing.xs}px 0;
          }
          .double-divider {
            border-top: 1px dashed ${theme.colors.textMuted};
            border-bottom: 1px dashed ${theme.colors.textMuted};
            height: 3px;
            margin: ${theme.spacing.xs}px 0;
          }
          .header-title {
            font-size: ${theme.fontSizes.sm}px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          .header-meta {
            font-size: 10px;
            color: ${theme.colors.textSecondary};
          }
          .doc-type {
            font-size: ${theme.fontSizes.sm}px;
            font-weight: bold;
            letter-spacing: 1px;
            margin: ${theme.spacing.xs}px 0;
          }
          .thermal-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 2px;
          }
          .thermal-item-name {
            font-weight: 600;
            word-break: break-word;
          }
          .thermal-item-sub {
            padding-left: ${theme.spacing.xs}px;
            font-size: 10px;
            color: ${theme.colors.textSecondary};
          }
          .thermal-amount {
            font-weight: bold;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: ${theme.fontSizes.sm}px;
            font-weight: bold;
            margin: ${theme.spacing.xs}px 0;
          }
          .footer-note {
            text-align: center;
            font-size: 9px;
            color: ${theme.colors.textSecondary};
            margin-top: ${theme.spacing.sm}px;
          }
        </style>
      </head>
      <body>
        <div class="text-center">
          <div class="header-title">${escapeHtml(clinicName)}</div>
          ${subHeader ? `<div class="header-meta">${escapeHtml(subHeader)}</div>` : ''}
          ${address ? `<div class="header-meta">${escapeHtml(address)}</div>` : ''}
          ${contact ? `<div class="header-meta">${escapeHtml(contact)}</div>` : ''}
          ${tin ? `<div class="header-meta">TIN: ${escapeHtml(tin)}</div>` : ''}
          ${accreditation ? `<div class="header-meta">PhilHealth Accr: ${escapeHtml(accreditation)}</div>` : ''}
          <div class="divider"></div>
          <div class="doc-type">OFFICIAL RECEIPT</div>
        </div>

        <div class="thermal-row">
          <span>OR NUMBER:</span>
          <span class="bold">#${escapeHtml(data.orNumber)}</span>
        </div>
        ${data.invoiceNumber ? `
        <div class="thermal-row">
          <span>INVOICE REF:</span>
          <span>#${escapeHtml(data.invoiceNumber)}</span>
        </div>` : ''}
        <div class="thermal-row">
          <span>DATE &amp; TIME:</span>
          <span>${escapeHtml(data.paidAt)}</span>
        </div>
        <div class="thermal-row">
          <span>PATIENT:</span>
          <span class="bold">${escapeHtml(data.patientName)}</span>
        </div>
        <div class="thermal-row">
          <span>CASHIER:</span>
          <span>${escapeHtml(data.cashierName)}</span>
        </div>

        <div class="divider"></div>
        <div class="thermal-row bold">
          <span>ITEM / DESCRIPTION</span>
          <span>AMOUNT</span>
        </div>
        <div class="divider"></div>

        ${itemsHtml}

        <div class="divider"></div>
        <div class="thermal-row">
          <span>Gross Subtotal:</span>
          <span>${formatMoney(data.grossAmount)}</span>
        </div>
        ${data.discountAmount > 0 ? `
        <div class="thermal-row">
          <span>Discount (${escapeHtml(data.discountType || 'Statutory')}${data.discountIdNumber ? ` - ID: ${escapeHtml(data.discountIdNumber)}` : ''}):</span>
          <span>-${formatMoney(data.discountAmount)}</span>
        </div>` : ''}
        
        <div class="double-divider"></div>
        <div class="total-row">
          <span>NET AMOUNT PAID:</span>
          <span>${formatMoney(data.netAmount)}</span>
        </div>
        <div class="double-divider"></div>

        <div class="thermal-row">
          <span>Payment Method:</span>
          <span class="bold">${escapeHtml(data.paymentMethod)}</span>
        </div>
        ${data.referenceNumber ? `
        <div class="thermal-row">
          <span>Reference / Txn:</span>
          <span>${escapeHtml(data.referenceNumber)}</span>
        </div>` : ''}
        ${data.cashTendered != null && data.cashTendered > 0 ? `
        <div class="thermal-row">
          <span>Cash Tendered:</span>
          <span>${formatMoney(data.cashTendered)}</span>
        </div>` : ''}
        ${data.change > 0 ? `
        <div class="thermal-row">
          <span>Change Returned:</span>
          <span class="bold">${formatMoney(data.change)}</span>
        </div>` : ''}

        <div class="divider"></div>
        <div class="footer-note">
          <div>THIS SERVES AS AN OFFICIAL RECEIPT</div>
          <div>Issued under BIR Revenue Regulations</div>
          <div>Thank you for trusting ClinicEZ!</div>
        </div>
      </body>
    </html>
  `;
}

/**
 * 2. Professional Official Receipt PDF (A4 / Letter Format).
 * Formal official receipt with clinic letterhead, BIR TIN, table of charges,
 * VAT-exempt/VATable breakdown, discount line items, and authorized signature.
 */
export function buildProfessionalReceiptHtml(
  data: ReceiptData,
  letterhead?: PrintLetterhead
): string {
  const clinicName = letterhead?.header || 'CLINIC EZ HEALTHCARE';
  const subHeader = letterhead?.subHeader || 'Outpatient Medical & Diagnostic Clinic';
  const address = letterhead?.address || '';
  const contact = letterhead?.contact || '';
  const tin = letterhead?.tin || '';
  const accreditation = letterhead?.accreditationNumber || '';
  const dohLto = letterhead?.dohLto || '';
  const items = data.items ?? [];

  // BIR breakdown: Outpatient healthcare is statutory VAT-Exempt in the Philippines
  const vatableSales = 0;
  const vatExemptSales = data.netAmount;
  const zeroRatedSales = 0;
  const vatAmount = 0;

  const itemsHtml = items.length > 0
    ? items.map((it, idx) => {
        const qty = it.quantity || 1;
        const total = it.totalPrice ?? (it.unitPrice * qty);
        return `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>
              <strong>${escapeHtml(it.description)}</strong>
              ${it.code ? `<span class="item-code">(${escapeHtml(it.code)})</span>` : ''}
            </td>
            <td><span class="category-badge">${escapeHtml(it.category || 'Service')}</span></td>
            <td style="text-align: center;">${qty}</td>
            <td style="text-align: right;">${formatMoney(it.unitPrice)}</td>
            <td style="text-align: right; font-weight: bold;">${formatMoney(total)}</td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td style="text-align: center;">1</td>
        <td><strong>Clinical Consultation &amp; Procedures</strong></td>
        <td><span class="category-badge">Clinical</span></td>
        <td style="text-align: center;">1</td>
        <td style="text-align: right;">${formatMoney(data.grossAmount)}</td>
        <td style="text-align: right; font-weight: bold;">${formatMoney(data.grossAmount)}</td>
      </tr>
    `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Official Receipt #${escapeHtml(data.orNumber)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: ${theme.colors.text};
            background: ${theme.colors.surface};
            margin: 0;
            padding: ${theme.spacing.lg}px;
            font-size: ${theme.fontSizes.sm}px;
            line-height: 1.4;
          }
          .receipt-container {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.md}px;
            padding: ${theme.spacing.xl}px;
          }
          .letterhead {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid ${theme.colors.primary};
            padding-bottom: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.md}px;
          }
          .clinic-brand { flex: 1; }
          .clinic-title {
            font-size: ${theme.fontSizes.xl}px;
            font-weight: 800;
            color: ${theme.colors.primaryDark};
            letter-spacing: -0.5px;
            margin: 0;
          }
          .clinic-sub {
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textSecondary};
            margin-top: 2px;
          }
          .clinic-meta {
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textMuted};
            margin-top: 4px;
          }
          .doc-badge {
            text-align: right;
          }
          .or-title {
            font-size: ${theme.fontSizes.lg}px;
            font-weight: 800;
            color: ${theme.colors.primary};
            letter-spacing: 0.5px;
          }
          .or-number {
            font-size: ${theme.fontSizes.md}px;
            font-weight: 700;
            color: ${theme.colors.text};
            margin-top: 2px;
          }
          .or-status {
            display: inline-block;
            background: ${theme.colors.successBg};
            color: ${theme.colors.successText};
            border: 1px solid ${theme.colors.successBorder};
            padding: 2px 8px;
            border-radius: ${theme.radii.sm}px;
            font-size: 11px;
            font-weight: bold;
            margin-top: 4px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${theme.spacing.md}px;
            background: ${theme.colors.surfaceSubtle};
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.lg}px;
          }
          .meta-col div {
            margin-bottom: 4px;
            font-size: ${theme.fontSizes.xs}px;
          }
          .meta-label {
            font-weight: 600;
            color: ${theme.colors.textSecondary};
            display: inline-block;
            width: 110px;
          }
          .meta-value {
            font-weight: 700;
            color: ${theme.colors.text};
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: ${theme.spacing.lg}px;
          }
          table.data-table th {
            background: ${theme.colors.primarySubtle};
            color: ${theme.colors.primaryDark};
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            border: 1px solid ${theme.colors.primaryBorder};
          }
          table.data-table td {
            padding: 8px 10px;
            border: 1px solid ${theme.colors.border};
            font-size: ${theme.fontSizes.xs}px;
          }
          .category-badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: ${theme.radii.sm}px;
            background: ${theme.colors.primaryLight};
            color: ${theme.colors.primaryDark};
          }
          .item-code {
            font-size: 11px;
            color: ${theme.colors.textMuted};
            margin-left: 4px;
          }
          .summary-layout {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.lg}px;
          }
          .vat-box {
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.sm}px ${theme.spacing.md}px;
            background: ${theme.colors.surfaceMuted};
            font-size: 11px;
          }
          .vat-row {
            display: flex;
            justify-content: space-between;
            padding: 2px 0;
            border-bottom: 1px dotted ${theme.colors.border};
          }
          .totals-box {
            border: 1px solid ${theme.colors.primaryBorder};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.sm}px ${theme.spacing.md}px;
            background: ${theme.colors.surface};
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: ${theme.fontSizes.xs}px;
          }
          .net-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            margin-top: 4px;
            border-top: 2px solid ${theme.colors.primary};
            font-size: ${theme.fontSizes.md}px;
            font-weight: 800;
            color: ${theme.colors.primaryDark};
          }
          .payment-meta {
            margin-top: 6px;
            padding-top: 6px;
            border-top: 1px dashed ${theme.colors.border};
            font-size: 11px;
            color: ${theme.colors.textSecondary};
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${theme.spacing.xl}px;
            margin-top: ${theme.spacing.xl}px;
            padding-top: ${theme.spacing.md}px;
          }
          .sign-col {
            text-align: center;
          }
          .sign-line {
            width: 80%;
            margin: 36px auto 6px auto;
            border-top: 1px solid ${theme.colors.text};
          }
          .sign-title {
            font-size: 11px;
            font-weight: bold;
            color: ${theme.colors.text};
          }
          .sign-sub {
            font-size: 10px;
            color: ${theme.colors.textSecondary};
          }
          .compliance-footer {
            margin-top: ${theme.spacing.lg}px;
            padding-top: ${theme.spacing.sm}px;
            border-top: 1px solid ${theme.colors.border};
            text-align: center;
            font-size: 10px;
            color: ${theme.colors.textMuted};
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="letterhead">
            <div class="clinic-brand">
              <h1 class="clinic-title">${escapeHtml(clinicName)}</h1>
              <div class="clinic-sub">${escapeHtml(subHeader)}</div>
              ${address ? `<div class="clinic-meta">${escapeHtml(address)}</div>` : ''}
              ${contact ? `<div class="clinic-meta">Tel / Email: ${escapeHtml(contact)}</div>` : ''}
              ${tin ? `<div class="clinic-meta">BIR Registered TIN: ${escapeHtml(tin)}</div>` : ''}
              ${accreditation ? `<div class="clinic-meta">PhilHealth Accreditation: ${escapeHtml(accreditation)}</div>` : ''}
              ${dohLto ? `<div class="clinic-meta">DOH LTO No.: ${escapeHtml(dohLto)}</div>` : ''}
            </div>
            <div class="doc-badge">
              <div class="or-title">OFFICIAL RECEIPT</div>
              <div class="or-number">OR #${escapeHtml(data.orNumber)}</div>
              <div><span class="or-status">VALIDATED &amp; SETTLED</span></div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div><span class="meta-label">Patient Name:</span> <span class="meta-value">${escapeHtml(data.patientName)}</span></div>
              ${data.patientId ? `<div><span class="meta-label">Patient ID:</span> <span class="meta-value">${escapeHtml(data.patientId.slice(0, 8))}</span></div>` : ''}
              ${data.discountIdNumber ? `<div><span class="meta-label">Statutory ID:</span> <span class="meta-value">${escapeHtml(data.discountIdNumber)} (${escapeHtml(data.discountType)})</span></div>` : ''}
            </div>
            <div class="meta-col">
              <div><span class="meta-label">Date Issued:</span> <span class="meta-value">${escapeHtml(data.paidAt)}</span></div>
              ${data.invoiceNumber ? `<div><span class="meta-label">Invoice Ref:</span> <span class="meta-value">#${escapeHtml(data.invoiceNumber)}</span></div>` : ''}
              <div><span class="meta-label">Cashier / Staff:</span> <span class="meta-value">${escapeHtml(data.cashierName)}</span></div>
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Item / Service Description</th>
                <th style="width: 100px;">Category</th>
                <th style="width: 50px; text-align: center;">Qty</th>
                <th style="width: 100px; text-align: right;">Unit Price</th>
                <th style="width: 110px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-layout">
            <div class="vat-box">
              <div style="font-weight: bold; margin-bottom: 4px; color: ${theme.colors.textSecondary};">BIR TAX &amp; VAT BREAKDOWN</div>
              <div class="vat-row"><span>VATable Sales:</span> <span>${formatMoney(vatableSales)}</span></div>
              <div class="vat-row"><span>VAT-Exempt Sales (Medical):</span> <span>${formatMoney(vatExemptSales)}</span></div>
              <div class="vat-row"><span>Zero-Rated Sales:</span> <span>${formatMoney(zeroRatedSales)}</span></div>
              <div class="vat-row"><span>12% Value Added Tax (VAT):</span> <span>${formatMoney(vatAmount)}</span></div>
              <div class="vat-row" style="font-weight: bold; border-top: 1px solid ${theme.colors.border}; margin-top: 2px;">
                <span>Total Gross Sales:</span> <span>${formatMoney(data.grossAmount)}</span>
              </div>
            </div>

            <div class="totals-box">
              <div class="totals-row">
                <span>Subtotal (Gross):</span>
                <span>${formatMoney(data.grossAmount)}</span>
              </div>
              ${data.discountAmount > 0 ? `
              <div class="totals-row" style="color: ${theme.colors.primaryDark};">
                <span>Less: ${escapeHtml(data.discountType || 'Statutory')} Discount:</span>
                <span>-${formatMoney(data.discountAmount)}</span>
              </div>` : ''}
              <div class="net-row">
                <span>TOTAL AMOUNT PAID:</span>
                <span>${formatMoney(data.netAmount)}</span>
              </div>
              <div class="payment-meta">
                <div>Payment Method: <strong>${escapeHtml(data.paymentMethod)}</strong> ${data.referenceNumber ? `(Ref #${escapeHtml(data.referenceNumber)})` : ''}</div>
                ${data.cashTendered != null && data.cashTendered > 0 ? `<div>Cash Tendered: ${formatMoney(data.cashTendered)} · Change: ${formatMoney(data.change)}</div>` : ''}
              </div>
            </div>
          </div>

          <div class="signatures">
            <div class="sign-col">
              <div class="sign-line"></div>
              <div class="sign-title">${escapeHtml(data.patientName)}</div>
              <div class="sign-sub">Patient / Authorized Representative Signature</div>
            </div>
            <div class="sign-col">
              <div class="sign-line"></div>
              <div class="sign-title">${escapeHtml(data.cashierName)}</div>
              <div class="sign-sub">Authorized Cashier / Billing Officer</div>
            </div>
          </div>

          <div class="compliance-footer">
            <div>"THIS DOCUMENT IS AN OFFICIAL RECEIPT ISSUED IN ACCORDANCE WITH BUREAU OF INTERNAL REVENUE (BIR) REGULATIONS."</div>
            <div>Valid for claims and statutory deductions under RA 9994 (Senior Citizen Act) &amp; RA 10754 (PWD Act).</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * 3. Statement of Account / Approved Billing Invoice PDF (A4 / Letter Format).
 * Formatted for pre-encounter or post-encounter review and cashier settlement.
 * Includes clinic letterhead, attending doctor, itemized consultation & procedures,
 * statutory discount deductions, and verification stamps.
 */
export function buildInvoicePdfHtml(
  invoice: InvoicePdfData,
  letterhead?: PrintLetterhead
): string {
  const clinicName = letterhead?.header || 'CLINIC EZ HEALTHCARE';
  const subHeader = letterhead?.subHeader || 'Outpatient Clinical & Diagnostic Services';
  const address = letterhead?.address || '';
  const contact = letterhead?.contact || '';
  const tin = letterhead?.tin || '';
  const accreditation = letterhead?.accreditationNumber || '';
  const dohLto = letterhead?.dohLto || '';
  const items = invoice.items ?? [];

  const isApproved = invoice.status === 'Approved' || invoice.status === 'Paid';
  const statusLabel = isApproved ? 'APPROVED INVOICE' : 'STATEMENT OF ACCOUNT (SOA)';
  const statusColor = isApproved ? theme.colors.successText : theme.colors.primaryDark;
  const statusBg = isApproved ? theme.colors.successBg : theme.colors.primaryLight;
  const statusBorder = isApproved ? theme.colors.successBorder : theme.colors.primaryBorder;

  const itemsHtml = items.length > 0
    ? items.map((it, idx) => {
        const qty = it.quantity || 1;
        const total = it.totalPrice ?? (it.unitPrice * qty);
        return `
          <tr>
            <td style="text-align: center;">${idx + 1}</td>
            <td>
              <strong>${escapeHtml(it.description)}</strong>
              ${it.code ? `<span class="item-code">(${escapeHtml(it.code)})</span>` : ''}
            </td>
            <td><span class="category-badge">${escapeHtml(it.category || 'Service')}</span></td>
            <td style="text-align: center;">${qty}</td>
            <td style="text-align: right;">${formatMoney(it.unitPrice)}</td>
            <td style="text-align: right; font-weight: bold;">${formatMoney(total)}</td>
          </tr>
        `;
      }).join('')
    : `
      <tr>
        <td colspan="6" style="text-align: center; color: ${theme.colors.textMuted}; padding: 16px;">
          No itemized services billed.
        </td>
      </tr>
    `;

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Invoice #${escapeHtml(invoice.invoiceNumber)}</title>
        <style>
          @page {
            size: A4 portrait;
            margin: 12mm;
          }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: ${theme.colors.text};
            background: ${theme.colors.surface};
            margin: 0;
            padding: ${theme.spacing.lg}px;
            font-size: ${theme.fontSizes.sm}px;
            line-height: 1.4;
          }
          .invoice-container {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.md}px;
            padding: ${theme.spacing.xl}px;
          }
          .letterhead {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid ${theme.colors.primary};
            padding-bottom: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.md}px;
          }
          .clinic-brand { flex: 1; }
          .clinic-title {
            font-size: ${theme.fontSizes.xl}px;
            font-weight: 800;
            color: ${theme.colors.primaryDark};
            letter-spacing: -0.5px;
            margin: 0;
          }
          .clinic-sub {
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textSecondary};
            margin-top: 2px;
          }
          .clinic-meta {
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textMuted};
            margin-top: 4px;
          }
          .doc-badge {
            text-align: right;
          }
          .invoice-title {
            font-size: ${theme.fontSizes.lg}px;
            font-weight: 800;
            color: ${theme.colors.primary};
            letter-spacing: 0.5px;
          }
          .invoice-number {
            font-size: ${theme.fontSizes.md}px;
            font-weight: 700;
            color: ${theme.colors.text};
            margin-top: 2px;
          }
          .status-badge {
            display: inline-block;
            background: ${statusBg};
            color: ${statusColor};
            border: 1px solid ${statusBorder};
            padding: 3px 10px;
            border-radius: ${theme.radii.sm}px;
            font-size: 11px;
            font-weight: bold;
            margin-top: 4px;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${theme.spacing.md}px;
            background: ${theme.colors.surfaceSubtle};
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.lg}px;
          }
          .meta-col div {
            margin-bottom: 4px;
            font-size: ${theme.fontSizes.xs}px;
          }
          .meta-label {
            font-weight: 600;
            color: ${theme.colors.textSecondary};
            display: inline-block;
            width: 120px;
          }
          .meta-value {
            font-weight: 700;
            color: ${theme.colors.text};
          }
          table.data-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: ${theme.spacing.lg}px;
          }
          table.data-table th {
            background: ${theme.colors.primarySubtle};
            color: ${theme.colors.primaryDark};
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 8px 10px;
            border: 1px solid ${theme.colors.primaryBorder};
          }
          table.data-table td {
            padding: 8px 10px;
            border: 1px solid ${theme.colors.border};
            font-size: ${theme.fontSizes.xs}px;
          }
          .category-badge {
            display: inline-block;
            font-size: 10px;
            font-weight: 600;
            padding: 1px 6px;
            border-radius: ${theme.radii.sm}px;
            background: ${theme.colors.primaryLight};
            color: ${theme.colors.primaryDark};
          }
          .item-code {
            font-size: 11px;
            color: ${theme.colors.textMuted};
            margin-left: 4px;
          }
          .summary-layout {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: ${theme.spacing.md}px;
            margin-bottom: ${theme.spacing.lg}px;
          }
          .notes-box {
            border: 1px solid ${theme.colors.border};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.md}px;
            background: ${theme.colors.surfaceMuted};
            font-size: ${theme.fontSizes.xs}px;
          }
          .totals-box {
            border: 1px solid ${theme.colors.primaryBorder};
            border-radius: ${theme.radii.sm}px;
            padding: ${theme.spacing.sm}px ${theme.spacing.md}px;
            background: ${theme.colors.surface};
          }
          .totals-row {
            display: flex;
            justify-content: space-between;
            padding: 4px 0;
            font-size: ${theme.fontSizes.xs}px;
          }
          .net-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            margin-top: 4px;
            border-top: 2px solid ${theme.colors.primary};
            font-size: ${theme.fontSizes.md}px;
            font-weight: 800;
            color: ${theme.colors.primaryDark};
          }
          .signatures {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: ${theme.spacing.xl}px;
            margin-top: ${theme.spacing.xl}px;
            padding-top: ${theme.spacing.md}px;
          }
          .sign-col {
            text-align: center;
          }
          .sign-line {
            width: 80%;
            margin: 36px auto 6px auto;
            border-top: 1px solid ${theme.colors.text};
          }
          .sign-title {
            font-size: 11px;
            font-weight: bold;
            color: ${theme.colors.text};
          }
          .sign-sub {
            font-size: 10px;
            color: ${theme.colors.textSecondary};
          }
          .compliance-footer {
            margin-top: ${theme.spacing.lg}px;
            padding-top: ${theme.spacing.sm}px;
            border-top: 1px solid ${theme.colors.border};
            text-align: center;
            font-size: 10px;
            color: ${theme.colors.textMuted};
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="letterhead">
            <div class="clinic-brand">
              <h1 class="clinic-title">${escapeHtml(clinicName)}</h1>
              <div class="clinic-sub">${escapeHtml(subHeader)}</div>
              ${address ? `<div class="clinic-meta">${escapeHtml(address)}</div>` : ''}
              ${contact ? `<div class="clinic-meta">Tel / Contact: ${escapeHtml(contact)}</div>` : ''}
              ${tin ? `<div class="clinic-meta">BIR Registered TIN: ${escapeHtml(tin)}</div>` : ''}
              ${accreditation ? `<div class="clinic-meta">PhilHealth Accreditation: ${escapeHtml(accreditation)}</div>` : ''}
              ${dohLto ? `<div class="clinic-meta">DOH LTO No.: ${escapeHtml(dohLto)}</div>` : ''}
            </div>
            <div class="doc-badge">
              <div class="invoice-title">${escapeHtml(statusLabel)}</div>
              <div class="invoice-number">INV #${escapeHtml(invoice.invoiceNumber)}</div>
              <div><span class="status-badge">${escapeHtml(invoice.status.toUpperCase())}</span></div>
            </div>
          </div>

          <div class="meta-grid">
            <div class="meta-col">
              <div><span class="meta-label">Patient Name:</span> <span class="meta-value">${escapeHtml(invoice.patientName)}</span></div>
              ${invoice.patientId ? `<div><span class="meta-label">Patient ID:</span> <span class="meta-value">${escapeHtml(invoice.patientId.slice(0, 8))}</span></div>` : ''}
              ${invoice.queueNumber ? `<div><span class="meta-label">Queue / Ticket:</span> <span class="meta-value">${escapeHtml(invoice.queueNumber)}</span></div>` : ''}
              ${invoice.discountIdNumber ? `<div><span class="meta-label">Statutory ID:</span> <span class="meta-value">${escapeHtml(invoice.discountIdNumber)} (${escapeHtml(invoice.discountType)})</span></div>` : ''}
            </div>
            <div class="meta-col">
              <div><span class="meta-label">Invoice Date:</span> <span class="meta-value">${escapeHtml(invoice.invoiceDate)}</span></div>
              ${invoice.attendingDoctorName ? `<div><span class="meta-label">Attending Doctor:</span> <span class="meta-value">Dr. ${escapeHtml(invoice.attendingDoctorName)}</span></div>` : ''}
              ${invoice.doctorPrc ? `<div><span class="meta-label">PRC License:</span> <span class="meta-value">${escapeHtml(invoice.doctorPrc)}</span></div>` : ''}
            </div>
          </div>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Service / Procedure / Diagnostic Item</th>
                <th style="width: 110px;">Category</th>
                <th style="width: 50px; text-align: center;">Qty</th>
                <th style="width: 100px; text-align: right;">Unit Price</th>
                <th style="width: 110px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>

          <div class="summary-layout">
            <div class="notes-box">
              <div style="font-weight: bold; margin-bottom: 4px; color: ${theme.colors.textSecondary};">BILLING INSTRUCTIONS &amp; NOTES</div>
              <div>${escapeHtml(invoice.notes || 'Please present this Statement of Account to the Cashier Counter for settlement and official receipt (OR) issuance.')}</div>
              <div style="margin-top: 8px; font-size: 11px; color: ${theme.colors.textMuted};">
                Covered services and statutory discounts are computed in compliance with Philippine PhilHealth Konsulta and Senior/PWD guidelines.
              </div>
            </div>

            <div class="totals-box">
              <div class="totals-row">
                <span>Gross Amount:</span>
                <span>${formatMoney(invoice.grossAmount)}</span>
              </div>
              ${invoice.discountAmount > 0 ? `
              <div class="totals-row" style="color: ${theme.colors.primaryDark};">
                <span>Less: ${escapeHtml(invoice.discountType || 'Statutory')} (${invoice.discountPercentage || 20}%):</span>
                <span>-${formatMoney(invoice.discountAmount)}</span>
              </div>` : ''}
              <div class="net-row">
                <span>NET AMOUNT DUE:</span>
                <span>${formatMoney(invoice.netAmount)}</span>
              </div>
              ${invoice.payments && invoice.payments.length > 0 ? `
                ${invoice.payments.map(p => `
                  <div class="totals-row" style="color: ${theme.colors.successText}; font-size: 11px;">
                    <span>Paid (${escapeHtml(p.method)} - OR #${escapeHtml(p.paymentNumber)}${p.referenceNumber ? ` • Ref: ${escapeHtml(p.referenceNumber)}` : ''}):</span>
                    <span>${formatMoney(p.amount)}</span>
                  </div>
                `).join('')}
                ${invoice.payments.length > 1 ? `
                  <div class="totals-row" style="font-weight: 600;">
                    <span>Total Amount Paid:</span>
                    <span>${formatMoney(invoice.amountPaid || 0)}</span>
                  </div>
                ` : ''}
                <div class="totals-row" style="font-weight: bold; color: ${(invoice.balanceDue ?? 0) > 0 ? theme.colors.emergencyText : theme.colors.text};">
                  <span>Balance Due:</span>
                  <span>${formatMoney(invoice.balanceDue ?? 0)}</span>
                </div>
              ` : invoice.amountPaid != null && invoice.amountPaid > 0 ? `
              <div class="totals-row">
                <span>Amount Paid:</span>
                <span>${formatMoney(invoice.amountPaid)}</span>
              </div>
              <div class="totals-row" style="font-weight: bold;">
                <span>Balance Due:</span>
                <span>${formatMoney(invoice.balanceDue ?? 0)}</span>
              </div>` : ''}
            </div>
          </div>

          <div class="signatures">
            <div class="sign-col">
              <div class="sign-line"></div>
              <div class="sign-title">
                ${invoice.attendingDoctorName ? `Dr. ${escapeHtml(invoice.attendingDoctorName)}` : 'Attending Physician'}
              </div>
              <div class="sign-sub">Attending Physician / Clinician Signature</div>
            </div>
            <div class="sign-col">
              <div class="sign-line"></div>
              <div class="sign-title">Clinic Cashier / Billing Officer</div>
              <div class="sign-sub">Authorized Billing Station Verification</div>
            </div>
          </div>

          <div class="compliance-footer">
            <div>"STATEMENT OF ACCOUNT FOR HEALTHCARE SERVICES - OFFICIAL RECEIPT ISSUED UPON PAYMENT SETTLEMENT"</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/** Legacy receipt document builder for backwards compatibility */
export function buildReceiptHtml(
  title: string,
  details: string,
  letterhead?: PrintLetterhead
): string {
  const headerHtml = renderLines([letterhead?.header, letterhead?.subHeader, letterhead?.address, letterhead?.contact]);
  const footerHtml = renderLines([letterhead?.footer]);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(title)}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            padding: ${theme.spacing['2xl']}px;
            font-size: ${theme.fontSizes.sm}px;
            color: ${theme.colors.text};
            line-height: 1.4;
          }
          .letterhead {
            text-align: center;
            margin-bottom: ${theme.spacing.md}px;
            font-size: ${theme.fontSizes.xs}px;
            color: ${theme.colors.textSecondary};
          }
          .letterhead div:first-child {
            font-size: ${theme.fontSizes.lg}px;
            font-weight: 700;
            color: ${theme.colors.text};
          }
          h2 {
            font-size: ${theme.fontSizes.lg}px;
            margin-bottom: ${theme.spacing.sm}px;
            text-align: center;
            border-bottom: 1px dashed ${theme.colors.textMuted};
            padding-bottom: ${theme.spacing.sm}px;
          }
          pre {
            white-space: pre-wrap;
            font-family: inherit;
          }
          .footer {
            margin-top: ${theme.spacing.xl}px;
            text-align: center;
            font-size: ${theme.fontSizes.xs}px;
            border-top: 1px dashed ${theme.colors.textMuted};
            padding-top: ${theme.spacing.sm}px;
          }
        </style>
      </head>
      <body>
        ${headerHtml ? `<div class="letterhead">${headerHtml}</div>` : ''}
        <h2>${escapeHtml(title)}</h2>
        <pre>${escapeHtml(details)}</pre>
        ${footerHtml ? `<div class="footer">${footerHtml}</div>` : ''}
      </body>
    </html>
  `;
}
