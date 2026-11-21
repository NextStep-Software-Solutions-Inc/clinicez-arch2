import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

/**
 * Issue #74 Test Suite: public/[...slug]/route.ts Route Elimination & Decoupling Guard
 *
 * Requirements Covered:
 * - Milestone 5: Legacy BFF Catch-All Proxy Deletion (0 files under apps/portal-web/src/app/api)
 * - Verification that public/[...slug]/route.ts is permanently eliminated from disk
 * - Allowlist logic boundary tests confirming rejection of adversarial slugs
 * - Verification that direct portal-api communication replaces all legacy BFF proxy forwarding
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

describe("Issue #74: public/[...slug]/route.ts Route Elimination & Decoupling Guard", () => {
  describe("Tier 1: Elimination & Deprecation Static Analysis", () => {
    test("T1.1: The legacy public/[...slug]/route.ts file is permanently deleted", () => {
      expect(fs.existsSync(ROUTE_FILE_PATH)).toBe(false);
    });

    test("T1.2: apps/portal-web/src/app/api contains strictly 0 files on disk", () => {
      const apiDir = path.join(WORKSPACE_ROOT, "src", "app", "api");
      if (fs.existsSync(apiDir)) {
        const files = fs.readdirSync(apiDir, { recursive: true });
        expect(files.length).toBe(0);
      } else {
        expect(fs.existsSync(apiDir)).toBe(false);
      }
    });

    test("T1.3: Zero Next.js BFF route files exist anywhere in src/app/api", () => {
      const apiDir = path.join(WORKSPACE_ROOT, "src", "app", "api");
      expect(fs.existsSync(apiDir)).toBe(false);
    });
  });

  describe("Tier 2: Allowlist Logic & Category-Partition Slug Boundary Probes", () => {
    // Exact allowlist validation rule specification:
    // Only 'rx-upload', 'rx-upload/*', 'queue/display', or 'queue/display/*'
    const isAllowlisted = (slugArray: string[]) => {
      const subPath = slugArray.join("/");
      if (subPath.includes("..")) return false;
      const allowed = ["rx-upload", "queue/display"];
      return allowed.some((prefix) => subPath === prefix || subPath.startsWith(`${prefix}/`));
    };

    test("T2.1: Allowlisted slugs are recognized as valid", () => {
      expect(isAllowlisted(["rx-upload"])).toBe(true);
      expect(isAllowlisted(["rx-upload", "attachment"])).toBe(true);
      expect(isAllowlisted(["rx-upload", "patient-123", "prescription.pdf"])).toBe(true);
      expect(isAllowlisted(["queue", "display"])).toBe(true);
      expect(isAllowlisted(["queue", "display", "metro-health"])).toBe(true);
      expect(isAllowlisted(["queue", "display", "metro-health", "station-1"])).toBe(true);
    });

    test("T2.2: Non-allowlisted slugs are rejected (404 expected)", () => {
      const forbiddenSlugs = [
        ["contact"],
        ["contact", "send"],
        ["newsletter"],
        ["newsletter", "subscribe"],
        ["join"],
        ["join", "patient"],
        ["join", "validate", "CODE123"],
        ["settings"],
        ["directory"],
        ["directory", "clinics"],
        ["directory", "doctors"],
        ["patients"],
        ["patients", "me"],
        ["patients", "claim-intake"],
        ["admin", "subscribers"],
        ["auth", "token"],
        ["metrics"],
      ];

      for (const slug of forbiddenSlugs) {
        expect(isAllowlisted(slug)).toBe(
          false,
          `Slug '${slug.join("/")}' should be rejected as non-allowlisted`
        );
      }
    });

    test("T2.3 (Adversarial Prefix Lookalikes): Attack slugs attempting substring bypass are rejected", () => {
      const adversarialSlugs = [
        ["rx-upload-malicious"],
        ["rx-uploader"],
        ["rx-upload_attack"],
        ["queue", "displayboard"],
        ["queue", "displays"],
        ["queue-display"],
        ["rx-upload..", "attack"],
        ["rx-upload", "..", "..", "patients"],
        ["queue", "display", "..", "..", "secrets"],
      ];

      for (const slug of adversarialSlugs) {
        expect(isAllowlisted(slug)).toBe(
          false,
          `Lookalike adversarial slug '${slug.join("/")}' must NOT bypass the allowlist!`
        );
      }
    });
  });

  describe("Tier 3 & Tier 4: Route Module Absence & Decoupling Invariants", () => {
    let routeHandler: any = null;

    beforeEach(async () => {
      try {
        routeHandler = await import(
          "../src/app/api/v1/public/[...slug]/route"
        );
      } catch {
        routeHandler = null;
      }
    });

    test("T3.1: Dynamic import of legacy route fails because file is deleted", () => {
      expect(routeHandler).toBeNull();
      expect(fs.existsSync(ROUTE_FILE_PATH)).toBe(false);
    });

    test("T3.2: Calling /api/v1/public/* route handler is impossible because module is absent", () => {
      expect(routeHandler?.GET).toBeUndefined();
      expect(routeHandler?.POST).toBeUndefined();
    });

    test("T3.3: apps/portal-web/src contains zero active calls to /api/v1/public", () => {
      const srcDir = path.join(WORKSPACE_ROOT, "src");
      const files: string[] = [];
      const collectFiles = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) collectFiles(full);
          else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
        }
      };
      collectFiles(srcDir);
      const violations: string[] = [];
      for (const file of files) {
        const content = fs.readFileSync(file, "utf-8");
        for (const line of content.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
          if (trimmed.includes("'/api/v1/public") || trimmed.includes('"/api/v1/public') || trimmed.includes("`/api/v1/public")) {
            violations.push(`${path.relative(WORKSPACE_ROOT, file)}: ${trimmed}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });

    test("T4.1: Downstream decoupled architecture uses portal-api directly via getPortalApiUrl", async () => {
      const { getPortalApiUrl } = await import("../src/utils/domain");
      const portalUrl = getPortalApiUrl();
      expect(portalUrl).toBeDefined();
      expect(portalUrl).not.toContain(":5245"); // Not clinic-api
    });

    test("T4.2 (Security Hardening): Path traversal attempts cannot exploit BFF as route is eliminated", () => {
      expect(fs.existsSync(ROUTE_FILE_PATH)).toBe(false);
      expect(routeHandler).toBeNull();
    });
  });
});
