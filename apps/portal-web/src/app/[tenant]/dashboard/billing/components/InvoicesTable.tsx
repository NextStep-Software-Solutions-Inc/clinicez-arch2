import React from "react"
import { FileText, Printer, CheckCircle2, Clock, AlertCircle } from "lucide-react"
import { printReceipt } from "@/utils/printReceipt"
import { printInvoice } from "@/utils/printInvoice"
import { BillingInvoice, BillingInfo } from "@/services/billing.service"

interface InvoicesTableProps {
  invoices: BillingInvoice[]
  billingInfo: BillingInfo | null
  onViewInvoice: (invoice: BillingInvoice) => void
}

export default function InvoicesTable({
  invoices,
  billingInfo,
  onViewInvoice,
}: InvoicesTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 stroke-[1.5] opacity-50" />
        <p className="font-medium">No billing invoices recorded yet.</p>
        <p className="text-xs mt-1">Invoices and official receipts will populate here automatically upon payment or renewal.</p>
      </div>
    )
  }

  const getMethodBadge = (invoice: BillingInvoice) => {
    const method = invoice.receipt?.paymentMethod
    const isManual =
      invoice.xenditInvoiceId.startsWith("MANUAL-") ||
      ["Bank Transfer", "GCash/Maya", "Check", "Cash", "Promotional"].includes(method ?? "")

    if (method === "Bank Transfer") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
          Bank Transfer
        </span>
      )
    }
    if (method === "GCash/Maya") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
          GCash / Maya
        </span>
      )
    }
    if (method === "Check") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
          Check
        </span>
      )
    }
    if (method === "Cash") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
          Cash
        </span>
      )
    }
    if (method === "Promotional") {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20">
          Promotional
        </span>
      )
    }
    if (isManual) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
          Manual Override
        </span>
      )
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border/40">
        Card (Xendit)
      </span>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="border-b border-border/60 text-muted-foreground font-medium bg-muted/10">
            <th className="p-4 pl-8">Invoice Number</th>
            <th className="p-4">Plan Name</th>
            <th className="p-4">Billing Cycle</th>
            <th className="p-4">Payment Method</th>
            <th className="p-4">Invoice Date & Time</th>
            <th className="p-4">Coverage Period</th>
            <th className="p-4">Amount</th>
            <th className="p-4">Status</th>
            <th className="p-4 pr-8 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice, idx) => (
            <tr
              key={idx}
              onClick={() => onViewInvoice(invoice)}
              className="border-b border-border/40 hover:bg-muted/10 transition-colors cursor-pointer"
            >
              <td className="p-4 pl-8 font-mono text-xs text-primary hover:underline font-semibold">
                {invoice.invoiceNumber}
              </td>
              <td className="p-4 font-semibold capitalize">{invoice.planSlug}</td>
              <td className="p-4">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                    invoice.isAnnual
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {invoice.isAnnual ? "Annual" : "Monthly"}
                </span>
              </td>
              <td className="p-4">
                {getMethodBadge(invoice)}
              </td>
              <td className="p-4 text-xs text-muted-foreground">
                {new Date(invoice.createdAt).toLocaleString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
              <td className="p-4 text-muted-foreground text-xs">
                {new Date(invoice.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
                {" - "}
                {invoice.receipt?.expiryDate
                  ? new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                  : new Date(
                      new Date(invoice.createdAt).setMonth(
                        new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1)
                      )
                    ).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
              </td>
              <td className="p-4 font-semibold">
                {invoice.currency} {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className="p-4">
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    invoice.status === "Paid"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                      : invoice.status === "Failed"
                      ? "bg-destructive/10 text-destructive border border-destructive/20"
                      : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                  }`}
                >
                  {invoice.status === "Paid" ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : invoice.status === "Failed" ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : (
                    <Clock className="h-3 w-3" />
                  )}
                  {invoice.status}
                </span>
              </td>
              <td
                className="p-4 pr-8 text-right flex items-center justify-end gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                {invoice.status === "Paid" && invoice.receipt && (
                  <button
                    type="button"
                    onClick={() => {
                      printReceipt(
                        invoice.receipt!,
                        billingInfo,
                        invoice.planSlug,
                        invoice.isAnnual,
                        invoice.xenditInvoiceId,
                        invoice.invoiceNumber
                      )
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors bg-transparent border-0 cursor-pointer p-0"
                    title="Print BIR Official Receipt"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Receipt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    printInvoice(invoice, billingInfo)
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 cursor-pointer p-0"
                  title="Print Invoice"
                >
                  <FileText className="h-3.5 w-3.5" />
                  Invoice
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
