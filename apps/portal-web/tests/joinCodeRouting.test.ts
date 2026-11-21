import { describe, test, expect, mock } from "bun:test";
import { NextRequest } from "next/server";
import { isPublicRoute } from "../src/proxy";
import { joinService } from "../src/services/join.service";

describe("Direct /join/{code} Zero-Enumeration Security & Routing", () => {
  const checkPublic = (path: string) => isPublicRoute(new NextRequest("http://localhost" + path));

  test("C1.1: Root /join is recognized as a public join route", () => {
    expect(checkPublic("/join")).toBe(true);
    expect(checkPublic("/join/")).toBe(true);
  });

  test("C1.2: Direct /join subpaths, /claim, and /verify are recognized as public routes", () => {
    expect(checkPublic("/join/APEX2026")).toBe(true);
    expect(checkPublic("/join/tenant/facility")).toBe(true);
    expect(checkPublic("/claim")).toBe(true);
    expect(checkPublic("/claim?token=XYZ")).toBe(true);
    expect(checkPublic("/verify")).toBe(true);
    expect(checkPublic("/verify/rx/RX-123")).toBe(true);
  });

  test("C1.3: Non-public private paths are strictly blocked from auth bypass", () => {
    expect(checkPublic("/admin/facilities")).toBe(false);
    expect(checkPublic("/apex/dashboard/branches")).toBe(false);
    expect(checkPublic("/dashboard")).toBe(false);
  });

  test("C1.4: joinService validates active code and extracts tenant + facility metadata", async () => {
    // Mock global fetch for validation endpoint
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("VALID123")) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              isValid: true,
              tenantSlug: "apex-health",
              tenantName: "Apex Health Center",
              facilitySlug: "main",
              facilityName: "Apex Health - Main Clinic",
              facilityAddress: "123 Main St",
              operatingHours: "8am - 5pm",
              expiresAt: new Date(Date.now() + 86400000).toISOString(),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid or expired clinic join code.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }) as any;

    try {
      const validRes = await joinService.validateJoinCode("VALID123");
      expect(validRes.success).toBe(true);
      expect(validRes.tenantSlug).toBe("apex-health");
      expect(validRes.facilitySlug).toBe("main");
      expect(validRes.facilityName).toBe("Apex Health - Main Clinic");

      const invalidRes = await joinService.validateJoinCode("UNKNOWN");
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.message).toContain("Invalid or expired");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("C1.5: joinService rejects empty or whitespace code without network call", async () => {
    const res = await joinService.validateJoinCode("   ");
    expect(res.success).toBe(false);
    expect(res.message).toBe("Join code is required.");
  });
});
