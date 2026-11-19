import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
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
  buildVerificationDetailHref,
  filterQueueItemsForTab,
  parseVerificationQueueSearch,
  serializeVerificationQueueSearch,
  statusTabToApiQuery,
  summarizeQueueItemSpecialtySchedule,
} from "../src/routes/verifications";
import { VerificationDetailPageView } from "../src/routes/verifications/$requestId";
import {
  DEFAULT_VISIBLE_SERVICES,
  VerificationDetailWorkspace,
  VerificationReviewDrawer,
  getVisibleServices,
  indexChangedFields,
} from "../src/components/verifications/VerificationReviewDrawer";
import {
  buildVerificationsQueueHref,
  getLicenseExpiryDisplay,
  isDistinctTimestamp,
  isRawUserId,
  resolveHumanActorDisplay,
} from "../src/lib/verificationStatus";
import {
  NameMismatchAlert,
  ProofEvidenceCard,
} from "../src/components/verifications/VerificationStatusBadge";
import { SIDEBAR_GROUPS } from "../src/routes/_auth";
import { routeTree, router } from "../src/router";

const ADMIN_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ADMIN_ROOT, "src");

interface TreeInstance {
  type: any;
  stateSlots: any[];
  effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }>;
  refSlots: Array<{ current: any }>;
  memoSlots: Array<{ value: any; deps: any[] }>;
}

function mountReactTree(initialElement: React.ReactElement) {
  const instances = new Map<string, TreeInstance>();
  let currentElement = initialElement;
  let renderedTree: any = null;
  let isRendering = false;
  let hasPendingRender = false;
  let activePaths = new Set<string>();

  function renderNode(node: any, nodePath: string): any {
    if (node == null || typeof node === "boolean") return node;
    if (typeof node === "string" || typeof node === "number") return node;
    if (Array.isArray(node)) {
      return node.map((child, idx) => {
        const keyPart =
          child && typeof child === "object" && child.key != null ? `k_${child.key}` : `i_${idx}`;
        return renderNode(child, `${nodePath}.${keyPart}`);
      });
    }
    if (!React.isValidElement(node)) return node;

    const el = node as React.ReactElement<any>;
    const keySuffix = el.key != null ? `@${String(el.key)}` : "";
    const instancePath = `${nodePath}${keySuffix}`;

    if (el.type === React.Fragment) {
      return React.createElement(
        React.Fragment,
        el.key != null ? { key: el.key } : null,
        renderNode(el.props.children, `${instancePath}.frag`),
      );
    }

    if (typeof el.type === "function") {
      activePaths.add(instancePath);
      let inst = instances.get(instancePath);
      if (!inst || inst.type !== el.type) {
        if (inst) {
          for (const eff of inst.effectSlots) {
            if (typeof eff.cleanup === "function") eff.cleanup();
          }
        }
        inst = {
          type: el.type,
          stateSlots: [],
          effectSlots: [],
          refSlots: [],
          memoSlots: [],
        };
        instances.set(instancePath, inst);
      }

      let slotIndex = 0;
      let effectIndex = 0;
      let refIndex = 0;
      let memoIndex = 0;
      const targetInst = inst;
      const mockHooks: any = {
        useState: (initial: any) => {
          const idx = slotIndex++;
          if (targetInst.stateSlots.length <= idx) {
            targetInst.stateSlots.push(typeof initial === "function" ? initial() : initial);
          }
          const setState = (newVal: any) => {
            const nextVal =
              typeof newVal === "function" ? newVal(targetInst.stateSlots[idx]) : newVal;
            if (!Object.is(targetInst.stateSlots[idx], nextVal)) {
              targetInst.stateSlots[idx] = nextVal;
              scheduleRender();
            }
          };
          return [targetInst.stateSlots[idx], setState];
        },
        useRef: (initial: any) => {
          const idx = refIndex++;
          if (targetInst.refSlots.length <= idx) targetInst.refSlots.push({ current: initial });
          return targetInst.refSlots[idx];
        },
        useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
        useMemo: (fn: any, deps: any[]) => {
          const idx = memoIndex++;
          const prev = targetInst.memoSlots[idx];
          const changed = !prev || !deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
          if (changed) {
            const value = fn();
            targetInst.memoSlots[idx] = { value, deps };
            return value;
          }
          return prev.value;
        },
        useEffect: (fn: any, deps: any[]) => {
          const idx = effectIndex++;
          const prev = targetInst.effectSlots[idx];
          const hasChanged =
            !prev || !deps || !prev.deps || deps.some((d, i) => !Object.is(d, prev.deps[i]));
          targetInst.effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
        },
        useContext: (context: React.Context<any>) => (context as any)._currentValue,
        useSyncExternalStore: (_sub: any, getSnap: () => any) => getSnap(),
      };

      const internals = (React as any)
        .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevDispatcher = internals ? internals.H : null;
      if (internals) internals.H = mockHooks;
      let output: any;
      try {
        output = (el.type as (p: any) => any)(el.props);
      } finally {
        if (internals) internals.H = prevDispatcher;
      }
      return renderNode(output, `${instancePath}.out`);
    }

    if (el.props && "children" in el.props) {
      return React.cloneElement(el, el.props, renderNode(el.props.children, `${instancePath}.c`));
    }
    return el;
  }

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        activePaths = new Set<string>();
        renderedTree = renderNode(currentElement, "root");
        for (const [p, inst] of Array.from(instances.entries())) {
          if (!activePaths.has(p)) {
            for (const eff of inst.effectSlots) {
              if (typeof eff.cleanup === "function") eff.cleanup();
            }
            instances.delete(p);
          }
        }
        for (const p of Array.from(activePaths)) {
          const inst = instances.get(p);
          if (!inst) continue;
          for (const eff of inst.effectSlots) {
            if (eff.hasChanged) {
              eff.hasChanged = false;
              if (typeof eff.cleanup === "function") eff.cleanup();
              eff.cleanup = eff.fn();
            }
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get tree() {
      return renderedTree;
    },
    get html() {
      return renderToStaticMarkup(renderedTree);
    },
    rerender(nextElement: React.ReactElement) {
      currentElement = nextElement;
      render();
    },
    unmount() {
      for (const inst of instances.values()) {
        for (const eff of inst.effectSlots) {
          if (typeof eff.cleanup === "function") eff.cleanup();
        }
      }
      instances.clear();
    },
  };
}

function findReactNode(node: any, predicate: (el: any) => boolean): any {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findReactNode(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(node)) return node;
  if (node.props?.children) {
    return findReactNode(node.props.children, predicate);
  }
  return null;
}

function extractNodeText(node: any): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractNodeText).join("");
  if (node.props?.children) return extractNodeText(node.props.children);
  return "";
}

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

      // Extracts backend JSON error messages from responseType: "blob" failures (e.g. 502 clinic offline)
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => {
        const err = new Error("Request failed with status code 502") as Error & {
          response?: { status: number; data: Blob };
        };
        err.response = {
          status: 502,
          data: new Blob(
            [JSON.stringify({ message: "The clinic workstation is currently offline." })],
            { type: "application/json" },
          ),
        };
        throw err;
      }) as unknown as typeof apiClient.get;

      await expect(
        verificationService.fetchVerificationEvidence("req-1", { kind: "prc" }),
      ).rejects.toThrow("The clinic workstation is currently offline.");
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

    test("TanStack router matches /verifications and /verifications/$requestId cleanly and rejects /admin/verifications and /portal/verifications", async () => {
      const validMatches = router.matchRoutes("/verifications");
      expect(validMatches.some((m) => m.routeId.includes("verifications"))).toBe(true);

      const detailMatches = router.matchRoutes("/verifications/req-123");
      expect(detailMatches.some((m) => m.routeId.includes("$requestId"))).toBe(true);

      const detailHistory = createMemoryHistory({
        initialEntries: ["/verifications/req-123?status=approved&kind=facility&q=ermita"],
      });
      const detailRouter = createRouter({ routeTree, history: detailHistory });
      await detailRouter.load();
      const matchedDetail = detailRouter.state.matches.find((m) =>
        m.routeId.includes("$requestId"),
      );
      expect(matchedDetail).toBeDefined();
      expect(matchedDetail?.params).toEqual({ requestId: "req-123" });
      expect(matchedDetail?.search).toEqual({
        status: "approved",
        kind: "facility",
        q: "ermita",
      });

      for (const badPath of ["/admin/verifications", "/portal/verifications"]) {
        const memHistory = createMemoryHistory({ initialEntries: [badPath] });
        const testRouter = createRouter({ routeTree, history: memHistory });
        await testRouter.load();
        const nonRoot = testRouter.state.matches.filter((m) => m.routeId !== "__root__");
        expect(nonRoot.length).toBe(0);
      }
    });

    test("URL search helpers parse, serialize, and round-trip queue filters across /verifications and /verifications/$requestId", () => {
      expect(
        parseVerificationQueueSearch({ status: "pending", kind: "all", q: "   " }),
      ).toEqual({});
      expect(
        parseVerificationQueueSearch({
          status: "approved",
          kind: "practitioner",
          q: "  clara  ",
        }),
      ).toEqual({
        status: "approved",
        kind: "practitioner",
        q: "clara",
      });
      expect(
        parseVerificationQueueSearch({ status: "bogus", kind: "invalid" }),
      ).toEqual({});

      const serialized = serializeVerificationQueueSearch({
        statusTab: "rejected",
        kindFilter: "facility",
        q: "doh",
      });
      expect(serialized).toEqual({ status: "rejected", kind: "facility", q: "doh" });
      expect(buildVerificationDetailHref("req-9", serialized)).toBe(
        "/verifications/req-9?status=rejected&kind=facility&q=doh",
      );
      expect(buildVerificationsQueueHref(serialized)).toBe(
        "/verifications?status=rejected&kind=facility&q=doh",
      );
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
      expect(queueHtml).toContain("/verifications/fac-req-1");
      expect(queueHtml).not.toContain("Verification review drawer");

      const filteredQueueHtml = renderToString(
        <VerificationQueueView
          initialProfile={verifierProfile}
          initialQueue={sampleQueue}
          initialSearch={{ status: "in_review", kind: "facility", q: "ermita" }}
        />,
      );
      expect(filteredQueueHtml).toContain("Manila Care Ermita");
      expect(filteredQueueHtml).toContain("/verifications/fac-req-1?status=in_review&amp;kind=facility&amp;q=ermita");
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

    test("VerificationDetailPageView & VerificationDetailWorkspace render 2-column comparison layout, Back link with queue filters, tall proof viewer, and RBAC", () => {
      const deniedDetailHtml = renderToString(
        <VerificationDetailPageView
          requestId="req-1"
          queueSearch={{ status: "approved", kind: "facility", q: "manila" }}
          initialProfile={supportProfile}
        />,
      );
      expect(deniedDetailHtml).toContain("Directory Verification Access Required");
      expect(deniedDetailHtml).toContain("Back to Directory Verifications");
      expect(deniedDetailHtml).toContain("/verifications?status=approved&amp;kind=facility&amp;q=manila");

      const facilityDetail: VerificationRequestDetailDto = {
        id: "fac-req-1",
        kind: "Facility",
        status: "PendingReview",
        requestKind: "Initial",
        submissionNumber: 4,
        correlationId: "corr-fac-4",
        submittedAtUtc: "2026-11-18T05:00:00Z",
        submittedByClinicUserId: "user-1",
        submittedByDisplayName: "Clinic Owner",
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
        facilityVerificationStatus: "PendingReview",
        dohLtoNumber: "DOH-LTO-9988",
        evidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        ltoEvidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        prcEvidenceObjectKey: null,
        submittedSnapshotJson: "{}",
        snapshot: {
          classification: "Primary Care Clinic",
          operatingHours: "Mon-Sat 08:00-17:00",
          address: "123 Taft Ave, Manila",
        },
        hasNameMismatch: false,
        childPractitionerRequests: [
          {
            id: "child-1",
            clinicStaffMemberId: "staff-1",
            practitionerId: null,
            affiliationId: null,
            submissionNumber: 1,
            requestKind: "Initial",
            professionKind: "Doctor",
            firstName: "Jose",
            lastName: "Rizal",
            title: "Dr.",
            submittedPrcLicenseNo: "0088112",
            normalizedPrcLicenseNo: "0088112",
            prcExpiryDate: "2028-06-30",
            prcEvidenceObjectKey: "verification/prc/rizal.pdf",
            verificationContact: "jose@manilacare.ph",
            specialty: "Family Medicine",
            publicBio: null,
            avatarUrl: null,
            status: "PendingReview",
            hasNameMismatch: false,
            prcMatchCandidates: [],
            availabilities: [],
          },
        ],
        prcMatchCandidates: [],
        submissionHistory: [],
      };

      const workspaceHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-req-1"
          profile={verifierProfile}
          queueSearch={{ status: "in_review", kind: "facility", q: "ermita" }}
          initialDetail={facilityDetail}
        />,
      );
      expect(workspaceHtml).toContain("Directory verification review workspace");
      expect(workspaceHtml).toContain("Back to Directory Verifications");
      expect(workspaceHtml).toContain("/verifications?status=in_review&amp;kind=facility&amp;q=ermita");
      expect(workspaceHtml).toContain("lg:grid-cols-12");
      expect(workspaceHtml).toContain("lg:sticky lg:top-20");
      expect(workspaceHtml).toContain("min-h-[560px]");
      expect(workspaceHtml).toContain("DOH LTO Proof");
      expect(workspaceHtml).toContain("PRC • Dr. Jose Rizal");
      expect(workspaceHtml).toContain("Inspect PRC Proof");
      expect(workspaceHtml).toContain("Approve bundled clinicians");
      expect(workspaceHtml).toContain("Approve Request");
      expect(workspaceHtml).toContain("Reject Request");

      const readOnlyWorkspaceHtml = renderToString(
        <VerificationDetailPageView
          requestId="fac-req-1"
          initialProfile={readOnlyProfile}
          initialDetail={facilityDetail}
        />,
      );
      expect(readOnlyWorkspaceHtml).toContain("Read-only access");
      expect(readOnlyWorkspaceHtml).not.toContain("Approve Request");
    });
  });

  describe("4. M4B Enrichment: Services Expansion, Human Actors, Metadata & Resubmission Diff", () => {
    const verifierProfile: ReviewerProfile = {
      isAdmin: true,
      fullName: "Ana Verifier",
      email: "ana@example.com",
      roleName: "Directory Verifier",
      permissions: [VERIFICATION_PERMISSIONS.VIEW, VERIFICATION_PERMISSIONS.VERIFY],
    };

    test("getVerificationQueue and getVerificationRequestDetail preserve M2 fields and resubmissionDiff", async () => {
      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (url: string) => {
        if (url.startsWith("/admin/verification-queue?")) {
          return {
            data: {
              items: [
                {
                  id: "fac-1",
                  kind: "Facility",
                  tenantId: "t-1",
                  tenantSlug: "manila-care",
                  tenantName: "Manila Care Network",
                  facilityId: "f-1",
                  facilityName: "Manila Care Ermita",
                  facilitySlug: "manila-care-ermita",
                  submissionNumber: 2,
                  requestKind: "Resubmission",
                  status: "Approved",
                  submittedAtUtc: "2026-11-18T05:00:00Z",
                  submittedByDisplayName: "Dr. Maria Santos",
                  dohLtoNumber: "DOH-LTO-9988",
                  dohLtoExpiryDate: "2029-03-31",
                  reviewedAtUtc: "2026-11-19T06:00:00Z",
                  reviewedByAdminUserId: "user_2abcAdmin",
                  reviewedByDisplayName: "Ana Verifier",
                  reviewedByEmail: "ana@example.com",
                  updatedAtUtc: "2026-11-19T06:00:00Z",
                },
              ],
              totalCount: 1,
              pendingCount: 0,
              pendingFacilityCount: 0,
              pendingPractitionerCount: 0,
            },
          };
        }
        return {
          data: {
            id: "fac-1",
            kind: "Facility",
            status: "PendingReview",
            dohLtoExpiryDate: "2029-03-31",
            reviewedByDisplayName: "Ana Verifier",
            reviewedByEmail: "ana@example.com",
            clinicContactNumber: "+63 2 8555 0100",
            clinicContactEmail: "ermita@example.ph",
            philHealthAccreditationNumber: "P10038831",
            isPhilHealthAccredited: true,
            supportsInPerson: true,
            supportsTeleconsult: true,
            updatedAtUtc: "2026-11-19T08:00:00Z",
            resubmissionDiff: {
              previousRequestId: "fac-0",
              previousSubmissionNumber: 1,
              previousStatus: "Rejected",
              previousSubmittedAtUtc: "2026-11-10T05:00:00Z",
              previousReason: "Expired DOH LTO",
              ltoProofUpdated: true,
              prcProofUpdated: false,
              updatedChildPractitionerIds: ["child-1"],
              updatedChildPrcProofIds: ["child-1"],
              changedFields: [
                {
                  fieldKey: "dohLtoExpiryDate",
                  label: "DOH LTO Expiry Date",
                  previousValue: "2025-12-31",
                  currentValue: "2029-03-31",
                  changeKind: "Modified",
                },
              ],
            },
          },
        };
      }) as unknown as typeof apiClient.get;

      const queue = await verificationService.getVerificationQueue({ status: "Approved" });
      expect(queue.items[0].dohLtoExpiryDate).toBe("2029-03-31");
      expect(queue.items[0].reviewedByDisplayName).toBe("Ana Verifier");
      expect(queue.items[0].updatedAtUtc).toBe("2026-11-19T06:00:00Z");

      const detail = await verificationService.getVerificationRequestDetail("fac-1");
      expect(detail.clinicContactNumber).toBe("+63 2 8555 0100");
      expect(detail.philHealthAccreditationNumber).toBe("P10038831");
      expect(detail.supportsTeleconsult).toBe(true);
      expect(detail.resubmissionDiff?.ltoProofUpdated).toBe(true);
      expect(detail.resubmissionDiff?.changedFields[0].fieldKey).toBe("dohLtoExpiryDate");
    });

    test("Declared Clinic Services defaults to 9 visible services, expands to all 19, and resets on detail.id change", async () => {
      expect(DEFAULT_VISIBLE_SERVICES).toBe(9);
      const nineteenServices = Array.from({ length: 19 }, (_, idx) => ({
        name: `Clinical Service ${idx + 1}`,
      }));

      const collapsedSlice = getVisibleServices(nineteenServices, false);
      expect(collapsedSlice.visibleServices).toHaveLength(9);
      expect(collapsedSlice.hiddenCount).toBe(10);
      expect(collapsedSlice.hasMore).toBe(true);

      const expandedSlice = getVisibleServices(nineteenServices, true);
      expect(expandedSlice.visibleServices).toHaveLength(19);

      const facilityDetail: VerificationRequestDetailDto = {
        id: "fac-services-19",
        kind: "Facility",
        status: "PendingReview",
        requestKind: "Initial",
        submissionNumber: 1,
        correlationId: "corr-19",
        submittedAtUtc: "2026-11-18T05:00:00Z",
        submittedByClinicUserId: "user_2owner",
        submittedByDisplayName: "Dr. Maria Santos",
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
        facilityVerificationStatus: "PendingReview",
        dohLtoNumber: "DOH-LTO-9988",
        evidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        ltoEvidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        prcEvidenceObjectKey: null,
        submittedSnapshotJson: "{}",
        snapshot: { services: nineteenServices },
        hasNameMismatch: false,
        childPractitionerRequests: [],
        prcMatchCandidates: [],
        submissionHistory: [],
      };

      const collapsedHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-services-19"
          profile={verifierProfile}
          initialDetail={facilityDetail}
        />,
      );
      expect(collapsedHtml).toContain("Declared Clinic Services (19)");
      expect(collapsedHtml).toContain("Clinical Service 1");
      expect(collapsedHtml).toContain("Clinical Service 9");
      expect(collapsedHtml).not.toContain("Clinical Service 10");
      expect(collapsedHtml).not.toContain("Clinical Service 19");
      expect(collapsedHtml).toContain("Show all 19 services (+10 more)");
      expect(collapsedHtml).toContain('aria-expanded="false"');

      const expandedHtml = renderToString(
        <VerificationReviewDrawer
          requestId="fac-services-19"
          profile={verifierProfile}
          initialDetail={facilityDetail}
          initialShowAllServices
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(expandedHtml).toContain("Clinical Service 10");
      expect(expandedHtml).toContain("Clinical Service 19");
      expect(expandedHtml).toContain("Show fewer");
      expect(expandedHtml).toContain('aria-expanded="true"');

      // Stateful interactive runtime test (no source grep):
      // 9 services (no toggle) -> 11 services (+2 more) -> click expand (Show fewer) -> switch requestId (resets collapsed +3 more) + cleared dohLtoExpiryDate diff & child badges/tabs
      const makeServices = (count: number) =>
        Array.from({ length: count }, (_, idx) => ({ name: `Runtime Service ${idx + 1}` }));

      const detailMap: Record<string, VerificationRequestDetailDto> = {
        "req-9": {
          ...facilityDetail,
          id: "req-9",
          submissionNumber: 1,
          snapshot: { services: makeServices(9) },
        },
        "req-11": {
          ...facilityDetail,
          id: "req-11",
          submissionNumber: 2,
          snapshot: { services: makeServices(11) },
        },
        "req-12": {
          ...facilityDetail,
          id: "req-12",
          requestKind: "Resubmission",
          submissionNumber: 3,
          dohLtoExpiryDate: null,
          ltoEvidenceObjectKey: "verification/lto/t1/f1/lto-v3.pdf",
          evidenceObjectKey: "verification/lto/t1/f1/lto-v3.pdf",
          snapshot: { services: makeServices(12) },
          childPractitionerRequests: [
            {
              id: "child-upd-1",
              clinicStaffMemberId: "staff-1",
              practitionerId: null,
              affiliationId: null,
              submissionNumber: 3,
              requestKind: "Resubmission",
              professionKind: "Doctor",
              firstName: "Jose",
              lastName: "Rizal",
              title: "Dr.",
              submittedPrcLicenseNo: "0088112",
              normalizedPrcLicenseNo: "0088112",
              prcExpiryDate: "2028-06-30",
              prcEvidenceObjectKey: "verification/prc/rizal-v3.pdf",
              verificationContact: "jose@manilacare.ph",
              specialty: "Family Medicine",
              publicBio: null,
              avatarUrl: null,
              status: "PendingReview",
              hasNameMismatch: false,
              prcMatchCandidates: [],
              availabilities: [],
            },
            {
              id: "child-unchanged-2",
              clinicStaffMemberId: "staff-2",
              practitionerId: null,
              affiliationId: null,
              submissionNumber: 3,
              requestKind: "Resubmission",
              professionKind: "Nurse",
              firstName: "Clara",
              lastName: "Mendoza",
              title: "RN",
              submittedPrcLicenseNo: "0554433",
              normalizedPrcLicenseNo: "0554433",
              prcExpiryDate: "2028-08-01",
              prcEvidenceObjectKey: "verification/prc/clara.pdf",
              verificationContact: "clara@manilacare.ph",
              specialty: "Outpatient Nursing",
              publicBio: null,
              avatarUrl: null,
              status: "PendingReview",
              hasNameMismatch: false,
              prcMatchCandidates: [],
              availabilities: [],
            },
          ],
          resubmissionDiff: {
            previousRequestId: "req-11",
            previousSubmissionNumber: 2,
            previousStatus: "Rejected",
            previousSubmittedAtUtc: "2026-11-17T05:00:00Z",
            previousReason: "Update LTO expiry and Rizal PRC",
            ltoProofUpdated: false,
            prcProofUpdated: true,
            updatedChildPractitionerIds: ["child-upd-1"],
            updatedChildPrcProofIds: ["child-upd-1"],
            changedFields: [
              {
                fieldKey: "dohLtoExpiryDate",
                label: "DOH LTO Expiry Date",
                previousValue: "2026-12-31",
                currentValue: null,
                changeKind: "Removed",
              },
            ],
          },
        },
      };

      (apiClient as unknown as { get: typeof apiClient.get }).get = (async (url: string) => {
        if (url.includes("/evidence")) {
          return {
            data: new Blob(["%PDF-1.4"], { type: "application/pdf" }),
            headers: {
              "content-type": "application/pdf",
              "content-disposition": 'inline; filename="proof.pdf"',
            },
          };
        }
        const matchedKey = Object.keys(detailMap).find((id) => url.endsWith(`/${id}`));
        return { data: detailMap[matchedKey ?? "req-9"] };
      }) as unknown as typeof apiClient.get;

      const flushMicrotasks = async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      };

      const mounted = mountReactTree(
        <VerificationDetailWorkspace requestId="req-9" profile={verifierProfile} />,
      );
      await flushMicrotasks();

      // 1) 9 services -> all 9 rendered, no toggle button
      expect(mounted.html).toContain("Declared Clinic Services (9)");
      expect(mounted.html).toContain("Runtime Service 9");
      expect(mounted.html).not.toContain("Show all");
      expect(mounted.html).not.toContain("Show fewer");

      // 2) Switch to 11 services -> collapsed at 9 with "+2 more"
      mounted.rerender(
        <VerificationDetailWorkspace requestId="req-11" profile={verifierProfile} />,
      );
      await flushMicrotasks();

      expect(mounted.html).toContain("Declared Clinic Services (11)");
      expect(mounted.html).toContain("Runtime Service 9");
      expect(mounted.html).not.toContain("Runtime Service 10");
      expect(mounted.html).not.toContain("Runtime Service 11");
      expect(mounted.html).toContain("Show all 11 services (+2 more)");

      // 3) Click expand -> shows all 11 and switches button to "Show fewer"
      const expandBtn = findReactNode(
        mounted.tree,
        (el) =>
          el?.type === "button" &&
          extractNodeText(el).includes("Show all 11 services (+2 more)"),
      );
      expect(expandBtn).not.toBeNull();
      expect(expandBtn.props["aria-expanded"]).toBe(false);
      expandBtn.props.onClick();

      expect(mounted.html).toContain("Runtime Service 10");
      expect(mounted.html).toContain("Runtime Service 11");
      expect(mounted.html).toContain("Show fewer");
      const collapseBtn = findReactNode(
        mounted.tree,
        (el) => el?.type === "button" && extractNodeText(el).includes("Show fewer"),
      );
      expect(collapseBtn?.props["aria-expanded"]).toBe(true);

      // 4) Switch requestId to req-12 (same component instance, no key) -> resets collapsed to +3 more,
      // renders cleared dohLtoExpiryDate diff ("→ —"), and highlights UpdatedChildPractitionerIds / UpdatedChildPrcProofIds
      mounted.rerender(
        <VerificationDetailWorkspace requestId="req-12" profile={verifierProfile} />,
      );
      await flushMicrotasks();

      expect(mounted.html).toContain("Declared Clinic Services (12)");
      expect(mounted.html).toContain("Runtime Service 9");
      expect(mounted.html).not.toContain("Runtime Service 10");
      expect(mounted.html).not.toContain("Runtime Service 12");
      expect(mounted.html).toContain("Show all 12 services (+3 more)");
      expect(mounted.html).toContain("DOH LTO Expiry Date");
      expect(mounted.html).toContain("2026-12-31");
      expect(mounted.html).toContain("→");
      expect(mounted.html).toContain("—");
      // Cleared dohLtoExpiryDate is omitted from Submitted Snapshot
      expect(mounted.html).not.toContain("font-mono font-semibold text-text\">2026-12-31");
      // Updated child practitioner badges & proof tab Updated badge
      expect(mounted.html).toContain("Dr. Jose Rizal");
      expect(mounted.html).toContain("RN Clara Mendoza");
      expect(mounted.html).toContain("PRC Proof Updated");
      const updatedRizalTab = findReactNode(
        mounted.tree,
        (el) =>
          el?.type === "button" &&
          el?.props?.role === "tab" &&
          extractNodeText(el).includes("Dr. Jose Rizal"),
      );
      expect(updatedRizalTab).not.toBeNull();
      expect(extractNodeText(updatedRizalTab)).toContain("Updated");

      const unchangedClaraTab = findReactNode(
        mounted.tree,
        (el) =>
          el?.type === "button" &&
          el?.props?.role === "tab" &&
          extractNodeText(el).includes("RN Clara Mendoza"),
      );
      expect(unchangedClaraTab).not.toBeNull();
      expect(extractNodeText(unchangedClaraTab)).not.toContain("Updated");

      mounted.unmount();
    });

    test("human actor resolution & raw UUID / user_... Clerk ID guard across Facility, Practitioner, History, and Queue", () => {
      const uuid = "8f14e45f-ea7b-4f9b-9b5f-1234567890ab";
      const clerkId = "user_2abcXYZ123";

      expect(isRawUserId(uuid)).toBe(true);
      expect(isRawUserId(clerkId)).toBe(true);
      expect(isRawUserId("Dr. Maria Santos")).toBe(false);
      expect(isRawUserId("practitioner-otp")).toBe(false);

      expect(resolveHumanActorDisplay("practitioner-otp", null, null, "Clinician").primary).toBe(
        "Practitioner (OTP Confirmation)",
      );
      expect(resolveHumanActorDisplay(clerkId, null, clerkId, "Clinic Manager").primary).toBe(
        "Clinic Manager",
      );
      expect(resolveHumanActorDisplay(uuid, null, uuid, "Platform Reviewer").primary).toBe(
        "Platform Reviewer",
      );
      expect(
        resolveHumanActorDisplay(clerkId, "verifier@example.com", clerkId, "Platform Reviewer")
          .primary,
      ).toBe("verifier@example.com");

      const practitionerDetailWithRawIds: VerificationRequestDetailDto = {
        id: "prac-raw-1",
        kind: "Practitioner",
        status: "Approved",
        requestKind: "Initial",
        submissionNumber: 2,
        correlationId: "corr-p-2",
        submittedAtUtc: "2026-11-18T05:00:00Z",
        submittedByClinicUserId: clerkId,
        submittedByDisplayName: clerkId,
        reviewedAtUtc: "2026-11-19T04:00:00Z",
        reviewedByAdminUserId: uuid,
        reviewedByDisplayName: uuid,
        reviewedByEmail: null,
        reviewerNotes: "Verified PRC card",
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
        dohLtoNumber: null,
        evidenceObjectKey: "verification/prc/p1.pdf",
        ltoEvidenceObjectKey: null,
        prcEvidenceObjectKey: "verification/prc/p1.pdf",
        submittedSnapshotJson: "{}",
        snapshot: { specialty: "Pediatrics" },
        hasNameMismatch: false,
        childPractitionerRequests: [],
        prcMatchCandidates: [],
        submissionHistory: [
          {
            id: "hist-1",
            submissionNumber: 1,
            requestKind: "Initial",
            status: "Rejected",
            submittedAtUtc: "2026-11-10T05:00:00Z",
            reviewedAtUtc: "2026-11-11T05:00:00Z",
            reviewedByAdminUserId: clerkId,
            reviewedByDisplayName: "Ana Verifier",
            reviewedByEmail: "ana@example.com",
            reviewerNotes: "Blurry PRC photo",
            withdrawnAtUtc: null,
            withdrawalReason: null,
          },
        ],
      };

      const pracHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="prac-raw-1"
          profile={verifierProfile}
          initialDetail={practitionerDetailWithRawIds}
        />,
      );
      expect(pracHtml).toContain("Clinic Manager");
      expect(pracHtml).toContain("Platform Reviewer");
      expect(pracHtml).toContain("Reviewed by");
      expect(pracHtml).toContain("Ana Verifier");
      expect(pracHtml).toContain("(ana@example.com)");
      expect(pracHtml).not.toContain(`>${clerkId}<`);
      expect(pracHtml).not.toContain(`>${uuid}<`);
      expect(pracHtml).not.toContain(`by <span class="font-medium text-text" title="${uuid}">${uuid}`);

      const facilityHumanDetail: VerificationRequestDetailDto = {
        ...practitionerDetailWithRawIds,
        id: "fac-human-1",
        kind: "Facility",
        submittedByClinicUserId: "user_2owner",
        submittedByDisplayName: "Dr. Maria Santos",
        reviewedByAdminUserId: "user_2ana",
        reviewedByDisplayName: "Ana Verifier",
        reviewedByEmail: "ana@example.com",
      };
      const facHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-human-1"
          profile={verifierProfile}
          initialDetail={facilityHumanDetail}
        />,
      );
      expect(facHtml).toContain("Dr. Maria Santos");
      expect(facHtml).toContain("Ana Verifier");

      const queueHtml = renderToString(
        <VerificationQueueView
          initialProfile={verifierProfile}
          initialQueue={{
            totalCount: 1,
            pendingCount: 0,
            pendingFacilityCount: 0,
            pendingPractitionerCount: 0,
            items: [
              {
                id: "q-raw-1",
                kind: "Facility",
                tenantId: "t-1",
                tenantSlug: "manila-care",
                tenantName: "Manila Care Network",
                facilityId: "f-1",
                facilityName: "Manila Care Ermita",
                facilitySlug: "manila-care-ermita",
                submissionNumber: 2,
                requestKind: "Resubmission",
                status: "Approved",
                submittedAtUtc: "2026-11-18T05:00:00Z",
                submittedByDisplayName: clerkId,
                dohLtoNumber: "DOH-LTO-9988",
                dohLtoExpiryDate: "2024-01-15",
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
                bundledPractitionerCount: 1,
                reviewedAtUtc: "2026-11-19T06:00:00Z",
                reviewedByAdminUserId: uuid,
                reviewedByDisplayName: "Ana Verifier",
                reviewedByEmail: "ana@example.com",
                updatedAtUtc: "2026-11-19T06:00:00Z",
                reviewerNotes: null,
              },
            ],
          }}
          initialSearch={{ status: "approved" }}
        />,
      );
      expect(queueHtml).toContain("by Clinic Manager");
      expect(queueHtml).toContain("Reviewed by Ana Verifier");
      expect(queueHtml).toContain("Exp 2024-01-15");
      expect(queueHtml).toContain("Expired");
      expect(queueHtml).not.toContain(`by ${clerkId}`);
      expect(queueHtml).not.toContain(`Reviewed by ${uuid}`);
    });

    test("metadata enrichment surfaces DOH LTO expiry, labeled Phone/Email, PhilHealth/YAKAP, consultation modes & updatedAtUtc", () => {
      const ref = new Date("2026-11-19T00:00:00Z");
      expect(getLicenseExpiryDisplay("2024-01-15", ref)?.badgeLabel).toBe("Expired");
      expect(getLicenseExpiryDisplay("2026-12-01", ref)?.badgeLabel).toBe("Expiring Soon");
      expect(getLicenseExpiryDisplay("2029-03-31", ref)?.badgeLabel).toBeNull();
      expect(isDistinctTimestamp("2026-11-18T05:00:00Z", "2026-11-18T05:00:00Z")).toBe(false);
      expect(isDistinctTimestamp("2026-11-19T08:00:00Z", "2026-11-18T05:00:00Z")).toBe(true);

      const enrichedDetail: VerificationRequestDetailDto = {
        id: "fac-meta-1",
        kind: "Facility",
        status: "PendingReview",
        requestKind: "Initial",
        submissionNumber: 1,
        correlationId: "corr-meta",
        submittedAtUtc: "2026-11-18T05:00:00Z",
        updatedAtUtc: "2026-11-19T08:30:00Z",
        submittedByClinicUserId: "user_2owner",
        submittedByDisplayName: "Clinic Owner",
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
        facilityVerificationStatus: "PendingReview",
        dohLtoNumber: "DOH-LTO-2026",
        dohLtoExpiryDate: "2024-01-15",
        clinicContactNumber: "+63 2 8555 0199",
        clinicContactEmail: "care@example.ph",
        philHealthAccreditationNumber: "P10038831",
        isPhilHealthAccredited: true,
        supportsInPerson: true,
        supportsTeleconsult: true,
        evidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        ltoEvidenceObjectKey: "verification/lto/t1/f1/lto.pdf",
        prcEvidenceObjectKey: null,
        submittedSnapshotJson: "{}",
        snapshot: { classification: "Primary Care" },
        hasNameMismatch: false,
        childPractitionerRequests: [],
        prcMatchCandidates: [],
        submissionHistory: [],
      };

      const enrichedHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-meta-1"
          profile={verifierProfile}
          initialDetail={enrichedDetail}
        />,
      );
      expect(enrichedHtml).toContain("Last Updated");
      expect(enrichedHtml).toContain("DOH LTO Expiry Date");
      expect(enrichedHtml).toContain("2024-01-15");
      expect(enrichedHtml).toContain("Expired");
      expect(enrichedHtml).toContain("Phone");
      expect(enrichedHtml).toContain("+63 2 8555 0199");
      expect(enrichedHtml).toContain("Email");
      expect(enrichedHtml).toContain("care@example.ph");
      expect(enrichedHtml).toContain("PhilHealth / YAKAP");
      expect(enrichedHtml).toContain("Accredited");
      expect(enrichedHtml).toContain("P10038831");
      expect(enrichedHtml).toContain("Consultation Modes");
      expect(enrichedHtml).toContain("In-Person");
      expect(enrichedHtml).toContain("Teleconsult");

      const minimalSameTimeDetail: VerificationRequestDetailDto = {
        ...enrichedDetail,
        id: "fac-meta-2",
        updatedAtUtc: "2026-11-18T05:00:00Z",
        dohLtoExpiryDate: "2029-06-30",
        supportsInPerson: true,
        supportsTeleconsult: false,
      };
      const minimalHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-meta-2"
          profile={verifierProfile}
          initialDetail={minimalSameTimeDetail}
        />,
      );
      expect(minimalHtml).not.toContain("Last Updated");
      expect(minimalHtml).toContain("2029-06-30");
      expect(minimalHtml).not.toContain(">Expired<");
      expect(minimalHtml).toContain("In-Person");
      expect(minimalHtml).not.toContain("Teleconsult");
    });

    test("resubmissionDiff renders summary card, field pills, child practitioner badges, and proof Updated badges", () => {
      const diffDetail: VerificationRequestDetailDto = {
        id: "fac-resub-2",
        kind: "Facility",
        status: "PendingReview",
        requestKind: "Resubmission",
        submissionNumber: 2,
        correlationId: "corr-resub",
        submittedAtUtc: "2026-11-19T05:00:00Z",
        submittedByClinicUserId: "user_2owner",
        submittedByDisplayName: "Dr. Maria Santos",
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
        facilityVerificationStatus: "PendingReview",
        dohLtoNumber: "DOH-LTO-2026",
        dohLtoExpiryDate: "2029-03-31",
        clinicContactNumber: "02-8999-9999",
        clinicContactEmail: "ermita@example.ph",
        evidenceObjectKey: "verification/lto/t1/f1/lto-v2.pdf",
        ltoEvidenceObjectKey: "verification/lto/t1/f1/lto-v2.pdf",
        prcEvidenceObjectKey: null,
        submittedSnapshotJson: "{}",
        snapshot: {
          contactNumber: "02-8999-9999",
          contactEmail: "ermita@example.ph",
          services: [{ name: "General Consultation" }, { name: "CBC Panel" }],
        },
        hasNameMismatch: false,
        childPractitionerRequests: [
          {
            id: "child-1",
            clinicStaffMemberId: "staff-1",
            practitionerId: null,
            affiliationId: null,
            submissionNumber: 2,
            requestKind: "Resubmission",
            professionKind: "Doctor",
            firstName: "Jose",
            lastName: "Rizal",
            title: "Dr.",
            submittedPrcLicenseNo: "0088112",
            normalizedPrcLicenseNo: "0088112",
            prcExpiryDate: "2028-06-30",
            prcEvidenceObjectKey: "verification/prc/rizal-v2.pdf",
            verificationContact: "jose@example.ph",
            specialty: "Family Medicine",
            publicBio: null,
            avatarUrl: null,
            status: "PendingReview",
            hasNameMismatch: false,
            prcMatchCandidates: [],
            availabilities: [],
          },
        ],
        prcMatchCandidates: [],
        submissionHistory: [],
        resubmissionDiff: {
          previousRequestId: "fac-resub-1",
          previousSubmissionNumber: 1,
          previousStatus: "Rejected",
          previousSubmittedAtUtc: "2026-11-10T05:00:00Z",
          previousReason: "Blurry DOH LTO",
          ltoProofUpdated: true,
          prcProofUpdated: true,
          updatedChildPractitionerIds: ["child-1"],
          updatedChildPrcProofIds: ["child-1"],
          changedFields: [
            {
              fieldKey: "contactNumber",
              label: "Clinic Phone",
              previousValue: "02-8111-1111",
              currentValue: "02-8999-9999",
              changeKind: "Modified",
            },
            {
              fieldKey: "services",
              label: "Declared Clinic Services",
              previousValue: "1 service(s)",
              currentValue: "2 service(s) (+CBC Panel)",
              changeKind: "Modified",
            },
          ],
        },
      };

      expect(indexChangedFields(diffDetail.resubmissionDiff).get("contactNumber")?.previousValue).toBe(
        "02-8111-1111",
      );

      const workspaceHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-resub-2"
          profile={verifierProfile}
          initialDetail={diffDetail}
        />,
      );
      expect(workspaceHtml).toContain("Changes from Submission #1");
      expect(workspaceHtml).toContain("Blurry DOH LTO");
      expect(workspaceHtml).toContain("DOH LTO Proof Updated");
      expect(workspaceHtml).toContain("PRC Proof Updated");
      expect(workspaceHtml).toContain("Previous: 02-8111-1111");
      expect(workspaceHtml).toContain("Previous: 1 service(s)");
      expect(workspaceHtml).toContain("Updated");

      const drawerHtml = renderToString(
        <VerificationReviewDrawer
          requestId="fac-resub-2"
          profile={verifierProfile}
          initialDetail={diffDetail}
          onClose={() => {}}
          onActionCompleted={() => {}}
        />,
      );
      expect(drawerHtml).toContain("Changes from Submission #1");
      expect(drawerHtml).toContain("Updated");

      const updatedProofHtml = renderToString(
        <ProofEvidenceCard
          label="DOH LTO Proof"
          objectKey="verification/lto/t1/f1/lto-v2.pdf"
          initialPreviewUrl="blob:http://localhost/pdf-v2"
          initialContentType="application/pdf"
          initialFileName="lto-v2.pdf"
          isUpdated
        />,
      );
      expect(updatedProofHtml).toContain("Updated");

      const noDiffHtml = renderToString(
        <VerificationDetailWorkspace
          requestId="fac-no-diff"
          profile={verifierProfile}
          initialDetail={{ ...diffDetail, id: "fac-no-diff", resubmissionDiff: null }}
        />,
      );
      expect(noDiffHtml).not.toContain("Changes from Submission #");
    });
  });

  describe("5. Design Token & Branding Guardrails", () => {
    test("admin verification source files contain zero raw hex codes and zero unspaced ClinicEZ branding", () => {
      const files = [
        "constants/permissions.ts",
        "lib/verificationStatus.ts",
        "services/verification.service.ts",
        "components/verifications/VerificationStatusBadge.tsx",
        "components/verifications/VerificationReviewDrawer.tsx",
        "routes/verifications.tsx",
        "routes/verifications/$requestId.tsx",
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
