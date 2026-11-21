import { describe, expect, test, mock, beforeAll, beforeEach, afterEach } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  sendContactUsMessage,
  getPublicContactInfo,
  DEFAULT_CONTACT_INFO,
} from "../src/services/contact.service";
import { apiBaseUrl } from "../src/transport/apiClient";
import type { PatientJoinRequestedPayload } from "../src/components/join/types";

describe("Cloudflare Turnstile Complete Removal & Direct Transport Suite", () => {
  const portalWebRoot = resolve(__dirname, "..");
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("Architectural Deletion Assertions", () => {
    test("T1.1: TurnstileWidget component and folder do not exist", () => {
      const widgetPath = join(portalWebRoot, "src/components/turnstile/TurnstileWidget.tsx");
      const turnstileDir = join(portalWebRoot, "src/components/turnstile");
      expect(existsSync(widgetPath)).toBe(false);
      expect(existsSync(turnstileDir)).toBe(false);
    });

    test("T1.2: Turnstile library helper does not exist", () => {
      const libPath = join(portalWebRoot, "src/lib/turnstile.ts");
      expect(existsSync(libPath)).toBe(false);
    });

    test("T1.3: Redundant Next.js BFF public routes do not exist", () => {
      const contactRoute = join(portalWebRoot, "src/app/api/v1/public/contact/route.ts");
      const newsletterRoute = join(portalWebRoot, "src/app/api/v1/public/newsletter/route.ts");
      const joinRoute = join(portalWebRoot, "src/app/api/v1/public/join/route.ts");

      expect(existsSync(contactRoute)).toBe(false);
      expect(existsSync(newsletterRoute)).toBe(false);
      expect(existsSync(joinRoute)).toBe(false);
    });

    test("T1.4: Legacy turnstile unit test file does not exist", () => {
      const oldTestPath = join(portalWebRoot, "tests/turnstile.test.ts");
      expect(existsSync(oldTestPath)).toBe(false);
    });

    test("T1.5: .env.example does not contain Turnstile environment variables", () => {
      const envExamplePath = join(portalWebRoot, ".env.example");
      expect(existsSync(envExamplePath)).toBe(true);
      const content = readFileSync(envExamplePath, "utf-8");
      expect(content).not.toContain("NEXT_PUBLIC_TURNSTILE_SITE_KEY");
      expect(content).not.toContain("TURNSTILE_SECRET_KEY");
      expect(content.toLowerCase()).not.toContain("turnstile");
    });
  });

  describe("Static Source Code Residue Audit", () => {
    let cachedSrcFiles: Array<{ path: string; content: string; lowerContent: string }> = [];

    function getAllFiles(dir: string, extensions: string[]): string[] {
      let results: string[] = [];
      if (!existsSync(dir)) return results;
      const list = readdirSync(dir);
      for (const file of list) {
        const fullPath = join(dir, file);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          results = results.concat(getAllFiles(fullPath, extensions));
        } else if (extensions.some((ext) => file.endsWith(ext))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    beforeAll(() => {
      const srcDir = join(portalWebRoot, "src");
      const files = getAllFiles(srcDir, [".ts", ".tsx", ".js", ".jsx", ".json", ".mjs"]);
      cachedSrcFiles = files.map((path) => {
        const content = readFileSync(path, "utf-8");
        return { path, content, lowerContent: content.toLowerCase() };
      });
    });

    test("T2.1: apps/portal-web/src contains zero references to challenges.cloudflare.com", () => {
      const matches = cachedSrcFiles
        .filter((f) => f.lowerContent.includes("challenges.cloudflare.com"))
        .map((f) => f.path);

      expect(matches).toEqual([]);
    });

    test("T2.2: apps/portal-web/src contains zero references to LOCAL-OFFLINE-BYPASS", () => {
      const matches = cachedSrcFiles
        .filter((f) => f.content.includes("LOCAL-OFFLINE-BYPASS"))
        .map((f) => f.path);

      expect(matches).toEqual([]);
    });

    test("T2.3: apps/portal-web/src contains zero occurrences of 'turnstile'", () => {
      const matches = cachedSrcFiles
        .filter((f) => f.lowerContent.includes("turnstile"))
        .map((f) => f.path);

      expect(matches).toEqual([]);
    });
  });

  describe("Direct API Transport & Payload Validation", () => {
    test("T3.1: sendContactUsMessage dispatches directly to portal-api without turnstileToken", async () => {
      let capturedUrl = "";
      let capturedMethod = "";
      let capturedBody: Record<string, unknown> | null = null;

      globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
        capturedUrl = url.toString();
        capturedMethod = init?.method || "GET";
        capturedBody = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : null;
        return new Response(JSON.stringify({ success: true, message: "Inquiry received" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof globalThis.fetch;

      const result = await sendContactUsMessage({
        name: "Dr. Juan dela Cruz",
        email: "juan@clinicez.ph",
        message: "Requesting a demo for multi-tenant clinics.",
      });

      expect(capturedUrl).toBe(`${apiBaseUrl}/contact`);
      expect(capturedMethod).toBe("POST");
      expect(capturedBody).toEqual({
        name: "Dr. Juan dela Cruz",
        email: "juan@clinicez.ph",
        message: "Requesting a demo for multi-tenant clinics.",
      });
      expect(capturedBody?.turnstileToken).toBeUndefined();
      expect(result.success).toBe(true);
    });

    test("T3.2: sendContactUsMessage surfaces rate limit (HTTP 429) friendly error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ message: "Rate limit exceeded" }), {
          status: 429,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof globalThis.fetch;

      expect(
        sendContactUsMessage({
          name: "Test",
          email: "test@example.com",
          message: "Hello",
        })
      ).rejects.toThrow(/Too many contact requests from your network/);
    });

    test("T3.3: sendContactUsMessage surfaces service unavailable (HTTP 503) friendly error", async () => {
      globalThis.fetch = mock(async () => {
        return new Response(JSON.stringify({ message: "Service unavailable" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown as typeof globalThis.fetch;

      expect(
        sendContactUsMessage({
          name: "Test",
          email: "test@example.com",
          message: "Hello",
        })
      ).rejects.toThrow(/Contact messages are temporarily unavailable right now/);
    });

    test("T3.4: getPublicContactInfo fetches from portal-api and falls back gracefully", async () => {
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        expect(url.toString()).toBe(`${apiBaseUrl}/contact/info`);
        return new Response(
          JSON.stringify({
            headquartersAddress: "Custom HQ CDO",
            supportEmail: "custom-support@clinicez.ph",
            salesEmail: "custom-sales@clinicez.ph",
            phoneNumber: "+63 999 123 4567",
            operatingHours: "8am - 5pm",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }) as unknown as typeof globalThis.fetch;

      const info = await getPublicContactInfo();
      expect(info.headquartersAddress).toBe("Custom HQ CDO");
      expect(info.supportEmail).toBe("custom-support@clinicez.ph");

      // Test fallback on failure
      globalThis.fetch = mock(async () => {
        throw new Error("Network error");
      }) as unknown as typeof globalThis.fetch;

      const fallback = await getPublicContactInfo();
      expect(fallback.headquartersAddress).toBe(DEFAULT_CONTACT_INFO.headquartersAddress);
      expect(fallback.supportEmail).toBe(DEFAULT_CONTACT_INFO.supportEmail);
    });

    test("T3.5: PatientJoinRequestedPayload TypeScript interface excludes turnstileToken", () => {
      const payload: PatientJoinRequestedPayload = {
        tenantSlug: "metro-health",
        facilitySlug: "main-branch",
        joinCode: "MH-2026",
        firstName: "Maria",
        lastName: "Santos",
        dateOfBirth: "1990-05-15",
        sex: "Female",
        contactNumber: "+639171234567",
      };

      expect(payload.tenantSlug).toBe("metro-health");
      expect(payload.firstName).toBe("Maria");
      // @ts-expect-error turnstileToken should not exist on PatientJoinRequestedPayload
      expect(payload.turnstileToken).toBeUndefined();
    });
  });
});
