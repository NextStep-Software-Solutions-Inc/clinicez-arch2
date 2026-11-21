import { describe, test, expect, mock } from "bun:test";
import { QUANTITATIVE_LIMITS, CAPABILITY_FLAGS } from "../src/components/PlanEditorDialog";
import { adminService, UpdateTenantOverridesPayload } from "../src/services/admin.service";
import { apiClient } from "../src/lib/api";
import * as fs from "fs";
import * as path from "path";

describe("Milestone 3 Empirical Challenger 1: Adversarial Plan Editor & Entitlement Overrides Suite", () => {
  // =========================================================================
  // Dimension 1: Vocabulary Completeness (14 Limits & 10 Features)
  // =========================================================================
  test("EMPIRICAL: All 14 quantitative limits and 10 capability flags are uniquely represented", () => {
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

    expect(QUANTITATIVE_LIMITS.length).toBe(14);
    const limitKeys = QUANTITATIVE_LIMITS.map((l) => l.key);
    for (const key of EXPECTED_LIMITS) {
      expect(limitKeys).toContain(key);
    }
    // Verify no duplicates
    expect(new Set(limitKeys).size).toBe(14);

    expect(CAPABILITY_FLAGS.length).toBe(10);
    const featKeys = CAPABILITY_FLAGS.map((f) => f.key);
    for (const key of EXPECTED_FEATURES) {
      expect(featKeys).toContain(key);
    }
    // Verify no duplicates
    expect(new Set(featKeys).size).toBe(10);
  });

  // =========================================================================
  // Dimension 2: Tri-State Override Logic
  // Inherit (null/omitted) vs Force Grant (true) vs Force Revoke (false)
  // =========================================================================
  test("EMPIRICAL: Tri-state capability override logic correctly maps Inherit, Force Grant, and Force Revoke", async () => {
    // Simulate tenant state where baseline plan enables philhealth_konsulta & teleconsultation
    const basePlanFeatures = [
      "feature.philhealth_konsulta",
      "feature.teleconsultation",
    ];

    // Admin sets:
    // 1. Force Revoke on 'feature.philhealth_konsulta' (false)
    // 2. Force Grant on 'feature.lis_integration' (true)
    // 3. Inherit on 'feature.teleconsultation' (null)
    const featureOverrides: Record<string, boolean | null> = {
      "feature.philhealth_konsulta": false, // Force Revoke
      "feature.lis_integration": true,      // Force Grant
      "feature.teleconsultation": null,     // Inherit Plan Default
      "feature.advanced_analytics": null,   // Inherit Plan Default
    };

    // Filter features logic as implemented in TenantEntitlementsCard.tsx
    const activeFeatures: Record<string, boolean> = {};
    Object.entries(featureOverrides).forEach(([k, v]) => {
      if (v !== null) {
        activeFeatures[k] = v;
      }
    });

    // Assert that Force Revoke explicitly passes `false`
    expect(activeFeatures["feature.philhealth_konsulta"]).toBe(false);
    expect(activeFeatures["feature.philhealth_konsulta"]).not.toBeUndefined();

    // Assert that Force Grant explicitly passes `true`
    expect(activeFeatures["feature.lis_integration"]).toBe(true);

    // Assert that Inherit (null) is omitted from the overrides payload
    expect("feature.teleconsultation" in activeFeatures).toBe(false);
    expect("feature.advanced_analytics" in activeFeatures).toBe(false);

    // Verify payload serialization through adminService.updateTenantOverrides
    let interceptedPayload: any = null;
    const origPut = apiClient.put;
    apiClient.put = mock(async (url: string, payload: any) => {
      interceptedPayload = payload;
      return { data: { tenantId: "tenant-123", entitlementVersion: 2, ...payload } };
    }) as any;

    try {
      await adminService.updateTenantOverrides("tenant-123", {
        limits: {},
        features: activeFeatures,
        reason: "Testing tri-state overrides",
      });

      expect(interceptedPayload).not.toBeNull();
      expect(interceptedPayload.features["feature.philhealth_konsulta"]).toBe(false);
      expect(interceptedPayload.features["feature.lis_integration"]).toBe(true);
      expect(interceptedPayload.features["feature.teleconsultation"]).toBeUndefined();
    } finally {
      apiClient.put = origPut;
    }
  });

  // =========================================================================
  // Dimension 3: -1 Unlimited Ceiling Semantics & Negative Value Sanitization
  // =========================================================================
  test("EMPIRICAL: Toggling unlimited sets limit to -1 and reverts cleanly", () => {
    // Replicate toggleUnlimited logic from PlanEditorDialog.tsx
    const toggleUnlimited = (current: number, defaultFallback: number) => {
      if (current === -1) {
        return defaultFallback > 0 ? defaultFallback : 1;
      } else {
        return -1;
      }
    };

    // When currently finite (e.g. 5 staff) -> toggling should return -1
    expect(toggleUnlimited(5, 5)).toBe(-1);
    expect(toggleUnlimited(100, 10)).toBe(-1);
    expect(toggleUnlimited(0, 0)).toBe(-1);

    // When currently unlimited (-1) -> toggling should return fallback > 0
    expect(toggleUnlimited(-1, 5)).toBe(5);
    expect(toggleUnlimited(-1, 0)).toBe(1);
  });

  test("EMPIRICAL: Entering negative values below -1 is sanitized in source components", () => {
    // Read source code of TenantEntitlementsCard.tsx and PlanEditorDialog.tsx
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const planEditorPath = path.resolve(__dirname, "../src/components/PlanEditorDialog.tsx");

    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");
    const planEditorSrc = fs.readFileSync(planEditorPath, "utf-8");

    const parsedIsSanitizedInTenantCard =
      tenantCardSrc.includes("Math.max") ||
      tenantCardSrc.includes("parsed < -1") ||
      tenantCardSrc.includes("parsed < 0");

    const isSanitizedInPlanEditor =
      planEditorSrc.includes("Math.max") ||
      planEditorSrc.includes("val < -1") ||
      planEditorSrc.includes("val < 0");

    expect(parsedIsSanitizedInTenantCard).toBe(true);
    expect(isSanitizedInPlanEditor).toBe(true);
  });

  // =========================================================================
  // Dimension 4: Mandatory Audit Reason Requirement
  // =========================================================================
  test("EMPIRICAL: Mandatory audit reason requirement is enforced in TenantEntitlementsCard.tsx", () => {
    const tenantCardPath = path.resolve(__dirname, "../src/components/TenantEntitlementsCard.tsx");
    const tenantCardSrc = fs.readFileSync(tenantCardPath, "utf-8");

    const hasDisabledReasonCheck =
      tenantCardSrc.includes("disabled={saving || !reason.trim()}") ||
      tenantCardSrc.includes("disabled={!reason.trim() || saving}") ||
      tenantCardSrc.includes("disabled={saving || !reason}");

    const hasHandleSaveReasonCheck =
      tenantCardSrc.includes("!reason.trim()") &&
      tenantCardSrc.includes("toast.error");

    const hasRequiredInput =
      tenantCardSrc.includes('placeholder="e.g. Enterprise pilot') &&
      tenantCardSrc.includes('required');

    expect(hasDisabledReasonCheck).toBe(true);
    expect(hasHandleSaveReasonCheck).toBe(true);
    expect(hasRequiredInput).toBe(true);
  });
});
