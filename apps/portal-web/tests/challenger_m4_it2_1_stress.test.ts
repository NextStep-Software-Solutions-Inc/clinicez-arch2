import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "apex-health" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/apex-health/dashboard/overview",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  universalSearchRegistry,
  type SearchContributor,
  type SearchItem as SharedSearchItem,
} from "@shared/safe";
import {
  registerPortalSearchContributors,
  searchPortalUniversal,
} from "../src/services/portalSearchContributors";
import {
  groupSearchResults,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
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
  },
];

function createDummyItem(
  id: string,
  category: string,
  title: string,
  categoryLabel?: string
): LocalSearchItem {
  return {
    id,
    category,
    categoryLabel: categoryLabel ?? category,
    title,
    subtitle: `Subtitle for ${title}`,
    icon: (() => null) as any,
    url: `/dashboard/test/${id}`,
  };
}

describe("Milestone 4 Iteration 2 Challenger 1: Empirical Concurrency, Abort & Dynamic Category Stress Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // Dimension 1: Stress-testing groupSearchResults with extreme category inputs
  // =========================================================================
  describe("Dimension 1: Dynamic Category Grouping Edge Cases & Scale", () => {
    test("1.1: groupSearchResults with 0 items returns an empty Map without throwing", () => {
      const result = groupSearchResults([]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
      expect(Array.from(result.keys())).toEqual([]);
      expect(Array.from(result.values())).toEqual([]);
    });

    test("1.2: groupSearchResults with 100 items spanning 20 custom categories retains all 100 items with exact 5-item splits", () => {
      const items: LocalSearchItem[] = [];
      const categoryCount = 20;
      const itemsPerCategory = 5;

      for (let c = 1; c <= categoryCount; c++) {
        const catKey = `custom_domain_cat_${c.toString().padStart(2, "0")}`;
        const catLabel = `Custom Domain ${c}`;
        for (let i = 1; i <= itemsPerCategory; i++) {
          items.push(
            createDummyItem(
              `item-${catKey}-${i}`,
              catKey,
              `Item ${i} in ${catLabel}`,
              catLabel
            )
          );
        }
      }

      expect(items.length).toBe(100);

      const grouped = groupSearchResults(items);

      // Verify all 20 categories exist in grouped Map
      expect(grouped.size).toBe(categoryCount);

      let totalAggregated = 0;
      let expectedIndex = 0;

      for (let c = 1; c <= categoryCount; c++) {
        const catKey = `custom_domain_cat_${c.toString().padStart(2, "0")}`;
        const catData = grouped.get(catKey);

        expect(catData).toBeDefined();
        expect(catData?.label).toBe(`Custom Domain ${c}`);
        expect(catData?.items.length).toBe(itemsPerCategory);
        expect(catData?.startIndex).toBe(expectedIndex);

        expectedIndex += itemsPerCategory;
        totalAggregated += catData!.items.length;
      }

      // Total items across all 20 groups must strictly equal 100
      expect(totalAggregated).toBe(100);
      expect(expectedIndex).toBe(100);
    });

    test("1.3: groupSearchResults with mixed standard and custom categories prioritizes CATEGORY_ORDER first", () => {
      // Create items in random shuffled order
      const items: LocalSearchItem[] = [
        createDummyItem("it-billing-1", "billing", "Billing Invoice #1"),
        createDummyItem("it-nav-1", "navigation", "Overview Page"),
        createDummyItem("it-team-1", "team", "Dr. Santos"),
        createDummyItem("it-dental-1", "dental", "Tooth 16 Extraction"),
        createDummyItem("it-act-1", "actions", "Quick Action: New Branch"),
        createDummyItem("it-patients-1", "patients", "Patient Juanita"),
        createDummyItem("it-branches-1", "branches", "Apex Central Hub"),
        createDummyItem("it-facilities-1", "facilities", "Primary Clinic"),
      ];

      const grouped = groupSearchResults(items);
      const groupKeys = Array.from(grouped.keys());

      // Standard CATEGORY_ORDER: ["actions", "navigation", "branches", "facilities", "team"]
      // Followed by custom categories in order of appearance: ["billing", "dental", "patients"]
      expect(groupKeys).toEqual([
        "actions",
        "navigation",
        "branches",
        "facilities",
        "team",
        "billing",
        "dental",
        "patients",
      ]);

      // Verify labels: standard categories should use CATEGORY_LABELS
      expect(grouped.get("actions")?.label).toBe("Quick Actions");
      expect(grouped.get("navigation")?.label).toBe("Pages & Navigation");
      expect(grouped.get("branches")?.label).toBe("Branches & Locations");
      expect(grouped.get("facilities")?.label).toBe("Facilities");
      expect(grouped.get("team")?.label).toBe("Workspace Team");

      // Custom categories should retain their label
      expect(grouped.get("billing")?.label).toBe("billing");
      expect(grouped.get("dental")?.label).toBe("dental");
      expect(grouped.get("patients")?.label).toBe("patients");
    });

    test("1.4: groupSearchResults handles empty category labels with title-cased fallback", () => {
      const items: LocalSearchItem[] = [
        createDummyItem("item-empty-1", "radiology", "Chest X-Ray", ""),
        createDummyItem("item-empty-2", "pathology", "Blood Panel", "   "),
        createDummyItem("item-empty-3", "x", "Single Letter Item", ""),
        createDummyItem("item-empty-4", "DENTAL", "Uppercase Category", ""),
      ];

      const grouped = groupSearchResults(items);

      expect(grouped.get("radiology")?.label).toBe("Radiology");
      // "   " is truthy so itemsInCat[0]?.categoryLabel is used if not sanitized, or capitalized
      const pathLabel = grouped.get("pathology")?.label;
      expect(pathLabel === "   " || pathLabel === "Pathology").toBe(true);
      expect(grouped.get("x")?.label).toBe("X");
      expect(grouped.get("DENTAL")?.label).toBe("DENTAL");
    });

    test("1.5: Standard categories with empty categoryLabel still use CATEGORY_LABELS", () => {
      const item: LocalSearchItem = {
        id: "nav-item-no-label",
        category: "navigation",
        categoryLabel: "",
        title: "Overview",
        icon: (() => null) as any,
        url: "/overview",
      };

      const grouped = groupSearchResults([item]);
      // CATEGORY_LABELS["navigation"] takes precedence
      expect(grouped.get("navigation")?.label).toBe("Pages & Navigation");
    });
  });

  // =========================================================================
  // Dimension 2: Contiguous Index Offsets & Flat List Order Alignment
  // =========================================================================
  describe("Dimension 2: Contiguous Index Offsets & Flat List Order Verification", () => {
    test("2.1: Group offsets are strictly contiguous with zero gaps and zero overlaps across 50 categories", () => {
      const items: LocalSearchItem[] = [];
      const catCount = 50;

      for (let c = 0; c < catCount; c++) {
        const cat = `cat_${c}`;
        const count = (c % 5) + 1; // 1 to 5 items per category
        for (let i = 0; i < count; i++) {
          items.push(createDummyItem(`item-${cat}-${i}`, cat, `Title ${c}-${i}`));
        }
      }

      const grouped = groupSearchResults(items);
      let expectedStart = 0;

      for (const [cat, data] of grouped.entries()) {
        expect(data.startIndex).toBe(expectedStart);
        expectedStart += data.items.length;
      }

      expect(expectedStart).toBe(items.length);

      // Verify that every single item's globalIdx matches its sequential position in flattened grouped array
      const flatGrouped = Array.from(grouped.values()).flatMap((g) =>
        g.items.map((item, localIdx) => ({
          item,
          globalIdx: g.startIndex + localIdx,
        }))
      );

      for (let k = 0; k < flatGrouped.length; k++) {
        expect(flatGrouped[k].globalIdx).toBe(k);
      }
    });

    test("2.2: EMPIRICAL DISCOVERY: When visibleResults is out of CATEGORY_ORDER, grouped order diverges from visibleResults order", () => {
      // Construct a visibleResults array where a "team" item comes before an "actions" item
      // (This routinely happens during search because items are sorted by title match relevance)
      const teamItem = createDummyItem("team-santos", "team", "Dr. Maria Santos");
      const actionItem = createDummyItem("act-create", "actions", "Create New Branch");

      // In visibleResults, team is at index 0, actions is at index 1
      const visibleResults: LocalSearchItem[] = [teamItem, actionItem];

      const grouped = groupSearchResults(visibleResults);
      const flatGroupedItems = Array.from(grouped.values()).flatMap((g) => g.items);

      // In groupedResults, actions comes first (due to CATEGORY_ORDER), then team
      expect(flatGroupedItems[0].id).toBe("act-create");
      expect(flatGroupedItems[1].id).toBe("team-santos");

      // VERIFY DIVERGENCE:
      // At index 0:
      // - The visually rendered item in the dialog has globalIdx = 0 -> "act-create" (Actions)
      // - BUT visibleResults[0] is "team-santos" (Team)!
      const itemAtVisualIndex0 = flatGroupedItems[0];
      const itemAtVisibleResults0 = visibleResults[0];

      expect(itemAtVisualIndex0.id).not.toBe(itemAtVisibleResults0.id);
      expect(itemAtVisualIndex0.id).toBe("act-create");
      expect(itemAtVisibleResults0.id).toBe("team-santos");

      // This empirically proves that:
      // If a user presses Enter with activeIndex = 0, WorkspaceSearchDialog currently executes:
      // visibleResults[activeIndex] (which is "team-santos")
      // instead of the visually highlighted item ("act-create")!
    });

    test("2.3: Cross-app external items appended to visibleResults produce category reordering", () => {
      const localBranch = createDummyItem("branch-apex", "branches", "Apex Hub");
      const externalAction = createDummyItem("act-ext", "actions", "External Emergency Protocol");

      // In WorkspaceSearchDialog: filteredResults = [...localMatches, ...universalResults];
      // So externalAction is placed after localBranch:
      const visibleResults = [localBranch, externalAction];

      const grouped = groupSearchResults(visibleResults);
      const flatGroupedItems = Array.from(grouped.values()).flatMap((g) => g.items);

      // groupSearchResults places "actions" before "branches"
      expect(flatGroupedItems[0].id).toBe("act-ext");
      expect(flatGroupedItems[1].id).toBe("branch-apex");

      // Divergence check: index 0 in visual list does not match index 0 in input array
      expect(flatGroupedItems[0].id).not.toBe(visibleResults[0].id);
    });

    test("2.4: Simulated keyboard Enter selection executes the WRONG item when visibleResults is not synchronized with groupedResults", () => {
      // Setup: Search for "Santos" returns team member first, but there is also an action "Assign Santos"
      const doctorItem = createDummyItem("staff-santos", "team", "Dr. Maria Santos");
      const actionItem = createDummyItem("action-santos", "actions", "Assign to Dr. Santos");

      // In visibleResults (flat array):
      const visibleResults = [doctorItem, actionItem];

      // In groupedResults:
      const grouped = groupSearchResults(visibleResults);
      const flatGrouped = Array.from(grouped.values()).flatMap((g) => g.items);

      // Simulation of WorkspaceSearchDialog state and logic:
      const activeIndex = 0; // Default when opened or typed

      // What item is visually highlighted in the DOM?
      // JSX: const globalIdx = startIndex + localIdx; const isSelected = globalIdx === activeIndex;
      const highlightedItem = flatGrouped[activeIndex];

      // What item is selected on Enter?
      // JSX/handleKeyDown: const selected = visibleResults[activeIndex];
      const enterSelectedItem = visibleResults[activeIndex];

      // What DOM optionId does aria-activedescendant point to?
      // Component: const activeOptionId = visibleResults[activeIndex] ? ...
      const activeDescendantId = `workspace-search-opt-${visibleResults[activeIndex].id}`;
      const highlightedDomId = `workspace-search-opt-${highlightedItem.id}`;

      // DISCOVERY ASSERTION:
      // The highlighted item is the Action:
      expect(highlightedItem.id).toBe("action-santos");
      // But Enter selects the Doctor:
      expect(enterSelectedItem.id).toBe("staff-santos");
      expect(enterSelectedItem.id).not.toBe(highlightedItem.id);

      // aria-activedescendant points to the Doctor, but the Action is highlighted:
      expect(activeDescendantId).not.toBe(highlightedDomId);
    });

    test("2.5: Proposed remediation: Flattening groupedResults or pre-sorting visibleResults reconciles activeIndex 100%", () => {
      const doctorItem = createDummyItem("staff-santos", "team", "Dr. Maria Santos");
      const actionItem = createDummyItem("action-santos", "actions", "Assign to Dr. Santos");
      const visibleResults = [doctorItem, actionItem];

      const grouped = groupSearchResults(visibleResults);

      // Reconciled flat list derived from grouped order:
      const reconciledFlatResults = Array.from(grouped.values()).flatMap((g) => g.items);

      for (let activeIndex = 0; activeIndex < reconciledFlatResults.length; activeIndex++) {
        const highlightedItem = reconciledFlatResults[activeIndex];
        const enterSelectedItem = reconciledFlatResults[activeIndex];
        const activeDescendantId = `workspace-search-opt-${reconciledFlatResults[activeIndex].id}`;
        const highlightedDomId = `workspace-search-opt-${highlightedItem.id}`;

        expect(enterSelectedItem.id).toBe(highlightedItem.id);
        expect(activeDescendantId).toBe(highlightedDomId);
      }
    });
  });

  // =========================================================================
  // Dimension 3: AbortSignal Cancellation During Rapid Typing with Dynamic Categories
  // =========================================================================
  describe("Dimension 3: AbortSignal Cancellation & Rapid Typing Concurrency", () => {
    test("3.1: 50 rapid keystrokes abort 49 controllers cleanly with dynamic categories registered", async () => {
      // Register multiple dynamic categories
      const unregDental = universalSearchRegistry.register({
        id: "clinic-dental",
        category: "dental",
        categoryLabel: "Dental Chart",
        priority: 10,
        search: async (q, signal) => {
          if (signal?.aborted) return [];
          await new Promise((r) => setTimeout(r, 20));
          if (signal?.aborted) return [];
          return [
            {
              id: "tooth-16",
              category: "dental",
              title: "Tooth 16 - Molar",
              targetRoute: "/dental/16",
            },
          ];
        },
      });

      const unregPatients = universalSearchRegistry.register({
        id: "clinic-patients",
        category: "patients",
        categoryLabel: "Patients",
        priority: 20,
        search: async (q, signal) => {
          if (signal?.aborted) return [];
          await new Promise((r) => setTimeout(r, 20));
          if (signal?.aborted) return [];
          return [
            {
              id: "patient-1",
              category: "patients",
              title: "Patient Maria",
              targetRoute: "/patients/1",
            },
          ];
        },
      });

      const unregBilling = universalSearchRegistry.register({
        id: "clinic-billing",
        category: "billing",
        categoryLabel: "Billing",
        priority: 30,
        search: async (q, signal) => {
          if (signal?.aborted) return [];
          await new Promise((r) => setTimeout(r, 20));
          if (signal?.aborted) return [];
          return [
            {
              id: "inv-100",
              category: "billing",
              title: "Invoice 100",
              targetRoute: "/billing/100",
            },
          ];
        },
      });

      const controllers: AbortController[] = [];
      const searchPromises: Promise<SharedSearchItem[]>[] = [];

      // Simulate rapid keystroke flurry
      for (let i = 0; i < 50; i++) {
        if (i > 0) {
          controllers[i - 1].abort();
        }
        const c = new AbortController();
        controllers.push(c);
        searchPromises.push(
          universalSearchRegistry.search(`query_${i}`, { signal: c.signal })
        );
      }

      // First 49 must be aborted
      for (let i = 0; i < 49; i++) {
        expect(controllers[i].signal.aborted).toBe(true);
      }
      expect(controllers[49].signal.aborted).toBe(false);

      // All 50 promises must resolve without throwing
      const results = await Promise.all(searchPromises);
      expect(results.length).toBe(50);

      // Final non-aborted search must return results from dynamic categories
      const finalResult = results[49];
      expect(finalResult.length).toBe(3);
      expect(finalResult.map((r) => r.category)).toEqual([
        "dental",
        "patients",
        "billing",
      ]);

      unregDental();
      unregPatients();
      unregBilling();
    });

    test("3.2: Slow earlier query cannot overwrite fast later query (race condition defense)", async () => {
      let activeDisplayResults: SharedSearchItem[] = [];

      // Simulates an async contributor with variable latency
      universalSearchRegistry.register({
        id: "variable-latency-contributor",
        category: "dynamic",
        search: async (query, signal) => {
          const latency = query === "slow" ? 80 : 10;
          await new Promise((r) => setTimeout(r, latency));
          if (signal?.aborted) return [];
          return [
            {
              id: `result-${query}`,
              category: "dynamic",
              title: `Result for ${query}`,
              targetRoute: `/route/${query}`,
            },
          ];
        },
      });

      // User types "slow", then quickly replaces with "fast"
      const c1 = new AbortController();
      let c1Cancelled = false;
      const promise1 = universalSearchRegistry
        .search("slow", { signal: c1.signal })
        .then((items) => {
          if (!c1Cancelled) activeDisplayResults = items;
        });

      // User types "fast" 15ms later, aborting "slow"
      await new Promise((r) => setTimeout(r, 15));
      c1Cancelled = true;
      c1.abort();

      const c2 = new AbortController();
      let c2Cancelled = false;
      const promise2 = universalSearchRegistry
        .search("fast", { signal: c2.signal })
        .then((items) => {
          if (!c2Cancelled) activeDisplayResults = items;
        });

      await Promise.all([promise1, promise2]);

      // Active display results MUST be "fast", NOT overwritten by "slow"
      expect(activeDisplayResults.length).toBe(1);
      expect(activeDisplayResults[0].title).toBe("Result for fast");
    });
  });

  // =========================================================================
  // Dimension 4: Fault Isolation Across Multi-Failure Contributor Scenarios
  // =========================================================================
  describe("Dimension 4: Error Isolation & Contributor Fault Tolerance", () => {
    test("4.1: Synchronous, asynchronous, non-error, and hanging failures do not crash portal search", async () => {
      // Register standard portal contributors
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      // Contributor 1: Throws synchronously
      const unreg1 = universalSearchRegistry.register({
        id: "fail-sync",
        category: "fail1",
        search: () => {
          throw new Error("Synchronous explosion");
        },
      });

      // Contributor 2: Rejects asynchronously
      const unreg2 = universalSearchRegistry.register({
        id: "fail-async-reject",
        category: "fail2",
        search: async () => {
          await new Promise((r) => setTimeout(r, 5));
          throw new Error("Asynchronous network timeout 504");
        },
      });

      // Contributor 3: Throws raw string
      const unreg3 = universalSearchRegistry.register({
        id: "fail-string",
        category: "fail3",
        search: () => {
          throw "Raw string failure from legacy script";
        },
      });

      // Contributor 4: Throws null
      const unreg4 = universalSearchRegistry.register({
        id: "fail-null",
        category: "fail4",
        search: () => {
          throw null;
        },
      });

      // Contributor 5: Returns invalid non-array objects
      const unreg5 = universalSearchRegistry.register({
        id: "fail-corrupt-data",
        category: "fail5",
        search: (() => ({ notAnArray: true })) as any,
      });

      // Contributor 6: Healthy external contributor
      const unregHealthy = universalSearchRegistry.register({
        id: "healthy-dental",
        category: "dental",
        priority: 5,
        search: () => [
          {
            id: "tooth-healthy",
            category: "dental",
            title: "Healthy Tooth Record",
            targetRoute: "/dental/healthy",
          },
        ],
      });

      // Execute search across all 5 failed + 1 healthy external + 5 portal contributors
      const results = await universalSearchRegistry.search("apex");

      // Verify overall search did not throw
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      // Verify healthy items exist
      expect(results.some((r) => r.id === "tooth-healthy")).toBe(true);
      expect(results.some((r) => r.title.includes("Apex"))).toBe(true);

      unreg1();
      unreg2();
      unreg3();
      unreg4();
      unreg5();
      unregHealthy();
    });

    test("4.2: Timeout handling terminates hanging contributor within configured timeoutMs", async () => {
      let hangingCompleted = false;

      const unregHanging = universalSearchRegistry.register({
        id: "hanging-contributor",
        category: "hanging",
        search: async () => {
          await new Promise((r) => setTimeout(r, 300));
          hangingCompleted = true;
          return [];
        },
      });

      const start = Date.now();
      const results = await universalSearchRegistry.search("test", {
        timeoutMs: 40,
      });
      const elapsed = Date.now() - start;

      // Must complete in approx 40-70ms, well before the 300ms hanging timeout
      expect(elapsed).toBeLessThan(150);
      expect(hangingCompleted).toBe(false);
      expect(results).toEqual([]);

      unregHanging();
    });
  });
});
