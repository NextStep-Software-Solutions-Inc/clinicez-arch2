import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Navigation, getNavigationAuthHrefs } from "../src/components/Navigation";
import {
  PricingClient,
  buildPlanSelectionHref,
  isEnterprisePlan,
} from "../src/app/pricing/_components/PricingClient";
import type { BillingPlan } from "../src/services/billing.service";

const SAMPLE_PLANS: BillingPlan[] = [
  {
    id: "starter-id",
    key: "starter",
    slug: "starter",
    name: "Starter Clinic",
    description: "Essential outpatient queue and EMR for solo clinics.",
    priceMonthly: 2900,
    priceAnnually: 29000,
    features: ["Outpatient EMR", "Digital Prescriptions"],
    highlighted: false,
    requiresCheckout: true,
    rank: 1,
    limits: {},
    enabledFeatures: [],
  },
  {
    id: "pro-id",
    slug: "pro-network",
    name: "Pro Network",
    description: "Multi-branch clinical, lab, and pharmacy workflows.",
    priceMonthly: 6900,
    priceAnnually: 69000,
    features: ["Multi-branch Hub", "PhilHealth YAKAP"],
    highlighted: true,
    requiresCheckout: true,
    rank: 2,
    limits: {},
    enabledFeatures: [],
  },
  {
    id: "enterprise",
    slug: "enterprise",
    name: "Enterprise",
    description: "Hospital systems and custom SLA.",
    priceMonthly: "Custom",
    priceAnnually: "Custom",
    features: ["Dedicated Edge Cell", "Custom HL7/FHIR"],
    highlighted: false,
    requiresCheckout: false,
    rank: 3,
    limits: {},
    enabledFeatures: [],
  },
];

describe("Navigation and PricingClient portal CTA routing", () => {
  const savedBaseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN;
  const savedPortalUrl = process.env.NEXT_PUBLIC_PORTAL_URL;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_DOMAIN;
    delete process.env.NEXT_PUBLIC_PORTAL_URL;
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    if (savedBaseDomain === undefined) {
      delete process.env.NEXT_PUBLIC_BASE_DOMAIN;
    } else {
      process.env.NEXT_PUBLIC_BASE_DOMAIN = savedBaseDomain;
    }
    if (savedPortalUrl === undefined) {
      delete process.env.NEXT_PUBLIC_PORTAL_URL;
    } else {
      process.env.NEXT_PUBLIC_PORTAL_URL = savedPortalUrl;
    }
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it("builds Navigation Log in and Get Started links pointing to portal.{domain} across root, www, and home hosts", () => {
    for (const host of ["medhub.health", "www.medhub.health", "home.medhub.health"]) {
      const { loginHref, getStartedHref } = getNavigationAuthHrefs(host);
      expect(loginHref).toBe("https://portal.medhub.health/sign-in");
      expect(getStartedHref).toBe("https://portal.medhub.health/sign-up");
    }

    const localHrefs = getNavigationAuthHrefs("localhost");
    expect(localHrefs.loginHref).toBe("http://localhost:3000/sign-in");
    expect(localHrefs.getStartedHref).toBe("http://localhost:3000/sign-up");
  });

  it("renders Navigation markup with portal Log in and Get Started anchors and no Clerk controls", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "medhub.health";
    const html = renderToStaticMarkup(React.createElement(Navigation));

    expect(html).toContain('href="https://portal.medhub.health/sign-in"');
    expect(html).toContain('href="https://portal.medhub.health/sign-up"');
    expect(html).toContain("Log in");
    expect(html).toContain("Get Started");
    expect(html).not.toContain("/sync-auth");
    expect(html).not.toContain("Dashboard");
  });

  it("builds PricingClient plan selection URLs with plan, billing, and encoded /tenants/register redirect_url", () => {
    const monthlyHref = buildPlanSelectionHref(
      SAMPLE_PLANS[0],
      false,
      "www.medhub.health"
    );
    const parsedMonthly = new URL(monthlyHref);
    expect(parsedMonthly.origin).toBe("https://portal.medhub.health");
    expect(parsedMonthly.pathname).toBe("/sign-up");
    expect(parsedMonthly.searchParams.get("plan")).toBe("starter");
    expect(parsedMonthly.searchParams.get("billing")).toBe("monthly");
    expect(parsedMonthly.searchParams.get("redirect_url")).toBe(
      "/tenants/register?plan=starter&billing=monthly"
    );

    const annualHref = buildPlanSelectionHref(
      SAMPLE_PLANS[1],
      true,
      "home.medhub.health"
    );
    const parsedAnnual = new URL(annualHref);
    expect(parsedAnnual.origin).toBe("https://portal.medhub.health");
    expect(parsedAnnual.pathname).toBe("/sign-up");
    expect(parsedAnnual.searchParams.get("plan")).toBe("pro-network");
    expect(parsedAnnual.searchParams.get("billing")).toBe("annual");
    expect(parsedAnnual.searchParams.get("redirect_url")).toBe(
      "/tenants/register?plan=pro-network&billing=annual"
    );
  });

  it("keeps Enterprise plan CTA pointed to local /contact-us", () => {
    expect(isEnterprisePlan(SAMPLE_PLANS[2])).toBe(true);
    expect(buildPlanSelectionHref(SAMPLE_PLANS[2], false, "medhub.health")).toBe(
      "/contact-us"
    );
    expect(buildPlanSelectionHref(SAMPLE_PLANS[2], true, "home.medhub.health")).toBe(
      "/contact-us"
    );
  });

  it("renders PricingClient cards with portal.{domain} sign-up links and /contact-us for enterprise", () => {
    process.env.NEXT_PUBLIC_BASE_DOMAIN = "medhub.health";
    const html = renderToStaticMarkup(
      React.createElement(PricingClient, {
        initialPlans: SAMPLE_PLANS,
        initialPublicConfig: { trialDays: 14, defaultBillingCadence: "annually" },
      })
    );

    expect(html).toContain(
      'href="https://portal.medhub.health/sign-up?plan=starter&amp;billing=annual&amp;redirect_url=%2Ftenants%2Fregister%3Fplan%3Dstarter%26billing%3Dannual"'
    );
    expect(html).toContain(
      'href="https://portal.medhub.health/sign-up?plan=pro-network&amp;billing=annual&amp;redirect_url=%2Ftenants%2Fregister%3Fplan%3Dpro-network%26billing%3Dannual"'
    );
    expect(html).toContain('href="/contact-us"');
    expect(html).toContain("Contact Sales");
  });
});
