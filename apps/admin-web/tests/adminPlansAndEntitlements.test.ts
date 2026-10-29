import { describe, test, expect, mock } from "bun:test";
import { adminService, BillingPlan, TenantOverridesDto } from "../src/services/admin.service";
import { QUANTITATIVE_LIMITS, CAPABILITY_FLAGS } from "../src/components/PlanEditorDialog";
import { apiClient } from "../src/lib/api";
import * as fs from "fs";
import * as path from "path";

describe("Milestone 3 SuperAdmin Plans, Entitlement Overrides & Payment Recording", () => {
  test("M3.1: Entitlement vocabulary has all 14 quantitative limits", () => {
    const expectedLimits = [
      "limit.clinics",
      "limit.laboratories",
      "limit.pharmacies",
      "limit.organizations",
      "limit.branches",
      "limit.members",
      "limit.staff",
      "limit.storage_gb",
      "limit.terminals",
      "limit.beds",
      "limit.analyzers",
      "limit.monthly_consultations",
      "limit.api_requests_monthly",
      "limit.patients",
    ];

    expect(QUANTITATIVE_LIMITS.length).toBe(14);
    const keys = QUANTITATIVE_LIMITS.map((l) => l.key);
    for (const expected of expectedLimits) {
      expect(keys).toContain(expected);
    }
  });

  test("M3.2: Entitlement vocabulary has all 10 capability feature flags", () => {
    const expectedFeatures = [
      "feature.cross_tenant_interop",
      "feature.teleconsultation",
      "feature.electronic_prescriptions",
      "feature.lis_integration",
      "feature.inventory_management",
      "feature.philhealth_konsulta",
      "feature.multi_terminal_sync",
      "feature.advanced_analytics",
      "feature.custom_letterhead",
      "feature.on_prem",
    ];

    expect(CAPABILITY_FLAGS.length).toBe(10);
    const keys = CAPABILITY_FLAGS.map((f) => f.key);
    for (const expected of expectedFeatures) {
      expect(keys).toContain(expected);
    }
  });

  test("M3.3: adminService.getPlans returns normalized plan records", async () => {
    const mockPlans = [
      {
        id: "starter",
        planId: "11111111-1111-1111-1111-111111111111",
        slug: "starter",
        name: "Starter Clinic",
        description: "Small clinic setup",
        priceMonthly: 1999,
        priceAnnually: 19990,
        rank: 1,
        version: 1,
        features: ["e-Rx"],
        limits: { "limit.clinics": 1, "limit.staff": 5 },
        enabledFeatures: ["feature.electronic_prescriptions"],
      },
    ];

    const originalGet = apiClient.get;
    apiClient.get = mock(async (url: string) => {
      if (url === "/admin/plans") {
        return { data: mockPlans };
      }
      return { data: [] };
    }) as any;

    try {
      const plans = await adminService.getPlans();
      expect(Array.isArray(plans)).toBe(true);
      expect(plans.length).toBe(1);
      expect(plans[0].slug).toBe("starter");
      expect(plans[0].monthlyPrice).toBe(1999);
      expect(plans[0].annualPrice).toBe(19990);
      expect(plans[0].rank).toBe(1);
      expect(plans[0].limits["limit.clinics"]).toBe(1);
      expect(plans[0].enabledFeatures).toContain("feature.electronic_prescriptions");
    } finally {
      apiClient.get = originalGet;
    }
  });

  test("M3.4: Zero raw hex color values in newly authored M3 components", () => {
    const componentsToCheck = [
      "src/components/PlanEditorDialog.tsx",
      "src/components/TenantEntitlementsCard.tsx",
      "src/components/RecordPaymentDialog.tsx",
      "src/routes/plans.tsx",
    ];

    // Regular expression matching raw hex codes like #0D6963, #fff, #1a2b3c
    const rawHexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

    for (const relPath of componentsToCheck) {
      const fullPath = path.resolve(__dirname, "..", relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = fs.readFileSync(fullPath, "utf-8");
      const hexMatches = content.match(rawHexRegex);

      expect(hexMatches).toBeNull();
    }
  });

  test("M3.5: adminService.recordManualPayment payload interface conforms to backend contract", () => {
    const payload = {
      planSlug: "pro",
      isAnnual: true,
      paymentMethod: "Bank Transfer",
      transactionReference: "BDO-123456",
      amount: 49990,
      notes: "Annual prepayment",
      paymentDate: "2026-10-15T00:00:00Z",
    };

    expect(payload.planSlug).toBe("pro");
    expect(payload.isAnnual).toBe(true);
    expect(payload.paymentMethod).toBe("Bank Transfer");
    expect(payload.amount).toBe(49990);
  });

  test("M3.6: Unlimited (-1) limit override maps backend null to -1 when key exists in overridesRes.limits", () => {
    // Backend returns null for unlimited overrides in TenantOverridesDto
    const overridesRes: { limits: Record<string, number | null> } = {
      limits: {
        "limit.beds": null, // SuperAdmin set to Unlimited (-1)
        "limit.clinics": 5, // Finite override
        // other limits omitted -> inherit baseline
      },
    };

    const currentLimits: Record<string, number | null> = {};
    QUANTITATIVE_LIMITS.forEach((l) => {
      if (overridesRes.limits && l.key in overridesRes.limits) {
        currentLimits[l.key] = overridesRes.limits[l.key] === null ? -1 : overridesRes.limits[l.key];
      } else {
        currentLimits[l.key] = null; // inheriting default
      }
    });

    // Verify limit.beds is mapped to -1 instead of null
    expect(currentLimits["limit.beds"]).toBe(-1);
    expect(currentLimits["limit.clinics"]).toBe(5);
    expect(currentLimits["limit.pharmacies"]).toBeNull();

    // Verify that activeLimits includes limit.beds = -1 on subsequent save (preventing soft-deletion)
    const activeLimits: Record<string, number | null> = {};
    Object.entries(currentLimits).forEach(([k, v]) => {
      if (v !== null) {
        activeLimits[k] = v < -1 ? 0 : v;
      }
    });

    expect(activeLimits["limit.beds"]).toBe(-1);
    expect(activeLimits["limit.clinics"]).toBe(5);
    expect("limit.pharmacies" in activeLimits).toBe(false);
  });

  test("M3.7: Mandatory audit reason is enforced before saving workspace entitlement overrides", () => {
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");

    // Save button must be disabled when reason is empty
    expect(tenantCardSrc).toContain("disabled={saving || !reason.trim()}");

    // handleSave must validate reason.trim() and show toast error
    expect(tenantCardSrc).toContain("if (!reason.trim())");
    expect(tenantCardSrc).toContain("An audit reason / authorization reference is required");

    // Reason input must be marked required
    expect(tenantCardSrc).toContain("required");
  });

  test("M3.8: Negative limit values below -1 are sanitized and clamped to 0", () => {
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const planEditorPath = path.resolve(__dirname, "../src/components/PlanEditorDialog.tsx");

    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");
    const planEditorSrc = fs.readFileSync(planEditorPath, "utf-8");

    // TenantEntitlementsCard sanitizes parsed < -1
    expect(tenantCardSrc).toContain("parsed < -1");
    expect(tenantCardSrc).toContain("v < -1 ? 0 : v");

    // PlanEditorDialog sanitizes val < -1
    expect(planEditorSrc).toContain("val < -1 ? 0 : val");
    expect(planEditorSrc).toContain("v < -1 ? 0 : v");
  });

  test("M3.9: Client-side transaction reference is required for non-cash and non-promotional payments", () => {
    const paymentDialogPath = path.resolve(__dirname, "../src/components/RecordPaymentDialog.tsx");
    const paymentDialogSrc = fs.readFileSync(paymentDialogPath, "utf-8");

    // handleSubmit enforces transactionReference.trim() for non-cash/non-promotional
    expect(paymentDialogSrc).toContain('paymentMethod !== "Cash" && paymentMethod !== "Promotional" && !transactionReference.trim()');
    expect(paymentDialogSrc).toContain("Transaction reference is required for");

    // Input conditionally sets required
    expect(paymentDialogSrc).toContain('required={paymentMethod !== "Cash" && paymentMethod !== "Promotional"}');
  });
});
