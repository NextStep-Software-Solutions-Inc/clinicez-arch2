import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import {
  countActiveStaff,
  poolAllocationHint,
  usageFor,
  type WorkspaceUsage,
} from "../src/app/[tenant]/dashboard/plan/PlanClient";
import {
  computePoolDistribution,
  POOL_FIELDS,
  toDraft,
  type Draft,
} from "../src/app/[tenant]/dashboard/plan/AllocationEditor";
import { ENTITLEMENT_KEYS, type FacilityAllocation, type WorkspaceEntitlements } from "../src/services/entitlement.service";
import type { StaffMemberDto } from "../src/services/staff.service";

function makeFacility(overrides: Partial<FacilityAllocation> & { facilityId: string; facilityName: string }): FacilityAllocation {
  return {
    facilityId: overrides.facilityId,
    facilityName: overrides.facilityName,
    facilityType: overrides.facilityType ?? "Clinic",
    maxStaff: overrides.maxStaff ?? 25,
    maxStorageMb: overrides.maxStorageMb ?? 25600,
    concurrentTerminals: overrides.concurrentTerminals ?? 5,
    explicitMaxStaff: overrides.explicitMaxStaff ?? null,
    explicitMaxStorageMb: overrides.explicitMaxStorageMb ?? null,
    explicitConcurrentTerminals: overrides.explicitConcurrentTerminals ?? null,
    licenseExpiresAt: overrides.licenseExpiresAt ?? null,
    lastSeenAt: overrides.lastSeenAt ?? null,
    appVersion: overrides.appVersion ?? null,
  };
}

function makeEntitlements(overrides?: Partial<WorkspaceEntitlements>): WorkspaceEntitlements {
  return {
    planSlug: "pro",
    planName: "Professional",
    status: "Active",
    version: 1,
    periodEnd: "2026-12-31T00:00:00Z",
    limits: {
      [ENTITLEMENT_KEYS.clinics]: 5,
      [ENTITLEMENT_KEYS.staff]: 50,
      [ENTITLEMENT_KEYS.terminals]: 10,
      [ENTITLEMENT_KEYS.storageGb]: 50,
      [ENTITLEMENT_KEYS.members]: 15,
    },
    features: [],
    pools: {
      staff: 50,
      terminals: 10,
      storageMb: 51200,
    },
    facilities: [
      makeFacility({ facilityId: "fac-1", facilityName: "Main Clinic", maxStaff: 25, concurrentTerminals: 5, maxStorageMb: 25600 }),
      makeFacility({ facilityId: "fac-2", facilityName: "Downtown Clinic", maxStaff: 25, concurrentTerminals: 5, maxStorageMb: 25600 }),
    ],
    ...overrides,
  };
}

describe("Issue #61: Plan & Usage vs Facility Allocation Pool Metrics", () => {
  describe("PlanClient: Active consumption vs Allocated capacity", () => {
    test("countActiveStaff excludes workspace-only Owner/Admin/Billing and inactive statuses", () => {
      const members: StaffMemberDto[] = [
        {
          id: "m-owner",
          email: "owner@clinic.test",
          fullName: "Workspace Owner",
          role: "Owner",
          status: "Active",
          facilityId: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "m-admin",
          email: "admin@clinic.test",
          fullName: "Workspace Admin",
          role: "Admin",
          status: "Active",
          facilityId: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ];

      expect(countActiveStaff(members)).toBe(0);
      expect(countActiveStaff(undefined)).toBeUndefined();
    });

    test("countActiveStaff counts active and invited facility staff while ignoring suspended, revoked, and expired", () => {
      const members: StaffMemberDto[] = [
        {
          id: "m-owner",
          email: "owner@clinic.test",
          fullName: "Workspace Owner",
          role: "Owner",
          status: "Active",
          facilityId: null,
          createdAt: "2026-01-01T00:00:00Z",
        },
        {
          id: "m-doc1",
          email: "doc1@clinic.test",
          fullName: "Dr. One",
          role: "Doctor",
          status: "Active",
          facilityId: "fac-1",
          createdAt: "2026-01-02T00:00:00Z",
        },
        {
          id: "m-nurse1",
          email: "nurse1@clinic.test",
          fullName: "Nurse Invited",
          role: "Nurse",
          status: "Invited",
          facilityId: "fac-2",
          createdAt: "2026-01-03T00:00:00Z",
        },
        {
          id: "m-suspended",
          email: "susp@clinic.test",
          fullName: "Suspended Staff",
          role: "Doctor",
          status: "Suspended",
          facilityId: "fac-1",
          createdAt: "2026-01-04T00:00:00Z",
        },
        {
          id: "m-revoked",
          email: "rev@clinic.test",
          fullName: "Revoked Staff",
          role: "Receptionist",
          status: "Revoked",
          facilityId: "fac-1",
          createdAt: "2026-01-05T00:00:00Z",
        },
        {
          id: "m-expired",
          email: "exp@clinic.test",
          fullName: "Expired Invite",
          role: "Doctor",
          status: "Expired",
          facilityId: "fac-2",
          createdAt: "2026-01-06T00:00:00Z",
        },
      ];

      expect(countActiveStaff(members)).toBe(2);
    });

    test("usageFor does NOT report automatic facility ceiling sums as active consumption (prevents false Limit Reached)", () => {
      const entitlements = makeEntitlements();
      const usage: WorkspaceUsage = {
        facilitiesByType: { Clinic: 2 },
        branches: 2,
        members: 1,
        activeStaff: 0,
        patients: 12,
        apiRequests: 100,
        plans: [],
      };

      const staffUsed = usageFor(ENTITLEMENT_KEYS.staff, usage, entitlements);
      const staffLimit = entitlements.limits[ENTITLEMENT_KEYS.staff]!;
      expect(staffUsed).toBe(0);
      expect(staffUsed! >= staffLimit).toBe(false);

      const terminalsUsed = usageFor(ENTITLEMENT_KEYS.terminals, usage, entitlements);
      expect(terminalsUsed).toBeUndefined();

      const storageUsed = usageFor(ENTITLEMENT_KEYS.storageGb, usage, entitlements);
      expect(storageUsed).toBeUndefined();
    });

    test("poolAllocationHint clearly differentiates allocated pool capacity across facilities", () => {
      const entitlements = makeEntitlements();

      expect(poolAllocationHint(ENTITLEMENT_KEYS.staff, "Pool shared by your facilities", entitlements)).toBe(
        "Pool shared by your facilities · 50 seats allocated across 2 facilities",
      );
      expect(poolAllocationHint(ENTITLEMENT_KEYS.terminals, "Pool shared by your facilities", entitlements)).toBe(
        "Pool shared by your facilities · 10 terminals allocated across 2 facilities",
      );
      expect(poolAllocationHint(ENTITLEMENT_KEYS.storageGb, "Pool shared by your facilities", entitlements)).toBe(
        "Pool shared by your facilities · 50 GB allocated across 2 facilities",
      );
    });
  });

  describe("AllocationEditor: Pool distribution breakdown (Fixed, Automatic, Remaining)", () => {
    const staffField = POOL_FIELDS.find((f) => f.pool === "staff")!;
    const terminalsField = POOL_FIELDS.find((f) => f.pool === "terminals")!;

    test("All automatic facilities: Fixed = 0, Automatic = 50, Remaining = 0, Effective = 50", () => {
      const entitlements = makeEntitlements();
      const drafts: Record<string, Draft> = Object.fromEntries(
        entitlements.facilities.map((f) => [f.facilityId, toDraft(f)]),
      );

      const staffDist = computePoolDistribution(staffField, entitlements.facilities, drafts, entitlements.pools.staff);
      expect(staffDist).toEqual({
        pool: 50,
        unlimited: false,
        fixed: 0,
        savedFixed: 0,
        automaticFacilityCount: 2,
        automatic: 50,
        effectiveTotal: 50,
        remaining: 0,
        over: false,
      });

      const termDist = computePoolDistribution(terminalsField, entitlements.facilities, drafts, entitlements.pools.terminals);
      expect(termDist).toEqual({
        pool: 10,
        unlimited: false,
        fixed: 0,
        savedFixed: 0,
        automaticFacilityCount: 2,
        automatic: 10,
        effectiveTotal: 10,
        remaining: 0,
        over: false,
      });
    });

    test("Mixed fixed and automatic facilities: Fixed = 20, Automatic = 30, Remaining = 0, Effective = 50", () => {
      const facilities = [
        makeFacility({ facilityId: "fac-1", facilityName: "Main Clinic", maxStaff: 20, explicitMaxStaff: 20 }),
        makeFacility({ facilityId: "fac-2", facilityName: "Downtown Clinic", maxStaff: 30, explicitMaxStaff: null }),
      ];
      const drafts: Record<string, Draft> = Object.fromEntries(facilities.map((f) => [f.facilityId, toDraft(f)]));

      const dist = computePoolDistribution(staffField, facilities, drafts, 50);
      expect(dist.fixed).toBe(20);
      expect(dist.savedFixed).toBe(20);
      expect(dist.automatic).toBe(30);
      expect(dist.remaining).toBe(0);
      expect(dist.effectiveTotal).toBe(50);
      expect(dist.over).toBe(false);
    });

    test("All fixed facilities with unallocated remainder: Fixed = 25, Automatic = 0, Remaining = 25, Effective = 25", () => {
      const facilities = [
        makeFacility({ facilityId: "fac-1", facilityName: "Main Clinic", maxStaff: 15, explicitMaxStaff: 15 }),
        makeFacility({ facilityId: "fac-2", facilityName: "Downtown Clinic", maxStaff: 10, explicitMaxStaff: 10 }),
      ];
      const drafts: Record<string, Draft> = Object.fromEntries(facilities.map((f) => [f.facilityId, toDraft(f)]));

      const dist = computePoolDistribution(staffField, facilities, drafts, 50);
      expect(dist.fixed).toBe(25);
      expect(dist.automatic).toBe(0);
      expect(dist.remaining).toBe(25);
      expect(dist.effectiveTotal).toBe(25);
      expect(dist.over).toBe(false);
    });

    test("Over-allocated fixed shares in draft: flags over = true and clamps automatic & remaining to 0", () => {
      const facilities = [
        makeFacility({ facilityId: "fac-1", facilityName: "Main Clinic", maxStaff: 25, explicitMaxStaff: null }),
        makeFacility({ facilityId: "fac-2", facilityName: "Downtown Clinic", maxStaff: 25, explicitMaxStaff: null }),
      ];
      const drafts: Record<string, Draft> = {
        "fac-1": { staff: "35", terminals: "", storageMb: "" },
        "fac-2": { staff: "25", terminals: "", storageMb: "" },
      };

      const dist = computePoolDistribution(staffField, facilities, drafts, 50);
      expect(dist.fixed).toBe(60);
      expect(dist.savedFixed).toBe(0);
      expect(dist.automatic).toBe(0);
      expect(dist.remaining).toBe(0);
      expect(dist.over).toBe(true);
    });
  });

  describe("Source Code Invariants", () => {
    test("PlanClient.tsx and AllocationEditor.tsx uphold pool metric clarity invariants", () => {
      const planClientSource = fs.readFileSync(
        path.join(__dirname, "../src/app/[tenant]/dashboard/plan/PlanClient.tsx"),
        "utf8",
      );
      const allocationEditorSource = fs.readFileSync(
        path.join(__dirname, "../src/app/[tenant]/dashboard/plan/AllocationEditor.tsx"),
        "utf8",
      );

      // PlanClient uses activeStaff for staff usage rather than summing facility maxStaff in usageFor
      expect(planClientSource).toContain("case ENTITLEMENT_KEYS.staff:\n      return usage.activeStaff;");
      expect(allocationEditorSource).toContain("Fixed shares reserved:");
      expect(allocationEditorSource).toContain("Effective distributed:");
    });
  });
});
