import { BillingInvoice, BillingInfo, BillingPaymentConfig } from "@/services/billing.service"
import { toast } from "sonner"
import { siteEmails } from "@/config/site"
import { lightColors } from "@clinicez/design-tokens"

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

export const printInvoice = (
  invoice: BillingInvoice,
  billingInfo: BillingInfo | null,
  paymentConfigOverride?: Partial<BillingPaymentConfig>
) => {
  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    toast.error("Popup blocker prevented opening the print invoice window.")
    return
  }

  const cfg = { ...billingInfo?.paymentConfig, ...paymentConfigOverride }
  const corporateName = cfg.corporateName || "Nextstep Software Corporation"
  const corporateTin = cfg.corporateTin || "009-876-543-000"
  const corporateAddress =
    cfg.corporateAddress ||
    "Unit 1402, BGC Corporate Center, 11th Avenue, Bonifacio Global City, Taguig City, Metro Manila, Philippines 1634"
  const birTaxExempt = cfg.birTaxExempt ?? false
  const birTaxPercentage = cfg.birTaxPercentage ?? 12
  const isTaxExempt = birTaxExempt || birTaxPercentage <= 0
  const vatableSales = isTaxExempt
    ? invoice.amount
    : invoice.amount > 0
    ? invoice.amount / (1 + birTaxPercentage / 100)
    : 0
  const vatAmount = isTaxExempt ? 0 : invoice.amount - vatableSales

  const planName =
    invoice.planSlug.toLowerCase() === "pro"
      ? "Professional Plan"
      : invoice.planSlug.toLowerCase() === "enterprise"
      ? "Enterprise Health Plan"
      : "Starter Plan"
  const cycleLabel = invoice.isAnnual ? "Annual" : "Monthly"
  const coverageStart = new Date(invoice.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })
  const coverageEnd = invoice.receipt?.expiryDate
    ? new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : new Date(
        new Date(invoice.createdAt).setMonth(
          new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1)
        )
      ).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

  const formattedAmount = `${escapeHtml(invoice.currency)} ${invoice.amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const formattedVatableSales = `${escapeHtml(invoice.currency)} ${vatableSales.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
  const formattedVatAmount = `${escapeHtml(invoice.currency)} ${vatAmount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

  const isManual =
    invoice.xenditInvoiceId.startsWith("MANUAL-") ||
    [
      "Bank Transfer",
      "GCash/Maya",
      "Check",
      "Cash",
      "Promotional",
    ].includes(invoice.receipt?.paymentMethod ?? "")

  const supportEmail = cfg.billingSupportEmail || siteEmails.billing || "billing@clinicez.ph"
  const tinRegistrationLabel = isTaxExempt ? "VAT-Exempt" : "VAT Registered"

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice_${escapeHtml(invoice.invoiceNumber)}</title>
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
            border: 1px solid ${lightColors.border};
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
            margin-bottom: 28px;
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
          .invoice-title {
            text-align: right;
          }
          .invoice-title h1 {
            margin: 0;
            font-size: 26px;
            font-weight: 900;
            color: ${lightColors.text};
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .invoice-title .doc-number {
            margin: 4px 0 0 0;
            font-family: monospace;
            font-size: 14px;
            font-weight: 700;
            color: ${lightColors.primary};
          }
          .details-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 28px;
            margin-bottom: 32px;
          }
          .details-block h3 {
            margin: 0 0 8px 0;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: ${lightColors.textMuted};
            letter-spacing: 0.8px;
          }
          .details-block p {
            margin: 3px 0;
            font-size: 13px;
            color: ${lightColors.text};
          }
          .details-block .name {
            font-weight: 700;
            font-size: 15px;
            color: ${lightColors.text};
          }
          .details-block .meta-label {
            color: ${lightColors.textMuted};
            font-size: 12px;
          }
          .status-badge {
            display: inline-block;
            font-weight: 800;
            font-size: 12px;
            text-transform: uppercase;
            padding: 4px 10px;
            border-radius: 9999px;
            margin-bottom: 8px;
          }
          .status-paid {
            background-color: ${lightColors.successBg};
            color: ${lightColors.successText};
            border: 1px solid ${lightColors.successBorder};
          }
          .status-issued {
            background-color: ${lightColors.infoBg};
            color: ${lightColors.infoText};
            border: 1px solid ${lightColors.infoBorder};
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 28px;
          }
          .table th {
            background-color: ${lightColors.surfaceMuted};
            color: ${lightColors.textMuted};
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            padding: 12px 14px;
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
          .totals-block {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-top: 20px;
          }
          .total-row {
            display: flex;
            width: 320px;
            justify-content: space-between;
            padding: 6px 0;
            font-size: 13px;
            color: ${lightColors.textSecondary};
          }
          .total-row.grand-total {
            border-top: 2px solid ${lightColors.border};
            padding-top: 12px;
            margin-top: 6px;
            font-size: 18px;
            font-weight: 800;
            color: ${lightColors.text};
          }
          .payment-meta-box {
            margin-top: 24px;
            padding: 14px 16px;
            border-radius: 12px;
            background-color: ${lightColors.surfaceMuted};
            border: 1px solid ${lightColors.border};
            font-size: 12px;
          }
          .payment-meta-box strong {
            color: ${lightColors.text};
          }
          .footer {
            margin-top: 40px;
            border-top: 1px solid ${lightColors.borderLight};
            padding-top: 20px;
            text-align: center;
            font-size: 11px;
            color: ${lightColors.textMuted};
          }
          @media print {
            body { padding: 0; background: none; }
            .container { border: none; box-shadow: none; padding: 16px; max-width: 100%; }
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
                BIR Registered TIN: ${escapeHtml(corporateTin)} ${tinRegistrationLabel}<br/>
                ${escapeHtml(corporateAddress)}<br/>
                Billing Support: ${escapeHtml(supportEmail)}
              </div>
            </div>
            <div class="invoice-title">
              <div>
                ${
                  invoice.status === "Paid"
                    ? '<span class="status-badge status-paid">PAID</span>'
                    : '<span class="status-badge status-issued">ISSUED</span>'
                }
              </div>
              <h1>INVOICE</h1>
              <div class="doc-number">${escapeHtml(invoice.invoiceNumber)}</div>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-block">
              <h3>Billed To:</h3>
              <p class="name">${escapeHtml(billingInfo?.clinicName || "Clinic Subscriber")}</p>
              ${billingInfo?.tradingName ? `<p><span class="meta-label">Trading Name:</span> ${escapeHtml(billingInfo.tradingName)}</p>` : ""}
              <p><span class="meta-label">TIN / Tax ID:</span> ${escapeHtml(billingInfo?.taxId || "000-000-000-000")}</p>
              <p>${escapeHtml(
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
              )}</p>
            </div>
            <div class="details-block" style="text-align: right;">
              <h3>Invoice Details:</h3>
              <p><span class="meta-label">Invoice Date:</span> ${new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>
              <p><span class="meta-label">Billing Cycle:</span> ${cycleLabel}</p>
              <p><span class="meta-label">Coverage Period:</span> ${coverageStart} &ndash; ${coverageEnd}</p>
              <p><span class="meta-label">Payment Status:</span> <strong>${escapeHtml(invoice.status)}</strong></p>
              ${
                invoice.receipt?.receiptNumber
                  ? `<p><span class="meta-label">Official Receipt No:</span> <strong>${escapeHtml(invoice.receipt.receiptNumber)}</strong></p>`
                  : ""
              }
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Description / Service</th>
                <th>Cycle</th>
                <th>Coverage Period</th>
                <th class="right">Amount (PHP)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Clinic EZ Workspace License &ndash; ${escapeHtml(planName)}</strong><br/>
                  <span style="font-size: 11px; color: ${lightColors.textMuted};">
                    Full access to clinical EMR, doctor rostering, queuing, PhilHealth Konsulta integration, and licensed facilities.
                  </span>
                </td>
                <td>${cycleLabel}</td>
                <td>${coverageStart} &ndash; ${coverageEnd}</td>
                <td class="right">${formattedAmount}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals-block">
            <div class="total-row">
              <span>${isTaxExempt ? "Subtotal (VAT-Exempt)" : "VATable Sales"}</span>
              <span>${formattedVatableSales}</span>
            </div>
            <div class="total-row">
              <span>${
                isTaxExempt
                  ? "Value-Added Tax (0% / VAT-Exempt)"
                  : `Value-Added Tax (${birTaxPercentage}% VAT)`
              }</span>
              <span>${formattedVatAmount}</span>
            </div>
            <div class="total-row grand-total">
              <span>${invoice.status === "Paid" ? "Total Amount Paid" : "Total Amount Due"}</span>
              <span>${formattedAmount}</span>
            </div>
          </div>

          ${
            invoice.status === "Paid" && invoice.receipt
              ? `
              <div class="payment-meta-box">
                <div style="font-weight: 700; margin-bottom: 4px; color: ${lightColors.primary};">
                  Payment Verification Details
                </div>
                <div><strong>Payment Method:</strong> ${escapeHtml(invoice.receipt.paymentMethod)}</div>
                ${
                  invoice.receipt.transactionReference
                    ? `<div><strong>Transaction Reference:</strong> ${escapeHtml(invoice.receipt.transactionReference)}</div>`
                    : ""
                }
                <div><strong>Payment Date:</strong> ${new Date(invoice.receipt.paidAt).toLocaleString("en-US", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                ${
                  invoice.receipt.notes
                    ? `<div style="margin-top: 4px;"><strong>Admin Memo:</strong> ${escapeHtml(invoice.receipt.notes)}</div>`
                    : ""
                }
              </div>
              `
              : !isManual && !invoice.xenditInvoiceId.startsWith("recy_")
              ? `
              <div class="payment-meta-box">
                <div><strong>Automated Payment Gateway:</strong> Xendit Payments Network</div>
                <div><strong>Reference:</strong> ${escapeHtml(invoice.xenditInvoiceId)}</div>
              </div>
              `
              : ""
          }

          <div class="footer">
            <p>Thank you for choosing Clinic EZ to power your healthcare facility operations. Clinic EZ is a product of ${escapeHtml(corporateName)}. For billing assistance, contact ${escapeHtml(supportEmail)}.</p>
            <p style="margin-top: 4px;">&copy; ${new Date().getFullYear()} ${escapeHtml(corporateName)}. All rights reserved.</p>
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
