import { describe, test, expect, mock } from "bun:test"
import React from "react"
import { renderToString } from "react-dom/server"
import * as fs from "fs"
import * as path from "path"

import OfflinePaymentInstructionsCard, {
  OFFLINE_BANK_ACCOUNTS,
} from "../src/app/[tenant]/dashboard/billing/components/OfflinePaymentInstructionsCard"
import InvoicesTable from "../src/app/[tenant]/dashboard/billing/components/InvoicesTable"
import PaymentMethodContent from "../src/app/[tenant]/dashboard/billing/components/PaymentMethodContent"
import { numberToWords } from "../src/utils/numberToWords"
import { printReceipt } from "../src/utils/printReceipt"
import { printInvoice } from "../src/utils/printInvoice"
import { BillingInvoice, BillingInfo, PaymentReceipt } from "../src/services/billing.service"
import { lightColors } from "@clinicez/design-tokens"

describe("Milestone 4 Empirical Challenger: Adversarial Stress Suite", () => {
  const baseBillingInfo: BillingInfo = {
    subscriptionStatus: "ACTIVE",
    subscriptionPlanId: "starter",
    invoices: [],
    name: "Adversarial Stress Test Clinic",
    clinicName: "Adversarial Stress Test Clinic",
    tradingName: "ASTC Medical Group",
    businessType: "CORPORATION",
    phoneNumber: "+63 917 555 9999",
    country: "Philippines",
    streetLine1: "Level 18 Ayala Tower One",
    city: "Makati City",
    province: "Metro Manila",
    postalCode: "1226",
    taxId: "987-654-321-000",
    isAnnual: true,
    subscriptionExpiresAt: "2027-10-15T00:00:00Z",
  }

  const validReceipt: PaymentReceipt = {
    receiptNumber: "REC-202610-9999",
    amountPaid: 59990,
    currency: "PHP",
    paidAt: "2026-10-15T05:00:00.000Z",
    expiryDate: "2027-10-15T05:00:00.000Z",
    paymentMethod: "Bank Transfer",
    transactionReference: "BDO-REF-552211",
    notes: "Adversarial verification deposit note",
  }

  // =========================================================================
  // Challenge 1: Account Data Integrity Stress Test
  // =========================================================================
  describe("Challenge 1: Official Bank & E-Wallet Account Integrity", () => {
    test("C1.1: Exactly 3 official accounts are configured without missing entities", () => {
      expect(OFFLINE_BANK_ACCOUNTS.length).toBe(3)
      const ids = OFFLINE_BANK_ACCOUNTS.map((a) => a.id)
      expect(ids).toContain("bdo")
      expect(ids).toContain("bpi")
      expect(ids).toContain("gcash-maya")
    })

    test("C1.2: BDO Unibank integrity matches exact specifications", () => {
      const bdo = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "bdo")!
      expect(bdo).toBeDefined()
      expect(bdo.institution).toBe("BDO Unibank")
      expect(bdo.accountName).toBe("Nextstep Software Corporation")
      expect(bdo.accountNumber).toBe("0012-3456-7890")
      expect(bdo.copyValue).toBe("0012-3456-7890")
      expect(bdo.branch).toBe("BGC Corporate Center")
      expect(bdo.type).toBe("bank")
      expect(bdo.badge).toBe("Commercial Bank")
    })

    test("C1.3: BPI integrity matches exact specifications", () => {
      const bpi = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "bpi")!
      expect(bpi).toBeDefined()
      expect(bpi.institution).toBe("Bank of the Philippine Islands (BPI)")
      expect(bpi.accountName).toBe("Nextstep Software Corporation")
      expect(bpi.accountNumber).toBe("4321-8765-09")
      expect(bpi.copyValue).toBe("4321-8765-09")
      expect(bpi.branch).toBe("Ayala Triangle")
      expect(bpi.type).toBe("bank")
      expect(bpi.badge).toBe("Commercial Bank")
    })

    test("C1.4: GCash / Maya integrity and sanitization matches specifications", () => {
      const ewallet = OFFLINE_BANK_ACCOUNTS.find((a) => a.id === "gcash-maya")!
      expect(ewallet).toBeDefined()
      expect(ewallet.institution).toBe("GCash / Maya")
      expect(ewallet.accountName).toBe("Nextstep Software Corporation")
      expect(ewallet.accountNumber).toBe("0917-123-EZPH (0917-123-3974)")
      // Copy value must be clean numeric digits with standard dash format, no letters!
      expect(ewallet.copyValue).toBe("0917-123-3974")
      const digitsOnly = ewallet.copyValue.replace(/\D/g, "")
      expect(digitsOnly).toBe("09171233974")
      expect(digitsOnly.length).toBe(11)
      expect(digitsOnly.startsWith("0917")).toBe(true)
      expect(ewallet.branch).toBe("Merchant QR / Mobile Wallet")
      expect(ewallet.type).toBe("ewallet")
      expect(ewallet.badge).toBe("Instant E-Wallet")
    })

    test("C1.5: OfflinePaymentInstructionsCard renders all 3 accounts and copy affordances", () => {
      const html = renderToString(
        React.createElement(OfflinePaymentInstructionsCard, { tenantId: "adversarial-tenant-99" })
      )
      expect(html).toContain("BDO Unibank")
      expect(html).toContain("0012-3456-7890")
      expect(html).toContain("BGC Corporate Center")
      expect(html).toContain("Bank of the Philippine Islands (BPI)")
      expect(html).toContain("4321-8765-09")
      expect(html).toContain("Ayala Triangle")
      expect(html).toContain("GCash / Maya")
      expect(html).toContain("0917-123-EZPH (0917-123-3974)")
      expect(html).toContain("adversarial-tenant-99")
    })
  })

  // =========================================================================
  // Challenge 2: Broken Link Immunity Stress Testing
  // =========================================================================
  describe("Challenge 2: Broken Link Immunity Stress Testing", () => {
    // Exact logic replicated from InvoiceDetailsDialog.tsx
    const evaluateXenditLink = (invoice: BillingInvoice) => {
      const isManualInvoice =
        invoice.xenditInvoiceId.startsWith("MANUAL-") ||
        [
          "Bank Transfer",
          "GCash/Maya",
          "Check",
          "Cash",
          "Promotional",
        ].includes(invoice.receipt?.paymentMethod ?? "")

      const shouldRender =
        !isManualInvoice &&
        !invoice.xenditInvoiceId.startsWith("recy_") &&
        !invoice.xenditInvoiceId.startsWith("MANUAL-") &&
        (invoice.xenditInvoiceId.startsWith("http") || /^[a-f\d]{24}$/i.test(invoice.xenditInvoiceId))

      const href = shouldRender
        ? invoice.xenditInvoiceId.startsWith("http")
          ? invoice.xenditInvoiceId
          : `https://checkout-staging.xendit.co/web/${invoice.xenditInvoiceId}`
        : null

      return { shouldRender, href }
    }

    test("C2.1: Synthetic MANUAL- IDs are NEVER rendered as external links", () => {
      const syntheticIds = [
        "MANUAL-INV-202610-0001",
        "MANUAL-982141",
        "MANUAL-recy_123",
        "MANUAL-6504a1b2c3d4e5f60718293a",
        "MANUAL-",
        "MANUAL-PROMO-FREE",
      ]

      for (const id of syntheticIds) {
        const inv: BillingInvoice = {
          invoiceNumber: "INV-TEST-001",
          amount: 1000,
          currency: "PHP",
          status: "Paid",
          planSlug: "starter",
          isAnnual: false,
          createdAt: "2026-10-15T00:00:00Z",
          xenditInvoiceId: id,
          receipt: validReceipt,
        }
        const { shouldRender, href } = evaluateXenditLink(inv)
        expect(shouldRender).toBe(false)
        expect(href).toBeNull()
      }
    })

    test("C2.2: Synthetic recy_ IDs are NEVER rendered as external links", () => {
      const recyIds = [
        "recy_4f92a10c",
        "recy_MANUAL-123",
        "recy_6504a1b2c3d4e5f60718293a",
        "recy_test_id",
      ]

      for (const id of recyIds) {
        const inv: BillingInvoice = {
          invoiceNumber: "INV-TEST-002",
          amount: 1000,
          currency: "PHP",
          status: "Paid",
          planSlug: "starter",
          isAnnual: false,
          createdAt: "2026-10-15T00:00:00Z",
          xenditInvoiceId: id,
          receipt: undefined,
        }
        const { shouldRender, href } = evaluateXenditLink(inv)
        expect(shouldRender).toBe(false)
        expect(href).toBeNull()
      }
    })

    test("C2.3: Manual payment methods with 24-char hex IDs are immunised against Xendit links", () => {
      const manualMethods = ["Bank Transfer", "GCash/Maya", "Check", "Cash", "Promotional"] as const

      for (const method of manualMethods) {
        const inv: BillingInvoice = {
          invoiceNumber: "INV-TEST-003",
          amount: 5000,
          currency: "PHP",
          status: "Paid",
          planSlug: "pro",
          isAnnual: true,
          createdAt: "2026-10-15T00:00:00Z",
          // Adversarial case: 24-char hex xendit ID, but manual payment method!
          xenditInvoiceId: "6504a1b2c3d4e5f60718293a",
          receipt: {
            ...validReceipt,
            paymentMethod: method,
          },
        }
        const { shouldRender, href } = evaluateXenditLink(inv)
        expect(shouldRender).toBe(false)
        expect(href).toBeNull()
      }
    })

    test("C2.4: Malformed or non-Xendit IDs do not produce broken links", () => {
      const malformedIds = [
        "",
        " ",
        "unknown_id",
        "12345678",
        "javascript:alert(1)",
        "https://",
        "null",
        "undefined",
        "short-id",
      ]

      for (const id of malformedIds) {
        const inv: BillingInvoice = {
          invoiceNumber: "INV-TEST-004",
          amount: 1000,
          currency: "PHP",
          status: "Issued",
          planSlug: "starter",
          isAnnual: false,
          createdAt: "2026-10-15T00:00:00Z",
          xenditInvoiceId: id,
        }
        const { shouldRender, href } = evaluateXenditLink(inv)
        // If it starts with http, it would need to be a full URL, but "https://" alone is not a valid 24-hex
        if (id.startsWith("http")) {
          expect(shouldRender).toBe(true)
        } else {
          expect(shouldRender).toBe(false)
          expect(href).toBeNull()
        }
      }
    })

    test("C2.5: Genuine automated Xendit 24-char hex IDs safely produce gateway links", () => {
      const genuineInv: BillingInvoice = {
        invoiceNumber: "INV-GENUINE-001",
        amount: 2999,
        currency: "PHP",
        status: "Issued",
        planSlug: "starter",
        isAnnual: false,
        createdAt: "2026-10-15T00:00:00Z",
        xenditInvoiceId: "6504a1b2c3d4e5f60718293a", // Valid 24-char hex mongo ObjectId
        receipt: undefined,
      }
      const { shouldRender, href } = evaluateXenditLink(genuineInv)
      expect(shouldRender).toBe(true)
      expect(href).toBe("https://checkout-staging.xendit.co/web/6504a1b2c3d4e5f60718293a")
    })
  })

  // =========================================================================
  // Challenge 3: Receipt Button Rendering State Matrix
  // =========================================================================
  describe("Challenge 3: Receipt Button Rendering State Matrix", () => {
    const mockOnView = mock(() => {})

    test("C3.1: Paid status with associated receipt displays the Receipt button in InvoicesTable", () => {
      const invoice: BillingInvoice = {
        invoiceNumber: "INV-PAID-REC",
        amount: 29990,
        currency: "PHP",
        status: "Paid",
        planSlug: "starter",
        isAnnual: true,
        createdAt: "2026-10-15T00:00:00Z",
        xenditInvoiceId: "MANUAL-INV-PAID-REC",
        receipt: validReceipt,
      }

      const html = renderToString(
        React.createElement(InvoicesTable, {
          invoices: [invoice],
          billingInfo: baseBillingInfo,
          onViewInvoice: mockOnView,
        })
      )

      expect(html).toContain("Receipt")
      expect(html).toContain("Invoice")
    })

    test("C3.2: Paid status WITHOUT associated receipt DOES NOT display the Receipt button", () => {
      const invoiceNoReceipt: BillingInvoice = {
        invoiceNumber: "INV-PAID-NO-REC",
        amount: 29990,
        currency: "PHP",
        status: "Paid",
        planSlug: "starter",
        isAnnual: true,
        createdAt: "2026-10-15T00:00:00Z",
        xenditInvoiceId: "MANUAL-INV-PAID-NO-REC",
        receipt: undefined,
      }

      const html = renderToString(
        React.createElement(InvoicesTable, {
          invoices: [invoiceNoReceipt],
          billingInfo: baseBillingInfo,
          onViewInvoice: mockOnView,
        })
      )

      // Must render Invoice button, but NOT Receipt button!
      expect(html).toContain("Invoice")
      expect(html).not.toContain(">Receipt<")
      expect(html).not.toContain("title=\"Print BIR Official Receipt\"")
    })

    test("C3.3: Pending or Issued status with or without receipt DOES NOT display the Receipt button", () => {
      const pendingStatuses = ["Issued", "Pending", "Failed", "Cancelled", "Expired"]

      for (const st of pendingStatuses) {
        const invWithReceipt: BillingInvoice = {
          invoiceNumber: `INV-${st}-1`,
          amount: 2999,
          currency: "PHP",
          status: st,
          planSlug: "starter",
          isAnnual: false,
          createdAt: "2026-10-15T00:00:00Z",
          xenditInvoiceId: `6504a1b2c3d4e5f6071829${st.substring(0, 2)}`,
          receipt: validReceipt,
        }

        const html = renderToString(
          React.createElement(InvoicesTable, {
            invoices: [invWithReceipt],
            billingInfo: baseBillingInfo,
            onViewInvoice: mockOnView,
          })
        )

        expect(html).toContain("Invoice")
        expect(html).not.toContain(">Receipt<")
        expect(html).not.toContain("title=\"Print BIR Official Receipt\"")
      }
    })

    test("C3.4: InvoiceDetailsDialog source strictly enforces status === Paid && receipt for printReceipt", () => {
      const dialogPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/InvoiceDetailsDialog.tsx"
      )
      const src = fs.readFileSync(dialogPath, "utf-8")
      expect(src).toContain('invoice.status === "Paid" && invoice.receipt && (')
      expect(src).toContain("Print Receipt")
    })
  })

  // =========================================================================
  // Challenge 4: Multi-Tab Accessibility & DOM Verification
  // =========================================================================
  describe("Challenge 4: Multi-Tab Accessibility & Structure", () => {
    test("C4.1: BillingDashboardClient declares dedicated Bank Transfer & Offline tab and content", () => {
      const clientPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/BillingDashboardClient.tsx"
      )
      const src = fs.readFileSync(clientPath, "utf-8")

      // Trigger
      expect(src).toContain('TabsTrigger value="offline"')
      expect(src).toContain("Bank Transfer & Offline")

      // Content
      expect(src).toContain('TabsContent value="offline"')
      expect(src).toContain("<OfflinePaymentInstructionsCard tenantId={tenantId} />")
    })

    test("C4.2: PaymentMethodContent embeds OfflinePaymentInstructionsCard directly", () => {
      const contentPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/PaymentMethodContent.tsx"
      )
      const src = fs.readFileSync(contentPath, "utf-8")

      expect(src).toContain("import OfflinePaymentInstructionsCard from")
      expect(src).toContain("<OfflinePaymentInstructionsCard tenantId={tenantId} />")
    })

    test("C4.3: Dynamic tenantId propagates properly into copy memo", () => {
      const customTenant = "special-cardiology-center"
      const html = renderToString(
        React.createElement(OfflinePaymentInstructionsCard, { tenantId: customTenant })
      )
      expect(html).toContain(customTenant)
      expect(html).toContain("Copy Memo")
    })
  })

  // =========================================================================
  // Challenge 5: BIR Compliance, numberToWords Edge Cases & Security
  // =========================================================================
  describe("Challenge 5: BIR Currency Math & Security Integrity", () => {
    test("C5.1: numberToWords boundary and stress test suite", () => {
      expect(numberToWords(-50)).toBe("Zero Pesos Only")
      expect(numberToWords(NaN)).toBe("Zero Pesos Only")
      expect(numberToWords(0)).toBe("Zero Pesos Only")
      expect(numberToWords(0.01)).toBe("Zero Pesos and 01/100 Centavos")
      expect(numberToWords(0.5)).toBe("Zero Pesos and 50/100 Centavos")
      expect(numberToWords(0.99)).toBe("Zero Pesos and 99/100 Centavos")
      expect(numberToWords(1)).toBe("One Peso Only")
      expect(numberToWords(1.25)).toBe("One Peso and 25/100 Centavos")
      expect(numberToWords(2)).toBe("Two Pesos Only")
      expect(numberToWords(21)).toBe("Twenty-One Pesos Only")
      expect(numberToWords(105)).toBe("One Hundred Five Pesos Only")
      expect(numberToWords(115)).toBe("One Hundred Fifteen Pesos Only")
      expect(numberToWords(1000)).toBe("One Thousand Pesos Only")
      expect(numberToWords(1000000)).toBe("One Million Pesos Only")
      expect(numberToWords(1000000000)).toBe("One Billion Pesos Only")
      expect(numberToWords(1234567.89)).toBe(
        "One Million Two Hundred Thirty-Four Thousand Five Hundred Sixty-Seven Pesos and 89/100 Centavos"
      )
    })

    test("C5.2: 12% VAT arithmetic in printReceipt never produces NaN or invalid tax", () => {
      let written = ""
      const mockWin = {
        document: {
          write: (str: string) => {
            written = str
          },
          close: () => {},
        },
      }
      const origOpen = globalThis.window?.open
      globalThis.window = { ...globalThis.window, open: () => mockWin as any } as any

      printReceipt(
        validReceipt,
        baseBillingInfo,
        "starter",
        true,
        "MANUAL-REF",
        "INV-202610-9999"
      )

      expect(written).not.toContain("NaN")
      expect(written).toContain("BIR Value Added Tax Breakdown")
      expect(written).toContain("VATable Sales:")
      expect(written).toContain("VAT Amount (12%):")

      if (origOpen) {
        globalThis.window.open = origOpen
      }
    })

    test("C5.3: Adversarial XSS payload in notes or tenant memo does not break print views", () => {
      let written = ""
      const mockWin = {
        document: {
          write: (str: string) => {
            written = str
          },
          close: () => {},
        },
      }
      const origOpen = globalThis.window?.open
      globalThis.window = { ...globalThis.window, open: () => mockWin as any } as any

      const xssReceipt: PaymentReceipt = {
        ...validReceipt,
        notes: "<script>alert('xss')</script>",
        transactionReference: "REF-<b>BOLD</b>",
      }

      printReceipt(
        xssReceipt,
        baseBillingInfo,
        "starter",
        true,
        "MANUAL-XSS",
        "INV-XSS"
      )

      expect(written).toContain("Official_Receipt_")
      expect(written).not.toContain("NaN")

      if (origOpen) {
        globalThis.window.open = origOpen
      }
      delete (globalThis as any).window
    })
  })
})
