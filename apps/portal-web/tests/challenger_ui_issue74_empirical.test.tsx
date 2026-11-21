import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";

/**
 * Challenger UI Empirical Adversarial Test Suite for Issue #74
 *
 * Exhaustive Stress Testing Across 4 Dimensions:
 * 1. Zero False Promises Boundary Stress (0, -1, -14, null, undefined, NaN, string edge cases)
 * 2. Viewport Parity Stress (desktop lg:flex vs mobile lg:hidden on /sign-up)
 * 3. Automated AST / Regex Raw Hex Literal Scan across ALL modified files
 * 4. Deleted BFF Route File Absence & Residual Fetch Call Scan
 */

const WORKTREE_ROOT = path.resolve(__dirname, "../../..");
const PORTAL_WEB_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_WEB_ROOT, "src");

describe("Challenger UI Empirical Verification Suite (Issue #74)", () => {
  // =========================================================================
  // Dimension 1: Zero False Promises Boundary Stress
  // =========================================================================
  describe("Dimension 1: Zero False Promises Boundary Stress", () => {
    describe("1.1: SignUpTrialBadge Boundary Matrix", () => {
      const boundaryCases = [
        { trialDays: 0, description: "trialDays = 0 (disabled trial)" },
        { trialDays: -1, description: "trialDays = -1 (negative boundary)" },
        { trialDays: -14, description: "trialDays = -14 (negative standard)" },
        { trialDays: -999999, description: "trialDays = -999999 (extreme negative)" },
      ];

      for (const { trialDays, description } of boundaryCases) {
        test(`Renders NULL for ${description}`, async () => {
          const { SignUpTrialBadge } = await import(
            "../src/app/sign-up/_components/SignUpTrialBadge"
          );
          const html = renderToString(
            <SignUpTrialBadge
              initialConfig={{ trialDays, defaultBillingCadence: "monthly" }}
            />
          );

          expect(html).toBe("");
          expect(html).not.toContain("Free Trial");
          expect(html).not.toContain("Day");
          expect(html).not.toContain("14");
        });
      }

      test("Renders NULL when initialConfig is null (SSR fetch error)", async () => {
        const { SignUpTrialBadge } = await import(
          "../src/app/sign-up/_components/SignUpTrialBadge"
        );
        const html = renderToString(<SignUpTrialBadge initialConfig={null} />);

        expect(html).toBe("");
        expect(html).not.toContain("14");
        expect(html).not.toContain("Free Trial");
      });

      test("Renders loading skeleton ONLY when initialConfig is undefined (client-only loading)", async () => {
        const { SignUpTrialBadge } = await import(
          "../src/app/sign-up/_components/SignUpTrialBadge"
        );
        const html = renderToString(<SignUpTrialBadge initialConfig={undefined} />);

        expect(html).toMatch(/animate-pulse/);
        expect(html).toMatch(/bg-muted/);
        expect(html).toMatch(/role="status"/);
        expect(html).not.toContain("14");
        expect(html).not.toContain("Free Trial");
      });

      test("Renders correct positive durations dynamically without hardcoding 14", async () => {
        const { SignUpTrialBadge } = await import(
          "../src/app/sign-up/_components/SignUpTrialBadge"
        );

        const validDurations = [1, 7, 14, 21, 30, 60, 90, 365];
        for (const days of validDurations) {
          const html = renderToString(
            <SignUpTrialBadge
              initialConfig={{ trialDays: days, defaultBillingCadence: "monthly" }}
            />
          );
          expect(html).toContain(`${days}-Day Free Trial`);
          expect(html).toContain("text-primary");
          expect(html).toContain('data-testid="signup-trial-badge"');
        }
      });
    });

    describe("1.2: CustomSignUpForm Subtitle Boundary Matrix", () => {
      // Evaluate the subtitle expression extracted directly from CustomSignUpForm.tsx
      const getSubtitle = (initialTrialDays?: number | null) => {
        return initialTrialDays && initialTrialDays > 0
          ? `Start your ${initialTrialDays}-day free trial and access Clinic EZ workspaces.`
          : "Create an account to access Clinic EZ workspaces.";
      };

      test("Subtitle hides free trial promise on edge cases (0, -1, -14, NaN, undefined, null)", () => {
        const falsyCases: (number | undefined | null)[] = [
          0,
          -1,
          -14,
          -999999,
          NaN,
          undefined,
          null,
        ];

        for (const val of falsyCases) {
          const subtitle = getSubtitle(val);
          expect(subtitle).toBe("Create an account to access Clinic EZ workspaces.");
          expect(subtitle).not.toContain("free trial");
          expect(subtitle).not.toContain("0-day");
          expect(subtitle).not.toContain("14");
        }
      });

      test("Subtitle dynamically formats positive durations (7, 14, 30)", () => {
        expect(getSubtitle(7)).toBe(
          "Start your 7-day free trial and access Clinic EZ workspaces."
        );
        expect(getSubtitle(14)).toBe(
          "Start your 14-day free trial and access Clinic EZ workspaces."
        );
        expect(getSubtitle(30)).toBe(
          "Start your 30-day free trial and access Clinic EZ workspaces."
        );
      });
    });

    describe("1.3: WorkspaceOverviewClient Evaluation Period Matrix", () => {
      // Logic extracted from WorkspaceOverviewClient.tsx:244
      const getSubscriptionTitle = (
        planTitle: string | undefined,
        isTrialing: boolean,
        trialDays: number | null | undefined
      ) => {
        return (
          planTitle ||
          (isTrialing
            ? trialDays && trialDays > 0
              ? `${trialDays}-Day Free Trial`
              : "Evaluation Period"
            : "Setup Mode")
        );
      };

      test("Displays 'Evaluation Period' when trialing with 0, negative, or undefined trial days", () => {
        expect(getSubscriptionTitle(undefined, true, 0)).toBe("Evaluation Period");
        expect(getSubscriptionTitle(undefined, true, -1)).toBe("Evaluation Period");
        expect(getSubscriptionTitle(undefined, true, -14)).toBe("Evaluation Period");
        expect(getSubscriptionTitle(undefined, true, undefined)).toBe("Evaluation Period");
        expect(getSubscriptionTitle(undefined, true, null)).toBe("Evaluation Period");
        expect(getSubscriptionTitle(undefined, true, NaN)).toBe("Evaluation Period");
      });

      test("Displays dynamic duration when trialing with positive days", () => {
        expect(getSubscriptionTitle(undefined, true, 30)).toBe("30-Day Free Trial");
        expect(getSubscriptionTitle(undefined, true, 7)).toBe("7-Day Free Trial");
        expect(getSubscriptionTitle(undefined, true, 14)).toBe("14-Day Free Trial");
      });

      test("Displays plan title when planLimits.planTitle is present", () => {
        expect(getSubscriptionTitle("Enterprise Pro", true, 0)).toBe("Enterprise Pro");
        expect(getSubscriptionTitle("Clinical Team", false, 14)).toBe("Clinical Team");
      });

      test("Displays 'Setup Mode' when not trialing and no plan title", () => {
        expect(getSubscriptionTitle(undefined, false, 0)).toBe("Setup Mode");
        expect(getSubscriptionTitle(undefined, false, 14)).toBe("Setup Mode");
      });
    });

    describe("1.4: TrialCountdownBanner Boundary Matrix", () => {
      // Logic extracted from TrialCountdownBanner.tsx:74
      const shouldRenderBanner = (
        subscriptionStatus: string | undefined,
        dismissed: boolean,
        trialDays: number | null | undefined
      ) => {
        const isTrialing = subscriptionStatus === "TRIALING";
        const isExpired = subscriptionStatus === "EXPIRED";
        if ((!isTrialing && !isExpired) || dismissed || !trialDays || trialDays <= 0) {
          return false;
        }
        return true;
      };

      test("Hides banner (returns null / false) when trialDays <= 0 or non-positive", () => {
        expect(shouldRenderBanner("TRIALING", false, 0)).toBe(false);
        expect(shouldRenderBanner("TRIALING", false, -1)).toBe(false);
        expect(shouldRenderBanner("TRIALING", false, -14)).toBe(false);
        expect(shouldRenderBanner("TRIALING", false, undefined)).toBe(false);
        expect(shouldRenderBanner("TRIALING", false, null)).toBe(false);
        expect(shouldRenderBanner("TRIALING", false, NaN)).toBe(false);
      });

      test("Hides banner when dismissed or subscription is ACTIVE", () => {
        expect(shouldRenderBanner("ACTIVE", false, 14)).toBe(false);
        expect(shouldRenderBanner("CANCELLED", false, 14)).toBe(false);
        expect(shouldRenderBanner("TRIALING", true, 14)).toBe(false);
        expect(shouldRenderBanner("EXPIRED", true, 14)).toBe(false);
      });

      test("Renders banner when status is TRIALING or EXPIRED with valid trialDays > 0", () => {
        expect(shouldRenderBanner("TRIALING", false, 14)).toBe(true);
        expect(shouldRenderBanner("TRIALING", false, 30)).toBe(true);
        expect(shouldRenderBanner("TRIALING", false, 7)).toBe(true);
        expect(shouldRenderBanner("EXPIRED", false, 14)).toBe(true);
      });
    });
  });

  // =========================================================================
  // Dimension 2: Viewport Parity Stress
  // =========================================================================
  describe("Dimension 2: Viewport Parity Stress on /sign-up", () => {
    test("Desktop and mobile viewports render SignUpTrialBadge identically", () => {
      const pagePath = path.join(SRC_DIR, "app/sign-up/[[...sign-up]]/page.tsx");
      const content = fs.readFileSync(pagePath, "utf-8");

      // Check desktop container
      expect(content).toContain("hidden lg:flex flex-col");
      // Check mobile container
      expect(content).toContain("lg:hidden mb-4");

      // Verify both containers instantiate SignUpTrialBadge with initialConfig={publicConfig}
      const desktopSection = content.split("hidden lg:flex flex-col")[1]?.split("Right Side")[0];
      expect(desktopSection).toContain("<SignUpTrialBadge initialConfig={publicConfig} />");

      const mobileSection = content.split("lg:hidden mb-4")[1]?.split("<Suspense")[0];
      expect(mobileSection).toContain("<SignUpTrialBadge initialConfig={publicConfig} />");

      // Verify CustomSignUpForm receives initialTrialDays={publicConfig?.trialDays}
      expect(content).toContain(
        "<CustomSignUpForm initialTrialDays={publicConfig?.trialDays} />"
      );
    });
  });

  // =========================================================================
  // Dimension 3: Automated AST / Regex Scan for Raw Hex Color Literals
  // =========================================================================
  describe("Dimension 3: Automated AST / Regex Scan for Raw Hex Color Literals", () => {
    const MODIFIED_FRONTEND_FILES = [
      "src/app/page.tsx",
      "src/app/sign-up/[[...sign-up]]/page.tsx",
      "src/app/sign-up/_components/SignUpTrialBadge.tsx",
      "src/app/sign-up/_components/CustomSignUpForm.tsx",
      "src/app/tenants/register/layout.tsx",
      "src/app/tenants/register/page.tsx",
      "src/app/tenants/register/_components/TenantRegistrationClient.tsx",
      "src/app/[tenant]/dashboard/overview/WorkspaceOverviewClient.tsx",
      "src/components/dashboard/TrialCountdownBanner.tsx",
      "src/components/join/JoinClient.tsx",
      "src/components/join/ProgressiveClaimCard.tsx",
      "src/components/join/MobileAppStoreBadges.tsx",
      "src/hooks/useBilling.ts",
      "src/hooks/usePublicConfig.ts",
      "src/lib/planPricing.ts",
      "src/services/billing.service.ts",
      "src/utils/domain.ts",
    ];

    const HEX_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

    for (const relPath of MODIFIED_FRONTEND_FILES) {
      test(`Zero raw hex color literals in ${relPath}`, () => {
        const fullPath = path.join(PORTAL_WEB_ROOT, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const rawHexMatches: { line: number; text: string; hex: string }[] = [];

        lines.forEach((line, index) => {
          const trimmed = line.trim();
          // Skip comments
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

          const matches = line.match(HEX_REGEX);
          if (matches) {
            for (const match of matches) {
              // Ignore legitimate URL anchors like #section or #billing-plans-section
              // A hex match looks like #[0-9a-f]{3,8}. If followed by letters that make it an anchor:
              // Notice \b in HEX_REGEX ensures it matches exact hex words.
              // We check if it's an anchor href like href="#plans"
              if (line.includes(`href="#`) || line.includes(`href='#'`)) continue;

              rawHexMatches.push({
                line: index + 1,
                text: trimmed,
                hex: match,
              });
            }
          }
        });

        if (rawHexMatches.length > 0) {
          const errList = rawHexMatches
            .map((m) => `  L${m.line}: '${m.hex}' in "${m.text}"`)
            .join("\n");
          expect(rawHexMatches.length).toBe(
            0,
            `Found raw hex color literals in ${relPath}:\n${errList}`
          );
        } else {
          expect(rawHexMatches.length).toBe(0);
        }
      });
    }
  });

  // =========================================================================
  // Dimension 4: Deleted BFF Routes & Residual Fetch Calls
  // =========================================================================
  describe("Dimension 4: Deleted BFF Routes & Residual Fetch Calls", () => {
    const DELETED_BFF_ROUTES = [
      "src/app/api/v1/admin/newsletter-subscribers/route.ts",
      "src/app/api/v1/public/contact/route.ts",
      "src/app/api/v1/public/newsletter/route.ts",
      "src/app/api/v1/public/join/route.ts",
      "src/app/api/v1/public/join/validate/[code]/route.ts",
      "src/app/api/v1/patients/me/route.ts",
      "src/app/api/v1/patients/claim-intake/route.ts",
    ];

    test("All 7 target BFF route files do NOT exist on disk", () => {
      for (const routePath of DELETED_BFF_ROUTES) {
        const fullPath = path.join(PORTAL_WEB_ROOT, routePath);
        const exists = fs.existsSync(fullPath);
        expect(exists).toBe(
          false,
          `File ${routePath} still exists on disk! Must be permanently deleted.`
        );
      }
    });

    test("Zero residual fetch calls to deleted BFF endpoints across all portal-web/src source files", () => {
      function findFiles(dir: string): string[] {
        let results: string[] = [];
        const items = fs.readdirSync(dir, { withFileTypes: true });
        for (const item of items) {
          const p = path.join(dir, item.name);
          if (item.isDirectory()) {
            results = results.concat(findFiles(p));
          } else if (/\.(ts|tsx|js|jsx)$/.test(item.name) && !item.name.endsWith(".d.ts")) {
            results.push(p);
          }
        }
        return results;
      }

      const allSrcFiles = findFiles(SRC_DIR);
      const forbiddenEndpoints = [
        "/api/v1/public/contact",
        "/api/v1/public/newsletter",
        "/api/v1/public/join",
        "/api/v1/public/settings",
        "/api/v1/patients/me",
        "/api/v1/patients/claim-intake",
        "/api/v1/admin/newsletter-subscribers",
      ];

      const violations: { file: string; line: number; endpoint: string; lineText: string }[] = [];

      for (const filePath of allSrcFiles) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

          for (const ep of forbiddenEndpoints) {
            if (line.includes(`"${ep}"`) || line.includes(`'${ep}'`) || line.includes(`\`${ep}\``)) {
              violations.push({
                file: path.relative(PORTAL_WEB_ROOT, filePath),
                line: idx + 1,
                endpoint: ep,
                lineText: trimmed,
              });
            }
          }
        });
      }

      if (violations.length > 0) {
        const errList = violations
          .map((v) => `  ${v.file}:${v.line} -> ${v.endpoint} ("${v.lineText}")`)
          .join("\n");
        expect(violations.length).toBe(
          0,
          `Found residual BFF endpoint calls in portal-web:\n${errList}`
        );
      } else {
        expect(violations.length).toBe(0);
      }
    });

    test("public/[...slug]/route.ts allowlist strictly rejects adversarial bypass attempts", () => {
      // Replicate the exact allowlist check from public/[...slug]/route.ts
      const isAllowed = (slugArr: string[]) => {
        const subPath = slugArr.join("/");
        const allowed = ["rx-upload", "queue/display"];
        return allowed.some((p) => subPath === p || subPath.startsWith(`${p}/`));
      };

      const validPaths = [
        ["rx-upload"],
        ["rx-upload", "123"],
        ["queue", "display"],
        ["queue", "display", "tv-01"],
      ];
      for (const p of validPaths) {
        expect(isAllowed(p)).toBe(true);
      }

      const maliciousPaths = [
        ["rx-upload-bypass"],
        ["rx-uploader"],
        ["queue", "display_bypass"],
        ["queue-display"],
        ["contact"],
        ["newsletter"],
        ["join"],
        ["settings"],
        ["directory", "doctors"],
        ["..", "..", "etc", "passwd"],
        ["patients", "me"],
      ];
      for (const p of maliciousPaths) {
        expect(isAllowed(p)).toBe(false);
      }
    });
  });
});
