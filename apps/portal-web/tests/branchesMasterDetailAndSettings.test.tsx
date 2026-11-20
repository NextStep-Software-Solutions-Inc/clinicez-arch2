import { describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { SWRConfig } from "swr";

let mockSearchParams = new URLSearchParams();

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "manila-care", branchId: "branch-1" }),
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
  }),
  usePathname: () => "/manila-care/dashboard/branches/branch-1",
  useSearchParams: () => mockSearchParams,
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

mock.module("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile: () => {}, signOut: async () => {} }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
  }),
  useSignIn: () => ({ isLoaded: true, signIn: null }),
  useSignUp: () => ({ isLoaded: true, signUp: null, setActive: async () => {} }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedIn: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedOut: () => null,
  UserButton: () => <div data-testid="clerk-user-button" />,
}));

import {
  buildBranchFacilities,
  buildPhilHealthConfigurePayload,
  buildPhilHealthTestPayload,
  filterBranches,
  formatBranchFullAddress,
  formatBranchShortAddress,
  getAvailableSlots,
  getLinkableUnassignedFacilities,
  resolveConsoleUrl,
  resolvePhilHealthPlaceholders,
  sanitizeBranchContact,
} from "../src/components/dashboard/branches/branchHelpers";
import BranchManagementClient from "../src/components/dashboard/branches/BranchManagementClient";
import BranchDetailClient, {
  resolveBranchDetailTab,
} from "../src/components/dashboard/branches/BranchDetailClient";
import { resolveSiteHeaderTitle } from "../src/components/dashboard/site-header";
import FacilitySettingsHub from "../src/components/dashboard/FacilitySettingsHub";
import type { BranchDto } from "../src/services/branch.service";
import type { WorkspaceFacility } from "../src/services/facility.service";

const SRC_DIR = path.resolve(__dirname, "../src");

const sampleBranch: BranchDto = {
  id: "branch-1",
  tenantId: "tenant-1",
  name: "Nextstep CDO",
  code: "CDO-1",
  isActive: true,
  streetAddress: "CM Recto",
  barangay: "Lapasan",
  city: "Cagayan de Oro",
  province: "Misamis Oriental",
  region: "Region X",
  zipCode: "9000",
  contactNumber: "tel: +63 917 555 0100",
  contactEmail: "email: cdo@nextstep.ph",
  philHealthAccreditationNumber: "P10038831",
  philHealthPmccNumber: "Z15445",
  philHealthSoftwareCertificateId: "CERT-2026",
  philHealthBaseUrl: "https://pcapi.philhealth.gov.ph",
  isPhilHealthAccredited: true,
  hasSecretKey: true,
  hasCipherKey: false,
  facilities: [
    { id: "fac-c1", name: "Nextstep OPD", facilityType: "Clinic", status: "Active" },
    { id: "fac-l1", name: "Vitality Lab", facilityType: "Laboratory", status: "Active" },
  ],
};

const sampleSecondBranch: BranchDto = {
  id: "branch-2",
  tenantId: "tenant-1",
  name: "USTP - CDO",
  code: "CDO-2",
  isActive: false,
  city: "Cagayan de Oro",
  province: "Misamis Oriental",
  isPhilHealthAccredited: false,
  facilities: [{ id: "fac-p1", name: "Campus Rx", facilityType: "Pharmacy", status: "Active" }],
};

const sampleFacilities: WorkspaceFacility[] = [
  {
    id: "fac-c1",
    name: "Nextstep OPD",
    facilityType: "Clinic",
    status: "Active",
    createdAt: "2026-10-01T00:00:00Z",
    slug: "nextstep",
    consoleUrl: null,
    classification: "Primary Care",
    licenseToOperate: "DOH-LTO-101",
    ltoExpiryDate: "2028-12-31",
    philHealthAccreditationNumber: "P10038831",
    taxIdentificationNumber: null,
    operatingHours: null,
    region: "Region X",
    province: "Misamis Oriental",
    city: "Cagayan de Oro",
    barangay: "Lapasan",
    zipCode: "9000",
    streetAddress: "CM Recto",
    contactNumber: null,
    contactEmail: null,
    deploymentMode: "OnPremise",
    consoleBaseUrl: "https://cdo.clinic.local",
    visibility: "Public",
    acceptsExternalRequests: true,
    branchId: "branch-1",
    isPatientDiscoveryEligible: true,
    platformVerificationStatus: "Verified",
    rejectionReason: null,
    ltoEvidenceObjectKey: "verification/lto/cdo-clinic.pdf",
    verifiedAtUtc: "2026-11-01T00:00:00Z",
  },
  {
    id: "fac-l1",
    name: "Vitality Lab",
    facilityType: "Laboratory",
    status: "Active",
    createdAt: "2026-10-02T00:00:00Z",
    slug: "vitality",
    consoleUrl: null,
    classification: "Secondary Lab",
    licenseToOperate: null,
    ltoExpiryDate: null,
    philHealthAccreditationNumber: null,
    taxIdentificationNumber: null,
    operatingHours: null,
    region: "Region X",
    province: "Misamis Oriental",
    city: "Cagayan de Oro",
    barangay: "Lapasan",
    zipCode: null,
    streetAddress: null,
    contactNumber: null,
    contactEmail: null,
    deploymentMode: "SharedCloud",
    consoleBaseUrl: null,
    visibility: "Private",
    acceptsExternalRequests: false,
    branchId: "branch-1",
    isPatientDiscoveryEligible: false,
    platformVerificationStatus: "Unverified",
    rejectionReason: null,
    ltoEvidenceObjectKey: null,
    verifiedAtUtc: null,
  },
  {
    id: "fac-orphan-pharma",
    name: "Standalone Pharmacy",
    facilityType: "Pharmacy",
    status: "Active",
    createdAt: "2026-10-03T00:00:00Z",
    slug: "standalone-rx",
    consoleUrl: null,
    classification: null,
    licenseToOperate: null,
    ltoExpiryDate: null,
    philHealthAccreditationNumber: null,
    taxIdentificationNumber: null,
    operatingHours: null,
    region: null,
    province: null,
    city: "Iligan",
    barangay: null,
    zipCode: null,
    streetAddress: null,
    contactNumber: null,
    contactEmail: null,
    deploymentMode: "SharedCloud",
    consoleBaseUrl: null,
    visibility: "Private",
    acceptsExternalRequests: false,
    branchId: null,
    isPatientDiscoveryEligible: false,
    platformVerificationStatus: "Unverified",
    rejectionReason: null,
    ltoEvidenceObjectKey: null,
    verifiedAtUtc: null,
  },
];

describe("Workspace Settings Cleanup & Branches Master-Detail Redesign", () => {
  describe("1. Workspace Settings Facilities Tab Removal", () => {
    test("FacilitiesTab.tsx is deleted and settings/page.tsx removes the Facilities tab completely", () => {
      const facilitiesTabPath = path.join(
        SRC_DIR,
        "app/[tenant]/dashboard/settings/_components/FacilitiesTab.tsx",
      );
      expect(fs.existsSync(facilitiesTabPath)).toBe(false);

      const settingsPageSrc = fs.readFileSync(
        path.join(SRC_DIR, "app/[tenant]/dashboard/settings/page.tsx"),
        "utf8",
      );
      expect(settingsPageSrc).not.toContain("FacilitiesTab");
      expect(settingsPageSrc).not.toContain('value="facilities"');
      expect(settingsPageSrc).toContain('value="general"');
      expect(settingsPageSrc).toContain('value="branding"');
      expect(settingsPageSrc).toContain('value="security"');
      expect(settingsPageSrc).toContain('value="compliance"');
      expect(settingsPageSrc).toContain('value="integrations"');
      expect(settingsPageSrc).toContain('value="audit"');
      expect(settingsPageSrc).toContain('value="danger"');
    });

    test("NetworkClient and FacilityOnboardingWizard direct users to Branches -> Facility Settings instead of Settings -> Facilities", () => {
      const networkSrc = fs.readFileSync(
        path.join(SRC_DIR, "app/[tenant]/dashboard/network/NetworkClient.tsx"),
        "utf8",
      );
      const wizardSrc = fs.readFileSync(
        path.join(SRC_DIR, "components/dashboard/FacilityOnboardingWizard.tsx"),
        "utf8",
      );
      expect(networkSrc).not.toContain("Settings → Facilities");
      expect(networkSrc).toContain("/dashboard/branches");
      expect(wizardSrc).not.toContain("Settings → Facilities");
      expect(wizardSrc).toContain("Deployment & Network");
    });
  });

  describe("2. FacilitySettingsHub Migrated Deployment, Visibility & Hub Rotation Controls", () => {
    test("FacilitySettingsHub contains Deployment & Network tab with deployment mode, visibility, and hub credential rotation", () => {
      const hubSrc = fs.readFileSync(
        path.join(SRC_DIR, "components/dashboard/FacilitySettingsHub.tsx"),
        "utf8",
      );
      expect(hubSrc).toContain('value="deployment"');
      expect(hubSrc).toContain("Deployment &amp; Network");
      expect(hubSrc).toContain("updateFacilityDeployment");
      expect(hubSrc).toContain("linkService.setVisibility");
      expect(hubSrc).toContain("rotateHubCredentials");
      expect(hubSrc).toContain("Accept link requests automatically");
      expect(hubSrc).toContain("useOptionalHubCredentials");

      // Closed dialog smoke render with Deployment & Network facility metadata
      const html = renderToString(
        <FacilitySettingsHub
          facility={sampleFacilities[0]}
          open={false}
          initialTab="deployment"
          onOpenChange={() => {}}
        />,
      );
      expect(html).toBe("");
    });
  });

  describe("3. Branch Helpers & PhilHealth Credential Security", () => {
    test("formatters and contact sanitizers normalize legacy prefixes and missing fields cleanly", () => {
      expect(formatBranchShortAddress(sampleBranch)).toBe(
        "CM Recto, Lapasan, Cagayan de Oro, Misamis Oriental",
      );
      expect(formatBranchFullAddress(sampleBranch)).toBe(
        "CM Recto, Lapasan, Cagayan de Oro, Misamis Oriental, Region X 9000",
      );
      expect(sanitizeBranchContact(sampleBranch)).toEqual({
        phone: "+63 917 555 0100",
        email: "cdo@nextstep.ph",
      });
    });

    test("buildBranchFacilities, slot availability, and linkable unassigned facilities respect single-type-per-branch rule", () => {
      const hydrated = buildBranchFacilities(sampleBranch, sampleFacilities);
      expect(hydrated.map((f) => f.id)).toEqual(["fac-c1", "fac-l1"]);
      expect(hydrated[0].deploymentMode).toBe("OnPremise");
      expect(hydrated[0].visibility).toBe("Public");

      const available = getAvailableSlots(hydrated);
      expect(available.map((s) => s.type)).toEqual(["Pharmacy", "Organization"]);

      const orphanClinic: WorkspaceFacility = {
        ...sampleFacilities[2],
        id: "fac-orphan-clinic",
        facilityType: "Clinic",
        name: "Orphan Clinic",
      };
      const linkable = getLinkableUnassignedFacilities(
        [sampleFacilities[2], orphanClinic],
        hydrated,
      );
      // Clinic slot is already taken in sampleBranch; Pharmacy slot is free
      expect(linkable.map((f) => f.id)).toEqual(["fac-orphan-pharma"]);
    });

    test("filterBranches matches search queries across name, code, city, PMCC, and facility names plus status modes", () => {
      const both = [sampleBranch, sampleSecondBranch];
      expect(filterBranches(both, "Z15445").map((b) => b.id)).toEqual(["branch-1"]);
      expect(filterBranches(both, "Vitality").map((b) => b.id)).toEqual(["branch-1"]);
      expect(filterBranches(both, "CDO-2").map((b) => b.id)).toEqual(["branch-2"]);
      expect(filterBranches(both, "", "active").map((b) => b.id)).toEqual(["branch-1"]);
      expect(filterBranches(both, "", "accredited").map((b) => b.id)).toEqual(["branch-1"]);
      expect(filterBranches(both, "", "unconfigured").map((b) => b.id)).toEqual(["branch-2"]);
    });

    test("PhilHealth payload helpers preserve encrypted stored secrets when inputs are blank", () => {
      const placeholders = resolvePhilHealthPlaceholders(sampleBranch);
      expect(placeholders.secretKey).toBe("•••••••••••••••• (Leave blank to keep existing)");
      expect(placeholders.cipherKey).toBe("Enter Record Encryption Key");

      const testPayload = buildPhilHealthTestPayload({
        accreditationNumber: "P10038831",
        pmccNumber: "Z15445",
        softwareCertificateId: "CERT-2026",
        secretKey: "   ",
        cipherKey: "",
        baseUrl: "https://pcapi.philhealth.gov.ph",
      });
      expect(testPayload.secretKey).toBeUndefined();
      expect(testPayload.cipherKey).toBeUndefined();

      const configPayload = buildPhilHealthConfigurePayload({
        accreditationNumber: " P10038831 ",
        pmccNumber: " Z15445 ",
        softwareCertificateId: "",
        secretKey: "",
        cipherKey: " new-aes-key ",
        baseUrl: "https://pcapi.philhealth.gov.ph",
      });
      expect(configPayload.accreditationNumber).toBe("P10038831");
      expect(configPayload.secretKey).toBeUndefined();
      expect(configPayload.cipherKey).toBe("new-aes-key");
      expect(configPayload.isPhilHealthAccredited).toBe(true);
    });

    test("resolveConsoleUrl prioritizes explicit consoleUrl and respects tenant domain env", () => {
      expect(
        resolveConsoleUrl(
          {
            consoleUrl: "https://custom.clinic.local",
            facilityType: "Clinic",
            slug: "demo",
          },
          "manila-care",
        ),
      ).toBe("https://custom.clinic.local");
    });
  });

  describe("4. Master-Detail UI, Routing & Header Polish", () => {
    test("resolveSiteHeaderTitle displays 'Branch Details' instead of raw branch UUID", () => {
      expect(
        resolveSiteHeaderTitle(
          "/manila-care/dashboard/branches/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
        ),
      ).toBe("Branch Details");
      expect(
        resolveSiteHeaderTitle("/dashboard/branches/9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"),
      ).toBe("Branch Details");
      expect(resolveSiteHeaderTitle("/manila-care/dashboard/branches")).toBe("branches");
      expect(resolveSiteHeaderTitle("/manila-care/dashboard/settings")).toBe("settings");
    });

    test("resolveBranchDetailTab safely defaults invalid query values to 'facilities'", () => {
      expect(resolveBranchDetailTab(null)).toBe("facilities");
      expect(resolveBranchDetailTab("unknown")).toBe("facilities");
      expect(resolveBranchDetailTab("profile")).toBe("profile");
      expect(resolveBranchDetailTab("philhealth")).toBe("philhealth");
      expect(resolveBranchDetailTab("danger")).toBe("danger");
    });

    test("Branch detail route file exists and renders BranchDetailClient, and Master-Detail components avoid hardcoded hex colors", () => {
      const detailPagePath = path.join(
        SRC_DIR,
        "app/[tenant]/dashboard/branches/[branchId]/page.tsx",
      );
      expect(fs.existsSync(detailPagePath)).toBe(true);
      const detailPageSrc = fs.readFileSync(detailPagePath, "utf8");
      expect(detailPageSrc).toContain("BranchDetailClient");

      // Master-detail components render initial states without crashing during SSR
      const rosterHtml = renderToString(<BranchManagementClient />);
      expect(rosterHtml).toContain("Branches &amp; Locations");
      expect(rosterHtml).toContain("Total Branches");
      expect(rosterHtml).toContain("Loading branches");

      const detailHtml = renderToString(<BranchDetailClient />);
      expect(detailHtml.length).toBeGreaterThan(0);

      // ?tab=philhealth activates the PhilHealth YAKAP credentials card directly
      mockSearchParams = new URLSearchParams("tab=philhealth");
      try {
        const philHealthHtml = renderToString(
          <SWRConfig
            value={{
              fallback: {
                "branch-detail/manila-care/branch-1": {
                  branch: sampleBranch,
                  allFacilities: sampleFacilities,
                },
              },
            }}
          >
            <BranchDetailClient />
          </SWRConfig>,
        );
        expect(philHealthHtml).toContain("PhilHealth YAKAP Accreditation");
        expect(philHealthHtml).toContain("Connection Test");
      } finally {
        mockSearchParams = new URLSearchParams();
      }

      // Token hygiene check on all newly authored branch files
      const filesToInspect = [
        "components/dashboard/branches/branchHelpers.ts",
        "components/dashboard/branches/CreateBranchDialog.tsx",
        "components/dashboard/branches/BranchManagementClient.tsx",
        "components/dashboard/branches/BranchDetailClient.tsx",
      ];
      for (const rel of filesToInspect) {
        const content = fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
        expect(content).not.toMatch(/#[0-9a-fA-F]{6}\b/);
      }
    });
  });
});
