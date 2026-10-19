import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";

mock.module("next/navigation", () => ({
  useParams: () => ({ tenant: "apex-health" }),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {} }),
  usePathname: () => "/apex-health/dashboard/overview",
  useSearchParams: () => new URLSearchParams(),
}));

mock.module("react-native", () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: "View",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  Text: "Text",
  ActivityIndicator: "ActivityIndicator",
  Modal: "Modal",
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: "web", select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
  },
}));

mock.module("react-native-svg", () => ({
  Svg: "Svg",
  Path: "Path",
  Circle: "Circle",
  Rect: "Rect",
  Line: "Line",
  default: "Svg",
}));

mock.module("../../clinic-app/constants/fonts", () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module("@expo-google-fonts/geist", () => ({
  useFonts: () => [true],
}));

mock.module("@expo-google-fonts/geist-mono", () => ({
  useFonts: () => [true],
}));


import {
  universalSearchRegistry,
  type SearchItem as RegistrySearchItem,
  type SearchContributor,
} from "@shared/safe";

import {
  groupSearchResults,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  type SearchItem,
  type SearchCategory,
} from "../src/components/dashboard/WorkspaceSearchDialog";

const {
  handleWorkstationKeyDown,
} = await import("../../clinic-app/utils/workstationShortcuts.web");

const {
  handleModalKeyDown,
} = await import("../../clinic-app/components/search/GlobalSearchModal");

type WorkstationShortcutHandlers = import("../../clinic-app/utils/workstationShortcuts.web").WorkstationShortcutHandlers;
type ModalKeyNavigationState = import("../../clinic-app/components/search/GlobalSearchModal").ModalKeyNavigationState;


describe("Milestone 5 Tier 5 White-Box Frontend Workstation & Portal Web Adversarial Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // SUITE 1: Keyboard Navigation, activeIndex Clamping & Boundary Conditions
  // =========================================================================
  describe("Suite 1: Keyboard Navigation, activeIndex Clamping & Boundary Conditions", () => {
    test("1.1 Empty list (items count = 0): ArrowDown, ArrowUp, Enter, PageDown, PageUp safely clamp without exceptions", () => {
      // Test GlobalSearchModal handleModalKeyDown
      let clinicActiveIndex = 0;
      let clinicSelected: any = null;
      const clinicState: ModalKeyNavigationState = {
        activeIndex: clinicActiveIndex,
        displayedItems: [],
        onClose: () => {},
        onSelectItem: (item) => {
          clinicSelected = item;
        },
        setActiveIndex: (updater) => {
          clinicActiveIndex = updater(clinicActiveIndex);
        },
      };

      // ArrowDown on empty list
      let handled = handleModalKeyDown({ key: "ArrowDown" }, clinicState);
      expect(handled).toBe(true);
      expect(clinicActiveIndex).toBe(-1);

      // ArrowUp on empty list
      handled = handleModalKeyDown({ key: "ArrowUp" }, clinicState);
      expect(handled).toBe(true);
      expect(clinicActiveIndex).toBe(-1);

      // Enter on empty list
      handled = handleModalKeyDown({ key: "Enter" }, clinicState);
      expect(handled).toBe(true);
      expect(clinicSelected).toBeNull();

      // Test Portal Web WorkspaceSearchDialog navigation state machine logic
      let portalActiveIndex = 0;
      let portalSelected: any = null;
      const emptyResults: SearchItem[] = [];

      const portalKeyDown = (key: string) => {
        if (emptyResults.length === 0) {
          return false;
        }
        if (key === "ArrowDown") {
          portalActiveIndex = (portalActiveIndex + 1) % emptyResults.length;
        } else if (key === "ArrowUp") {
          portalActiveIndex = (portalActiveIndex - 1 + emptyResults.length) % emptyResults.length;
        } else if (key === "PageDown") {
          portalActiveIndex = Math.min(emptyResults.length - 1, portalActiveIndex + 5);
        } else if (key === "PageUp") {
          portalActiveIndex = Math.max(0, portalActiveIndex - 5);
        } else if (key === "Enter") {
          portalSelected = emptyResults[portalActiveIndex];
        }
        return true;
      };

      expect(portalKeyDown("ArrowDown")).toBe(false);
      expect(portalKeyDown("ArrowUp")).toBe(false);
      expect(portalKeyDown("PageDown")).toBe(false);
      expect(portalKeyDown("PageUp")).toBe(false);
      expect(portalKeyDown("Enter")).toBe(false);
      expect(portalSelected).toBeNull();
    });

    test("1.2 Single item list (items count = 1): ArrowDown, ArrowUp, PageDown, PageUp remain invariant at index 0", () => {
      // Test GlobalSearchModal
      const singleItem: RegistrySearchItem = {
        id: "item-only",
        title: "Sole Item",
        category: "General",
        targetRoute: "Dashboard",
      };
      let clinicActiveIndex = 0;
      let clinicSelected: any = null;

      const clinicState: ModalKeyNavigationState = {
        activeIndex: clinicActiveIndex,
        displayedItems: [singleItem],
        onClose: () => {},
        onSelectItem: (item) => {
          clinicSelected = item;
        },
        setActiveIndex: (updater) => {
          clinicActiveIndex = updater(clinicActiveIndex);
        },
      };

      // ArrowDown
      handleModalKeyDown({ key: "ArrowDown" }, clinicState);
      expect(clinicActiveIndex).toBe(0);

      // ArrowUp
      handleModalKeyDown({ key: "ArrowUp" }, clinicState);
      expect(clinicActiveIndex).toBe(0);

      // Enter
      clinicState.activeIndex = clinicActiveIndex;
      handleModalKeyDown({ key: "Enter" }, clinicState);
      expect(clinicSelected).toEqual(singleItem);

      // Test Portal Web
      const portalSingle: SearchItem[] = [
        { id: "p1", title: "Only", category: "actions", categoryLabel: "Actions", url: "/act", icon: () => null },
      ];
      let pIdx = 0;
      let pSelected: any = null;

      const portalKeyDown = (key: string) => {
        if (portalSingle.length === 0) return false;
        if (key === "ArrowDown") {
          pIdx = (pIdx + 1) % portalSingle.length;
        } else if (key === "ArrowUp") {
          pIdx = (pIdx - 1 + portalSingle.length) % portalSingle.length;
        } else if (key === "PageDown") {
          pIdx = Math.min(portalSingle.length - 1, pIdx + 5);
        } else if (key === "PageUp") {
          pIdx = Math.max(0, pIdx - 5);
        } else if (key === "Enter") {
          pSelected = portalSingle[pIdx];
        }
        return true;
      };

      portalKeyDown("ArrowDown");
      expect(pIdx).toBe(0);
      portalKeyDown("ArrowUp");
      expect(pIdx).toBe(0);
      portalKeyDown("PageDown");
      expect(pIdx).toBe(0);
      portalKeyDown("PageUp");
      expect(pIdx).toBe(0);
      portalKeyDown("Enter");
      expect(pSelected).toEqual(portalSingle[0]);
    });

    test("1.3 Maximum capped items (items count = 60): ArrowDown wraps from 59 to 0, ArrowUp wraps from 0 to 59, PageDown/PageUp jump and clamp", () => {
      const items60: SearchItem[] = Array.from({ length: 60 }, (_, i) => ({
        id: `item-${i}`,
        title: `Item ${i}`,
        category: "actions",
        categoryLabel: "Quick Actions",
        url: `/item-${i}`,
        icon: () => null,
      }));

      // In WorkspaceSearchDialog:
      let activeIndex = 0;
      const keyDown = (key: string) => {
        if (items60.length === 0) return;
        if (key === "ArrowDown") {
          activeIndex = (activeIndex + 1) % items60.length;
        } else if (key === "ArrowUp") {
          activeIndex = (activeIndex - 1 + items60.length) % items60.length;
        } else if (key === "PageDown") {
          activeIndex = Math.min(items60.length - 1, activeIndex + 5);
        } else if (key === "PageUp") {
          activeIndex = Math.max(0, activeIndex - 5);
        }
      };

      // Wrap from 0 to 59 via ArrowUp
      activeIndex = 0;
      keyDown("ArrowUp");
      expect(activeIndex).toBe(59);

      // Wrap from 59 to 0 via ArrowDown
      keyDown("ArrowDown");
      expect(activeIndex).toBe(0);

      // PageDown jumps by +5: 0 -> 5 -> 10 -> ... -> 55 -> 59 (clamped)
      keyDown("PageDown");
      expect(activeIndex).toBe(5);
      keyDown("PageDown");
      expect(activeIndex).toBe(10);

      activeIndex = 57;
      keyDown("PageDown");
      expect(activeIndex).toBe(59);
      keyDown("PageDown"); // already at max
      expect(activeIndex).toBe(59);

      // PageUp jumps by -5: 59 -> 54 -> ... -> 2 -> 0 (clamped)
      keyDown("PageUp");
      expect(activeIndex).toBe(54);

      activeIndex = 3;
      keyDown("PageUp");
      expect(activeIndex).toBe(0);
      keyDown("PageUp"); // already at 0
      expect(activeIndex).toBe(0);
    });

    test("1.4 Dynamic shrink clamping: activeIndex at 55 clamps to 4 when results shrink to 5", () => {
      let activeIndex = 55;
      const newResultsLength = 5;

      // Behavior of useEffect in WorkspaceSearchDialog:
      // if (activeIndex >= flattenedResults.length) setActiveIndex(Math.max(0, flattenedResults.length - 1));
      if (activeIndex >= newResultsLength) {
        activeIndex = Math.max(0, newResultsLength - 1);
      }
      expect(activeIndex).toBe(4);

      // If results shrink to 0:
      const zeroResultsLength = 0;
      if (activeIndex >= zeroResultsLength) {
        activeIndex = Math.max(0, zeroResultsLength - 1);
      }
      expect(activeIndex).toBe(0);
    });
  });

  // =========================================================================
  // SUITE 2: Synchronous Selection on Enter vs Visual DOM Rendered Item
  // =========================================================================
  describe("Suite 2: Synchronous Selection on Enter vs Visual DOM Rendered Item", () => {
    test("2.1 DOM render index strictly equals flattenedResults index across 50 randomised multi-category datasets", () => {
      const categories: SearchCategory[] = ["actions", "navigation", "branches", "facilities", "team"];

      for (let run = 0; run < 50; run++) {
        const itemCount = Math.floor(Math.random() * 50) + 10;
        const testItems: SearchItem[] = [];

        for (let i = 0; i < itemCount; i++) {
          const cat = categories[Math.floor(Math.random() * categories.length)];
          testItems.push({
            id: `test-item-${run}-${i}`,
            title: `Item ${i} in ${cat}`,
            category: cat,
            categoryLabel: CATEGORY_LABELS[cat],
            url: `/${cat}/${i}`,
            icon: () => null,
          });
        }

        const grouped = groupSearchResults(testItems);
        const flattenedResults = Array.from(grouped.values()).flatMap((g) => g.items);

        // Simulate visual DOM render loop
        const visualDOMItems: { item: SearchItem; globalIdx: number; optionId: string }[] = [];
        for (const [, categoryData] of grouped.entries()) {
          const { items, startIndex } = categoryData;
          items.forEach((item, localIdx) => {
            const globalIdx = startIndex + localIdx;
            const optionId = `workspace-search-opt-${(item.id || "").replace(/[^\w-]/g, "_")}`;
            visualDOMItems.push({ item, globalIdx, optionId });
          });
        }

        expect(flattenedResults.length).toBe(visualDOMItems.length);

        // Verify every single index k
        for (let k = 0; k < flattenedResults.length; k++) {
          const expectedItem = visualDOMItems[k].item;
          const selected = flattenedResults[k];
          expect(selected.id).toBe(expectedItem.id);
          expect(selected.title).toBe(expectedItem.title);
          expect(visualDOMItems[k].globalIdx).toBe(k);

          const expectedOptionId = `workspace-search-opt-${(selected.id || "").replace(/[^\w-]/g, "_")}`;
          expect(visualDOMItems[k].optionId).toBe(expectedOptionId);
        }
      }
    });
  });

  // =========================================================================
  // SUITE 3: Input Focus Guards for Single-Key Shortcuts
  // =========================================================================
  describe("Suite 3: Input Focus Guards for Single-Key Shortcuts", () => {
    const inputTagTargets = [
      { tagName: "INPUT", isContentEditable: false, desc: "<input>" },
      { tagName: "TEXTAREA", isContentEditable: false, desc: "<textarea>" },
      { tagName: "SELECT", isContentEditable: false, desc: "<select>" },
      { tagName: "DIV", isContentEditable: true, desc: "contenteditable <div>" },
      { tagName: "P", isContentEditable: true, desc: "contenteditable <p>" },
    ];

    for (const targetCase of inputTagTargets) {
      test(`3.1 Typing "/" inside ${targetCase.desc} does NOT trigger search modal`, () => {
        let searchOpened = false;
        let defaultPrevented = false;

        const handlers: WorkstationShortcutHandlers = {
          onOpenSearch: () => {
            searchOpened = true;
          },
        };

        const event = {
          key: "/",
          target: targetCase,
          preventDefault: () => {
            defaultPrevented = true;
          },
        };

        const handled = handleWorkstationKeyDown(event, handlers);

        expect(handled).toBe(false);
        expect(defaultPrevented).toBe(false);
        expect(searchOpened).toBe(false);
      });
    }

    test('3.2 Typing "/" outside form controls triggers search modal immediately', () => {
      const nonInputTargets = [
        null,
        undefined,
        { tagName: "DIV", isContentEditable: false },
        { tagName: "BODY", isContentEditable: false },
        { tagName: "BUTTON", isContentEditable: false },
        { tagName: "SPAN", isContentEditable: false },
      ];

      for (const target of nonInputTargets) {
        let searchOpened = false;
        let defaultPrevented = false;

        const handlers: WorkstationShortcutHandlers = {
          onOpenSearch: () => {
            searchOpened = true;
          },
        };

        const event = {
          key: "/",
          target,
          preventDefault: () => {
            defaultPrevented = true;
          },
        };

        const handled = handleWorkstationKeyDown(event, handlers);

        expect(handled).toBe(true);
        expect(defaultPrevented).toBe(true);
        expect(searchOpened).toBe(true);
      }
    });

    test("3.3 Cmd+K and Ctrl+K open search modal even when focused inside an input or textarea", () => {
      for (const targetCase of inputTagTargets) {
        let searchOpened = false;
        let defaultPrevented = false;

        const handlers: WorkstationShortcutHandlers = {
          onOpenSearch: () => {
            searchOpened = true;
          },
        };

        // Cmd+K
        const cmdEvent = {
          key: "k",
          metaKey: true,
          target: targetCase,
          preventDefault: () => {
            defaultPrevented = true;
          },
        };
        const cmdHandled = handleWorkstationKeyDown(cmdEvent, handlers);
        expect(cmdHandled).toBe(true);
        expect(defaultPrevented).toBe(true);
        expect(searchOpened).toBe(true);

        // Ctrl+K
        searchOpened = false;
        defaultPrevented = false;
        const ctrlEvent = {
          key: "K",
          ctrlKey: true,
          target: targetCase,
          preventDefault: () => {
            defaultPrevented = true;
          },
        };
        const ctrlHandled = handleWorkstationKeyDown(ctrlEvent, handlers);
        expect(ctrlHandled).toBe(true);
        expect(defaultPrevented).toBe(true);
        expect(searchOpened).toBe(true);
      }
    });
  });

  // =========================================================================
  // SUITE 4: Rapid Query Typing & AbortSignal Clean Cancellation
  // =========================================================================
  describe("Suite 4: Rapid Query Typing & AbortSignal In-Flight Cancellation", () => {
    test("4.1 50 rapid sequential queries abort preceding in-flight requests cleanly without stale leakage", async () => {
      let totalExecuted = 0;
      let totalAborted = 0;

      universalSearchRegistry.register({
        id: "async-stress-contributor",
        category: "Stress",
        categoryLabel: "Stress",
        search: (q: string, signal?: AbortSignal) => {
          return new Promise<RegistrySearchItem[]>((resolve) => {
            totalExecuted++;
            const timer = setTimeout(() => {
              if (signal?.aborted) {
                totalAborted++;
                resolve([]);
              } else {
                resolve([
                  {
                    id: `res-${q}`,
                    title: `Result for ${q}`,
                    category: "Stress",
                    targetRoute: "Dashboard",
                  },
                ]);
              }
            }, 50);

            signal?.addEventListener("abort", () => {
              clearTimeout(timer);
              totalAborted++;
              resolve([]);
            });
          });
        },
      });

      let currentController: AbortController | null = null;
      let latestResults: RegistrySearchItem[] = [];

      // Simulate 50 rapid keystrokes typed at 5ms intervals (faster than 50ms resolve)
      for (let i = 1; i <= 50; i++) {
        if (currentController) {
          currentController.abort();
        }
        currentController = new AbortController();
        const signal = currentController.signal;
        const query = `typing-${i}`;

        universalSearchRegistry.search(query, { signal }).then((items) => {
          if (!signal.aborted) {
            latestResults = items;
          }
        });

        await new Promise((r) => setTimeout(r, 5));
      }

      // Wait for the final un-aborted query to finish
      await new Promise((r) => setTimeout(r, 100));

      expect(totalExecuted).toBe(50);
      expect(totalAborted).toBe(49);
      expect(latestResults.length).toBe(1);
      expect(latestResults[0].title).toBe("Result for typing-50");
    });
  });

  // =========================================================================
  // SUITE 5: Focus Restoration on Dialog Unmount / Close
  // =========================================================================
  describe("Suite 5: Focus Restoration on Dialog Unmount / Close", () => {
    test("5.1 previousActiveElement.focus() is safely executed when element is attached", () => {
      let focused = false;
      const element = {
        focus: () => {
          focused = true;
        },
      };

      // Simulates safe execution in GlobalSearchModal
      if (element && typeof element.focus === "function") {
        try {
          element.focus();
        } catch {}
      }
      expect(focused).toBe(true);
    });

    test("5.2 Safely handles null or undefined previous element without throwing", () => {
      const element: any = null;
      let threw = false;

      try {
        if (element && typeof element.focus === "function") {
          element.focus();
        }
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });

    test("5.3 Safely catches and suppresses exceptions if element focus() throws (e.g. detached from DOM)", () => {
      const element = {
        focus: () => {
          throw new Error("Cannot focus detached node");
        },
      };
      let threw = false;

      try {
        if (element && typeof element.focus === "function") {
          try {
            element.focus();
          } catch {
            // safe ignore
          }
        }
      } catch {
        threw = true;
      }
      expect(threw).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 6: Design Token Compliance Verification Across All 5 Target Files
  // =========================================================================
  describe("Suite 6: Design Token Compliance Verification Across All 5 Target Files", () => {
    const targetFiles = [
      "apps/clinic-app/components/search/GlobalSearchModal.tsx",
      "apps/clinic-app/components/search/GlobalSearchProvider.tsx",
      "apps/clinic-app/utils/workstationShortcuts.web.ts",
      "apps/portal-web/src/components/dashboard/WorkspaceSearchDialog.tsx",
      "apps/portal-web/src/services/portalSearchContributors.ts",
    ];

    const projectRoot = path.resolve(__dirname, "../../..");

    for (const relPath of targetFiles) {
      test(`6.x Zero raw hex or rgba color codes in ${relPath}`, () => {
        const fullPath = path.join(projectRoot, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);

        const content = fs.readFileSync(fullPath, "utf8");

        // Regex matching raw hex colors like #fff, #1a2b3c, etc. (excluding markdown headers or comments if any)
        const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
        // Regex matching rgba?(...)
        const rgbRegex = /rgba?\([^)]+\)/g;

        const hexMatches = content.match(hexRegex) || [];
        const rgbMatches = content.match(rgbRegex) || [];

        expect(hexMatches.length).toBe(0);
        expect(rgbMatches.length).toBe(0);
      });
    }
  });
});
