import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "apex-health" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/apex-health/dashboard/overview",
  useSearchParams: () => new URLSearchParams(),
}));

import fs from "fs";
import path from "path";
import {
  universalSearchRegistry,
  type SearchContributor,
  type SearchItem,
  type SearchBadgeVariant,
} from "@shared/safe";
import {
  registerPortalSearchContributors,
  searchPortalUniversal,
  resolveBadgeVariant,
} from "../src/services/portalSearchContributors";
import {
  groupSearchResults,
  type SearchItem as LocalSearchItem,
} from "../src/components/dashboard/WorkspaceSearchDialog";
import type { BranchDto } from "../src/services/branch.service";
import type { StaffMemberDto } from "../src/services/staff.service";

const mockTenant = "apex-health";

const mockBranches: BranchDto[] = [
  {
    id: "branch-101",
    tenantId: mockTenant,
    name: "Apex Central Medical Hub",
    code: "APEX-01",
    isActive: true,
    streetAddress: "123 Taft Ave",
    barangay: "Barangay 660",
    city: "Manila",
    province: "Metro Manila",
    region: "NCR",
    zipCode: "1000",
    isPhilHealthAccredited: true,
    philHealthPmccNumber: "PMCC-9901",
    philHealthAccreditationNumber: "ACC-54321",
    facilities: [
      {
        id: "fac-c1",
        name: "Apex Primary Clinic",
        facilityType: "Clinic",
        status: "Active",
      },
      {
        id: "fac-l1",
        name: "Apex Diagnostic Lab",
        facilityType: "Laboratory",
        status: "Active",
      },
      {
        id: "fac-p1",
        name: "Apex Community Pharmacy",
        facilityType: "Pharmacy",
        status: "Active",
      },
    ],
  },
  {
    id: "branch-102",
    tenantId: mockTenant,
    name: "Apex North Satellite Branch",
    code: "APEX-02",
    isActive: true,
    streetAddress: "456 Commonwealth Ave",
    barangay: "Holy Spirit",
    city: "Quezon City",
    province: "Metro Manila",
    region: "NCR",
    zipCode: "1127",
    isPhilHealthAccredited: false,
    facilities: [
      {
        id: "fac-c2",
        name: "North Outpatient Clinic",
        facilityType: "Clinic",
        status: "Active",
      },
    ],
  },
];

const mockStaff: StaffMemberDto[] = [
  {
    id: "staff-1",
    fullName: "Dr. Maria Santos",
    email: "maria.santos@apexhealth.ph",
    role: "Attending Physician",
    status: "Active",
    facilityName: "Apex Primary Clinic",
    createdAt: "2026-01-15T08:00:00Z",
  },
  {
    id: "staff-2",
    fullName: "Juan Dela Cruz",
    email: "juan.delacruz@apexhealth.ph",
    role: "Tenant Administrator",
    status: "Active",
    createdAt: "2026-01-10T08:00:00Z",
  },
  {
    id: "staff-3",
    fullName: "Elena Rostova",
    email: "elena.rostova@apexhealth.ph",
    role: "Medical Technologist",
    status: "Active",
    facilityName: "Apex Diagnostic Lab",
    createdAt: "2026-02-01T08:00:00Z",
  },
];

describe("Portal Web Search Integration Test Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  describe("R1: Contributor Registration & Priority Order", () => {
    test("T1.1: registerPortalSearchContributors registers all 5 contributors in universalSearchRegistry", () => {
      expect(universalSearchRegistry.getContributors().length).toBe(0);

      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      const contributors = universalSearchRegistry.getContributors();
      expect(contributors.length).toBe(5);

      const ids = contributors.map((c) => c.id);
      expect(ids).toContain("portal-quick-actions");
      expect(ids).toContain("portal-navigation");
      expect(ids).toContain("portal-branches");
      expect(ids).toContain("portal-facilities");
      expect(ids).toContain("portal-team");

      // Verify category keys and labels
      const actionContributor = contributors.find((c) => c.id === "portal-quick-actions");
      expect(actionContributor?.category).toBe("actions");
      expect(actionContributor?.categoryLabel).toBe("Quick Actions");
      expect(actionContributor?.priority).toBe(5);

      const navContributor = contributors.find((c) => c.id === "portal-navigation");
      expect(navContributor?.category).toBe("navigation");
      expect(navContributor?.categoryLabel).toBe("Navigation");
      expect(navContributor?.priority).toBe(15);

      const branchContributor = contributors.find((c) => c.id === "portal-branches");
      expect(branchContributor?.category).toBe("branches");
      expect(branchContributor?.categoryLabel).toBe("Branches");
      expect(branchContributor?.priority).toBe(25);

      const facilityContributor = contributors.find((c) => c.id === "portal-facilities");
      expect(facilityContributor?.category).toBe("facilities");
      expect(facilityContributor?.categoryLabel).toBe("Facilities");
      expect(facilityContributor?.priority).toBe(30);

      const teamContributor = contributors.find((c) => c.id === "portal-team");
      expect(teamContributor?.category).toBe("team");
      expect(teamContributor?.categoryLabel).toBe("Workspace Team");
      expect(teamContributor?.priority).toBe(35);

      // Verify ascending priority ordering
      const priorities = contributors.map((c) => c.priority ?? 50);
      expect(priorities).toEqual([5, 15, 25, 30, 35]);

      unregister();
    });

    test("T1.2: Contributor categories are properly exposed via getCategories()", () => {
      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      const categories = universalSearchRegistry.getCategories();
      expect(categories.length).toBe(5);

      const keys = categories.map((c) => c.key);
      expect(keys).toEqual(["actions", "navigation", "branches", "facilities", "team"]);

      unregister();
    });

    test("T1.3: Handles undefined or empty context gracefully", () => {
      const unregister = registerPortalSearchContributors();
      expect(universalSearchRegistry.getContributors().length).toBe(5);
      expect(() => unregister()).not.toThrow();
    });
  });

  describe("R2: Contributor Unregister & Lifecycle Cleanup", () => {
    test("T2.1: Unregister callback cleans up all 5 contributors completely", () => {
      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      expect(universalSearchRegistry.getContributors().length).toBe(5);

      // Call unregister
      unregister();

      expect(universalSearchRegistry.getContributors().length).toBe(0);
      expect(universalSearchRegistry.getCategories().length).toBe(0);
    });

    test("T2.2: Unregister callback is idempotent and safe to call multiple times", () => {
      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      expect(() => {
        unregister();
        unregister();
        unregister();
      }).not.toThrow();

      expect(universalSearchRegistry.getContributors().length).toBe(0);
    });

    test("T2.3: Re-registering with new tenant context cleanly replaces previous contributors", () => {
      const unregister1 = registerPortalSearchContributors({
        tenantSlug: "tenant-one",
        branches: [],
        staff: [],
      });
      expect(universalSearchRegistry.getContributors().length).toBe(5);

      const unregister2 = registerPortalSearchContributors({
        tenantSlug: "tenant-two",
        branches: mockBranches,
        staff: mockStaff,
      });

      // Map keys are identical so registry length stays 5
      expect(universalSearchRegistry.getContributors().length).toBe(5);

      unregister2();
      expect(universalSearchRegistry.getContributors().length).toBe(0);

      // Previous unregister has no effect on cleared registry
      expect(() => unregister1()).not.toThrow();
    });
  });

  describe("R3: universalSearchRegistry.search Execution & Relevance Across Categories", () => {
    beforeEach(() => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });
    });

    test("T3.1: Searching for 'overview' returns Navigation category item", async () => {
      const results = await universalSearchRegistry.search("overview");
      expect(results.length).toBeGreaterThan(0);

      const overviewItem = results.find((r) => r.title === "Overview");
      expect(overviewItem).toBeDefined();
      expect(overviewItem?.category).toBe("navigation");
      expect(overviewItem?.targetRoute).toBe(`/${mockTenant}/dashboard/overview`);
    });

    test("T3.2: Searching for 'branch' returns matches across Actions, Navigation, and Branches", async () => {
      const results = await universalSearchRegistry.search("branch");
      expect(results.length).toBeGreaterThan(0);

      const categories = new Set(results.map((r) => r.category));
      expect(categories.has("actions")).toBe(true);
      expect(categories.has("navigation")).toBe(true);
      expect(categories.has("branches")).toBe(true);

      const titles = results.map((r) => r.title);
      expect(titles).toContain("New Branch");
      expect(titles).toContain("Branches");
      expect(titles).toContain("Apex Central Medical Hub");
    });

    test("T3.3: Searching for 'clinic' returns matches across Facilities and Quick Actions", async () => {
      const results = await universalSearchRegistry.search("clinic");
      expect(results.length).toBeGreaterThan(0);

      const titles = results.map((r) => r.title);
      expect(titles).toContain("Provision Clinic");
      expect(titles).toContain("Apex Primary Clinic");
      expect(titles).toContain("North Outpatient Clinic");
    });

    test("T3.4: Searching for 'santos' or 'doctor' returns Team category item", async () => {
      const santosResults = await universalSearchRegistry.search("santos");
      expect(santosResults.length).toBe(1);
      expect(santosResults[0].title).toBe("Dr. Maria Santos");
      expect(santosResults[0].category).toBe("team");

      const docResults = await universalSearchRegistry.search("doctor");
      expect(docResults.map((r) => r.title)).toContain("Dr. Maria Santos");
    });

    test("T3.5: Category scoped search executes only the matching contributor", async () => {
      const teamOnly = await universalSearchRegistry.search("apex", { category: "team" });
      for (const item of teamOnly) {
        expect(item.category).toBe("team");
      }

      const branchOnly = await universalSearchRegistry.search("apex", { category: "branches" });
      for (const item of branchOnly) {
        expect(item.category).toBe("branches");
      }
    });

    test("T3.6: Blank or whitespace query returns empty array", async () => {
      expect(await universalSearchRegistry.search("")).toEqual([]);
      expect(await universalSearchRegistry.search("   ")).toEqual([]);
    });

    test("T3.7: Query with no matches returns empty array", async () => {
      const noResults = await universalSearchRegistry.search("zzzznonexistenttoken999");
      expect(noResults).toEqual([]);
    });

    test("T3.8: searchPortalUniversal helper delegates directly to registry", async () => {
      const helperResults = await searchPortalUniversal("pharmacy");
      const directResults = await universalSearchRegistry.search("pharmacy");

      expect(helperResults.length).toBe(directResults.length);
      expect(helperResults.map((r) => r.id)).toEqual(directResults.map((r) => r.id));
    });
  });

  describe("R4: AbortSignal & Cancellation Behavior", () => {
    beforeEach(() => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });
    });

    test("T4.1: Pre-aborted signal returns empty array immediately", async () => {
      const controller = new AbortController();
      controller.abort();

      const results = await universalSearchRegistry.search("clinic", {
        signal: controller.signal,
      });
      expect(results).toEqual([]);
    });

    test("T4.2: AbortSignal does not throw uncaught rejection on aborted queries", async () => {
      const controller = new AbortController();
      const searchPromise = universalSearchRegistry.search("laboratory", {
        signal: controller.signal,
      });
      controller.abort();

      const results = await searchPromise;
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("R5: Semantic Badge Variants & Token Compliance", () => {
    test("T5.1: resolveBadgeVariant returns valid SearchBadgeVariant values", () => {
      const validVariants: SearchBadgeVariant[] = ["routine", "urgent", "emergency", "neutral"];

      expect(validVariants).toContain(resolveBadgeVariant("actions", "STAT Alert"));
      expect(validVariants).toContain(resolveBadgeVariant("actions", "Urgent Action"));
      expect(validVariants).toContain(resolveBadgeVariant("actions", "Routine Action"));
      expect(validVariants).toContain(resolveBadgeVariant("navigation", "Page"));
      expect(validVariants).toContain(resolveBadgeVariant("navigation", undefined));
    });

    test("T5.2: Emergency, Urgent, Routine, and Neutral urgency mappings", () => {
      // Emergency
      expect(resolveBadgeVariant("alerts", "STAT")).toBe("emergency");
      expect(resolveBadgeVariant("alerts", "Emergency Alert")).toBe("emergency");
      expect(resolveBadgeVariant("alerts", "Critical Value")).toBe("emergency");
      expect(resolveBadgeVariant("alerts", "Failed Sync")).toBe("emergency");

      // Urgent
      expect(resolveBadgeVariant("queue", "Urgent Priority")).toBe("urgent");
      expect(resolveBadgeVariant("queue", "Priority Case")).toBe("urgent");
      expect(resolveBadgeVariant("queue", "Pending Approval")).toBe("urgent");
      expect(resolveBadgeVariant("queue", "Warning Status")).toBe("urgent");

      // Routine
      expect(resolveBadgeVariant("actions", "Quick Action")).toBe("routine");
      expect(resolveBadgeVariant("branches", "PhilHealth Accredited")).toBe("routine");
      expect(resolveBadgeVariant("team", "Attending Doctor")).toBe("routine");
      expect(resolveBadgeVariant("team", "Tenant Admin")).toBe("routine");

      // Neutral
      expect(resolveBadgeVariant("navigation", "Page")).toBe("neutral");
      expect(resolveBadgeVariant("team", "Member")).toBe("neutral");
      expect(resolveBadgeVariant("unknown", "")).toBe("neutral");
    });

    test("T5.3: All items produced by registered contributors conform to SearchBadgeVariant", async () => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      const validVariants = new Set<SearchBadgeVariant>([
        "routine",
        "urgent",
        "emergency",
        "neutral",
      ]);

      const results = await universalSearchRegistry.search("apex");
      expect(results.length).toBeGreaterThan(0);

      for (const item of results) {
        if (item.badgeVariant) {
          expect(validVariants.has(item.badgeVariant)).toBe(true);
        }
        if (item.badge?.variant) {
          expect(validVariants.has(item.badge.variant)).toBe(true);
        }
      }
    });

    test("T5.4: Zero raw hex color literals in portal search files", () => {
      const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

      const filesToCheck = [
        path.resolve(__dirname, "../src/services/portalSearchContributors.ts"),
        path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx"),
        path.resolve(__dirname, "./portalSearchIntegration.test.ts"),
      ];

      for (const filePath of filesToCheck) {
        const content = fs.readFileSync(filePath, "utf-8");
        const matches = content.match(hexRegex);
        expect(matches).toBeNull();
      }
    });
  });

  describe("R6: Cross-App Contributor Interoperability & Fault Isolation", () => {
    test("T6.1: External cross-app contributor co-exists seamlessly with portal contributors", async () => {
      const unregisterPortal = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      // Simulate an external contributor from clinic-api or laboratory-api
      const externalItem: SearchItem = {
        id: "clinic-patient-99",
        category: "patients",
        title: "Juanita Dela Cruz",
        subtitle: "MRN: 2026-0099 • PhilHealth: 12-345678901-2",
        targetRoute: "/dashboard/clinic/patients/99",
        badgeText: "STAT",
        badgeVariant: "emergency",
      };

      const unregisterExternal = universalSearchRegistry.register({
        id: "clinic-patients",
        category: "patients",
        categoryLabel: "Clinic Patients",
        priority: 10,
        search: (q: string) => {
          if (q.toLowerCase().includes("juanita")) return [externalItem];
          return [];
        },
      });

      expect(universalSearchRegistry.getContributors().length).toBe(6);

      const results = await universalSearchRegistry.search("juanita");
      expect(results.length).toBe(1);
      expect(results[0].title).toBe("Juanita Dela Cruz");
      expect(results[0].badgeVariant).toBe("emergency");

      unregisterExternal();
      unregisterPortal();
      expect(universalSearchRegistry.getContributors().length).toBe(0);
    });

    test("T6.2: Fault isolation: failing external contributor does not break portal search", async () => {
      const unregisterPortal = registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      // Register a misbehaving contributor that throws an error
      const unregisterFailing = universalSearchRegistry.register({
        id: "broken-external-service",
        category: "external",
        categoryLabel: "External",
        priority: 1,
        search: () => {
          throw new Error("Simulated remote microservice network error");
        },
      });

      // Search should still succeed and return portal items without throwing
      const results = await universalSearchRegistry.search("overview");
      expect(results.length).toBeGreaterThan(0);
      expect(results.map((r) => r.title)).toContain("Overview");

      unregisterFailing();
      unregisterPortal();
    });

    test("T6.3: External search items with custom categories (patients, dental, billing) are dynamically preserved in groupedResults, have onSelect invoked, and are not dropped", async () => {
      // 1. Spies to verify onSelect invocation
      let patientSelected = false;
      let dentalSelected = false;
      let billingSelected = false;

      const patientItem: SearchItem = {
        id: "clinic-patient-101",
        category: "patients",
        title: "Juanita Dela Cruz",
        subtitle: "MRN: 2026-0101 • PhilHealth: 12-345678901-2",
        targetRoute: "/dashboard/clinic/patients/101",
        badgeText: "STAT",
        badgeVariant: "emergency",
        onSelect: () => {
          patientSelected = true;
        },
      };

      const dentalItem: SearchItem = {
        id: "clinic-dental-42",
        category: "dental",
        title: "Tooth 16 - Molar Extraction",
        subtitle: "Dental Chart • Quadrant 1",
        targetRoute: "/dashboard/clinic/dental/42",
        badgeText: "Decay",
        badgeVariant: "urgent",
        onSelect: () => {
          dentalSelected = true;
        },
      };

      const billingItem: SearchItem = {
        id: "billing-inv-88",
        category: "billing",
        title: "Invoice #INV-2026-0088",
        subtitle: "Amount: ₱4,500.00 • Status: Open",
        targetRoute: "/dashboard/billing/invoices/88",
        badgeText: "Unpaid",
        badgeVariant: "routine",
        onSelect: () => {
          billingSelected = true;
        },
      };

      // 2. Register custom cross-app contributors
      const unregPatients = universalSearchRegistry.register({
        id: "clinic-patients",
        category: "patients",
        categoryLabel: "Clinic Patients",
        priority: 10,
        search: (q: string) =>
          q.toLowerCase().includes("juanita") || q.toLowerCase().includes("multi")
            ? [patientItem]
            : [],
      });

      const unregDental = universalSearchRegistry.register({
        id: "clinic-dental",
        category: "dental",
        categoryLabel: "Dental Chart",
        priority: 20,
        search: (q: string) =>
          q.toLowerCase().includes("tooth") || q.toLowerCase().includes("multi")
            ? [dentalItem]
            : [],
      });

      const unregBilling = universalSearchRegistry.register({
        id: "billing-invoices",
        category: "billing",
        categoryLabel: "Billing & Invoices",
        priority: 30,
        search: (q: string) =>
          q.toLowerCase().includes("inv") || q.toLowerCase().includes("multi")
            ? [billingItem]
            : [],
      });

      // 3. Search registry returns all items across the custom categories
      const multiResults = await universalSearchRegistry.search("multi");
      expect(multiResults.length).toBe(3);
      expect(multiResults.map((r) => r.category)).toEqual(["patients", "dental", "billing"]);

      // 4. Simulate mapping external items into WorkspaceSearchDialog SearchItem[]
      const mappedExternal: LocalSearchItem[] = multiResults.map((uItem) => ({
        id: uItem.id,
        title: uItem.title,
        subtitle: uItem.subtitle,
        category: uItem.category || "navigation",
        categoryLabel: (uItem as any).categoryLabel || uItem.category || "General",
        icon: (() => null) as any,
        url: uItem.targetRoute || `/${mockTenant}/dashboard/overview`,
        badge: uItem.badgeText || uItem.badge?.text,
        badgeClass: "border-primary/40 bg-primary/10 text-primary",
        onSelect: uItem.onSelect,
      }));

      // Verify onSelect is preserved during mapping
      expect(mappedExternal[0].onSelect).toBeDefined();
      expect(mappedExternal[1].onSelect).toBeDefined();
      expect(mappedExternal[2].onSelect).toBeDefined();

      // Verify invoking onSelect calls the registered callback
      expect(patientSelected).toBe(false);
      mappedExternal[0].onSelect?.();
      expect(patientSelected).toBe(true);

      expect(dentalSelected).toBe(false);
      mappedExternal[1].onSelect?.();
      expect(dentalSelected).toBe(true);

      expect(billingSelected).toBe(false);
      mappedExternal[2].onSelect?.();
      expect(billingSelected).toBe(true);

      // 5. Mixed results: standard navigation item + custom categories
      const standardNav: LocalSearchItem = {
        id: "nav-overview",
        title: "Overview",
        category: "navigation",
        categoryLabel: "Pages & Navigation",
        icon: (() => null) as any,
        url: `/${mockTenant}/dashboard/overview`,
      };

      const visibleResults: LocalSearchItem[] = [standardNav, ...mappedExternal];
      expect(visibleResults.length).toBe(4);

      // 6. Test dynamic groupSearchResults
      const grouped = groupSearchResults(visibleResults);

      // Verify all categories (standard and custom) are present
      expect(grouped.has("navigation")).toBe(true);
      expect(grouped.has("patients")).toBe(true);
      expect(grouped.has("dental")).toBe(true);
      expect(grouped.has("billing")).toBe(true);

      // Verify no items are dropped (total grouped items === visible items)
      const allGroupedItems = Array.from(grouped.values()).flatMap((g) => g.items);
      expect(allGroupedItems.length).toBe(visibleResults.length);
      expect(allGroupedItems.map((i) => i.id)).toEqual([
        "nav-overview",
        "clinic-patient-101",
        "clinic-dental-42",
        "billing-inv-88",
      ]);

      // Verify group labels
      expect(grouped.get("navigation")?.label).toBe("Pages & Navigation");
      expect(grouped.get("patients")?.label).toBe("patients");
      expect(grouped.get("dental")?.label).toBe("dental");
      expect(grouped.get("billing")?.label).toBe("billing");

      // Verify indices are contiguous and sequential
      expect(grouped.get("navigation")?.startIndex).toBe(0);
      expect(grouped.get("patients")?.startIndex).toBe(1);
      expect(grouped.get("dental")?.startIndex).toBe(2);
      expect(grouped.get("billing")?.startIndex).toBe(3);

      // 7. Test fallback capitalization when categoryLabel is not already set
      const itemWithoutLabel: LocalSearchItem = {
        id: "custom-no-label",
        title: "Telemetry Monitor",
        category: "telemetry",
        categoryLabel: "",
        icon: (() => null) as any,
        url: "/telemetry",
      };
      const groupedWithFallback = groupSearchResults([itemWithoutLabel]);
      expect(groupedWithFallback.get("telemetry")?.label).toBe("Telemetry");

      // 8. Component source verification for dynamic category headers and test token preservation
      const dialogPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const dialogSource = fs.readFileSync(dialogPath, "utf-8");
      expect(dialogSource).toContain("categoryData.label || CATEGORY_LABELS[category as SearchCategory] || category");
      expect(dialogSource).toContain("aria-label={categoryTitle}");
      expect(dialogSource).toContain("item.onSelect?.()");

      // Cleanup
      unregPatients();
      unregDental();
      unregBilling();
      expect(universalSearchRegistry.getContributors().length).toBe(0);
    });

    test("T6.4: Keyboard Enter selection and activeOptionId strictly synchronize with visual grouped order when visibleResults is out of category order", async () => {
      // 1. Setup items that appear out of CATEGORY_ORDER in raw search results
      // (e.g. title relevance or asynchronous contributor append puts teamItem before actionItem)
      let teamSelectedCount = 0;
      let actionSelectedCount = 0;

      const teamItem: LocalSearchItem = {
        id: "staff-santos",
        category: "team",
        categoryLabel: "Workspace Team",
        title: "Dr. Maria Santos",
        subtitle: "Attending Physician • Apex Primary Clinic",
        icon: (() => null) as any,
        url: `/${mockTenant}/dashboard/team`,
        onSelect: () => {
          teamSelectedCount++;
        },
      };

      const actionItem: LocalSearchItem = {
        id: "action-create-branch",
        category: "actions",
        categoryLabel: "Quick Actions",
        title: "New Branch",
        subtitle: "Create and configure a new branch",
        icon: (() => null) as any,
        url: `/${mockTenant}/dashboard/branches?createBranch=true`,
        onSelect: () => {
          actionSelectedCount++;
        },
      };

      // Raw visibleResults has teamItem at index 0, actionItem at index 1
      const visibleResults: LocalSearchItem[] = [teamItem, actionItem];
      expect(visibleResults[0].id).toBe("staff-santos");
      expect(visibleResults[1].id).toBe("action-create-branch");

      // 2. Group items via groupSearchResults
      const grouped = groupSearchResults(visibleResults);

      // Verify that groupSearchResults re-orders categories per CATEGORY_ORDER:
      // "actions" precedes "team"
      const groupCategories = Array.from(grouped.keys());
      expect(groupCategories).toEqual(["actions", "team"]);
      expect(grouped.get("actions")?.startIndex).toBe(0);
      expect(grouped.get("team")?.startIndex).toBe(1);

      // 3. Derive reconciled flattenedResults directly from grouped order
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);
      expect(flattenedResults.length).toBe(visibleResults.length);

      // In flattenedResults (which matches DOM visual rendering):
      // visual index 0 is actionItem ("action-create-branch")
      // visual index 1 is teamItem ("staff-santos")
      expect(flattenedResults[0].id).toBe("action-create-branch");
      expect(flattenedResults[1].id).toBe("staff-santos");

      // Verify divergence between raw visibleResults and visual flattened order
      expect(flattenedResults[0].id).not.toBe(visibleResults[0].id);

      // 4. Assert activeOptionId derivation against flattenedResults[activeIndex]
      const getActiveOptionId = (index: number) => {
        const item = flattenedResults[index];
        return item
          ? `workspace-search-opt-${(item.id || "").replace(/[^\w-]/g, "_")}`
          : undefined;
      };

      // At activeIndex = 0: visual highlight is on actionItem
      const activeOptionId0 = getActiveOptionId(0);
      expect(activeOptionId0).toBe("workspace-search-opt-action-create-branch");
      // Must NOT match the teamItem id
      expect(activeOptionId0).not.toBe("workspace-search-opt-staff-santos");

      // At activeIndex = 1: visual highlight is on teamItem
      const activeOptionId1 = getActiveOptionId(1);
      expect(activeOptionId1).toBe("workspace-search-opt-staff-santos");

      // 5. Simulate keyboard Enter selection from flattenedResults[activeIndex]
      let navigatedUrl = "";
      const fakeRouter = {
        push: (url: string) => {
          navigatedUrl = url;
        },
      };

      const simulateEnter = (index: number) => {
        const selected = flattenedResults[index];
        if (selected) {
          selected.onSelect?.();
          fakeRouter.push(selected.url);
        }
      };

      // Press Enter at activeIndex = 0 (highlighted item is actionItem)
      simulateEnter(0);
      expect(actionSelectedCount).toBe(1);
      expect(teamSelectedCount).toBe(0);
      expect(navigatedUrl).toBe(`/${mockTenant}/dashboard/branches?createBranch=true`);
      expect(navigatedUrl).not.toBe(`/${mockTenant}/dashboard/team`);

      // Press Enter at activeIndex = 1 (highlighted item is teamItem)
      simulateEnter(1);
      expect(actionSelectedCount).toBe(1);
      expect(teamSelectedCount).toBe(1);
      expect(navigatedUrl).toBe(`/${mockTenant}/dashboard/team`);

      // 6. Component source static verification:
      // Verify WorkspaceSearchDialog.tsx derives flattenedResults from groupedResults
      // and selects from flattenedResults[activeIndex]
      const dialogPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const dialogSource = fs.readFileSync(dialogPath, "utf-8");

      expect(dialogSource).toContain("flattenedResults");
      expect(dialogSource).toContain("Array.from(groupedResults.values()).flatMap");
      expect(dialogSource).toContain("flattenedResults[activeIndex]");
      expect(dialogSource).toMatch(/const\s+selected\s*=\s*flattenedResults\[activeIndex\];/);
    });
  });
});
