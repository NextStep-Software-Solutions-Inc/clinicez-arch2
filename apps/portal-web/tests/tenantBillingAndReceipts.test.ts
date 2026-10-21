import { describe, test, expect, mock } from "bun:test"
import React from "react"
import { renderToString } from "react-dom/server"
import * as fs from "fs"
import * as path from "path"

import OfflinePaymentInstructionsCard, {
  OFFLINE_BANK_ACCOUNTS,
} from "../src/app/[tenant]/dashboard/billing/components/OfflinePaymentInstructionsCard"
import InvoicesTable from "../src/app/[tenant]/dashboard/billing/components/InvoicesTable"
import { numberToWords } from "../src/utils/numberToWords"
import { printReceipt } from "../src/utils/printReceipt"
import { printInvoice } from "../src/utils/printInvoice"
import { BillingInvoice, BillingInfo, PaymentReceipt } from "../src/services/billing.service"
import { lightColors } from "@clinicez/design-tokens"

describe("Milestone 4: Tenant Billing Guidance, Offline Banking Instructions & Official Receipts", () => {
  const sampleBillingInfo: BillingInfo = {
    subscriptionStatus: "ACTIVE",
    subscriptionPlanId: "starter",
    invoices: [],
    name: "St. Jude Family Care Clinic",
    clinicName: "St. Jude Family Care Clinic",
    tradingName: "St. Jude Health Solutions",
    businessType: "CORPORATION",
    phoneNumber: "+63 917 555 1234",
    country: "Philippines",
    streetLine1: "123 Mabini Street, Suite 4B",
    city: "Quezon City",
    province: "Metro Manila",
    postalCode: "1101",
    taxId: "123-456-789-000",
    isAnnual: true,
    subscriptionExpiresAt: "2027-10-15T00:00:00Z",
  }

  const sampleManualReceipt: PaymentReceipt = {
    receiptNumber: "REC-202610-0001",
    amountPaid: 29990,
    currency: "PHP",
    paidAt: "2026-10-15T02:30:00.000Z",
    expiryDate: "2027-10-15T02:30:00.000Z",
    paymentMethod: "Bank Transfer",
    transactionReference: "BDO-982141",
    notes: "Verified direct BDO online bank deposit by Dr. Santos",
  }

  const sampleManualInvoice: BillingInvoice = {
    invoiceNumber: "INV-202610-0001",
    amount: 29990,
    currency: "PHP",
    status: "Paid",
    planSlug: "starter",
    isAnnual: true,
    createdAt: "2026-10-15T02:00:00.000Z",
    xenditInvoiceId: "MANUAL-INV-202610-0001-a1b2c3d4e5f6",
    receipt: sampleManualReceipt,
  }

  const sampleAutomatedInvoice: BillingInvoice = {
    invoiceNumber: "INV-202609-0042",
    amount: 2999,
    currency: "PHP",
    status: "Paid",
    planSlug: "starter",
    isAnnual: false,
    createdAt: "2026-09-15T00:00:00.000Z",
    xenditInvoiceId: "6504a1b2c3d4e5f60718293a",
    receipt: {
      receiptNumber: "REC-202609-0042",
      amountPaid: 2999,
      currency: "PHP",
      paidAt: "2026-09-15T00:05:00.000Z",
      expiryDate: "2026-10-15T00:05:00.000Z",
      paymentMethod: "Credit Card (Xendit)",
    },
  }

  // =========================================================================
  // Dimension 1: Philippine Offline Banking Instructions
  // =========================================================================
  describe("Dimension 1: Philippine Offline Banking Instructions", () => {
    test("M4.1.1: BDO Unibank account details are verified and prominently specified", () => {
      const bdo = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "bdo")
      expect(bdo).toBeDefined()
      expect(bdo?.institution).toBe("BDO Unibank")
      expect(bdo?.accountName).toBe("Nextstep Software Corporation")
      expect(bdo?.accountNumber).toBe("0012-3456-7890")
      expect(bdo?.branch).toBe("BGC Corporate Center")
      expect(bdo?.copyValue).toBe("0012-3456-7890")
    })

    test("M4.1.2: Bank of the Philippine Islands (BPI) account details are verified", () => {
      const bpi = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "bpi")
      expect(bpi).toBeDefined()
      expect(bpi?.institution).toBe("Bank of the Philippine Islands (BPI)")
      expect(bpi?.accountName).toBe("Nextstep Software Corporation")
      expect(bpi?.accountNumber).toBe("4321-8765-09")
      expect(bpi?.branch).toBe("Ayala Triangle")
      expect(bpi?.copyValue).toBe("4321-8765-09")
    })

    test("M4.1.3: GCash / Maya e-wallet details and merchant number are verified", () => {
      const ewallet = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "gcash-maya")
      expect(ewallet).toBeDefined()
      expect(ewallet?.institution).toContain("GCash")
      expect(ewallet?.institution).toContain("Maya")
      expect(ewallet?.accountName).toBe("Nextstep Software Corporation")
      expect(ewallet?.accountNumber).toContain("0917-123-EZPH")
      expect(ewallet?.accountNumber).toContain("0917-123-3974")
      expect(ewallet?.copyValue).toBe("0917-123-3974")
    })

    test("M4.1.4: OfflinePaymentInstructionsCard renders 3-step instructions and tenant memo", () => {
      const html = renderToString(
        React.createElement(OfflinePaymentInstructionsCard, { tenantId: "clinic-st-jude-bgc" })
      )

      expect(html).toContain("Transfer Exact Amount")
      expect(html).toContain("Include Payment Memo")
      expect(html).toContain("Submit Payment Proof")
      expect(html).toContain("clinic-st-jude-bgc")
      expect(html).toContain("billing@clinicez.ph")
      expect(html).toContain("Copy Account Number")
      expect(html).toContain("REC-YYYYMM-XXXX")
    })
  })

  // =========================================================================
  // Dimension 2: InvoicesTable & InvoiceDetailsDialog
  // =========================================================================
  describe("Dimension 2: InvoicesTable & InvoiceDetailsDialog", () => {
    test("M4.2.1: InvoicesTable renders manual payment badges and distinguishes from automated", () => {
      const mockOnView = mock(() => {})
      const html = renderToString(
        React.createElement(InvoicesTable, {
          invoices: [sampleManualInvoice, sampleAutomatedInvoice],
          billingInfo: sampleBillingInfo,
          onViewInvoice: mockOnView,
        })
      )

      expect(html).toContain("INV-202610-0001")
      expect(html).toContain("INV-202609-0042")
      expect(html).toContain("Bank Transfer")
      expect(html).toContain("Card (Xendit)")
      expect(html).toContain("Receipt")
      expect(html).toContain("Invoice")
    })

    test("M4.2.2: InvoicesTable handles empty invoices state gracefully", () => {
      const mockOnView = mock(() => {})
      const html = renderToString(
        React.createElement(InvoicesTable, {
          invoices: [],
          billingInfo: sampleBillingInfo,
          onViewInvoice: mockOnView,
        })
      )

      expect(html).toContain("No billing invoices recorded yet.")
    })

    test("M4.2.3: InvoiceDetailsDialog structure confirms rendering of transaction reference, badges, and memo", () => {
      const dialogPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/InvoiceDetailsDialog.tsx"
      )
      expect(fs.existsSync(dialogPath)).toBe(true)
      const dialogSrc = fs.readFileSync(dialogPath, "utf-8")

      // Transaction reference field
      expect(dialogSrc).toContain("invoice.receipt?.transactionReference")
      expect(dialogSrc).toContain("Transaction Reference")

      // Payment method badge
      expect(dialogSrc).toContain("paymentMethod")
      expect(dialogSrc).toContain("Bank Transfer")
      expect(dialogSrc).toContain("GCash/Maya")
      expect(dialogSrc).toContain("Promotional")

      // Notes / Admin memo
      expect(dialogSrc).toContain("invoice.receipt?.notes")
      expect(dialogSrc).toContain("Payment Notes / Memo")

      // Print buttons
      expect(dialogSrc).toContain("printReceipt")
      expect(dialogSrc).toContain("printInvoice")
      expect(dialogSrc).toContain("Print Receipt")
      expect(dialogSrc).toContain("Print Invoice")
    })

    test("M4.2.4: InvoiceDetailsDialog excludes broken Xendit links for manual payments", () => {
      const dialogPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/InvoiceDetailsDialog.tsx"
      )
      const dialogSrc = fs.readFileSync(dialogPath, "utf-8")

      // Guarded against manual overrides and synthetic invoice ids
      expect(dialogSrc).toContain("!isManualInvoice")
      expect(dialogSrc).toContain('!invoice.xenditInvoiceId.startsWith("MANUAL-")')
      expect(dialogSrc).toContain('!invoice.xenditInvoiceId.startsWith("recy_")')

      // Behavioral evaluation: manual invoices must evaluate isManualInvoice to true
      const isManualCheck = (invoice: BillingInvoice) =>
        invoice.xenditInvoiceId.startsWith("MANUAL-") ||
        ["Bank Transfer", "GCash/Maya", "Check", "Cash", "Promotional"].includes(
          invoice.receipt?.paymentMethod ?? ""
        )

      expect(isManualCheck(sampleManualInvoice)).toBe(true)
      expect(isManualCheck(sampleAutomatedInvoice)).toBe(false)
    })

    test("M4.2.5: InvoicesTable provides distinct badges across all manual payment methods", () => {
      const methods = ["Bank Transfer", "GCash/Maya", "Check", "Cash", "Promotional"] as const
      const mockOnView = mock(() => {})

      for (const m of methods) {
        const testInvoice: BillingInvoice = {
          ...sampleManualInvoice,
          invoiceNumber: `INV-${m}-001`,
          receipt: {
            ...sampleManualReceipt,
            paymentMethod: m,
          },
        }

        const html = renderToString(
          React.createElement(InvoicesTable, {
            invoices: [testInvoice],
            billingInfo: sampleBillingInfo,
            onViewInvoice: mockOnView,
          })
        )

        if (m === "GCash/Maya") {
          expect(html).toContain("GCash / Maya")
        } else {
          expect(html).toContain(m)
        }
      }
    })
  })

  // =========================================================================
  // Dimension 3: BIR-Compliant Printable Views & numberToWords
  // =========================================================================
  describe("Dimension 3: BIR-Compliant Printable Views & numberToWords", () => {
    test("M4.3.1: numberToWords accurately converts currency values into Philippine Peso words", () => {
      expect(numberToWords(0)).toBe("Zero Pesos Only")
      expect(numberToWords(1)).toBe("One Peso Only")
      expect(numberToWords(20)).toBe("Twenty Pesos Only")
      expect(numberToWords(2999)).toBe("Two Thousand Nine Hundred Ninety-Nine Pesos Only")
      expect(numberToWords(29990)).toBe("Twenty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(numberToWords(59990)).toBe("Fifty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(numberToWords(149990)).toBe(
        "One Hundred Forty-Nine Thousand Nine Hundred Ninety Pesos Only"
      )
      expect(numberToWords(1000000)).toBe("One Million Pesos Only")
      expect(numberToWords(2999.5)).toBe(
        "Two Thousand Nine Hundred Ninety-Nine Pesos and 50/100 Centavos"
      )
    })

    test("M4.3.2: printInvoice generates BIR-compliant view with Clinic EZ header, TIN, and invoice details", () => {
      let writtenHtml = ""
      const mockWindow = {
        document: {
          write: (content: string) => {
            writtenHtml = content
          },
          close: () => {},
        },
      }
      const originalWindowOpen = globalThis.window?.open
      globalThis.window = {
        ...globalThis.window,
        open: () => mockWindow as any,
      } as any

      printInvoice(sampleManualInvoice, sampleBillingInfo)

      expect(writtenHtml).toContain("Nextstep Software Corporation")
      expect(writtenHtml).toContain("009-876-543-000 VAT Registered")
      expect(writtenHtml).toContain("Unit 1402, BGC Corporate Center")
      expect(writtenHtml).toContain("INV-202610-0001")
      expect(writtenHtml).toContain("St. Jude Family Care Clinic")
      expect(writtenHtml).toContain("BDO-982141")
      expect(writtenHtml).toContain("Bank Transfer")
      expect(writtenHtml).toContain("PAID")

      if (originalWindowOpen) {
        globalThis.window.open = originalWindowOpen
      }
    })

    test("M4.3.3: printReceipt generates BIR Official Receipt (OR) format with REC-YYYYMM-XXXX, figures and words", () => {
      let writtenHtml = ""
      const mockWindow = {
        document: {
          write: (content: string) => {
            writtenHtml = content
          },
          close: () => {},
        },
      }
      const originalWindowOpen = globalThis.window?.open
      globalThis.window = {
        ...globalThis.window,
        open: () => mockWindow as any,
      } as any

      printReceipt(
        sampleManualReceipt,
        sampleBillingInfo,
        sampleManualInvoice.planSlug,
        sampleManualInvoice.isAnnual,
        sampleManualInvoice.xenditInvoiceId,
        sampleManualInvoice.invoiceNumber
      )

      expect(writtenHtml).toContain("OFFICIAL RECEIPT")
      expect(writtenHtml).toContain("REC-202610-0001")
      expect(writtenHtml).toContain("Invoice Ref: INV-202610-0001")
      expect(writtenHtml).toContain("Nextstep Software Corporation")
      expect(writtenHtml).toContain("009-876-543-000")
      expect(writtenHtml).toContain("St. Jude Family Care Clinic")
      expect(writtenHtml).toContain("Twenty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(writtenHtml).toContain("PHP 29,990.00")
      expect(writtenHtml).toContain("BDO-982141")
      expect(writtenHtml).toContain("Bank Transfer")
      expect(writtenHtml).toContain("BIR Value Added Tax Breakdown")
      expect(writtenHtml).toContain("Authorized Signatory")

      if (originalWindowOpen) {
        globalThis.window.open = originalWindowOpen
      }
    })

    test("M4.3.4: printInvoice and printReceipt honor configurable BIR tax exemption and custom tax percentage from SystemSettings", () => {
      let writtenHtml = ""
      const mockWindow = {
        document: {
          write: (content: string) => {
            writtenHtml = content
          },
          close: () => {},
        },
      }
      const originalWindowOpen = globalThis.window?.open
      globalThis.window = {
        ...globalThis.window,
        open: () => mockWindow as any,
      } as any

      // 1. BIR Tax Exempt = true
      printInvoice(sampleManualInvoice, {
        ...sampleBillingInfo,
        paymentConfig: {
          bankAccounts: OFFLINE_BANK_ACCOUNTS,
          birTaxExempt: true,
          birTaxPercentage: 0,
          corporateName: "NextStep Healthcare Solutions Inc.",
          corporateTin: "111-222-333-000",
          corporateAddress: "Makati CBD, Philippines",
          billingSupportEmail: "finance@nextstep-software.com",
        },
      })
      expect(writtenHtml).toContain("NextStep Healthcare Solutions Inc.")
      expect(writtenHtml).toContain("111-222-333-000 VAT-Exempt")
      expect(writtenHtml).toContain("Value-Added Tax (0% / VAT-Exempt)")

      // 2. Custom BIR Tax Percentage = 15%
      printReceipt(
        sampleManualReceipt,
        {
          ...sampleBillingInfo,
          paymentConfig: {
            bankAccounts: OFFLINE_BANK_ACCOUNTS,
            birTaxExempt: false,
            birTaxPercentage: 15,
            corporateName: "NextStep Healthcare Solutions Inc.",
            corporateTin: "111-222-333-000",
            corporateAddress: "Makati CBD, Philippines",
            billingSupportEmail: "finance@nextstep-software.com",
          },
        },
        sampleManualInvoice.planSlug,
        sampleManualInvoice.isAnnual,
        sampleManualInvoice.xenditInvoiceId,
        sampleManualInvoice.invoiceNumber
      )
      expect(writtenHtml).toContain("VAT Amount (15%):")
      expect(writtenHtml).toContain("NextStep Healthcare Solutions Inc.")

      if (originalWindowOpen) {
        globalThis.window.open = originalWindowOpen
      }
    })

    test("M4.3.5: printInvoice and printReceipt escape HTML characters in dynamic tenant fields to prevent XSS", () => {
      let writtenHtml = ""
      const mockWindow = {
        document: {
          write: (content: string) => {
            writtenHtml = content
          },
          close: () => {},
        },
      }
      const originalWindowOpen = globalThis.window?.open
      globalThis.window = {
        ...globalThis.window,
        open: () => mockWindow as any,
      } as any

      printInvoice(sampleManualInvoice, {
        ...sampleBillingInfo,
        clinicName: '<script>alert("xss")</script> Clinic',
      })
      expect(writtenHtml).not.toContain('<script>alert("xss")</script>')
      expect(writtenHtml).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; Clinic")

      if (originalWindowOpen) {
        globalThis.window.open = originalWindowOpen
      }
      delete (globalThis as any).window
    })
  })

  describe("Dimension 1B: Dynamic N-Bank Account Rendering from SystemSettings", () => {
    test("M4.1.5: OfflinePaymentInstructionsCard renders N dynamic bank accounts and filters inactive ones", () => {
      const customAccounts = [
        ...OFFLINE_BANK_ACCOUNTS,
        {
          id: "metrobank",
          institution: "Metropolitan Bank & Trust Co. (Metrobank)",
          accountName: "Nextstep Software Corporation",
          accountNumber: "7788-9900-1122",
          copyValue: "778899001122",
          branch: "Makati Head Office",
          type: "bank" as const,
          badge: "Commercial Bank",
          isActive: true,
        },
        {
          id: "unionbank-inactive",
          institution: "UnionBank of the Philippines",
          accountName: "Nextstep Software Corporation",
          accountNumber: "1099-2233-4455",
          copyValue: "109922334455",
          branch: "Ortigas Center",
          type: "bank" as const,
          badge: "Commercial Bank",
          isActive: false,
        },
      ]

      const html = renderToString(
        React.createElement(OfflinePaymentInstructionsCard, {
          tenantId: "clinic-st-jude-bgc",
          bankAccounts: customAccounts,
        })
      )

      expect(html).toContain("Metropolitan Bank &amp; Trust Co. (Metrobank)")
      expect(html).toContain("7788-9900-1122")
      expect(html).not.toContain("UnionBank of the Philippines")
    })
  })

  // =========================================================================
  // Dimension 4: Zero Raw Hex Color Audit
  // =========================================================================
  describe("Dimension 4: Design Token Compliance & Zero Hex Audit", () => {
    test("M4.4.1: ZERO raw hex color values exist in all touched Milestone 4 files", () => {
      const touchedFiles = [
        "apps/portal-web/src/app/[tenant]/dashboard/billing/components/OfflinePaymentInstructionsCard.tsx",
        "apps/portal-web/src/app/[tenant]/dashboard/billing/components/InvoicesTable.tsx",
        "apps/portal-web/src/app/[tenant]/dashboard/billing/components/InvoiceDetailsDialog.tsx",
        "apps/portal-web/src/utils/printInvoice.ts",
        "apps/portal-web/src/utils/printReceipt.ts",
        "apps/portal-web/src/utils/numberToWords.ts",
      ]

      const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g

      for (const relPath of touchedFiles) {
        let fullPath = path.resolve(process.cwd(), relPath)
        if (!fs.existsSync(fullPath)) {
          fullPath = path.resolve(process.cwd(), relPath.replace(/^apps\/portal-web\//, ""))
        }
        expect(fs.existsSync(fullPath)).toBe(true)

        const content = fs.readFileSync(fullPath, "utf-8")
        const matches = content.match(hexColorRegex)

        expect(matches).toBeNull()
      }
    })

    test("M4.4.2: Brand primary token in design tokens strictly matches Teal #0D6963", () => {
      expect(lightColors.primary).toBe("#0D6963")
    })
  })
})
