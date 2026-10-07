import { PaymentReceipt, BillingInfo } from "@/services/billing.service"
import { toast } from "sonner"
import { siteEmails } from "@/config/site";

export const printReceipt = (
  receipt: PaymentReceipt,
  billingInfo: BillingInfo | null,
  planSlug: string,
  isAnnual: boolean,
  xenditInvoiceId: string
) => {
  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    toast.error("Popup blocker prevented opening the print receipt window.")
    return
  }

  const planName = planSlug.toLowerCase() === "pro" ? "Professional Plan" : "Starter Plan"
  const cycleLabel = isAnnual ? "Annual" : "Monthly"
  const coverageStart = new Date(receipt.paidAt).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })
  const coverageEnd = new Date(receipt.expiryDate).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })

  const formattedAmount = `${receipt.currency} ${receipt.amountPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  printWindow.document.write(`
    <html>
      <head>
        <title>Receipt_${receipt.receiptNumber}</title>
        <style>
          body {
            font-family: 'Inter', system-ui, -apple-system, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 40px;
            line-height: 1.5;
          }
          .container {
            max-width: 800px;
            margin: 0 auto;
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 24px;
            margin-bottom: 32px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #2563eb;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .receipt-title {
            text-align: right;
          }
          .receipt-title h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 900;
            color: #0f172a;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .receipt-title p {
            margin: 4px 0 0 0;
            font-size: 14px;
            color: #64748b;
          }
          .details-grid {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 32px;
            margin-bottom: 40px;
          }
          .details-block h3 {
            margin: 0 0 12px 0;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            letter-spacing: 0.5px;
          }
          .details-block p {
            margin: 4px 0;
            font-size: 14px;
          }
          .details-block .name {
            font-weight: 700;
            font-size: 16px;
            color: #0f172a;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          .table th {
            background-color: #f8fafc;
            color: #64748b;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 14px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
          }
          .table td {
            padding: 16px 14px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 14px;
          }
          .table td.right {
            text-align: right;
          }
          .table th.right {
            text-align: right;
          }
          .totals-block {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            margin-top: 24px;
          }
          .total-row {
            display: flex;
            width: 300px;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 14px;
          }
          .total-row.grand-total {
            border-top: 2px solid #e2e8f0;
            padding-top: 16px;
            margin-top: 8px;
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
          }
          .footer {
            margin-top: 60px;
            border-top: 1px solid #e2e8f0;
            padding-top: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
          }
          .paid-stamp {
            display: inline-block;
            border: 3px solid #10b981;
            color: #10b981;
            font-weight: 800;
            font-size: 14px;
            text-transform: uppercase;
            padding: 6px 12px;
            border-radius: 6px;
            margin-bottom: 16px;
            transform: rotate(-5deg);
          }
          @media print {
            body { padding: 0; }
            .container { border: none; box-shadow: none; padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div>
              <div class="logo">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="color: #2563eb; margin-right: 8px;"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
                ClinicEZ
              </div>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">NextStep Software Corporation<br/>Pasig City, Metro Manila, Philippines</p>
            </div>
            <div class="receipt-title">
              <div class="paid-stamp">PAID</div>
              <h1>RECEIPT</h1>
              <p>No: ${receipt.receiptNumber}</p>
            </div>
          </div>

          <div class="details-grid">
            <div class="details-block">
              <h3>Billed To:</h3>
              <p class="name">${billingInfo?.clinicName || "Clinic Owner"}</p>
              ${billingInfo?.tradingName ? `<p>Trading Name: ${billingInfo.tradingName}</p>` : ""}
              ${billingInfo?.taxId ? `<p>TIN/Tax ID: ${billingInfo.taxId}</p>` : ""}
              <p>${billingInfo?.streetLine1 || ""}${billingInfo?.streetLine2 ? ", " + billingInfo.streetLine2 : ""}</p>
              <p>${billingInfo?.city || ""}, ${billingInfo?.province || ""} ${billingInfo?.postalCode || ""}</p>
              <p>${billingInfo?.country || ""}</p>
            </div>
            <div class="details-block" style="text-align: right;">
              <h3>Payment Info:</h3>
              <p><strong>Date Paid:</strong> ${new Date(receipt.paidAt).toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p><strong>Xendit Invoice ID:</strong> ${xenditInvoiceId}</p>
              <p><strong>Payment Status:</strong> Successful (${receipt.paymentMethod})</p>
            </div>
          </div>

          <table class="table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Billing Cycle</th>
                <th>Coverage Period</th>
                <th class="right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>${planName} Subscription</strong><br/>
                  <span style="font-size: 12px; color: #64748b;">Full access to ClinicEZ ${planName} features.</span>
                </td>
                <td>${cycleLabel}</td>
                <td>${coverageStart} - ${coverageEnd}</td>
                <td class="right">${formattedAmount}</td>
              </tr>
            </tbody>
          </table>

          <div class="totals-block">
            <div class="total-row">
              <span style="color: #64748b;">Subtotal</span>
              <span>${formattedAmount}</span>
            </div>
            <div class="total-row">
              <span style="color: #64748b;">Tax / VAT (0%)</span>
              <span>PHP 0.00</span>
            </div>
            <div class="total-row grand-total">
              <span>Amount Paid</span>
              <span>${formattedAmount}</span>
            </div>
          </div>

          <div class="footer">
            <p>Thank you for subscribing to ClinicEZ!${siteEmails.billing ? ` For billing support, email ${siteEmails.billing}.` : ""}</p>
            <p style="margin-top: 8px;">&copy; ${new Date().getFullYear()} NextStep Software Corporation. All rights reserved.</p>
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
