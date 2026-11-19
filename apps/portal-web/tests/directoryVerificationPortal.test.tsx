import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { NextRequest } from "next/server";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "manila-care" }),
  useRouter: () => ({
    push: () => {},
    replace: () => {},
    prefetch: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
  }),
  usePathname: () => "/manila-care/dashboard/branches",
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

mock.module("@clerk/nextjs", () => ({
  useClerk: () => ({
    openUserProfile: () => {},
    signOut: async () => {},
  }),
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
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="clerk-user-button" />,
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { apiClient } from "../src/transport/apiClient";
import { verificationService } from "../src/services/verification.service";
import { facilityService } from "../src/services/facility.service";
import {
  isProtectedRoute,
  isPublicRoute,
  isReservedSubdomain,
  isTenantSubdomainBypassPath,
} from "../src/proxy";
import { AppSidebar } from "../src/components/dashboard/app-sidebar";
import { SidebarProvider } from "../src/components/ui/sidebar";
import { PractitionerConfirmClient } from "../src/app/verify/practitioner/PractitionerConfirmClient";
import FacilitySettingsHub from "../src/components/dashboard/FacilitySettingsHub";
import { InlineEvidenceViewer } from "../src/components/dashboard/InlineEvidenceViewer";
import {
  getPlatformVerificationDisplay,
  validateLtoProofFile,
} from "../src/lib/verificationStatus";

const PORTAL_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_ROOT, "src");

describe("Phase 2B: Portal-Web Tenant & Public Directory Verification (Admin Isolation Enforced)", () => {
  let originalGet: typeof apiClient.get;
  let originalPost: typeof apiClient.post;

  beforeEach(() => {
    originalGet = apiClient.get;
    originalPost = apiClient.post;
  });

  afterEach(() => {
    apiClient.get = originalGet;
    apiClient.post = originalPost;
  });

  describe("1. Tenant & Public verification.service.ts API Contracts", () => {
    test("facility verification-status, lto-proof upload/fetch, and public confirm-affiliation unwrap payloads cleanly", async () => {
      const calls: Array<{ method: string; url: string; body?: unknown; config?: unknown }> = [];
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (
        url: string,
        config?: unknown,
      ) => {
        calls.push({ method: "GET", url, config });
        if (url.includes("/lto-proof")) {
          return {
            data: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'inline; filename="manila-lto.pdf"',
            },
          };
        }
        if (url.includes("/public/practitioners/confirm-affiliation")) {
          return {
            data: {
              succeeded: true,
              data: {
                requestId: "r-1",
                practitionerId: "p-1",
                practitionerName: "Dr. Jose Rizal",
                professionKind: "Doctor",
                facilityId: "f-1",
                facilityName: "Manila Care Ermita",
                specialty: "Family Medicine",
                status: "AwaitingOtp",
                expiresAtUtc: "2026-11-20T00:00:00Z",
                alreadyConfirmed: false,
                isExpired: false,
                requiresOtpCode: false,
              },
            },
          };
        }
        return {
          data: {
            facilityId: "f-1",
            platformVerificationStatus: "Rejected",
            isPatientDiscoveryEligible: true,
            isPlatformVerified: false,
            ltoEvidenceObjectKey: "verification/lto/doc.pdf",
            latestVerificationRequestId: "r-1",
            verifiedAtUtc: null,
            rejectionReason: "Blurry LTO scan",
            latestRequest: null,
            practitioners: [],
          },
        };
      }) as unknown as typeof apiClient.get;

      (apiClient as unknown as { post: typeof apiClient.post }).post = (async (
        url: string,
        body: unknown,
      ) => {
        calls.push({ method: "POST", url, body });
        if (url.includes("/public/practitioners/confirm-affiliation")) {
          return {
            data: {
              succeeded: true,
              data: {
                requestId: "r-1",
                practitionerId: "p-1",
                affiliationId: "a-1",
                facilityId: "f-1",
                facilityName: "Manila Care Ermita",
                affiliationStatus: "Active",
                alreadyConfirmed: false,
                confirmedAtUtc: "2026-11-18T10:00:00Z",
              },
            },
          };
        }
        return {
          data: {
            objectKey: "verification/lto/new.pdf",
            facilityId: "f-1",
            ltoEvidenceObjectKey: "verification/lto/new.pdf",
          },
        };
      }) as unknown as typeof apiClient.post;

      const status = await facilityService.getVerificationStatus("manila-care", "f-1");
      expect(status.platformVerificationStatus).toBe("Rejected");
      expect(status.rejectionReason).toBe("Blurry LTO scan");

      const file = new File(["%PDF-1.4"], "lto.pdf", { type: "application/pdf" });
      const uploadRes = await facilityService.uploadLtoProof("manila-care", "f-1", file);
      expect(uploadRes.ltoEvidenceObjectKey).toBe("verification/lto/new.pdf");
      expect(calls[1].url).toBe("/facilities/f-1/lto-proof?tenantSlug=manila-care");
      expect(calls[1].body instanceof FormData).toBe(true);

      const proof = await facilityService.fetchLtoProof("manila-care", "f-1");
      expect(proof.contentType).toBe("application/pdf");
      expect(proof.fileName).toBe("manila-lto.pdf");
      expect(calls[2].url).toBe("/facilities/f-1/lto-proof?tenantSlug=manila-care");
      expect((calls[2].config as { responseType?: string })?.responseType).toBe("blob");

      const preview = await verificationService.getAffiliationConfirmation("tok-123");
      expect(preview.practitionerName).toBe("Dr. Jose Rizal");
      expect(calls[3].url).toBe("/public/practitioners/confirm-affiliation?token=tok-123");

      const confirmed = await verificationService.confirmPractitionerAffiliation("tok-123", "654321");
      expect(confirmed.affiliationStatus).toBe("Active");
      expect(calls[4]).toEqual({
        method: "POST",
        url: "/public/practitioners/confirm-affiliation",
        body: { token: "tok-123", otpCode: "654321" },
      });

      // Extracts backend JSON error messages from responseType: "blob" failures
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => {
        const err = new Error("Request failed with status code 404") as Error & {
          response?: { status: number; data: Blob };
        };
        err.response = {
          status: 404,
          data: new Blob(
            [JSON.stringify({ message: "DOH LTO proof file not found." })],
            { type: "application/json" },
          ),
        };
        throw err;
      }) as unknown as typeof apiClient.get;
      await expect(facilityService.fetchLtoProof("manila-care", "f-1")).rejects.toThrow(
        "DOH LTO proof file not found.",
      );
    });
  });

  describe("2. Strict Admin Isolation & Public Route Protection", () => {
    test("admin directory verification route and components are completely removed from portal-web", () => {
      expect(fs.existsSync(path.join(SRC_DIR, "app/portal/verifications"))).toBe(false);
      expect(fs.existsSync(path.join(SRC_DIR, "app/portal"))).toBe(false);
      expect(fs.existsSync(path.join(SRC_DIR, "components/verifications"))).toBe(false);

      expect(isProtectedRoute(new NextRequest("http://localhost/portal/verifications"))).toBe(false);
      expect(isTenantSubdomainBypassPath("/portal/verifications")).toBe(false);

      const verificationSvcSrc = fs.readFileSync(
        path.join(SRC_DIR, "services/verification.service.ts"),
        "utf8",
      );
      expect(verificationSvcSrc).not.toContain("/admin/");
      expect(verificationSvcSrc).not.toContain("getVerificationQueue");
      expect(verificationSvcSrc).not.toContain("getReviewerProfile");
    });

    test("tenant AppSidebar never renders Platform Review or Directory Verifications admin links", () => {
      const sidebarHtml = renderToString(
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>,
      );
      expect(sidebarHtml).not.toContain("Platform Review");
      expect(sidebarHtml).not.toContain("Directory Verifications");
      expect(sidebarHtml).not.toContain("/portal/verifications");
      expect(sidebarHtml).not.toContain("/admin");
    });

    test("/verify/practitioner is public and reserved subdomains remain intact", () => {
      expect(isPublicRoute(new NextRequest("http://localhost/verify/practitioner?token=abc"))).toBe(
        true,
      );
      expect(isReservedSubdomain("admin")).toBe(true);
      expect(isReservedSubdomain("portal")).toBe(true);
    });
  });

  describe("3. Public Affiliation Confirmation (/verify/practitioner)", () => {
    test("renders missing token prompt, pending confirmation with optional OTP, confirmed state, and expired state", () => {
      const missingHtml = renderToString(<PractitionerConfirmClient initialToken="" />);
      expect(missingHtml).toContain("Confirmation Token Required");

      const pendingHtml = renderToString(
        <PractitionerConfirmClient
          initialToken="tok-1"
          initialInfo={{
            requestId: "r-1",
            practitionerId: "p-1",
            practitionerName: "RN Clara Mendoza",
            professionKind: "Nurse",
            facilityId: "f-1",
            facilityName: "Manila Care Ermita",
            specialty: "Outpatient Nursing",
            status: "AwaitingOtp",
            expiresAtUtc: "2026-11-20T00:00:00Z",
            alreadyConfirmed: false,
            isExpired: false,
            requiresOtpCode: false,
          }}
        />,
      );
      expect(pendingHtml).toContain("RN Clara Mendoza");
      expect(pendingHtml).toContain("Manila Care Ermita");
      expect(pendingHtml).toContain("Verification Code (Optional)");
      expect(pendingHtml).toContain("Confirm Clinic Affiliation");

      const confirmedHtml = renderToString(
        <PractitionerConfirmClient
          initialToken="tok-1"
          initialInfo={{
            requestId: "r-1",
            practitionerId: "p-1",
            practitionerName: "RN Clara Mendoza",
            professionKind: "Nurse",
            facilityId: "f-1",
            facilityName: "Manila Care Ermita",
            specialty: "Outpatient Nursing",
            status: "Approved",
            expiresAtUtc: "2026-11-20T00:00:00Z",
            alreadyConfirmed: true,
            isExpired: false,
            requiresOtpCode: false,
          }}
        />,
      );
      expect(confirmedHtml).toContain("Clinic Affiliation Confirmed");

      const expiredHtml = renderToString(
        <PractitionerConfirmClient
          initialToken="tok-1"
          initialInfo={{
            requestId: "r-1",
            practitionerId: "p-1",
            practitionerName: "RN Clara Mendoza",
            professionKind: "Nurse",
            facilityId: "f-1",
            facilityName: "Manila Care Ermita",
            specialty: "Outpatient Nursing",
            status: "AwaitingOtp",
            expiresAtUtc: "2026-11-01T00:00:00Z",
            alreadyConfirmed: false,
            isExpired: true,
            requiresOtpCode: false,
          }}
        />,
      );
      expect(expiredHtml).toContain("Confirmation Link Expired");
    });
  });

  describe("4. Subscriber Facility Verification View, Inline Viewer & Status Parsing", () => {
    test("facilityService.getFacilities parses verification fields and getPlatformVerificationDisplay maps badges", async () => {
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => ({
        data: [
          {
            id: "f-1",
            name: "Manila Care Ermita",
            facilityType: "Clinic",
            status: "Active",
            createdAt: "2026-11-18T00:00:00Z",
            slug: "manila-care-ermita",
            deploymentMode: "SharedCloud",
            visibility: "Private",
            acceptsExternalRequests: false,
            isPatientDiscoveryEligible: true,
            platformVerificationStatus: "Rejected",
            rejectionReason: "DOH LTO document expired",
            ltoEvidenceObjectKey: "verification/lto/ermita.pdf",
            verifiedAtUtc: null,
          },
        ],
      })) as unknown as typeof apiClient.get;

      const list = await facilityService.getFacilities("manila-care");
      expect(list[0].platformVerificationStatus).toBe("Rejected");
      expect(list[0].rejectionReason).toBe("DOH LTO document expired");
      expect(list[0].ltoEvidenceObjectKey).toBe("verification/lto/ermita.pdf");

      expect(getPlatformVerificationDisplay("Unverified").label).toBe("Unverified");
      expect(getPlatformVerificationDisplay("PendingReview").label).toBe("Pending Review");
      expect(getPlatformVerificationDisplay("Verified").label).toBe("Verified");
      expect(getPlatformVerificationDisplay("Rejected").label).toBe("Action Required");
    });

    test("validateLtoProofFile enforces allowed types and 5 MiB size limit", () => {
      expect(
        validateLtoProofFile({ name: "lto.pdf", size: 1024, type: "application/pdf" }).valid,
      ).toBe(true);
      expect(
        validateLtoProofFile({ name: "lto.txt", size: 1024, type: "text/plain" }).valid,
      ).toBe(false);
      expect(
        validateLtoProofFile({
          name: "huge.pdf",
          size: 6 * 1024 * 1024,
          type: "application/pdf",
        }).valid,
      ).toBe(false);
    });

    test("InlineEvidenceViewer renders uploaded PDF and image previews inline rather than raw storage keys", () => {
      const pdfHtml = renderToString(
        <InlineEvidenceViewer
          label="DOH License to Operate (LTO) Proof"
          objectKey="verification/lto/t1/f1/ermita.pdf"
          initialPreviewUrl="blob:http://localhost/pdf-1"
          initialContentType="application/pdf"
          initialFileName="ermita-lto.pdf"
        />,
      );
      expect(pdfHtml).toContain("<iframe");
      expect(pdfHtml).toContain("ermita-lto.pdf");
      expect(pdfHtml).toContain("View");
      expect(pdfHtml).not.toContain("verification/lto/t1/f1/ermita.pdf");

      const imgHtml = renderToString(
        <InlineEvidenceViewer
          label="DOH License to Operate (LTO) Proof"
          objectKey="verification/lto/t1/f1/ermita.png"
          initialPreviewUrl="blob:http://localhost/img-1"
          initialContentType="image/png"
          initialFileName="ermita-lto.png"
        />,
      );
      expect(imgHtml).toContain("<img");
      expect(imgHtml).toContain("ermita-lto.png");
      expect(imgHtml).not.toContain("verification/lto/t1/f1/ermita.png");
    });

    test("FacilitySettingsHub wires Discovery toggle, inline LTO viewer, rejection notice, and submission summary", () => {
      const hubSrc = fs.readFileSync(
        path.join(SRC_DIR, "components/dashboard/FacilitySettingsHub.tsx"),
        "utf8",
      );
      expect(hubSrc).toContain("Patient App Directory Discovery");
      expect(hubSrc).toContain("DOH LTO Proof Document");
      expect(hubSrc).toContain("InlineEvidenceViewer");
      expect(hubSrc).toContain("Submission History Summary");
      expect(hubSrc).toContain("Action Required — Verification Rejected");

      const closedHtml = renderToString(
        <FacilitySettingsHub
          facility={{
            id: "f-1",
            name: "Manila Care Ermita",
            facilityType: "Clinic",
            status: "Active",
            createdAt: "2026-11-18T00:00:00Z",
            isPatientDiscoveryEligible: true,
            platformVerificationStatus: "Rejected",
            rejectionReason: "Missing notary seal",
            ltoEvidenceObjectKey: "verification/lto/ermita.pdf",
          }}
          open={false}
          onOpenChange={() => {}}
        />,
      );
      expect(typeof closedHtml).toBe("string");
    });
  });

  describe("5. Decoupling & Design Token Compliance Audit", () => {
    test("portal verification files contain zero raw hex codes, zero palette classes, zero hardcoded domains, and zero 'admin.service'", () => {
      const auditedFiles = [
        "lib/wire.ts",
        "lib/verificationStatus.ts",
        "services/verification.service.ts",
        "services/facility.service.ts",
        "proxy.ts",
        "components/dashboard/app-sidebar.tsx",
        "components/dashboard/InlineEvidenceViewer.tsx",
        "app/verify/practitioner/page.tsx",
        "app/verify/practitioner/PractitionerConfirmClient.tsx",
      ];

      const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
      const forbiddenPaletteRegex = /\b(?:emerald|amber|yellow)-(?:[1-9]00|50|950)(?:\/[0-9]+)?\b/g;
      const hardcodedDomainRegex = /clinicez\.(?:com|ph|net)/gi;

      for (const rel of auditedFiles) {
        const content = fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
        expect(content).not.toContain("admin.service");
        expect(content).not.toContain("palette.ts");
        expect(content.match(hexRegex) ?? []).toEqual([]);
        expect(content.match(forbiddenPaletteRegex) ?? []).toEqual([]);
        expect(content.match(hardcodedDomainRegex) ?? []).toEqual([]);
      }
    });
  });
});
