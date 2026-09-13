import React from "react"
import { FileText, Printer } from "lucide-react"
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
        <p>No billing invoices recorded yet.</p>
        <p className="text-xs mt-1">Invoices will populate here automatically upon cycle created events.</p>
      </div>
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
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-medium ${
                  invoice.isAnnual 
                    ? 'bg-primary/10 text-primary' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {invoice.isAnnual ? "Annual" : "Monthly"}
                </span>
              </td>
              <td className="p-4 text-xs text-muted-foreground">
                {new Date(invoice.createdAt).toLocaleString("en-US", { 
                  year: 'numeric', 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </td>
              <td className="p-4 text-muted-foreground text-xs">
                {new Date(invoice.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                {" - "}
                {invoice.receipt?.expiryDate 
                  ? new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
                  : new Date(new Date(invoice.createdAt).setMonth(new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1))).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })
                }
              </td>
              <td className="p-4 font-semibold">
                {invoice.currency} {invoice.amount.toLocaleString()}
              </td>
              <td className="p-4">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  invoice.status === "Paid"
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' 
                    : invoice.status === "Failed"
                      ? 'bg-destructive/10 text-destructive'
                      : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                }`}>
                  {invoice.status}
                </span>
              </td>
              <td className="p-4 pr-8 text-right flex items-center justify-end gap-4" onClick={(e) => e.stopPropagation()}>
                {invoice.status === "Paid" && invoice.receipt && (
                  <button
                    type="button"
                    onClick={() => {
                      printReceipt(invoice.receipt!, billingInfo, invoice.planSlug, invoice.isAnnual, invoice.xenditInvoiceId)
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors bg-transparent border-0 cursor-pointer p-0"
                  >
                    <Printer className="h-4 w-4" />
                    Print Receipt
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    printInvoice(invoice, billingInfo)
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors bg-transparent border-0 cursor-pointer p-0"
                >
                  <Printer className="h-4 w-4" />
                  Print Invoice
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
