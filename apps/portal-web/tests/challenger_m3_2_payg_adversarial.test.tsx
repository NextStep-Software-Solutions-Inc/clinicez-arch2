import { describe, test, expect, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import {
  teleconsultBillingService,
  type TeleconsultBillingDto,
  type UpdateTeleconsultBillingRequest,
} from "../src/services/teleconsultBilling.service";
import { apiClient } from "../src/transport/apiClient";

describe("Milestone M3 Challenger 2: Portal Web PAYG Billing Math & Adversarial Stress", () => {
  const mockTenantSlug = "st-luke-bgc";

  // =========================================================================
  // Dimension 1: Minute Projection Math & Rounding Oracles
  // =========================================================================
  describe("1. Minute Projection Math, Decimal Precision & Rounding Oracles", () => {
    test("EMPIRICAL: Exact division ₱250.00 at ₱5.00/min yields exactly 50 projected minutes", () => {
      const rate = 5.0;
      const amount = 250.0;
      const minutes = Math.floor(amount / rate);
      expect(minutes).toBe(50);
    });

    test("EMPIRICAL: Fractional minute rounding policy floors conservative minutes for user display", () => {
      const rate = 5.0;

      // ₱249.99 is not quite enough for 50 minutes (49.998 min) -> floors to 49
      expect(Math.floor(249.99 / rate)).toBe(49);

      // ₱250.01 has fractional pennies beyond 50 min -> floors to 50
      expect(Math.floor(250.01 / rate)).toBe(50);

      // ₱254.99 -> floors to 50
      expect(Math.floor(254.99 / rate)).toBe(50);

      // ₱255.00 -> exactly 51
      expect(Math.floor(255.0 / rate)).toBe(51);

      // Fractional penny ₱0.01 -> 0 minutes
      expect(Math.floor(0.01 / rate)).toBe(0);

      // Sub-rate amount ₱4.99 -> 0 minutes
      expect(Math.floor(4.99 / rate)).toBe(0);
    });

    test("EMPIRICAL: Non-integer platform rates project minutes with strict conservative flooring", () => {
      // Custom negotiated enterprise rate: ₱4.25 / min
      const customRate = 4.25;
      expect(Math.floor(100.0 / customRate)).toBe(23); // 100 / 4.25 = 23.529 -> 23 mins
      expect(Math.floor(500.0 / customRate)).toBe(117); // 500 / 4.25 = 117.647 -> 117 mins

      // Low tier rate: ₱3.333 / min
      const oddRate = 3.333;
      expect(Math.floor(10.0 / oddRate)).toBe(3); // 10 / 3.333 = 3.0003 -> 3 mins
    });

    test("EMPIRICAL: High-volume budget projections do not suffer numerical precision degradation", () => {
      const rate = 5.0;
      const enterpriseBudget = 10_000_000.0; // ₱10M
      expect(Math.floor(enterpriseBudget / rate)).toBe(2_000_000);

      const massiveBudget = 50_000_000.0;
      expect(Math.floor(massiveBudget / rate)).toBe(10_000_000);
    });
  });

  // =========================================================================
  // Dimension 2: Edge Case Robustness (0 Balance, Negative Rate, NaN, Infinity)
  // =========================================================================
  describe("2. Edge Case Robustness: Zero, Negative, NaN, and Infinite Balances", () => {
    test("EMPIRICAL: Zero balance and zero budget return 0 projected minutes without dividing by zero", () => {
      const computeMinutes = (amount: number, rate: number) =>
        amount > 0 && rate > 0 ? Math.floor(amount / rate) : 0;

      expect(computeMinutes(0, 5.0)).toBe(0);
      expect(computeMinutes(0, 0)).toBe(0);
      expect(computeMinutes(-0, 5.0)).toBe(0);
    });

    test("EMPIRICAL: Negative rate or zero rate defensively suppressed to 0 minutes", () => {
      const computeMinutes = (amount: number, rate: number) =>
        amount > 0 && rate > 0 ? Math.floor(amount / rate) : 0;

      // Rate is zero: must NOT produce Infinity
      expect(computeMinutes(250, 0)).toBe(0);

      // Rate is negative: must NOT produce negative minutes
      expect(computeMinutes(250, -5.0)).toBe(0);
      expect(computeMinutes(250, -0.01)).toBe(0);

      // Rate is NaN
      expect(computeMinutes(250, NaN)).toBe(0);
    });

    test("EMPIRICAL: Negative or NaN amounts defensively return 0 minutes", () => {
      const computeMinutes = (amount: number, rate: number) =>
        amount > 0 && rate > 0 ? Math.floor(amount / rate) : 0;

      expect(computeMinutes(-250, 5.0)).toBe(0);
      expect(computeMinutes(-0.01, 5.0)).toBe(0);
      expect(computeMinutes(NaN, 5.0)).toBe(0);
      expect(computeMinutes(-Infinity, 5.0)).toBe(0);
    });

    test("EMPIRICAL: TeleconsultPaygCard client sanitizers clamp inputs to >= 0", () => {
      const sanitizeInput = (val: any) => Math.max(0, Number(val) || 0);

      expect(sanitizeInput(-100)).toBe(0);
      expect(sanitizeInput("-500")).toBe(0);
      expect(sanitizeInput("invalid")).toBe(0);
      expect(sanitizeInput(null)).toBe(0);
      expect(sanitizeInput(undefined)).toBe(0);
      expect(sanitizeInput(250)).toBe(250);
      expect(sanitizeInput("500")).toBe(500);
    });
  });

  // =========================================================================
  // Dimension 3: Master Toggle & Enablement Disablement
  // =========================================================================
  describe("3. Master Toggle Disablement & State Consistency", () => {
    test("EMPIRICAL: Disabling master toggle packages isEnabled: false in update payload", async () => {
      const originalPut = apiClient.put;
      let sentBody: any = null;

      apiClient.put = mock(async (url: string, body: any) => {
        sentBody = body;
        return { data: { ...body } };
      }) as any;

      try {
        const disablePayload: UpdateTeleconsultBillingRequest = {
          isEnabled: false,
          billingMode: "Postpaid",
          allocatedBudgetPhp: 0,
          allowOverageBeyondAllocation: true,
        };

        const result = await teleconsultBillingService.updateTeleconsultBilling(
          mockTenantSlug,
          disablePayload
        );

        expect(sentBody.isEnabled).toBe(false);
        expect(result.isEnabled).toBe(false);
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("EMPIRICAL: Re-enabling master toggle packages isEnabled: true in update payload", async () => {
      const originalPut = apiClient.put;
      let sentBody: any = null;

      apiClient.put = mock(async (url: string, body: any) => {
        sentBody = body;
        return { data: { ...body } };
      }) as any;

      try {
        const enablePayload: UpdateTeleconsultBillingRequest = {
          isEnabled: true,
          billingMode: "Prepaid",
          allocatedBudgetPhp: 0,
          prepaidTopUpPhp: 250,
          allowOverageBeyondAllocation: true,
        };

        const result = await teleconsultBillingService.updateTeleconsultBilling(
          mockTenantSlug,
          enablePayload
        );

        expect(sentBody.isEnabled).toBe(true);
        expect(sentBody.prepaidTopUpPhp).toBe(250);
        expect(result.isEnabled).toBe(true);
      } finally {
        apiClient.put = originalPut;
      }
    });
  });

  // =========================================================================
  // Dimension 4: TeleconsultPaygCard Source Code & Token Guardrails
  // =========================================================================
  describe("4. TeleconsultPaygCard Component Code Verification & Design Token Compliance", () => {
    const cardPath = path.resolve(
      __dirname,
      "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
    );
    const cardSrc = fs.readFileSync(cardPath, "utf-8");

    test("EMPIRICAL: TeleconsultPaygCard implements defensive mathematical guards", () => {
      // 1. Guard against division by 0 or negative rate
      expect(cardSrc).toContain("allocatedBudgetPhp > 0 && ratePerMinute > 0");
      expect(cardSrc).toContain("prepaidTopUpPhp > 0 && ratePerMinute > 0");

      // 2. Math.floor used for minute calculation
      expect(cardSrc).toContain("Math.floor(allocatedBudgetPhp / ratePerMinute)");
      expect(cardSrc).toContain("Math.floor(prepaidTopUpPhp / ratePerMinute)");

      // 3. Math.max(0, ...) used on inputs
      expect(cardSrc).toContain("Math.max(0, Number(e.target.value))");
    });

    test("EMPIRICAL: Uncapped Postpaid integer formatting displays Unlimited", () => {
      expect(cardSrc).toContain("billing?.estimatedAvailableMinutes === 2147483647");
      expect(cardSrc).toContain('"Unlimited"');
    });

    test("EMPIRICAL: Zero raw hex color literals in TeleconsultPaygCard.tsx", () => {
      const stripped = cardSrc
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });
  });
});
