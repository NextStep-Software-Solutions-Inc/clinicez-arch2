import { PaymentReceipt, BillingInfo, BillingPaymentConfig } from "@/services/billing.service"
import { toast } from "sonner"
import { siteEmails } from "@/config/site"
import { lightColors } from "@clinicez/design-tokens"
import { numberToWords } from "./numberToWords"

export { numberToWords }

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export const printReceipt = (
  receipt: PaymentReceipt,
  billingInfo: BillingInfo | null,
  planSlug: string,
  isAnnual: boolean,
  xenditInvoiceId?: string,
  invoiceNumber?: string,
  paymentConfigOverride?: Partial<BillingPaymentConfig>
) => {
  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    toast.error("Popup blocker prevented opening the print receipt window.")
    return
  }

  const cfg = { ...billingInfo?.paymentConfig, ...paymentConfigOverride }
  const corporateName = cfg.corporateName || "ClinicEZ Digital Health Inc."
  const corporateTin = cfg.corporateTin || "009-876-543-000"
  const corporateAddress =
    cfg.corporateAddress ||
    "Unit 1402, BGC Corporate Center, 11th Avenue, Bonifacio Global City, Taguig City, Metro Manila, Philippines 1634"
  const birTaxExempt = cfg.birTaxExempt ?? false
  const birTaxPercentage = cfg.birTaxPercentage ?? 12
  const isTaxExempt = birTaxExempt || birTaxPercentage <= 0

  const planName =
    planSlug.toLowerCase() === "pro"
      ? "Professional Plan"
      : planSlug.toLowerCase() === "enterprise"
      ? "Enterprise Health Plan"
      : "Starter Plan"
  const cycleLabel = isAnnual ? "Annual" : "Monthly"
  const formattedAmount = `${escapeHtml(receipt.currency)} ${receipt.amountPaid.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  const amountInWords = numberToWords(receipt.amountPaid)
  const supportEmail = cfg.billingSupportEmail || siteEmails.billing || "billing@clinicez.ph"

  // Resolved invoice number
  const associatedInvoiceNumber =
    invoiceNumber ||
    (xenditInvoiceId && !xenditInvoiceId.startsWith("recy_") && !xenditInvoiceId.startsWith("MANUAL-")
      ? xenditInvoiceId
      : "INV-OFFICIAL")

  // Tax breakdown (configurable BIR VAT percentage or VAT-Exempt)
  const vatableSales = isTaxExempt
    ? 0
    : receipt.amountPaid > 0
    ? receipt.amountPaid / (1 + birTaxPercentage / 100)
    : 0
  const vatAmount = isTaxExempt ? 0 : receipt.amountPaid - vatableSales
  const vatExemptSales = isTaxExempt ? receipt.amountPaid : 0
  const tinRegistrationLabel = isTaxExempt ? "VAT-Exempt" : "VAT Registered"

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Official_Receipt_${escapeHtml(receipt.receiptNumber)}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: ${lightColors.text};
            background-color: ${lightColors.surface};
            margin: 0;
            padding: 32px;
            line-height: 1.5;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .container {
            max-width: 820px;
            margin: 0 auto;
            border: 2px solid ${lightColors.borderDark};
            border-radius: 16px;
            padding: 36px;
            background-color: ${lightColors.surface};
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid ${lightColors.borderLight};
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: ${lightColors.primary};
            display: flex;
            align-items: center;
            gap: 8px;
            letter-spacing: -0.5px;
          }
          .company-info {
            margin: 6px 0 0 0;
            font-size: 11px;
            color: ${lightColors.textSecondary};
            line-height: 1.4;
          }
          .receipt-title {
            text-align: right;
          }
          .receipt-badge {
            display: inline-block;
            background-color: ${lightColors.successBg};
            color: ${lightColors.successText};
            border: 1px solid ${lightColors.successBorder};
            font-weight: 800;
            font-size: 11px;
            text-transform: uppercase;
            padding: 4px 10px;
            border-radius: 9999px;
            margin-bottom: 6px;
          }
          .receipt-title h1 {
            margin: 0;
            font-size: 24px;
            font-weight: 900;
            color: ${lightColors.text};
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .receipt-title .doc-number {
            margin: 4px 0 0 0;
            font-family: monospace;
            font-size: 15px;
            font-weight: 800;
            color: ${lightColors.primary};
          }
          .receipt-title .inv-ref {
            margin: 2px 0 0 0;
            font-size: 11px;
            color: ${lightColors.textMuted};
          }
          .received-from-box {
            background-color: ${lightColors.surfaceMuted};
            border: 1px solid ${lightColors.border};
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
          }
          .received-from-box h3 {
            margin: 0 0 10px 0;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: ${lightColors.textMuted};
            letter-spacing: 0.8px;
          }
          .received-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 16px;
            font-size: 13px;
          }
          .received-grid .meta-label {
            color: ${lightColors.textMuted};
            font-size: 11px;
            text-transform: uppercase;
            font-weight: 600;
          }
          .amount-in-words-box {
            border: 1px solid ${lightColors.primaryBorder};
            background-color: ${lightColors.primarySubtle};
            border-radius: 12px;
            padding: 16px 20px;
            margin-bottom: 24px;
          }
          .amount-in-words-box .label {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: ${lightColors.primaryText};
            letter-spacing: 0.5px;
          }
          .amount-in-words-box .words {
            font-size: 16px;
            font-weight: 800;
            color: ${lightColors.primaryDark};
            margin: 4px 0 2px 0;
            line-height: 1.3;
          }
          .amount-in-words-box .figures {
            font-size: 18px;
            font-weight: 900;
            color: ${lightColors.primary};
            font-family: monospace;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          .table th {
            background-color: ${lightColors.surfaceMuted};
            color: ${lightColors.textMuted};
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 10px 14px;
            border-bottom: 1px solid ${lightColors.border};
            text-align: left;
          }
          .table td {
            padding: 14px;
            border-bottom: 1px solid ${lightColors.borderLight};
            font-size: 13px;
          }
          .table td.right, .table th.right {
            text-align: right;
          }
          .split-footer {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-top: 12px;
          }
          .vat-breakdown {
            font-size: 12px;
            background-color: ${lightColors.surfaceMuted};
            border: 1px solid ${lightColors.border};
            border-radius: 10px;
            padding: 12px 16px;
          }
          .vat-row {
            display: flex;
            justify-content: space-between;
            padding: 3px 0;
            color: ${lightColors.textSecondary};
          }
          .vat-row.total {
            border-top: 1px solid ${lightColors.border};
            margin-top: 4px;
            padding-top: 6px;
            font-weight: 800;
            color: ${lightColors.text};
          }
          .signatory-box {
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            align-items: center;
            text-align: center;
            padding: 12px;
          }
          .signature-line {
            width: 220px;
            border-top: 1px solid ${lightColors.textSecondary};
            margin-top: 40px;
            padding-top: 6px;
            font-size: 11px;
            font-weight: 700;
            color: ${lightColors.text};
          }
          .signatory-title {
            font-size: 10px;
            color: ${lightColors.textMuted};
          }
          .footer {
            margin-top: 32px;
            border-top: 1px solid ${lightColors.borderLight};
            padding-top: 16px;
            text-align: center;
            font-size: 10px;
            color: ${lightColors.textMuted};
          }
          @media print {
            body { padding: 0; background: none; }
            .container { border: 1px solid ${lightColors.border}; box-shadow: none; padding: 16px; max-width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <div class="logo">
                Clinic EZ
              </div>
              <div class="company-info">
                <strong>${escapeHtml(corporateName)}</strong><br/>
                ${tinRegistrationLabel} TIN: ${escapeHtml(corporateTin)}<br/>
                ${escapeHtml(corporateAddress)}<br/>
                Email: ${escapeHtml(supportEmail)}
              </div>
            </div>
            <div class="receipt-title">
              <span class="receipt-badge">BIR Official Receipt</span>
              <h1>OFFICIAL RECEIPT</h1>
              <div class="doc-number">${escapeHtml(receipt.receiptNumber)}</div>
              <div class="inv-ref">Invoice Ref: ${escapeHtml(associatedInvoiceNumber)}</div>
            </div>
          </div>

          <div class="received-from-box">
            <h3>Received From:</h3>
            <div class="received-grid">
              <div>
                <div class="meta-label">Customer / Organization Name</div>
                <div style="font-weight: 700; font-size: 14px; margin-top: 2px;">
                  ${escapeHtml(billingInfo?.clinicName || "Clinic Subscriber")}
                </div>
                ${billingInfo?.tradingName ? `<div style="font-size: 12px; color: ${lightColors.textSecondary}; margin-top: 1px;">Trading Name: ${escapeHtml(billingInfo.tradingName)}</div>` : ""}
                <div style="margin-top: 6px;">
                  <span class="meta-label">Billing Address:</span>
                  <div style="margin-top: 2px;">${escapeHtml(
                    [
                      billingInfo?.streetLine1,
                      billingInfo?.streetLine2,
                      billingInfo?.city,
                      billingInfo?.province,
                      billingInfo?.postalCode,
                      billingInfo?.country || "Philippines",
                    ]
                      .filter(Boolean)
                      .join(", ")
                  )}</div>
                </div>
              </div>
              <div>
                <div class="meta-label">TIN / Tax ID</div>
                <div style="font-weight: 700; font-size: 13px; margin-top: 2px;">
                  ${escapeHtml(billingInfo?.taxId || "000-000-000-000 (Non-VAT)")}
                </div>
                <div style="margin-top: 10px;">
                  <span class="meta-label">Business Style / Line of Business:</span>
                  <div style="font-size: 12px; margin-top: 2px;">${escapeHtml((billingInfo?.businessType || "Medical Clinic").replace("_", " "))}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="amount-in-words-box">
            <div class="label">The sum of (Amount Received in Words):</div>
            <div class="words">${escapeHtml(amountInWords)}</div>
            <div class="figures">PHP ${receipt.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Purpose / Description of Payment</th>
                <th>Payment Method</th>
                <th>Transaction Reference</th>
                <th class="right">Amount Paid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Subscription &ndash; ${escapeHtml(planName)} (${cycleLabel})</strong><br/>
                  <span style="font-size: 11px; color: ${lightColors.textMuted};">
                    Coverage: ${new Date(receipt.paidAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} &ndash; ${new Date(receipt.expiryDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                  </span>
                  ${receipt.notes ? `<div style="font-size: 11px; color: ${lightColors.textSecondary}; margin-top: 4px;"><strong>Memo:</strong> ${escapeHtml(receipt.notes)}</div>` : ""}
                </td>
                <td>
                  <span style="font-weight: 600;">${escapeHtml(receipt.paymentMethod)}</span>
                </td>
                <td>
                  <span style="font-family: monospace; font-size: 12px; font-weight: 600;">${escapeHtml(receipt.transactionReference || "N/A")}</span>
                </td>
                <td class="right" style="font-weight: 700;">${formattedAmount}</td>
              </tr>
            </tbody>
          </table>

          <div class="split-footer">
            <div class="vat-breakdown">
              <div style="font-weight: 700; margin-bottom: 6px; color: ${lightColors.text}; font-size: 11px; text-transform: uppercase;">
                BIR Value Added Tax Breakdown
              </div>
              <div class="vat-row">
                <span>VATable Sales:</span>
                <span>PHP ${vatableSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="vat-row">
                <span>VAT Amount (${isTaxExempt ? "0% / VAT-Exempt" : `${birTaxPercentage}%`}):</span>
                <span>PHP ${vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="vat-row">
                <span>VAT-Exempt Sales:</span>
                <span>PHP ${vatExemptSales.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="vat-row total">
                <span>Total Amount Received:</span>
                <span>${formattedAmount}</span>
              </div>
            </div>

            <div class="signatory-box">
              <div class="signature-line">
                Authorized Signatory
              </div>
              <div class="signatory-title">
                Finance & Billing Operations<br/>
                ${escapeHtml(corporateName)}
              </div>
            </div>
          </div>

          <div class="footer">
            <p>This Official Receipt is generated in compliance with Philippine Bureau of Internal Revenue (BIR) regulations.</p>
            <p style="margin-top: 4px;">&copy; ${new Date().getFullYear()} ${escapeHtml(corporateName)} &bull; TIN: ${escapeHtml(corporateTin)} ${tinRegistrationLabel} &bull; ${escapeHtml(supportEmail)}</p>
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
