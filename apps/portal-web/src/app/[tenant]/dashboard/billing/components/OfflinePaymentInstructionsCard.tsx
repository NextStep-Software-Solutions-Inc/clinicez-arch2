"use client"

import React, { useState, useEffect } from "react"
import {
  Building2,
  Smartphone,
  Copy,
  Check,
  Mail,
  ShieldCheck,
  CreditCard,
  FileCheck2,
} from "lucide-react"
import { toast } from "sonner"
import { siteEmails } from "@/config/site"
import { billingService, BillingPaymentConfig, PlatformBankAccount } from "@/services/billing.service"

export type BankAccountInfo = PlatformBankAccount

interface OfflinePaymentInstructionsCardProps {
  tenantId?: string
  bankAccounts?: BankAccountInfo[]
  paymentConfig?: BillingPaymentConfig | null
}

export const OFFLINE_BANK_ACCOUNTS: BankAccountInfo[] = [
  {
    id: "bdo",
    institution: "BDO Unibank",
    accountName: "ClinicEZ Digital Health Inc.",
    accountNumber: "0012-3456-7890",
    copyValue: "0012-3456-7890",
    branch: "BGC Corporate Center",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "bpi",
    institution: "Bank of the Philippine Islands (BPI)",
    accountName: "ClinicEZ Digital Health Inc.",
    accountNumber: "4321-8765-09",
    copyValue: "4321-8765-09",
    branch: "Ayala Triangle",
    type: "bank",
    badge: "Commercial Bank",
    isActive: true,
  },
  {
    id: "gcash-maya",
    institution: "GCash / Maya",
    accountName: "ClinicEZ Digital Health",
    accountNumber: "0917-123-EZPH (0917-123-3974)",
    copyValue: "0917-123-3974",
    branch: "Merchant QR / Mobile Wallet",
    type: "ewallet",
    badge: "Instant E-Wallet",
    isActive: true,
  },
]

export default function OfflinePaymentInstructionsCard({
  tenantId = "your-tenant-id",
  bankAccounts,
  paymentConfig,
}: OfflinePaymentInstructionsCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [liveConfig, setLiveConfig] = useState<BillingPaymentConfig | null>(paymentConfig || null)

  useEffect(() => {
    if (paymentConfig !== undefined || bankAccounts !== undefined) {
      if (paymentConfig !== undefined) setLiveConfig(paymentConfig)
      return
    }
    let active = true
    billingService
      .getPaymentConfig()
      .then((cfg) => {
        if (active && cfg) setLiveConfig(cfg)
      })
      .catch(() => {
        // Retain fallback accounts if unauthenticated or offline
      })
    return () => {
      active = false
    }
  }, [paymentConfig, bankAccounts])

  const resolvedAccounts = (
    bankAccounts ??
    liveConfig?.bankAccounts ??
    OFFLINE_BANK_ACCOUNTS
  ).filter((acct) => acct.isActive !== false)

  const billingEmail =
    liveConfig?.billingSupportEmail || siteEmails.billing || "billing@clinicez.ph"
  const corporateName =
    liveConfig?.corporateName ||
    resolvedAccounts[0]?.accountName ||
    "ClinicEZ Digital Health Inc."

  const handleCopy = async (key: string, value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
      toast.success(`${label} copied to clipboard!`)
      setTimeout(() => {
        setCopiedKey((prev) => (prev === key ? null : prev))
      }, 2500)
    } catch {
      toast.error("Failed to copy to clipboard.")
    }
  }

  return (
    <div
      data-testid="offline-payment-instructions-card"
      className="rounded-3xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-8 animate-in fade-in-50 duration-300"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight">
              Philippine Offline Bank Transfer & E-Wallet Instructions
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Direct settlement via BDO, BPI, GCash, or Maya with official BIR receipt generation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified ClinicEZ Accounts
          </span>
        </div>
      </div>

      {/* 3-Step Guidance */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            How It Works &ndash; 3 Simple Steps
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Step 1 */}
          <div className="p-5 rounded-2xl bg-muted/30 border border-border/60 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs">
                  1
                </span>
                <h4 className="font-bold text-sm">Transfer Exact Amount</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Transfer the exact subscription amount corresponding to your selected plan and billing cycle (Monthly or Annual) to any of our official accounts below.
              </p>
            </div>
            <div className="pt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
              <CreditCard className="h-3.5 w-3.5" />
              <span>Select BDO, BPI, GCash, or Maya</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className="p-5 rounded-2xl bg-muted/30 border border-border/60 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs">
                  2
                </span>
                <h4 className="font-bold text-sm">Include Payment Memo</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Crucial: Use your Tenant Slug or Workspace ID as the payment memo/narration so our finance team can instantly match your deposit.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleCopy("memo", tenantId, "Tenant memo")}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-background border border-border/80 text-xs font-mono font-medium hover:border-primary transition-colors text-foreground"
                title="Click to copy tenant memo"
              >
                <span className="truncate max-w-[170px]">{tenantId}</span>
                {copiedKey === "memo" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-sans text-muted-foreground hover:text-primary">
                    <Copy className="h-3.5 w-3.5" /> Copy Memo
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div className="p-5 rounded-2xl bg-muted/30 border border-border/60 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-xs">
                  3
                </span>
                <h4 className="font-bold text-sm">Submit Payment Proof</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Email your proof of payment (screenshot or deposit slip) to our billing desk or notify your SuperAdmin to record a payment override with instant license activation.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleCopy("email", billingEmail, "Billing email")}
                className="w-full flex items-center justify-between px-3 py-1.5 rounded-xl bg-background border border-border/80 text-xs font-sans font-medium hover:border-primary transition-colors text-foreground"
                title="Click to copy billing email"
              >
                <span className="truncate">{billingEmail}</span>
                {copiedKey === "email" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Copied
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                    <Mail className="h-3.5 w-3.5" /> Copy Email
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Verified Accounts Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-primary">
            Official Philippine Bank & E-Wallet Accounts
          </span>
          <span className="text-xs text-muted-foreground">
            Account Name: <strong className="text-foreground">{corporateName}</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {resolvedAccounts.map((account) => {
            const isCopied = copiedKey === account.id
            const Icon = account.type === "bank" ? Building2 : Smartphone

            return (
              <div
                key={account.id}
                className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-sm hover:border-primary/50 transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 rounded-xl bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm leading-tight text-foreground">
                          {account.institution}
                        </h4>
                        <span className="text-[11px] text-muted-foreground">{account.branch}</span>
                      </div>
                    </div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted text-muted-foreground">
                      {account.badge}
                    </span>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t border-border/60">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                        Account Name
                      </span>
                      <span className="text-xs font-semibold text-foreground block">
                        {account.accountName}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">
                        Account / Mobile Number
                      </span>
                      <span className="font-mono text-sm font-bold text-primary tracking-wide block">
                        {account.accountNumber}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleCopy(account.id, account.copyValue, `${account.institution} account number`)
                    }
                    className={`w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      isCopied
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                        : "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                    }`}
                  >
                    {isCopied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Account Number Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy Account Number</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legal & BIR Compliance Notice */}
      <div className="p-4 rounded-2xl bg-muted/40 border border-border/60 flex items-start gap-3 text-xs text-muted-foreground">
        <FileCheck2 className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-foreground">Official Receipt (BIR OR) Notice:</strong> Upon receipt verification by ClinicEZ Finance, an official BIR compliant receipt (<code className="font-mono text-primary font-bold">REC-YYYYMM-XXXX</code>) is generated and staged in your workspace billing history. Your cryptographic facility license tokens will activate automatically without service interruption.
          </p>
        </div>
      </div>
    </div>
  )
}
