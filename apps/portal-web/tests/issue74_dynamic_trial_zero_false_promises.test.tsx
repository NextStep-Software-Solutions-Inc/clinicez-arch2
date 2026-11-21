import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";

/**
 * Issue #74 Test Suite: Dynamic Free-Trial Duration & Zero False Promises (UI Tests)
 *
 * Requirements Covered:
 * - R1: Dynamic free-trial duration (e.g. 30, 7) rendered on /sign-up
 * - R1: Zero false promises: when trialDays is 0, null, undefined, or fails to load:
 *       - SignUpTrialBadge renders null (zero "14" or "Free Trial" text)
 *       - CustomSignUpForm hides free trial promise in subtitle
 *       - WorkspaceOverviewClient renders "Setup Mode" / "Evaluation Period", never "14-Day Free Trial"
 *       - TrialCountdownBanner returns null (hides banner) or renders expired without hardcoded 14
 * - R1: Loading state: accessible @clinicez/design-tokens loading skeleton while loading without SSR data
 * - R1: Viewport parity: SignUpTrialBadge rendered on both desktop and mobile (< lg)
 * - R1: PricingClient reads dynamic cadence from /billing/public-config
 * - R1: Admin Settings invalidates SWR cache for /billing/public-config and /billing/payment-config
 */

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(WORKSPACE_ROOT, "src");

describe("Issue #74: Dynamic Free-Trial Duration & Zero False Promises", () => {
  describe("Tier 1: SignUpTrialBadge Dynamic Duration & Skeleton", () => {
    test("T1.1: Renders '30-Day Free Trial' when dynamic trialDays = 30", async () => {
      const badgeModule = await import("../src/app/sign-up/_components/SignUpTrialBadge");
      const SignUpTrialBadge = badgeModule.SignUpTrialBadge;

      const html = renderToString(
        <SignUpTrialBadge initialConfig={{ trialDays: 30, defaultBillingCadence: "monthly" }} />
      );

      expect(html).toContain("30-Day Free Trial");
      expect(html).toContain('data-testid="signup-trial-badge"');
      expect(html).toContain("text-primary");
      expect(html).not.toContain("14-Day Free Trial");
    });

    test("T1.2: Renders '7-Day Free Trial' when dynamic trialDays = 7", async () => {
      const badgeModule = await import("../src/app/sign-up/_components/SignUpTrialBadge");
      const SignUpTrialBadge = badgeModule.SignUpTrialBadge;

      const html = renderToString(
        <SignUpTrialBadge initialConfig={{ trialDays: 7, defaultBillingCadence: "monthly" }} />
      );

      expect(html).toContain("7-Day Free Trial");
      expect(html).not.toContain("14-Day Free Trial");
      expect(html).not.toContain("30-Day Free Trial");
    });

    test("T1.3: Renders accessible @clinicez/design-tokens loading skeleton when loading without pre-hydrated data", async () => {
      const badgeModule = await import("../src/app/sign-up/_components/SignUpTrialBadge");
      const SignUpTrialBadge = badgeModule.SignUpTrialBadge;

      // Rendering without initialConfig simulates loading state before SWR resolves
      const html = renderToString(<SignUpTrialBadge />);

      // Must render an accessible skeleton placeholder using semantic design tokens
      expect(html).toMatch(/animate-pulse/);
      expect(html).toMatch(/bg-muted/);
      expect(html).toMatch(/rounded-full/);
      expect(html).toMatch(/role="status"|aria-label="Loading trial details"/);
      // Must NOT render any false trial promises while loading
      expect(html).not.toContain("14-Day Free Trial");
      expect(html).not.toContain("Free Trial");
    });
  });

  describe("Tier 2: Zero False Promises Strict Boundaries (trialDays <= 0, null, undefined)", () => {
    test("T2.1: SignUpTrialBadge returns null (empty) when trialDays = 0", async () => {
      const badgeModule = await import("../src/app/sign-up/_components/SignUpTrialBadge");
      const SignUpTrialBadge = badgeModule.SignUpTrialBadge;

      const html = renderToString(
        <SignUpTrialBadge initialConfig={{ trialDays: 0, defaultBillingCadence: "monthly" }} />
      );

      expect(html).toBe("");
      expect(html).not.toContain("Free Trial");
      expect(html).not.toContain("0-Day");
      expect(html).not.toContain("14");
    });

    test("T2.2: SignUpTrialBadge returns null when trialDays is negative (boundary edge case)", async () => {
      const badgeModule = await import("../src/app/sign-up/_components/SignUpTrialBadge");
      const SignUpTrialBadge = badgeModule.SignUpTrialBadge;

      const html = renderToString(
        <SignUpTrialBadge initialConfig={{ trialDays: -1, defaultBillingCadence: "monthly" }} />
      );

      expect(html).toBe("");
      expect(html).not.toContain("Free Trial");
    });

    test("T2.3: SignUpTrialBadge source code contains ZERO hardcoded fallback ?? 14", () => {
      const filePath = path.join(SRC_DIR, "app", "sign-up", "_components", "SignUpTrialBadge.tsx");
      const content = fs.readFileSync(filePath, "utf-8");

      expect(content).not.toContain("?? 14");
      expect(content).not.toContain("|| 14");
      expect(content).not.toContain("usePaymentConfig"); // Must use usePublicConfig
      expect(content).toContain("usePublicConfig");
    });
  });

  describe("Tier 2: CustomSignUpForm Subtitle Zero False Promises", () => {
    test("T2.4: CustomSignUpForm subtitle is dynamic based on initialTrialDays", () => {
      const formPath = path.join(SRC_DIR, "app", "sign-up", "_components", "CustomSignUpForm.tsx");
      const content = fs.readFileSync(formPath, "utf-8");

      // Verify the form component accepts initialTrialDays prop
      expect(content).toMatch(/initialTrialDays/);

      // Verify the static subtitle string "Start your free trial and access Clinic EZ workspaces." has been replaced
      expect(content).not.toContain('Start your free trial and access Clinic EZ workspaces.');

      // Verify dynamic interpolation when trialDays > 0 and generic account creation when trialDays <= 0
      expect(content).toMatch(/trialDays\s*&&\s*trialDays\s*>\s*0|initialTrialDays\s*&&\s*initialTrialDays\s*>\s*0/);
      expect(content).toContain("Create an account to access Clinic EZ workspaces.");
    });
  });

  describe("Tier 3: Viewport Parity & Server Pre-Hydration on /sign-up", () => {
    test("T3.1: /sign-up/[[...sign-up]]/page.tsx enforces dynamic = 'force-dynamic' and cache: 'no-store'", () => {
      const pagePath = path.join(SRC_DIR, "app", "sign-up", "[[...sign-up]]", "page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      expect(content).toContain('export const dynamic = "force-dynamic"');
      expect(content).toContain('/billing/public-config');
      expect(content).toMatch(/cache:\s*["']no-store["']/);
    });

    test("T3.2: /sign-up page renders SignUpTrialBadge on BOTH desktop and mobile (< lg) viewports", () => {
      const pagePath = path.join(SRC_DIR, "app", "sign-up", "[[...sign-up]]", "page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      // Count occurrences of <SignUpTrialBadge
      const matches = content.match(/<SignUpTrialBadge/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(
        2,
        "SignUpTrialBadge must be rendered at least twice: once for desktop (lg:flex) and once for mobile (< lg / lg:hidden)"
      );

      // Verify mobile container renders badge
      expect(content).toMatch(/lg:hidden[\s\S]*?<SignUpTrialBadge/);
    });
  });

  describe("Tier 3 & Tier 4: Workspace Dashboard & Countdown Banner Zero False Promises", () => {
    test("T3.3: WorkspaceOverviewClient removes hardcoded || 14 and never displays 14-Day Free Trial on 0 trial days", () => {
      const overviewPath = path.join(
        SRC_DIR,
        "app",
        "[tenant]",
        "dashboard",
        "overview",
        "WorkspaceOverviewClient.tsx"
      );
      const content = fs.readFileSync(overviewPath, "utf-8");

      expect(content).not.toContain("|| 14");
      // Must have conditional for trialDays > 0 vs fallback title
      expect(content).toMatch(/trialDays\s*&&\s*trialDays\s*>\s*0/);
    });

    test("T3.4: TrialCountdownBanner removes hardcoded || 14 and hides completely when trialDays <= 0", () => {
      const bannerPath = path.join(
        SRC_DIR,
        "components",
        "dashboard",
        "TrialCountdownBanner.tsx"
      );
      const content = fs.readFileSync(bannerPath, "utf-8");

      expect(content).not.toContain("|| 14");
      // Must check if !trialDays || trialDays <= 0 to return null
      expect(content).toMatch(/!trialDays\s*\|\|\s*trialDays\s*<=\s*0/);
    });
  });

  describe("Tier 4: Public Config Hook & Marketing Surface Extraction", () => {
    test("T4.1: usePublicConfig powers dynamic defaultBillingCadence without unauthenticated payment-config, and marketing (main) is extracted", () => {
      const mainGroupPath = path.join(SRC_DIR, "app", "(main)");
      expect(fs.existsSync(mainGroupPath)).toBe(false);

      const usePublicConfigPath = path.join(SRC_DIR, "hooks", "usePublicConfig.ts");
      const content = fs.readFileSync(usePublicConfigPath, "utf-8");

      expect(content).not.toContain("usePaymentConfig");
      expect(content).toContain("getPublicConfig");

      const planPricingPath = path.join(SRC_DIR, "lib", "planPricing.ts");
      expect(fs.existsSync(planPricingPath)).toBe(true);
    });
  });
});
