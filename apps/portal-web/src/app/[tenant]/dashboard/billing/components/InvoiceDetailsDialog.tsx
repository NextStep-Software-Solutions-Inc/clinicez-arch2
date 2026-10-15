import React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FileText, Printer, CheckCircle2, Clock } from "lucide-react"
import { printReceipt } from "@/utils/printReceipt"
import { printInvoice } from "@/utils/printInvoice"
import { BillingInvoice, BillingInfo } from "@/services/billing.service"

interface InvoiceDetailsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoice: BillingInvoice | null
  billingInfo: BillingInfo | null
}

export default function InvoiceDetailsDialog({
  open,
  onOpenChange,
  invoice,
  billingInfo,
}: InvoiceDetailsDialogProps) {
  if (!invoice) return null

  const isManualInvoice =
    invoice.xenditInvoiceId.startsWith("MANUAL-") ||
    [
      "Bank Transfer",
      "GCash/Maya",
      "Check",
      "Cash",
      "Promotional",
    ].includes(invoice.receipt?.paymentMethod ?? "")

  const paymentMethod = invoice.receipt?.paymentMethod || (isManualInvoice ? "Manual Payment" : "Xendit Card / Auto")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-3xl border border-primary/20 bg-background shadow-2xl p-0 overflow-hidden">
        <div className="p-6 bg-gradient-to-br from-primary/10 via-background to-background border-b border-primary/10">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5.5 w-5.5 text-primary" />
                {invoice.status === "Paid" ? "Official Receipt & Invoice" : "Official Invoice"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isManualInvoice
                  ? "Verified manual payment record · BIR official receipt generated"
                  : "Processed securely via Xendit payments network"}
              </DialogDescription>
            </div>
            <div className="text-right">
              {invoice.status === "Paid" ? (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Paid Status
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20">
                  <Clock className="h-3.5 w-3.5" />
                  Issued Status
                </span>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Invoice / Receipt Details Info */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 rounded-2xl p-4 border border-border/40">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {invoice.status === "Paid" ? "Receipt Number" : "Invoice Number"}
              </p>
              <p className="font-mono font-bold text-foreground mt-0.5">
                {invoice.status === "Paid"
                  ? invoice.receipt?.receiptNumber || invoice.invoiceNumber
                  : invoice.invoiceNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {invoice.status === "Paid" ? "Transaction Date & Time" : "Invoice Date & Time"}
              </p>
              <p className="font-semibold text-foreground mt-0.5">
                {invoice.status === "Paid" && invoice.receipt
                  ? new Date(invoice.receipt.paidAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : new Date(invoice.createdAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Billing Plan</p>
              <p className="font-semibold text-foreground capitalize mt-0.5">
                {invoice.planSlug} Plan ({invoice.isAnnual ? "Annual" : "Monthly"})
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Coverage Period</p>
              <p className="font-semibold text-foreground mt-0.5">
                {invoice.status === "Paid" && invoice.receipt ? (
                  <>
                    {new Date(invoice.receipt.paidAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    {" - "}
                    {new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </>
                ) : (
                  <>
                    {new Date(invoice.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                    {" - "}
                    {new Date(new Date(invoice.createdAt).setMonth(new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1))).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                  </>
                )}
              </p>
            </div>

            {/* Payment Method Badge */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Payment Method</p>
              <div className="mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    paymentMethod === "Bank Transfer"
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                      : paymentMethod === "GCash/Maya"
                      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                      : paymentMethod === "Check"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                      : paymentMethod === "Cash"
                      ? "bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20"
                      : paymentMethod === "Promotional"
                      ? "bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20"
                      : "bg-muted text-muted-foreground border border-border/40"
                  }`}
                >
                  {paymentMethod}
                </span>
              </div>
            </div>

            {/* Transaction Reference when present */}
            {invoice.receipt?.transactionReference && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Transaction Reference</p>
                <p className="font-mono font-bold text-foreground mt-0.5">
                  {invoice.receipt.transactionReference}
                </p>
              </div>
            )}

            {/* Admin Notes / Memo when present */}
            {invoice.receipt?.notes && (
              <div className="col-span-2 bg-muted/40 p-3 rounded-xl border border-border/40 mt-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                  Payment Notes / Memo
                </p>
                <p className="text-xs text-foreground font-medium mt-1 whitespace-pre-wrap">
                  {invoice.receipt.notes}
                </p>
              </div>
            )}
          </div>

          {/* Billing Entity Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">
              Billing Entity Information
            </h4>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground">Clinic Name</p>
                <p className="font-semibold text-foreground mt-0.5">{billingInfo?.clinicName || "Clinic Provider"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Trading Name / Brand</p>
                <p className="font-semibold text-foreground mt-0.5">{billingInfo?.tradingName || "--"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Business Type</p>
                <p className="font-semibold text-foreground capitalize mt-0.5">
                  {(billingInfo?.businessType || "SOLE_PROPRIETOR").replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">TIN / Tax ID</p>
                <p className="font-semibold text-foreground mt-0.5">{billingInfo?.taxId || "--"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Billing Address</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {[
                    billingInfo?.streetLine1,
                    billingInfo?.streetLine2,
                    billingInfo?.city,
                    billingInfo?.province,
                    billingInfo?.postalCode,
                    billingInfo?.country,
                  ]
                    .filter(Boolean)
                    .join(", ") || "--"}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">
              Amount Summary
            </h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal</span>
                <span>{invoice.currency} {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Value Added Tax (0% / VAT-Exempt)</span>
                <span>{invoice.currency} 0.00</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-bold text-foreground">
                <span>
                  {invoice.status === "Paid" ? "Total Amount Paid" : "Total Amount Due"}
                </span>
                <span>{invoice.currency} {invoice.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {invoice.status === "Paid" && (
                <div className="flex justify-between text-muted-foreground text-xs pt-1">
                  <span>Settlement Method</span>
                  <span>{paymentMethod}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-muted/10 border-t border-border/40 gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-full px-5 text-xs font-semibold"
          >
            Close
          </Button>

          {/* View Original External Link ONLY if genuine automated Xendit invoice, NEVER for manual overrides or synthetic IDs */}
          {!isManualInvoice &&
            !invoice.xenditInvoiceId.startsWith("recy_") &&
            !invoice.xenditInvoiceId.startsWith("MANUAL-") &&
            (invoice.xenditInvoiceId.startsWith("http") || /^[a-f\d]{24}$/i.test(invoice.xenditInvoiceId)) && (
              <a
                href={
                  invoice.xenditInvoiceId.startsWith("http")
                    ? invoice.xenditInvoiceId
                    : `https://checkout-staging.xendit.co/web/${invoice.xenditInvoiceId}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-full bg-secondary hover:bg-secondary/80 px-5 text-xs font-semibold text-secondary-foreground transition-colors mr-auto"
              >
                View on Xendit
              </a>
            )}

          {invoice.status === "Paid" && invoice.receipt && (
            <Button
              type="button"
              onClick={() => {
                if (invoice.receipt) {
                  printReceipt(
                    invoice.receipt,
                    billingInfo,
                    invoice.planSlug,
                    invoice.isAnnual,
                    invoice.xenditInvoiceId,
                    invoice.invoiceNumber
                  )
                }
              }}
              className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Receipt
            </Button>
          )}

          <Button
            type="button"
            onClick={() => {
              printInvoice(invoice, billingInfo)
            }}
            className="rounded-full px-5 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5"
          >
            <Printer className="h-3.5 w-3.5" />
            Print Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
