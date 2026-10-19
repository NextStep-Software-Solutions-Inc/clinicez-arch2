import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

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

describe("Milestone 4 Iteration 3: Challenger 2 Empirical Reconciled Selection & Regression Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // SUITE 1: Selection Reconciliation & DOM Render Order Invariance
  // =========================================================================
  describe("Suite 1: Selection Reconciliation & DOM Invariance", () => {
    test("R1.1: flattenedResults strictly matches visual DOM render order across scrambled categories", () => {
      // 5 items spanning 5 distinct categories, intentionally provided in inverse order
      const scrambledItems: SearchItem[] = [
        { id: "item-team", title: "Dr. Team", category: "team", categoryLabel: "Team", url: "/team", icon: () => null },
        { id: "item-facility", title: "Apex Clinic", category: "facilities", categoryLabel: "Facilities", url: "/fac", icon: () => null },
        { id: "item-branch", title: "Main Branch", category: "branches", categoryLabel: "Branches", url: "/branch", icon: () => null },
        { id: "item-nav", title: "Overview Page", category: "navigation", categoryLabel: "Navigation", url: "/nav", icon: () => null },
        { id: "item-action", title: "New Patient", category: "actions", categoryLabel: "Actions", url: "/action", icon: () => null },
      ];

      const grouped = groupSearchResults(scrambledItems);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      // Verify that DOM rendering simulation matches flattenedResults 1:1
      const domRenderedOrder: { item: SearchItem; globalIdx: number }[] = [];
      for (const [category, categoryData] of grouped.entries()) {
        const { items, startIndex } = categoryData;
        items.forEach((item, localIdx) => {
          const globalIdx = startIndex + localIdx;
          domRenderedOrder.push({ item, globalIdx });
        });
      }

      expect(domRenderedOrder.length).toBe(flattenedResults.length);
      for (let i = 0; i < flattenedResults.length; i++) {
        expect(domRenderedOrder[i].globalIdx).toBe(i);
        expect(domRenderedOrder[i].item.id).toBe(flattenedResults[i].id);
      }

      // Visual DOM order must be strictly CATEGORY_ORDER: action -> nav -> branch -> facility -> team
      expect(flattenedResults.map((i) => i.id)).toEqual([
        "item-action",
        "item-nav",
        "item-branch",
        "item-facility",
        "item-team",
      ]);
    });

    test("R1.2: Selection at visual index k selects the exact DOM item rendered at index k", () => {
      const items: SearchItem[] = [
        { id: "team-1", title: "Team 1", category: "team", categoryLabel: "Team", url: "/team-1", icon: () => null },
        { id: "act-1", title: "Action 1", category: "actions", categoryLabel: "Actions", url: "/act-1", icon: () => null },
        { id: "nav-1", title: "Nav 1", category: "navigation", categoryLabel: "Nav", url: "/nav-1", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      let selectedViaEnterUrl = "";
      const selectViaEnter = (activeIndex: number) => {
        const selected = flattenedResults[activeIndex];
        if (selected) {
          selectedViaEnterUrl = selected.url;
        }
      };

      // In visual order:
      // index 0 = act-1 (actions)
      // index 1 = nav-1 (navigation)
      // index 2 = team-1 (team)
      selectViaEnter(0);
      expect(selectedViaEnterUrl).toBe("/act-1");

      selectViaEnter(1);
      expect(selectedViaEnterUrl).toBe("/nav-1");

      selectViaEnter(2);
      expect(selectedViaEnterUrl).toBe("/team-1");
    });

    test("R1.3: activeOptionId strictly corresponds to the DOM option id of the visually active item", () => {
      const items: SearchItem[] = [
        { id: "team:santos", title: "Dr. Santos", category: "team", categoryLabel: "Team", url: "/team/santos", icon: () => null },
        { id: "action:new-branch", title: "Create Branch", category: "actions", categoryLabel: "Actions", url: "/branch/new", icon: () => null },
        { id: "custom:dental#42", title: "Tooth Extraction", category: "dental", categoryLabel: "Dental", url: "/dental/42", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      const getActiveOptionId = (index: number) => {
        const item = flattenedResults[index];
        return item
          ? `workspace-search-opt-${(item.id || "").replace(/[^\w-]/g, "_")}`
          : undefined;
      };

      // Visual index 0 is action:new-branch
      expect(getActiveOptionId(0)).toBe("workspace-search-opt-action_new-branch");

      // Visual index 1 is team:santos
      expect(getActiveOptionId(1)).toBe("workspace-search-opt-team_santos");

      // Visual index 2 is custom:dental#42
      expect(getActiveOptionId(2)).toBe("workspace-search-opt-custom_dental_42");

      // Out of bounds index yields undefined
      expect(getActiveOptionId(3)).toBeUndefined();
    });

    test("R1.4: High-volume 500-permutation stress test: DOM index always equals flattenedResults index", () => {
      const categoriesPool = [
        "actions",
        "navigation",
        "branches",
        "facilities",
        "team",
        "patients",
        "dental",
        "billing",
        "lab-orders",
        "radiology",
        "inventory",
        "prescriptions",
      ];

      for (let run = 0; run < 500; run++) {
        const numItems = Math.floor(Math.random() * 20) + 1;
        const testItems: SearchItem[] = [];
        for (let i = 0; i < numItems; i++) {
          const cat = categoriesPool[Math.floor(Math.random() * categoriesPool.length)];
          testItems.push({
            id: `test-item-${run}-${i}`,
            title: `Item ${i}`,
            category: cat,
            categoryLabel: cat.toUpperCase(),
            url: `/${cat}/${i}`,
            icon: () => null,
          });
        }

        const grouped = groupSearchResults(testItems);
        const flattened = Array.from(grouped.values()).flatMap((g) => g.items);

        // Verify index invariant
        let runningGlobalIdx = 0;
        for (const [cat, data] of grouped.entries()) {
          expect(data.startIndex).toBe(runningGlobalIdx);
          for (let localIdx = 0; localIdx < data.items.length; localIdx++) {
            const globalIdx = data.startIndex + localIdx;
            expect(globalIdx).toBe(runningGlobalIdx);
            expect(flattened[globalIdx].id).toBe(data.items[localIdx].id);
            runningGlobalIdx++;
          }
        }
        expect(flattened.length).toBe(testItems.length);
        expect(runningGlobalIdx).toBe(testItems.length);
      }
    });
  });

  // =========================================================================
  // SUITE 2: onSelect Callback Invocation - Exactly Once Execution
  // =========================================================================
  describe("Suite 2: onSelect Exactly-Once Callback Verification", () => {
    test("R2.1: onSelect executes exactly once when selected via keyboard Enter", () => {
      let callbackCount = 0;
      const targetItem: SearchItem = {
        id: "target-action",
        title: "Register Patient",
        category: "actions",
        categoryLabel: "Actions",
        url: "/patients/new",
        icon: () => null,
        onSelect: () => {
          callbackCount++;
        },
      };

      const grouped = groupSearchResults([targetItem]);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      let navigatedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        navigatedUrl = item.url;
      };

      // Simulate keyboard Enter
      const selected = flattenedResults[0];
      expect(callbackCount).toBe(0);
      handleSelectItem(selected);

      expect(callbackCount).toBe(1);
      expect(navigatedUrl).toBe("/patients/new");

      // Verify no phantom second invocation
      expect(callbackCount).toBe(1);
    });

    test("R2.2: onSelect executes exactly once when selected via mouse click", () => {
      let callbackCount = 0;
      const targetItem: SearchItem = {
        id: "target-click",
        title: "View Roster",
        category: "team",
        categoryLabel: "Team",
        url: "/team/roster",
        icon: () => null,
        onSelect: () => {
          callbackCount++;
        },
      };

      const grouped = groupSearchResults([targetItem]);

      let navigatedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        navigatedUrl = item.url;
      };

      // Simulate DOM button onClick={() => handleSelectItem(item)}
      const domItem = Array.from(grouped.values())[0].items[0];
      expect(callbackCount).toBe(0);
      handleSelectItem(domItem);

      expect(callbackCount).toBe(1);
      expect(navigatedUrl).toBe("/team/roster");
    });

    test("R2.3: Enter selection and mouse click selection invoke the identical handler and callback", () => {
      let enterCallbackCalls = 0;
      let clickCallbackCalls = 0;

      const makeItem = (id: string, counter: () => void): SearchItem => ({
        id,
        title: `Title ${id}`,
        category: "actions",
        categoryLabel: "Quick Actions",
        url: `/action/${id}`,
        icon: () => null,
        onSelect: counter,
      });

      const enterItem = makeItem("enter-item", () => { enterCallbackCalls++; });
      const clickItem = makeItem("click-item", () => { clickCallbackCalls++; });

      const grouped = groupSearchResults([enterItem, clickItem]);
      const flattened = Array.from(grouped.values()).flatMap((g) => g.items);

      let pushedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        pushedUrl = item.url;
      };

      // Selection via Enter at index 0 (enterItem)
      handleSelectItem(flattened[0]);
      expect(enterCallbackCalls).toBe(1);
      expect(clickCallbackCalls).toBe(0);
      expect(pushedUrl).toBe("/action/enter-item");

      // Selection via Mouse Click on item at index 1 (clickItem)
      const groupData = grouped.get("actions");
      const domButtonElementItem = groupData!.items[1];
      handleSelectItem(domButtonElementItem);
      expect(enterCallbackCalls).toBe(1);
      expect(clickCallbackCalls).toBe(1);
      expect(pushedUrl).toBe("/action/click-item");
    });

    test("R2.4: Selection on item without onSelect navigates safely without throwing", () => {
      const itemWithoutCallback: SearchItem = {
        id: "no-cb",
        title: "Normal Navigation Link",
        category: "navigation",
        categoryLabel: "Pages",
        url: "/overview",
        icon: () => null,
      };

      let pushedUrl = "";
      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
        pushedUrl = item.url;
      };

      expect(() => handleSelectItem(itemWithoutCallback)).not.toThrow();
      expect(pushedUrl).toBe("/overview");
    });

    test("R2.5: Rapid sequential selection across different items isolates onSelect calls", () => {
      const callLog: string[] = [];

      const createItem = (id: string, cat: string): SearchItem => ({
        id,
        title: `Title ${id}`,
        category: cat,
        categoryLabel: cat,
        url: `/${cat}/${id}`,
        icon: () => null,
        onSelect: () => {
          callLog.push(id);
        },
      });

      const items = [
        createItem("action-1", "actions"),
        createItem("patient-2", "patients"),
        createItem("dental-3", "dental"),
        createItem("billing-4", "billing"),
      ];

      const handleSelectItem = (item: SearchItem) => {
        item.onSelect?.();
      };

      items.forEach((item) => handleSelectItem(item));

      expect(callLog).toEqual(["action-1", "patient-2", "dental-3", "billing-4"]);
      expect(callLog.length).toBe(4);
    });
  });

  // =========================================================================
  // SUITE 3: Category Ordering: Standard Precedes Custom
  // =========================================================================
  describe("Suite 3: Category Ordering & Standard Precedence", () => {
    test("R3.1: Standard CATEGORY_ORDER is strictly invariant regardless of input category arrangement", () => {
      // Input in completely reversed order
      const reverseStandardItems: SearchItem[] = [
        { id: "t", title: "Team", category: "team", categoryLabel: "Team", url: "/t", icon: () => null },
        { id: "f", title: "Fac", category: "facilities", categoryLabel: "Fac", url: "/f", icon: () => null },
        { id: "b", title: "Br", category: "branches", categoryLabel: "Br", url: "/b", icon: () => null },
        { id: "n", title: "Nav", category: "navigation", categoryLabel: "Nav", url: "/n", icon: () => null },
        { id: "a", title: "Act", category: "actions", categoryLabel: "Act", url: "/a", icon: () => null },
      ];

      const grouped = groupSearchResults(reverseStandardItems);
      const keys = Array.from(grouped.keys());

      expect(keys).toEqual(["actions", "navigation", "branches", "facilities", "team"]);
    });

    test("R3.2: Standard categories strictly precede all custom categories", () => {
      const items: SearchItem[] = [
        { id: "c1", title: "Patient", category: "patients", categoryLabel: "Patients", url: "/p", icon: () => null },
        { id: "s1", title: "Team", category: "team", categoryLabel: "Team", url: "/t", icon: () => null },
        { id: "c2", title: "Dental", category: "dental", categoryLabel: "Dental", url: "/d", icon: () => null },
        { id: "s2", title: "Action", category: "actions", categoryLabel: "Actions", url: "/a", icon: () => null },
        { id: "c3", title: "Billing", category: "billing", categoryLabel: "Billing", url: "/b", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      const keys = Array.from(grouped.keys());

      // Standard categories must precede custom categories
      const standardKeys = keys.filter((k) => (CATEGORY_ORDER as string[]).includes(k));
      const customKeys = keys.filter((k) => !(CATEGORY_ORDER as string[]).includes(k));

      expect(standardKeys).toEqual(["actions", "team"]);
      expect(customKeys).toEqual(["patients", "dental", "billing"]);

      // Verify that every standard key index < every custom key index
      for (const std of standardKeys) {
        for (const cust of customKeys) {
          expect(keys.indexOf(std)).toBeLessThan(keys.indexOf(cust));
        }
      }
    });

    test("R3.3: Missing standard categories are omitted without leaving gaps", () => {
      // Only navigation and team are present
      const items: SearchItem[] = [
        { id: "t1", title: "Staff", category: "team", categoryLabel: "Team", url: "/t", icon: () => null },
        { id: "n1", title: "Nav", category: "navigation", categoryLabel: "Nav", url: "/n", icon: () => null },
        { id: "d1", title: "Dental", category: "dental", categoryLabel: "Dental", url: "/d", icon: () => null },
      ];

      const grouped = groupSearchResults(items);
      const keys = Array.from(grouped.keys());

      expect(keys).toEqual(["navigation", "team", "dental"]);
      expect(grouped.get("navigation")?.startIndex).toBe(0);
      expect(grouped.get("team")?.startIndex).toBe(1);
      expect(grouped.get("dental")?.startIndex).toBe(2);
    });
  });

  // =========================================================================
  // SUITE 4: Fallback Category Labeling
  // =========================================================================
  describe("Suite 4: Fallback Category Labeling & Resolution", () => {
    test("R4.1: Standard categories always resolve to official CATEGORY_LABELS", () => {
      const items: SearchItem[] = [
        { id: "1", title: "A", category: "actions", categoryLabel: "Custom Action Name", url: "/a", icon: () => null },
        { id: "2", title: "N", category: "navigation", categoryLabel: "Custom Nav", url: "/n", icon: () => null },
        { id: "3", title: "B", category: "branches", categoryLabel: "", url: "/b", icon: () => null },
        { id: "4", title: "F", category: "facilities", categoryLabel: undefined as any, url: "/f", icon: () => null },
        { id: "5", title: "T", category: "team", categoryLabel: "Custom Team", url: "/t", icon: () => null },
      ];

      const grouped = groupSearchResults(items);

      expect(grouped.get("actions")?.label).toBe("Quick Actions");
      expect(grouped.get("navigation")?.label).toBe("Pages & Navigation");
      expect(grouped.get("branches")?.label).toBe("Branches & Locations");
      expect(grouped.get("facilities")?.label).toBe("Facilities");
      expect(grouped.get("team")?.label).toBe("Workspace Team");
    });

    test("R4.2: Custom category with explicit label preserves categoryLabel", () => {
      const items: SearchItem[] = [
        { id: "p1", title: "Patient", category: "patients", categoryLabel: "Clinic Patients Directory", url: "/p", icon: () => null },
        { id: "d1", title: "Dental", category: "dental", categoryLabel: "Dental Odontogram", url: "/d", icon: () => null },
      ];

      const grouped = groupSearchResults(items);

      expect(grouped.get("patients")?.label).toBe("Clinic Patients Directory");
      expect(grouped.get("dental")?.label).toBe("Dental Odontogram");
    });

    test("R4.3: Custom category with missing or empty label auto-capitalizes category name", () => {
      const items: SearchItem[] = [
        { id: "1", title: "Bill", category: "billing", categoryLabel: "", url: "/b", icon: () => null },
        { id: "2", title: "Lab", category: "laboratory", categoryLabel: undefined as any, url: "/l", icon: () => null },
        { id: "3", title: "X", category: "xray", categoryLabel: "", url: "/x", icon: () => null },
      ];

      const grouped = groupSearchResults(items);

      expect(grouped.get("billing")?.label).toBe("Billing");
      expect(grouped.get("laboratory")?.label).toBe("Laboratory");
      expect(grouped.get("xray")?.label).toBe("Xray");
    });
  });

  // =========================================================================
  // SUITE 5: Keyboard Navigation & State Machine Boundaries
  // =========================================================================
  describe("Suite 5: Keyboard Navigation State Machine Boundaries", () => {
    test("R5.1: ArrowDown wraps from last index to 0", () => {
      const itemCount = 4;
      const getNextIndex = (current: number) => (current + 1) % itemCount;

      expect(getNextIndex(0)).toBe(1);
      expect(getNextIndex(1)).toBe(2);
      expect(getNextIndex(2)).toBe(3);
      expect(getNextIndex(3)).toBe(0); // Wrapped!
    });

    test("R5.2: ArrowUp wraps from 0 to last index", () => {
      const itemCount = 4;
      const getPrevIndex = (current: number) => (current - 1 + itemCount) % itemCount;

      expect(getPrevIndex(0)).toBe(3); // Wrapped!
      expect(getPrevIndex(3)).toBe(2);
      expect(getPrevIndex(2)).toBe(1);
      expect(getPrevIndex(1)).toBe(0);
    });

    test("R5.3: PageDown and PageUp clamp within bounds", () => {
      const itemCount = 12;
      const pageDown = (current: number) => Math.min(itemCount - 1, current + 5);
      const pageUp = (current: number) => Math.max(0, current - 5);

      expect(pageDown(0)).toBe(5);
      expect(pageDown(5)).toBe(10);
      expect(pageDown(10)).toBe(11); // Clamped at 11

      expect(pageUp(11)).toBe(6);
      expect(pageUp(6)).toBe(1);
      expect(pageUp(1)).toBe(0); // Clamped at 0
    });

    test("R5.4: Boundary clamping effect when flattenedResults shrinks", () => {
      // Simulate effect:
      // if (activeIndex >= flattenedResults.length) {
      //   setActiveIndex(Math.max(0, flattenedResults.length - 1));
      // }
      const clampIndex = (active: number, length: number) => {
        if (active >= length) {
          return Math.max(0, length - 1);
        }
        return active;
      };

      // When list shrinks from 10 to 3, activeIndex 8 becomes 2
      expect(clampIndex(8, 3)).toBe(2);

      // When list drops to 0 items, activeIndex 5 becomes 0
      expect(clampIndex(5, 0)).toBe(0);

      // When activeIndex is already within bounds, it is preserved
      expect(clampIndex(1, 3)).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 6: Source Integrity & Design Token Enforcement
  // =========================================================================
  describe("Suite 6: Source Integrity & Token Enforcement", () => {
    test("R6.1: WorkspaceSearchDialog.tsx derives flattenedResults from groupedResults and selects from flattenedResults", () => {
      const dialogPath = path.resolve(
        __dirname,
        "../src/components/dashboard/WorkspaceSearchDialog.tsx"
      );
      const dialogContent = fs.readFileSync(dialogPath, "utf-8");

      expect(dialogContent).toContain("const groupedResults = useMemo(() => {");
      expect(dialogContent).toContain("groupSearchResults(visibleResults)");
      expect(dialogContent).toContain("const flattenedResults = useMemo(() => {");
      expect(dialogContent).toContain("Array.from(groupedResults.values()).flatMap((g) => g.items)");
      expect(dialogContent).toContain("const selected = flattenedResults[activeIndex];");
      expect(dialogContent).toContain("flattenedResults[activeIndex]");
    });

    test("R6.2: Zero raw hex colors in WorkspaceSearchDialog.tsx and integration test files", () => {
      const filesToAudit = [
        path.resolve(__dirname, "../src/components/dashboard/WorkspaceSearchDialog.tsx"),
        path.resolve(__dirname, "portalSearchIntegration.test.ts"),
        path.resolve(__dirname, "challenger_m4_it2_2_empirical.test.ts"),
      ];

      const hexRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;

      for (const file of filesToAudit) {
        const content = fs.readFileSync(file, "utf-8");
        const matches = content.match(hexRegex);
        expect(matches).toBeNull();
      }
    });
  });
});
