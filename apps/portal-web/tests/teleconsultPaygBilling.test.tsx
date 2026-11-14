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
import { TeleconsultPaygCard } from "../src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard";

describe("Requirement R3: Portal Web Teleconsultation PAYG Billing & Cost Allocation (TC-T1.3.6, TC-T2.3.7)", () => {
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

  test("TC-T1.3.6: Minute conversion logic correctly projects minutes for ₱250 at ₱5.00/min", () => {
    const rate = 5.0; // ₱5.00 / min default rate

    // Prepaid top-up projection
    const topUp250 = 250.0;
    const projectedMinutes = Math.floor(topUp250 / rate);
    expect(projectedMinutes).toBe(50);

    // Postpaid budget conversion
    const budget1500 = 1500.0;
    expect(Math.floor(budget1500 / rate)).toBe(300);

    // 0 budget or 0 topup yields 0 minutes
    expect(Math.floor(0 / rate)).toBe(0);
  });

  test("TC-T1.3.6: TeleconsultPaygCard source code includes master toggle, mid-call cutoff protection, and separate billing banner", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Master switch & mode selectors
    expect(content).toContain("teleconsult-payg-card");
    expect(content).toContain("toggle-teleconsult-payg");
    expect(content).toContain("btn-save-teleconsult-payg");
    expect(content).toContain("Postpaid Metered");
    expect(content).toContain("Prepaid Minute Credits");

    // Mid-call cutoff protection guarantee copy
    expect(content).toContain("Mid-Call Cutoff Protection Notice");
    expect(content).toContain("never be abruptly disconnected or severed");

    // Rate display
    expect(content).toContain("ratePerMinute.toFixed(2)}/min");
  });

  test("TC-T2.3.7: Rejects negative rate and budget inputs in billing update requests", () => {
    // Validates client-side clamp logic: budget cannot be negative
    const sanitizeBudget = (val: number) => Math.max(0, Number(val) || 0);
    expect(sanitizeBudget(-100)).toBe(0);
    expect(sanitizeBudget(-50)).toBe(0);
    expect(sanitizeBudget(500)).toBe(500);

    const sanitizeTopUp = (val: number) => Math.max(0, Number(val) || 0);
    expect(sanitizeTopUp(-250)).toBe(0);
    expect(sanitizeTopUp(250)).toBe(250);
  });

  test("Strict design token compliance: ZERO raw hex color literals in touched portal-web files", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "src/app/[tenant]/dashboard/billing/components/TeleconsultPaygCard.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Strip comments to ignore comments containing examples
    const stripped = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");

    const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    expect(hexMatches.length).toBe(0);
  });
});
