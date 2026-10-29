import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import React from "react";
import { renderToString } from "react-dom/server";
import * as fs from "fs";
import * as path from "path";
import type { EhrOptionDescriptor } from "@shared/safe";

// ---------------------------------------------------------------------------
// Controllable Mock for useEhrOptions hook
// ---------------------------------------------------------------------------
let mockOptionSetRequested: string | null = null;
let mockDynamicOptions: EhrOptionDescriptor[] = [];

mock.module("@/hooks/useEhrOptions", () => ({
  useEhrOptions: (optionSet: string) => {
    mockOptionSetRequested = optionSet;
    return {
      options: mockDynamicOptions,
      selectOptions: mockDynamicOptions.map((opt) => ({
        label: opt.label,
        value: opt.code,
        philHealthCode: opt.philHealthCode,
        requiresSpecifyText: opt.requiresSpecifyText,
      })),
      loading: false,
      error: null,
      refresh: async () => {},
    };
  },
}));

// Import target under test AFTER mock registration
import RxVerifyClient, {
  type RxVerificationData,
} from "../src/app/verify/[kind]/[token]/RxVerifyClient";
import { optionsService } from "../src/services/options.service";

const PORTAL_WEB_ROOT = path.resolve(__dirname, "..");
const RX_VERIFY_PATH = path.join(
  PORTAL_WEB_ROOT,
  "src/app/verify/[kind]/[token]/RxVerifyClient.tsx"
);

const validInitialData: RxVerificationData = {
  prescriptionNumber: "RX-20261028-0099",
  issuedAt: "2026-10-28T10:00:00Z",
  clinicName: "Metro Health Central Clinic",
  clinicAddress: "Suite 402 Medical Arts Bldg, Cebu City",
  clinicContact: "+63 32 231 4567",
  doctorName: "Dr. Maria Santos, MD",
  doctorPrcLicense: "0123456",
  doctorPtr: "PTR-2026-98765",
  doctorS2License: "S2-2026-54321",
  doctorSpecialization: "Internal Medicine",
  patientName: "Juan Dela Cruz",
  patientAge: 45,
  patientGender: "Male",
  patientAllergies: "Penicillin",
  clinicalDiagnosis: "Essential Hypertension",
  items: [
    {
      itemId: "item-1",
      genericName: "Amlodipine Besylate",
      brandName: "Norvasc",
      dosage: "5mg",
      form: "Tablet",
      sig: "Take 1 tablet once daily",
      quantity: 30,
      durationDays: 30,
      refills: 0,
      isDangerousDrug: false,
    },
  ],
  dispenseStatus: "Active",
  isValid: true,
  isAlreadyDispensed: false,
  hasDangerousDrug: false,
  itemCount: 1,
};

function renderWithSelectedPharmacy(
  selectedPharmacyName: string,
  initialData: RxVerificationData = validInitialData,
  token: string = "RX-TEST"
): string {
  return renderToString(
    React.createElement(RxVerifyClient, {
      token,
      initialData,
      initialPharmacyName: selectedPharmacyName,
    })
  );
}

describe("Milestone R2 Challenger: Empirical Dynamic Options & Other Drugstore Verification", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockOptionSetRequested = null;
    mockDynamicOptions = [];
    optionsService.clearCache();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // 1. Static AST & Anti-Regression Invariant Tests
  // =========================================================================
  describe("1. Static AST & Anti-Regression Invariants", () => {
    test("T1.1: Static COMMON_DRUGSTORES array and inline drugstore literals are completely purged from RxVerifyClient.tsx", () => {
      const code = fs.readFileSync(RX_VERIFY_PATH, "utf-8");
      expect(code).not.toContain("COMMON_DRUGSTORES");
      expect(code).not.toContain("const COMMON_DRUGSTORES");
      expect(code).not.toContain("export const COMMON_DRUGSTORES");
      expect(code).not.toContain("MERCURY_DRUG");
    });

    test("T1.2: RxVerifyClient.tsx imports and calls useEhrOptions('common_drugstore')", () => {
      const code = fs.readFileSync(RX_VERIFY_PATH, "utf-8");
      expect(code).toContain("import { useEhrOptions } from '@/hooks/useEhrOptions';");
      expect(code).toContain("useEhrOptions('common_drugstore')");
    });

    test("T1.3: Zero occurrences of COMMON_DRUGSTORES anywhere in apps/portal-web/src", () => {
      const srcDir = path.join(PORTAL_WEB_ROOT, "src");
      const files = fs.readdirSync(srcDir, { recursive: true }) as string[];
      for (const file of files) {
        const fullPath = path.join(srcDir, file);
        if (fs.statSync(fullPath).isFile() && (file.endsWith(".ts") || file.endsWith(".tsx"))) {
          const content = fs.readFileSync(fullPath, "utf-8");
          expect(content).not.toContain("COMMON_DRUGSTORES");
        }
      }
    });
  });

  // =========================================================================
  // 2. Dynamic Options Rendering Verification
  // =========================================================================
  describe("2. Dynamic Drugstore Options Hydration", () => {
    test("T2.1: RxVerifyClient requests 'common_drugstore' optionSet upon rendering", () => {
      renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-TEST-001",
          initialData: validInitialData,
        })
      );
      expect(mockOptionSetRequested).toBe("common_drugstore");
    });

    test("T2.2: Renders dynamic options returned by useEhrOptions('common_drugstore')", () => {
      mockDynamicOptions = [
        { code: "PHARM_CEBU_01", label: "Cebu Doctors Hospital Pharmacy" },
        { code: "PHARM_CHONG_HUA", label: "Chong Hua Hospital Pharmacy" },
        { code: "PHARM_PERPETUAL", label: "Perpetual Succour Pharmacy" },
        { code: "CUSTOM_OTHER", label: "Other Local Pharmacy", requiresSpecifyText: true },
      ];

      const html = renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-TEST-002",
          initialData: validInitialData,
        })
      );

      // Verify all dynamic labels are present in the select options
      expect(html).toContain("Cebu Doctors Hospital Pharmacy");
      expect(html).toContain("Chong Hua Hospital Pharmacy");
      expect(html).toContain("Perpetual Succour Pharmacy");
      expect(html).toContain("Other Local Pharmacy");

      // Verify default fallback options are NOT rendered when dynamic options exist
      expect(html).not.toContain("Mercury Drug");
      expect(html).not.toContain("Rose Pharmacy");
      expect(html).not.toContain("The Generics Pharmacy (TGP)");
    });

    test("T2.3: Hydrates SSR initialDrugstoreOptions fetched from backend when client hook has not yet resolved", () => {
      mockDynamicOptions = []; // Client hook still hydrating during SSR
      const serverFetchedOptions: EhrOptionDescriptor[] = [
        { code: "MERCURY_DRUG", label: "Mercury Drug", isActive: true },
        { code: "WATSONS", label: "Watsons", isActive: true },
        { code: "OTHER", label: "Other", requiresSpecifyText: true, isActive: true },
      ];

      const html = renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-TEST-003",
          initialData: validInitialData,
          initialDrugstoreOptions: serverFetchedOptions,
        })
      );

      expect(html).toContain("Mercury Drug");
      expect(html).toContain("Watsons");
      expect(html).toContain("Other");
    });
  });

  // =========================================================================
  // 3. 'Other' Drugstore & Custom Pharmacy Input Field Triggering
  // =========================================================================
  describe("3. 'Other' Drugstore & Custom Pharmacy Field Triggering", () => {
    test("T3.1: Standard drugstore displays 'Branch Location' and hides 'Specify Drugstore Name *'", () => {
      mockDynamicOptions = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        { code: "WATSONS", label: "Watsons" },
        { code: "OTHER", label: "Other", requiresSpecifyText: true },
      ];

      const html = renderWithSelectedPharmacy("Mercury Drug");

      // Default selection is Mercury Drug (standard chain)
      expect(html).toContain("Branch Location");
      expect(html).toContain("placeholder=\"e.g. Ayala Center Cebu, Makati Ave Branch\"");
      expect(html).not.toContain("Specify Drugstore Name *");
      expect(html).not.toContain("placeholder=\"e.g. Local Community Pharmacy\"");
    });

    test("T3.2: Selecting 'Other' triggers 'Specify Drugstore Name *' and hides 'Branch Location'", () => {
      mockDynamicOptions = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        { code: "WATSONS", label: "Watsons" },
        { code: "OTHER", label: "Other", requiresSpecifyText: true },
      ];

      const html = renderWithSelectedPharmacy("Other");

      expect(html).toContain("Specify Drugstore Name *");
      expect(html).toContain("placeholder=\"e.g. Local Community Pharmacy\"");
      expect(html).not.toContain("placeholder=\"e.g. Ayala Center Cebu, Makati Ave Branch\"");
      expect(html).not.toContain("Branch Location");
    });

    test("T3.3: Option with requiresSpecifyText: true triggers custom input even if label is not literally 'Other'", () => {
      mockDynamicOptions = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        {
          code: "INDEPENDENT_DISPENSARY",
          label: "Independent Community Dispensary",
          requiresSpecifyText: true,
        },
      ];

      const html = renderWithSelectedPharmacy("Independent Community Dispensary");

      expect(html).toContain("Specify Drugstore Name *");
      expect(html).toContain("placeholder=\"e.g. Local Community Pharmacy\"");
      expect(html).not.toContain("Branch Location");
    });

    test("T3.4: Option with code: 'OTHER' triggers custom input even if label is custom string", () => {
      mockDynamicOptions = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        {
          code: "OTHER",
          label: "Non-Affiliated Drug Outlet",
          requiresSpecifyText: false,
        },
      ];

      const html = renderWithSelectedPharmacy("Non-Affiliated Drug Outlet");

      expect(html).toContain("Specify Drugstore Name *");
      expect(html).toContain("placeholder=\"e.g. Local Community Pharmacy\"");
      expect(html).not.toContain("Branch Location");
    });

    test("T3.5: Option with label 'Other Drugstore' triggers custom input", () => {
      mockDynamicOptions = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        {
          code: "OTHER_DRUGSTORE_CODE",
          label: "Other Drugstore",
        },
      ];

      const html = renderWithSelectedPharmacy("Other Drugstore");

      expect(html).toContain("Specify Drugstore Name *");
      expect(html).toContain("placeholder=\"e.g. Local Community Pharmacy\"");
      expect(html).not.toContain("Branch Location");
    });
  });

  // =========================================================================
  // 4. Options Service & ETag Caching Protocol for 'common_drugstore'
  // =========================================================================
  describe("4. Options Service Integration for common_drugstore", () => {
    test("T4.1: optionsService.getOptionSet('common_drugstore') fetches from /public/options/common_drugstore and caches", async () => {
      let requestedUrl = "";
      const fakeDescriptors: EhrOptionDescriptor[] = [
        { code: "MERCURY_DRUG", label: "Mercury Drug" },
        { code: "WATSONS", label: "Watsons" },
        { code: "OTHER", label: "Other", requiresSpecifyText: true },
      ];

      globalThis.fetch = mock(async (url: string | URL | Request) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify(fakeDescriptors), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ETag: '"etag-drugstore-v1"',
          },
        });
      }) as any;

      const result = await optionsService.getOptionSet("common_drugstore");
      expect(requestedUrl).toContain("/public/options/common_drugstore");
      expect(result).toHaveLength(3);
      expect(result[0].code).toBe("MERCURY_DRUG");
      expect(result[2].requiresSpecifyText).toBe(true);

      // Verify in-memory cache returns cached data on second call without fetching
      let secondFetchCalled = false;
      globalThis.fetch = mock(async () => {
        secondFetchCalled = true;
        return {
          status: 304,
          ok: false,
          headers: new Headers(),
          json: async () => [],
        } as any;
      }) as any;

      const cachedResult = await optionsService.getOptionSet("common_drugstore");
      expect(cachedResult).toHaveLength(3);
      expect(cachedResult[0].code).toBe("MERCURY_DRUG");
      expect(secondFetchCalled).toBe(true);
    });
  });

  // =========================================================================
  // 5. Prescription Lifecycle State Guarding
  // =========================================================================
  describe("5. Prescription Lifecycle State Guarding", () => {
    test("T5.1: Dispense form is completely suppressed when prescription is already dispensed", () => {
      const dispensedData: RxVerificationData = {
        ...validInitialData,
        isAlreadyDispensed: true,
        dispenseStatus: "Dispensed",
        dispensedPharmacyName: "Mercury Drug",
        dispensedReceiptNumber: "OR-998877",
        dispensedAt: "2026-10-28T11:00:00Z",
      };

      const html = renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-TEST-DISPENSED",
          initialData: dispensedData,
        })
      );

      // Form must be absent
      expect(html).not.toContain("Pharmacist Dispense Confirmation");
      expect(html).not.toContain("Drugstore Chain *");

      // Dispensed status banner must be present
      expect(html).toContain("PRESCRIPTION ALREADY DISPENSED");
      expect(html).toContain("Mercury Drug");
      expect(html).toContain("OR-998877");
    });

    test("T5.2: Dispense form is completely suppressed when prescription is expired", () => {
      const expiredData: RxVerificationData = {
        ...validInitialData,
        isExpired: true,
        status: "EXPIRED",
        expiresAt: "2026-01-01T00:00:00Z",
      };

      const html = renderToString(
        React.createElement(RxVerifyClient, {
          token: "RX-TEST-EXPIRED",
          initialData: expiredData,
        })
      );

      expect(html).not.toContain("Pharmacist Dispense Confirmation");
      expect(html).not.toContain("Drugstore Chain *");
      expect(html).toContain("Expired");
    });
  });
});
