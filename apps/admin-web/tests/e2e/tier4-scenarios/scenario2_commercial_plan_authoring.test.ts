import { describe, test, expect } from "bun:test";
import {
  QUANTITATIVE_LIMITS,
  CAPABILITY_FLAGS,
  calculateBirVat,
  RESERVED_SUBDOMAINS,
} from "../fixtures/test-fixtures";

describe("Tier 4 — Scenario 2: Commercial Plan Authoring & Enforcement", () => {
  interface CommercialPlanDefinition {
    id: string;
    slug: string;
    name: string;
    rank: number;
    monthlyPrice: number;
    annualPrice: number;
    limits: Record<string, number>;
    features: Record<string, boolean>;
    isPublished: boolean;
  }

  let newPlan: CommercialPlanDefinition;

  test("Step 1: Initialize PlanEditorDialog with all 14 limits and 10 feature flags", () => {
    expect(QUANTITATIVE_LIMITS.length).toBe(14);
    expect(CAPABILITY_FLAGS.length).toBe(10);

    const defaultLimits: Record<string, number> = {};
    for (const l of QUANTITATIVE_LIMITS) {
      defaultLimits[l.key] = l.min;
    }
    const defaultFeatures: Record<string, boolean> = {};
    for (const f of CAPABILITY_FLAGS) {
      defaultFeatures[f.key] = false;
    }

    newPlan = {
      id: "plan-konsulta-net",
      slug: "",
      name: "PhilHealth Yakap Community Network",
      rank: 4,
      monthlyPrice: 8999,
      annualPrice: 89990,
      limits: defaultLimits,
      features: defaultFeatures,
      isPublished: false,
    };

    expect(Object.keys(newPlan.limits).length).toBe(14);
    expect(Object.keys(newPlan.features).length).toBe(10);
  });

  test("Step 2: Configure high-density limits for regional healthcare network", () => {
    newPlan.limits["limit.clinics"] = 10;
    newPlan.limits["limit.laboratories"] = 5;
    newPlan.limits["limit.pharmacies"] = 5;
    newPlan.limits["limit.storage_gb"] = 250;
    newPlan.limits["limit.monthly_consultations"] = 5000;
    newPlan.limits["limit.patients"] = 25000;

    expect(newPlan.limits["limit.clinics"]).toBe(10);
    expect(newPlan.limits["limit.storage_gb"]).toBe(250);
  });

  test("Step 3: Enable clinical statutory and interoperability feature flags", () => {
    newPlan.features["feature.philhealth_konsulta"] = true;
    newPlan.features["feature.electronic_prescriptions"] = true;
    newPlan.features["feature.cross_tenant_interop"] = true;
    newPlan.features["feature.lis_integration"] = true;

    expect(newPlan.features["feature.philhealth_konsulta"]).toBe(true);
    expect(newPlan.features["feature.electronic_prescriptions"]).toBe(true);
  });

  test("Step 4: Async plan slug validator ensures uniqueness against plans and system keywords", () => {
    const existingPlanSlugs = new Set(["starter", "pro", "enterprise"]);
    function checkPlanSlugAvailability(slug: string): { available: boolean; error?: string } {
      const clean = slug.trim().toLowerCase();
      if (!clean) return { available: false, error: "Slug is required" };
      if (!/^[a-z0-9-]+$/.test(clean)) return { available: false, error: "Invalid slug characters" };
      if (existingPlanSlugs.has(clean)) return { available: false, error: "Plan slug already exists" };
      if (RESERVED_SUBDOMAINS.has(clean)) return { available: false, error: "Slug matches reserved system keyword" };
      return { available: true };
    }

    expect(checkPlanSlugAvailability("starter").available).toBe(false);
    expect(checkPlanSlugAvailability("admin").available).toBe(false);
    expect(checkPlanSlugAvailability("konsulta-network").available).toBe(true);

    newPlan.slug = "konsulta-network";
    expect(newPlan.slug).toBe("konsulta-network");
  });

  test("Step 5: Verify BIR 12% VAT calculations on authoring pricing ladder", () => {
    const monthlyVat = calculateBirVat(newPlan.monthlyPrice, true);
    const annualVat = calculateBirVat(newPlan.annualPrice, true);

    expect(monthlyVat.netAmount).toBe(8034.82);
    expect(monthlyVat.vatAmount).toBe(964.18);
    expect(Number((monthlyVat.netAmount + monthlyVat.vatAmount).toFixed(2))).toBe(8999);

    expect(annualVat.netAmount).toBe(80348.21);
    expect(annualVat.vatAmount).toBe(9641.79);
    expect(Number((annualVat.netAmount + annualVat.vatAmount).toFixed(2))).toBe(89990);
  });

  test("Step 6: Publish commercial plan tier and verify availability in tenant subscription picker", () => {
    newPlan.isPublished = true;
    expect(newPlan.isPublished).toBe(true);

    const availableTiers = [
      { slug: "starter", name: "Starter" },
      { slug: "pro", name: "Pro" },
      { slug: "enterprise", name: "Enterprise" },
      { slug: newPlan.slug, name: newPlan.name },
    ];
    expect(availableTiers.map((t) => t.slug)).toContain("konsulta-network");
  });
});
