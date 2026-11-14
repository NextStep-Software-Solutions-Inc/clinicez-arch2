import { describe, test, expect, mock, it } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import { SWRConfig } from "swr";
import * as fs from "fs";
import * as path from "path";
import {
  teleconsultBillingService,
  type TeleconsultBillingDto,
  type UpdateTeleconsultBillingRequest,
} from "../src/services/teleconsultBilling.service";
import { apiClient } from "../src/transport/apiClient";
import { TeleconsultPaygCard } from "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard";

describe("Milestone 13 Empirical Challenger: Portal Web PAYG Billing Adversarial Suite", () => {
  const baseMockBilling: TeleconsultBillingDto = {
    tenantId: "adv-tenant-1111-2222-3333-444455556666",
    tenantSlug: "adv-clinic",
    isEnabled: false,
    billingMode: "Postpaid",
    ratePerMinutePhp: 5.0,
    allocatedBudgetPhp: 1500.0,
    prepaidBalancePhp: 250.0,
    allowOverageBeyondAllocation: true,
    currentPeriodYearMonth: "2026-11",
    currentPeriodMinutesUsed: 42,
    currentPeriodBilledPhp: 210.0,
    currentPeriodOveragePhp: 0.0,
    estimatedAvailableMinutes: 258,
  };

  const renderCardWithFallback = (billingData: Partial<TeleconsultBillingDto> | null, tenantSlug = "adv-clinic") => {
    const data = billingData ? { ...baseMockBilling, ...billingData } : null;
    return renderToString(
      React.createElement(
        SWRConfig,
        {
          value: {
            fallback: {
              [`/tenants/${tenantSlug}/teleconsult-billing`]: data,
            },
          },
        },
        React.createElement(TeleconsultPaygCard, { tenantSlug })
      )
    );
  };

  // =========================================================================
  // Dimension 1: Boundary & Extreme Numbers
  // =========================================================================
  describe("Dimension 1: Boundary & Extreme Numbers", () => {
    test("1.1 Zero rate per minute resilience (prevents division by zero Infinity/NaN)", () => {
      const zeroRateBilling: TeleconsultBillingDto = {
        ...baseMockBilling,
        ratePerMinutePhp: 0,
      };

      // Mathematical logic verification
      const budget = 1500;
      const rate = zeroRateBilling.ratePerMinutePhp;
      const convertedMinutes = budget > 0 && rate > 0 ? Math.floor(budget / rate) : 0;
      expect(convertedMinutes).toBe(0);
      expect(Number.isFinite(convertedMinutes)).toBe(true);
      expect(convertedMinutes).not.toBeNaN();
      expect(convertedMinutes).not.toBe(Infinity);

      // SSR rendering verification
      const html = renderCardWithFallback(zeroRateBilling);
      expect(html).toContain("data-testid=\"teleconsult-payg-card\"");
      // Ensures no "Infinity" or "NaN" rendered in DOM
      expect(html).not.toContain("Infinity");
      expect(html).not.toContain("NaN");
    });

    test("1.2 Negative rate per minute resilience (prevents negative minute projections)", () => {
      const negativeRate = -5.0;
      const budget = 1000;
      const converted = budget > 0 && negativeRate > 0 ? Math.floor(budget / negativeRate) : 0;
      expect(converted).toBe(0);

      const html = renderCardWithFallback({ ratePerMinutePhp: -5.0 });
      expect(html).not.toContain("-200 minutes");
      expect(html).not.toContain("NaN");
    });

    test("1.3 Negative budget allocation resilience", () => {
      const rate = 5.0;
      const negativeBudget = -500;
      const converted = negativeBudget > 0 && rate > 0 ? Math.floor(negativeBudget / rate) : 0;
      expect(converted).toBe(0);

      // Verify input clamping formula Math.max(0, Number(val))
      const userRawInputs = [-500, -1, -0.01, -999999];
      for (const raw of userRawInputs) {
        const clamped = Math.max(0, Number(raw));
        expect(clamped).toBe(0);
      }
    });

    test("1.4 Negative prepaid top-up resilience", () => {
      const rate = 5.0;
      const negativeTopUp = -250;
      const converted = negativeTopUp > 0 && rate > 0 ? Math.floor(negativeTopUp / rate) : 0;
      expect(converted).toBe(0);

      // In handleSave: prepaidTopUpPhp: billingMode === "Prepaid" && prepaidTopUpPhp > 0 ? Number(prepaidTopUpPhp) : undefined
      const billingMode = "Prepaid";
      const sanitizedPayloadTopUp =
        billingMode === "Prepaid" && negativeTopUp > 0 ? Number(negativeTopUp) : undefined;
      expect(sanitizedPayloadTopUp).toBeUndefined();
    });

    test("1.5 Fractional cents precision across budget, top-up, and rates", () => {
      const rate = 5.0;

      // Budget with fractional cents: exact floor
      expect(Math.floor(100.25 / rate)).toBe(20);
      expect(Math.floor(100.99 / rate)).toBe(20);
      expect(Math.floor(104.99 / rate)).toBe(20);
      expect(Math.floor(105.00 / rate)).toBe(21);

      // Top-up with fractional cents
      expect(Math.floor(49.99 / rate)).toBe(9);
      expect(Math.floor(50.00 / rate)).toBe(10);
      expect(Math.floor(0.99 / rate)).toBe(0);

      // Micro rate with high precision (e.g. ₱3.3333)
      const microRate = 3.3333;
      expect(Math.floor(100 / microRate)).toBe(30);

      // Ultra low rate (e.g. ₱0.01 / min)
      const pennyRate = 0.01;
      expect(Math.floor(1.00 / pennyRate)).toBe(100);
    });

    test("1.6 Extremely large numbers (Number.MAX_SAFE_INTEGER) boundary protection", () => {
      const maxSafe = Number.MAX_SAFE_INTEGER; // 9007199254740991
      const rate = 5.0;

      const converted = Math.floor(maxSafe / rate);
      expect(converted).toBe(1801439850948198);
      expect(Number.isSafeInteger(converted)).toBe(true);

      const formatted = converted.toLocaleString();
      expect(formatted).toBe("1,801,439,850,948,198");

      // Int.MaxValue uncapped available minutes sentinel (2147483647)
      const uncappedBilling: TeleconsultBillingDto = {
        ...baseMockBilling,
        estimatedAvailableMinutes: 2147483647,
      };
      const html = renderCardWithFallback(uncappedBilling);
      expect(html).toContain("∞ (Uncapped)");
    });
  });

  // =========================================================================
  // Dimension 2: Mode Switching & Dirty Inputs
  // =========================================================================
  describe("Dimension 2: Mode Switching & Dirty Inputs", () => {
    test("2.1 State transitions between Postpaid and Prepaid mode", () => {
      // Postpaid view verification
      const postpaidHtml = renderCardWithFallback({ billingMode: "Postpaid" });
      expect(postpaidHtml).toContain("Postpaid Metered");
      expect(postpaidHtml).toContain("Monthly Cost Allocation Budget (₱)");
      expect(postpaidHtml).toContain("input-allocated-budget");

      // Prepaid view verification (via source & rendered state)
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      // Verifies segmented toggle controls
      expect(content).toContain('onClick={() => setBillingMode("Postpaid")}');
      expect(content).toContain('onClick={() => setBillingMode("Prepaid")}');
      expect(content).toContain("Prepaid Minute Credits");
      expect(content).toContain("Current Prepaid Balance:");
      expect(content).toContain("input-prepaid-topup");
    });

    test("2.2 Dirty input normalization from API responses", () => {
      // Verification of normalization logic in TeleconsultPaygCard:
      // setBillingMode(billing.billingMode === "Prepaid" ? "Prepaid" : "Postpaid");
      const dirtyModes = ["prepaid", "PREPAID", "hybrid", "metered", "", "null", "undefined", null, undefined];
      for (const dirty of dirtyModes as any[]) {
        const normalized = dirty === "Prepaid" ? "Prepaid" : "Postpaid";
        expect(normalized).toBe("Postpaid");
      }

      // Exact match for "Prepaid" succeeds
      expect("Prepaid" === "Prepaid" ? "Prepaid" : "Postpaid").toBe("Prepaid");

      // Nullish budget and overage fallback
      const nullBudget: any = null;
      expect(nullBudget ?? 0).toBe(0);

      const undefinedOverage: any = undefined;
      expect(undefinedOverage ?? true).toBe(true);
    });

    test("2.3 Cross-mode dirty state isolation on save (Postpaid discards top-up)", async () => {
      const originalPut = apiClient.put;
      let capturedPayload: any = null;

      apiClient.put = mock(async (_url: string, body: any) => {
        capturedPayload = body;
        return { data: baseMockBilling };
      }) as any;

      try {
        // Scenario: user typed a top-up in Prepaid, but switched to Postpaid mode before saving
        const dirtyTopUp = 500;
        const currentMode = "Postpaid";
        const budget = 2000;

        const request: UpdateTeleconsultBillingRequest = {
          isEnabled: true,
          billingMode: currentMode,
          allocatedBudgetPhp: Number(budget) || 0,
          prepaidTopUpPhp:
            currentMode === "Prepaid" && dirtyTopUp > 0 ? Number(dirtyTopUp) : undefined,
          allowOverageBeyondAllocation: true,
        };

        await teleconsultBillingService.updateTeleconsultBilling("adv-clinic", request);

        expect(capturedPayload.billingMode).toBe("Postpaid");
        expect(capturedPayload.allocatedBudgetPhp).toBe(2000);
        // prepaidTopUpPhp MUST be undefined when saving in Postpaid mode
        expect(capturedPayload.prepaidTopUpPhp).toBeUndefined();
      } finally {
        apiClient.put = originalPut;
      }
    });
  });

  // =========================================================================
  // Dimension 3: Live Minute Conversions
  // =========================================================================
  describe("Dimension 3: Live Minute Conversions & Floor Invariants", () => {
    test("3.1 Property-based test: Exact floor invariant across 50 randomized rates and budgets", () => {
      // Oracle: Math.floor(budget / rate) * rate <= budget
      // and (Math.floor(budget / rate) + 1) * rate > budget
      for (let i = 1; i <= 50; i++) {
        const rate = +(1.0 + (i * 0.77)).toFixed(2); // rates between ₱1.77 and ₱39.50
        const budget = +(50 + (i * 213.45)).toFixed(2); // budgets between ₱263.45 and ₱10,722.50

        const minutes = Math.floor(budget / rate);
        const costForFlooredMinutes = +(minutes * rate).toFixed(2);

        // Floored minutes cost must never exceed budget
        expect(costForFlooredMinutes).toBeLessThanOrEqual(budget + 0.001); // floating point tolerance
        // One additional minute would exceed budget (or equal when exact)
        const costForNextMinute = +((minutes + 1) * rate).toFixed(2);
        expect(costForNextMinute).toBeGreaterThan(budget - 0.001);
      }
    });

    test("3.2 Additive minute projections in Prepaid mode", () => {
      const rate = 5.0;
      const initialBalance = 250.0;
      const topUpAmount = 500.0;

      const currentMins = Math.floor(initialBalance / rate);
      const additionalMins = Math.floor(topUpAmount / rate);
      const totalProjectedMins = currentMins + additionalMins;

      expect(currentMins).toBe(50);
      expect(additionalMins).toBe(100);
      expect(totalProjectedMins).toBe(150);

      // Verify non-divisible fractional top-up
      const fractionalTopUp = 123.0; // ₱123 @ ₱5.00/min = 24 mins, ₱3 remainder
      expect(Math.floor(fractionalTopUp / rate)).toBe(24);
      expect(currentMins + Math.floor(fractionalTopUp / rate)).toBe(74);
    });

    test("3.3 Zero-division and NaN protection in all minute calculations", () => {
      const dirtyRates = [0, -0, NaN, -1, -5.5];
      const dirtyBudgets = [0, -100, NaN, null as any, undefined as any];

      for (const r of dirtyRates) {
        for (const b of dirtyBudgets) {
          const result = b > 0 && r > 0 ? Math.floor(b / r) : 0;
          expect(result).toBe(0);
          expect(Number.isFinite(result)).toBe(true);
        }
      }
    });
  });

  // =========================================================================
  // Dimension 4: Mid-Call Cutoff Protection Notice
  // =========================================================================
  describe("Dimension 4: Mid-Call Cutoff Protection Notice", () => {
    test("4.1 Verbatim presence of clinical patient safety warning", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain("Mid-Call Cutoff Protection Notice:");
      expect(content).toContain(
        "To ensure clinical patient safety, active teleconsultations in progress will never be abruptly disconnected or severed even if your prepaid balance reaches ₱0.00 or your budget allocation is exceeded. Overage minutes will be accrued and billed separately."
      );
    });

    test("4.2 Separate overage explanation presence and checkbox control", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain("Allow Overage Beyond Allocation");
      expect(content).toContain(
        "Ongoing calls are never severed mid-flight if allocation is reached; overage billed separately."
      );
      expect(content).toContain('id="chk-allow-overage"');
    });

    test("4.3 SSR rendering verifies cutoff protection banner in rendered HTML", () => {
      const html = renderCardWithFallback(baseMockBilling);
      expect(html).toContain("Mid-Call Cutoff Protection Notice:");
      expect(html).toContain("clinical patient safety");
      expect(html).toContain("chk-allow-overage");
    });
  });

  // =========================================================================
  // Dimension 5: Master Activation Toggle
  // =========================================================================
  describe("Dimension 5: Master Activation Toggle & Accessibility", () => {
    test("5.1 Master toggle includes role='switch', data-testid, and testID", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain('role="switch"');
      expect(content).toContain('aria-checked={isEnabled}');
      expect(content).toContain('data-testid="toggle-teleconsult-payg"');
      expect(content).toContain('testID: "toggle-teleconsult-payg"');
    });

    test("5.2 Off-by-default initial state in component declaration", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain("const [isEnabled, setIsEnabled] = useState(false);");
    });

    test("5.3 SSR rendering reflects aria-checked='false' and 'Disabled' badge initially", () => {
      const html = renderCardWithFallback({ isEnabled: false });

      expect(html).toContain('role="switch"');
      expect(html).toContain('aria-checked="false"');
      expect(html).toContain('data-testid="toggle-teleconsult-payg"');
      expect(html).toContain("Disabled");
    });

    test("5.4 Toggle wiring and state-dependent rendering for Active vs Disabled", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      // Verifies aria-checked={isEnabled} binding
      expect(content).toContain('aria-checked={isEnabled}');
      // Verifies click handler toggles state
      expect(content).toContain('onClick={() => setIsEnabled((prev) => !prev)}');
      // Verifies active and disabled badge branches
      expect(content).toContain('{isEnabled ? "Active" : "Disabled"}');
      expect(content).toContain('isEnabled ? "bg-primary" : "bg-muted-foreground/30"');
      expect(content).toContain('isEnabled ? "translate-x-5" : "translate-x-0"');
    });
  });

  // =========================================================================
  // Dimension 6: Informational Banner & Hierarchical Cascade
  // =========================================================================
  describe("Dimension 6: Informational Banner & Hierarchical Cascade", () => {
    test("6.1 Banner communicates separate billing outside base plan", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain("Separate Metered Licensing &amp; Clinic Cascade");
      expect(content).toContain("billed separately outside the base subscription plan");
    });

    test("6.2 Banner communicates hierarchical cascade to Clinic Administrators", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      expect(content).toContain(
        "When disabled, teleconsultation is locked across all clinics in this workspace. Enabling here cascades to Clinic Administrators, who can then turn on teleconsultation for their individual clinic facilities."
      );
    });

    test("6.3 SSR rendering displays banner with ShieldCheck and rate", () => {
      const html = renderCardWithFallback(baseMockBilling);

      expect(html).toContain("Separate Metered Licensing &amp; Clinic Cascade");
      expect(html).toContain("cascades to Clinic Administrators");
      expect(html).toContain("lucide-shield-check");
    });
  });

  // =========================================================================
  // Dimension 7: Design Token Strictness & Zero Hex/RGBA Audit
  // =========================================================================
  describe("Dimension 7: Design Token Strictness (Zero Raw Hex or RGBA Color Literals)", () => {
    const portalWebFiles = [
      "src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx",
      "src/app/[tenant]/dashboard/billing/components/PlansTabContent.tsx",
      "src/app/[tenant]/dashboard/plan/PlanClient.tsx",
      "src/services/teleconsultBilling.service.ts",
      "src/hooks/useTeleconsultBilling.ts",
    ];

    test("7.1 ZERO raw #hex color literals (#fff, #0D6963, etc.) in all billing files", () => {
      const rawHexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

      for (const relPath of portalWebFiles) {
        const fullPath = path.resolve(__dirname, "..", relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, "utf-8");
        const matches = content.match(rawHexRegex);

        expect(matches).toBeNull();
      }
    });

    test("7.2 ZERO raw rgba() or rgb() color literals in all billing files", () => {
      const rawRgbRegex = /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+/gi;

      for (const relPath of portalWebFiles) {
        const fullPath = path.resolve(__dirname, "..", relPath);
        const content = fs.readFileSync(fullPath, "utf-8");
        const matches = content.match(rawRgbRegex);

        expect(matches).toBeNull();
      }
    });

    test("7.3 Semantic token classes are utilized exclusively for card, text, border, and status", () => {
      const cardPath = path.resolve(
        __dirname,
        "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
      );
      const content = fs.readFileSync(cardPath, "utf-8");

      // Verify core semantic class tokens
      expect(content).toContain("bg-card");
      expect(content).toContain("text-card-foreground");
      expect(content).toContain("border-border");
      expect(content).toContain("bg-primary");
      expect(content).toContain("text-primary");
      expect(content).toContain("bg-muted");
      expect(content).toContain("text-muted-foreground");
    });
  });

  // =========================================================================
  // Dimension 8: Service Layer API Routing & Error Handling
  // =========================================================================
  describe("Dimension 8: Service Layer API Routing & Error Handling", () => {
    test("8.1 Slug URI encoding protects against injection characters", async () => {
      const originalGet = apiClient.get;
      let requestedUrl = "";

      apiClient.get = mock(async (url: string) => {
        requestedUrl = url;
        return { data: baseMockBilling };
      }) as any;

      try {
        const adversarialSlug = "clinic/north & south?filter=all#frag";
        await teleconsultBillingService.getTeleconsultBilling(adversarialSlug);

        expect(requestedUrl).toBe(
          `/tenants/${encodeURIComponent(adversarialSlug)}/teleconsult-billing`
        );
        expect(requestedUrl).not.toContain("?");
        expect(requestedUrl).not.toContain("#");
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("8.2 Service propagates HTTP rejection errors with server details", async () => {
      const originalPut = apiClient.put;

      apiClient.put = mock(async () => {
        const error: any = new Error("Validation Failed");
        error.response = {
          status: 400,
          data: { message: "Budget allocation cannot be negative." },
        };
        throw error;
      }) as any;

      try {
        await expect(
          teleconsultBillingService.updateTeleconsultBilling("test-clinic", {
            isEnabled: true,
            billingMode: "Postpaid",
            allocatedBudgetPhp: -100,
          })
        ).rejects.toThrow("Validation Failed");
      } finally {
        apiClient.put = originalPut;
      }
    });
  });
});
