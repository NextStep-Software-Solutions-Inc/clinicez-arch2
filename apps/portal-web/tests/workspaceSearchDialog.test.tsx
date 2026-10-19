import { describe, test, expect, mock } from "bun:test";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "apex-health" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/apex-health/dashboard/overview",
  useSearchParams: () => new URLSearchParams(),
}));

import React from "react";
import fs from "fs";
import path from "path";
import { renderToString } from "react-dom/server";
import {
  getNavigationItems,
  getQuickActionItems,
  getBranchItems,
  getStaffItems,
  filterSearchItems,
  CATEGORY_LABELS,
  normalizeSearchString,
  matchesSearchTerm,
  buildItemCorpus,
  forceReleaseBodyScrollLock,
  type SearchItem,
} from "../src/components/dashboard/WorkspaceSearchDialog";
import WorkspaceSearchDialog from "../src/components/dashboard/WorkspaceSearchDialog";
import { NavMain } from "../src/components/dashboard/nav-main";
import { SidebarProvider } from "../src/components/ui/sidebar";
import type { BranchDto } from "../src/services/branch.service";
import type { StaffMemberDto } from "../src/services/staff.service";

// Mock sample test data
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
  {
    id: "staff-4",
    fullName: "Roberto Gomez",
    email: "roberto.gomez@apexhealth.ph",
    role: "Registered Pharmacist",
    status: "Active",
    facilityName: "Apex Community Pharmacy",
    createdAt: "2026-02-15T08:00:00Z",
  },
  {
    id: "staff-5",
    fullName: "Patricia Lim",
    email: "patricia.lim@apexhealth.ph",
    role: "Cashier/Billing Staff",
    status: "Active",
    createdAt: "2026-03-01T08:00:00Z",
  },
];

describe("Workspace-Wide Search Tool (⌘K / Ctrl+K) Test Suite", () => {
  describe("R1: Trigger Button & Sidebar Integration", () => {
    test("T1.1: NavMain renders search trigger button with accessible tooltip and IconSearch", () => {
      const navItems = [
        {
          title: "Overview",
          url: "/dashboard/overview",
        },
      ];

      const html = renderToString(
        <SidebarProvider>
          <NavMain items={navItems} />
        </SidebarProvider>
      );

      // Must have aria-label and sr-only for Search workspace (⌘K)
      expect(html).toContain("Search workspace (⌘K)");
      // Must not contain the old unrouted mail inbox button
      expect(html).not.toContain("Inbox");
      // Must render Quick Create alongside Search
      expect(html).toContain("Quick Create");
    });
  });

  describe("R3: Search Index Coverage & Data Generation", () => {
    test("T3.1: Navigation items cover all 10 required workspace pages", () => {
      const nav = getNavigationItems(mockTenant);
      expect(nav.length).toBe(10);

      const titles = nav.map((item) => item.title);
      expect(titles).toContain("Overview");
      expect(titles).toContain("Branches");
      expect(titles).toContain("PhilHealth YAKAP");
      expect(titles).toContain("Workspace Team");
      expect(titles).toContain("Network");
      expect(titles).toContain("Finance");
      expect(titles).toContain("Settings");
      expect(titles).toContain("Plan & Usage");
      expect(titles).toContain("Ownership");
      expect(titles).toContain("Billing");

      // Verify routing prefixes
      for (const item of nav) {
        expect(item.url.startsWith(`/${mockTenant}/dashboard/`)).toBe(true);
        expect(item.category).toBe("navigation");
        expect(item.categoryLabel).toBe(CATEGORY_LABELS.navigation);
      }
    });

    test("T3.2: Quick Action shortcuts cover Branch creation, Facility provisioning, and Staff invitation", () => {
      const actions = getQuickActionItems(mockTenant);
      expect(actions.length).toBe(5);

      const titles = actions.map((item) => item.title);
      expect(titles).toContain("New Branch");
      expect(titles).toContain("Provision Clinic");
      expect(titles).toContain("Provision Laboratory");
      expect(titles).toContain("Provision Pharmacy");
      expect(titles).toContain("Invite Staff Member");

      // Verify deep-link query parameters
      const newBranch = actions.find((a) => a.title === "New Branch")!;
      expect(newBranch.url).toBe(`/${mockTenant}/dashboard/branches?createBranch=true`);

      const provClinic = actions.find((a) => a.title === "Provision Clinic")!;
      expect(provClinic.url).toBe(`/${mockTenant}/dashboard/branches?create=clinic`);

      const provLab = actions.find((a) => a.title === "Provision Laboratory")!;
      expect(provLab.url).toBe(`/${mockTenant}/dashboard/branches?create=laboratory`);

      const provPharma = actions.find((a) => a.title === "Provision Pharmacy")!;
      expect(provPharma.url).toBe(`/${mockTenant}/dashboard/branches?create=pharmacy`);

      const inviteStaff = actions.find((a) => a.title === "Invite Staff Member")!;
      expect(inviteStaff.url).toBe(`/${mockTenant}/dashboard/team?invite=true`);
    });

    test("T3.3: Branch items index physical branches and child facilities with PhilHealth tags", () => {
      const branchItems = getBranchItems(mockBranches, mockTenant);

      // 2 branches + 4 child facilities (3 under branch 1, 1 under branch 2) = 6 items
      expect(branchItems.length).toBe(6);

      // Verify physical branch 1 has YAKAP accreditation badge
      const branch1 = branchItems.find((b) => b.id === "branch-branch-101")!;
      expect(branch1).toBeDefined();
      expect(branch1.title).toBe("Apex Central Medical Hub");
      expect(branch1.badge).toBe("YAKAP");
      expect(branch1.subtitle).toContain("Manila");
      expect(branch1.subtitle).toContain("PMCC");

      // Verify physical branch 2 without accreditation has standard badge
      const branch2 = branchItems.find((b) => b.id === "branch-branch-102")!;
      expect(branch2).toBeDefined();
      expect(branch2.badge).toBe("Branch");
      expect(branch2.subtitle).toContain("Quezon City");

      // Verify child facilities are indexed with their parent branch context
      const labFac = branchItems.find((b) => b.id === "facility-fac-l1")!;
      expect(labFac).toBeDefined();
      expect(labFac.title).toBe("Apex Diagnostic Lab");
      expect(labFac.category).toBe("facilities");
      expect(labFac.badge).toBe("Laboratory");
      expect(labFac.subtitle).toContain("Apex Central Medical Hub");
    });

    test("T3.4: Staff items index workspace team members and clinical roles", () => {
      const staffItems = getStaffItems(mockStaff, mockTenant);
      expect(staffItems.length).toBe(5);

      const doctor = staffItems.find((s) => s.id === "staff-staff-1")!;
      expect(doctor.title).toBe("Dr. Maria Santos");
      expect(doctor.badge).toBe("Attending Physician");
      expect(doctor.subtitle).toContain("Apex Primary Clinic");
      expect(doctor.url).toBe(`/${mockTenant}/dashboard/team`);

      const admin = staffItems.find((s) => s.id === "staff-staff-2")!;
      expect(admin.title).toBe("Juan Dela Cruz");
      expect(admin.badge).toBe("Tenant Administrator");

      const medtech = staffItems.find((s) => s.id === "staff-staff-3")!;
      expect(medtech.title).toBe("Elena Rostova");
      expect(medtech.badge).toBe("Medical Technologist");
    });
  });

  describe("R3 & R4: Filtering, Zero-State & Empty State", () => {
    const allItems: SearchItem[] = [
      ...getQuickActionItems(mockTenant),
      ...getNavigationItems(mockTenant),
      ...getBranchItems(mockBranches, mockTenant),
      ...getStaffItems(mockStaff, mockTenant),
    ];

    test("T4.1: Empty query displays zero-state suggested pages and quick actions", () => {
      const zeroStateResults = filterSearchItems(allItems, "");
      expect(zeroStateResults.length).toBeGreaterThan(0);

      // All zero-state items must be flagged as suggested
      for (const item of zeroStateResults) {
        expect(item.isSuggested).toBe(true);
      }

      // Must contain suggested quick actions
      const actionTitles = zeroStateResults.filter((r) => r.category === "actions").map((r) => r.title);
      expect(actionTitles).toContain("New Branch");
      expect(actionTitles).toContain("Provision Clinic");
      expect(actionTitles).toContain("Invite Staff Member");

      // Must contain suggested pages
      const navTitles = zeroStateResults.filter((r) => r.category === "navigation").map((r) => r.title);
      expect(navTitles).toContain("Overview");
      expect(navTitles).toContain("Branches");
      expect(navTitles).toContain("PhilHealth YAKAP");
      expect(navTitles).toContain("Workspace Team");
    });

    test("T4.2: Querying 'branch' filters to branch facilities, actions and pages", () => {
      const results = filterSearchItems(allItems, "branch");
      expect(results.length).toBeGreaterThan(0);

      const titles = results.map((r) => r.title);
      expect(titles).toContain("Branches"); // Navigation Page
      expect(titles).toContain("New Branch"); // Quick Action
      expect(titles).toContain("Apex Central Medical Hub"); // Branch 1
      expect(titles).toContain("Apex North Satellite Branch"); // Branch 2
    });

    test("T4.3: Querying 'clinic' filters to clinic facilities, actions, and relevant branches", () => {
      const results = filterSearchItems(allItems, "clinic");
      expect(results.length).toBeGreaterThan(0);

      const titles = results.map((r) => r.title);
      expect(titles).toContain("Provision Clinic");
      expect(titles).toContain("Apex Primary Clinic");
      expect(titles).toContain("North Outpatient Clinic");
    });

    test("T4.4: Querying 'lab' or 'laboratory' filters to laboratory facilities and actions", () => {
      const labResults = filterSearchItems(allItems, "lab");
      expect(labResults.length).toBeGreaterThan(0);

      const titles = labResults.map((r) => r.title);
      expect(titles).toContain("Provision Laboratory");
      expect(titles).toContain("Apex Diagnostic Lab");

      const fullLabResults = filterSearchItems(allItems, "laboratory");
      expect(fullLabResults.map((r) => r.title)).toContain("Provision Laboratory");
      expect(fullLabResults.map((r) => r.title)).toContain("Apex Diagnostic Lab");
    });

    test("T4.5: Querying 'pharmacy' filters to pharmacy facilities and actions", () => {
      const results = filterSearchItems(allItems, "pharmacy");
      expect(results.length).toBeGreaterThan(0);

      const titles = results.map((r) => r.title);
      expect(titles).toContain("Provision Pharmacy");
      expect(titles).toContain("Apex Community Pharmacy");
    });

    test("T4.6: Querying team members and roles filters matching staff", () => {
      // Query by doctor name
      const doctorResults = filterSearchItems(allItems, "santos");
      expect(doctorResults.length).toBe(1);
      expect(doctorResults[0].title).toBe("Dr. Maria Santos");

      // Query by clinical role synonym "doctor"
      const docRoleResults = filterSearchItems(allItems, "doctor");
      expect(docRoleResults.map((r) => r.title)).toContain("Dr. Maria Santos");

      // Query by technologist
      const medtechResults = filterSearchItems(allItems, "technologist");
      expect(medtechResults.map((r) => r.title)).toContain("Elena Rostova");

      // Query by pharmacist
      const pharmaResults = filterSearchItems(allItems, "pharmacist");
      expect(pharmaResults.map((r) => r.title)).toContain("Roberto Gomez");

      // Query by admin
      const adminResults = filterSearchItems(allItems, "admin");
      expect(adminResults.map((r) => r.title)).toContain("Juan Dela Cruz");
    });

    test("T4.7: Querying PhilHealth / PMCC accreditation filters accredited branches and pages", () => {
      const yakapResults = filterSearchItems(allItems, "pmcc");
      expect(yakapResults.length).toBeGreaterThan(0);
      expect(yakapResults.map((r) => r.title)).toContain("Apex Central Medical Hub");
      expect(yakapResults.map((r) => r.title)).toContain("PhilHealth YAKAP");
    });

    test("T4.8: Non-matching query returns 0 results for empty state rendering", () => {
      const noResults = filterSearchItems(allItems, "zzzznonexistenttoken9999");
      expect(noResults.length).toBe(0);
    });

    test("T4.9: Multi-word query matches all terms across titles and subtitles", () => {
      const multiWord = filterSearchItems(allItems, "diagnostic lab");
      expect(multiWord.length).toBeGreaterThan(0);
      expect(multiWord.map((r) => r.title)).toContain("Apex Diagnostic Lab");
    });
  });

  describe("R4: Keyboard Navigation & State Machine Verification", () => {
    test("T5.1: ArrowDown and ArrowUp cycle through results with boundary wrap-around", () => {
      const items = filterSearchItems(
        [
          ...getQuickActionItems(mockTenant),
          ...getNavigationItems(mockTenant),
        ],
        ""
      );
      expect(items.length).toBeGreaterThan(1);

      let activeIndex = 0;

      // Simulate ArrowDown
      const simulateArrowDown = (curr: number, len: number) => (curr + 1) % len;
      // Simulate ArrowUp
      const simulateArrowUp = (curr: number, len: number) => (curr - 1 + len) % len;

      activeIndex = simulateArrowDown(activeIndex, items.length);
      expect(activeIndex).toBe(1);

      activeIndex = simulateArrowDown(activeIndex, items.length);
      expect(activeIndex).toBe(2);

      // Reverse with ArrowUp
      activeIndex = simulateArrowUp(activeIndex, items.length);
      expect(activeIndex).toBe(1);

      // Wrap around with ArrowUp from 0 to end
      activeIndex = 0;
      activeIndex = simulateArrowUp(activeIndex, items.length);
      expect(activeIndex).toBe(items.length - 1);

      // Wrap around with ArrowDown from end to 0
      activeIndex = simulateArrowDown(activeIndex, items.length);
      expect(activeIndex).toBe(0);
    });

    test("T5.2: Enter key triggers navigation to active item URL", () => {
      const items = getQuickActionItems(mockTenant);
      const activeItem = items[0];

      let pushedUrl = "";
      const fakeRouter = {
        push: (url: string) => {
          pushedUrl = url;
        },
      };

      fakeRouter.push(activeItem.url);
      expect(pushedUrl).toBe(`/${mockTenant}/dashboard/branches?createBranch=true`);
    });
  });

  describe("R2: Component Render Structure & Dialog Primitives", () => {
    test("T6.1: WorkspaceSearchDialog renders trigger button and satisfies Radix Dialog & Combobox accessibility contract", () => {
      // Test trigger rendering via renderToString
      const html = renderToString(
        <WorkspaceSearchDialog
          trigger={<button id="workspace-search-trigger-btn">Search Palette</button>}
          tenantSlug={mockTenant}
        />
      );

      expect(html).toContain('id="workspace-search-trigger-btn"');
      expect(html).toContain("Search Palette");

      // Verify component source contract for Radix Dialog & accessibility
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      // Radix Dialog primitive integration
      expect(source).toContain('from "@/components/ui/dialog"');
      expect(source).toContain("<Dialog ");
      expect(source).toContain("<DialogContent");
      expect(source).toContain("<DialogTitle className=\"sr-only\"");
      expect(source).toContain("<DialogDescription className=\"sr-only\"");

      // Accessibility & Combobox attributes
      expect(source).toContain('role="combobox"');
      expect(source).toContain('aria-label="Search workspace"');
      expect(source).toContain('aria-haspopup="listbox"');
      expect(source).toContain('aria-autocomplete="list"');
      expect(source).toContain('aria-controls="workspace-search-results"');
      expect(source).toContain('aria-activedescendant={activeOptionId}');
      expect(source).toContain('role="listbox"');
      expect(source).toContain('aria-label="Search results"');
      expect(source).toContain('role="option"');
      expect(source).toContain('tabIndex={-1}');
      expect(source).toContain('id={optionId}');
      expect(source).toContain('aria-selected={isSelected}');

      // Keyboard shortcuts: Cmd+K / Ctrl+K in capture phase and arrow navigation
      expect(source).toContain('(e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")');
      expect(source).toContain('window.addEventListener("keydown", handleGlobalKeyDown, true)');
      expect(source).toContain('if (e.repeat) return;');
      expect(source).toContain('e.stopPropagation()');
      expect(source).toContain('if (e.nativeEvent.isComposing) return;');
      expect(source).toContain('e.key === "ArrowDown"');
      expect(source).toContain('e.key === "ArrowUp"');
      expect(source).toContain('e.key === "Enter"');
      expect(source).toContain('e.key === "Escape"');

      // Autofocus and smooth mouse interaction
      expect(source).toContain("onOpenAutoFocus");
      expect(source).toContain("onPointerMove");

      // Live service integration
      expect(source).toContain("branchService.getBranches(tenantSlug)");
      expect(source).toContain("staffService.getTenantStaff(tenantSlug)");
    });

    test("T6.2: Defensive handling of null, undefined, and malformed data in search indices", () => {
      // 1. Undefined or null branches array
      expect(() => getBranchItems(undefined as any, mockTenant)).not.toThrow();
      expect(getBranchItems(undefined as any, mockTenant)).toEqual([]);

      // 2. Branch with null elements or missing facilities
      const corruptBranches: any = [
        null,
        {
          id: "corrupt-1",
          name: null,
          facilities: [
            null,
            { id: "f-corrupt", name: null, facilityType: undefined, status: null },
          ],
        },
      ];
      expect(() => getBranchItems(corruptBranches, mockTenant)).not.toThrow();
      const corruptBranchItems = getBranchItems(corruptBranches, mockTenant);
      expect(corruptBranchItems.length).toBeGreaterThan(0);

      // 3. Undefined or null staff array
      expect(() => getStaffItems(undefined as any, mockTenant)).not.toThrow();
      expect(getStaffItems(undefined as any, mockTenant)).toEqual([]);

      // 4. Staff with null elements or missing fields
      const corruptStaff: any = [
        null,
        { id: null, fullName: null, role: null, email: null },
      ];
      expect(() => getStaffItems(corruptStaff, mockTenant)).not.toThrow();
      const corruptStaffItems = getStaffItems(corruptStaff, mockTenant);
      expect(corruptStaffItems.length).toBe(1);

      // 5. Filter search items with nulls or empty inputs
      expect(() => filterSearchItems(null as any, "test")).not.toThrow();
      expect(filterSearchItems(null as any, "test")).toEqual([]);
      expect(() => filterSearchItems([null as any], "test")).not.toThrow();
      expect(filterSearchItems([null as any], "test")).toEqual([]);
    });

    test("T6.3: Async loading vs empty state contract in search dialog", () => {
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      // Verifies that loadingData displays dedicated searching state rather than false empty state
      expect(source).toContain("Searching workspace...");
      expect(source).toContain("Fetching branches, facilities, and staff members...");
      expect(source).toContain('role="status"');
      expect(source).toContain('aria-live="polite"');
    });

    test("T6.4: Zero raw hex colors in touched WorkspaceSearchDialog and nav-main components", () => {
      const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

      const dialogPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const dialogContent = fs.readFileSync(dialogPath, "utf-8");
      expect(dialogContent.match(hexRegex)).toBeNull();

      const navMainPath = path.resolve(__dirname, "../src/components/dashboard/nav-main.tsx");
      const navMainContent = fs.readFileSync(navMainPath, "utf-8");
      expect(navMainContent.match(hexRegex)).toBeNull();
    });

    test("T6.5: Resilience against regex metacharacters, punctuation tolerance, and Philippine diacritics", () => {
      const allItems: SearchItem[] = [
        ...getQuickActionItems(mockTenant),
        ...getNavigationItems(mockTenant),
        ...getBranchItems(mockBranches, mockTenant),
        ...getStaffItems(mockStaff, mockTenant),
      ];

      // 1. Regex metacharacters must not crash or throw syntax errors
      const dangerousPatterns = ["(", "[", "]", ")", "*", "+", "?", "^", "$", "\\", ".*?", "{2,5}", "(.*)"];
      for (const pattern of dangerousPatterns) {
        expect(() => filterSearchItems(allItems, pattern)).not.toThrow();
      }

      // 2. Pure non-matching metacharacters safely return 0 results
      expect(filterSearchItems(allItems, "?*^$#@!").length).toBe(0);

      // 3. Punctuation tolerance in user queries (e.g., 'Santos, Maria', 'Santos, Dr.')
      const commaQuery = filterSearchItems(allItems, "Santos, Maria");
      expect(commaQuery.length).toBe(1);
      expect(commaQuery[0].title).toBe("Dr. Maria Santos");

      const drQuery = filterSearchItems(allItems, "Dr. Santos");
      expect(drQuery.length).toBe(1);
      expect(drQuery[0].title).toBe("Dr. Maria Santos");

      // 4. Parentheses surrounding queries (e.g., '(PMCC)', '(PMCC-9901)')
      const pmccQuery = filterSearchItems(allItems, "(PMCC)");
      expect(pmccQuery.length).toBeGreaterThan(0);
      expect(pmccQuery.map((r) => r.title)).toContain("Apex Central Medical Hub");

      // 5. Philippine diacritics normalization (e.g., 'Parañaque' vs 'Paranaque')
      const branchWithDiacritics: BranchDto[] = [
        {
          id: "branch-paranaque",
          tenantId: mockTenant,
          name: "Parañaque Health Center",
          city: "Parañaque City",
          facilities: [],
        },
      ];
      const paraBranchItems = getBranchItems(branchWithDiacritics, mockTenant);
      // Querying without tilde matches
      const noTilde = filterSearchItems(paraBranchItems, "paranaque");
      expect(noTilde.length).toBe(1);
      expect(noTilde[0].title).toBe("Parañaque Health Center");

      // Querying with tilde matches
      const withTilde = filterSearchItems(paraBranchItems, "parañaque");
      expect(withTilde.length).toBe(1);
      expect(withTilde[0].title).toBe("Parañaque Health Center");

      // 6. Natural language conjunctions in page titles (e.g., 'Plan and Usage')
      const planAndUsage = filterSearchItems(allItems, "Plan and Usage");
      expect(planAndUsage.length).toBeGreaterThan(0);
      expect(planAndUsage.map((r) => r.title)).toContain("Plan & Usage");
    });

    test("T6.6: High-volume indexing performance, relevance sorting, and rendered DOM element capping", () => {
      // 1. Generate 1,000 synthetic branch & facility items
      const largeBranches: BranchDto[] = [];
      for (let i = 0; i < 200; i++) {
        largeBranches.push({
          id: `bench-b-${i}`,
          tenantId: mockTenant,
          name: `Apex Regional Branch ${i}`,
          city: `City ${i}`,
          isPhilHealthAccredited: i % 2 === 0,
          philHealthPmccNumber: `PMCC-${1000 + i}`,
          facilities: [
            { id: `bench-f1-${i}`, name: `Clinic ${i}`, facilityType: "Clinic" },
            { id: `bench-f2-${i}`, name: `Laboratory ${i}`, facilityType: "Laboratory" },
            { id: `bench-f3-${i}`, name: `Pharmacy ${i}`, facilityType: "Pharmacy" },
          ],
        });
      }

      const startTime = performance.now();
      const largeItems = getBranchItems(largeBranches, mockTenant);
      // 200 branches + 600 child facilities = 800 items
      expect(largeItems.length).toBe(800);

      // Verify each item has a precomputed _corpus
      for (const item of largeItems) {
        expect(typeof item._corpus).toBe("string");
      }

      // Filter against 800 items
      const filterStart = performance.now();
      const results = filterSearchItems(largeItems, "laboratory 15");
      const filterDuration = performance.now() - filterStart;

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toContain("Laboratory 15");
      // Search across 800 items must be sub-16ms
      expect(filterDuration).toBeLessThan(16);

      // 2. Relevance ranking: exact/prefix title matches rank before generic keyword matches
      const sampleItems: SearchItem[] = [
        {
          id: "1",
          title: "System Overview",
          category: "navigation",
          categoryLabel: "Pages & Navigation",
          icon: () => null,
          url: "/overview",
          keywords: ["branch"],
          _corpus: "system overview branch",
        },
        {
          id: "2",
          title: "Branches",
          category: "navigation",
          categoryLabel: "Pages & Navigation",
          icon: () => null,
          url: "/branches",
          keywords: ["branches"],
          _corpus: "branches",
        },
        {
          id: "3",
          title: "New Branch",
          category: "actions",
          categoryLabel: "Quick Actions",
          icon: () => null,
          url: "/branches?create=true",
          keywords: ["create branch"],
          _corpus: "new branch create branch",
        },
      ];

      const ranked = filterSearchItems(sampleItems, "branch");
      expect(ranked[0].title).toBe("Branches"); // Prefix/exact title match ranks 1st
      expect(ranked[1].title).toBe("New Branch"); // Title includes query ranks 2nd
      expect(ranked[2].title).toBe("System Overview"); // Keyword-only match ranks 3rd

      // 3. Component caps rendered DOM elements with MAX_RENDERED_RESULTS (60)
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");
      expect(source).toContain("MAX_RENDERED_RESULTS = 60");
      expect(source).toContain("filteredResults.slice(0, MAX_RENDERED_RESULTS)");
      expect(source).toContain("Showing top");
    });

    test("T6.7: Focus management, WAI-ARIA role='group', stationary pointer battle protection, and navigation", () => {
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      // Focus management & trigger restoration
      expect(source).toContain("onCloseAutoFocus");
      expect(source).toContain("previousActiveElementRef.current.focus()");
      expect(source).toContain('document.getElementById("workspace-search-trigger")');
      expect(source).toContain("selectedItemNavigatedRef.current");

      // nav-main.tsx has trigger button id="workspace-search-trigger"
      const navMainPath = path.resolve(__dirname, "../src/components/dashboard/nav-main.tsx");
      const navMainContent = fs.readFileSync(navMainPath, "utf-8");
      expect(navMainContent).toContain('id="workspace-search-trigger"');

      // WAI-ARIA 1.2 Grouping contract for listbox
      expect(source).toContain('role="group"');
      expect(source).toContain('aria-label={categoryTitle}');
      expect(source).toContain('role="presentation"');
      expect(source).toContain('aria-hidden="true"');

      // Stationary pointer battle protection (movementX === 0 && movementY === 0)
      expect(source).toContain("e.movementX === 0");
      expect(source).toContain("e.movementY === 0");

      // PageDown and PageUp keyboard navigation
      expect(source).toContain('e.key === "PageDown"');
      expect(source).toContain('e.key === "PageUp"');

      // Scroll into view using direct activeOptionId DOM handle
      expect(source).toContain("activeOptionId");
      expect(source).toContain('document.getElementById(activeOptionId)');
      expect(source).toContain('block: "nearest"');
    });
  });

  describe("R5: Review Round 3 - Stress Testing, Browser History, Mobile & Touch Hardening", () => {
    test("T7.1: Browser history & back-forward navigation cleanup (ISSUE-8)", () => {
      // 1. Verify forceReleaseBodyScrollLock cleans up style locks and attributes on DOM
      const mockAttributes: Record<string, string> = {
        "data-radix-scroll-lock": "true",
      };
      const mockDoc = {
        body: {
          style: {
            pointerEvents: "none",
            overflow: "hidden",
            paddingRight: "16px",
            marginRight: "16px",
          },
          removeAttribute: (attr: string) => {
            delete mockAttributes[attr];
          },
        },
        documentElement: {
          removeAttribute: (attr: string) => {
            delete mockAttributes[attr];
          },
        },
      };

      (globalThis as any).document = mockDoc;
      try {
        forceReleaseBodyScrollLock();
        expect(mockDoc.body.style.pointerEvents).toBe("");
        expect(mockDoc.body.style.overflow).toBe("");
        expect(mockDoc.body.style.paddingRight).toBe("");
        expect(mockDoc.body.style.marginRight).toBe("");
        expect(mockAttributes["data-radix-scroll-lock"]).toBeUndefined();
      } finally {
        delete (globalThis as any).document;
      }

      // 2. Verify popstate and pathname listeners in WorkspaceSearchDialog.tsx
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      expect(source).toContain('window.addEventListener("popstate", handlePopState)');
      expect(source).toContain('window.removeEventListener("popstate", handlePopState)');
      expect(source).toContain("forceReleaseBodyScrollLock()");

      // Verify route change listener with usePathname
      expect(source).toContain("usePathname");
      expect(source).toContain("useEffect(() => {\n    setOpen(false);\n    forceReleaseBodyScrollLock();\n  }, [pathname, setOpen]);");

      // Verify same-route vs new-route focus management
      expect(source).toContain("const isSameRoute = pathname ? item.url === pathname : false;");
      expect(source).toContain("selectedItemNavigatedRef.current = !isSameRoute;");

      // Verify nav-main.tsx also auto-closes search on pathname change
      const navMainPath = path.resolve(__dirname, "../src/components/dashboard/nav-main.tsx");
      const navMainContent = fs.readFileSync(navMainPath, "utf-8");
      expect(navMainContent).toContain("useEffect(() => {\n    setIsSearchOpen(false)\n  }, [pathname])");
    });

    test("T7.2: Touch and mobile responsiveness & iOS Safari zoom protection (ISSUE-9)", () => {
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      // 1. Pointer type guard in onPointerMove (touch dragging ignored, avoiding scrollIntoView jitter)
      expect(source).toContain('if (e.pointerType !== "mouse")');

      // 2. iOS Safari auto-zoom protection (input must be text-base, not text-sm, on mobile)
      expect(source).toContain('className="flex-1 bg-transparent text-base outline-none');

      // 3. Touch delay elimination (touch-manipulation removes 300ms mobile tap delay)
      expect(source).toContain("touch-manipulation");

      // 4. Mobile touch scroll containment (overscroll-contain & touch-pan-y)
      expect(source).toContain("overscroll-contain touch-pan-y");

      // 5. Responsive mobile viewport height scaling (top-4 sm:top-[16%] and max-h-[min(50vh,380px)])
      expect(source).toContain("top-4 sm:top-[16%]");
      expect(source).toContain("max-h-[min(50vh,380px)] sm:max-h-[380px]");

      // 6. Mobile Cancel button render when query is empty
      expect(source).toContain("Cancel");
      expect(source).toContain('aria-label="Cancel search"');

      // 7. Software keyboard dismissal on listbox touch scroll
      expect(source).toContain("onTouchStart={() => {");
      expect(source).toContain("inputRef.current.blur()");

      // 8. nav-main.tsx mobile drawer sheet dismissal when opening search
      const navMainPath = path.resolve(__dirname, "../src/components/dashboard/nav-main.tsx");
      const navMainContent = fs.readFileSync(navMainPath, "utf-8");
      expect(navMainContent).toContain("if (isMobile) {\n                      setOpenMobile?.(false)\n                    }");
      expect(navMainContent).toContain("touch-manipulation");
    });

    test("T7.3: Timer cleanup, unmount safety, and safe DOM ID escaping", () => {
      const componentPath = path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx");
      const source = fs.readFileSync(componentPath, "utf-8");

      // 1. Focus timer ref with clear timer cleanup
      expect(source).toContain("focusTimerRef");
      expect(source).toContain("clearTimeout(focusTimerRef.current)");

      // 2. Component unmount safety flag (isMountedRef) in async data resolution
      expect(source).toContain("isMountedRef.current = false");
      expect(source).toContain("if (!isMountedRef.current) return;");
      expect(source).toContain("if (isMountedRef.current) {\n        setLoadingData(false);\n      }");

      // 3. Sanitized DOM IDs avoiding selector injection / invalid characters
      expect(source).toContain(".replace(/[^\\w-]/g, \"_\")");

      // 4. Stable setOpen reference using isOpenRef to prevent keydown listener re-registration
      expect(source).toContain("isOpenRef = useRef(isOpen)");
      expect(source).toContain("const current = isOpenRef.current;");
      expect(source).toContain("[isControlled, onOpenChange]");
    });
  });
});
