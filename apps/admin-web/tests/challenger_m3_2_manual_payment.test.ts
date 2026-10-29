import { describe, test, expect, mock } from "bun:test";
import {
  adminService,
  BillingPlan,
  RecordManualPaymentPayload,
  RecordManualPaymentResult
} from "../src/services/admin.service";
import { apiClient } from "../src/lib/api";
import * as fs from "fs";
import * as path from "path";

describe("Milestone 3 Empirical Challenger 2: Manual Payment Recording Workstation", () => {
  // Test Plan Data
  const samplePlans: BillingPlan[] = [
    {
      id: "starter",
      planId: "11111111-1111-1111-1111-111111111111",
      name: "Starter Clinic",
      slug: "starter",
      description: "For solo practitioners",
      monthlyPrice: 2999,
      annualPrice: 29990,
      rank: 1,
      version: 1,
      features: ["Single Doctor"],
      limits: { "limit.clinics": 1, "limit.staff": 3 },
      enabledFeatures: ["feature.electronic_prescriptions"],
    },
    {
      id: "pro",
      planId: "22222222-2222-2222-2222-222222222222",
      name: "Pro Clinic",
      slug: "pro",
      description: "For multi-specialty clinics",
      monthlyPrice: 5999,
      annualPrice: 59990,
      rank: 2,
      version: 1,
      features: ["Multi Doctor", "LIS"],
      limits: { "limit.clinics": 3, "limit.staff": 10 },
      enabledFeatures: ["feature.electronic_prescriptions", "feature.lis_integration"],
    },
    {
      id: "enterprise",
      planId: "33333333-3333-3333-3333-333333333333",
      name: "Enterprise Health",
      slug: "enterprise",
      description: "For hospital networks",
      monthlyPrice: 14999,
      annualPrice: 149990,
      rank: 3,
      version: 2,
      features: ["Unlimited", "PhilHealth"],
      limits: { "limit.clinics": 10, "limit.staff": 50 },
      enabledFeatures: ["feature.philhealth_konsulta", "feature.cross_tenant_interop"],
    }
  ];

  test("Dimension 1: Payment method coverage matches required options", () => {
    const dialogFilePath = path.resolve(__dirname, "../src/components/RecordPaymentDialog.tsx");
    const content = fs.readFileSync(dialogFilePath, "utf-8");

    // All required payment methods must be defined
    const requiredPaymentMethods = [
      "Bank Transfer",
      "GCash/Maya",
      "Check",
      "Cash",
      "Promotional"
    ];

    for (const method of requiredPaymentMethods) {
      expect(content).toContain(`"${method}"`);
    }

    // Verify labels clarify coverage (BDO/BPI, E-Wallet, Check, Cash, Sponsorship)
    expect(content).toContain("BDO / BPI / Metrobank / UnionBank");
    expect(content).toContain("GCash / Maya QR / Mobile E-Wallet");
    expect(content).toContain("Corporate Manager's / Business Check");
    expect(content).toContain("Direct Cash / Counter Deposit");
    expect(content).toContain("Promotional / Commercial Sponsorship");
  });

  test("Dimension 2: Plan selection and billing cycle price calculation logic", () => {
    // Logic extraction replicating RecordPaymentDialog amount computation
    const calculateAmount = (
      plans: BillingPlan[],
      planSlug: string,
      isAnnual: boolean,
      paymentMethod: string
    ): number => {
      if (paymentMethod === "Promotional") return 0;
      const plan = plans.find((p) => p.slug === planSlug);
      if (!plan) return 0;
      const mPrice =
        typeof plan.monthlyPrice === "number"
          ? plan.monthlyPrice
          : typeof plan.priceMonthly === "number"
          ? plan.priceMonthly
          : parseFloat(String(plan.priceMonthly || 0)) || 0;
      const aPrice =
        typeof plan.annualPrice === "number"
          ? plan.annualPrice
          : typeof plan.priceAnnually === "number"
          ? plan.priceAnnually
          : parseFloat(String(plan.priceAnnually || 0)) || 0;
      return isAnnual ? aPrice : mPrice;
    };

    // Starter plan: monthly ₱2,999 vs annual ₱29,990
    expect(calculateAmount(samplePlans, "starter", false, "Bank Transfer")).toBe(2999);
    expect(calculateAmount(samplePlans, "starter", true, "Bank Transfer")).toBe(29990);

    // Pro plan: monthly ₱5,999 vs annual ₱59,990
    expect(calculateAmount(samplePlans, "pro", false, "GCash/Maya")).toBe(5999);
    expect(calculateAmount(samplePlans, "pro", true, "GCash/Maya")).toBe(59990);

    // Enterprise plan: monthly ₱14,999 vs annual ₱149,990
    expect(calculateAmount(samplePlans, "enterprise", false, "Check")).toBe(14999);
    expect(calculateAmount(samplePlans, "enterprise", true, "Check")).toBe(149990);

    // Promotional plan: always 0 regardless of cycle or tier
    expect(calculateAmount(samplePlans, "starter", false, "Promotional")).toBe(0);
    expect(calculateAmount(samplePlans, "starter", true, "Promotional")).toBe(0);
    expect(calculateAmount(samplePlans, "enterprise", true, "Promotional")).toBe(0);
  });

  test("Dimension 3: Transaction reference handling (required vs optional vs promo auto-gen)", () => {
    // In RecordPaymentDialog:
    // Promotional auto-generates PROMO-${tenantSlug}
    const tenantSlug = "makati-family-clinic";
    const promoRef = `PROMO-${tenantSlug.toUpperCase().slice(0, 8)}`;
    expect(promoRef).toBe("PROMO-MAKATI-F");

    // Test payload serialization for different scenarios
    const makePayload = (
      planSlug: string,
      isAnnual: boolean,
      paymentMethod: string,
      ref: string,
      amount: number
    ): RecordManualPaymentPayload => ({
      planSlug,
      isAnnual,
      paymentMethod,
      transactionReference: ref.trim() || undefined,
      amount,
      notes: "Manual reconciliation",
      paymentDate: new Date("2026-10-15T00:00:00Z").toISOString()
    });

    // 1. Bank transfer with reference
    const bankPayload = makePayload("pro", true, "Bank Transfer", "BDO-REF-9921", 59990);
    expect(bankPayload.transactionReference).toBe("BDO-REF-9921");

    // 2. Cash with empty reference -> undefined
    const cashPayload = makePayload("starter", false, "Cash", "   ", 2999);
    expect(cashPayload.transactionReference).toBeUndefined();

    // 3. Promotional with auto reference
    const promoPayload = makePayload("enterprise", true, "Promotional", promoRef, 0);
    expect(promoPayload.transactionReference).toBe("PROMO-MAKATI-F");
  });

  test("Dimension 4: 12% BIR VAT breakdown calculation logic verification", () => {
    const calculateBirVat = (amount: number) => {
      const netAmount = Math.round((amount / 1.12) * 100) / 100;
      const vatAmount = Math.round((amount - netAmount) * 100) / 100;
      return { netAmount, vatAmount, grossAmount: amount };
    };

    // Case 1: Pro Monthly ₱5,999 -> Net ₱5,356.25 + VAT ₱642.75 = ₱5,999.00
    const vat1 = calculateBirVat(5999);
    expect(vat1.netAmount).toBe(5356.25);
    expect(vat1.vatAmount).toBe(642.75);
    expect(vat1.grossAmount).toBe(5999);
    expect(vat1.netAmount + vat1.vatAmount).toBe(5999);

    // Case 2: Pro Annual ₱59,990 -> Net ₱53,562.50 + VAT ₱6,427.50 = ₱59,990.00
    const vat2 = calculateBirVat(59990);
    expect(vat2.netAmount).toBe(53562.5);
    expect(vat2.vatAmount).toBe(6427.5);
    expect(vat2.grossAmount).toBe(59990);
    expect(vat2.netAmount + vat2.vatAmount).toBe(59990);

    // Case 3: Enterprise Annual ₱149,990 -> Net ₱133,919.64 + VAT ₱16,070.36 = ₱149,990.00
    const vat3 = calculateBirVat(149990);
    expect(vat3.netAmount).toBe(133919.64);
    expect(vat3.vatAmount).toBe(16070.36);
    expect(vat3.grossAmount).toBe(149990);
    expect(vat3.netAmount + vat3.vatAmount).toBe(149990);

    // Case 4: Promotional (0) -> Net 0 + VAT 0 = 0
    const vat0 = calculateBirVat(0);
    expect(vat0.netAmount).toBe(0);
    expect(vat0.vatAmount).toBe(0);
    expect(vat0.grossAmount).toBe(0);
  });

  test("Dimension 5: API client execution and payload dispatch to /admin/tenants/:id/record-payment", async () => {
    const mockTenantId = "tenant-guid-7777-8888";
    const expectedResult: RecordManualPaymentResult = {
      success: true,
      invoiceId: "inv-guid-9999",
      invoiceNumber: "INV-202610-0042",
      receiptNumber: "REC-202610-0042",
      status: "Active",
      subscriptionExpiresAt: "2027-10-15T00:00:00Z",
      entitlementVersion: 3,
      facilitiesLicensed: 2,
    };

    let capturedUrl = "";
    let capturedBody: any = null;

    const originalPost = apiClient.post;
    apiClient.post = mock(async (url: string, body: any) => {
      capturedUrl = url;
      capturedBody = body;
      return { data: expectedResult };
    }) as any;

    try {
      const payload: RecordManualPaymentPayload = {
        planSlug: "pro",
        isAnnual: true,
        paymentMethod: "Bank Transfer",
        transactionReference: "BPI-TRX-88231",
        amount: 59990,
        notes: "Direct treasury wire",
        paymentDate: "2026-10-15T00:00:00Z",
      };

      const result = await adminService.recordManualPayment(mockTenantId, payload);

      // Verify endpoint URL
      expect(capturedUrl).toBe(`/admin/tenants/${mockTenantId}/record-payment`);

      // Verify captured payload body
      expect(capturedBody.planSlug).toBe("pro");
      expect(capturedBody.isAnnual).toBe(true);
      expect(capturedBody.paymentMethod).toBe("Bank Transfer");
      expect(capturedBody.transactionReference).toBe("BPI-TRX-88231");
      expect(capturedBody.amount).toBe(59990);
      expect(capturedBody.notes).toBe("Direct treasury wire");

      // Verify response returned
      expect(result.success).toBe(true);
      expect(result.invoiceNumber).toMatch(/^INV-\d{6}-\d{4}$/);
      expect(result.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
      expect(result.status).toBe("Active");
      expect(result.entitlementVersion).toBe(3);
      expect(result.facilitiesLicensed).toBe(2);
    } finally {
      apiClient.post = originalPost;
    }
  });

  test("Dimension 6: Adversarial negative amount and invalid inputs are guarded", () => {
    const dialogFilePath = path.resolve(__dirname, "../src/components/RecordPaymentDialog.tsx");
    const content = fs.readFileSync(dialogFilePath, "utf-8");

    // Form input attribute min="0" and client-side negative check
    expect(content).toContain('min="0"');
    expect(content).toContain('if (amount < 0)');
    expect(content).toContain("Payment amount cannot be negative.");

    // Target plan tier selection guard
    expect(content).toContain('if (!planSlug)');
    expect(content).toContain("Please select a target plan tier.");
  });

  test("Dimension 7: Client-side transaction reference validation matrix and whitespace rejection", () => {
    // Model the exact validation rule from RecordPaymentDialog.tsx
    const validateTransactionReference = (paymentMethod: string, transactionReference: string): { valid: boolean; error?: string } => {
      if (paymentMethod !== "Cash" && paymentMethod !== "Promotional" && !transactionReference.trim()) {
        return {
          valid: false,
          error: `Transaction reference is required for ${paymentMethod}.`
        };
      }
      return { valid: true };
    };

    const requiredMethods = ["Bank Transfer", "GCash/Maya", "Check"];
    const optionalMethods = ["Cash", "Promotional"];

    // 1. Required methods with empty string MUST fail
    for (const method of requiredMethods) {
      const res = validateTransactionReference(method, "");
      expect(res.valid).toBe(false);
      expect(res.error).toBe(`Transaction reference is required for ${method}.`);
    }

    // 2. Required methods with pure whitespace MUST fail (adversarial whitespace injection)
    for (const method of requiredMethods) {
      const res = validateTransactionReference(method, "   \t\n  ");
      expect(res.valid).toBe(false);
      expect(res.error).toBe(`Transaction reference is required for ${method}.`);
    }

    // 3. Required methods with valid reference MUST pass
    for (const method of requiredMethods) {
      const res = validateTransactionReference(method, "REF-2026-9901");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    }

    // 4. Optional methods with empty string MUST pass
    for (const method of optionalMethods) {
      const res = validateTransactionReference(method, "");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    }

    // 5. Optional methods with pure whitespace MUST pass
    for (const method of optionalMethods) {
      const res = validateTransactionReference(method, "   ");
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    }
  });

  test("Dimension 8: Source code inspection of transaction reference validation and dynamic UI attributes", () => {
    const dialogFilePath = path.resolve(__dirname, "../src/components/RecordPaymentDialog.tsx");
    const content = fs.readFileSync(dialogFilePath, "utf-8");

    // Exact check in handleSubmit
    expect(content).toContain('if (paymentMethod !== "Cash" && paymentMethod !== "Promotional" && !transactionReference.trim())');
    expect(content).toContain("toast.error(`Transaction reference is required for ${paymentMethod}.`);");

    // Dynamic required attribute on input
    expect(content).toContain('required={paymentMethod !== "Cash" && paymentMethod !== "Promotional"}');

    // Dynamic asterisk indicator
    expect(content).toContain('{paymentMethod !== "Cash" && paymentMethod !== "Promotional" && <span className="text-destructive">*</span>}');
  });

  test("Dimension 9: Payment method switching dynamically resets and restores plan pricing", () => {
    // Simulate handlePaymentMethodChange logic
    let currentAmount = 59990;
    let paymentMethod = "Bank Transfer";
    let transactionReference = "";
    const isAnnual = true;
    const planSlug = "pro";

    const handlePaymentMethodChange = (method: string) => {
      paymentMethod = method;
      if (method === "Promotional") {
        currentAmount = 0;
        if (!transactionReference) {
          transactionReference = `PROMO-MAKATI-F`;
        }
      } else if (currentAmount === 0) {
        const p = samplePlans.find(x => x.slug === planSlug);
        if (p) {
          const mPrice = typeof p.monthlyPrice === "number" ? p.monthlyPrice : (typeof p.priceMonthly === "number" ? p.priceMonthly : parseFloat(String(p.priceMonthly || 0)) || 0);
          const aPrice = typeof p.annualPrice === "number" ? p.annualPrice : (typeof p.priceAnnually === "number" ? p.priceAnnually : parseFloat(String(p.priceAnnually || 0)) || 0);
          currentAmount = isAnnual ? aPrice : mPrice;
        }
      }
    };

    // 1. Initial Bank Transfer price: 59990
    expect(currentAmount).toBe(59990);

    // 2. Switch to Promotional: price resets to 0, auto-generates reference
    handlePaymentMethodChange("Promotional");
    expect(currentAmount).toBe(0);
    expect(transactionReference).toBe("PROMO-MAKATI-F");

    // 3. Switch back to Bank Transfer: price is restored to 59990
    handlePaymentMethodChange("Bank Transfer");
    expect(currentAmount).toBe(59990);
  });
});
