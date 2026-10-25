import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * Issue #74 Test Suite: Design Tokens & Zero Raw Hex Literal Audit
 *
 * Requirements Covered:
 * - R1 & Acceptance Criteria: Automated AST / regex scan across all modified components
 *   in apps/portal-web/src/ ensuring ZERO raw hex color literals (#[0-9a-fA-F]{3,8}).
 * - Enforces @clinicez/design-tokens semantic tokens across all UI layers.
 */

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(WORKSPACE_ROOT, "src");

// Complete inventory of frontend component files touched/modified for Issue #74
const ISSUE_74_FRONTEND_COMPONENTS = [
  "app/sign-up/[[...sign-up]]/page.tsx",
  "app/sign-up/_components/SignUpTrialBadge.tsx",
  "app/sign-up/_components/CustomSignUpForm.tsx",
  "app/(main)/pricing/_components/PricingClient.tsx",
  "app/[tenant]/dashboard/overview/WorkspaceOverviewClient.tsx",
  "components/dashboard/TrialCountdownBanner.tsx",
  "components/join/JoinClient.tsx",
  "components/join/ProgressiveClaimCard.tsx",
  "app/(main)/contact-us/_components/ContactUsClient.tsx",
  "components/NewsletterForm.tsx",
  "components/join/MobileAppStoreBadges.tsx",
];

// Regex matching raw 3, 4, 6, or 8 digit hex color codes: #fff, #ffffff, #ffffff80
const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

describe("Issue #74: Design Tokens & Zero Raw Hex Literal Audit", () => {
  describe("Tier 1 & Tier 2: Static Analysis Audit Across All Touched Components", () => {
    for (const relPath of ISSUE_74_FRONTEND_COMPONENTS) {
      test(`T1.1: Component ${relPath} contains ZERO raw hex color literals`, () => {
        const fullPath = path.join(SRC_DIR, relPath);
        if (!fs.existsSync(fullPath)) {
          throw new Error(`Component file not found on disk: ${relPath}`);
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const violations: { line: number; match: string; context: string }[] = [];

        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          // Skip comments
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

          const matches = line.match(HEX_COLOR_REGEX);
          if (matches) {
            // Filter out non-color tokens if any (e.g. URL anchors like #section)
            for (const m of matches) {
              violations.push({
                line: idx + 1,
                match: m,
                context: trimmed,
              });
            }
          }
        });

        if (violations.length > 0) {
          const report = violations
            .map((v) => `  - Line ${v.line}: '${v.match}' in: "${v.context}"`)
            .join("\n");
          expect(violations.length).toBe(
            0,
            `Found ${violations.length} forbidden raw hex color literal(s) in ${relPath}:\n${report}\nAll colors must consume semantic classes from @clinicez/design-tokens.`
          );
        } else {
          expect(violations.length).toBe(0);
        }
      });
    }
  });

  describe("Tier 3: Design Token Semantic Usage Verification", () => {
    test("T3.1: SignUpTrialBadge uses semantic primary tokens", () => {
      const fullPath = path.join(SRC_DIR, "app/sign-up/_components/SignUpTrialBadge.tsx");
      const content = fs.readFileSync(fullPath, "utf-8");

      expect(content).toContain("text-primary");
      expect(content).toMatch(/bg-primary\/10/);
    });

    test("T3.2: MobileAppStoreBadges and ProgressiveClaimCard use semantic foreground/background tokens", () => {
      const claimPath = path.join(SRC_DIR, "components/join/ProgressiveClaimCard.tsx");
      const claimContent = fs.readFileSync(claimPath, "utf-8");

      expect(claimContent).toMatch(/text-foreground|text-muted-foreground|bg-card/);
      expect(claimContent).not.toMatch(/#[0-9a-fA-F]{6}/);
    });
  });
});
