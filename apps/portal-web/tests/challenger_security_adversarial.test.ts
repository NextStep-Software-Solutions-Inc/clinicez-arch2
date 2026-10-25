import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

/**
 * Empirical Adversarial Security Test Suite (Issue #74 Challenger Security)
 * 
 * Conducts aggressive adversarial probes against:
 * 1. public/[...slug] lockdown & non-allowlisted slug fuzzing
 * 2. Allowlisted prefix lookalike and path traversal vulnerability probes
 * 3. 7 Redundant Next.js BFF route absolute deletion
 * 4. Zero remaining client-side calls to deleted BFF routes
 * 5. Configuration cleanup (ClinicApiUrl vs PatientApiUrl) across portal-api, deploy, and workflows
 */

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const ROUTE_FILE_PATH = path.join(
  WORKSPACE_ROOT,
  "src",
  "app",
  "api",
  "v1",
  "public",
  "[...slug]",
  "route.ts"
);

describe("Challenger Security: Empirical Adversarial Verification Suite", () => {
  describe("Probe 4: Non-Allowlisted Public Slug Lockdown & Enumeration", () => {
    interface RouteModule {
      GET?: (
        request: NextRequest,
        context: { params: Promise<{ slug: string[] }> }
      ) => Promise<Response>;
      POST?: (
        request: NextRequest,
        context: { params: Promise<{ slug: string[] }> }
      ) => Promise<Response>;
    }

    let routeHandler: RouteModule | null = null;
    const originalFetch = globalThis.fetch;

    beforeEach(async () => {
      try {
        routeHandler = (await import(
          "../src/app/api/v1/public/[...slug]/route"
        )) as RouteModule;
      } catch {
        routeHandler = null;
      }
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    const adversarialNonAllowlistedSlugs = [
      ["admin"],
      ["contact"],
      ["newsletter"],
      ["join"],
      ["patients", "me"],
      ["settings"],
      ["directory", "doctors"],
      ["..", "..", "evil"],
      ["directory"],
      ["directory", "clinics"],
      ["directory", "organizations"],
      ["directory", "providers"],
      ["billing"],
      ["billing", "payment-config"],
      ["billing", "public-config"],
      ["auth"],
      ["auth", "token"],
      ["etc", "passwd"],
      ["proc", "self", "environ"],
      [".env"],
      ["cmd.exe"],
      ["eval"],
      ["rx-upload-bypass"],
      ["queue-display-attack"],
    ];

    for (const slug of adversarialNonAllowlistedSlugs) {
      test(`GET /public/${slug.join("/")} unconditionally returns 404`, async () => {
        expect(routeHandler?.GET).toBeDefined();

        const req = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`);
        const res = await routeHandler!.GET!(req, {
          params: Promise.resolve({ slug }),
        });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.message).toMatch(/deprecated|not found/i);
      });

      test(`POST /public/${slug.join("/")} unconditionally returns 404`, async () => {
        expect(routeHandler?.POST).toBeDefined();

        const req = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`, {
          method: "POST",
          body: JSON.stringify({ exploit: true }),
        });
        const res = await routeHandler!.POST!(req, {
          params: Promise.resolve({ slug }),
        });

        expect(res.status).toBe(404);
        const data = await res.json();
        expect(data.success).toBe(false);
        expect(data.message).toMatch(/deprecated|not found/i);
      });
    }

    test("ADVERSARIAL STRESS: Path traversal through allowlisted prefix 'rx-upload/../../patients'", async () => {
      // Stress-testing assumption: Can an attacker escape rx-upload prefix using ../ segments?
      const traversalSlug = ["rx-upload", "..", "..", "patients"];
      const subPath = traversalSlug.join("/");
      
      // Let's verify what isAllowlistedPath does with rx-upload/../../patients
      const allowed = ["rx-upload", "queue/display"];
      const bypassesAllowlist = allowed.some(
        (prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`)
      );

      // Observation: 'rx-upload/../../patients' starts with 'rx-upload/'!
      expect(bypassesAllowlist).toBe(true);
    });

    test("Mitigation verification: routeHandler strictly rejects path traversal with 404", async () => {
      expect(routeHandler?.GET).toBeDefined();
      expect(routeHandler?.POST).toBeDefined();

      const traversalSlugs = [
        ["rx-upload", "..", "..", "patients"],
        ["queue", "display", "..", "..", "admin"],
        ["rx-upload", ".."],
      ];

      for (const slug of traversalSlugs) {
        const reqGet = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`);
        const resGet = await routeHandler!.GET!(reqGet, {
          params: Promise.resolve({ slug }),
        });
        expect(resGet.status).toBe(404);

        const reqPost = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`, {
          method: "POST",
          body: JSON.stringify({ exploit: true }),
        });
        const resPost = await routeHandler!.POST!(reqPost, {
          params: Promise.resolve({ slug }),
        });
        expect(resPost.status).toBe(404);
      }
    });
  });

  describe("Probe 3 & 7 BFF Routes Elimination: Deletion Verification", () => {
    const deletedBffRoutes = [
      "src/app/api/v1/admin/newsletter-subscribers/route.ts",
      "src/app/api/v1/public/contact/route.ts",
      "src/app/api/v1/public/newsletter/route.ts",
      "src/app/api/v1/public/join/route.ts",
      "src/app/api/v1/public/join/validate/[code]/route.ts",
      "src/app/api/v1/patients/me/route.ts",
      "src/app/api/v1/patients/claim-intake/route.ts",
    ];

    for (const relPath of deletedBffRoutes) {
      test(`BFF Route must NOT exist: ${relPath}`, () => {
        const fullPath = path.join(WORKSPACE_ROOT, relPath);
        expect(fs.existsSync(fullPath)).toBe(false);
      });
    }
  });

  describe("Probe 3: Zero Client Invocations of Deleted BFF Routes in src/", () => {
    function getAllTsFiles(dir: string): string[] {
      const results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const filePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...getAllTsFiles(filePath));
        } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
          results.push(filePath);
        }
      }
      return results;
    }

    test(
      "No frontend files call deleted BFF routes",
      () => {
        const srcDir = path.join(WORKSPACE_ROOT, "src");
        const files = getAllTsFiles(srcDir);

        const forbiddenCalls = [
          "/api/v1/public/contact",
          "/api/v1/public/newsletter",
          "/api/v1/public/join",
          "/api/v1/patients/me",
          "/api/v1/patients/claim-intake",
          "/api/v1/admin/newsletter-subscribers",
        ];

        const violations: string[] = [];
        for (const file of files) {
          // Skip [...slug] route itself
          if (file.includes("[...slug]")) continue;

          const content = fs.readFileSync(file, "utf-8");
          for (const forbidden of forbiddenCalls) {
            if (
              content.includes(`"${forbidden}"`) ||
              content.includes(`'${forbidden}'`) ||
              content.includes(`\`${forbidden}\``)
            ) {
              violations.push(`${path.relative(WORKSPACE_ROOT, file)}: ${forbidden}`);
            }
          }
        }

        expect(violations).toEqual([]);
      },
      { timeout: 20000 }
    );
  });

  describe("Probe 5: Configuration Cleanup & Elimination of ClinicApiUrl", () => {
    const repoRoot = path.resolve(WORKSPACE_ROOT, "../..");

    test("services/portal-api appsettings files contain PatientApiUrl and ZERO ClinicApiUrl", () => {
      const prodSettingsPath = path.join(
        repoRoot,
        "services/portal-api/ClinicEz.Portal.Api/appsettings.json"
      );
      const devSettingsPath = path.join(
        repoRoot,
        "services/portal-api/ClinicEz.Portal.Api/appsettings.Development.json"
      );

      const prod = fs.readFileSync(prodSettingsPath, "utf-8");
      expect(prod).toContain('"PatientApiUrl": "http://patient-api:8080"');
      expect(prod).not.toContain("ClinicApiUrl");

      const dev = fs.readFileSync(devSettingsPath, "utf-8");
      expect(dev).toContain('"PatientApiUrl": "http://patient-api:8080"');
      expect(dev).not.toContain("ClinicApiUrl");
    });

    test("deploy/portal-api files contain SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const composePath = path.join(
        repoRoot,
        "deploy/portal-api/docker-compose.yml"
      );
      const envPath = path.join(
        repoRoot,
        "deploy/portal-api/.env.example"
      );

      const compose = fs.readFileSync(composePath, "utf-8");
      expect(compose).toContain("SERVICES_PATIENT_API_URL");
      expect(compose).not.toContain("SERVICES_CLINIC_API_URL");

      const env = fs.readFileSync(envPath, "utf-8");
      expect(env).toContain("SERVICES_PATIENT_API_URL");
      expect(env).not.toContain("SERVICES_CLINIC_API_URL");
    });

    test(".github/workflows deploy workflows contain SERVICES_PATIENT_API_URL and ZERO SERVICES_CLINIC_API_URL", () => {
      const devWfPath = path.join(
        repoRoot,
        ".github/workflows/deploy-portal-api-dev.yml"
      );
      const prodWfPath = path.join(
        repoRoot,
        ".github/workflows/deploy-portal-api-prod.yml"
      );

      const devWf = fs.readFileSync(devWfPath, "utf-8");
      expect(devWf).toContain("SERVICES_PATIENT_API_URL");
      expect(devWf).not.toContain("SERVICES_CLINIC_API_URL");

      const prodWf = fs.readFileSync(prodWfPath, "utf-8");
      expect(prodWf).toContain("SERVICES_PATIENT_API_URL");
      expect(prodWf).not.toContain("SERVICES_CLINIC_API_URL");
    });
  });
});
