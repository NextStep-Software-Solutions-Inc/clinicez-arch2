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

const mockTenant = "apex-health";

function createItem(
  id: string,
  category: string,
  title: string,
  categoryLabel?: string
): SearchItem {
  return {
    id,
    category,
    categoryLabel: categoryLabel ?? category,
    title,
    subtitle: `Subtitle for ${title}`,
    icon: (() => null) as any,
    url: `/dashboard/${category}/${id}`,
    badge: "Active",
    badgeClass: "border-primary/40 bg-primary/10 text-primary",
    onSelect: mock(() => {}),
  };
}

describe("Milestone 4 Iteration 3 Challenger 1: ActiveIndex, Category Permutations & Keyboard Stress Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // DIMENSION 1: Randomized Category Permutations & ActiveIndex Invariant
  // =========================================================================
  describe("Dimension 1: Randomized Category Permutations & ActiveIndex Synchronization", () => {
    test("1.1: Invariant Verification across 500 randomized permutations: flattenedResults[k] ALWAYS matches visual DOM item at globalIdx === k", () => {
      const categoriesPool = [
        // Standard categories
        "actions",
        "navigation",
        "branches",
        "facilities",
        "team",
        // Custom cross-app categories
        "patients",
        "dental",
        "billing",
        "radiology",
        "laboratory",
        "telemetry",
        "pharmacy_orders",
      ];

      // Run 500 randomized permutation trials
      for (let trial = 0; trial < 500; trial++) {
        const itemCount = Math.floor(Math.random() * 50) + 1; // 1 to 50 items
        const visibleResults: SearchItem[] = [];

        for (let i = 0; i < itemCount; i++) {
          const cat = categoriesPool[Math.floor(Math.random() * categoriesPool.length)];
          visibleResults.push(
            createItem(`item-trial-${trial}-${i}-${cat}`, cat, `Item ${i} in ${cat}`)
          );
        }

        // Shuffle visibleResults to ensure completely out-of-order categories
        for (let i = visibleResults.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [visibleResults[i], visibleResults[j]] = [visibleResults[j], visibleResults[i]];
        }

        const groupedResults = groupSearchResults(visibleResults);
        const flattenedResults = Array.from(groupedResults.values()).flatMap((g) => g.items);

        // Simulate exact visual DOM rendering sequence
        const visualDOMItems: { item: SearchItem; globalIdx: number; optionId: string }[] = [];
        for (const [category, categoryData] of groupedResults.entries()) {
          const { items, startIndex } = categoryData;
          items.forEach((item, localIdx) => {
            const globalIdx = startIndex + localIdx;
            const optionId = `workspace-search-opt-${(item.id || "").replace(/[^\w-]/g, "_")}`;
            visualDOMItems[globalIdx] = { item, globalIdx, optionId };
          });
        }

        // Invariant 1: Total lengths must match
        expect(flattenedResults.length).toBe(visibleResults.length);
        expect(visualDOMItems.length).toBe(visibleResults.length);

        // Invariant 2: For EVERY activeIndex, flattenedResults[activeIndex] === visualDOMItems[activeIndex]
        for (let activeIndex = 0; activeIndex < flattenedResults.length; activeIndex++) {
          const flattenedItem = flattenedResults[activeIndex];
          const visualItem = visualDOMItems[activeIndex].item;
          const visualGlobalIdx = visualDOMItems[activeIndex].globalIdx;
          const visualOptionId = visualDOMItems[activeIndex].optionId;

          // Item pointer equality
          expect(flattenedItem).toBe(visualItem);
          expect(flattenedItem.id).toBe(visualItem.id);
          expect(visualGlobalIdx).toBe(activeIndex);

          // activeOptionId synchronization
          const activeOptionId = `workspace-search-opt-${(flattenedItem.id || "").replace(/[^\w-]/g, "_")}`;
          expect(activeOptionId).toBe(visualOptionId);
        }
      }
    });

    test("1.2: Inverted Category Order Stress: Worst-case reverse standard order strictly aligns", () => {
      // Reverse order: team -> facilities -> branches -> navigation -> actions
      const teamItem = createItem("item-team", "team", "Dr. Santos");
      const facItem = createItem("item-fac", "facilities", "Primary Clinic");
      const branchItem = createItem("item-branch", "branches", "Apex Central");
      const navItem = createItem("item-nav", "navigation", "Overview");
      const actItem = createItem("item-act", "actions", "New Branch");

      const visibleResults = [teamItem, facItem, branchItem, navItem, actItem];
      const grouped = groupSearchResults(visibleResults);
      const flattened = Array.from(grouped.values()).flatMap((g) => g.items);

      // In groupedResults, standard CATEGORY_ORDER puts actions first, then nav, branch, fac, team
      expect(flattened.map((i) => i.id)).toEqual([
        "item-act",
        "item-nav",
        "item-branch",
        "item-fac",
        "item-team",
      ]);

      // Every index in flattened corresponds to visual index
      for (let i = 0; i < flattened.length; i++) {
        expect(flattened[i].id).toBe(
          ["item-act", "item-nav", "item-branch", "item-fac", "item-team"][i]
        );
      }
    });

    test("1.3: Interleaved standard and custom categories maintain contiguous indices and zero collisions", () => {
      const items = [
        createItem("custom-1", "zeta_custom", "Zeta Item"),
        createItem("act-1", "actions", "Action Item"),
        createItem("custom-2", "alpha_custom", "Alpha Item"),
        createItem("nav-1", "navigation", "Nav Item"),
        createItem("custom-3", "beta_custom", "Beta Item"),
      ];

      const grouped = groupSearchResults(items);
      const flattened = Array.from(grouped.values()).flatMap((g) => g.items);

      // Expected order: actions, navigation, then custom categories in order of appearance (zeta, alpha, beta)
      expect(flattened.map((i) => i.id)).toEqual([
        "act-1",
        "nav-1",
        "custom-1",
        "custom-2",
        "custom-3",
      ]);

      let running = 0;
      for (const [cat, data] of grouped.entries()) {
        expect(data.startIndex).toBe(running);
        running += data.items.length;
      }
      expect(running).toBe(5);
    });
  });

  // =========================================================================
  // DIMENSION 2: Empty Result Set Stress-Testing (0 items)
  // =========================================================================
  describe("Dimension 2: Empty Result Set Keyboard Navigation & State Bounds", () => {
    test("2.1: Empty result set (0 items) produces empty flattenedResults and undefined activeOptionId", () => {
      const visibleResults: SearchItem[] = [];
      const grouped = groupSearchResults(visibleResults);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      expect(flattenedResults.length).toBe(0);

      const activeIndex = 0;
      const activeOptionId = flattenedResults[activeIndex]
        ? `workspace-search-opt-${(flattenedResults[activeIndex].id || "").replace(/[^\w-]/g, "_")}`
        : undefined;

      expect(activeOptionId).toBeUndefined();
    });

    test("2.2: Keyboard handler on 0 items safely handles ArrowDown, ArrowUp, PageDown, PageUp, Enter without state mutation or errors", () => {
      const flattenedResults: SearchItem[] = [];
      let activeIndex = 0;
      let isOpen = true;
      let selectedItem: SearchItem | null = null;

      const setActiveIndex = (updater: (prev: number) => number) => {
        activeIndex = updater(activeIndex);
      };

      const setOpen = (open: boolean) => {
        isOpen = open;
      };

      const handleSelectItem = (item: SearchItem) => {
        selectedItem = item;
      };

      const simulateKeyDown = (key: string, isComposing = false) => {
        let prevented = false;
        const e = {
          key,
          nativeEvent: { isComposing },
          preventDefault: () => {
            prevented = true;
          },
        };

        // Logic from WorkspaceSearchDialog.tsx lines 941-973
        if (e.nativeEvent.isComposing) return;
        if (flattenedResults.length === 0) {
          if (e.key === "Escape") {
            e.preventDefault();
            setOpen(false);
          }
          return;
        }

        if (e.key === "ArrowDown") {
          e.preventDefault();
          setActiveIndex((prev) => (prev + 1) % flattenedResults.length);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setActiveIndex((prev) => (prev - 1 + flattenedResults.length) % flattenedResults.length);
        } else if (e.key === "PageDown") {
          e.preventDefault();
          setActiveIndex((prev) => Math.min(flattenedResults.length - 1, prev + 5));
        } else if (e.key === "PageUp") {
          e.preventDefault();
          setActiveIndex((prev) => Math.max(0, prev - 5));
        } else if (e.key === "Enter") {
          e.preventDefault();
          const selected = flattenedResults[activeIndex];
          if (selected) {
            handleSelectItem(selected);
          }
        } else if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
      };

      // Test all keys when 0 items
      simulateKeyDown("ArrowDown");
      expect(activeIndex).toBe(0);
      expect(selectedItem).toBeNull();

      simulateKeyDown("ArrowUp");
      expect(activeIndex).toBe(0);
      expect(selectedItem).toBeNull();

      simulateKeyDown("PageDown");
      expect(activeIndex).toBe(0);
      expect(selectedItem).toBeNull();

      simulateKeyDown("PageUp");
      expect(activeIndex).toBe(0);
      expect(selectedItem).toBeNull();

      simulateKeyDown("Enter");
      expect(activeIndex).toBe(0);
      expect(selectedItem).toBeNull();

      // Escape should close dialog
      expect(isOpen).toBe(true);
      simulateKeyDown("Escape");
      expect(isOpen).toBe(false);
    });

    test("2.3: Bounds effect on 0 items clamps activeIndex to 0", () => {
      const flattenedResults: SearchItem[] = [];
      let activeIndex = 5; // Previous index before results became empty

      // Simulating useEffect([flattenedResults.length, activeIndex])
      if (activeIndex >= flattenedResults.length) {
        activeIndex = Math.max(0, flattenedResults.length - 1);
      }

      // Math.max(0, 0 - 1) = 0
      expect(activeIndex).toBe(0);
    });
  });

  // =========================================================================
  // DIMENSION 3: Single-Item Result Set Stress-Testing (1 item)
  // =========================================================================
  describe("Dimension 3: Single-Item Result Set Keyboard Navigation", () => {
    test("3.1: Single item retains index 0 across ArrowDown, ArrowUp, PageDown, PageUp", () => {
      const singleItem = createItem("only-item", "actions", "Only Available Action");
      const visibleResults = [singleItem];
      const grouped = groupSearchResults(visibleResults);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      expect(flattenedResults.length).toBe(1);

      let activeIndex = 0;
      let selectionCount = 0;
      let navigatedUrl = "";

      const setActiveIndex = (updater: (prev: number) => number) => {
        activeIndex = updater(activeIndex);
      };

      const handleSelectItem = (item: SearchItem) => {
        selectionCount++;
        item.onSelect?.();
        navigatedUrl = item.url;
      };

      const simulateKeyDown = (key: string) => {
        if (flattenedResults.length === 0) return;
        if (key === "ArrowDown") {
          setActiveIndex((prev) => (prev + 1) % flattenedResults.length);
        } else if (key === "ArrowUp") {
          setActiveIndex((prev) => (prev - 1 + flattenedResults.length) % flattenedResults.length);
        } else if (key === "PageDown") {
          setActiveIndex((prev) => Math.min(flattenedResults.length - 1, prev + 5));
        } else if (key === "PageUp") {
          setActiveIndex((prev) => Math.max(0, prev - 5));
        } else if (key === "Enter") {
          const selected = flattenedResults[activeIndex];
          if (selected) {
            handleSelectItem(selected);
          }
        }
      };

      // ArrowDown: (0 + 1) % 1 === 0
      simulateKeyDown("ArrowDown");
      expect(activeIndex).toBe(0);

      // ArrowUp: (0 - 1 + 1) % 1 === 0
      simulateKeyDown("ArrowUp");
      expect(activeIndex).toBe(0);

      // PageDown: Math.min(0, 0 + 5) === 0
      simulateKeyDown("PageDown");
      expect(activeIndex).toBe(0);

      // PageUp: Math.max(0, 0 - 5) === 0
      simulateKeyDown("PageUp");
      expect(activeIndex).toBe(0);

      // activeOptionId
      const activeOptionId = `workspace-search-opt-${(flattenedResults[activeIndex].id || "").replace(/[^\w-]/g, "_")}`;
      expect(activeOptionId).toBe("workspace-search-opt-only-item");

      // Enter key selects the item
      simulateKeyDown("Enter");
      expect(selectionCount).toBe(1);
      expect(navigatedUrl).toBe("/dashboard/actions/only-item");
      expect(singleItem.onSelect).toHaveBeenCalledTimes(1);
    });

    test("3.2: Shrinking from multi-item to 1 item automatically clamps activeIndex from 10 to 0", () => {
      let activeIndex = 10;
      const flattenedResults = [createItem("item-1", "team", "Dr. Maria")];

      if (activeIndex >= flattenedResults.length) {
        activeIndex = Math.max(0, flattenedResults.length - 1);
      }

      expect(activeIndex).toBe(0);
      expect(flattenedResults[activeIndex].id).toBe("item-1");
    });
  });

  // =========================================================================
  // DIMENSION 4: 60-Item Result Set Stress-Testing (MAX_RENDERED_RESULTS = 60)
  // =========================================================================
  describe("Dimension 4: 60-Item Boundary Wrap, Page Stepping & Exhaustive Enter Selection", () => {
    test("4.1: Exactly 60 items across 6 categories wrapped and navigated correctly", () => {
      const categories = ["actions", "navigation", "branches", "facilities", "team", "billing"];
      const rawItems: SearchItem[] = [];

      // Create 60 items (10 per category) in reverse category order
      for (let c = categories.length - 1; c >= 0; c--) {
        const cat = categories[c];
        for (let i = 0; i < 10; i++) {
          rawItems.push(createItem(`item-${cat}-${i}`, cat, `Item ${i} of ${cat}`));
        }
      }

      expect(rawItems.length).toBe(60);

      // High-volume performance optimization simulation
      const MAX_RENDERED_RESULTS = 60;
      const visibleResults = rawItems.slice(0, MAX_RENDERED_RESULTS);
      const grouped = groupSearchResults(visibleResults);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      expect(flattenedResults.length).toBe(60);

      let activeIndex = 0;
      const setActiveIndex = (updater: (prev: number) => number) => {
        activeIndex = updater(activeIndex);
      };

      const simulateArrowDown = () => {
        setActiveIndex((prev) => (prev + 1) % flattenedResults.length);
      };
      const simulateArrowUp = () => {
        setActiveIndex((prev) => (prev - 1 + flattenedResults.length) % flattenedResults.length);
      };
      const simulatePageDown = () => {
        setActiveIndex((prev) => Math.min(flattenedResults.length - 1, prev + 5));
      };
      const simulatePageUp = () => {
        setActiveIndex((prev) => Math.max(0, prev - 5));
      };

      // 1. Boundary Wrap: ArrowUp from 0 wraps to 59
      simulateArrowUp();
      expect(activeIndex).toBe(59);

      // 2. Boundary Wrap: ArrowDown from 59 wraps to 0
      simulateArrowDown();
      expect(activeIndex).toBe(0);

      // 3. PageDown steps: 0 -> 5 -> 10 ... -> 55 -> 59
      for (let expected = 5; expected <= 55; expected += 5) {
        simulatePageDown();
        expect(activeIndex).toBe(expected);
      }
      simulatePageDown(); // 55 + 5 = 60 -> clamped to 59
      expect(activeIndex).toBe(59);

      // Another PageDown stays clamped at 59
      simulatePageDown();
      expect(activeIndex).toBe(59);

      // 4. PageUp steps: 59 -> 54 -> 49 ... -> 4 -> 0
      simulatePageUp();
      expect(activeIndex).toBe(54);

      for (let expected = 49; expected >= 4; expected -= 5) {
        simulatePageUp();
        expect(activeIndex).toBe(expected);
      }
      simulatePageUp(); // 4 - 5 = -1 -> clamped to 0
      expect(activeIndex).toBe(0);

      // Another PageUp stays clamped at 0
      simulatePageUp();
      expect(activeIndex).toBe(0);
    });

    test("4.2: Exhaustive 60-item traversal: Enter key selects flattenedResults[k] with 100% precision", () => {
      const items: SearchItem[] = [];
      const selectedIds: string[] = [];

      for (let i = 0; i < 60; i++) {
        const cat = i < 20 ? "team" : i < 40 ? "actions" : "patients";
        items.push(createItem(`item-seq-${i}`, cat, `Title ${i}`));
      }

      const grouped = groupSearchResults(items);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);
      expect(flattenedResults.length).toBe(60);

      // Verify each index 0..59 on Enter selection
      for (let idx = 0; idx < flattenedResults.length; idx++) {
        const activeIndex = idx;
        const selected = flattenedResults[activeIndex];
        expect(selected).toBeDefined();

        selected.onSelect?.();
        selectedIds.push(selected.id);

        const expectedOptionId = `workspace-search-opt-${selected.id.replace(/[^\w-]/g, "_")}`;
        const actualOptionId = `workspace-search-opt-${(flattenedResults[activeIndex].id || "").replace(/[^\w-]/g, "_")}`;
        expect(actualOptionId).toBe(expectedOptionId);
      }

      expect(selectedIds.length).toBe(60);
      expect(selectedIds).toEqual(flattenedResults.map((i) => i.id));
    });

    test("4.3: 200 items capped at MAX_RENDERED_RESULTS (60) never exceeds index 59", () => {
      const largeSet: SearchItem[] = [];
      for (let i = 0; i < 200; i++) {
        largeSet.push(createItem(`large-${i}`, "navigation", `Nav Page ${i}`));
      }

      const MAX_RENDERED_RESULTS = 60;
      const visibleResults = largeSet.slice(0, MAX_RENDERED_RESULTS);
      const grouped = groupSearchResults(visibleResults);
      const flattened = Array.from(grouped.values()).flatMap((g) => g.items);

      expect(flattened.length).toBe(60);

      let activeIndex = 59;
      // ArrowDown should wrap to 0, NOT 60
      activeIndex = (activeIndex + 1) % flattened.length;
      expect(activeIndex).toBe(0);

      // ArrowUp from 0 should wrap to 59
      activeIndex = (activeIndex - 1 + flattened.length) % flattened.length;
      expect(activeIndex).toBe(59);
    });
  });

  // =========================================================================
  // DIMENSION 5: Full Dialog State Machine Simulation (Rapid Keystroke Chaos)
  // =========================================================================
  describe("Dimension 5: Rapid Keystroke Chaos & State Machine Invariants", () => {
    test("5.1: 10,000 randomized keystrokes across fluctuating result list sizes maintains strict bounds and zero exceptions", () => {
      let activeIndex = 0;
      let isOpen = true;
      let selectionEvents: string[] = [];

      // Test with result sizes changing from 0 -> 1 -> 15 -> 60 -> 3 -> 0
      const listSizes = [0, 1, 15, 60, 3, 0, 42, 1, 0, 60];

      for (const size of listSizes) {
        const currentItems: SearchItem[] = [];
        for (let i = 0; i < size; i++) {
          const cat = i % 2 === 0 ? "team" : "actions";
          currentItems.push(createItem(`chaos-${size}-${i}`, cat, `Chaos ${i}`));
        }

        const grouped = groupSearchResults(currentItems);
        const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

        // Bounds effect clamp
        if (activeIndex >= flattenedResults.length) {
          activeIndex = Math.max(0, flattenedResults.length - 1);
        }

        const keys = ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Enter", "Escape"];

        // Apply 1000 keystrokes for this list size
        for (let k = 0; k < 1000; k++) {
          const key = keys[Math.floor(Math.random() * keys.length)];

          if (flattenedResults.length === 0) {
            if (key === "Escape") {
              isOpen = false;
            }
            expect(activeIndex).toBe(0);
            continue;
          }

          if (key === "ArrowDown") {
            activeIndex = (activeIndex + 1) % flattenedResults.length;
          } else if (key === "ArrowUp") {
            activeIndex = (activeIndex - 1 + flattenedResults.length) % flattenedResults.length;
          } else if (key === "PageDown") {
            activeIndex = Math.min(flattenedResults.length - 1, activeIndex + 5);
          } else if (key === "PageUp") {
            activeIndex = Math.max(0, activeIndex - 5);
          } else if (key === "Enter") {
            const selected = flattenedResults[activeIndex];
            expect(selected).toBeDefined();
            selectionEvents.push(selected.id);
          } else if (key === "Escape") {
            isOpen = false;
          }

          // Invariant checks after every single keypress
          expect(activeIndex).toBeGreaterThanOrEqual(0);
          expect(activeIndex).toBeLessThan(flattenedResults.length);
          const activeOptionId = `workspace-search-opt-${(flattenedResults[activeIndex].id || "").replace(/[^\w-]/g, "_")}`;
          expect(activeOptionId).toBe(`workspace-search-opt-${flattenedResults[activeIndex].id}`);
        }
      }
    });

    test("5.2: Mouse hover synchronization with activeIndex guarantees matching keyboard selection", () => {
      const items = [
        createItem("team-a", "team", "Doctor A"),
        createItem("act-a", "actions", "Action A"),
        createItem("nav-a", "navigation", "Nav A"),
      ];

      const grouped = groupSearchResults(items);
      const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

      // DOM rendering maps through grouped results
      const renderedOptions: { id: string; globalIdx: number }[] = [];
      for (const [_, data] of grouped.entries()) {
        data.items.forEach((item, localIdx) => {
          renderedOptions.push({
            id: item.id,
            globalIdx: data.startIndex + localIdx,
          });
        });
      }

      let activeIndex = 0;

      // Simulate mouse hovering over DOM item at visual index 2
      const hoveredDomItem = renderedOptions[2];
      activeIndex = hoveredDomItem.globalIdx;

      // Verify that pressing Enter now selects that EXACT item
      const selected = flattenedResults[activeIndex];
      expect(selected.id).toBe(hoveredDomItem.id);
      expect(selected.id).toBe("team-a"); // In grouped order: actions (0), navigation (1), team (2)
    });
  });
});
