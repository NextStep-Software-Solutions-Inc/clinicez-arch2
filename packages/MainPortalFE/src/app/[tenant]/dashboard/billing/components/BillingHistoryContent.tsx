"use client"

import React, { useState } from "react"
import { useBillingInfo } from "@/hooks/useBilling"
import { BillingInvoice } from "@/services/billing.service"
import InvoicesTable from "./InvoicesTable"
import InvoiceDetailsDialog from "./InvoiceDetailsDialog"

interface BillingHistoryContentProps {
  tenantId: string
}

export default function BillingHistoryContent({ tenantId }: BillingHistoryContentProps) {
  const { billingInfo } = useBillingInfo(tenantId)
  
  const [showInvoiceDialog, setShowInvoiceDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<BillingInvoice | null>(null)

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm overflow-hidden animate-in fade-in-50 duration-300">
      <div className="p-8 border-b border-border/60 bg-muted/20">
        <h3 className="text-xl font-bold">Billing History</h3>
        <p className="text-muted-foreground text-sm mt-1">A list of all recurring invoice receipts processed securely.</p>
      </div>

      <InvoicesTable
        invoices={billingInfo?.invoices || []}
        billingInfo={billingInfo || null}
        onViewInvoice={(invoice) => {
          setSelectedInvoice(invoice)
          setShowInvoiceDialog(true)
        }}
      />

      <InvoiceDetailsDialog
        open={showInvoiceDialog}
        onOpenChange={setShowInvoiceDialog}
        invoice={selectedInvoice}
        billingInfo={billingInfo || null}
      />
    </div>
  )
}
