import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { createRouteMatcher } from "@clerk/nextjs/server";
import { generateQrMatrix, buildQrPathData, buildQrSvgString } from "../src/components/join/qrGenerator";
import { generateDigitalPass, resolveJoinRoute, validateFileUpload, sanitizeCustomFields } from "../src/lib/join";
import { validatePhilHealthPinMod11 } from "../src/lib/philhealth";

const PORTAL_ROOT = path.resolve(__dirname, "..");

// =============================================================================
// CHALLENGER SUITE 1: Legacy Route Absence & Clean 404
// =============================================================================

describe("Challenger Suite 1: Legacy Route Absence & 404 Verification", () => {
  test("C1.1: Filesystem audit confirms 0 student-intake files in portal-web src/", () => {
    function findFiles(dir: string, pattern: RegExp): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findFiles(fullPath, pattern));
        } else if (pattern.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const srcDir = path.join(PORTAL_ROOT, "src");
    const matchedFiles = findFiles(srcDir, /student-intake/i);
    expect(matchedFiles).toHaveLength(0);
  });

  test("C1.2: App Router directory has no student-intake routes (returns 404)", () => {
    const legacyPageDir = path.join(PORTAL_ROOT, "src", "app", "student-intake");
    const legacyApiDir = path.join(PORTAL_ROOT, "src", "app", "api", "v1", "public", "student-intake");

    expect(fs.existsSync(legacyPageDir)).toBe(false);
    expect(fs.existsSync(legacyApiDir)).toBe(false);
  });

  test("C1.3: Clerk proxy does NOT whitelist legacy /student-intake routes as public", () => {
    const isPublicRoute = createRouteMatcher([
      "/upload(.*)",
      "/join(.*)",
      "/api/v1/public(.*)",
    ]);

    const reqLegacy1 = new NextRequest("http://localhost/student-intake");
    const reqLegacy2 = new NextRequest("http://localhost/student-intake/ustp");
    const reqLegacy3 = new NextRequest("http://localhost/student-intake/metro-health/submit");

    expect(isPublicRoute(reqLegacy1)).toBe(false);
    expect(isPublicRoute(reqLegacy2)).toBe(false);
    expect(isPublicRoute(reqLegacy3)).toBe(false);
  });
});

// =============================================================================
// CHALLENGER SUITE 2: Proxy Route Matching Stress & Security Boundaries
// =============================================================================

describe("Challenger Suite 2: Proxy Route Matching Stress & Security Boundaries", () => {
  const isPublicRoute = createRouteMatcher([
    "/upload(.*)",
    "/join(.*)",
    "/api/v1/public(.*)",
  ]);

  const isProtectedRoute = createRouteMatcher([
    "/:tenant/dashboard(.*)",
    "/sync-auth(.*)",
    "/admin(.*)",
  ]);

  test("C2.1: Public join and relay routes bypass authentication", () => {
    const publicPaths = [
      "/join/acme-health",
      "/join/acme-health/main-clinic",
      "/join/acme-health/main-clinic/",
      "/join/acme-health/main-clinic?code=SECURE123",
      "/join/multi/nested/facility/branch",
      "/join",
      "/join/",
      "/api/v1/public/join",
      "/api/v1/public/join?source=qr",
      "/upload",
      "/upload/documents/sample",
    ];

    for (const p of publicPaths) {
      const req = new NextRequest("http://localhost" + p);
      expect(isPublicRoute(req)).toBe(true);
    }
  });

  test("C2.2: Protected clinical and administrative routes remain strictly protected", () => {
    const protectedPaths = [
      "/acme-health/dashboard",
      "/acme-health/dashboard/patients",
      "/acme-health/dashboard/settings",
      "/sync-auth",
      "/sync-auth/callback",
      "/admin",
      "/admin/tenants",
      "/admin/users",
    ];

    for (const p of protectedPaths) {
      const req = new NextRequest("http://localhost" + p);
      expect(isPublicRoute(req)).toBe(false);
      expect(isProtectedRoute(req)).toBe(true);
    }
  });

  test("C2.3: Unwhitelisted sensitive paths do not bypass authentication", () => {
    const unwhitelistedPaths = [
      "/dashboard",
      "/clinical/consultations",
      "/api/v1/clinics",
      "/api/v1/private/join",
      "/api/v1/patients",
      "/settings/security",
    ];

    for (const p of unwhitelistedPaths) {
      const req = new NextRequest("http://localhost" + p);
      expect(isPublicRoute(req)).toBe(false);
    }
  });

  test("C2.4: Join route resolver extracts tenant, facility and join code correctly", () => {
    const res1 = resolveJoinRoute("/join/acme-health", new URLSearchParams());
    expect(res1.isJoinRoute).toBe(true);
    expect(res1.routeType).toBe("tenant-picker");
    expect(res1.tenantSlug).toBe("acme-health");
    expect(res1.facilitySlug).toBeUndefined();

    const res2 = resolveJoinRoute(
      "/join/acme-health/main-clinic",
      new URLSearchParams("code=ACME2026")
    );
    expect(res2.isJoinRoute).toBe(true);
    expect(res2.routeType).toBe("locked-facility");
    expect(res2.tenantSlug).toBe("acme-health");
    expect(res2.facilitySlug).toBe("main-clinic");
    expect(res2.joinCode).toBe("ACME2026");
  });
});

// =============================================================================
// CHALLENGER SUITE 3: QR Code Generator & SVG Well-Formedness Stress
// =============================================================================

describe("Challenger Suite 3: QR Code Generator & SVG Well-Formedness Stress", () => {
  test("C3.1: QR SVG generates valid XML with well-formed root, viewBox, and quiet zone", () => {
    const matrix = generateQrMatrix("TEST-DATA");
    const svg = buildQrSvgString(matrix);

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');

    const totalSize = matrix.size + 4; // 2 padding each side
    expect(svg).toContain(`viewBox="0 0 ${totalSize} ${totalSize}"`);
    expect(svg).toContain("<rect");
    expect(svg).toContain("<path");
  });

  test("C3.2: Path data contains valid SVG path commands without NaN or undefined coordinates", () => {
    const matrix = generateQrMatrix(JSON.stringify({ code: "PAT-2026-00042", queue: "Q-105" }));
    const pathData = buildQrPathData(matrix.modules);

    expect(pathData.length).toBeGreaterThan(0);
    expect(pathData).not.toContain("NaN");
    expect(pathData).not.toContain("undefined");

    // All path segments must match M{c},{r}h1v1h-1Z
    const commands = pathData.split(" ").filter(Boolean);
    for (const cmd of commands) {
      expect(/^M\d+,\d+h1v1h-1Z$/.test(cmd)).toBe(true);
    }
  });

  test("C3.3: Stress-tests QR matrix generator with boundary and adversarial inputs", () => {
    const inputs = [
      "", // Empty string
      "A", // Single character
      "X".repeat(50), // Exactly 50 chars (boundary between V4 and V5)
      "X".repeat(51), // Exactly 51 chars (triggers V5)
      "X".repeat(120), // Standard JSON pass length
      "X".repeat(500), // Oversized payload
      JSON.stringify({ code: "PAT-01", queue: "Q-001", special: '<script>alert("xss")</script>' }),
      "José Niño — UTF-8 Characters: ü ñ 漢 語 🚀",
    ];

    for (const input of inputs) {
      expect(() => {
        const m = generateQrMatrix(input);
        expect(m.size).toBeGreaterThan(0);
        expect(m.modules.length).toBe(m.size);
        expect(m.modules[0].length).toBe(m.size);

        const svg = buildQrSvgString(m);
        expect(svg).toContain("<svg");
        expect(svg).toContain("</svg>");
      }).not.toThrow();
    }
  });

  test("C3.4: Finder patterns are accurately positioned at corners", () => {
    const m = generateQrMatrix("TEST_FINDERS");
    const { size, modules } = m;

    // Top-left finder center (row 3, col 3) must be true (black module)
    expect(modules[3][3]).toBe(true);
    // Top-left finder outer ring corners
    expect(modules[0][0]).toBe(true);
    expect(modules[0][6]).toBe(true);
    expect(modules[6][0]).toBe(true);
    expect(modules[6][6]).toBe(true);

    // Top-right finder outer ring corner
    expect(modules[0][size - 7]).toBe(true);
    expect(modules[0][size - 1]).toBe(true);

    // Bottom-left finder outer ring corner
    expect(modules[size - 7][0]).toBe(true);
    expect(modules[size - 1][0]).toBe(true);
  });
});

// =============================================================================
// CHALLENGER SUITE 4: Digital Pass Payload Preservation & Formatting
// =============================================================================

describe("Challenger Suite 4: Digital Pass Payload Preservation & Formatting", () => {
  test("C4.1: Queue token formats with 3-digit zero-padding across boundary sequence values", () => {
    expect(generateDigitalPass("PAT-001", 1, "Patient A").queueToken).toBe("Q-001");
    expect(generateDigitalPass("PAT-002", 9, "Patient B").queueToken).toBe("Q-009");
    expect(generateDigitalPass("PAT-003", 10, "Patient C").queueToken).toBe("Q-010");
    expect(generateDigitalPass("PAT-004", 105, "Patient D").queueToken).toBe("Q-105");
    expect(generateDigitalPass("PAT-005", 999, "Patient E").queueToken).toBe("Q-999");
    expect(generateDigitalPass("PAT-006", 1000, "Patient F").queueToken).toBe("Q-1000");
  });

  test("C4.2: Payload preservation: QR JSON string round-trip preserves all critical fields", () => {
    const patientCode = "PAT-2026-00042";
    const fullName = "Juan Dela Cruz";
    const pass = generateDigitalPass(patientCode, 105, fullName);

    expect(pass.patientCode).toBe(patientCode);
    expect(pass.patientName).toBe(fullName);
    expect(pass.queueToken).toBe("Q-105");

    // Timestamp must be a valid ISO 8601 string
    const parsedDate = new Date(pass.issuedAt);
    expect(isNaN(parsedDate.getTime())).toBe(false);
    expect(parsedDate.toISOString()).toBe(pass.issuedAt);

    // Deserialize QR payload
    const qrPayload = JSON.parse(pass.qrDataString);
    expect(qrPayload.code).toBe(patientCode);
    expect(qrPayload.queue).toBe("Q-105");
    expect(qrPayload.issued).toBe(pass.issuedAt);
  });
});

// =============================================================================
// CHALLENGER SUITE 5: API Relay & File Quarantine Validation
// =============================================================================

describe("Challenger Suite 5: API Relay & File Quarantine Validation", () => {
  test("C5.1: File upload dropzone enforces strict MIME types and 10MB bounds", () => {
    // Valid MIME types
    expect(validateFileUpload({ name: "xray.pdf", sizeBytes: 5_000_000, mimeType: "application/pdf" }).isValid).toBe(true);
    expect(validateFileUpload({ name: "photo.jpg", sizeBytes: 2_000_000, mimeType: "image/jpeg" }).isValid).toBe(true);
    expect(validateFileUpload({ name: "scan.png", sizeBytes: 1_000_000, mimeType: "image/png" }).isValid).toBe(true);

    // Invalid MIME types
    expect(validateFileUpload({ name: "script.sh", sizeBytes: 500, mimeType: "application/x-sh" }).isValid).toBe(false);
    expect(validateFileUpload({ name: "virus.exe", sizeBytes: 500, mimeType: "application/x-msdownload" }).isValid).toBe(false);
    expect(validateFileUpload({ name: "report.docx", sizeBytes: 500, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }).isValid).toBe(false);

    // Size limit boundary: exactly 10MB vs 10MB + 1 byte
    const tenMB = 10 * 1024 * 1024;
    expect(validateFileUpload({ name: "boundary.pdf", sizeBytes: tenMB, mimeType: "application/pdf" }).isValid).toBe(true);
    expect(validateFileUpload({ name: "overflow.pdf", sizeBytes: tenMB + 1, mimeType: "application/pdf" }).isValid).toBe(false);
  });

  test("C5.2: Sanitize custom fields strips hidden conditional fields", () => {
    const fields = [
      { fieldKey: "category", label: "Category", isRequired: true },
      {
        fieldKey: "student_id",
        label: "Student ID",
        isRequired: true,
        visibilityCondition: { parentKey: "category", operator: "equals" as const, value: "Student" },
      },
    ];

    const studentData = { category: "Student", student_id: "2026-0001" };
    expect(sanitizeCustomFields(fields, studentData)).toEqual({
      category: "Student",
      student_id: "2026-0001",
    });

    const staffData = { category: "Staff", student_id: "2026-0001" };
    expect(sanitizeCustomFields(fields, staffData)).toEqual({
      category: "Staff",
    });
  });

  test("C5.3: PhilHealth Mod-11 validation validates known check digits and rejects corruption", () => {
    // Valid test PIN: "01-025555555-5" -> let's compute check digit for 01025555555
    // Weights: [6, 5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
    // 0*6 + 1*5 + 0*4 + 2*3 + 5*2 + 5*7 + 5*6 + 5*5 + 5*4 + 5*3 + 5*2
    // = 0 + 5 + 0 + 6 + 10 + 35 + 30 + 25 + 20 + 15 + 10 = 156
    // 156 % 11 = 2 -> expectedCheckDigit = 11 - 2 = 9
    const validPin = "01-025555555-9";
    const resValid = validatePhilHealthPinMod11(validPin);
    expect(resValid.isValid).toBe(true);
    expect(resValid.expectedCheckDigit).toBe(9);
    expect(resValid.actualCheckDigit).toBe(9);

    // Corrupted PIN check digit
    const corruptPin = "01-025555555-8";
    const resCorrupt = validatePhilHealthPinMod11(corruptPin);
    expect(resCorrupt.isValid).toBe(false);
    expect(resCorrupt.errorMessage).toContain("Check digit mismatch");

    // Incomplete PIN
    const incomplete = "01-02555555";
    expect(validatePhilHealthPinMod11(incomplete).isValid).toBe(false);
    expect(validatePhilHealthPinMod11(incomplete).errorMessage).toContain("Incomplete PIN");
  });
});
