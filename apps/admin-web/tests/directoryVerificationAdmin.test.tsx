import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { apiClient } from "../src/lib/api";
import {
  ADMIN_PERMISSIONS,
  ALL_ADMIN_PERMISSIONS,
  canRevokeDirectoryVerification,
  canVerifyDirectory,
  canViewVerifications,
} from "../src/constants/permissions";
import {
  VERIFICATION_PERMISSIONS,
  verificationService,
  type ReviewerProfile,
  type VerificationQueueResponse,
  type VerificationRequestDetailDto,
} from "../src/services/verification.service";
import {
  VerificationQueueView,
  filterQueueItemsForTab,
  statusTabToApiQuery,
  summarizeQueueItemSpecialtySchedule,
} from "../src/routes/verifications";
import { VerificationReviewDrawer } from "../src/components/verifications/VerificationReviewDrawer";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
} from "../src/components/verifications/VerificationStatusBadge";
import { SIDEBAR_GROUPS } from "../src/routes/_auth";
import { routeTree, router } from "../src/router";

const ADMIN_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ADMIN_ROOT, "src");

describe("Directory Verifications — Admin Governance Workstation", () => {
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

  describe("1. Permissions & verification.service.ts API Contracts", () => {
    test("ADMIN_PERMISSIONS includes all three directory verification scopes matching backend", () => {
      expect(ADMIN_PERMISSIONS.VIEW_VERIFICATIONS).toBe("view:verifications");
      expect(ADMIN_PERMISSIONS.VERIFY_DIRECTORY).toBe("verify:directory");
      expect(ADMIN_PERMISSIONS.REVOKE_DIRECTORY_VERIFICATION).toBe("verify:revoke");
      expect(ALL_ADMIN_PERMISSIONS).toContain("view:verifications");
      expect(ALL_ADMIN_PERMISSIONS).toContain("verify:directory");
      expect(ALL_ADMIN_PERMISSIONS).toContain("verify:revoke");
    });

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

    test("getVerificationQueue, detail, and fetchVerificationEvidence pass params & parse filename cleanly", async () => {
      const requested: Array<{ url: string; config?: unknown }> = [];
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (
        url: string,
        config?: unknown,
      ) => {
        requested.push({ url, config });
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
        if (url.includes("/evidence")) {
          return {
            data: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'inline; filename="doh-lto-2026.pdf"',
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
      expect(requested[0].url).toBe(
        "/admin/verification-queue?kind=facility&status=PendingReview&q=ermita",
      );

      await verificationService.getVerificationRequestDetail("req/1");
      expect(requested[1].url).toBe("/admin/verification-queue/req%2F1");

      const evidence = await verificationService.fetchVerificationEvidence("req-1", {
        kind: "prc",
        childRequestId: "child-9",
      });
      expect(requested[2].url).toBe(
        "/admin/verification-queue/req-1/evidence?kind=prc&childRequestId=child-9",
      );
      expect((requested[2].config as { responseType?: string })?.responseType).toBe("blob");
      expect(evidence.contentType).toBe("application/pdf");
      expect(evidence.fileName).toBe("doh-lto-2026.pdf");
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
  });

  describe("2. Router & Sidebar Integration in admin-web", () => {
    test("SIDEBAR_GROUPS includes Directory Verifications at clean /verifications path", () => {
      const allItems = SIDEBAR_GROUPS.flatMap((g) => g.items);
      const item = allItems.find((i) => i.to === "/verifications");
      expect(item).toBeDefined();
      expect(item?.label).toBe("Directory Verifications");
    });

    test("TanStack router matches /verifications cleanly and rejects /admin/verifications and /portal/verifications", async () => {
      const validMatches = router.matchRoutes("/verifications");
      expect(validMatches.some((m) => m.routeId.includes("verifications"))).toBe(true);

      for (const badPath of ["/admin/verifications", "/portal/verifications"]) {
        const memHistory = createMemoryHistory({ initialEntries: [badPath] });
        const testRouter = createRouter({ routeTree, history: memHistory });
        await testRouter.load();
        const nonRoot = testRouter.state.matches.filter((m) => m.routeId !== "__root__");
        expect(nonRoot.length).toBe(0);
      }
    });
  });

  describe("3. Queue View, Filtering & Inline Proof Viewer Rendering", () => {
    const verifierProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Ana Verifier",
      email: "ana@example.com",
      roleName: "Directory Verifier",
      permissions: [VERIFICATION_PERMISSIONS.VIEW, VERIFICATION_PERMISSIONS.VERIFY],
    };

    const readOnlyProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Read Only Auditor",
      email: "auditor@example.com",
      roleName: "Directory Auditor",
      permissions: [VERIFICATION_PERMISSIONS.VIEW],
    };

    const superAdminProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Super Admin",
      email: "super@example.com",
      roleName: "Super Admin",
      permissions: [...ALL_ADMIN_PERMISSIONS],
    };

    const supportProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Support User",
      email: "support@example.com",
      roleName: "Support Operator",
      permissions: [ADMIN_PERMISSIONS.VIEW_TENANTS],
    };

    test("VerificationQueueView denies access without view:verifications and renders queue with view:verifications", () => {
      const deniedHtml = renderToString(<VerificationQueueView initialProfile={supportProfile} />);
      expect(deniedHtml).toContain("Directory Verification Access Required");
      expect(deniedHtml).toContain("Return to Overview Dashboard");
      expect(deniedHtml).not.toContain("/portal/verifications");

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
        <VerificationQueueView initialProfile={verifierProfile} initialQueue={sampleQueue} />,
      );
      expect(queueHtml).toContain("Directory Verifications");
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
      expect(summarizeQueueItemSpecialtySchedule(sampleQueue.items[0])).toContain("2 clinicians");
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

    test("ProofEvidenceCard renders inline PDF iframe and image viewers instead of raw storage key dump", () => {
      const pdfHtml = renderToString(
        <ProofEvidenceCard
          label="DOH LTO Proof"
          objectKey="verification/lto/t1/f1/certificate.pdf"
          initialPreviewUrl="blob:http://localhost/pdf-preview-1"
          initialContentType="application/pdf"
          initialFileName="doh-lto-certificate.pdf"
        />,
      );
      expect(pdfHtml).toContain("<iframe");
      expect(pdfHtml).toContain("doh-lto-certificate.pdf");
      expect(pdfHtml).toContain("Full View");
      expect(pdfHtml).toContain("Download");
      expect(pdfHtml).not.toContain("verification/lto/t1/f1/certificate.pdf");
      expect(pdfHtml).not.toContain("Copy Key");

      const imgHtml = renderToString(
        <ProofEvidenceCard
          label="PRC Proof"
          objectKey="tenants/t1/clinics/c1/verification/prc/card.png"
          initialPreviewUrl="blob:http://localhost/img-preview-1"
          initialContentType="image/png"
          initialFileName="prc-card.png"
        />,
      );
      expect(imgHtml).toContain("<img");
      expect(imgHtml).toContain("prc-card.png");
      expect(imgHtml).toContain("Full View");
      expect(imgHtml).not.toContain("tenants/t1/clinics/c1/verification/prc/card.png");

      const missingHtml = renderToString(<ProofEvidenceCard label="DOH LTO Proof" objectKey={null} />);
      expect(missingHtml).toContain("Not attached");
      expect(missingHtml).toContain("Missing");

      const mismatchHtml = renderToString(<NameMismatchAlert />);
      expect(mismatchHtml).toContain("PRC Name Mismatch Warning");
    });

    test("VerificationReviewDrawer enforces RBAC across read-only, Directory Verifier, and Super Admin", () => {
      const sampleDetail: VerificationRequestDetailDto = {
        id: "req-1",
        kind: "Practitioner",
        status: "PendingReview",
        requestKind: "Initial",
        submissionNumber: 2,
        correlationId: "corr-1",
        submittedAtUtc: "2026-11-18T05:00:00Z",
        submittedByClinicUserId: "user-1",
        submittedByDisplayName: "Clinic Admin",
        reviewedAtUtc: null,
        reviewedByAdminUserId: null,
        reviewerNotes: null,
        withdrawnAtUtc: null,
        withdrawnByActor: null,
        withdrawalReason: null,
        tenantId: "t-1",
        tenantSlug: "manila-care",
        tenantName: "Manila Care Network",
        facilityId: "f-1",
        facilityName: "Manila Care Ermita",
        facilitySlug: "manila-care-ermita",
        facilityVerificationStatus: "Verified",
        dohLtoNumber: "DOH-LTO-9988",
        evidenceObjectKey: "tenants/t1/clinics/f1/verification/prc/p1/card.pdf",
        ltoEvidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        prcEvidenceObjectKey: "tenants/t1/clinics/f1/verification/prc/p1/card.pdf",
        submittedSnapshotJson: "{}",
        snapshot: { specialty: "Family Medicine", operatingHours: "Mon-Fri 8AM-5PM" },
        hasNameMismatch: true,
        childPractitionerRequests: [],
        prcMatchCandidates: [
          {
            practitionerId: "prac-1",
            professionKind: "Doctor",
            normalizedPrcLicenseNo: "0123456",
            displayPrcLicenseNo: "0123456",
            firstName: "Maria",
            lastName: "Santos",
            title: "Dr.",
            primarySpecialty: "Family Medicine",
            verificationStatus: "Verified",
            prcExpiryDate: "2028-01-01",
            verifiedAtUtc: "2026-01-01T00:00:00Z",
            isCompatibleNameMatch: false,
            affiliatedFacilityCount: 1,
            affiliatedClinics: ["Manila Care Ermita"],
          },
        ],
        submissionHistory: [],
      };

      const readOnlyHtml = renderToString(
        <VerificationReviewDrawer
          requestId="req-1"
          profile={readOnlyProfile}
          initialDetail={sampleDetail}
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(readOnlyHtml).toContain("Read-only access");
      expect(readOnlyHtml).toContain("verify:directory");
      expect(readOnlyHtml).not.toContain("Approve Request");
      expect(readOnlyHtml).not.toContain("Suspend Practitioner");

      const verifierHtml = renderToString(
        <VerificationReviewDrawer
          requestId="req-1"
          profile={verifierProfile}
          initialDetail={sampleDetail}
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(verifierHtml).toContain("Approve Request");
      expect(verifierHtml).toContain("Reject Request");
      expect(verifierHtml).toContain("PRC Name Mismatch Warning");
      expect(verifierHtml).toContain("/tenants/manila-care");
      expect(verifierHtml).not.toContain("Suspend Practitioner Across Clinics");

      const superHtml = renderToString(
        <VerificationReviewDrawer
          requestId="req-1"
          profile={superAdminProfile}
          initialDetail={sampleDetail}
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(superHtml).toContain("Approve Request");
      expect(superHtml).toContain("Suspend Practitioner Across Clinics");
    });
  });

  describe("4. Design Token & Branding Guardrails", () => {
    test("admin verification source files contain zero raw hex codes and zero unspaced ClinicEZ branding", () => {
      const files = [
        "constants/permissions.ts",
        "lib/verificationStatus.ts",
        "services/verification.service.ts",
        "components/verifications/VerificationStatusBadge.tsx",
        "components/verifications/VerificationReviewDrawer.tsx",
        "routes/verifications.tsx",
      ];
      const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

      for (const rel of files) {
        const content = fs.readFileSync(path.join(SRC_DIR, rel), "utf8");
        expect(content.match(hexRegex) ?? []).toEqual([]);
        expect(content.includes("ClinicEZ")).toBe(false);
      }
    });
  });
});
