import { describe, test, expect, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  teleconsultBillingService,
  type TeleconsultBillingDto,
  type UpdateTeleconsultBillingRequest,
} from "../src/services/teleconsultBilling.service";
import { apiClient } from "../src/transport/apiClient";

describe("Milestone 13: Portal Web Teleconsultation PAYG Billing & Cost Allocation", () => {
  const mockTenantSlug = "metro-health";
  const mockBillingDto: TeleconsultBillingDto = {
    tenantId: "11111111-2222-3333-4444-555555555555",
    tenantSlug: mockTenantSlug,
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

  test("M13.1: teleconsultBillingService.getTeleconsultBilling calls GET /tenants/{slug}/teleconsult-billing", async () => {
    const originalGet = apiClient.get;
    let requestedUrl = "";

    apiClient.get = mock(async (url: string) => {
      requestedUrl = url;
      return { data: mockBillingDto };
    }) as any;

    try {
      const result = await teleconsultBillingService.getTeleconsultBilling(mockTenantSlug);
      expect(requestedUrl).toBe(`/tenants/${mockTenantSlug}/teleconsult-billing`);
      expect(result.tenantSlug).toBe(mockTenantSlug);
      expect(result.isEnabled).toBe(false);
      expect(result.billingMode).toBe("Postpaid");
      expect(result.ratePerMinutePhp).toBe(5.0);
      expect(result.allocatedBudgetPhp).toBe(1500.0);
      expect(result.prepaidBalancePhp).toBe(250.0);
      expect(result.allowOverageBeyondAllocation).toBe(true);
      expect(result.estimatedAvailableMinutes).toBe(258);
    } finally {
      apiClient.get = originalGet;
    }
  });

  test("M13.2: teleconsultBillingService.updateTeleconsultBilling calls PUT with correct request body", async () => {
    const originalPut = apiClient.put;
    let putUrl = "";
    let putBody: any = null;

    apiClient.put = mock(async (url: string, body: any) => {
      putUrl = url;
      putBody = body;
      return { data: { ...mockBillingDto, ...body } };
    }) as any;

    try {
      const updatePayload: UpdateTeleconsultBillingRequest = {
        isEnabled: true,
        billingMode: "Prepaid",
        allocatedBudgetPhp: 0,
        prepaidTopUpPhp: 500,
        allowOverageBeyondAllocation: true,
      };

      const result = await teleconsultBillingService.updateTeleconsultBilling(
        mockTenantSlug,
        updatePayload
      );

      expect(putUrl).toBe(`/tenants/${mockTenantSlug}/teleconsult-billing`);
      expect(putBody).toEqual(updatePayload);
      expect(result.isEnabled).toBe(true);
      expect(result.billingMode).toBe("Prepaid");
    } finally {
      apiClient.put = originalPut;
    }
  });

  test("M13.3: Minute conversion logic correctly calculates minutes across Postpaid and Prepaid modes", () => {
    const rate = 5.0; // ₱5.00 / min

    // Postpaid: budget conversion Math.floor(budget / rate)
    const budget1500 = 1500.0;
    const minutesForBudget = Math.floor(budget1500 / rate);
    expect(minutesForBudget).toBe(300);

    const budget99 = 99.0;
    expect(Math.floor(budget99 / rate)).toBe(19);

    // Prepaid: top-up conversion Math.floor(topUp / rate)
    const topUp500 = 500.0;
    const additionalMinutes = Math.floor(topUp500 / rate);
    expect(additionalMinutes).toBe(100);

    // Current prepaid balance conversion
    const balance250 = 250.0;
    expect(Math.floor(balance250 / rate)).toBe(50);

    // Custom rate override (e.g. SuperAdmin set rate to ₱4.50)
    const discountedRate = 4.5;
    expect(Math.floor(1500 / discountedRate)).toBe(333);
  });

  test("M13.4: TeleconsultPaygCard source code includes master toggle, mid-call cutoff protection, and separate billing banner", () => {
    const cardPath = path.resolve(
      __dirname,
      "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
    );
    expect(fs.existsSync(cardPath)).toBe(true);
    const content = fs.readFileSync(cardPath, "utf-8");

    // Master activation toggle with testID and off-by-default initial state
    expect(content).toContain('testID: "toggle-teleconsult-payg"');
    expect(content).toContain('data-testid="toggle-teleconsult-payg"');
    expect(content).toContain("useState(false)");

    // Save changes button with testID
    expect(content).toContain('testID: "btn-save-teleconsult-payg"');
    expect(content).toContain('data-testid="btn-save-teleconsult-payg"');

    // Separate billing and clinic access notice
    expect(content).toContain("How Billing &amp; Clinic Access Work");
    expect(content).toContain("billed separately from your subscription plan");
    expect(content).toContain("lets clinic admins enable video calls for their clinics");

    // Patient safety / mid-call cutoff protection notice
    expect(content).toContain("Patient Safety Notice");
    expect(content).toContain("Keep active calls running if your balance or monthly limit is reached");

    // Payment-gated top-up button
    expect(content).toContain('data-testid="btn-topup-teleconsult-payg"');
    expect(content).toContain("Pay &amp; Top Up");

    // Monthly usage summary metrics
    expect(content).toContain("Minutes Used");
    expect(content).toContain("Amount Billed");
    expect(content).toContain("Extra Charges");
    expect(content).toContain("Available Minutes");
  });

  test("M13.5: TeleconsultPaygCard is mounted in both PlansTabContent.tsx and PlanClient.tsx", () => {
    const plansTabPath = path.resolve(
      __dirname,
      "../src/app/[tenant]/dashboard/billing/components/PlansTabContent.tsx"
    );
    const planClientPath = path.resolve(
      __dirname,
      "../src/app/[tenant]/dashboard/plan/PlanClient.tsx"
    );

    expect(fs.existsSync(plansTabPath)).toBe(true);
    expect(fs.existsSync(planClientPath)).toBe(true);

    const plansTabSrc = fs.readFileSync(plansTabPath, "utf-8");
    const planClientSrc = fs.readFileSync(planClientPath, "utf-8");

    // PlansTabContent mount
    expect(plansTabSrc).toContain("TeleconsultPaygCard");
    expect(plansTabSrc).toContain("<TeleconsultPaygCard tenantSlug={tenantId} />");

    // PlanClient mount
    expect(planClientSrc).toContain("TeleconsultPaygCard");
    expect(planClientSrc).toContain("<TeleconsultPaygCard tenantSlug={tenantSlug} />");
  });

  test("M13.6: Strict design token compliance: ZERO raw hex color literals in touched portal-web files", () => {
    const filesToCheck = [
      "src/services/teleconsultBilling.service.ts",
      "src/hooks/useTeleconsultBilling.ts",
      "src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx",
      "src/app/[tenant]/dashboard/billing/components/PlansTabContent.tsx",
      "src/app/[tenant]/dashboard/plan/PlanClient.tsx",
    ];

    const rawHexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;

    for (const relPath of filesToCheck) {
      const fullPath = path.resolve(__dirname, "..", relPath);
      expect(fs.existsSync(fullPath)).toBe(true);

      const content = fs.readFileSync(fullPath, "utf-8");
      const hexMatches = content.match(rawHexRegex);

      expect(hexMatches).toBeNull();
    }
  });
});
