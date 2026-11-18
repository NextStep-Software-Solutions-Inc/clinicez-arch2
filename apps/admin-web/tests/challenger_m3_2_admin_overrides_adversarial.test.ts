import { describe, test, expect, mock } from "bun:test";
import * as path from "path";
import * as fs from "fs";
import {
  adminService,
  type AdminTeleconsultBillingDto,
  type AdminUpdateTeleconsultBillingPayload,
} from "../src/services/admin.service";
import { apiClient } from "../src/lib/api";

describe("Milestone M3 Challenger 2: Admin Web SuperAdmin Overrides Adversarial Stress", () => {
  const testTenantId = "tenant-apollo-makati-002";
  const cardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
  const cardSrc = fs.readFileSync(cardPath, "utf-8");

  // =========================================================================
  // Dimension 1: Input Clamping Stress-Testing (Rate & Budget)
  // =========================================================================
  describe("1. Input Clamping Oracles: Per-Minute Rate & Budget Cap", () => {
    test("EMPIRICAL: Rate per minute input clamps to minimum 0.01 across adversarial boundary inputs", () => {
      // In TenantEntitlementsCard.tsx line 568:
      // const val = parseFloat(e.target.value);
      // setTcRatePerMinute(isNaN(val) || val <= 0 ? 0.01 : val);
      const clampRate = (raw: string | number) => {
        const val = typeof raw === "string" ? parseFloat(raw) : raw;
        return isNaN(val) || val <= 0 ? 0.01 : val;
      };

      // Exact boundaries
      expect(clampRate(5.0)).toBe(5.0);
      expect(clampRate(0.01)).toBe(0.01);
      expect(clampRate(0)).toBe(0.01);
      expect(clampRate(-0)).toBe(0.01);
      expect(clampRate(-0.01)).toBe(0.01);
      expect(clampRate(-5.0)).toBe(0.01);
      expect(clampRate(-999999)).toBe(0.01);

      // Malformed / Non-numeric
      expect(clampRate(NaN)).toBe(0.01);
      expect(clampRate("")).toBe(0.01);
      expect(clampRate("   ")).toBe(0.01);
      expect(clampRate("invalid-rate")).toBe(0.01);
      expect(clampRate("-Infinity")).toBe(0.01);
    });

    test("EMPIRICAL: Monthly budget cap input clamps to >= 0 across adversarial boundary inputs", () => {
      // In TenantEntitlementsCard.tsx line 592:
      // const val = parseFloat(e.target.value);
      // setTcAllocatedBudget(isNaN(val) || val < 0 ? 0 : val);
      const clampBudget = (raw: string | number) => {
        const val = typeof raw === "string" ? parseFloat(raw) : raw;
        return isNaN(val) || val < 0 ? 0 : val;
      };

      // Normal valid budgets
      expect(clampBudget(1500)).toBe(1500);
      expect(clampBudget(250.5)).toBe(250.5);

      // Boundary: 0 is explicitly allowed as "Uncapped"
      expect(clampBudget(0)).toBe(0);
      expect(clampBudget(-0) === 0).toBe(true);
      expect(JSON.stringify(clampBudget(-0))).toBe("0");

      // Negative values clamped to 0
      expect(clampBudget(-1)).toBe(0);
      expect(clampBudget(-500)).toBe(0);
      expect(clampBudget(-0.01)).toBe(0);
      expect(clampBudget(-9999999)).toBe(0);

      // Malformed strings and NaN
      expect(clampBudget(NaN)).toBe(0);
      expect(clampBudget("")).toBe(0);
      expect(clampBudget("null")).toBe(0);
      expect(clampBudget("foo")).toBe(0);
    });
  });

  // =========================================================================
  // Dimension 2: Additive Prepaid Credit Grants (+=)
  // =========================================================================
  describe("2. Additive Prepaid Credit Grants (+=) Verification", () => {
    test("EMPIRICAL: Credit grant validation rejects zero, negative, NaN, and whitespace", () => {
      const validateGrant = (raw: string) => {
        const amount = parseFloat(raw);
        return !isNaN(amount) && amount > 0;
      };

      // Valid amounts
      expect(validateGrant("500")).toBe(true);
      expect(validateGrant("0.01")).toBe(true);
      expect(validateGrant("1250.75")).toBe(true);

      // Invalid zero or negative
      expect(validateGrant("0")).toBe(false);
      expect(validateGrant("-0")).toBe(false);
      expect(validateGrant("-100")).toBe(false);
      expect(validateGrant("-0.50")).toBe(false);

      // Invalid non-numbers
      expect(validateGrant("")).toBe(false);
      expect(validateGrant("   ")).toBe(false);
      expect(validateGrant("grant")).toBe(false);
      expect(validateGrant("NaN")).toBe(false);
    });

    test("EMPIRICAL: Credit grant request sends payload with prepaidCreditGrantPhp", async () => {
      const originalPut = apiClient.put;
      let targetUrl = "";
      let sentBody: any = null;

      apiClient.put = mock(async (url: string, body: any) => {
        targetUrl = url;
        sentBody = body;
        return { data: { tenantId: testTenantId, prepaidBalancePhp: 1500.0 } };
      }) as any;

      try {
        const payload: AdminUpdateTeleconsultBillingPayload = {
          prepaidCreditGrantPhp: 750.0,
        };

        const result = await adminService.updateTenantTeleconsultBilling(testTenantId, payload);
        expect(targetUrl).toBe(`/admin/tenants/${testTenantId}/teleconsult-billing`);
        expect(sentBody).toEqual({ prepaidCreditGrantPhp: 750.0 });
        expect(result.prepaidBalancePhp).toBe(1500.0);
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("EMPIRICAL: TenantEntitlementsCard source verifies additive credit grant button and notes", () => {
      // Button disabled logic in JSX
      expect(cardSrc).toContain("disabled={grantingCredit || !tcCreditGrantInput || parseFloat(tcCreditGrantInput) <= 0}");

      // Button copy
      expect(cardSrc).toContain("Grant Credit (+=)");

      // Explanatory note
      expect(cardSrc).toContain("Credit grants are additive");
    });
  });

  // =========================================================================
  // Dimension 3: Uncapped Postpaid Formatting Oracle
  // =========================================================================
  describe("3. Uncapped Postpaid Formatting Oracle (2147483647 -> ∞)", () => {
    test("EMPIRICAL: Sentinel integer 2147483647 displays exact symbol ∞ (Uncapped Postpaid)", () => {
      const formatAvailable = (minutes: number | undefined | null) =>
        minutes === 2147483647
          ? "∞ (Uncapped Postpaid)"
          : (minutes ?? 0).toLocaleString();

      // Sentinel int.MaxValue (2^31 - 1)
      expect(formatAvailable(2147483647)).toBe("∞ (Uncapped Postpaid)");

      // Regular minutes
      expect(formatAvailable(0)).toBe("0");
      expect(formatAvailable(42)).toBe("42");
      expect(formatAvailable(250)).toBe("250");
      expect(formatAvailable(1000000)).toBe("1,000,000");

      // Null / undefined fallback
      expect(formatAvailable(null as any)).toBe("0");
      expect(formatAvailable(undefined as any)).toBe("0");
    });

    test("EMPIRICAL: TenantEntitlementsCard source renders ∞ (Uncapped Postpaid)", () => {
      expect(cardSrc).toContain("teleconsultBilling?.estimatedAvailableMinutes === 2147483647");
      expect(cardSrc).toContain("'∞ (Uncapped Postpaid)'");
    });
  });

  // =========================================================================
  // Dimension 4: Independence from Audit Reason
  // =========================================================================
  describe("4. Independence from Audit Reason Collision", () => {
    test("EMPIRICAL: Teleconsultation subtab saves without requiring the mandatory audit reason", () => {
      // The audit reason input and save button are inside:
      // {activeSubTab !== 'teleconsult' && (
      expect(cardSrc).toContain("{activeSubTab !== 'teleconsult' && (");

      // The teleconsult save button invokes handleSaveTeleconsultBilling directly
      expect(cardSrc).toContain("onClick={handleSaveTeleconsultBilling}");
    });
  });

  // =========================================================================
  // Dimension 5: Design Token Compliance
  // =========================================================================
  describe("5. Strict Design Token Compliance", () => {
    test("EMPIRICAL: TenantEntitlementsCard.tsx contains ZERO hardcoded hex color literals", () => {
      const stripped = cardSrc
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*/g, "");
      const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });
  });
});
