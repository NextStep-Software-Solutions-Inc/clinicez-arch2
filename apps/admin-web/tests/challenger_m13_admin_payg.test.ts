import { describe, test, expect, mock } from "bun:test";
import {
  adminService,
  AdminTeleconsultBillingDto,
  AdminUpdateTeleconsultBillingPayload,
} from "../src/services/admin.service";
import { QUANTITATIVE_LIMITS, CAPABILITY_FLAGS } from "../src/components/PlanEditorDialog";
import { apiClient } from "../src/lib/api";
import * as fs from "fs";
import * as path from "path";

describe("Milestone M13 Empirical Challenger: Admin Web PAYG Billing UI & Service Layer Suite", () => {
  // =========================================================================
  // Dimension 1: Vocabulary & Limit Invariant Verification
  // =========================================================================
  describe("Invariant Verification: Quantitative Limits & Capability Flags", () => {
    test("EMPIRICAL: QUANTITATIVE_LIMITS length remains exactly 14 with uncorrupted keys and metadata", () => {
      const EXPECTED_LIMITS = [
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

      const keys = QUANTITATIVE_LIMITS.map((lim) => lim.key);
      expect(new Set(keys).size).toBe(14);

      for (const expectedKey of EXPECTED_LIMITS) {
        expect(keys).toContain(expectedKey);
        const item = QUANTITATIVE_LIMITS.find((l) => l.key === expectedKey);
        expect(item).toBeDefined();
        expect(typeof item!.label).toBe("string");
        expect(item!.label.length).toBeGreaterThan(0);
        expect(typeof item!.category).toBe("string");
        expect(typeof item!.description).toBe("string");
        expect(typeof item!.defaultVal).toBe("number");
        expect(item!.icon).toBeDefined();
      }
    });

    test("EMPIRICAL: CAPABILITY_FLAGS length remains exactly 10 with uncorrupted keys and metadata", () => {
      const EXPECTED_FEATURES = [
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

      const keys = CAPABILITY_FLAGS.map((feat) => feat.key);
      expect(new Set(keys).size).toBe(10);

      for (const expectedKey of EXPECTED_FEATURES) {
        expect(keys).toContain(expectedKey);
        const item = CAPABILITY_FLAGS.find((f) => f.key === expectedKey);
        expect(item).toBeDefined();
        expect(typeof item!.label).toBe("string");
        expect(item!.label.length).toBeGreaterThan(0);
        expect(typeof item!.description).toBe("string");
        expect(typeof item!.defaultVal).toBe("boolean");
        expect(item!.icon).toBeDefined();
      }
    });
  });

  // =========================================================================
  // Dimension 2: Audit Reason & Teleconsult Update Independence Verification
  // =========================================================================
  describe("Audit Reason Verification: Non-Empty Reason vs Teleconsult Independence", () => {
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");

    test("EMPIRICAL: Limits & Features override updates strictly enforce non-empty audit authorization reason", () => {
      // 1. Save button for overrides is conditionally disabled when reason is empty or whitespace
      expect(tenantCardSrc).toContain("disabled={saving || !reason.trim()}");

      // 2. handleSaveOverrides guards against empty/whitespace reason
      expect(tenantCardSrc).toContain("if (!reason.trim())");
      expect(tenantCardSrc).toContain("An audit reason / authorization reference is required to apply entitlement overrides.");

      // 3. Reason input field is marked required in JSX
      expect(tenantCardSrc).toContain('placeholder="e.g. Enterprise pilot agreement signed on 2026-10-28 (Ref #AGR-4910)"');
      expect(tenantCardSrc).toContain("required");

      // 4. Test reason validation logic
      const validateAuditReason = (r: string) => r.trim().length > 0;
      expect(validateAuditReason("")).toBe(false);
      expect(validateAuditReason("   ")).toBe(false);
      expect(validateAuditReason("\t\n")).toBe(false);
      expect(validateAuditReason("AGR-4910 Enterprise Pilot")).toBe(true);
    });

    test("EMPIRICAL: Teleconsult PAYG updates operate independently without audit reason collision", () => {
      // 1. Audit reason input is conditionally hidden on the 'teleconsult' subtab
      expect(tenantCardSrc).toContain("{activeSubTab !== 'teleconsult' && (");

      // 2. Teleconsult save button does NOT require reason
      expect(tenantCardSrc).toContain("disabled={savingTc}");
      expect(tenantCardSrc).not.toContain("disabled={savingTc || !reason.trim()}");

      // 3. handleSaveTeleconsultBilling does not check or require reason
      const handleSaveTeleconsultMatch = tenantCardSrc.match(
        /const handleSaveTeleconsultBilling = async \(\) => \{([\s\S]*?)\};/
      );
      expect(handleSaveTeleconsultMatch).not.toBeNull();
      const handleSaveTeleconsultCode = handleSaveTeleconsultMatch![1];
      expect(handleSaveTeleconsultCode).not.toContain("reason");

      // 4. handleGrantCredit does not check or require reason
      const handleGrantCreditMatch = tenantCardSrc.match(
        /const handleGrantCredit = async \(\) => \{([\s\S]*?)\};/
      );
      expect(handleGrantCreditMatch).not.toBeNull();
      const handleGrantCreditCode = handleGrantCreditMatch![1];
      expect(handleGrantCreditCode).not.toContain("reason");
    });
  });

  // =========================================================================
  // Dimension 3: Extreme Inputs on SuperAdmin Controls
  // =========================================================================
  describe("Extreme Inputs on SuperAdmin Controls", () => {
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");

    test("EMPIRICAL: Rate per minute input clamps to minimum 0.01 (rejects 0, negative numbers, and NaN)", () => {
      // Verify source code clamping expression
      expect(tenantCardSrc).toContain("min=\"0.01\"");
      expect(tenantCardSrc).toContain("step=\"0.50\"");
      expect(tenantCardSrc).toContain("isNaN(val) || val <= 0 ? 0.01 : val");

      // Test rate clamping logic
      const clampRate = (raw: string | number): number => {
        const val = typeof raw === "string" ? parseFloat(raw) : raw;
        return isNaN(val) || val <= 0 ? 0.01 : val;
      };

      expect(clampRate(0)).toBe(0.01);
      expect(clampRate(-1)).toBe(0.01);
      expect(clampRate(-0.01)).toBe(0.01);
      expect(clampRate(-9999.99)).toBe(0.01);
      expect(clampRate("")).toBe(0.01);
      expect(clampRate("abc")).toBe(0.01);
      expect(clampRate("NaN")).toBe(0.01);

      // Valid rates pass through correctly
      expect(clampRate(0.01)).toBe(0.01);
      expect(clampRate(0.5)).toBe(0.5);
      expect(clampRate(5.0)).toBe(5.0);
      expect(clampRate(4.75)).toBe(4.75);
      expect(clampRate("7.50")).toBe(7.5);
    });

    test("EMPIRICAL: Additive prepaid credit grant rejects non-positive, zero, or malformed values", () => {
      // Verify source code validation
      expect(tenantCardSrc).toContain("parseFloat(tcCreditGrantInput)");
      expect(tenantCardSrc).toContain("isNaN(amount) || amount <= 0");
      expect(tenantCardSrc).toContain("Please enter a valid positive credit grant amount.");
      expect(tenantCardSrc).toContain("disabled={grantingCredit || !tcCreditGrantInput || parseFloat(tcCreditGrantInput) <= 0}");

      // Test credit grant validation logic
      const validateCreditGrant = (raw: string): { isValid: boolean; amount?: number } => {
        const amount = parseFloat(raw);
        if (isNaN(amount) || amount <= 0) {
          return { isValid: false };
        }
        return { isValid: true, amount };
      };

      // Invalid inputs rejected
      expect(validateCreditGrant("").isValid).toBe(false);
      expect(validateCreditGrant("0").isValid).toBe(false);
      expect(validateCreditGrant("0.00").isValid).toBe(false);
      expect(validateCreditGrant("-100").isValid).toBe(false);
      expect(validateCreditGrant("-0.01").isValid).toBe(false);
      expect(validateCreditGrant("invalid").isValid).toBe(false);
      expect(validateCreditGrant("   ").isValid).toBe(false);

      // Valid positive credit grants accepted
      expect(validateCreditGrant("1").isValid).toBe(true);
      expect(validateCreditGrant("1").amount).toBe(1);
      expect(validateCreditGrant("500").isValid).toBe(true);
      expect(validateCreditGrant("500").amount).toBe(500);
      expect(validateCreditGrant("10000.50").isValid).toBe(true);
      expect(validateCreditGrant("10000.50").amount).toBe(10000.5);
    });

    test("EMPIRICAL: Budget cap input clamps to minimum 0 (rejects negative numbers and NaN)", () => {
      // Verify source code clamping expression
      expect(tenantCardSrc).toContain("min=\"0\"");
      expect(tenantCardSrc).toContain("step=\"100\"");
      expect(tenantCardSrc).toContain("placeholder=\"0 (Uncapped)\"");
      expect(tenantCardSrc).toContain("isNaN(val) || val < 0 ? 0 : val");

      // Test budget cap clamping logic
      const clampBudget = (raw: string | number): number => {
        const val = typeof raw === "string" ? parseFloat(raw) : raw;
        return isNaN(val) || val < 0 ? 0 : val;
      };

      expect(clampBudget(-100)).toBe(0);
      expect(clampBudget(-0.01)).toBe(0);
      expect(clampBudget(-9999)).toBe(0);
      expect(clampBudget("")).toBe(0);
      expect(clampBudget("bad_input")).toBe(0);

      // 0 and positive numbers pass through
      expect(clampBudget(0)).toBe(0);
      expect(clampBudget(500)).toBe(500);
      expect(clampBudget(25000)).toBe(25000);

      // Test minute calculation display logic
      const formatBudgetLabel = (budget: number, rate: number): string => {
        return budget > 0 ? `~${Math.floor(budget / rate)} mins` : "Uncapped";
      };

      expect(formatBudgetLabel(0, 5.0)).toBe("Uncapped");
      expect(formatBudgetLabel(1500, 5.0)).toBe("~300 mins");
      expect(formatBudgetLabel(2000, 4.5)).toBe("~444 mins");
    });

    test("EMPIRICAL: Uncapped postpaid integer representation (2147483647) renders as '∞ (Uncapped Postpaid)'", () => {
      // Verify source code rendering
      expect(tenantCardSrc).toContain("teleconsultBilling?.estimatedAvailableMinutes === 2147483647");
      expect(tenantCardSrc).toContain("'∞ (Uncapped Postpaid)'");

      // Test rendering logic function
      const renderAvailableMinutes = (minutes: number | null | undefined): string => {
        if (minutes === 2147483647) {
          return "∞ (Uncapped Postpaid)";
        }
        return (minutes ?? 0).toLocaleString();
      };

      expect(renderAvailableMinutes(2147483647)).toBe("∞ (Uncapped Postpaid)");
      expect(renderAvailableMinutes(0)).toBe("0");
      expect(renderAvailableMinutes(125)).toBe("125");
      expect(renderAvailableMinutes(5432)).toBe("5,432");
      expect(renderAvailableMinutes(null)).toBe("0");
      expect(renderAvailableMinutes(undefined)).toBe("0");
    });
  });

  // =========================================================================
  // Dimension 4: Network / Payload Intercept
  // =========================================================================
  describe("Network / Payload Intercept: updateTenantTeleconsultBilling & getTenantTeleconsultBilling", () => {
    test("EMPIRICAL: updateTenantTeleconsultBilling sends exact DTO fields expected by AdminUpdateTeleconsultBillingRequest on full save", async () => {
      const tenantId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      let capturedUrl = "";
      let capturedPayload: any = null;

      const mockResponse: AdminTeleconsultBillingDto = {
        tenantId,
        tenantSlug: "emerald-clinic",
        isEnabled: true,
        billingMode: "Postpaid",
        ratePerMinutePhp: 4.75,
        allocatedBudgetPhp: 5000,
        prepaidBalancePhp: 0,
        allowOverageBeyondAllocation: true,
        currentPeriodYearMonth: "2026-11",
        currentPeriodMinutesUsed: 42,
        currentPeriodBilledPhp: 199.5,
        currentPeriodOveragePhp: 0,
        estimatedAvailableMinutes: 1010,
      };

      const originalPut = apiClient.put;
      apiClient.put = mock(async (url: string, payload: any) => {
        capturedUrl = url;
        capturedPayload = payload;
        return { data: mockResponse };
      }) as any;

      try {
        const fullSavePayload: AdminUpdateTeleconsultBillingPayload = {
          isEnabled: true,
          billingMode: "Postpaid",
          ratePerMinutePhp: 4.75,
          allocatedBudgetPhp: 5000,
          allowOverageBeyondAllocation: true,
        };

        const result = await adminService.updateTenantTeleconsultBilling(tenantId, fullSavePayload);

        // Verify URL and HTTP method
        expect(capturedUrl).toBe(`/admin/tenants/${tenantId}/teleconsult-billing`);

        // Verify exact fields in payload
        expect(capturedPayload).toEqual({
          isEnabled: true,
          billingMode: "Postpaid",
          ratePerMinutePhp: 4.75,
          allocatedBudgetPhp: 5000,
          allowOverageBeyondAllocation: true,
        });

        // Verify result matches expected DTO structure
        expect(result.tenantId).toBe(tenantId);
        expect(result.ratePerMinutePhp).toBe(4.75);
        expect(result.allocatedBudgetPhp).toBe(5000);
        expect(result.allowOverageBeyondAllocation).toBe(true);
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("EMPIRICAL: updateTenantTeleconsultBilling sends only prepaidCreditGrantPhp on additive credit grant", async () => {
      const tenantId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
      let capturedUrl = "";
      let capturedPayload: any = null;

      const mockResponse: AdminTeleconsultBillingDto = {
        tenantId,
        tenantSlug: "emerald-clinic",
        isEnabled: true,
        billingMode: "Prepaid",
        ratePerMinutePhp: 5.0,
        allocatedBudgetPhp: 0,
        prepaidBalancePhp: 2500, // Balance incremented from 1500 to 2500
        allowOverageBeyondAllocation: false,
        currentPeriodYearMonth: "2026-11",
        currentPeriodMinutesUsed: 10,
        currentPeriodBilledPhp: 50,
        currentPeriodOveragePhp: 0,
        estimatedAvailableMinutes: 500,
      };

      const originalPut = apiClient.put;
      apiClient.put = mock(async (url: string, payload: any) => {
        capturedUrl = url;
        capturedPayload = payload;
        return { data: mockResponse };
      }) as any;

      try {
        const creditGrantPayload: AdminUpdateTeleconsultBillingPayload = {
          prepaidCreditGrantPhp: 1000,
        };

        const result = await adminService.updateTenantTeleconsultBilling(tenantId, creditGrantPayload);

        // Verify URL
        expect(capturedUrl).toBe(`/admin/tenants/${tenantId}/teleconsult-billing`);

        // Verify payload only contains prepaidCreditGrantPhp (additive grant)
        expect(capturedPayload).toEqual({
          prepaidCreditGrantPhp: 1000,
        });
        expect(capturedPayload.isEnabled).toBeUndefined();
        expect(capturedPayload.billingMode).toBeUndefined();
        expect(capturedPayload.ratePerMinutePhp).toBeUndefined();
        expect(capturedPayload.allocatedBudgetPhp).toBeUndefined();

        // Verify balance updated
        expect(result.prepaidBalancePhp).toBe(2500);
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("EMPIRICAL: Network rejection / error propagation from updateTenantTeleconsultBilling", async () => {
      const tenantId = "tenant-fail-id";
      const originalPut = apiClient.put;

      apiClient.put = mock(async () => {
        const error: any = new Error("Request failed with status code 403");
        error.response = { status: 403, data: { message: "Access denied: SuperAdmin required." } };
        throw error;
      }) as any;

      try {
        await expect(
          adminService.updateTenantTeleconsultBilling(tenantId, { isEnabled: true })
        ).rejects.toThrow("Request failed with status code 403");
      } finally {
        apiClient.put = originalPut;
      }
    });

    test("EMPIRICAL: getTenantTeleconsultBilling correctly calls GET /admin/tenants/{tenantId}/teleconsult-billing and maps all 13 DTO fields", async () => {
      const tenantId = "77777777-8888-9999-aaaa-bbbbbbbbbbbb";
      let capturedUrl = "";

      const expectedDto: AdminTeleconsultBillingDto = {
        tenantId,
        tenantSlug: "apollo-health",
        isEnabled: false,
        billingMode: "Prepaid",
        ratePerMinutePhp: 5.0,
        allocatedBudgetPhp: 0,
        prepaidBalancePhp: 750,
        allowOverageBeyondAllocation: true,
        currentPeriodYearMonth: "2026-11",
        currentPeriodMinutesUsed: 0,
        currentPeriodBilledPhp: 0,
        currentPeriodOveragePhp: 0,
        estimatedAvailableMinutes: 150,
      };

      const originalGet = apiClient.get;
      apiClient.get = mock(async (url: string) => {
        capturedUrl = url;
        return { data: expectedDto };
      }) as any;

      try {
        const data = await adminService.getTenantTeleconsultBilling(tenantId);
        expect(capturedUrl).toBe(`/admin/tenants/${tenantId}/teleconsult-billing`);
        expect(data).toEqual(expectedDto);
        expect(Object.keys(data).length).toBe(13);
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  // =========================================================================
  // Dimension 5: Strict Design Token Audit
  // =========================================================================
  describe("Strict Design Token Audit: Zero Raw Hex & RGBA Literals", () => {
    test("EMPIRICAL: All modified and newly created admin-web files contain zero raw hex colors and zero rgba literals", () => {
      const filesToAudit = [
        "src/components/TenantEntitlementsCard.tsx",
        "src/services/admin.service.ts",
        "tests/adminPlansAndEntitlements.test.ts",
      ];

      // Hex regex: e.g. #0D6963, #fff, #112233
      const hexPattern = new RegExp("#[0-9a-fA-F]{3,8}\\b", "g");
      // RGBA regex: e.g. rgba(0, 0, 0, 0.5)
      const rgbaPattern = /rgba?\s*\(/i;

      for (const relFile of filesToAudit) {
        const fullPath = path.resolve(__dirname, "..", relFile);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, "utf-8");

        // Strip comments to avoid false positives in comment descriptions
        const stripped = content
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/(^|[^:])\/\/.*$/gm, "$1");

        const hexMatches = stripped.match(hexPattern);
        expect(hexMatches).toBeNull();

        const rgbaMatch = rgbaPattern.test(stripped);
        expect(rgbaMatch).toBe(false);
      }
    });
  });
});
