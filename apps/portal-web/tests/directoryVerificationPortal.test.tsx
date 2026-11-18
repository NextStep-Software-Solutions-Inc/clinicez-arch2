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
import {
  VERIFICATION_PERMISSIONS,
  canRevokeDirectoryVerification,
  canVerifyDirectory,
  canViewVerifications,
  verificationService,
  type ReviewerProfile,
  type VerificationQueueResponse,
} from "../src/services/verification.service";
import { facilityService } from "../src/services/facility.service";
import {
  isProtectedRoute,
  isPublicRoute,
  isReservedSubdomain,
  isTenantSubdomainBypassPath,
} from "../src/proxy";
import {
  AppSidebar,
  PORTAL_VERIFICATIONS_PATH,
  shouldShowVerificationsNav,
} from "../src/components/dashboard/app-sidebar";
import { SidebarProvider } from "../src/components/ui/sidebar";
import {
  VerificationQueueClient,
  filterQueueItemsForTab,
  statusTabToApiQuery,
} from "../src/components/verifications/VerificationQueueClient";
import { VerificationReviewDrawer } from "../src/components/verifications/VerificationReviewDrawer";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
} from "../src/components/verifications/VerificationStatusBadge";
import { PractitionerConfirmClient } from "../src/app/verify/practitioner/PractitionerConfirmClient";
import FacilitySettingsHub from "../src/components/dashboard/FacilitySettingsHub";
import {
  getPlatformVerificationDisplay,
  validateLtoProofFile,
} from "../src/lib/verificationStatus";

const PORTAL_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PORTAL_ROOT, "src");

describe("Phase 2B: Portal-Web Directory Verification", () => {
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

  describe("1. verification.service.ts API Contracts", () => {
    test("getReviewerProfile fetches /admin/me and returns null on 401/403", async () => {
      let calledUrl = "";
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (url: string) => {
        calledUrl = url;
        return {
          data: {
            isAdmin: true,
            fullName: "Directory Verifier",
            email: "verifier@example.com",
            roleName: "Directory Verifier",
            permissions: [VERIFICATION_PERMISSIONS.VIEW, VERIFICATION_PERMISSIONS.VERIFY],
          },
        };
      }) as unknown as typeof apiClient.get;

      const profile = await verificationService.getReviewerProfile();
      expect(calledUrl).toBe("/admin/me");
      expect(profile?.roleName).toBe("Directory Verifier");
      expect(canViewVerifications(profile)).toBe(true);
      expect(canVerifyDirectory(profile)).toBe(true);
      expect(canRevokeDirectoryVerification(profile)).toBe(false);

      (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => {
        const err = new Error("Forbidden") as Error & { response?: { status: number } };
        err.response = { status: 403 };
        throw err;
      }) as unknown as typeof apiClient.get;

      expect(await verificationService.getReviewerProfile()).toBeNull();
    });

    test("getVerificationQueue and getVerificationRequestDetail pass query params and path ID cleanly", async () => {
      const requestedUrls: string[] = [];
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (url: string) => {
        requestedUrls.push(url);
        if (url.startsWith("/admin/verification-queue?")) {
          return {
            data: {
              items: [],
              totalCount: 0,
              pendingCount: 2,
              pendingFacilityCount: 1,
              pendingPractitionerCount: 1,
            },
          };
        }
        return { data: { id: "req-1", kind: "Facility", status: "PendingReview" } };
      }) as unknown as typeof apiClient.get;

      const queue = await verificationService.getVerificationQueue({
        kind: "facility",
        status: "PendingReview",
        q: "ermita",
      });
      expect(queue.pendingCount).toBe(2);
      expect(requestedUrls[0]).toBe(
        "/admin/verification-queue?kind=facility&status=PendingReview&q=ermita",
      );

      await verificationService.getVerificationRequestDetail("req/1");
      expect(requestedUrls[1]).toBe("/admin/verification-queue/req%2F1");
    });

    test("approve, reject (requires reason), and suspend call expected admin endpoints", async () => {
      const posts: Array<{ url: string; body: unknown }> = [];
      (apiClient as unknown as { post: typeof apiClient.post }).post = (async (
        url: string,
        body: unknown,
      ) => {
        posts.push({ url, body });
        return { data: { ok: true } };
      }) as unknown as typeof apiClient.post;

      await verificationService.approveVerificationRequest("req-10", {
        notes: "LTO verified",
        approveBundledPractitioners: true,
        practitionerRequestIds: ["p-1"],
      });
      expect(posts[0]).toEqual({
        url: "/admin/verification-queue/req-10/approve",
        body: {
          notes: "LTO verified",
          approveBundledPractitioners: true,
          practitionerRequestIds: ["p-1"],
        },
      });

      await expect(
        verificationService.rejectVerificationRequest("req-10", { reason: "   " }),
      ).rejects.toThrow("A rejection reason is required.");

      await verificationService.rejectVerificationRequest("req-10", {
        reason: "Expired DOH LTO certificate",
        notes: "Resubmit renewed certificate",
      });
      expect(posts[1]).toEqual({
        url: "/admin/verification-queue/req-10/reject",
        body: {
          reason: "Expired DOH LTO certificate",
          notes: "Resubmit renewed certificate",
        },
      });

      await verificationService.suspendPractitioner("prac-77", {
        reason: "PRC license suspended",
      });
      expect(posts[2]).toEqual({
        url: "/admin/practitioners/prac-77/suspend",
        body: { reason: "PRC license suspended" },
      });
    });

    test("facility verification-status, lto-proof upload, and public confirm-affiliation unwrap payloads cleanly", async () => {
      const calls: Array<{ method: string; url: string; body?: unknown }> = [];
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (url: string) => {
        calls.push({ method: "GET", url });
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

      const preview = await verificationService.getAffiliationConfirmation("tok-123");
      expect(preview.practitionerName).toBe("Dr. Jose Rizal");
      expect(calls[2].url).toBe("/public/practitioners/confirm-affiliation?token=tok-123");

      const confirmed = await verificationService.confirmPractitionerAffiliation("tok-123", "654321");
      expect(confirmed.affiliationStatus).toBe("Active");
      expect(calls[3]).toEqual({
        method: "POST",
        url: "/public/practitioners/confirm-affiliation",
        body: { token: "tok-123", otpCode: "654321" },
      });
    });
  });

  describe("2. Proxy Protection, Subdomain Bypass & Route Separation", () => {
    test("/portal/verifications is protected, bypassed on tenant subdomains, and never public", () => {
      expect(isProtectedRoute(new NextRequest("http://localhost/portal/verifications"))).toBe(true);
      expect(isProtectedRoute(new NextRequest("http://localhost/portal/verifications/123"))).toBe(true);
      expect(isPublicRoute(new NextRequest("http://localhost/portal/verifications"))).toBe(false);

      expect(isTenantSubdomainBypassPath("/portal/verifications")).toBe(true);
      expect(isTenantSubdomainBypassPath("/portal/verifications/req-1")).toBe(true);
      expect(isTenantSubdomainBypassPath("/dashboard")).toBe(false);
    });

    test("/verify/practitioner is public and reserved subdomains remain intact", () => {
      expect(isPublicRoute(new NextRequest("http://localhost/verify/practitioner?token=abc"))).toBe(
        true,
      );
      expect(isReservedSubdomain("admin")).toBe(true);
      expect(isReservedSubdomain("portal")).toBe(true);
    });
  });

  describe("3. Sidebar Nav & /portal/verifications Permission Gating + Queue UI", () => {
    const verifierProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Ana Verifier",
      email: "ana@example.com",
      roleName: "Directory Verifier",
      permissions: [VERIFICATION_PERMISSIONS.VIEW, VERIFICATION_PERMISSIONS.VERIFY],
    };

    const supportProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Support User",
      email: "support@example.com",
      roleName: "Support Operator",
      permissions: ["view:tenants"],
    };

    test("shouldShowVerificationsNav and AppSidebar gate /portal/verifications strictly on view:verifications", () => {
      expect(shouldShowVerificationsNav(null)).toBe(false);
      expect(shouldShowVerificationsNav(supportProfile)).toBe(false);
      expect(shouldShowVerificationsNav(verifierProfile)).toBe(true);

      const hiddenHtml = renderToString(
        <SidebarProvider>
          <AppSidebar reviewerProfile={supportProfile} />
        </SidebarProvider>,
      );
      expect(hiddenHtml).not.toContain(PORTAL_VERIFICATIONS_PATH);
      expect(hiddenHtml).not.toContain("/admin");

      const visibleHtml = renderToString(
        <SidebarProvider>
          <AppSidebar reviewerProfile={verifierProfile} />
        </SidebarProvider>,
      );
      expect(visibleHtml).toContain(`href="${PORTAL_VERIFICATIONS_PATH}"`);
      expect(visibleHtml).toContain("Directory Verifications");
      expect(visibleHtml).not.toContain("/admin");
    });

    test("VerificationQueueClient denies access without view:verifications and renders queue with view:verifications", () => {
      const deniedHtml = renderToString(<VerificationQueueClient initialProfile={supportProfile} />);
      expect(deniedHtml).toContain("Directory Verification Access Required");
      expect(deniedHtml).not.toContain("/admin");

      const sampleQueue: VerificationQueueResponse = {
        totalCount: 2,
        pendingCount: 2,
        pendingFacilityCount: 1,
        pendingPractitionerCount: 1,
        items: [
          {
            id: "fac-req-1",
            kind: "Facility",
            tenantId: "t-1",
            tenantSlug: "manila-care",
            tenantName: "Manila Care Network",
            facilityId: "f-1",
            facilityName: "Manila Care Ermita",
            facilitySlug: "manila-care-ermita",
            submissionNumber: 3,
            requestKind: "Initial",
            status: "PendingReview",
            submittedAtUtc: "2026-11-18T05:00:00Z",
            submittedByDisplayName: "Clinic Owner",
            dohLtoNumber: "DOH-LTO-9988",
            ltoEvidenceObjectKey: "verification/lto/ermita.pdf",
            facilityVerificationRequestId: null,
            practitionerId: null,
            clinicStaffMemberId: null,
            practitionerName: null,
            professionKind: null,
            prcLicenseNo: null,
            normalizedPrcLicenseNo: null,
            prcExpiryDate: null,
            prcEvidenceObjectKey: null,
            hasNameMismatch: false,
            bundledPractitionerCount: 2,
            reviewedAtUtc: null,
            reviewedByAdminUserId: null,
            reviewerNotes: null,
          },
          {
            id: "prac-req-2",
            kind: "Practitioner",
            tenantId: "t-1",
            tenantSlug: "manila-care",
            tenantName: "Manila Care Network",
            facilityId: "f-1",
            facilityName: "Manila Care Ermita",
            facilitySlug: "manila-care-ermita",
            submissionNumber: 1,
            requestKind: "Affiliation",
            status: "AwaitingOtp",
            submittedAtUtc: "2026-11-18T05:10:00Z",
            submittedByDisplayName: "Clinic Owner",
            dohLtoNumber: null,
            ltoEvidenceObjectKey: null,
            facilityVerificationRequestId: null,
            practitionerId: "p-1",
            clinicStaffMemberId: "s-1",
            practitionerName: "RN Clara Mendoza",
            professionKind: "Nurse",
            prcLicenseNo: "554433",
            normalizedPrcLicenseNo: "0554433",
            prcExpiryDate: "2028-08-01",
            prcEvidenceObjectKey: "verification/prc/clara.pdf",
            hasNameMismatch: true,
            bundledPractitionerCount: 0,
            reviewedAtUtc: null,
            reviewedByAdminUserId: null,
            reviewerNotes: null,
          },
        ],
      };

      const queueHtml = renderToString(
        <VerificationQueueClient initialProfile={verifierProfile} initialQueue={sampleQueue} />,
      );
      expect(queueHtml).toContain("Directory Verification Queue");
      expect(queueHtml).toContain("Pending");
      expect(queueHtml).toContain("In Review");
      expect(queueHtml).toContain("Awaiting Confirmation");
      expect(queueHtml).toContain("Approved");
      expect(queueHtml).toContain("Rejected");
      expect(queueHtml).toContain("Withdrawn");
      expect(queueHtml).toContain("Manila Care Ermita");
      expect(queueHtml).toContain("DOH-LTO-9988");
      expect(queueHtml).toContain("RN Clara Mendoza");
      expect(queueHtml).toContain("0554433");
      expect(queueHtml).toContain("PRC name mismatch detected");
    });

    test("statusTabToApiQuery and filterQueueItemsForTab map all status tabs accurately", () => {
      expect(statusTabToApiQuery("pending")).toBeUndefined();
      expect(statusTabToApiQuery("in_review")).toBe("PendingReview");
      expect(statusTabToApiQuery("awaiting_confirmation")).toBe("AwaitingOtp");
      expect(statusTabToApiQuery("approved")).toBe("Approved");
      expect(statusTabToApiQuery("rejected")).toBe("Rejected");
      expect(statusTabToApiQuery("withdrawn")).toBe("Withdrawn");

      const items = [
        { id: "1", status: "PendingReview" },
        { id: "2", status: "AwaitingOtp" },
        { id: "3", status: "Approved" },
        { id: "4", status: "Rejected" },
        { id: "5", status: "Withdrawn" },
      ] as unknown as VerificationQueueResponse["items"];

      expect(filterQueueItemsForTab(items, "pending").map((i) => i.id)).toEqual(["1", "2"]);
      expect(filterQueueItemsForTab(items, "in_review").map((i) => i.id)).toEqual(["1"]);
      expect(filterQueueItemsForTab(items, "awaiting_confirmation").map((i) => i.id)).toEqual(["2"]);
      expect(filterQueueItemsForTab(items, "approved").map((i) => i.id)).toEqual(["3"]);
      expect(filterQueueItemsForTab(items, "rejected").map((i) => i.id)).toEqual(["4"]);
      expect(filterQueueItemsForTab(items, "withdrawn").map((i) => i.id)).toEqual(["5"]);
    });

    test("ProofEvidenceCard, NameMismatchAlert, and VerificationReviewDrawer SSR states render cleanly", () => {
      const proofHtml = renderToString(
        <ProofEvidenceCard label="DOH LTO Proof" objectKey="verification/lto/ermita.pdf" />,
      );
      expect(proofHtml).toContain("DOH LTO Proof");
      expect(proofHtml).toContain("verification/lto/ermita.pdf");

      const urlProofHtml = renderToString(
        <ProofEvidenceCard label="PRC Proof" objectKey="https://files.example.org/prc-card.png" />,
      );
      expect(urlProofHtml).toContain("Open Proof");
      expect(urlProofHtml).toContain("<img");

      const mismatchHtml = renderToString(<NameMismatchAlert />);
      expect(mismatchHtml).toContain("PRC Name Mismatch Warning");

      const drawerLoadingHtml = renderToString(
        <VerificationReviewDrawer
          requestId="req-1"
          profile={verifierProfile}
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(drawerLoadingHtml).toContain("Verification Review");
    });
  });

  describe("4. Public Affiliation Confirmation (/verify/practitioner)", () => {
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

  describe("5. Subscriber Facility Verification View & Status Parsing", () => {
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

    test("FacilitySettingsHub displays Discovery toggle, Action Required badge, rejection notice, and LTO upload when closed/SSR", () => {
      // Closed dialog renders cleanly; verify source wiring for all required elements
      const hubSrc = fs.readFileSync(
        path.join(SRC_DIR, "components/dashboard/FacilitySettingsHub.tsx"),
        "utf8",
      );
      expect(hubSrc).toContain("Patient App Directory Discovery");
      expect(hubSrc).toContain("DOH LTO Proof Document");
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

  describe("6. Decoupling & Design Token Compliance Audit", () => {
    test("new/modified verification files contain zero raw hex codes, zero palette classes, zero hardcoded domains, and zero 'admin.service'", () => {
      const auditedFiles = [
        "lib/wire.ts",
        "lib/verificationStatus.ts",
        "services/verification.service.ts",
        "services/facility.service.ts",
        "proxy.ts",
        "components/dashboard/app-sidebar.tsx",
        "components/verifications/VerificationStatusBadge.tsx",
        "components/verifications/VerificationReviewDrawer.tsx",
        "components/verifications/VerificationQueueClient.tsx",
        "app/portal/verifications/page.tsx",
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
