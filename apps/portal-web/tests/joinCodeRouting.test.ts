import { describe, test, expect, mock } from "bun:test";
import { resolveJoinRoute, isProxyPublicRoute } from "../src/lib/join";
import { joinService } from "../src/services/join.service";

describe("Direct /join/{code} Zero-Enumeration Security & Routing", () => {
  test("C1.1: Root /join is recognized as a public join route", () => {
    expect(isProxyPublicRoute("/join")).toBe(true);
    expect(isProxyPublicRoute("/join/")).toBe(true);
    const resolved = resolveJoinRoute("/join", new URLSearchParams());
    expect(resolved.isJoinRoute).toBe(true);
    expect(resolved.routeType).toBe("code-join");
  });

  test("C1.2: Direct /join/{code} is recognized as a public join route", () => {
    expect(isProxyPublicRoute("/join/APEX2026")).toBe(true);
    expect(isProxyPublicRoute("/join/K8P2MN9X")).toBe(true);
    expect(isProxyPublicRoute("/api/v1/public/join/validate/APEX2026")).toBe(true);
  });

  test("C1.3: Non-join private paths are strictly blocked from auth bypass", () => {
    expect(isProxyPublicRoute("/admin/facilities")).toBe(false);
    expect(isProxyPublicRoute("/apex/dashboard/branches")).toBe(false);
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
