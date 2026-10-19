import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  universalSearchRegistry,
  type SearchContributor,
  type SearchItem,
  type SearchBadgeVariant,
} from "@shared/safe";
import {
  registerPortalSearchContributors,
  resolveBadgeVariant,
  searchPortalUniversal,
  type PortalSearchContext,
} from "../src/services/portalSearchContributors";
import {
  getNavigationItems,
  getQuickActionItems,
  getBranchItems,
  getStaffItems,
  filterSearchItems,
  normalizeSearchString,
  matchesSearchTerm,
  buildItemCorpus,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type SearchCategory,
} from "../src/components/dashboard/WorkspaceSearchDialog";
import type { BranchDto } from "../src/services/branch.service";
import type { StaffMemberDto } from "../src/services/staff.service";

describe("Milestone 4 Challenger 2: Search Relevance, Categories & Deep Linking Stress Suite", () => {
  const TEST_TENANT = "metro-health-corp";

  const mockBranches: BranchDto[] = [
    {
      id: "bgc",
      tenantId: TEST_TENANT,
      name: "BGC Taguig Premier Branch",
      code: "BGC-01",
      city: "Taguig City",
      province: "Metro Manila",
      streetAddress: "26th St. & 5th Ave., Bonifacio Global City",
      barangay: "Fort Bonifacio",
      isPhilHealthAccredited: true,
      philHealthPmccNumber: "PMCC-001234",
      facilities: [
        {
          id: "bgc-clinic",
          name: "BGC Outpatient Consultation Clinic",
          facilityType: "Clinic",
          status: "Active",
        },
        {
          id: "bgc-lab",
          name: "BGC Diagnostic Pathology Laboratory",
          facilityType: "Laboratory",
          status: "Active",
        },
        {
          id: "bgc-pharm",
          name: "BGC Retail Pharmacy & Dispensary",
          facilityType: "Pharmacy",
          status: "Active",
        },
      ],
    },
    {
      id: "paranaque",
      tenantId: TEST_TENANT,
      name: "Parañaque City Health Haven",
      code: "PRQ-02",
      city: "Parañaque City",
      province: "Metro Manila",
      streetAddress: "Dr. A. Santos Ave., San Dionisio",
      barangay: "San Dionisio",
      isPhilHealthAccredited: false,
      facilities: [
        {
          id: "prq-clinic",
          name: "Parañaque Family Medical Clinic",
          facilityType: "Clinic",
          status: "Active",
        },
      ],
    },
    {
      id: "cebu",
      tenantId: TEST_TENANT,
      name: "Cebu Osmeña Medical Center",
      code: "CEB-03",
      city: "Cebu City",
      province: "Cebu",
      streetAddress: "Fuente Osmeña Cir., Santa Cruz",
      barangay: "Santa Cruz",
      isPhilHealthAccredited: true,
      philHealthPmccNumber: "PMCC-CEB-9988",
      facilities: [],
    },
  ];

  const mockStaff: StaffMemberDto[] = [
    {
      id: "santos",
      tenantId: TEST_TENANT,
      fullName: "Dr. Juan Carlos Santos, MD",
      email: "jc.santos@metrohealth.ph",
      role: "Attending Physician",
      status: "Active",
      facilityName: "BGC Outpatient Consultation Clinic",
    },
    {
      id: "munoz",
      tenantId: TEST_TENANT,
      fullName: "Dra. María Elena Muñoz-Reyes",
      email: "maria.munoz@metrohealth.ph",
      role: "Lead Pediatrician",
      status: "Active",
      facilityName: "Parañaque Family Medical Clinic",
    },
    {
      id: "admin",
      tenantId: TEST_TENANT,
      fullName: "Administrator Alex Vance",
      email: "alex.vance@metrohealth.ph",
      role: "Workspace Administrator",
      status: "Active",
    },
    {
      id: "biller",
      tenantId: TEST_TENANT,
      fullName: "Carmela Cruz",
      email: "carmela.cruz@metrohealth.ph",
      role: "Senior Biller & Finance Officer",
      status: "Active",
    },
  ];

  let unregister: (() => void) | null = null;

  beforeEach(() => {
    universalSearchRegistry.clear();
    unregister = registerPortalSearchContributors({
      tenantSlug: TEST_TENANT,
      branches: mockBranches,
      staff: mockStaff,
    });
  });

  afterEach(() => {
    if (unregister) {
      unregister();
      unregister = null;
    }
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // Dimension 1: 5-Category Coverage & Contributor Priority Ordering
  // =========================================================================
  describe("Dimension 1: 5 Portal Categories & Priority Ordering", () => {
    test("1.1: Exactly 5 portal contributors are registered with correct IDs and priorities", () => {
      const contributors = universalSearchRegistry.getContributors();
      expect(contributors.length).toBe(5);

      const expectedContributors = [
        { id: "portal-quick-actions", category: "actions", priority: 5 },
        { id: "portal-navigation", category: "navigation", priority: 15 },
        { id: "portal-branches", category: "branches", priority: 25 },
        { id: "portal-facilities", category: "facilities", priority: 30 },
        { id: "portal-team", category: "team", priority: 35 },
      ];

      for (const expected of expectedContributors) {
        const found = contributors.find((c) => c.id === expected.id);
        expect(found).toBeDefined();
        expect(found?.category).toBe(expected.category);
        expect(found?.priority).toBe(expected.priority);
      }
    });

    test("1.2: Contributors are strictly sorted by priority ascending", () => {
      const contributors = universalSearchRegistry.getContributors();
      const priorities = contributors.map((c) => c.priority ?? 50);
      expect(priorities).toEqual([5, 15, 25, 30, 35]);
    });

    test("1.3: Cross-category search 'branch' returns results in priority order: Actions -> Navigation -> Branches", async () => {
      const results = await universalSearchRegistry.search("branch");
      expect(results.length).toBeGreaterThan(0);

      // Extract categories of matched results in order
      const categories = results.map((r) => r.category);

      // Verify that all 'actions' results precede all 'navigation' results, which precede all 'branches' results
      const firstActionIdx = categories.indexOf("actions");
      const firstNavIdx = categories.indexOf("navigation");
      const firstBranchIdx = categories.indexOf("branches");

      expect(firstActionIdx).toBeGreaterThanOrEqual(0);
      expect(firstNavIdx).toBeGreaterThan(firstActionIdx);
      expect(firstBranchIdx).toBeGreaterThan(firstNavIdx);
    });

    test("1.4: Cross-category search 'clinic' returns results in priority order: Actions -> Facilities -> Team", async () => {
      const results = await universalSearchRegistry.search("clinic");
      expect(results.length).toBeGreaterThan(0);

      const categories = results.map((r) => r.category);
      const actionIdx = categories.indexOf("actions");
      const navIdx = categories.indexOf("navigation");
      const facilityIdx = categories.indexOf("facilities");
      const teamIdx = categories.indexOf("team");

      expect(actionIdx).toBeGreaterThanOrEqual(0);
      // Navigation 'branches' item mentions 'clinic' in keywords
      expect(navIdx).toBeGreaterThan(actionIdx);
      expect(facilityIdx).toBeGreaterThan(navIdx);
      // Doctor Santos belongs to a clinic facility, so team matches
      expect(teamIdx).toBeGreaterThan(facilityIdx);
    });

    test("1.5: Category-scoped search respects category options without leaking other categories", async () => {
      // 1. Actions only
      const actionsOnly = await universalSearchRegistry.search("branch", { category: "actions" });
      expect(actionsOnly.length).toBeGreaterThan(0);
      expect(actionsOnly.every((i) => i.category === "actions")).toBe(true);

      // 2. Navigation only
      const navOnly = await universalSearchRegistry.search("branch", { category: "navigation" });
      expect(navOnly.length).toBeGreaterThan(0);
      expect(navOnly.every((i) => i.category === "navigation")).toBe(true);

      // 3. Branches only
      const branchesOnly = await universalSearchRegistry.search("branch", { category: "branches" });
      expect(branchesOnly.length).toBeGreaterThan(0);
      expect(branchesOnly.every((i) => i.category === "branches")).toBe(true);

      // 4. Facilities only
      const facilitiesOnly = await universalSearchRegistry.search("clinic", { category: "facilities" });
      expect(facilitiesOnly.length).toBeGreaterThan(0);
      expect(facilitiesOnly.every((i) => i.category === "facilities")).toBe(true);

      // 5. Team only
      const teamOnly = await universalSearchRegistry.search("santos", { category: "team" });
      expect(teamOnly.length).toBeGreaterThan(0);
      expect(teamOnly.every((i) => i.category === "team")).toBe(true);
    });

    test("1.6: Case-insensitivity in category filtering ('BRANCHES', 'Actions')", async () => {
      const upperRes = await universalSearchRegistry.search("branch", { category: "BRANCHES" });
      expect(upperRes.length).toBeGreaterThan(0);
      expect(upperRes.every((i) => i.category === "branches")).toBe(true);

      const mixedRes = await universalSearchRegistry.search("branch", { category: "Actions" });
      expect(mixedRes.length).toBeGreaterThan(0);
      expect(mixedRes.every((i) => i.category === "actions")).toBe(true);
    });

    test("1.7: getCategories() derives all 5 categories in correct sequence", () => {
      const categories = universalSearchRegistry.getCategories();
      const keys = categories.map((c) => c.key);
      expect(keys).toEqual(["actions", "navigation", "branches", "facilities", "team"]);
      expect(keys).toEqual(CATEGORY_ORDER);
    });
  });

  // =========================================================================
  // Dimension 2: Semantic Badge Variant Resolution
  // =========================================================================
  describe("Dimension 2: Semantic Badge Variant Resolution", () => {
    test("2.1: Emergency urgency badge resolution", () => {
      expect(resolveBadgeVariant("actions", "STAT")).toBe("emergency");
      expect(resolveBadgeVariant("actions", "stat")).toBe("emergency");
      expect(resolveBadgeVariant("actions", "STAT Order")).toBe("emergency");
      expect(resolveBadgeVariant("facilities", "Critical Emergency")).toBe("emergency");
      expect(resolveBadgeVariant("branches", "Critical Panic Alert")).toBe("emergency");
      expect(resolveBadgeVariant("navigation", "Failed Claim")).toBe("emergency");
    });

    test("2.2: Urgent urgency badge resolution", () => {
      expect(resolveBadgeVariant("actions", "Urgent")).toBe("urgent");
      expect(resolveBadgeVariant("actions", "Priority")).toBe("urgent");
      expect(resolveBadgeVariant("facilities", "Pending Approval")).toBe("urgent");
      expect(resolveBadgeVariant("branches", "Warning: Expiring")).toBe("urgent");
      expect(resolveBadgeVariant("team", "Suspended Account")).toBe("urgent");
    });

    test("2.3: Routine urgency badge resolution", () => {
      expect(resolveBadgeVariant("actions", "Action")).toBe("routine");
      expect(resolveBadgeVariant("actions", "Routine")).toBe("routine");
      expect(resolveBadgeVariant("team", "Active Doctor")).toBe("routine");
      expect(resolveBadgeVariant("branches", "Accredited Clinic")).toBe("routine");
      expect(resolveBadgeVariant("team", "Owner")).toBe("routine");
      expect(resolveBadgeVariant("team", "Admin")).toBe("routine");
    });

    test("2.4: Neutral badge resolution fallback", () => {
      expect(resolveBadgeVariant("navigation", "Page")).toBe("neutral");
      expect(resolveBadgeVariant("branches", "Branch")).toBe("neutral");
      expect(resolveBadgeVariant("team", "Member")).toBe("neutral");
      expect(resolveBadgeVariant("team", "Technologist")).toBe("neutral");
      expect(resolveBadgeVariant("team", "Pharmacist")).toBe("neutral");
      expect(resolveBadgeVariant("team", undefined)).toBe("neutral");
      expect(resolveBadgeVariant("team", "")).toBe("neutral");
      expect(resolveBadgeVariant("team", "   ")).toBe("neutral");
    });

    test("2.5: Word-boundary guard prevents false positive on 'status' or 'statistic'", () => {
      // 'status' contains 'stat' as a substring, but is NOT emergency!
      expect(resolveBadgeVariant("navigation", "Status: Active")).not.toBe("emergency");
      // "Status: Active" matches 'active' -> routine
      expect(resolveBadgeVariant("navigation", "Status: Active")).toBe("routine");
      // "Status" alone without other matches -> neutral
      expect(resolveBadgeVariant("navigation", "Status")).toBe("neutral");
      expect(resolveBadgeVariant("navigation", "Station")).toBe("neutral");
      expect(resolveBadgeVariant("navigation", "Statistic")).toBe("neutral");
    });

    test("2.6: Registered search contributors emit valid SearchBadgeVariant on all returned items", async () => {
      const allResults = await universalSearchRegistry.search("a");
      expect(allResults.length).toBeGreaterThan(0);

      const validVariants: SearchBadgeVariant[] = ["routine", "urgent", "emergency", "neutral"];
      for (const item of allResults) {
        expect(validVariants).toContain(item.badgeVariant!);
        if (item.badgeText) {
          expect(item.badge).toBeDefined();
          expect(item.badge?.text).toBe(item.badgeText);
          expect(item.badge?.variant).toBe(item.badgeVariant);
        }
      }
    });
  });

  // =========================================================================
  // Dimension 3: Diacritic Insensitivity, Whitespace Splitting & Exact Match Ranking
  // =========================================================================
  describe("Dimension 3: Diacritic Insensitivity, Whitespace Splitting & Exact Match Ranking", () => {
    test("3.1: normalizeSearchString strips Philippine and Spanish diacritics", () => {
      expect(normalizeSearchString("Parañaque")).toBe("paranaque");
      expect(normalizeSearchString("Dra. María Muñoz")).toBe("dra. maria munoz");
      expect(normalizeSearchString("José Rizal")).toBe("jose rizal");
      expect(normalizeSearchString("Santo Niño")).toBe("santo nino");
      expect(normalizeSearchString("Peñafrancia")).toBe("penafrancia");
      expect(normalizeSearchString("CAINTA, RIZAL")).toBe("cainta, rizal");
    });

    test("3.2: Searching with or without diacritics returns the exact same results", async () => {
      const withDiacritic = await universalSearchRegistry.search("Parañaque");
      const withoutDiacritic = await universalSearchRegistry.search("Paranaque");

      expect(withDiacritic.length).toBeGreaterThan(0);
      expect(withoutDiacritic.length).toBeGreaterThan(0);
      expect(withDiacritic.map((i) => i.id)).toEqual(withoutDiacritic.map((i) => i.id));

      const staffWithDiacritic = await universalSearchRegistry.search("María Muñoz");
      const staffWithoutDiacritic = await universalSearchRegistry.search("Maria Munoz");

      expect(staffWithDiacritic.length).toBeGreaterThan(0);
      expect(staffWithoutDiacritic.length).toBeGreaterThan(0);
      expect(staffWithDiacritic[0].id).toBe("staff-munoz");
      expect(staffWithoutDiacritic[0].id).toBe("staff-munoz");
    });

    test("3.3: Whitespace splitting matches multiple terms in any order", () => {
      const items = getQuickActionItems(TEST_TENANT);

      // "new branch" vs "branch new" vs "   branch     new   "
      const res1 = filterSearchItems(items, "new branch");
      const res2 = filterSearchItems(items, "branch new");
      const res3 = filterSearchItems(items, "   branch     new   ");

      expect(res1.length).toBeGreaterThan(0);
      expect(res1[0].id).toBe("action-create-branch");
      expect(res2.map((i) => i.id)).toEqual(res1.map((i) => i.id));
      expect(res3.map((i) => i.id)).toEqual(res1.map((i) => i.id));
    });

    test("3.4: Whitespace-only or empty queries return 0 search results", async () => {
      expect(await universalSearchRegistry.search("")).toEqual([]);
      expect(await universalSearchRegistry.search("    ")).toEqual([]);
      expect(await universalSearchRegistry.search("\t\n  \r")).toEqual([]);
    });

    test("3.5: Exact match ranking prioritizes exact title over prefix and substring matches", () => {
      const navItems = getNavigationItems(TEST_TENANT);
      const actionItems = getQuickActionItems(TEST_TENANT);
      const combined = [...actionItems, ...navItems];

      // Query "New Branch":
      // "New Branch" is exact title of action-create-branch.
      // Other items might mention "branch" in their corpus or keywords.
      const rankedBranch = filterSearchItems(combined, "New Branch");
      expect(rankedBranch.length).toBeGreaterThan(0);
      expect(rankedBranch[0].title).toBe("New Branch");
      expect(rankedBranch[0].id).toBe("action-create-branch");

      // Query "Settings":
      const rankedSettings = filterSearchItems(combined, "Settings");
      expect(rankedSettings.length).toBeGreaterThan(0);
      expect(rankedSettings[0].title).toBe("Settings");
      expect(rankedSettings[0].id).toBe("nav-settings");

      // Query "Overview":
      const rankedOverview = filterSearchItems(combined, "Overview");
      expect(rankedOverview.length).toBeGreaterThan(0);
      expect(rankedOverview[0].title).toBe("Overview");
      expect(rankedOverview[0].id).toBe("nav-overview");
    });

    test("3.6: Title prefix matches rank ahead of substring-only matches", () => {
      const navItems = getNavigationItems(TEST_TENANT);
      // Query "Bill":
      // "Billing" starts with "Bill".
      // "Finance" contains "billing" in its subtitle ("Revenue analytics, billing transactions").
      const ranked = filterSearchItems(navItems, "Bill");
      expect(ranked.length).toBeGreaterThan(1);
      expect(ranked[0].title).toBe("Billing");
      expect(ranked[0].id).toBe("nav-billing");
    });

    test("3.7: Special characters and regex symbols in query do not throw errors", () => {
      const items = getNavigationItems(TEST_TENANT);
      expect(() => filterSearchItems(items, "test[a-z]*")).not.toThrow();
      expect(() => filterSearchItems(items, "(overview)")).not.toThrow();
      expect(() => filterSearchItems(items, "branches+facilities?")).not.toThrow();
      expect(() => filterSearchItems(items, "health\\corp")).not.toThrow();
      expect(() => filterSearchItems(items, "^$|.*")).not.toThrow();

      // Parentheses cleaning in matchesSearchTerm allows "(overview)" to match "overview"
      const parenMatch = filterSearchItems(items, "(overview)");
      expect(parenMatch.some((i) => i.id === "nav-overview")).toBe(true);
    });
  });

  // =========================================================================
  // Dimension 4: Deep Linking URLs & Route Navigation
  // =========================================================================
  describe("Dimension 4: Deep Linking URLs and Route Navigation", () => {
    test("4.1: Quick Action items contain correct deep-linking URLs with query parameters", () => {
      const actionItems = getQuickActionItems(TEST_TENANT);

      const expectedLinks: Record<string, string> = {
        "action-create-branch": `/${TEST_TENANT}/dashboard/branches?createBranch=true`,
        "action-provision-clinic": `/${TEST_TENANT}/dashboard/branches?create=clinic`,
        "action-provision-laboratory": `/${TEST_TENANT}/dashboard/branches?create=laboratory`,
        "action-provision-pharmacy": `/${TEST_TENANT}/dashboard/branches?create=pharmacy`,
        "action-invite-staff": `/${TEST_TENANT}/dashboard/team?invite=true`,
      };

      for (const item of actionItems) {
        if (expectedLinks[item.id]) {
          expect(item.url).toBe(expectedLinks[item.id]);
        }
      }
    });

    test("4.2: Navigation items contain exact canonical dashboard routes", () => {
      const navItems = getNavigationItems(TEST_TENANT);

      const expectedRoutes: Record<string, string> = {
        "nav-overview": `/${TEST_TENANT}/dashboard/overview`,
        "nav-branches": `/${TEST_TENANT}/dashboard/branches`,
        "nav-yakap": `/${TEST_TENANT}/dashboard/yakap`,
        "nav-team": `/${TEST_TENANT}/dashboard/team`,
        "nav-network": `/${TEST_TENANT}/dashboard/network`,
        "nav-finance": `/${TEST_TENANT}/dashboard/finance`,
        "nav-settings": `/${TEST_TENANT}/dashboard/settings`,
        "nav-plan": `/${TEST_TENANT}/dashboard/plan`,
        "nav-ownership": `/${TEST_TENANT}/dashboard/ownership`,
        "nav-billing": `/${TEST_TENANT}/dashboard/billing`,
      };

      for (const item of navItems) {
        if (expectedRoutes[item.id]) {
          expect(item.url).toBe(expectedRoutes[item.id]);
        }
      }
    });

    test("4.3: Branch items deep link directly to the branches workstation", () => {
      const branchItems = getBranchItems(mockBranches, TEST_TENANT).filter(
        (i) => i.category === "branches"
      );
      expect(branchItems.length).toBe(3);
      for (const item of branchItems) {
        expect(item.url).toBe(`/${TEST_TENANT}/dashboard/branches`);
      }
    });

    test("4.4: Facility items deep link directly to the branches workstation", () => {
      const facilityItems = getBranchItems(mockBranches, TEST_TENANT).filter(
        (i) => i.category === "facilities"
      );
      expect(facilityItems.length).toBe(4);
      for (const item of facilityItems) {
        expect(item.url).toBe(`/${TEST_TENANT}/dashboard/branches`);
      }
    });

    test("4.5: Team items deep link directly to the team workstation", () => {
      const staffItems = getStaffItems(mockStaff, TEST_TENANT);
      expect(staffItems.length).toBe(4);
      for (const item of staffItems) {
        expect(item.url).toBe(`/${TEST_TENANT}/dashboard/team`);
      }
    });

    test("4.6: Dynamic tenant slug propagation across all contributors", async () => {
      const customTenant = "special-clinic-cebu";
      const customUnreg = registerPortalSearchContributors({
        tenantSlug: customTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      try {
        const results = await universalSearchRegistry.search("overview");
        const customItem = results.find((r) => r.targetRoute.includes(customTenant));
        expect(customItem).toBeDefined();
        expect(customItem?.targetRoute).toBe(`/${customTenant}/dashboard/overview`);
      } finally {
        customUnreg();
      }
    });

    test("4.7: Target routes consistently map to targetRoute field in SearchItem", async () => {
      const results = await universalSearchRegistry.search("prov");
      expect(results.length).toBeGreaterThan(0);
      for (const item of results) {
        expect(item.targetRoute).toBeDefined();
        expect(item.targetRoute.startsWith("/")).toBe(true);
        expect(item.targetRoute).toContain(TEST_TENANT);
      }
    });
  });

  // =========================================================================
  // Dimension 5: High-Density Search & Edge Case Adversarial Hardening
  // =========================================================================
  describe("Dimension 5: High-Density Search & Edge Case Hardening", () => {
    test("5.1: Handles empty or malformed branches and staff arrays gracefully", () => {
      expect(getBranchItems([], TEST_TENANT)).toEqual([]);
      expect(getBranchItems(null as any, TEST_TENANT)).toEqual([]);
      expect(getBranchItems(undefined as any, TEST_TENANT)).toEqual([]);
      expect(getBranchItems([null as any, undefined as any], TEST_TENANT)).toEqual([]);

      expect(getStaffItems([], TEST_TENANT)).toEqual([]);
      expect(getStaffItems(null as any, TEST_TENANT)).toEqual([]);
      expect(getStaffItems(undefined as any, TEST_TENANT)).toEqual([]);
      expect(getStaffItems([null as any, undefined as any], TEST_TENANT)).toEqual([]);
    });

    test("5.2: PhilHealth YAKAP PMCC tag indexing and searchability", async () => {
      // Branch 1 has PMCC-001234, Branch 3 has PMCC-CEB-9988
      const pmccResults = await universalSearchRegistry.search("PMCC-001234");
      expect(pmccResults.length).toBe(1);
      expect(pmccResults[0].id).toBe("branch-bgc");

      const yakapResults = await universalSearchRegistry.search("YAKAP");
      expect(yakapResults.length).toBeGreaterThan(0);
      const ids = yakapResults.map((r) => r.id);
      expect(ids).toContain("nav-yakap");
      expect(ids).toContain("branch-bgc");
      expect(ids).toContain("branch-cebu");
      expect(ids).not.toContain("branch-paranaque"); // Not accredited
    });

    test("5.3: searchPortalUniversal helper works interchangeably with universalSearchRegistry.search", async () => {
      const direct = await universalSearchRegistry.search("laboratory");
      const helper = await searchPortalUniversal("laboratory");

      expect(direct.length).toBe(helper.length);
      expect(direct.map((i) => i.id)).toEqual(helper.map((i) => i.id));
    });
  });
});
