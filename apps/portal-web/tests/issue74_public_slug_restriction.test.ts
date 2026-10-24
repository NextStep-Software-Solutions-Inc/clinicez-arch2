import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { NextRequest } from "next/server";

/**
 * Issue #74 Test Suite: public/[...slug]/route.ts Route Restriction & Deprecation
 *
 * Requirements Covered:
 * - R2: Strip PORTAL_API_URL from public/[...slug]/route.ts
 * - R2: 404 Not Found for any non-allowlisted path (contact, newsletter, join, settings, directory/*)
 * - R2: Only rx-upload/* and queue/display/* are forwarded to CLINIC_API_URL
 * - R2: Explicit @deprecated notice in route header
 * - Adversarial prefix lookalikes and path traversal protection
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

describe("Issue #74: public/[...slug]/route.ts Route Restriction & Deprecation", () => {
  describe("Tier 1: Source Code Static Analysis", () => {
    test("T1.1: Source code contains zero references to PORTAL_API_URL", () => {
      expect(fs.existsSync(ROUTE_FILE_PATH)).toBe(true);
      const content = fs.readFileSync(ROUTE_FILE_PATH, "utf-8");

      expect(content).not.toContain("PORTAL_API_URL");
      expect(content).not.toContain("SERVICES_PORTAL_API_URL");
      expect(content).not.toContain("directory/");
    });

    test("T1.2: Source code declares explicit @deprecated architectural notice", () => {
      const content = fs.readFileSync(ROUTE_FILE_PATH, "utf-8");
      expect(content).toMatch(/@deprecated/i);
      expect(content).toMatch(/BFF/i);
    });

    test("T1.3: Source code strictly declares allowlisted prefixes (rx-upload, queue/display)", () => {
      const content = fs.readFileSync(ROUTE_FILE_PATH, "utf-8");
      expect(content).toContain("rx-upload");
      expect(content).toContain("queue/display");
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

  describe("Tier 3 & Tier 4: Live HTTP Route Handler Invocations (GET & POST)", () => {
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
      // Dynamic import to test the actual route module
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

    test("T3.1: GET handler returns 404 for forbidden non-allowlisted slugs", async () => {
      if (!routeHandler?.GET) {
        throw new Error("GET export not found in public/[...slug]/route.ts");
      }

      const req = new NextRequest("http://localhost:3000/api/v1/public/contact");
      const res = await routeHandler.GET(req, {
        params: Promise.resolve({ slug: ["contact"] }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toMatch(/deprecated|not found/i);
    });

    test("T3.2: POST handler returns 404 for forbidden non-allowlisted slugs", async () => {
      if (!routeHandler?.POST) {
        throw new Error("POST export not found in public/[...slug]/route.ts");
      }

      const req = new NextRequest("http://localhost:3000/api/v1/public/newsletter", {
        method: "POST",
        body: JSON.stringify({ email: "test@example.com" }),
      });
      const res = await routeHandler.POST(req, {
        params: Promise.resolve({ slug: ["newsletter"] }),
      });

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toMatch(/deprecated|not found/i);
    });

    test("T3.3: GET handler forwards allowlisted rx-upload to CLINIC_API_URL", async () => {
      if (!routeHandler?.GET) {
        throw new Error("GET export not found in public/[...slug]/route.ts");
      }

      let forwardedUrl = "";
      globalThis.fetch = mock((url: string | URL | Request) => {
        forwardedUrl = String(url);
        return Promise.resolve(
          new Response(JSON.stringify({ status: "ready" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }) as unknown as typeof globalThis.fetch;

      const req = new NextRequest("http://localhost:3000/api/v1/public/rx-upload/status");
      const res = await routeHandler.GET(req, {
        params: Promise.resolve({ slug: ["rx-upload", "status"] }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain("/public/rx-upload/status");
      expect(forwardedUrl).not.toContain("localhost:5238"); // Not portal-api
    });

    test("T3.4: GET handler forwards allowlisted queue/display to CLINIC_API_URL with query string", async () => {
      if (!routeHandler?.GET) {
        throw new Error("GET export not found in public/[...slug]/route.ts");
      }

      let forwardedUrl = "";
      globalThis.fetch = mock((url: string | URL | Request) => {
        forwardedUrl = String(url);
        return Promise.resolve(
          new Response(JSON.stringify({ nowServing: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      }) as unknown as typeof globalThis.fetch;

      const req = new NextRequest("http://localhost:3000/api/v1/public/queue/display/metro-health?station=Room1");
      const res = await routeHandler.GET(req, {
        params: Promise.resolve({ slug: ["queue", "display", "metro-health"] }),
      });

      expect(res.status).toBe(200);
      expect(forwardedUrl).toContain("/public/queue/display/metro-health?station=Room1");
    });

    test("T4.1 (Scenario & Resilience): Downstream network failure returns HTTP 502 Bad Gateway", async () => {
      if (!routeHandler?.GET) {
        throw new Error("GET export not found in public/[...slug]/route.ts");
      }

      globalThis.fetch = mock(() => {
        return Promise.reject(new Error("Connection refused to clinic-api"));
      }) as unknown as typeof globalThis.fetch;

      const req = new NextRequest("http://localhost:3000/api/v1/public/rx-upload/ping");
      const res = await routeHandler.GET(req, {
        params: Promise.resolve({ slug: ["rx-upload", "ping"] }),
      });

      expect(res.status).toBe(502);
      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.message).toContain("clinic");
    });

    test("T4.2 (Security Hardening): Path traversal attempts through allowlisted prefixes are rejected with HTTP 404", async () => {
      if (!routeHandler?.GET || !routeHandler?.POST) {
        throw new Error("Route exports not found in public/[...slug]/route.ts");
      }

      const traversalSlugs = [
        ["rx-upload", "..", "..", "patients"],
        ["queue", "display", "..", "..", "admin"],
      ];

      for (const slug of traversalSlugs) {
        const reqGet = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`);
        const resGet = await routeHandler.GET(reqGet, {
          params: Promise.resolve({ slug }),
        });
        expect(resGet.status).toBe(404);
        const jsonGet = await resGet.json();
        expect(jsonGet.success).toBe(false);
        expect(jsonGet.message).toMatch(/deprecated|not found/i);

        const reqPost = new NextRequest(`http://localhost:3000/api/v1/public/${slug.join("/")}`, {
          method: "POST",
          body: JSON.stringify({ exploit: true }),
        });
        const resPost = await routeHandler.POST(reqPost, {
          params: Promise.resolve({ slug }),
        });
        expect(resPost.status).toBe(404);
        const jsonPost = await resPost.json();
        expect(jsonPost.success).toBe(false);
        expect(jsonPost.message).toMatch(/deprecated|not found/i);
      }
    });
  });
});
