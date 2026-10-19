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
  type SearchItem as RegistrySearchItem,
} from "@shared/safe";
import {
  groupSearchResults,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type SearchItem,
  type SearchCategory,
} from "../src/components/dashboard/WorkspaceSearchDialog";

describe("Milestone 4 Iteration 2: Challenger 2 Empirical Stress Test Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // SUITE 1: onSelect Callback Invocation & Execution Frequency
  // =========================================================================
  describe("Suite 1: onSelect Callback Invocation Exactly Once", () => {
    test("C1.1: External item with onSelect is invoked exactly once upon selection", async () => {
      let callCount = 0;
      const onSelectSpy = () => {
        callCount++;
      };

      const contributorItem: RegistrySearchItem = {
        id: "ext-select-1",
        category: "patients",
        title: "Dela Cruz, Juan",
        subtitle: "MRN-1001",
        targetRoute: "/dashboard/clinic/patients/1001",
        onSelect: onSelectSpy,
      };

      universalSearchRegistry.register({
        id: "contrib-select-1",
        category: "patients",
        categoryLabel: "Clinic Patients",
        search: () => [contributorItem],
      });

      const results = await universalSearchRegistry.search("juan");
      expect(results.length).toBe(1);

      // Map as WorkspaceSearchDialog does
      const mappedItem: SearchItem = {
        id: results[0].id,
        title: results[0].title,
        subtitle: results[0].subtitle,
        category: results[0].category,
        categoryLabel: (results[0] as any).categoryLabel || results[0].category || "General",
        icon: (() => null) as any,
        url: results[0].targetRoute,
        onSelect: results[0].onSelect,
      };

      expect(callCount).toBe(0);

      // Simulate selection execution in handleSelectItem
      let navigatedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        navigatedUrl = item.url;
      };

      handleSelectItem(mappedItem);
      expect(callCount).toBe(1);
      expect(navigatedUrl).toBe("/dashboard/clinic/patients/1001");

      // Verify onSelect is NOT called again on subsequent unrelated actions
      expect(callCount).toBe(1);
    });

    test("C1.2: Selection without onSelect does not crash or throw", async () => {
      const itemWithoutCallback: SearchItem = {
        id: "ext-no-callback",
        title: "Plain Result",
        category: "billing",
        categoryLabel: "Billing",
        url: "/dashboard/billing/invoices/99",
        icon: (() => null) as any,
        onSelect: undefined,
      };

      let navigatedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        navigatedUrl = item.url;
      };

      expect(() => handleSelectItem(itemWithoutCallback)).not.toThrow();
      expect(navigatedUrl).toBe("/dashboard/billing/invoices/99");
    });

    test("C1.3: Sequential selection across multiple distinct items maintains independent single invocation", async () => {
      let item1Calls = 0;
      let item2Calls = 0;
      let item3Calls = 0;

      const item1: SearchItem = {
        id: "seq-1",
        title: "Action 1",
        category: "actions",
        categoryLabel: "Quick Actions",
        url: "/action/1",
        icon: (() => null) as any,
        onSelect: () => { item1Calls++; },
      };

      const item2: SearchItem = {
        id: "seq-2",
        title: "Patient 2",
        category: "patients",
        categoryLabel: "Clinic Patients",
        url: "/patient/2",
        icon: (() => null) as any,
        onSelect: () => { item2Calls++; },
      };

      const item3: SearchItem = {
        id: "seq-3",
        title: "Invoice 3",
        category: "billing",
        categoryLabel: "Billing",
        url: "/invoice/3",
        icon: (() => null) as any,
        onSelect: () => { item3Calls++; },
      };

      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
      };

      // Select item1
      handleSelectItem(item1);
      expect(item1Calls).toBe(1);
      expect(item2Calls).toBe(0);
      expect(item3Calls).toBe(0);

      // Select item2
      handleSelectItem(item2);
      expect(item1Calls).toBe(1);
      expect(item2Calls).toBe(1);
      expect(item3Calls).toBe(0);

      // Select item3
      handleSelectItem(item3);
      expect(item1Calls).toBe(1);
      expect(item2Calls).toBe(1);
      expect(item3Calls).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 2: Navigation Execution & Target Path Handling
  // =========================================================================
  describe("Suite 2: Navigation Execution and Target Path Handling", () => {
    test("C2.1: Navigation dispatches router.push with targetRoute / URL", () => {
      let pushedRoute = "";
      const mockRouter = {
        push: (route: string) => {
          pushedRoute = route;
        },
      };

      const targetPath = "/apex-health/dashboard/clinic/patients/rec-456";
      const item: SearchItem = {
        id: "item-nav",
        title: "Patient Profile",
        category: "patients",
        categoryLabel: "Patients",
        url: targetPath,
        icon: (() => null) as any,
      };

      // Exact handleSelectItem logic
      const handleSelectItem = (itemToSelect: SearchItem) => {
        itemToSelect.onSelect?.();
        mockRouter.push(itemToSelect.url);
      };

      handleSelectItem(item);
      expect(pushedRoute).toBe(targetPath);
    });

    test("C2.2: External item with href fallback evaluation", () => {
      const tenantSlug = "apex-health";
      // Case A: item has standard targetRoute
      const itemWithTargetRoute: any = {
        id: "tr-1",
        title: "With Target Route",
        category: "patients",
        targetRoute: "/dashboard/clinic/patients/123",
      };

      // Case B: item has href property instead of targetRoute
      const itemWithHref: any = {
        id: "href-1",
        title: "With Href Property",
        category: "patients",
        href: "/dashboard/clinic/external-link",
      };

      // Inspect how WorkspaceSearchDialog maps external items (lines 842-860)
      const mappedA: SearchItem = {
        id: itemWithTargetRoute.id,
        title: itemWithTargetRoute.title,
        category: itemWithTargetRoute.category,
        categoryLabel: itemWithTargetRoute.category,
        url: itemWithTargetRoute.targetRoute || itemWithTargetRoute.href || `/${tenantSlug}/dashboard/overview`,
        icon: (() => null) as any,
      };

      const mappedB_CurrentDialogCode: SearchItem = {
        id: itemWithHref.id,
        title: itemWithHref.title,
        category: itemWithHref.category,
        categoryLabel: itemWithHref.category,
        // Lines 849 of WorkspaceSearchDialog.tsx currently does:
        // url: uItem.targetRoute || `/${tenantSlug}/dashboard/overview`,
        url: itemWithHref.targetRoute || `/${tenantSlug}/dashboard/overview`,
        icon: (() => null) as any,
      };

      expect(mappedA.url).toBe("/dashboard/clinic/patients/123");
      // Current dialog code falls back to overview if only href is passed without targetRoute
      expect(mappedB_CurrentDialogCode.url).toBe("/apex-health/dashboard/overview");

      // Verify that if item has targetRoute, navigation proceeds to targetRoute
      expect(mappedA.url).not.toBe(`/${tenantSlug}/dashboard/overview`);
    });

    test("C2.3: Same-route vs new-route focus management flag behavior", () => {
      const currentPath = "/apex-health/dashboard/overview";
      let focusRestorePrevented = false;

      const evaluateRouteTransition = (itemUrl: string, pathname: string) => {
        const isSameRoute = pathname ? itemUrl === pathname : false;
        focusRestorePrevented = !isSameRoute;
      };

      // 1. Same route navigation (should allow focus restore to trigger button)
      evaluateRouteTransition("/apex-health/dashboard/overview", currentPath);
      expect(focusRestorePrevented).toBe(false);

      // 2. Different route navigation (should let destination page manage focus)
      evaluateRouteTransition("/apex-health/dashboard/branches", currentPath);
      expect(focusRestorePrevented).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 3: Category Ordering: Standard Precedes Custom
  // =========================================================================
  describe("Suite 3: Category Ordering - Standard CATEGORY_ORDER Precedes Custom Categories", () => {
    test("C3.1: Standard categories strictly follow CATEGORY_ORDER sequence regardless of input order", () => {
      // Reverse standard categories
      const reverseStandardItems: SearchItem[] = [
        { id: "t1", title: "Team", category: "team", categoryLabel: "Team", url: "/t", icon: () => null },
        { id: "f1", title: "Facility", category: "facilities", categoryLabel: "Fac", url: "/f", icon: () => null },
        { id: "b1", title: "Branch", category: "branches", categoryLabel: "Branch", url: "/b", icon: () => null },
        { id: "n1", title: "Nav", category: "navigation", categoryLabel: "Nav", url: "/n", icon: () => null },
        { id: "a1", title: "Action", category: "actions", categoryLabel: "Act", url: "/a", icon: () => null },
      ];

      const grouped = groupSearchResults(reverseStandardItems);
      const keys = Array.from(grouped.keys());

      // Must be ordered exactly according to CATEGORY_ORDER: actions, navigation, branches, facilities, team
      expect(keys).toEqual(["actions", "navigation", "branches", "facilities", "team"]);
    });

    test("C3.2: Standard categories strictly precede all custom categories across mixed permutations", () => {
      const customCategories = [
        "patients",
        "dental",
        "billing",
        "prescriptions",
        "lab-orders",
        "telemetry",
        "inventory",
      ];

      // Create items mixing standard and custom in alternating order
      const mixedItems: SearchItem[] = [
        { id: "c1", title: "Patient 1", category: "patients", categoryLabel: "Patients", url: "/p", icon: () => null },
        { id: "s1", title: "Nav 1", category: "navigation", categoryLabel: "Navigation", url: "/n", icon: () => null },
        { id: "c2", title: "Dental 1", category: "dental", categoryLabel: "Dental", url: "/d", icon: () => null },
        { id: "s2", title: "Action 1", category: "actions", categoryLabel: "Actions", url: "/a", icon: () => null },
        { id: "c3", title: "Invoice 1", category: "billing", categoryLabel: "Billing", url: "/b", icon: () => null },
        { id: "s3", title: "Branch 1", category: "branches", categoryLabel: "Branches", url: "/br", icon: () => null },
        { id: "c4", title: "Telemetry 1", category: "telemetry", categoryLabel: "Telemetry", url: "/tel", icon: () => null },
      ];

      const grouped = groupSearchResults(mixedItems);
      const resultKeys = Array.from(grouped.keys());

      const standardKeysInResult = resultKeys.filter((k) =>
        (CATEGORY_ORDER as string[]).includes(k)
      );
      const customKeysInResult = resultKeys.filter(
        (k) => !(CATEGORY_ORDER as string[]).includes(k)
      );

      expect(standardKeysInResult).toEqual(["actions", "navigation", "branches"]);
      expect(customKeysInResult).toEqual(["patients", "dental", "billing", "telemetry"]);

      // Verify invariant: the highest standard index in resultKeys is < the lowest custom index in resultKeys
      const maxStandardIndex = Math.max(
        ...standardKeysInResult.map((k) => resultKeys.indexOf(k))
      );
      const minCustomIndex = Math.min(
        ...customKeysInResult.map((k) => resultKeys.indexOf(k))
      );

      expect(maxStandardIndex).toBeLessThan(minCustomIndex);
    });

    test("C3.3: High-volume randomized permutation stress test (100 iterations)", () => {
      const allCategories = [
        "actions",
        "navigation",
        "branches",
        "facilities",
        "team",
        "patients",
        "dental",
        "billing",
        "prescriptions",
        "lab-orders",
        "radiology",
        "immunizations",
        "encounters",
        "diagnostics",
      ];

      for (let iter = 0; iter < 100; iter++) {
        // Shuffle categories
        const shuffled = [...allCategories].sort(() => Math.random() - 0.5);
        const items: SearchItem[] = shuffled.map((cat, idx) => ({
          id: `item-${idx}`,
          title: `Item in ${cat}`,
          category: cat,
          categoryLabel: cat.toUpperCase(),
          url: `/${cat}/${idx}`,
          icon: () => null,
        }));

        const grouped = groupSearchResults(items);
        const keys = Array.from(grouped.keys());

        const standardIndices = keys
          .map((k, idx) => ((CATEGORY_ORDER as string[]).includes(k) ? idx : -1))
          .filter((idx) => idx !== -1);
        const customIndices = keys
          .map((k, idx) => (!(CATEGORY_ORDER as string[]).includes(k) ? idx : -1))
          .filter((idx) => idx !== -1);

        if (standardIndices.length > 0 && customIndices.length > 0) {
          const maxStd = Math.max(...standardIndices);
          const minCust = Math.min(...customIndices);
          expect(maxStd).toBeLessThan(minCust);
        }
      }
    });

    test("C3.4: Contiguous startIndex verification across all dynamic groups", () => {
      const items: SearchItem[] = [
        // 2 action items
        { id: "a1", title: "A1", category: "actions", categoryLabel: "Actions", url: "/a1", icon: () => null },
        { id: "a2", title: "A2", category: "actions", categoryLabel: "Actions", url: "/a2", icon: () => null },
        // 3 patient items
        { id: "p1", title: "P1", category: "patients", categoryLabel: "Patients", url: "/p1", icon: () => null },
        { id: "p2", title: "P2", category: "patients", categoryLabel: "Patients", url: "/p2", icon: () => null },
        { id: "p3", title: "P3", category: "patients", categoryLabel: "Patients", url: "/p3", icon: () => null },
        // 1 dental item
        { id: "d1", title: "D1", category: "dental", categoryLabel: "Dental", url: "/d1", icon: () => null },
        // 2 billing items
        { id: "b1", title: "B1", category: "billing", categoryLabel: "Billing", url: "/b1", icon: () => null },
        { id: "b2", title: "B2", category: "billing", categoryLabel: "Billing", url: "/b2", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      let expectedIndex = 0;

      for (const [cat, data] of grouped.entries()) {
        expect(data.startIndex).toBe(expectedIndex);
        expect(data.items.length).toBeGreaterThan(0);
        expectedIndex += data.items.length;
      }

      expect(expectedIndex).toBe(items.length);
    });

    test("C3.5: Empty visible results returns empty Map with size 0", () => {
      const grouped = groupSearchResults([]);
      expect(grouped.size).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 4: Fallback Category Labeling
  // =========================================================================
  describe("Suite 4: Fallback Category Labeling Verification", () => {
    test("C4.1: Standard category uses predefined CATEGORY_LABELS", () => {
      const items: SearchItem[] = [
        { id: "1", title: "Act", category: "actions", categoryLabel: "", url: "/a", icon: () => null },
        { id: "2", title: "Nav", category: "navigation", categoryLabel: "", url: "/n", icon: () => null },
        { id: "3", title: "Br", category: "branches", categoryLabel: "", url: "/b", icon: () => null },
        { id: "4", title: "Fac", category: "facilities", categoryLabel: "", url: "/f", icon: () => null },
        { id: "5", title: "Tm", category: "team", categoryLabel: "", url: "/t", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      expect(grouped.get("actions")?.label).toBe("Quick Actions");
      expect(grouped.get("navigation")?.label).toBe("Pages & Navigation");
      expect(grouped.get("branches")?.label).toBe("Branches & Locations");
      expect(grouped.get("facilities")?.label).toBe("Facilities");
      expect(grouped.get("team")?.label).toBe("Workspace Team");
    });

    test("C4.2: Custom category with explicit categoryLabel uses custom label", () => {
      const items: SearchItem[] = [
        {
          id: "p1",
          title: "Patient",
          category: "patients",
          categoryLabel: "Clinic Patients Roster",
          url: "/p",
          icon: () => null,
        },
        {
          id: "d1",
          title: "Dental",
          category: "dental",
          categoryLabel: "Dental Charting",
          url: "/d",
          icon: () => null,
        },
      ];

      const grouped = groupSearchResults(items);
      expect(grouped.get("patients")?.label).toBe("Clinic Patients Roster");
      expect(grouped.get("dental")?.label).toBe("Dental Charting");
    });

    test("C4.3: Custom category with omitted or empty categoryLabel produces capitalized fallback (e.g. billing -> Billing)", () => {
      const testCases = [
        { category: "billing", expected: "Billing" },
        { category: "patients", expected: "Patients" },
        { category: "dental", expected: "Dental" },
        { category: "prescriptions", expected: "Prescriptions" },
        { category: "laboratory", expected: "Laboratory" },
      ];

      for (const tc of testCases) {
        // Case 1: categoryLabel is empty string
        const itemEmpty: SearchItem = {
          id: `empty-${tc.category}`,
          title: `Item in ${tc.category}`,
          category: tc.category,
          categoryLabel: "",
          url: `/${tc.category}`,
          icon: () => null,
        };
        const groupedEmpty = groupSearchResults([itemEmpty]);
        expect(groupedEmpty.get(tc.category)?.label).toBe(tc.expected);

        // Case 2: categoryLabel is undefined (omitted)
        const itemOmitted: SearchItem = {
          id: `omitted-${tc.category}`,
          title: `Item in ${tc.category}`,
          category: tc.category,
          categoryLabel: undefined as any,
          url: `/${tc.category}`,
          icon: () => null,
        };
        const groupedOmitted = groupSearchResults([itemOmitted]);
        expect(groupedOmitted.get(tc.category)?.label).toBe(tc.expected);
      }
    });

    test("C4.4: Analysis of WorkspaceSearchDialog line 847 mapping behavior on omitted categoryLabel", async () => {
      // Contributor registers with category 'billing', but SearchResultItemDto from search() has no categoryLabel property
      universalSearchRegistry.register({
        id: "contrib-billing-no-label",
        category: "billing",
        categoryLabel: "Billing Invoices",
        search: () => [
          {
            id: "inv-99",
            category: "billing",
            title: "Invoice #99",
            subtitle: "Unpaid",
            targetRoute: "/dashboard/billing/99",
            // Notice: categoryLabel is omitted on the returned SearchResultItemDto
          },
        ],
      });

      const items = await universalSearchRegistry.search("invoice");
      expect(items.length).toBe(1);
      const uItem = items[0];

      // In WorkspaceSearchDialog.tsx line 847:
      // categoryLabel: (uItem as any).categoryLabel || uItem.category || "General",
      const rawCategoryLabelFromLine847 = (uItem as any).categoryLabel || uItem.category || "General";

      // If (uItem as any).categoryLabel is undefined, it evaluated to uItem.category ('billing' lowercase)
      expect(rawCategoryLabelFromLine847).toBe("billing");

      // Now pass this item into groupSearchResults as WorkspaceSearchDialog does:
      const mappedExternalItem: SearchItem = {
        id: uItem.id,
        title: uItem.title,
        subtitle: uItem.subtitle,
        category: uItem.category,
        categoryLabel: rawCategoryLabelFromLine847,
        url: uItem.targetRoute,
        icon: (() => null) as any,
      };

      const grouped = groupSearchResults([mappedExternalItem]);

      // Because categoryLabel is set to 'billing', groupSearchResults sees itemsInCat[0]?.categoryLabel as 'billing'
      // instead of undefined, so it yields 'billing' (lowercase).
      const actualGroupLabel = grouped.get("billing")?.label;
      expect(actualGroupLabel).toBe("billing");

      // Verify that if categoryLabel is correctly empty or omitted, groupSearchResults yields 'Billing'
      const correctedItem: SearchItem = {
        ...mappedExternalItem,
        categoryLabel: (uItem as any).categoryLabel || "",
      };
      const correctedGrouped = groupSearchResults([correctedItem]);
      expect(correctedGrouped.get("billing")?.label).toBe("Billing");
    });
  });
});
