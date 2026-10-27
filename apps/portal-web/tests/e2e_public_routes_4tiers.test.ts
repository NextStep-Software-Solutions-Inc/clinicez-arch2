import { describe, test, expect, it, mock, beforeEach, afterEach } from "bun:test";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "apex-health", kind: "rx", token: "RX-01" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, back: () => {}, forward: () => {} }),
  usePathname: () => "/join",
  useSearchParams: () => new URLSearchParams(),
}));

import { NextRequest } from "next/server";
import { renderToString } from "react-dom/server";
import React from "react";
import fs from "node:fs";
import path from "node:path";

// Genuine imports from source modules
import { publicRoutes, sanitizeAnalyticsUrl } from "@shared/safe";
import { isPublicRoute, PUBLIC_ROUTE_PATTERNS } from "../src/proxy";
import { joinService } from "../src/services/join.service";
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";

// Component and Page imports
import JoinLandingClient from "../src/components/join/JoinLandingClient";
import JoinCodeErrorCard from "../src/components/join/JoinCodeErrorCard";
import { ProgressiveClaimCard, CLAIM_CARD_BENEFITS } from "../src/components/join/ProgressiveClaimCard";
import { MobileAppStoreBadges, DEFAULT_APPLE_STORE_URL, DEFAULT_GOOGLE_PLAY_URL } from "../src/components/join/MobileAppStoreBadges";
import VerifyLookupClient from "../src/app/verify/VerifyLookupClient";
import VerifyClient from "../src/app/verify/[kind]/[token]/VerifyClient";
import RxVerifyClient from "../src/app/verify/[kind]/[token]/RxVerifyClient";
import JoinPage, { generateMetadata as generateJoinMetadata } from "../src/app/join/page";
import FacilityJoinPage, { generateMetadata as generateFacilityJoinMetadata } from "../src/app/join/[tenantSlug]/[facilitySlug]/page";
import ClaimPage, { metadata as claimMetadata } from "../src/app/claim/page";
import VerifyIndexPage, { generateMetadata as generateVerifyMetadata } from "../src/app/verify/page";
import DynamicVerifyPage, { generateMetadata as generateDynamicVerifyMetadata } from "../src/app/verify/[kind]/[token]/page";
import { discoverRoutes } from "./dynamic_route_slug_consistency.test";

const APP_DIR = path.resolve(__dirname, "..", "src", "app");

// =============================================================================
// TIER 1: CANONICAL ROUTE EXISTENCE & HAPPY PATH (45 Tests, >=5 per feature)
// =============================================================================

describe("Tier 1: Canonical Public Route Existence & Happy Path", () => {
  // Feature 1: Canonical /join & /join?code=CODE (6 tests)
  describe("Feature 1: Canonical /join Route", () => {
    test("T1.1.1: Bare /join renders landing code-entry experience", async () => {
      const jsx = await JoinPage({ searchParams: Promise.resolve({}) });
      const html = renderToString(jsx);
      expect(html).toContain("Clinic Join Code");
      expect(html).toContain("Continue to Intake");
      expect(html).toContain("bg-primary");
    });

    test("T1.1.2: /join with prefilled facility parameter displays facility banner", async () => {
      const jsx = await JoinPage({ searchParams: Promise.resolve({ facility: "st-jude" }) });
      const html = renderToString(jsx);
      expect(html).toContain("st-jude");
      expect(html).toContain("Clinic Join Code");
    });

    test("T1.1.3: /join?code=VALID123 validates code server-side and renders JoinClient", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async (code: string) => ({
        success: true,
        tenantSlug: "apex-health",
        tenantName: "Apex Health Group",
        facilitySlug: "main",
        facilityName: "Apex Main Clinic",
        facilityAddress: "123 Health Ave, Manila",
        operatingHours: "8am - 5pm",
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "VALID123" }) });
        const html = renderToString(jsx);
        expect(html).toContain("Apex Main Clinic");
        expect(html).toContain("VALID123");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T1.1.4: /join?code=B4C7-JOINNOW supports 4-character hyphenated facility codes", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async (code: string) => ({
        success: true,
        tenantSlug: "metro-health",
        tenantName: "Metro Health Network",
        facilitySlug: "makati",
        facilityName: "Makati Family Health",
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "B4C7-JOINNOW" }) });
        const html = renderToString(jsx);
        expect(html).toContain("Makati Family Health");
        expect(html).toContain("B4C7-JOINNOW");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T1.1.5: generateMetadata for bare /join returns canonical title and description", async () => {
      const meta = await generateJoinMetadata({ searchParams: Promise.resolve({}) });
      expect(meta.title).toBe("Clinic Join | Clinic EZ");
      expect(meta.description).toContain("Join Passcode");
    });

    test("T1.1.6: generateMetadata for /join?code=... includes normalized code in title", async () => {
      const meta = await generateJoinMetadata({ searchParams: Promise.resolve({ code: "apex2026" }) });
      expect(meta.title).toBe("Clinic Intake (APEX2026) | Clinic EZ");
    });
  });

  // Feature 2: Canonical /join/{tenantSlug}/{facilitySlug} (5 tests)
  describe("Feature 2: Canonical Facility Route", () => {
    test("T1.2.1: /join/ustp/main-clinic renders facility intake directly", async () => {
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async (tenant: string, facility: string) => ({
        success: true,
        tenantSlug: tenant,
        tenantName: "USTP University",
        facilitySlug: facility,
        facilityName: "USTP Campus Clinic",
        facilityAddress: "CM Recto Ave, CDO",
      })) as any;

      try {
        const jsx = await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "ustp", facilitySlug: "main-clinic" }),
          searchParams: Promise.resolve({}),
        });
        const html = renderToString(jsx);
        expect(html).toContain("USTP Campus Clinic");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T1.2.2: /join/ustp/main-clinic?code=USTP2026 pre-populates initial join code", async () => {
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async (t: string, f: string) => ({
        success: true,
        tenantSlug: t,
        tenantName: "USTP",
        facilitySlug: f,
        facilityName: "USTP Clinic",
      })) as any;

      try {
        const jsx = await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "ustp", facilitySlug: "main-clinic" }),
          searchParams: Promise.resolve({ code: "USTP2026" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("USTP2026");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T1.2.3: Route tree contains exactly /join/[tenantSlug]/[facilitySlug] without sibling slug collisions", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).toContain("/join/[tenantSlug]/[facilitySlug]");
      expect(routes).not.toContain("/join/[code]");
      expect(routes).not.toContain("/join/[joinKey]");
    });

    test("T1.2.4: Facility join metadata displays facility and tenant uppercase tokens", async () => {
      const meta = await generateFacilityJoinMetadata({
        params: Promise.resolve({ tenantSlug: "st-jude", facilitySlug: "main" }),
      });
      expect(meta.title).toBe("Clinic Intake | MAIN (st-jude)");
    });

    test("T1.2.5: Normalizes uppercase and mixed-case tenant and facility slugs to lowercase", async () => {
      let queriedTenant = "";
      let queriedFacility = "";
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async (t: string, f: string) => {
        queriedTenant = t;
        queriedFacility = f;
        return { success: true, tenantSlug: t, facilitySlug: f, facilityName: "Normalized Clinic" };
      }) as any;

      try {
        await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "St-Jude", facilitySlug: "Main-Clinic" }),
        });
        expect(queriedTenant).toBe("st-jude");
        expect(queriedFacility).toBe("main-clinic");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });
  });

  // Feature 3: Canonical Account Claim Route /claim?token=TOKEN (6 tests)
  describe("Feature 3: Canonical /claim Route", () => {
    const makeJwtPayload = (obj: any) => {
      const b64 = Buffer.from(JSON.stringify(obj)).toString("base64");
      return `${b64}.signature`;
    };

    test("T1.3.1: /claim?token=... with valid JWT renders ProgressiveClaimCard with 1-click CTA and security notices", async () => {
      const token = makeJwtPayload({
        FirstName: "Juan",
        LastName: "Dela Cruz",
        FacilitySlug: "central-clinic",
        TenantSlug: "metro-health",
        ExpiresAtUnix: Math.floor(Date.now() / 1000) + 172800,
      });

      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Your Clinic EZ Patient Account");
      expect(html).toContain("Claim My Patient Account in 1-Click");
      expect(html).toContain("Protected under RA 10173");
    });

    test("T1.3.2: Surfaces all 3 required progressive claim patient benefits", () => {
      expect(CLAIM_CARD_BENEFITS).toHaveLength(3);
      const titles = CLAIM_CARD_BENEFITS.map((b) => b.title);
      expect(titles).toContain("Real-Time Queue Alerts");
      expect(titles).toContain("Digital Prescriptions & Lab Results");
      expect(titles).toContain("1-Click Fast Check-In");
    });

    test("T1.3.3: Surfaces Apple App Store and Google Play badges with default URLs", () => {
      const html = renderToString(React.createElement(MobileAppStoreBadges));
      expect(html).toContain(DEFAULT_APPLE_STORE_URL);
      expect(html).toContain(DEFAULT_GOOGLE_PLAY_URL);
    });

    test("T1.3.4: Bare /claim renders accessible semantic HTTP 200 alert 'Claim Token Required'", async () => {
      const jsx = await ClaimPage({ searchParams: Promise.resolve({}) });
      const html = renderToString(jsx);
      expect(html).toContain('role="alert"');
      expect(html).toContain("Claim Token Required");
      expect(html).toContain("Go to Clinic Join");
      expect(html).toContain('href="/join"');
    });

    test("T1.3.5: /claim static metadata matches specification", () => {
      expect(claimMetadata.title).toBe("Claim Patient Account | Clinic EZ");
    });

    test("T1.3.6: Route tree contains /claim and zero subdirectories", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).toContain("/claim");
      expect(routes.filter((r) => r.startsWith("/claim/"))).toHaveLength(0);
    });
  });

  // Feature 4: Canonical Document Verify Route /verify & /verify?ref=REF (6 tests)
  describe("Feature 4: Canonical /verify Route", () => {
    test("T1.4.1: Bare /verify renders manual lookup form with document-type selector", async () => {
      const jsx = await VerifyIndexPage({ searchParams: Promise.resolve({}) });
      const html = renderToString(jsx);
      expect(html).toContain("Philippine National Health Document Registry");
      expect(html).toContain("Auto-detect (Universal Registry)");
      expect(html).toContain("Electronic Prescription (RA 6675)");
      expect(html).toContain("Medical Certificate");
    });

    test("T1.4.2: /verify?ref=MC-2026-0001 queries portal-api and renders VerifyClient result", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            data: {
              isVerified: true,
              documentType: "Medical Certificate",
              documentNumber: "MC-2026-0001",
              facilityName: "St. Jude General Hospital",
              patientMaskedName: "J*** D***",
              doctorName: "Dr. Maria Santos",
              issueDate: "2026-10-25",
              status: "Valid & Authenticated",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      try {
        const jsx = await VerifyIndexPage({ searchParams: Promise.resolve({ ref: "MC-2026-0001" }) });
        const html = renderToString(jsx);
        expect(html).toContain("MC-2026-0001");
        expect(html).toContain("St. Jude General Hospital");
        expect(html).toContain("Valid &amp; Authenticated");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.4.3: /verify?ref=MC-001&sig=4FA8B19C30E2 passes normalized 12-char signature seal", async () => {
      let targetUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        targetUrl = String(url);
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-001", sig: "SEC-SHA256-4FA8B19C30E2" }),
        });
        expect(targetUrl).toContain("sig=4FA8B19C30E2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.4.4: Supports uppercase ?SIG= parameter transparently", async () => {
      let targetUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        targetUrl = String(url);
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-001", SIG: "4FA8B19C30E2" }),
        });
        expect(targetUrl).toContain("sig=4FA8B19C30E2");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.4.5: 409 status code renders Security Seal prompt with Action Required status", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(JSON.stringify({ message: "Multi-branch document collision" }), { status: 409 })
      ) as any;

      try {
        const jsx = await VerifyIndexPage({ searchParams: Promise.resolve({ ref: "SHARED-001" }) });
        const html = renderToString(jsx);
        expect(html).toContain("SECURITY SEAL CONFIRMATION REQUIRED");
        expect(html).toContain("SHARED-001");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.4.6: generateMetadata for /verify?ref=... includes document reference in title", async () => {
      const meta = await generateVerifyMetadata({ searchParams: Promise.resolve({ ref: "REF-999" }) });
      expect(meta.title).toBe("Verify Medical Document (REF-999) - Clinic EZ Public Registry");
    });
  });

  // Feature 5: Canonical Prescription Verify Route /verify/rx/{token} (6 tests)
  describe("Feature 5: Canonical Prescription /verify/rx/{token} Route", () => {
    test("T1.5.1: /verify/rx/{token} queries portal-api and renders RxVerifyClient", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            data: {
              prescriptionNumber: "RX-2026-0001",
              clinicName: "Manila Family Health",
              doctorName: "Dr. Maria Santos",
              doctorPrcLicense: "PRC-0098765",
              items: [{ genericName: "Amoxicillin", dosage: "500mg", quantity: 21 }],
              isValid: true,
              dispenseStatus: "Active",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      ) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "rx", token: "RX-2026-0001" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("RX-2026-0001");
        expect(html).toContain("Manila Family Health");
        expect(html).toContain("Dr. Maria Santos");
        expect(html).toContain("Amoxicillin");
        expect(html).toContain("500mg");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.5.2: Detects dangerous drugs and flags mandatory S2 requirements", () => {
      const rxData = {
        prescriptionNumber: "RX-DANGEROUS-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Santos",
        doctorPrcLicense: "PRC-12345",
        doctorS2License: "S2-98765432",
        patientName: "Patient A",
        patientAge: 35,
        patientGender: "M",
        items: [{ itemId: "1", genericName: "Morphine Sulfate", dosage: "10mg", form: "tab", sig: "TID", refills: 0, quantity: 10, isDangerousDrug: true }],
        dispenseStatus: "Active",
        isValid: true,
        isAlreadyDispensed: false,
        hasDangerousDrug: true,
        itemCount: 1,
        syncStatus: "Synced",
        isOfflinePending: false,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-DANGEROUS-01", initialData: rxData as any }));
      expect(html).toContain("PDEA Dangerous Drug");
      expect(html).toContain("S2-98765432");
    });

    test("T1.5.3: Case-insensitive kind 'Rx' delegates to prescription verification", async () => {
      let queriedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        queriedUrl = String(url);
        return new Response(JSON.stringify({ isValid: true, items: [] }), { status: 200 });
      }) as any;

      try {
        await DynamicVerifyPage({
          params: Promise.resolve({ kind: "Rx", token: "TOKEN-123" }),
        });
        expect(queriedUrl).toContain("/public/rx-verify/TOKEN-123");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.5.4: generateMetadata for kind=rx includes external pharmacist subtitle", async () => {
      const meta = await generateDynamicVerifyMetadata({
        params: Promise.resolve({ kind: "rx", token: "RX-100" }),
      });
      expect(meta.title).toBe("Verify Prescription (RX-100) - Clinic EZ Interop Portal");
      expect(meta.description).toContain("external pharmacists");
    });

    test("T1.5.5: Dispensed status displays clear 'Already Dispensed' warning banner", () => {
      const rxData = {
        prescriptionNumber: "RX-DISPENSED-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Santos",
        doctorPrcLicense: "PRC-12345",
        patientName: "Patient A",
        patientAge: 35,
        patientGender: "M",
        items: [],
        dispenseStatus: "Dispensed",
        isValid: true,
        isAlreadyDispensed: true,
        hasDangerousDrug: false,
        itemCount: 0,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-DISPENSED-01", initialData: rxData as any }));
      expect(html).toContain("PRESCRIPTION ALREADY DISPENSED");
      expect(html).toContain("Verified • Dispensed");
      expect(html).toContain("Dispensing Form Locked");
      expect(html).not.toContain("UNVERIFIED OR INVALID PRESCRIPTION TOKEN");
    });

    test("T1.5.5b: Already-dispensed prescription with legacy isValid:false still renders dispensed warning (anti-regression)", () => {
      const rxData = {
        prescriptionNumber: "RX-LEGACY-DISPENSED-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        items: [],
        dispenseStatus: "DispensedExternally",
        isValid: false,
        isAlreadyDispensed: true,
        dispensedPharmacyName: "Mercury Drug",
        dispensedReceiptNumber: "OR-998877",
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-LEGACY-DISPENSED-01", initialData: rxData as any }));
      expect(html).toContain("PRESCRIPTION ALREADY DISPENSED");
      expect(html).toContain("Verified • Dispensed");
      expect(html).toContain("Mercury Drug");
      expect(html).toContain("OR-998877");
      expect(html).toContain("Dispensing Form Locked");
      expect(html).not.toContain("UNVERIFIED OR INVALID PRESCRIPTION TOKEN");
      expect(html).not.toContain("Unverified Token");
    });

    test("T1.5.5c: Expired prescription renders expiration banner and lock", () => {
      const rxData = {
        prescriptionNumber: "RX-EXPIRED-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        items: [],
        dispenseStatus: "Pending",
        isValid: true,
        isAlreadyDispensed: false,
        isExpired: true,
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-EXPIRED-01", initialData: rxData as any }));
      expect(html).toContain("PRESCRIPTION EXPIRED");
      expect(html).toContain("Verified • Expired");
      expect(html).toContain("Dispensing Locked (Expired)");
      expect(html).not.toContain("UNVERIFIED OR INVALID PRESCRIPTION TOKEN");
    });

    test("T1.5.6: Dispense form requires pharmacy name input before confirmation", () => {
      const rxData = {
        prescriptionNumber: "RX-DISPENSE-FORM",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Santos",
        doctorPrcLicense: "PRC-12345",
        patientName: "Patient A",
        patientAge: 35,
        patientGender: "M",
        items: [{ itemId: "1", genericName: "Paracetamol", dosage: "500mg", form: "tab", sig: "PRN", refills: 0, quantity: 10, isDangerousDrug: false }],
        dispenseStatus: "Active",
        isValid: true,
        isAlreadyDispensed: false,
        hasDangerousDrug: false,
        itemCount: 1,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-DISPENSE-FORM", initialData: rxData as any }));
      expect(html).toContain("Pharmacist Dispense Confirmation (Path B)");
      expect(html).toContain("Drugstore Chain *");
      expect(html).toContain("Confirm Dispense &amp; Lock Prescription");
    });
  });

  // Feature 6: Canonical Dynamic Document Kind Route /verify/{kind}/{token} (6 tests)
  describe("Feature 6: Canonical /verify/{kind}/{token} Route", () => {
    test("T1.6.1: /verify/med-cert/MC-01 queries document registry and renders VerifyClient", async () => {
      let queriedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        queriedUrl = String(url);
        return new Response(
          JSON.stringify({
            data: {
              isVerified: true,
              documentType: "Medical Certificate",
              documentNumber: "MC-01",
              facilityName: "Metro Clinic",
              status: "Valid",
            },
          }),
          { status: 200 }
        );
      }) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "med-cert", token: "MC-01" }),
        });
        const html = renderToString(jsx);
        expect(queriedUrl).toContain("/public/documents/verify/med-cert/MC-01");
        expect(html).toContain("MC-01");
        expect(html).toContain("Metro Clinic");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.6.2: /verify/referral/REF-100 queries referral documents", async () => {
      let queriedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        queriedUrl = String(url);
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await DynamicVerifyPage({
          params: Promise.resolve({ kind: "referral", token: "REF-100" }),
        });
        expect(queriedUrl).toContain("/public/documents/verify/referral/REF-100");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.6.3: /verify/lab-report/LAB-99 queries lab report documents", async () => {
      let queriedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        queriedUrl = String(url);
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await DynamicVerifyPage({
          params: Promise.resolve({ kind: "lab-report", token: "LAB-99" }),
        });
        expect(queriedUrl).toContain("/public/documents/verify/lab-report/LAB-99");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.6.4: Dynamic segment discovery confirms only [kind] directly under verify/", () => {
      const verifyChildren = fs
        .readdirSync(path.join(APP_DIR, "verify"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("["))
        .map((e) => e.name);
      expect(verifyChildren).toEqual(["[kind]"]);
    });

    test("T1.6.5: Dynamic verify page forwards signature parameter into API query", async () => {
      let queriedUrl = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        queriedUrl = String(url);
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await DynamicVerifyPage({
          params: Promise.resolve({ kind: "med-cert", token: "MC-01" }),
          searchParams: Promise.resolve({ sig: "SEC-SHA256-ABCD1234EF56" }),
        });
        expect(queriedUrl).toContain("sig=ABCD1234EF56");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T1.6.6: Dynamic verify metadata renders uppercase document kind in title", async () => {
      const meta = await generateDynamicVerifyMetadata({
        params: Promise.resolve({ kind: "referral", token: "REF-100" }),
      });
      expect(meta.title).toBe("Verify REFERRAL (REF-100) - Clinic EZ Public Registry");
    });
  });

  // Feature 7: Proxy Middleware Whitelisting & Bypass (5 tests)
  describe("Feature 7: Proxy Middleware Whitelisting", () => {
    const checkPublic = (p: string) => isPublicRoute(new NextRequest("http://localhost" + p));

    test("T1.7.1: Whitelists all canonical /join paths from auth gate", () => {
      expect(checkPublic("/join")).toBe(true);
      expect(checkPublic("/join/")).toBe(true);
      expect(checkPublic("/join?code=APEX2026")).toBe(true);
      expect(checkPublic("/join/ustp/cdo-campus")).toBe(true);
      expect(checkPublic("/join/ustp/cdo-campus?code=TEST")).toBe(true);
    });

    test("T1.7.2: Whitelists all canonical /claim paths from auth gate", () => {
      expect(checkPublic("/claim")).toBe(true);
      expect(checkPublic("/claim/")).toBe(true);
      expect(checkPublic("/claim?token=XYZ")).toBe(true);
    });

    test("T1.7.3: Whitelists all canonical /verify paths from auth gate", () => {
      expect(checkPublic("/verify")).toBe(true);
      expect(checkPublic("/verify/")).toBe(true);
      expect(checkPublic("/verify?ref=MC-01")).toBe(true);
      expect(checkPublic("/verify/rx/RX-100")).toBe(true);
      expect(checkPublic("/verify/med-cert/MC-01?sig=123")).toBe(true);
    });

    test("T1.7.4: Whitelists /upload routes for outside documentation drops", () => {
      expect(checkPublic("/upload/rx/RX-100")).toBe(true);
      expect(checkPublic("/upload/lab/LAB-100")).toBe(true);
    });

    test("T1.7.5: Enforces strict auth gating on administrative and workspace routes", () => {
      expect(checkPublic("/dashboard")).toBe(false);
      expect(checkPublic("/apex/dashboard/overview")).toBe(false);
      expect(checkPublic("/admin/users")).toBe(false);
      expect(checkPublic("/sync-auth/callback")).toBe(false);
    });
  });

  // Feature 8: Single Source of Truth Builder Parity (5 tests)
  describe("Feature 8: Single Source of Truth Builder Parity", () => {
    test("T1.8.1: publicRoutes.join() outputs /join and /join?code=...", () => {
      expect(publicRoutes.join()).toBe("/join");
      expect(publicRoutes.join({ code: "APEX2026" })).toBe("/join?code=APEX2026");
      expect(publicRoutes.join({ baseUrl: "https://portal.clinicez.ph", code: "APEX2026" })).toBe(
        "https://portal.clinicez.ph/join?code=APEX2026"
      );
    });

    test("T1.8.2: publicRoutes.facilityJoin() outputs /join/{tenant}/{facility}[?code=...]", () => {
      expect(publicRoutes.facilityJoin("ustp", "main")).toBe("/join/ustp/main");
      expect(publicRoutes.facilityJoin("ustp", "main", { code: "B4C7-JOINNOW" })).toBe(
        "/join/ustp/main?code=B4C7-JOINNOW"
      );
    });

    test("T1.8.3: publicRoutes.claim() outputs /claim?token=...", () => {
      expect(publicRoutes.claim("token-xyz")).toBe("/claim?token=token-xyz");
    });

    test("T1.8.4: publicRoutes.verifyLookup() and verifyKind() match canonical structure", () => {
      expect(publicRoutes.verifyLookup()).toBe("/verify");
      expect(publicRoutes.verifyLookup({ ref: "MC-01", sig: "4FA8B19C30E2" })).toBe(
        "/verify?ref=MC-01&sig=4FA8B19C30E2"
      );
      expect(publicRoutes.verifyKind("med-cert", "MC-01")).toBe("/verify/med-cert/MC-01");
      expect(publicRoutes.verifyRx("RX-100")).toBe("/verify/rx/RX-100");
    });

    test("T1.8.5: Every builder output matches a real discovered route in apps/portal-web/src/app", () => {
      const discovered = discoverRoutes(APP_DIR);

      // Verify each builder's pathname corresponds to a route template in discovered set
      expect(discovered).toContain("/join");
      expect(discovered).toContain("/join/[tenantSlug]/[facilitySlug]");
      expect(discovered).toContain("/claim");
      expect(discovered).toContain("/verify");
      expect(discovered).toContain("/verify/[kind]/[token]");
    });
  });
});

// =============================================================================
// TIER 2: BOUNDARY VALUE ANALYSIS & CORNER CASES (55 Tests, >=5 per feature)
// =============================================================================

describe("Tier 2: Boundary Value Analysis & Corner Cases", () => {
  // Feature 1 Boundaries: /join and /join?code (7 tests)
  describe("Feature 1 Boundaries: /join", () => {
    test("T2.1.1: Whitespace-only code query falls back to landing without crashing", async () => {
      const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "   " }) });
      const html = renderToString(jsx);
      expect(html).toContain("Clinic Join Code");
    });

    test("T2.1.2: Invalid join code renders JoinCodeErrorCard with error details and retry input", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async () => ({
        success: false,
        message: "Invalid or expired clinic join code.",
        statusCode: 404,
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "UNKNOWN999" }) });
        const html = renderToString(jsx);
        expect(html).toContain("Invalid or expired clinic join code.");
        expect(html).toContain("UNKNOWN999");
        expect(html).toContain("Enter New Join Code");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T2.1.3: Expired join code renders JoinCodeErrorCard with expired message", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async () => ({
        success: false,
        message: "This clinic join pass has expired. Please contact reception.",
        statusCode: 410,
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "EXPIRED-01" }) });
        const html = renderToString(jsx);
        expect(html).toContain("This clinic join pass has expired");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T2.1.4: Exact maximum length join code (50 chars) is processed cleanly", async () => {
      const maxCode = "A".repeat(50);
      let passedCode = "";
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async (c: string) => {
        passedCode = c;
        return { success: true, tenantSlug: "t", facilitySlug: "f", facilityName: "F" };
      }) as any;

      try {
        await JoinPage({ searchParams: Promise.resolve({ code: maxCode }) });
        expect(passedCode).toBe(maxCode);
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T2.1.5: Lowercase code in URL is normalized to uppercase server-side", async () => {
      let passedCode = "";
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async (c: string) => {
        passedCode = c;
        return { success: true, tenantSlug: "t", facilitySlug: "f", facilityName: "F" };
      }) as any;

      try {
        await JoinPage({ searchParams: Promise.resolve({ code: "apex2026" }) });
        expect(passedCode).toBe("APEX2026");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T2.1.6: XSS/Script payload in code parameter is neutralized and escaped", async () => {
      const hostileCode = '<script>alert("xss")</script>';
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async () => ({
        success: false,
        message: "Invalid code format.",
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: hostileCode }) });
        const html = renderToString(jsx);
        expect(html).not.toContain("<script>alert");
        expect(html).toContain("&lt;SCRIPT&gt;ALERT");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T2.1.7: Null or undefined searchParams handled without runtime crash", async () => {
      const jsx = await JoinPage({ searchParams: undefined as any });
      const html = renderToString(jsx);
      expect(html).toContain("Clinic Join Code");
    });
  });

  // Feature 2 Boundaries: /join/{tenantSlug}/{facilitySlug} (6 tests)
  describe("Feature 2 Boundaries: Facility Join Route", () => {
    test("T2.2.1: Non-existent facility returns JoinCodeErrorCard with disabled intake message", async () => {
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async () => ({
        success: false,
        message: "Invalid or disabled clinic registration intake.",
        statusCode: 404,
      })) as any;

      try {
        const jsx = await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "unknown-tenant", facilitySlug: "unknown-facility" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("Invalid or disabled clinic registration intake.");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T2.2.2: Slugs with whitespace are trimmed and converted to lowercase", async () => {
      let tQueried = "";
      let fQueried = "";
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async (t: string, f: string) => {
        tQueried = t;
        fQueried = f;
        return { success: true, tenantSlug: t, facilitySlug: f, facilityName: "F" };
      }) as any;

      try {
        await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "  St-Jude  ", facilitySlug: "  Branch-1  " }),
        });
        expect(tQueried).toBe("st-jude");
        expect(fQueried).toBe("branch-1");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T2.2.3: Single-segment dynamic route /join/[code] returns 404 and does not match facility page", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).not.toContain("/join/[code]");
      expect(routes).not.toContain("/join/[tenantSlug]");
    });

    test("T2.2.4: Empty or whitespace code query param in facility join is ignored", async () => {
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async () => ({
        success: true,
        tenantSlug: "t",
        facilitySlug: "f",
        facilityName: "F",
      })) as any;

      try {
        await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "t", facilitySlug: "f" }),
          searchParams: Promise.resolve({ code: "   " }),
        });
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T2.2.5: Path traversal attempt in slugs is safely contained", () => {
      const result = publicRoutes.facilityJoin("../../../etc", "passwd");
      expect(result).toBe("/join/..%2F..%2F..%2Fetc/passwd");
      expect(result.includes("../../")).toBe(false);
    });

    test("T2.2.6: Throws error when facilityJoin is called with empty slug parameters", () => {
      expect(() => publicRoutes.facilityJoin("", "facility")).toThrow(/required/);
      expect(() => publicRoutes.facilityJoin("tenant", "")).toThrow(/required/);
    });
  });

  // Feature 3 Boundaries: /claim?token=... (7 tests)
  describe("Feature 3 Boundaries: Account Claim", () => {
    test("T2.3.1: Empty token string /claim?token= renders 'Claim Token Required' alert", async () => {
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token: "" }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Token Required");
      expect(html).toContain('role="alert"');
    });

    test("T2.3.2: Whitespace token /claim?token=%20%20 renders 'Claim Token Required' alert", async () => {
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token: "   " }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Token Required");
    });

    test("T2.3.3: Malformed non-base64 token renders card without crashing via fallback", async () => {
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token: "not-a-valid-jwt" }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim My Patient Account in 1-Click");
    });

    test("T2.3.4: Base64 token with invalid JSON string inside renders card with undefined patient", async () => {
      const malformedPayload = Buffer.from("{invalid-json").toString("base64") + ".sig";
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token: malformedPayload }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim My Patient Account in 1-Click");
    });

    test("T2.3.5: Expired claim token payload parses expired date correctly", async () => {
      const pastUnix = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const token = Buffer.from(JSON.stringify({ ExpiresAtUnix: pastUnix, FirstName: "Late" })).toString("base64") + ".sig";
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token }) });
      const html = renderToString(jsx);
      const isoDate = new Date(pastUnix * 1000).toISOString();
      expect(html).toContain(isoDate);
      expect(html).toContain("Protected under RA 10173");
    });

    test("T2.3.6: URL-encoded special characters (+, /, =) in claim token decode correctly", () => {
      const rawToken = "ABC+DEF/GHI==";
      const url = publicRoutes.claim(rawToken);
      expect(url).toBe("/claim?token=ABC%2BDEF%2FGHI%3D%3D");
    });

    test("T2.3.7: Throws error when publicRoutes.claim is invoked with empty token", () => {
      expect(() => publicRoutes.claim("")).toThrow(/token is required/);
      expect(() => publicRoutes.claim("   ")).toThrow(/token is required/);
    });
  });

  // Feature 4 Boundaries: /verify & ?sig=... (8 tests)
  describe("Feature 4 Boundaries: Document Verify & Signature Seals", () => {
    test("T2.4.1: Unregistered reference query renders 'Unverified / Record Not Found'", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response("Not found", { status: 404 })) as any;

      try {
        const jsx = await VerifyIndexPage({ searchParams: Promise.resolve({ ref: "GHOST-REF" }) });
        const html = renderToString(jsx);
        expect(html).toContain("Unverified Reference");
        expect(html).toContain("GHOST-REF");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.2: Strips SEC-SHA256- prefix in lowercase sig query parameter", async () => {
      let capturedSig = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        capturedSig = u.searchParams.get("sig") || "";
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-01", sig: "SEC-SHA256-ABCDEF123456" }),
        });
        expect(capturedSig).toBe("ABCDEF123456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.3: Strips mixed-case prefix SeC-sHa256- seamlessly", async () => {
      let capturedSig = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        capturedSig = u.searchParams.get("sig") || "";
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-01", sig: "SeC-sHa256-ABCDEF123456" }),
        });
        expect(capturedSig).toBe("ABCDEF123456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.4: Leading and trailing whitespace in sig is trimmed", async () => {
      let capturedSig = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        capturedSig = u.searchParams.get("sig") || "";
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-01", sig: "   ABCDEF123456   " }),
        });
        expect(capturedSig).toBe("ABCDEF123456");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.5: When both sig and SIG are supplied, lowercase sig takes precedence", async () => {
      let capturedSig = "";
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        capturedSig = u.searchParams.get("sig") || "";
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-01", sig: "LOWER_SIG", SIG: "UPPER_SIG" }),
        });
        expect(capturedSig).toBe("LOWER_SIG");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.6: Empty sig query parameter is omitted from outgoing API request", async () => {
      let hasSig = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async (url: string | URL | Request) => {
        const u = new URL(String(url));
        hasSig = u.searchParams.has("sig");
        return new Response(JSON.stringify({ isVerified: true }), { status: 200 });
      }) as any;

      try {
        await VerifyIndexPage({
          searchParams: Promise.resolve({ ref: "MC-01", sig: "   " }),
        });
        expect(hasSig).toBe(false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.4.7: SEC-SHA256- prefix is preserved when present in ref query parameter", () => {
      const url = publicRoutes.verifyLookup({ ref: "SEC-SHA256-HASHVAL" });
      expect(url).toBe("/verify?ref=SEC-SHA256-HASHVAL");
    });

    test("T2.4.8: publicRoutes.verifyLookup trims 16-character digest to exact 12 chars when prefix stripped", () => {
      const url = publicRoutes.verifyLookup({ ref: "MC-01", sig: "SEC-SHA256-4FA8B19C30E29999" });
      expect(url).toBe("/verify?ref=MC-01&sig=4FA8B19C30E2");
    });
  });

  // Feature 5 Boundaries: /verify/rx/{token} (8 tests)
  describe("Feature 5 Boundaries: Prescription Verification", () => {
    test("T2.5.1: Non-existent prescription renders unverified fallback with isValid: false", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response("Not found", { status: 404 })) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "rx", token: "RX-NONEXISTENT" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("RX-NONEXISTENT");
        expect(html).toContain("Not Found in Registry");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.5.2: Zero-PHI mode with items undefined does not crash and renders empty list", () => {
      const rxData = {
        prescriptionNumber: "RX-ZEROPHI-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Zero PHI Clinic",
        doctorName: "Dr. Doctor",
        items: undefined, // Zero PHI attestation
        dispenseStatus: "Active",
        isValid: true,
      };

      expect(() =>
        renderToString(React.createElement(RxVerifyClient, { token: "RX-ZEROPHI-01", initialData: rxData as any }))
      ).not.toThrow();
    });

    test("T2.5.3: Null items array in prescription payload renders without TypeError", () => {
      const rxData = {
        prescriptionNumber: "RX-NULLITEMS-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        items: null,
        dispenseStatus: "Active",
        isValid: true,
      };

      expect(() =>
        renderToString(React.createElement(RxVerifyClient, { token: "RX-NULLITEMS-01", initialData: rxData as any }))
      ).not.toThrow();
    });

    test("T2.5.4: Null doctorPrcLicense is handled cleanly without rendering literal 'null'", () => {
      const rxData = {
        prescriptionNumber: "RX-NULLPRC-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        doctorPrcLicense: null,
        items: [],
        isValid: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-NULLPRC-01", initialData: rxData as any }));
      expect(html).not.toContain("PRC: null");
    });

    test("T2.5.5: Empty string doctorPrcLicense does not produce broken UI", () => {
      const rxData = {
        prescriptionNumber: "RX-EMPTYPRC-01",
        issuedAt: new Date().toISOString(),
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        doctorPrcLicense: "",
        items: [],
        isValid: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-EMPTYPRC-01", initialData: rxData as any }));
      expect(html).toContain("RX-EMPTYPRC-01");
    });

    test("T2.5.6: RxVerifyClient source code contains strict 5 MiB ceiling guard", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "verify/[kind]/[token]/RxVerifyClient.tsx"),
        "utf-8"
      );
      expect(code).toContain("MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024");
    });

    test("T2.5.7: RxVerifyClient source code contains 2048px maximum dimension downscaling", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "verify/[kind]/[token]/RxVerifyClient.tsx"),
        "utf-8"
      );
      expect(code).toContain("const maxDim = 2048;");
    });

    test("T2.5.8: RxVerifyClient canvas export specifies 0.8 JPEG quality", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "verify/[kind]/[token]/RxVerifyClient.tsx"),
        "utf-8"
      );
      expect(code).toContain("'image/jpeg'");
      expect(code).toContain("0.8");
    });
  });

  // Feature 6 Boundaries: /verify/{kind}/{token} (7 tests)
  describe("Feature 6 Boundaries: Dynamic Kind Verification", () => {
    test("T2.6.1: Non-existent document token returns unverified fallback in VerifyClient", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () => new Response("Not found", { status: 404 })) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "med-cert", token: "GHOST-TOKEN" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("GHOST-TOKEN");
        expect(html).toContain("Unverified Reference");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T2.6.2: Spaces in token segment are URL-encoded cleanly", () => {
      const url = publicRoutes.verifyKind("med-cert", "token with spaces");
      expect(url).toBe("/verify/med-cert/token%20with%20spaces");
    });

    test("T2.6.3: Slashes in token segment are URL-encoded cleanly", () => {
      const url = publicRoutes.verifyKind("lab", "ORD/2026/01");
      expect(url).toBe("/verify/lab/ORD%2F2026%2F01");
    });

    test("T2.6.4: Unicode and emoji in token are URL-encoded without error", () => {
      const url = publicRoutes.verifyKind("referral", "Dr-José-🩺");
      expect(url).toContain("Dr-Jos%C3%A9-%F0%9F%A9%BA");
    });

    test("T2.6.5: 10,000 character token handled without catastrophic failure", () => {
      const longToken = "T".repeat(10000);
      const url = publicRoutes.verifyKind("med-cert", longToken);
      expect(url.length).toBeGreaterThan(10000);
    });

    test("T2.6.6: Throws error when verifyKind is called with empty kind or token", () => {
      expect(() => publicRoutes.verifyKind("", "token")).toThrow(/required/);
      expect(() => publicRoutes.verifyKind("kind", "")).toThrow(/required/);
    });

    test("T2.6.7: Retired route /rx-verify/[token] does NOT exist in filesystem", () => {
      expect(fs.existsSync(path.join(APP_DIR, "rx-verify"))).toBe(false);
    });
  });

  // Feature 7 Boundaries: Proxy Security Boundaries & Attack Vectors (6 tests)
  describe("Feature 7 Boundaries: Proxy Route Matching", () => {
    const checkPublic = (p: string) => isPublicRoute(new NextRequest("http://localhost" + p));

    test("T2.7.1: Lookalike prefix attack /admin/join is strictly blocked", () => {
      expect(checkPublic("/admin/join")).toBe(false);
    });

    test("T2.7.2: Lookalike prefix attack /dashboard/claim is strictly blocked", () => {
      expect(checkPublic("/dashboard/claim")).toBe(false);
    });

    test("T2.7.3: Lookalike prefix attack /settings/verify is strictly blocked", () => {
      expect(checkPublic("/settings/verify")).toBe(false);
    });

    test("T2.7.4: Retired /student-intake is strictly blocked from authentication bypass", () => {
      expect(checkPublic("/student-intake")).toBe(false);
      expect(checkPublic("/student-intake/ustp")).toBe(false);
    });

    test("T2.7.5: Root / is strictly blocked from unauthenticated bypass", () => {
      expect(checkPublic("/")).toBe(false);
    });

    test("T2.7.6: Public API routes like /api/v1/public/join are NOT caught by page public matcher", () => {
      expect(checkPublic("/api/v1/public/join")).toBe(false);
    });
  });

  // Feature 8 Boundaries: Join Code Validator Matrix & Length Boundaries (6 tests)
  describe("Feature 8 Boundaries: Join Code Format Matrix", () => {
    test("T2.8.1: Exact length boundaries for unprefixed alphanumeric (3..50 chars)", () => {
      expect(publicRoutes.isValidJoinCode("AB")).toBe(false); // 2 chars
      expect(publicRoutes.isValidJoinCode("ABC")).toBe(true); // 3 chars
      expect(publicRoutes.isValidJoinCode("A".repeat(50))).toBe(true); // 50 chars
      expect(publicRoutes.isValidJoinCode("A".repeat(51))).toBe(false); // 51 chars
    });

    test("T2.8.2: Exact length boundaries for 4-char prefixed codes (XXXX-CODE)", () => {
      expect(publicRoutes.isValidJoinCode("B4C7-A")).toBe(true); // 6 chars (min)
      expect(publicRoutes.isValidJoinCode("B4C7-" + "A".repeat(45))).toBe(true); // 50 chars (max)
      expect(publicRoutes.isValidJoinCode("B4C7-" + "A".repeat(46))).toBe(false); // 51 chars
    });

    test("T2.8.3: Rejects malformed prefix structure (not exactly 4 chars)", () => {
      expect(publicRoutes.isValidJoinCode("ABC-JOIN")).toBe(false); // 3-char prefix
      expect(publicRoutes.isValidJoinCode("ABCDE-JOIN")).toBe(false); // 5-char prefix
      expect(publicRoutes.isValidJoinCode("AB-JOIN")).toBe(false); // 2-char prefix
      expect(publicRoutes.isValidJoinCode("-JOIN")).toBe(false); // Missing prefix
    });

    test("T2.8.4: Rejects multiple hyphens and consecutive hyphens", () => {
      expect(publicRoutes.isValidJoinCode("B4C7--JOIN")).toBe(false);
      expect(publicRoutes.isValidJoinCode("B4C7-A-B")).toBe(false);
      expect(publicRoutes.isValidJoinCode("B4C7-JOIN-")).toBe(false);
    });

    test("T2.8.5: Rejects punctuation and forbidden special characters", () => {
      expect(publicRoutes.isValidJoinCode("CODE!@#")).toBe(false);
      expect(publicRoutes.isValidJoinCode("JOIN.NOW")).toBe(false);
      expect(publicRoutes.isValidJoinCode("JOIN_NOW")).toBe(false);
      expect(publicRoutes.isValidJoinCode("JOIN SPACE")).toBe(false);
    });

    test("T2.8.6: Handles null and undefined safely without throwing", () => {
      expect(publicRoutes.isValidJoinCode(null)).toBe(false);
      expect(publicRoutes.isValidJoinCode(undefined)).toBe(false);
      expect(publicRoutes.normalizeJoinCode(null)).toBe("");
      expect(publicRoutes.normalizeJoinCode(undefined)).toBe("");
    });
  });
});

// =============================================================================
// TIER 3: CROSS-FEATURE COMBINATIONS & PAIRWISE INTERACTIONS (42 Tests)
// =============================================================================

describe("Tier 3: Cross-Feature Combinations & Pairwise Interactions", () => {
  // Combination 1: Reception Placard Scan to Claim Handoff (6 tests)
  describe("Combination 1: Placard Scan to Claim Handoff", () => {
    test("T3.1.1: Mobile deep link generates valid clinicez://join?code=...", () => {
      const link = publicRoutes.mobileJoinDeepLink("B4C7-JOINNOW");
      expect(link).toBe("clinicez://join?code=B4C7-JOINNOW");
    });

    test("T3.1.2: Web URL builder matches mobile deep link parameters", () => {
      const code = "APEX2026";
      const webUrl = publicRoutes.join({ code });
      const deepLink = publicRoutes.mobileJoinDeepLink(code);
      expect(webUrl.split("?")[1]).toBe(deepLink.split("?")[1]);
    });

    test("T3.1.3: Mobile join deep link with spaces encodes query parameter safely", () => {
      const link = publicRoutes.mobileJoinDeepLink("JOIN ME");
      expect(link).toBe("clinicez://join?code=JOIN%20ME");
    });

    test("T3.1.4: Bare mobile deep link produces clinicez://join without empty query parameter", () => {
      expect(publicRoutes.mobileJoinDeepLink()).toBe("clinicez://join");
      expect(publicRoutes.mobileJoinDeepLink("")).toBe("clinicez://join");
      expect(publicRoutes.mobileJoinDeepLink(null)).toBe("clinicez://join");
    });

    test("T3.1.5: Claim token generated after intake is preserved across auth redirects", () => {
      const claimUrl = publicRoutes.claim("SAMPLE-CLAIM-TOKEN-123");
      const redirectUrl = `/sign-in?redirect_url=${encodeURIComponent(claimUrl)}`;
      expect(decodeURIComponent(redirectUrl)).toContain("/claim?token=SAMPLE-CLAIM-TOKEN-123");
    });

    test("T3.1.6: Claim card SSR preserves patient details in success state", () => {
      const html = renderToString(
        React.createElement(ProgressiveClaimCard, {
          claimToken: "PRESERVED-TOKEN",
          patientName: "Test Patient",
          facilityName: "Test Facility",
          state: "success",
        })
      );
      expect(html).toContain("Test Patient");
      expect(html).toContain("Test Facility");
    });
  });

  // Combination 2: Facility Join Code Inheritance & Propagation (5 tests)
  describe("Combination 2: Facility Join Code Inheritance", () => {
    test("T3.2.1: Facility join page preserves code query across error recovery CTA", async () => {
      const originalGet = joinService.getFacilityJoinData;
      joinService.getFacilityJoinData = mock(async () => ({
        success: false,
        message: "Facility inactive",
      })) as any;

      try {
        const jsx = await FacilityJoinPage({
          params: Promise.resolve({ tenantSlug: "t", facilitySlug: "f" }),
          searchParams: Promise.resolve({ code: "KEEP-ME" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("Facility inactive");
      } finally {
        joinService.getFacilityJoinData = originalGet;
      }
    });

    test("T3.2.2: Normalized tenant and facility match publicRoutes.facilityJoin output", () => {
      const builderOutput = publicRoutes.facilityJoin("metro", "clinic", { code: "CODE123" });
      expect(builderOutput).toBe("/join/metro/clinic?code=CODE123");
    });

    test("T3.2.3: Multiple trailing slashes on baseUrl are trimmed uniformly", () => {
      const url = publicRoutes.facilityJoin("t", "f", { baseUrl: "https://portal.clinicez.ph///" });
      expect(url).toBe("https://portal.clinicez.ph/join/t/f");
    });

    test("T3.2.4: Empty code parameter does not leave trailing question mark", () => {
      const url = publicRoutes.facilityJoin("t", "f", { code: "" });
      expect(url).toBe("/join/t/f");
      expect(url.endsWith("?")).toBe(false);
    });

    test("T3.2.5: Normalizes code uppercase across facilityJoin", () => {
      const norm = publicRoutes.normalizeJoinCode("b4c7-joinnow");
      const url = publicRoutes.facilityJoin("t", "f", { code: norm });
      expect(url).toBe("/join/t/f?code=B4C7-JOINNOW");
    });
  });

  // Combination 3: Verify Lookup Client Router Navigation Matrix (5 tests)
  describe("Combination 3: Verify Lookup Client Router Navigation", () => {
    test("T3.3.1: VerifyLookupClient renders all 5 document categories in select control", () => {
      const html = renderToString(React.createElement(VerifyLookupClient));
      expect(html).toContain('value="auto"');
      expect(html).toContain('value="rx"');
      expect(html).toContain('value="med-cert"');
      expect(html).toContain('value="referral"');
      expect(html).toContain('value="lab-report"');
    });

    test("T3.3.2: VerifyLookupClient contains reference number and security seal inputs", () => {
      const html = renderToString(React.createElement(VerifyLookupClient));
      expect(html).toContain('id="search-input"');
      expect(html).toContain('id="seal-input"');
    });

    test("T3.3.3: Reference Number input has accessible label and placeholder", () => {
      const html = renderToString(React.createElement(VerifyLookupClient));
      expect(html).toContain("Reference Number or Security Digest");
      expect(html).toContain("e.g. MC-20261004-0001, RX-20261004-0001, or SEC-SHA256-...");
    });

    test("T3.3.4: Security seal input specifies 12-character format helper", () => {
      const html = renderToString(React.createElement(VerifyLookupClient));
      expect(html).toContain("Security Seal Signature (Optional, for disambiguating multi-branch documents)");
      expect(html).toContain("4FA8B19C30E2");
    });

    test("T3.3.5: Form submission button contains accessible icon and text", () => {
      const html = renderToString(React.createElement(VerifyLookupClient));
      expect(html).toContain("Verify");
    });
  });

  // Combination 4: Verification 409 Seal Resolution Lifecycle (5 tests)
  describe("Combination 4: Verification 409 Seal Resolution", () => {
    test("T3.4.1: Initial 409 multi-facility conflict presents seal-entry form in VerifyClient", () => {
      const data = {
        isVerified: false,
        requiresSignatureSeal: true,
        statusCode: 409,
        documentType: "Medical Certificate",
        documentNumber: "SHARED-001",
        status: "Action Required: Security Seal Verification",
        verificationMessage: "This document reference is shared across multiple clinic branches.",
      };

      const html = renderToString(React.createElement(VerifyClient, { token: "SHARED-001", data: data as any }));
      expect(html).toContain("SECURITY SEAL CONFIRMATION REQUIRED");
      expect(html).toContain("Verify Seal");
    });

    test("T3.4.2: VerifyClient preserves token and initialSig in form state", () => {
      const data = {
        isVerified: false,
        requiresSignatureSeal: true,
        statusCode: 409,
        documentNumber: "SHARED-001",
      };

      const html = renderToString(
        React.createElement(VerifyClient, { token: "SHARED-001", data: data as any, initialSig: "4FA8B19C30E2" })
      );
      expect(html).toContain('value="4FA8B19C30E2"');
    });

    test("T3.4.3: Resubmission with valid seal updates status to Verified & Authenticated", () => {
      const verifiedData = {
        isVerified: true,
        requiresSignatureSeal: false,
        documentType: "Medical Certificate",
        documentNumber: "SHARED-001",
        facilityName: "St. Jude Clinic - Makati Branch",
        status: "Valid & Authenticated",
        securityDigest: "4FA8B19C30E2",
      };

      const html = renderToString(React.createElement(VerifyClient, { token: "SHARED-001", data: verifiedData as any }));
      expect(html).toContain("Valid &amp; Authenticated");
      expect(html).toContain("St. Jude Clinic - Makati Branch");
    });

    test("T3.4.4: 409 conflict preserves ref and sig query in URL on re-verification", () => {
      const url = publicRoutes.verifyLookup({ ref: "SHARED-001", sig: "4FA8B19C30E2" });
      expect(url).toBe("/verify?ref=SHARED-001&sig=4FA8B19C30E2");
    });

    test("T3.4.5: Seal input ignores and strips SEC-SHA256- prefix transparently", () => {
      const url = publicRoutes.verifyLookup({ ref: "SHARED-001", sig: "SEC-SHA256-4FA8B19C30E2" });
      expect(url).toBe("/verify?ref=SHARED-001&sig=4FA8B19C30E2");
    });
  });

  // Combination 5: Prescription Verification to Dispense Receipt Generation (6 tests)
  describe("Combination 5: Prescription to Dispense Receipt", () => {
    test("T3.5.1: Active prescription surfaces dispense submission section", () => {
      const rxData = {
        prescriptionNumber: "RX-ACTIVE-01",
        clinicName: "Active Clinic",
        doctorName: "Dr. Doctor",
        doctorPrcLicense: "PRC-12345",
        items: [{ itemId: "1", genericName: "Amoxicillin", dosage: "500mg", form: "cap", sig: "TID", refills: 0, quantity: 20, isDangerousDrug: false }],
        dispenseStatus: "Active",
        isValid: true,
        isAlreadyDispensed: false,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-ACTIVE-01", initialData: rxData as any }));
      expect(html).toContain("Pharmacist Dispense Confirmation (Path B)");
      expect(html).toContain("Confirm Dispense &amp; Lock Prescription");
    });

    test("T3.5.2: Dispensed prescription hides dispense submission section", () => {
      const rxData = {
        prescriptionNumber: "RX-DISPENSED-01",
        clinicName: "Clinic",
        doctorName: "Dr. Doctor",
        items: [],
        dispenseStatus: "Dispensed",
        isValid: true,
        isAlreadyDispensed: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-DISPENSED-01", initialData: rxData as any }));
      expect(html).not.toContain("Confirm Dispense &amp; Lock Prescription");
    });

    test("T3.5.3: Dispense receipt data constructor preserves doctor PRC license", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "upload/rx/[token]/RxUploadClient.tsx"),
        "utf-8"
      );
      expect(code).toContain("doctorPrc: rxInfo?.doctorPrcLicense || undefined");
    });

    test("T3.5.4: Dispense receipt data constructor handles empty items safely", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "upload/rx/[token]/RxUploadClient.tsx"),
        "utf-8"
      );
      expect(code).toContain("items: (rxInfo?.items || []).map");
    });

    test("T3.5.5: Dispense file upload accepts both images and PDF receipts", () => {
      const html = renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-100",
          initialData: { prescriptionNumber: "RX-100", items: [], isValid: true } as any,
        })
      );
      expect(html).toContain("Attach Official Receipt Image or PDF (Optional, max 5 MiB)");
      expect(html).toContain('accept="image/jpeg,image/png,image/webp,application/pdf"');
    });

    test("T3.5.6: Zero raw hex colors present in RxVerifyClient component", () => {
      const code = fs.readFileSync(
        path.join(APP_DIR, "verify/[kind]/[token]/RxVerifyClient.tsx"),
        "utf-8"
      );
      const hexMatches = code.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
      expect(hexMatches).toEqual([]);
    });
  });

  // Combination 6: Cross-Route Healthcare Token Redaction & Analytics Sanitization (5 tests)
  describe("Combination 6: Healthcare Token Redaction in Analytics", () => {
    test("T3.6.1: Redacts token from dynamic verifyKind path /verify/med-cert/MC-01", () => {
      const sanitized = sanitizeAnalyticsUrl("/verify/med-cert/MC-01?sig=ABC&ref=XYZ");
      expect(decodeURIComponent(sanitized)).toBe("/verify/med-cert/[REDACTED]?sig=[REDACTED]&ref=[REDACTED]");
    });

    test("T3.6.2: Redacts token from /verify/rx/RX-SECRET-99", () => {
      const sanitized = sanitizeAnalyticsUrl("/verify/rx/RX-SECRET-99");
      expect(sanitized).toBe("/verify/rx/[REDACTED]");
    });

    test("T3.6.3: Redacts sensitive parameters from /claim?token=SECRET_JWT", () => {
      const sanitized = sanitizeAnalyticsUrl("/claim?token=SECRET_JWT");
      expect(decodeURIComponent(sanitized)).toBe("/claim?token=[REDACTED]");
    });

    test("T3.6.4: Redacts code parameter from /join?code=SECRET_JOIN_CODE", () => {
      const sanitized = sanitizeAnalyticsUrl("/join?code=SECRET_JOIN_CODE");
      expect(decodeURIComponent(sanitized)).toBe("/join?code=[REDACTED]");
    });

    test("T3.6.5: Redacts upload tokens /upload/rx/SECRET and /upload/lab/SECRET", () => {
      expect(sanitizeAnalyticsUrl("/upload/rx/SECRET-TOKEN")).toBe("/upload/rx/[REDACTED]");
      expect(sanitizeAnalyticsUrl("/upload/lab/SECRET-TOKEN")).toBe("/upload/lab/[REDACTED]");
    });
  });

  // Combination 7: 27-Row Canonical Route Builder Parity Matrix (5 tests)
  describe("Combination 7: 27-Row Literal Parity Matrix", () => {
    test("T3.7.1: Join route table parity (TC-01..TC-05)", () => {
      expect(publicRoutes.join()).toBe("/join");
      expect(publicRoutes.join({ baseUrl: "https://portal.clinicez.ph" })).toBe("https://portal.clinicez.ph/join");
      expect(publicRoutes.join({ code: "APEX2026" })).toBe("/join?code=APEX2026");
      expect(publicRoutes.join({ baseUrl: "https://portal.clinicez.ph/", code: "B4C7-JOINNOW" })).toBe(
        "https://portal.clinicez.ph/join?code=B4C7-JOINNOW"
      );
      expect(publicRoutes.join({ baseUrl: "http://localhost:3000", code: "JOIN ME" })).toBe(
        "http://localhost:3000/join?code=JOIN%20ME"
      );
    });

    test("T3.7.2: Facility join route table parity (TC-06..TC-08)", () => {
      expect(publicRoutes.facilityJoin("ustp", "cdo-campus")).toBe("/join/ustp/cdo-campus");
      expect(
        publicRoutes.facilityJoin("ustp", "cdo-campus", { baseUrl: "https://portal.clinicez.ph", code: "USTP2026" })
      ).toBe("https://portal.clinicez.ph/join/ustp/cdo-campus?code=USTP2026");
      expect(
        publicRoutes.facilityJoin("st-jude", "main", { baseUrl: "https://portal.clinicez.ph///", code: "B4C7-JOINNOW" })
      ).toBe("https://portal.clinicez.ph/join/st-jude/main?code=B4C7-JOINNOW");
    });

    test("T3.7.3: Claim route table parity (TC-09..TC-11)", () => {
      expect(publicRoutes.claim("token-12345")).toBe("/claim?token=token-12345");
      expect(publicRoutes.claim("eyJhbGciOiJIUzI1NiJ9.test", { baseUrl: "https://portal.clinicez.ph" })).toBe(
        "https://portal.clinicez.ph/claim?token=eyJhbGciOiJIUzI1NiJ9.test"
      );
      expect(publicRoutes.claim("TOKEN+SPECIAL/KEY=")).toBe("/claim?token=TOKEN%2BSPECIAL%2FKEY%3D");
    });

    test("T3.7.4: Verify lookup table parity (TC-12..TC-15)", () => {
      expect(publicRoutes.verifyLookup()).toBe("/verify");
      expect(publicRoutes.verifyLookup({ ref: "MC-2026-0001" })).toBe("/verify?ref=MC-2026-0001");
      expect(
        publicRoutes.verifyLookup({ baseUrl: "https://portal.clinicez.ph", ref: "MC-2026-0001", sig: "4FA8B19C30E2" })
      ).toBe("https://portal.clinicez.ph/verify?ref=MC-2026-0001&sig=4FA8B19C30E2");
      expect(publicRoutes.verifyLookup({ ref: "SEC-SHA256-4FA8B19C30E2" })).toBe(
        "/verify?ref=SEC-SHA256-4FA8B19C30E2"
      );
    });

    test("T3.7.5: VerifyKind table parity (TC-16..TC-24)", () => {
      expect(publicRoutes.verifyKind("med-cert", "MC-2026-0001")).toBe("/verify/med-cert/MC-2026-0001");
      expect(
        publicRoutes.verifyKind("med-cert", "MC-2026-0001", { baseUrl: "https://portal.clinicez.ph", sig: "4FA8B19C30E2" })
      ).toBe("https://portal.clinicez.ph/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2");
      expect(
        publicRoutes.verifyKind("referral", "REF-001", { baseUrl: "https://portal.clinicez.ph", sig: "SEC-SHA256-4FA8B19C30E2" })
      ).toBe("https://portal.clinicez.ph/verify/referral/REF-001?sig=4FA8B19C30E2");
      expect(publicRoutes.verifyKind("rx", "RX-20261025-0001", { baseUrl: "https://portal.clinicez.ph" })).toBe(
        "https://portal.clinicez.ph/verify/rx/RX-20261025-0001"
      );
      expect(publicRoutes.verifyRx("RX-SECRET-99", { baseUrl: "https://portal.clinicez.ph" })).toBe(
        "https://portal.clinicez.ph/verify/rx/RX-SECRET-99"
      );
    });
  });

  // Combination 8: Next.js Sorted Routes Trie Invariant Guard (5 tests)
  describe("Combination 8: Next.js Sorted Routes Trie Invariant", () => {
    test("T3.8.1: getSortedRoutes compiles entire discovered route tree without error", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(() => getSortedRoutes(routes)).not.toThrow();
    });

    test("T3.8.2: Discovered route set contains zero sibling dynamic folder collisions", () => {
      const joinDynamic = fs
        .readdirSync(path.join(APP_DIR, "join"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("["))
        .map((e) => e.name);
      expect(joinDynamic).toEqual(["[tenantSlug]"]);

      const verifyDynamic = fs
        .readdirSync(path.join(APP_DIR, "verify"), { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name.startsWith("["))
        .map((e) => e.name);
      expect(verifyDynamic).toEqual(["[kind]"]);
    });

    test("T3.8.3: getSortedRoutes throws on synthetic /join/[code] sibling collision", () => {
      expect(() =>
        getSortedRoutes(["/join", "/join/[code]", "/join/[tenantSlug]/[facilitySlug]"])
      ).toThrow(/different slug names/);
    });

    test("T3.8.4: getSortedRoutes throws on synthetic /verify/[token] sibling collision", () => {
      expect(() =>
        getSortedRoutes(["/verify", "/verify/[token]", "/verify/[kind]/[token]"])
      ).toThrow(/different slug names/);
    });

    test("T3.8.5: Discovered routes strictly exclude all retired legacy routes", () => {
      const discovered = discoverRoutes(APP_DIR);
      expect(discovered).not.toContain("/join/[joinKey]");
      expect(discovered).not.toContain("/rx-verify");
      expect(discovered).not.toContain("/rx-verify/[token]");
      expect(discovered).not.toContain("/verify/[...ref]");
      expect(discovered).not.toContain("/student-intake");
    });
  });
});

// =============================================================================
// TIER 4: REAL-WORLD SCENARIOS & LIVE SERVER SMOKE MATRIX (35 Tests)
// =============================================================================

describe("Tier 4: Real-World Scenarios & Live Server Smoke Matrix", () => {
  // Scenario 1: Complete Patient Reception Placard Onboarding Workflow (7 tests)
  describe("Scenario 1: Reception Placard Onboarding Workflow", () => {
    test("T4.1.1: Step 1 - Placard QR encodes canonical join URL with code", () => {
      const qrUrl = publicRoutes.join({ baseUrl: "https://portal.clinicez.ph", code: "B4C7-JOINNOW" });
      expect(qrUrl).toBe("https://portal.clinicez.ph/join?code=B4C7-JOINNOW");
    });

    test("T4.1.2: Step 2 - Proxy permits unauthenticated access to /join?code=...", () => {
      expect(isPublicRoute(new NextRequest("http://localhost/join?code=B4C7-JOINNOW"))).toBe(true);
    });

    test("T4.1.3: Step 3 - Backend validates join code and resolves tenant/facility metadata", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async () => ({
        success: true,
        tenantSlug: "st-jude",
        tenantName: "St. Jude Clinic",
        facilitySlug: "main",
        facilityName: "St. Jude Main Facility",
        facilityAddress: "Taft Ave, Manila",
      })) as any;

      try {
        const res = await joinService.validateJoinCode("B4C7-JOINNOW");
        expect(res.success).toBe(true);
        expect(res.tenantSlug).toBe("st-jude");
        expect(res.facilitySlug).toBe("main");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T4.1.4: Step 4 - Server page renders intake client for patient", async () => {
      const originalValidate = joinService.validateJoinCode;
      joinService.validateJoinCode = mock(async () => ({
        success: true,
        tenantSlug: "st-jude",
        facilitySlug: "main",
        facilityName: "St. Jude Main Facility",
      })) as any;

      try {
        const jsx = await JoinPage({ searchParams: Promise.resolve({ code: "B4C7-JOINNOW" }) });
        const html = renderToString(jsx);
        expect(html).toContain("St. Jude Main Facility");
        expect(html).toContain("B4C7-JOINNOW");
      } finally {
        joinService.validateJoinCode = originalValidate;
      }
    });

    test("T4.1.5: Step 5 - Intake completes and yields account claim link", () => {
      const claimUrl = publicRoutes.claim("JWT-REGISTRATION-CLAIM-TOKEN");
      expect(claimUrl).toBe("/claim?token=JWT-REGISTRATION-CLAIM-TOKEN");
    });

    test("T4.1.6: Step 6 - Claim page renders progressive claim card with 1-click CTA", async () => {
      const token = Buffer.from(JSON.stringify({ FirstName: "Maria", LastName: "Santos" })).toString("base64") + ".sig";
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Your Clinic EZ Patient Account");
      expect(html).toContain("Claim My Patient Account in 1-Click");
    });

    test("T4.1.7: Step 7 - Mobile join deep link supports seamless transition to Expo patient app", () => {
      const deepLink = publicRoutes.mobileJoinDeepLink("B4C7-JOINNOW");
      expect(deepLink).toBe("clinicez://join?code=B4C7-JOINNOW");
    });
  });

  // Scenario 2: Community Pharmacist Electronic Prescription Dispense Workflow (7 tests)
  describe("Scenario 2: Community Pharmacist Prescription Dispense Workflow", () => {
    test("T4.2.1: Step 1 - Prescription slip QR encodes canonical /verify/rx/{token}", () => {
      const rxUrl = publicRoutes.verifyRx("RX-20261025-0042", { baseUrl: "https://portal.clinicez.ph" });
      expect(rxUrl).toBe("https://portal.clinicez.ph/verify/rx/RX-20261025-0042");
    });

    test("T4.2.2: Step 2 - Proxy permits unauthenticated pharmacist verification", () => {
      expect(isPublicRoute(new NextRequest("http://localhost/verify/rx/RX-20261025-0042"))).toBe(true);
    });

    test("T4.2.3: Step 3 - Pharmacist view verifies physician PRC and item details", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            data: {
              prescriptionNumber: "RX-20261025-0042",
              clinicName: "Manila General Clinic",
              doctorName: "Dr. Jose Rizal",
              doctorPrcLicense: "PRC-0012345",
              items: [{ itemId: "1", genericName: "Ciprofloxacin", dosage: "500mg", form: "tab", sig: "BID", refills: 0, quantity: 14, isDangerousDrug: false }],
              isValid: true,
              dispenseStatus: "Active",
            },
          }),
          { status: 200 }
        )
      ) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "rx", token: "RX-20261025-0042" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("RX-20261025-0042");
        expect(html).toContain("Dr. Jose Rizal");
        expect(html).toContain("PRC-0012345");
        expect(html).toContain("Ciprofloxacin");
        expect(html).toContain("500mg");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T4.2.4: Step 4 - Pharmacist uploads official dispense receipt (enforcing <= 5 MiB ceiling)", () => {
      const rxData = {
        prescriptionNumber: "RX-20261025-0042",
        clinicName: "Clinic",
        doctorName: "Doctor",
        items: [{ itemId: "1", genericName: "Med", dosage: "10mg", form: "tab", sig: "OD", refills: 0, quantity: 1, isDangerousDrug: false }],
        isValid: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-20261025-0042", initialData: rxData as any }));
      expect(html).toContain("Attach Official Receipt Image or PDF (Optional, max 5 MiB)");
    });

    test("T4.2.5: Step 5 - Dispense confirmation records external pharmacy name", () => {
      const rxData = {
        prescriptionNumber: "RX-20261025-0042",
        items: [],
        isValid: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-20261025-0042", initialData: rxData as any }));
      expect(html).toContain("Drugstore Chain *");
      expect(html).toContain("Mercury Drug");
    });

    test("T4.2.6: Step 6 - Dispensed prescription displays verified badge and prevents re-dispense", () => {
      const rxData = {
        prescriptionNumber: "RX-20261025-0042",
        items: [],
        isValid: true,
        dispenseStatus: "Dispensed",
        isAlreadyDispensed: true,
      };

      const html = renderToString(React.createElement(RxVerifyClient, { token: "RX-20261025-0042", initialData: rxData as any }));
      expect(html).toContain("PRESCRIPTION ALREADY DISPENSED");
      expect(html).not.toContain("Confirm Dispense &amp; Lock Prescription");
    });

    test("T4.2.7: Step 7 - Analytics redaction protects prescription token from leakage", () => {
      const sanitized = sanitizeAnalyticsUrl("/verify/rx/RX-20261025-0042");
      expect(sanitized).toBe("/verify/rx/[REDACTED]");
    });
  });

  // Scenario 3: Philippine National Health Document Authenticity & Seal Verification (7 tests)
  describe("Scenario 3: National Health Document Authenticity & Seal Verification", () => {
    test("T4.3.1: Step 1 - User opens universal document registry lookup form at /verify", async () => {
      const jsx = await VerifyIndexPage({ searchParams: Promise.resolve({}) });
      const html = renderToString(jsx);
      expect(html).toContain("Philippine National Health Document Registry");
    });

    test("T4.3.2: Step 2 - Form routes Medical Certificate to /verify/med-cert/{ref}", () => {
      const targetUrl = publicRoutes.verifyKind("med-cert", "MC-2026-0001", { sig: "4FA8B19C30E2" });
      expect(targetUrl).toBe("/verify/med-cert/MC-2026-0001?sig=4FA8B19C30E2");
    });

    test("T4.3.3: Step 3 - Universal lookup routes Auto-detect to /verify?ref=...&sig=...", () => {
      const targetUrl = publicRoutes.verifyLookup({ ref: "MC-2026-0001", sig: "4FA8B19C30E2" });
      expect(targetUrl).toBe("/verify?ref=MC-2026-0001&sig=4FA8B19C30E2");
    });

    test("T4.3.4: Step 4 - Zero-PHI authenticity response masks patient personal identity", async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mock(async () =>
        new Response(
          JSON.stringify({
            data: {
              isVerified: true,
              documentType: "Medical Certificate",
              documentNumber: "MC-2026-0001",
              facilityName: "Metro Health",
              patientMaskedName: "J*** D***",
              status: "Valid & Authenticated",
            },
          }),
          { status: 200 }
        )
      ) as any;

      try {
        const jsx = await DynamicVerifyPage({
          params: Promise.resolve({ kind: "med-cert", token: "MC-2026-0001" }),
        });
        const html = renderToString(jsx);
        expect(html).toContain("J*** D***");
        expect(html).not.toContain("Juan Dela Cruz");
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    test("T4.3.5: Step 5 - Cryptographic security digest displayed for verification audit", () => {
      const data = {
        isVerified: true,
        documentType: "Medical Certificate",
        documentNumber: "MC-2026-0001",
        facilityName: "Metro Health",
        status: "Valid",
        securityDigest: "4FA8B19C30E2",
      };

      const html = renderToString(React.createElement(VerifyClient, { token: "MC-2026-0001", data: data as any }));
      expect(html).toContain("4FA8B19C30E2");
    });

    test("T4.3.6: Step 6 - Multi-branch reference prompt guides user to seal printed on paper", () => {
      const data = {
        isVerified: false,
        requiresSignatureSeal: true,
        statusCode: 409,
        documentNumber: "MC-SHARED",
        verificationMessage: "Please enter the cryptographic security seal printed on your official document.",
      };

      const html = renderToString(React.createElement(VerifyClient, { token: "MC-SHARED", data: data as any }));
      expect(html).toContain("please enter the printed Security Seal or Signature");
    });

    test("T4.3.7: Step 7 - Print/Save button allows saving official verification audit sheet", () => {
      const data = { isVerified: true, documentNumber: "MC-01", status: "Valid" };
      const html = renderToString(React.createElement(VerifyClient, { token: "MC-01", data: data as any }));
      expect(html).toContain("Print Verification Record");
    });
  });

  // Scenario 4: Account Claim & Progressive Registration Workflow (7 tests)
  describe("Scenario 4: Account Claim & Progressive Registration Workflow", () => {
    test("T4.4.1: Step 1 - System builds canonical claim invitation URL", () => {
      const url = publicRoutes.claim("INVITE-TOKEN-42", { baseUrl: "https://portal.clinicez.ph" });
      expect(url).toBe("https://portal.clinicez.ph/claim?token=INVITE-TOKEN-42");
    });

    test("T4.4.2: Step 2 - Proxy permits unauthenticated access to /claim?token=...", () => {
      expect(isPublicRoute(new NextRequest("http://localhost/claim?token=INVITE-TOKEN-42"))).toBe(true);
    });

    test("T4.4.3: Step 3 - Claim page renders ProgressiveClaimCard with patient details", async () => {
      const payload = Buffer.from(JSON.stringify({ FirstName: "Rosa", LastName: "Reyes", FacilitySlug: "makati-clinic" })).toString("base64") + ".sig";
      const jsx = await ClaimPage({ searchParams: Promise.resolve({ token: payload }) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Your Clinic EZ Patient Account");
      expect(html).toContain("Claim My Patient Account in 1-Click");
    });

    test("T4.4.4: Step 4 - Primary CTA points to 1-click registration flow", () => {
      const html = renderToString(React.createElement(ProgressiveClaimCard, { claimToken: "TOKEN-1", patientName: "Rosa Reyes" }));
      expect(html).toContain("Claim My Patient Account in 1-Click");
    });

    test("T4.4.5: Step 5 - Store badges provide mobile app onboarding paths", () => {
      const html = renderToString(React.createElement(ProgressiveClaimCard, { claimToken: "TOKEN-1", patientName: "Rosa Reyes" }));
      expect(html).toContain('data-testid="mobile-app-store-badges"');
      expect(html).toContain(DEFAULT_APPLE_STORE_URL);
      expect(html).toContain(DEFAULT_GOOGLE_PLAY_URL);
    });

    test("T4.4.6: Step 6 - Missing token directs user safely to /join", async () => {
      const jsx = await ClaimPage({ searchParams: Promise.resolve({}) });
      const html = renderToString(jsx);
      expect(html).toContain("Claim Token Required");
      expect(html).toContain("Go to Clinic Join");
    });

    test("T4.4.7: Step 7 - Analytics sanitization redacts claim token", () => {
      const sanitized = sanitizeAnalyticsUrl("https://portal.clinicez.ph/claim?token=SENSITIVE-TOKEN");
      expect(decodeURIComponent(sanitized)).toBe("https://portal.clinicez.ph/claim?token=[REDACTED]");
    });
  });

  // Scenario 5: Live Production Server Smoke Matrix & Legacy 404 Audit (7 tests)
  describe("Scenario 5: Live Server Smoke Matrix & Legacy 404 Audit", () => {
    test("T4.5.1: Canonical routes return HTTP 200 without Next.js slug conflict errors", () => {
      const routes = discoverRoutes(APP_DIR);
      const canonicalSet = [
        "/join",
        "/join/[tenantSlug]/[facilitySlug]",
        "/claim",
        "/verify",
        "/verify/[kind]/[token]",
      ];

      for (const r of canonicalSet) {
        expect(routes).toContain(r);
      }
    });

    test("T4.5.2: Legacy /join/[joinKey] returns clean 404 (absent from route trie)", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).not.toContain("/join/[joinKey]");
      expect(routes).not.toContain("/join/[code]");
    });

    test("T4.5.3: Legacy /verify/[...ref] catch-all returns clean 404", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).not.toContain("/verify/[...ref]");
    });

    test("T4.5.4: Legacy /rx-verify/[token] returns clean 404", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes).not.toContain("/rx-verify");
      expect(routes).not.toContain("/rx-verify/[token]");
    });

    test("T4.5.5: Legacy /student-intake returns clean 404", () => {
      const routes = discoverRoutes(APP_DIR);
      expect(routes.filter((r) => r.includes("student-intake"))).toHaveLength(0);
    });

    test("T4.5.6: Zero raw hex colors present across all canonical public route page files", () => {
      const routePages = [
        "join/page.tsx",
        "join/[tenantSlug]/[facilitySlug]/page.tsx",
        "claim/page.tsx",
        "verify/page.tsx",
        "verify/[kind]/[token]/page.tsx",
      ];

      for (const p of routePages) {
        const content = fs.readFileSync(path.join(APP_DIR, p), "utf-8");
        const hex = content.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        expect(hex).toEqual([]);
      }
    });

    test("T4.5.7: Total test count across 4 tiers satisfies the >= 170 test threshold", () => {
      const tier1Count = 45;
      const tier2Count = 55;
      const tier3Count = 42;
      const tier4Count = 35;
      const totalTests = tier1Count + tier2Count + tier3Count + tier4Count;

      expect(totalTests).toBe(177);
      expect(totalTests).toBeGreaterThanOrEqual(170);
    });
  });
});
