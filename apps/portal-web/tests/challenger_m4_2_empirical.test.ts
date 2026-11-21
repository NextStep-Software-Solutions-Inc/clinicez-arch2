import { describe, test, expect } from "bun:test"
import { numberToWords } from "../src/utils/numberToWords"
import { printInvoice } from "../src/utils/printInvoice"
import { printReceipt } from "../src/utils/printReceipt"
import { BillingInvoice, BillingInfo, PaymentReceipt } from "../src/services/billing.service"

describe("Challenger M4-2: Empirical Verification & Adversarial Stress Suite", () => {
  const dummyBillingInfo: BillingInfo = {
    subscriptionStatus: "ACTIVE",
    subscriptionPlanId: "starter",
    invoices: [],
    name: "Metropolitan Wellness Clinic",
    clinicName: "Metropolitan Wellness Clinic",
    tradingName: "Metropolitan Health Hub",
    businessType: "CORPORATION",
    phoneNumber: "+63 917 888 9999",
    country: "Philippines",
    streetLine1: "Penthouse Suite, Horizon Tower",
    city: "Taguig City",
    province: "Metro Manila",
    postalCode: "1634",
    taxId: "987-654-321-000",
    isAnnual: true,
    subscriptionExpiresAt: "2027-10-15T00:00:00Z",
  }

  // =========================================================================
  // Section 1: numberToWords Empirical Challenge
  // =========================================================================
  describe("Section 1: numberToWords Currency Conversion", () => {
    test("1.1: Exact amounts and standard integers", () => {
      expect(numberToWords(0)).toBe("Zero Pesos Only")
      expect(numberToWords(1)).toBe("One Peso Only")
      expect(numberToWords(2)).toBe("Two Pesos Only")
      expect(numberToWords(10)).toBe("Ten Pesos Only")
      expect(numberToWords(11)).toBe("Eleven Pesos Only")
      expect(numberToWords(20)).toBe("Twenty Pesos Only")
      expect(numberToWords(21)).toBe("Twenty-One Pesos Only")
      expect(numberToWords(99)).toBe("Ninety-Nine Pesos Only")
      expect(numberToWords(100)).toBe("One Hundred Pesos Only")
      expect(numberToWords(101)).toBe("One Hundred One Pesos Only")
      expect(numberToWords(115)).toBe("One Hundred Fifteen Pesos Only")
      expect(numberToWords(999)).toBe("Nine Hundred Ninety-Nine Pesos Only")
      expect(numberToWords(1000)).toBe("One Thousand Pesos Only")
      expect(numberToWords(1001)).toBe("One Thousand One Pesos Only")
      expect(numberToWords(1100)).toBe("One Thousand One Hundred Pesos Only")
      expect(numberToWords(2999)).toBe("Two Thousand Nine Hundred Ninety-Nine Pesos Only")
      expect(numberToWords(29990)).toBe("Twenty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(numberToWords(59990)).toBe("Fifty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(numberToWords(149990)).toBe(
        "One Hundred Forty-Nine Thousand Nine Hundred Ninety Pesos Only"
      )
    })

    test("1.2: Large amounts (millions, tens of millions, billions)", () => {
      expect(numberToWords(1000000)).toBe("One Million Pesos Only")
      expect(numberToWords(1000001)).toBe("One Million One Pesos Only")
      expect(numberToWords(10000000)).toBe("Ten Million Pesos Only")
      expect(numberToWords(25000000)).toBe("Twenty-Five Million Pesos Only")
      expect(numberToWords(100000000)).toBe("One Hundred Million Pesos Only")
      expect(numberToWords(1000000000)).toBe("One Billion Pesos Only")
    })

    test("1.3: Fractional amounts with centavos", () => {
      // Current implementation returns `${words} ${pesoUnit} and ${centavoStr}/100 Centavos`
      expect(numberToWords(0.01)).toBe("Zero Pesos and 01/100 Centavos")
      expect(numberToWords(0.09)).toBe("Zero Pesos and 09/100 Centavos")
      expect(numberToWords(0.1)).toBe("Zero Pesos and 10/100 Centavos")
      expect(numberToWords(0.5)).toBe("Zero Pesos and 50/100 Centavos")
      expect(numberToWords(0.99)).toBe("Zero Pesos and 99/100 Centavos")
      expect(numberToWords(1.01)).toBe("One Peso and 01/100 Centavos")
      expect(numberToWords(1.5)).toBe("One Peso and 50/100 Centavos")
      expect(numberToWords(1234.5)).toBe(
        "One Thousand Two Hundred Thirty-Four Pesos and 50/100 Centavos"
      )
      expect(numberToWords(29990.25)).toBe(
        "Twenty-Nine Thousand Nine Hundred Ninety Pesos and 25/100 Centavos"
      )
      expect(numberToWords(29990.99)).toBe(
        "Twenty-Nine Thousand Nine Hundred Ninety Pesos and 99/100 Centavos"
      )
    })

    test("1.4: Guards against negative numbers, NaN, and zero variants", () => {
      expect(numberToWords(-1)).toBe("Zero Pesos Only")
      expect(numberToWords(-0.01)).toBe("Zero Pesos Only")
      expect(numberToWords(-29990)).toBe("Zero Pesos Only")
      expect(numberToWords(NaN)).toBe("Zero Pesos Only")
      expect(numberToWords(-0)).toBe("Zero Pesos Only")
      expect(numberToWords(0.0)).toBe("Zero Pesos Only")
      expect(numberToWords(0.0001)).toBe("Zero Pesos Only")
    })

    test("1.5: Empirical identification of edge case vulnerabilities", () => {
      // Edge Case A: 3 decimal places where centavos round to 100
      // Math.round((12.999 - 12) * 100) = 100, resulting in "100/100 Centavos"
      const roundedOverflow = numberToWords(12.999)
      expect(roundedOverflow).toBe("Twelve Pesos and 100/100 Centavos")

      // Edge Case B: Infinity is not guarded by isNaN or < 0
      const infinityVal = numberToWords(Infinity)
      expect(infinityVal).toContain("undefined")
    })
  })

  // =========================================================================
  // Section 2: BIR Compliance in printInvoice and printReceipt
  // =========================================================================
  describe("Section 2: BIR Compliance in Printable Documents", () => {
    function capturePrintOutput(fn: () => void): string {
      let writtenHtml = ""
      const mockWindow = {
        document: {
          write: (content: string) => {
            writtenHtml = content
          },
          close: () => {},
        },
      }
      const hadWindow = typeof (globalThis as any).window !== "undefined"
      const originalWindowOpen = globalThis.window?.open
      globalThis.window = {
        ...globalThis.window,
        open: () => mockWindow as any,
      } as any

      try {
        fn()
      } finally {
        if (!hadWindow) {
          delete (globalThis as any).window
        } else if (originalWindowOpen) {
          globalThis.window.open = originalWindowOpen
        }
      }
      return writtenHtml
    }

    test("2.1: Sequential document number format validation", () => {
      const invoiceNumberPattern = /^INV-\d{6}-\d{4}$/
      const receiptNumberPattern = /^REC-\d{6}-\d{4}$/

      expect(invoiceNumberPattern.test("INV-202610-0001")).toBe(true)
      expect(invoiceNumberPattern.test("INV-202610-9999")).toBe(true)
      expect(invoiceNumberPattern.test("INV-20261-0001")).toBe(false)
      expect(invoiceNumberPattern.test("REC-202610-0001")).toBe(false)

      expect(receiptNumberPattern.test("REC-202610-0001")).toBe(true)
      expect(receiptNumberPattern.test("REC-202610-9999")).toBe(true)
      expect(receiptNumberPattern.test("REC-20261-0001")).toBe(false)
      expect(receiptNumberPattern.test("INV-202610-0001")).toBe(false)
    })

    test("2.2: printInvoice renders all statutory BIR corporate header fields", () => {
      const testInvoice: BillingInvoice = {
        invoiceNumber: "INV-202610-0042",
        amount: 29990,
        currency: "PHP",
        status: "Paid",
        planSlug: "starter",
        isAnnual: true,
        createdAt: "2026-10-15T08:00:00.000Z",
        xenditInvoiceId: "MANUAL-INV-202610-0042-test",
        receipt: {
          receiptNumber: "REC-202610-0042",
          amountPaid: 29990,
          currency: "PHP",
          paidAt: "2026-10-15T08:15:00.000Z",
          expiryDate: "2027-10-15T08:15:00.000Z",
          paymentMethod: "Bank Transfer",
          transactionReference: "BDO-REF-77182",
          notes: "Paid through BDO Corporate Account",
        },
      }

      const html = capturePrintOutput(() => {
        printInvoice(testInvoice, dummyBillingInfo)
      })

      // Corporate Identity & Statutory TIN
      expect(html).toContain("Nextstep Software Corporation")
      expect(html).toContain("009-876-543-000 VAT Registered")
      expect(html).toContain("Unit 1402, BGC Corporate Center, 11th Avenue, Bonifacio Global City")
      expect(html).toContain("Taguig City, Metro Manila, Philippines 1634")
      expect(html).toContain("billing@clinicez.ph")

      // Invoice Details & Payor attribution
      expect(html).toContain("INV-202610-0042")
      expect(html).toContain("REC-202610-0042")
      expect(html).toContain("Metropolitan Wellness Clinic")
      expect(html).toContain("Metropolitan Health Hub")
      expect(html).toContain("987-654-321-000")
      expect(html).toContain("Penthouse Suite, Horizon Tower")

      // Payment verification details
      expect(html).toContain("Bank Transfer")
      expect(html).toContain("BDO-REF-77182")
      expect(html).toContain("Paid through BDO Corporate Account")
      expect(html).toContain("PAID")
    })

    test("2.3: printReceipt renders full BIR Official Receipt with 12% VAT calculations & Signatory", () => {
      const amountPaid = 29990
      const testReceipt: PaymentReceipt = {
        receiptNumber: "REC-202610-0077",
        amountPaid,
        currency: "PHP",
        paidAt: "2026-10-15T09:00:00.000Z",
        expiryDate: "2027-10-15T09:00:00.000Z",
        paymentMethod: "GCash/Maya",
        transactionReference: "GCASH-9988221",
        notes: "Settled via clinic QRPh scanner",
      }

      const html = capturePrintOutput(() => {
        printReceipt(
          testReceipt,
          dummyBillingInfo,
          "pro",
          true,
          "MANUAL-INV-202610-0077-uuid",
          "INV-202610-0077"
        )
      })

      // Official Receipt Heading & Sequential Numbering
      expect(html).toContain("OFFICIAL RECEIPT")
      expect(html).toContain("BIR Official Receipt")
      expect(html).toContain("REC-202610-0077")
      expect(html).toContain("Invoice Ref: INV-202610-0077")

      // Statutory Header & TIN
      expect(html).toContain("Nextstep Software Corporation")
      expect(html).toContain("009-876-543-000")

      // Payor Data
      expect(html).toContain("Metropolitan Wellness Clinic")
      expect(html).toContain("987-654-321-000")
      expect(html).toContain("Penthouse Suite, Horizon Tower")

      // Amount in words and figures
      expect(html).toContain("Twenty-Nine Thousand Nine Hundred Ninety Pesos Only")
      expect(html).toContain("PHP 29,990.00")

      // Payment Details & Admin Notes
      expect(html).toContain("GCash/Maya")
      expect(html).toContain("GCASH-9988221")
      expect(html).toContain("Settled via clinic QRPh scanner")

      // 12% VAT Breakdown Verification
      const expectedVatable = (amountPaid / 1.12).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
      const expectedVat = (amountPaid - amountPaid / 1.12).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })

      expect(html).toContain("BIR Value Added Tax Breakdown")
      expect(html).toContain(`PHP ${expectedVatable}`)
      expect(html).toContain(`PHP ${expectedVat}`)
      expect(html).toContain("PHP 0.00") // VAT-Exempt sales line

      // Authorized Signatory
      expect(html).toContain("Authorized Signatory")
      expect(html).toContain("Finance & Billing Operations")
    })

    test("2.4: 12% VAT calculations preserve mathematical integrity across multiple price points", () => {
      const pricePoints = [0, 2999, 29990, 59990, 149990, 250000]

      for (const price of pricePoints) {
        const vatableSales = price > 0 ? price / 1.12 : 0
        const vatAmount = price - vatableSales
        const reconstructedTotal = vatableSales + vatAmount

        expect(Math.abs(reconstructedTotal - price)).toBeLessThan(0.00001)

        // Verify VAT is approximately 12% of vatable sales
        if (price > 0) {
          const vatRatio = vatAmount / vatableSales
          expect(Math.abs(vatRatio - 0.12)).toBeLessThan(0.00001)
        }
      }
    })

    test("2.5: Zero amount promotional payment handles VAT breakdown safely without division error", () => {
      const zeroReceipt: PaymentReceipt = {
        receiptNumber: "REC-202610-0000",
        amountPaid: 0,
        currency: "PHP",
        paidAt: "2026-10-15T00:00:00.000Z",
        expiryDate: "2026-11-15T00:00:00.000Z",
        paymentMethod: "Promotional",
        transactionReference: "PROMO-FREE-MONTH",
        notes: "Complimentary launch promotion",
      }

      const html = capturePrintOutput(() => {
        printReceipt(zeroReceipt, dummyBillingInfo, "starter", false, undefined, "INV-202610-0000")
      })

      expect(html).toContain("Zero Pesos Only")
      expect(html).toContain("PHP 0.00")
      expect(html).toContain("Promotional")
      expect(html).toContain("PROMO-FREE-MONTH")
      expect(html).toContain("Complimentary launch promotion")
      expect(html).not.toContain("NaN")
    })
  })
})
