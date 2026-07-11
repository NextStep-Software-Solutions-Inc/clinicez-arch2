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
import { FileText, Printer } from "lucide-react"
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl rounded-3xl border border-primary/20 bg-background shadow-2xl p-0 overflow-hidden">
        <div className="p-6 bg-gradient-to-br from-primary/10 via-background to-background border-b border-primary/10">
          <DialogHeader className="flex flex-row items-center justify-between space-y-0">
            <div className="space-y-1">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5.5 w-5.5 text-primary" />
                {invoice.status === "Paid" ? "Official Receipt" : "Official Invoice"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Processed securely via Xendit payments network
              </DialogDescription>
            </div>
            <div className="text-right">
              {invoice.status === "Paid" ? (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  Paid Status
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400">
                  Issued Status
                </span>
              )}
            </div>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Invoice/Receipt Details Info */}
          <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 rounded-2xl p-4 border border-border/40">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                {invoice.status === "Paid" ? "Receipt Number" : "Invoice Number"}
              </p>
              <p className="font-mono text-foreground mt-0.5">
                {invoice.status === "Paid" 
                  ? invoice.receipt?.receiptNumber 
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
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })
                  : new Date(invoice.createdAt).toLocaleString("en-US", {
                      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })
                }
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
                    {new Date(invoice.receipt.paidAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                    {" - "}
                    {new Date(invoice.receipt.expiryDate).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                  </>
                ) : (
                  <>
                    {new Date(invoice.createdAt).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                    {" - "}
                    {new Date(new Date(invoice.createdAt).setMonth(new Date(invoice.createdAt).getMonth() + (invoice.isAnnual ? 12 : 1))).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric' })}
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Billing Entity Info */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">Billing Details</h4>
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
                    billingInfo?.country
                  ].filter(Boolean).join(", ") || "--"}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Summary */}
          <div className="space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-primary border-b border-border/60 pb-1">Amount Summary</h4>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Subtotal</span>
                <span>{invoice.currency} {invoice.amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-muted-foreground text-xs">
                <span>Tax (0% / VAT Exempt)</span>
                <span>{invoice.currency} 0</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-2 font-bold text-foreground">
                <span>
                  {invoice.status === "Paid" ? "Total Amount Paid" : "Total Amount Due"}
                </span>
                <span>{invoice.currency} {invoice.amount.toLocaleString()}</span>
              </div>
              {invoice.status === "Paid" && invoice.receipt && (
                <div className="flex justify-between text-muted-foreground text-xs pt-1">
                  <span>Payment Method</span>
                  <span>{invoice.receipt.paymentMethod}</span>
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
          
          {/* View Original External Link if it is not a cycle recurring ID */}
          {!invoice.xenditInvoiceId.startsWith("recy_") && (
            <a
              href={
                invoice.xenditInvoiceId.startsWith("http")
                  ? invoice.xenditInvoiceId
                  : /^[a-f\d]{24}$/i.test(invoice.xenditInvoiceId)
                    ? `https://checkout-staging.xendit.co/web/${invoice.xenditInvoiceId}`
                    : `https://checkout.xendit.co/web/invoices/${invoice.xenditInvoiceId}`
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
                  printReceipt(invoice.receipt, billingInfo, invoice.planSlug, invoice.isAnnual, invoice.xenditInvoiceId)
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
      </Dialog>
    </Dialog>
  )
}
