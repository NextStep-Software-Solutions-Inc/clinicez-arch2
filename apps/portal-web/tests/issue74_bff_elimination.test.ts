import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

/**
 * Issue #74 Test Suite: BFF Route Elimination & Direct API Audit
 *
 * Requirements Covered:
 * - R2: Delete 7 redundant Next.js BFF routes under apps/portal-web/src/app/api/v1/
 * - R2: Zero remaining BFF fetch calls in apps/portal-web/src/
 * - R2: Standardized direct URL resolution helpers (getPatientApiUrl, getPortalApiUrl)
 * - R2: Caller-scoped authentication headers (Clerk Bearer) passed to patient-api
 */

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(WORKSPACE_ROOT, "src");

// 7 Target BFF routes to be completely deleted
const ELIMINATED_BFF_ROUTES = [
  "src/app/api/v1/admin/newsletter-subscribers/route.ts",
  "src/app/api/v1/public/contact/route.ts",
  "src/app/api/v1/public/newsletter/route.ts",
  "src/app/api/v1/public/join/route.ts",
  "src/app/api/v1/public/join/validate/[code]/route.ts",
  "src/app/api/v1/patients/me/route.ts",
  "src/app/api/v1/patients/claim-intake/route.ts",
];

// Disallowed BFF route fetch patterns
const FORBIDDEN_BFF_CALL_PATTERNS = [
  "/api/v1/public/contact",
  "/api/v1/public/newsletter",
  "/api/v1/public/join",
  "/api/v1/public/settings",
  "/api/v1/patients/me",
  "/api/v1/patients/claim-intake",
];

function getAllSourceFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

describe("Issue #74: BFF Route Elimination & Direct API Audit", () => {
  describe("Tier 1: Feature Coverage (7 Target BFF Route File Absence)", () => {
    for (const routeRelPath of ELIMINATED_BFF_ROUTES) {
      test(`T1.1: File absence verification — ${routeRelPath} is permanently removed from disk`, () => {
        const fullPath = path.join(WORKSPACE_ROOT, routeRelPath);
        const exists = fs.existsSync(fullPath);
        expect(exists).toBe(
          false,
          `Redundant BFF route handler still exists on disk: ${routeRelPath}. All 7 target BFF routes must be deleted per R2.`
        );
      });
    }
  });

  describe("Tier 1 & Tier 2: Static Codebase Audit (Zero Remaining BFF Fetch Calls)", () => {
    test("T1.2: apps/portal-web/src/ contains zero direct fetch calls to deleted BFF endpoints", () => {
      const sourceFiles = getAllSourceFiles(SRC_DIR);
      expect(sourceFiles.length).toBeGreaterThan(0);

      const violations: { file: string; line: number; match: string }[] = [];

      for (const filePath of sourceFiles) {
        // Skip [...slug]/route.ts itself if testing internal logic
        if (filePath.includes(path.join("public", "[...slug]"))) continue;

        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, index) => {
          // Check for fetch calls or api client calls matching the forbidden BFF paths
          for (const pattern of FORBIDDEN_BFF_CALL_PATTERNS) {
            // Match fetch("/api/v1/...") or fetch('/api/v1/...') or `api/v1/...`
            const regex = new RegExp(`['"\`][^'"]*${pattern.replace(/\//g, "\\/")}['"\`]`);
            if (regex.test(line)) {
              // Ignore comments
              const trimmed = line.trim();
              if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

              violations.push({
                file: path.relative(WORKSPACE_ROOT, filePath),
                line: index + 1,
                match: line.trim(),
              });
            }
          }
        });
      }

      if (violations.length > 0) {
        const report = violations
          .map((v) => `  - ${v.file}:${v.line} -> ${v.match}`)
          .join("\n");
        expect(violations.length).toBe(
          0,
          `Found ${violations.length} forbidden Next.js BFF call(s) in src/:\n${report}\nAll components must call portal-api or patient-api directly.`
        );
      } else {
        expect(violations.length).toBe(0);
      }
    });

    test("T2.1 (Boundary): No sneaky template literal or concatenation BFF calls", () => {
      const sourceFiles = getAllSourceFiles(SRC_DIR);
      const suspiciousConcatenations: string[] = [];

      for (const filePath of sourceFiles) {
        if (filePath.includes(path.join("public", "[...slug]"))) continue;
        const content = fs.readFileSync(filePath, "utf-8");
        // Look for expressions like "/api/v1/" + "patients/me" or similar evasions
        if (content.includes('"/api/v1/" +') || content.includes("'/api/v1/' +")) {
          suspiciousConcatenations.push(path.relative(WORKSPACE_ROOT, filePath));
        }
      }

      expect(suspiciousConcatenations).toEqual([]);
    });
  });

  describe("Tier 3: Standardized Direct URL Resolution Helpers (domain.ts)", () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_PATIENT_API_URL;
      delete process.env.NEXT_PUBLIC_PORTAL_API_URL;
      delete process.env.NEXT_PUBLIC_API_URL;
      delete process.env.NEXT_PUBLIC_BASE_DOMAIN;
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    interface DomainModule {
      getPatientApiUrl?: () => string;
      getPortalApiUrl?: () => string;
      getConsoleBaseDomain?: () => string;
      getFacilityBaseDomain?: () => string;
    }

    test("T3.1: getPatientApiUrl priority 1 — uses explicit NEXT_PUBLIC_PATIENT_API_URL and normalizes trailing /api/v1", async () => {
      const domainModule = (await import("../src/utils/domain")) as DomainModule;
      if (typeof domainModule.getPatientApiUrl !== "function") {
        throw new Error("getPatientApiUrl is not yet exported from src/utils/domain.ts");
      }

      const getPatientApiUrl = domainModule.getPatientApiUrl;

      process.env.NEXT_PUBLIC_PATIENT_API_URL = "https://patient-custom.clinicez.ph";
      expect(getPatientApiUrl()).toBe("https://patient-custom.clinicez.ph/api/v1");

      process.env.NEXT_PUBLIC_PATIENT_API_URL = "https://patient-custom.clinicez.ph/api/v1/";
      expect(getPatientApiUrl()).toBe("https://patient-custom.clinicez.ph/api/v1");
    });

    test("T3.2: getPatientApiUrl priority 2 — derives patient-api subdomain from NEXT_PUBLIC_BASE_DOMAIN", async () => {
      const domainModule = (await import("../src/utils/domain")) as DomainModule;
      if (typeof domainModule.getPatientApiUrl !== "function") {
        throw new Error("getPatientApiUrl is not yet exported from src/utils/domain.ts");
      }

      const getPatientApiUrl = domainModule.getPatientApiUrl;

      process.env.NEXT_PUBLIC_BASE_DOMAIN = "staging.clinicez.ph";
      expect(getPatientApiUrl()).toBe("https://patient-api.staging.clinicez.ph/api/v1");
    });

    test("T3.3: getPatientApiUrl priority 3 — localhost development fallback is http://localhost:5150/api/v1", async () => {
      const domainModule = (await import("../src/utils/domain")) as DomainModule;
      if (typeof domainModule.getPatientApiUrl !== "function") {
        throw new Error("getPatientApiUrl is not yet exported from src/utils/domain.ts");
      }

      const getPatientApiUrl = domainModule.getPatientApiUrl;

      // No environment variables set, running outside browser window
      expect(getPatientApiUrl()).toBe("http://localhost:5150/api/v1");
    });

    test("T3.4: getPortalApiUrl priority 1 & fallback — handles overrides and defaults to http://localhost:5000/api/v1", async () => {
      const domainModule = (await import("../src/utils/domain")) as DomainModule;
      if (typeof domainModule.getPortalApiUrl !== "function") {
        throw new Error("getPortalApiUrl is not yet exported from src/utils/domain.ts");
      }

      const getPortalApiUrl = domainModule.getPortalApiUrl;

      process.env.NEXT_PUBLIC_PORTAL_API_URL = "https://portal-svc.clinicez.ph";
      expect(getPortalApiUrl()).toBe("https://portal-svc.clinicez.ph/api/v1");

      delete process.env.NEXT_PUBLIC_PORTAL_API_URL;
      process.env.NEXT_PUBLIC_API_URL = "https://portal-legacy.clinicez.ph/api/v1/";
      expect(getPortalApiUrl()).toBe("https://portal-legacy.clinicez.ph/api/v1");

      delete process.env.NEXT_PUBLIC_API_URL;
      expect(getPortalApiUrl()).toBe("http://localhost:5000/api/v1");
    });
  });

  describe("Tier 4: Real-World Scenario & Caller Auth Contract Verification", () => {
    test("T4.1: ProgressiveClaimCard source uses getPatientApiUrl and passes Authorization Bearer", () => {
      const claimCardPath = path.join(SRC_DIR, "components", "join", "ProgressiveClaimCard.tsx");
      const content = fs.readFileSync(claimCardPath, "utf-8");

      expect(content).not.toContain('fetch("/api/v1/patients/claim-intake"');
      expect(content).toContain("getPatientApiUrl");
      expect(content).toMatch(/Authorization:\s*`Bearer\s+\${token}`/);
    });

    test("T4.2: JoinClient source uses getPatientApiUrl for /patients/me with Authorization Bearer", () => {
      const joinClientPath = path.join(SRC_DIR, "components", "join", "JoinClient.tsx");
      const content = fs.readFileSync(joinClientPath, "utf-8");

      expect(content).not.toContain('fetch("/api/v1/patients/me"');
      expect(content).toContain("getPatientApiUrl");
      expect(content).toMatch(/Authorization:\s*`Bearer\s+\${token}`/);
    });

    test("T4.3: JoinClient source uses getPortalApiUrl for /public/join without Next.js BFF", () => {
      const joinClientPath = path.join(SRC_DIR, "components", "join", "JoinClient.tsx");
      const content = fs.readFileSync(joinClientPath, "utf-8");

      expect(content).not.toContain('"/api/v1/public/join"');
      expect(content).toContain("getPortalApiUrl");
    });
  });
});
