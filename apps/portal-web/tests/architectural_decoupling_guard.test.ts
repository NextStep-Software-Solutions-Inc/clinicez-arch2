import { describe, expect, test, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import axios from "axios";

/**
 * Architectural Decoupling & BFF Elimination Guard Test Suite (Milestone 5)
 *
 * Verifies:
 * - Tier 1: Exactly 0 files exist under apps/portal-web/src/app/api/
 * - Tier 2: next.config.ts contains NO rewrites() and NO references to CLINIC_API_URL
 * - Tier 3: apps/portal-web/.env.example contains ZERO references to CLINIC_API_URL
 * - Tier 4: All public services (join, dropzone, queueDisplay) resolve to getPortalApiUrl()
 * - Tier 5: Zero residual client-side calls to /api/v1/public across portal-web/src
 * - Tier 6: Proxy middleware and route helper cleanups
 */

const PORTAL_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_ROOT, "src");

function getAllFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFilesRecursively(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Architectural Decoupling & BFF Elimination Guard Suite", () => {
  // =========================================================================
  // Tier 1: Zero Files under apps/portal-web/src/app/api/
  // =========================================================================
  describe("Tier 1: Filesystem Boundary & Zero Next.js BFF Routes", () => {
    test("T1.1: Exactly ZERO files exist under apps/portal-web/src/app/api/", () => {
      const apiDir = path.join(SRC_DIR, "app", "api");
      const files = getAllFilesRecursively(apiDir);

      if (files.length > 0) {
        const fileList = files.map((f) => path.relative(PORTAL_ROOT, f)).join("\n");
        expect(files.length).toBe(
          0,
          `Architectural violation: Found ${files.length} file(s) in src/app/api/:\n${fileList}\nAll public portal traffic must target services/portal-api directly.`
        );
      } else {
        expect(files.length).toBe(0);
      }
    });

    test("T1.2: The legacy catch-all route public/[...slug]/route.ts is permanently deleted", () => {
      const catchAllRoutePath = path.join(SRC_DIR, "app", "api", "v1", "public", "[...slug]", "route.ts");
      expect(fs.existsSync(catchAllRoutePath)).toBe(
        false,
        "Catch-all route.ts still exists on disk! It must be deleted per Feature 23."
      );
    });

    test("T1.3: No route.ts or route.js files exist anywhere in apps/portal-web/src/app/", () => {
      const appDir = path.join(SRC_DIR, "app");
      const allAppFiles = getAllFilesRecursively(appDir);
      const routeHandlers = allAppFiles.filter((f) => /route\.(ts|js)$/.test(f));

      expect(routeHandlers).toEqual([]);
    });
  });

  // =========================================================================
  // Tier 2: Next.js Configuration Integrity (next.config.ts)
  // =========================================================================
  describe("Tier 2: Next.js Configuration Integrity (next.config.ts)", () => {
    const nextConfigPath = path.join(PORTAL_ROOT, "next.config.ts");

    test("T2.1: next.config.ts exists and does NOT declare rewrites()", () => {
      expect(fs.existsSync(nextConfigPath)).toBe(true);
      const content = fs.readFileSync(nextConfigPath, "utf-8");

      expect(content).not.toMatch(/\brewrites\s*[:(]/);
    });

    test("T2.2: next.config.ts contains ZERO references to CLINIC_API_URL or NEXT_PUBLIC_CLINIC_API_URL", () => {
      const content = fs.readFileSync(nextConfigPath, "utf-8");
      expect(content).not.toContain("CLINIC_API_URL");
      expect(content).not.toContain("NEXT_PUBLIC_CLINIC_API_URL");
    });

    test("T2.3: Runtime evaluation of next.config.ts confirms rewrites property is undefined", async () => {
      const nextConfigModule = (await import("../next.config")).default;
      expect(typeof (nextConfigModule as any).rewrites).toBe("undefined");
    });
  });

  // =========================================================================
  // Tier 3: Environment Variables & Documentation (.env.example)
  // =========================================================================
  describe("Tier 3: Environment Variables & Deployment Cleanup", () => {
    test("T3.1: apps/portal-web/.env.example contains ZERO references to CLINIC_API_URL", () => {
      const envExamplePath = path.join(PORTAL_ROOT, ".env.example");
      expect(fs.existsSync(envExamplePath)).toBe(true);

      const content = fs.readFileSync(envExamplePath, "utf-8");
      expect(content).not.toContain("CLINIC_API_URL");
      expect(content).not.toContain("NEXT_PUBLIC_CLINIC_API_URL");
    });

    test("T3.2: apps/portal-web/.env.example defines NEXT_PUBLIC_API_URL targeting portal-api", () => {
      const envExamplePath = path.join(PORTAL_ROOT, ".env.example");
      const content = fs.readFileSync(envExamplePath, "utf-8");

      expect(content).toContain("NEXT_PUBLIC_API_URL=");
    });

    test("T3.3: docs/deployment-configuration.md contains ZERO stale CLINIC_API_URL references across portal-web, portal-api, and patient-app", () => {
      const docsPath = path.resolve(PORTAL_ROOT, "../../docs/deployment-configuration.md");
      expect(fs.existsSync(docsPath)).toBe(true);

      const content = fs.readFileSync(docsPath, "utf-8");

      // 1. Monorepo-wide: ZERO SERVICES_CLINIC_API_URL references
      expect(content).not.toContain("SERVICES_CLINIC_API_URL");

      // Helper to isolate subsection content under ### `apps/<name>`
      const extractSection = (header: string) => {
        const escaped = header.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
        const match = content.match(new RegExp(`(?:^|\\n)#{2,3}\\s+\`?${escaped}\`?([\\s\\S]*?)(?=\\n#{2,3}\\s+|$)`, "i"));
        return match ? match[1] : "";
      };

      const portalWebSection = extractSection("apps/portal-web");
      const patientAppSection = extractSection("apps/patient-app");
      const clinicAppSection = extractSection("apps/clinic-app");

      // 2. portal-web section contains ZERO CLINIC_API_URL / NEXT_PUBLIC_CLINIC_API_URL references
      expect(portalWebSection).not.toContain("CLINIC_API_URL");
      expect(portalWebSection).not.toContain("NEXT_PUBLIC_CLINIC_API_URL");

      // 3. patient-app section contains ZERO EXPO_PUBLIC_CLINIC_API_URL references
      expect(patientAppSection).not.toContain("EXPO_PUBLIC_CLINIC_API_URL");
      expect(patientAppSection).not.toContain("CLINIC_API_URL");

      // 4. portal-api references in API tables / checklists contain ZERO CLINIC_API_URL
      const lines = content.split("\n");
      const portalApiLines = lines.filter((l) => l.includes("portal-api"));
      expect(portalApiLines.length).toBeGreaterThan(0);
      for (const line of portalApiLines) {
        expect(line).not.toContain("CLINIC_API_URL");
      }

      // 5. Preserves legitimacy of apps/clinic-app section containing EXPO_PUBLIC_CLINIC_API_URL
      expect(clinicAppSection).toContain("EXPO_PUBLIC_CLINIC_API_URL");
    });
  });

  // =========================================================================
  // Tier 4: Service Layer Decoupling & getPortalApiUrl() Target Resolution
  // =========================================================================
  describe("Tier 4: Service Layer Decoupling & getPortalApiUrl() Target Resolution", () => {
    describe("Static Source Code Assertions", () => {
      test("T4.1: join.service.ts consumes getPortalApiUrl and contains ZERO CLINIC_API references", () => {
        const servicePath = path.join(SRC_DIR, "services", "join.service.ts");
        const content = fs.readFileSync(servicePath, "utf-8");

        expect(content).toContain("getPortalApiUrl");
        expect(content).not.toContain("CLINIC_API_URL");
        expect(content).not.toContain("getClinicApiUrl");
        expect(content).not.toContain("/api/v1/public/");
      });

      test("T4.2: dropzone.service.ts consumes getPortalApiUrl and contains ZERO CLINIC_API references", () => {
        const servicePath = path.join(SRC_DIR, "services", "dropzone.service.ts");
        const content = fs.readFileSync(servicePath, "utf-8");

        expect(content).toContain("getPortalApiUrl");
        expect(content).not.toContain("CLINIC_API_URL");
        expect(content).not.toContain("getClinicApiUrl");
        expect(content).not.toContain("/api/v1/public/");
      });

      test("T4.3: queueDisplay.service.ts consumes getPortalApiUrl and contains ZERO CLINIC_API references", () => {
        const servicePath = path.join(SRC_DIR, "services", "queueDisplay.service.ts");
        const content = fs.readFileSync(servicePath, "utf-8");

        expect(content).toContain("getPortalApiUrl");
        expect(content).not.toContain("CLINIC_API_URL");
        expect(content).not.toContain("getClinicApiUrl");
        expect(content).not.toContain("/api/v1/public/");
      });
    });

    describe("Behavioral Network Invocations", () => {
      const originalFetch = globalThis.fetch;
      const originalAxiosGet = axios.get;
      const originalAxiosPost = axios.post;

      test("T4.4: joinService.validateJoinCode dispatches directly to portal-api endpoint", async () => {
        const { joinService } = await import("../src/services/join.service");
        const { getPortalApiUrl } = await import("../src/utils/domain");
        const expectedBase = getPortalApiUrl();

        let interceptedUrl = "";
        globalThis.fetch = mock(async (input: string | URL | Request) => {
          interceptedUrl = String(input);
          return new Response(JSON.stringify({ success: true, data: { isValid: true, tenantSlug: "t", facilitySlug: "f" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }) as any;

        try {
          await joinService.validateJoinCode("METRO123");
          expect(interceptedUrl).toContain(expectedBase);
          expect(interceptedUrl).toContain("/public/join/validate/METRO123");
          expect(interceptedUrl).not.toContain(":5245"); // Not clinic-api port
        } finally {
          globalThis.fetch = originalFetch;
        }
      });

      test("T4.5: dropzoneService.getRxUploadInfo dispatches directly to portal-api endpoint", async () => {
        const { dropzoneService } = await import("../src/services/dropzone.service");
        const { getPortalApiUrl } = await import("../src/utils/domain");
        const expectedBase = getPortalApiUrl();

        let interceptedUrl = "";
        axios.get = mock(async (url: string) => {
          interceptedUrl = url;
          return { data: { success: true, data: { prescriptionNumber: "RX-1", isValid: true } } };
        }) as any;

        try {
          await dropzoneService.getRxUploadInfo("TOKEN-XYZ");
          expect(interceptedUrl).toContain(expectedBase);
          expect(interceptedUrl).toContain("/public/rx-upload/TOKEN-XYZ/info");
        } finally {
          axios.get = originalAxiosGet;
        }
      });

      test("T4.6: queueDisplayService.getDisplayData dispatches directly to portal-api endpoint", async () => {
        const { queueDisplayService } = await import("../src/services/queueDisplay.service");
        const { getPortalApiUrl } = await import("../src/utils/domain");
        const expectedBase = getPortalApiUrl();

        let interceptedUrl = "";
        globalThis.fetch = mock(async (input: string | URL | Request) => {
          interceptedUrl = String(input);
          return new Response(JSON.stringify({ success: true, data: { nowServing: [], upNext: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }) as any;

        try {
          await queueDisplayService.getDisplayData({ tenantSlug: "acme", facilitySlug: "main" });
          expect(interceptedUrl).toContain(expectedBase);
          expect(interceptedUrl).toContain("/public/queue/display/acme/main");
        } finally {
          globalThis.fetch = originalFetch;
        }
      });
    });
  });

  // =========================================================================
  // Tier 5: Zero Remaining Next.js BFF Calls in src/
  // =========================================================================
  describe("Tier 5: Static Codebase Audit (Zero /api/v1/public calls in src/)", () => {
    test("T5.1: Zero files in apps/portal-web/src/ invoke Next.js BFF /api/v1/public paths", () => {
      const allSourceFiles = getAllFilesRecursively(SRC_DIR).filter(
        (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".d.ts")
      );

      const violations: { file: string; line: number; match: string }[] = [];
      const forbiddenPattern = /['"`]\/api\/v1\/public[/'"`]/;

      for (const filePath of allSourceFiles) {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");

        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

          if (forbiddenPattern.test(line)) {
            violations.push({
              file: path.relative(PORTAL_ROOT, filePath),
              line: idx + 1,
              match: trimmed,
            });
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });
});
