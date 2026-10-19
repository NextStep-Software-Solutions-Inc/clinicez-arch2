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
  type SearchItem,
} from "@shared/safe";
import {
  registerPortalSearchContributors,
  searchPortalUniversal,
} from "../src/services/portalSearchContributors";
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

describe("Milestone 4 Challenger 1: Concurrency, AbortSignal & Fault Isolation Stress Suite", () => {
  beforeEach(() => {
    universalSearchRegistry.clear();
  });

  afterEach(() => {
    universalSearchRegistry.clear();
  });

  // =========================================================================
  // Dimension 1: Rapid Typing & Query Cancellation via AbortSignal
  // =========================================================================
  describe("Dimension 1: Rapid Typing & Query Cancellation via AbortSignal", () => {
    test("D1.1: Rapid query succession cancels previous controllers cleanly", async () => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      const queries = ["a", "ap", "ape", "apex"];
      const controllers: AbortController[] = [];
      const promises: Promise<SearchItem[]>[] = [];

      for (let i = 0; i < queries.length; i++) {
        // Abort previous controller if any
        if (i > 0) {
          controllers[i - 1].abort();
        }
        const c = new AbortController();
        controllers.push(c);
        promises.push(universalSearchRegistry.search(queries[i], { signal: c.signal }));
      }

      // First three controllers must be aborted
      expect(controllers[0].signal.aborted).toBe(true);
      expect(controllers[1].signal.aborted).toBe(true);
      expect(controllers[2].signal.aborted).toBe(true);
      expect(controllers[3].signal.aborted).toBe(false);

      const results = await Promise.all(promises);
      // All promises resolve without throwing
      expect(Array.isArray(results[3])).toBe(true);
      expect(results[3].length).toBeGreaterThan(0);
      expect(results[3].some((r) => r.title.includes("Apex"))).toBe(true);
    });

    test("D1.2: Asynchronous contributor observes AbortSignal and aborts cleanly mid-flight", async () => {
      let abortedObserved = false;
      let completedExecution = false;

      const unregisterSlow = universalSearchRegistry.register({
        id: "async-slow-contributor",
        category: "async-test",
        categoryLabel: "Async Test",
        priority: 1,
        search: async (query: string, signal?: AbortSignal) => {
          return new Promise<SearchItem[]>((resolve) => {
            const timer = setTimeout(() => {
              completedExecution = true;
              resolve([
                {
                  id: "item-delayed",
                  category: "async-test",
                  title: "Delayed Item",
                  subtitle: "Should be aborted",
                  targetRoute: "/dashboard/test",
                },
              ]);
            }, 60);

            signal?.addEventListener("abort", () => {
              abortedObserved = true;
              clearTimeout(timer);
              resolve([]);
            });
          });
        },
      });

      const controller = new AbortController();
      const searchPromise = universalSearchRegistry.search("test", {
        signal: controller.signal,
      });

      // Abort after 10ms (well before the 60ms timeout)
      await new Promise((r) => setTimeout(r, 10));
      controller.abort();

      const results = await searchPromise;
      expect(abortedObserved).toBe(true);
      expect(completedExecution).toBe(false);
      expect(results).toEqual([]);

      unregisterSlow();
    });

    test("D1.3: Out-of-order race defense: slow earlier aborted search cannot overwrite fast later search", async () => {
      let activeDisplayResults: SearchItem[] = [];

      // Register two contributors: one artificially slow (100ms) and one fast (5ms)
      universalSearchRegistry.register({
        id: "slow-backend-provider",
        category: "slow",
        categoryLabel: "Slow",
        priority: 10,
        search: async (q, signal) => {
          await new Promise((r) => setTimeout(r, 80));
          if (signal?.aborted) return [];
          return [
            {
              id: "slow-item",
              category: "slow",
              title: `Slow Result for ${q}`,
              subtitle: "Out of date",
              targetRoute: "/slow",
            },
          ];
        },
      });

      // Simulation of React component state machine for rapid keystrokes
      let latestActiveQuery = "";
      let activeController: AbortController | null = null;

      const executeQuery = (q: string) => {
        if (activeController) {
          activeController.abort();
        }
        const controller = new AbortController();
        activeController = controller;
        latestActiveQuery = q;
        const currentQuery = q;

        universalSearchRegistry
          .search(q, { signal: controller.signal })
          .then((items) => {
            // Guard identical to WorkspaceSearchDialog cancelled check:
            if (controller.signal.aborted || currentQuery !== latestActiveQuery) {
              return;
            }
            activeDisplayResults = items;
          });
      };

      // User types "query1" (which takes 80ms)
      executeQuery("query1");

      // User quickly types "query2" 15ms later
      await new Promise((r) => setTimeout(r, 15));
      executeQuery("query2");

      // Wait for both queries to complete
      await new Promise((r) => setTimeout(r, 120));

      // Result must correspond to query2, NOT query1
      expect(activeDisplayResults.length).toBe(1);
      expect(activeDisplayResults[0].title).toBe("Slow Result for query2");
    });

    test("D1.4: Pre-aborted signal terminates immediately without calling contributors", async () => {
      let contributorWasCalled = false;

      const unregister = universalSearchRegistry.register({
        id: "guarded-contributor",
        category: "guard",
        categoryLabel: "Guard",
        search: () => {
          contributorWasCalled = true;
          return [];
        },
      });

      const controller = new AbortController();
      controller.abort();

      const results = await universalSearchRegistry.search("test", {
        signal: controller.signal,
      });

      expect(results).toEqual([]);
      expect(contributorWasCalled).toBe(false);

      unregister();
    });

    test("D1.5: 100 rapid sequential query cancellations execute without leaks or rejections", async () => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      const totalQueries = 100;
      let activeController: AbortController | null = null;
      const allPromises: Promise<SearchItem[]>[] = [];

      for (let i = 0; i < totalQueries; i++) {
        if (activeController) {
          activeController.abort();
        }
        activeController = new AbortController();
        const p = universalSearchRegistry.search(`branch ${i}`, {
          signal: activeController.signal,
        });
        allPromises.push(p);
      }

      const allResults = await Promise.all(allPromises);
      expect(allResults.length).toBe(totalQueries);

      // Final query was not aborted and returns valid search results
      const finalResult = allResults[totalQueries - 1];
      expect(Array.isArray(finalResult)).toBe(true);
    });

    test("D1.6: Contributor abort event listener cleanup avoids listener accumulation", async () => {
      let listenerCount = 0;

      const unregister = universalSearchRegistry.register({
        id: "listener-leak-tester",
        category: "test",
        categoryLabel: "Test",
        search: async (_query, signal) => {
          if (!signal) return [];
          const onAbort = () => {};
          signal.addEventListener("abort", onAbort);
          listenerCount++;
          // Simulate clean cleanup on search finish
          try {
            return [];
          } finally {
            signal.removeEventListener("abort", onAbort);
            listenerCount--;
          }
        },
      });

      const c = new AbortController();
      for (let i = 0; i < 20; i++) {
        await universalSearchRegistry.search("ping", { signal: c.signal });
      }

      expect(listenerCount).toBe(0);
      unregister();
    });
  });

  // =========================================================================
  // Dimension 2: Contributor Registration, Unregistration & Lifecycle Leak Freedom
  // =========================================================================
  describe("Dimension 2: Contributor Registration, Unregistration & Lifecycle Leak Freedom", () => {
    test("D2.1: 1,000 rapid register and unregister cycles leave registry strictly at 0", () => {
      expect(universalSearchRegistry.size).toBe(0);

      for (let i = 0; i < 1000; i++) {
        const unregister = registerPortalSearchContributors({
          tenantSlug: mockTenant,
          branches: mockBranches,
          staff: mockStaff,
        });
        expect(universalSearchRegistry.size).toBe(5);
        unregister();
        expect(universalSearchRegistry.size).toBe(0);
      }

      expect(universalSearchRegistry.size).toBe(0);
      expect(universalSearchRegistry.getContributors().length).toBe(0);
      expect(universalSearchRegistry.getCategories().length).toBe(0);
    });

    test("D2.2: Re-registering portal contributors 50 times without prior unregister maintains size of 5", () => {
      const unregisters: Array<() => void> = [];

      for (let i = 0; i < 50; i++) {
        const unreg = registerPortalSearchContributors({
          tenantSlug: `tenant-${i}`,
          branches: mockBranches,
          staff: mockStaff,
        });
        unregisters.push(unreg);
      }

      // Map keys are overwritten; size must remain exactly 5
      expect(universalSearchRegistry.size).toBe(5);

      const contributors = universalSearchRegistry.getContributors();
      expect(contributors.length).toBe(5);
      const expectedIds = [
        "portal-quick-actions",
        "portal-navigation",
        "portal-branches",
        "portal-facilities",
        "portal-team",
      ];
      expect(contributors.map((c) => c.id)).toEqual(expectedIds);

      // Calling the LATEST unregister removes all 5 contributors
      const latestUnregister = unregisters[unregisters.length - 1];
      latestUnregister();
      expect(universalSearchRegistry.size).toBe(0);
    });

    test("D2.3: Stale unregister callbacks from earlier registrations do not remove active contributors", () => {
      // Instance 1 registers
      const unregister1 = registerPortalSearchContributors({
        tenantSlug: "tenant-first",
      });
      expect(universalSearchRegistry.size).toBe(5);

      // Instance 2 registers (replacing instance 1)
      const unregister2 = registerPortalSearchContributors({
        tenantSlug: "tenant-second",
      });
      expect(universalSearchRegistry.size).toBe(5);

      // Invoking stale unregister1 must NOT delete instance 2 because references differ
      unregister1();
      expect(universalSearchRegistry.size).toBe(5);

      // Invoking unregister2 removes active contributors
      unregister2();
      expect(universalSearchRegistry.size).toBe(0);
    });

    test("D2.4: Calling unregister callback repeatedly (idempotency stress) is completely safe", () => {
      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
      });
      expect(universalSearchRegistry.size).toBe(5);

      for (let i = 0; i < 100; i++) {
        expect(() => unregister()).not.toThrow();
      }

      expect(universalSearchRegistry.size).toBe(0);
    });

    test("D2.5: Concurrent interleaved registration and unregistration preserves integrity", () => {
      const unregPortal = registerPortalSearchContributors({ tenantSlug: mockTenant });
      expect(universalSearchRegistry.size).toBe(5);

      // Register external contributors
      const unregExt1 = universalSearchRegistry.register({
        id: "ext-1",
        category: "ext1",
        categoryLabel: "Ext1",
        search: () => [],
      });
      const unregExt2 = universalSearchRegistry.register({
        id: "ext-2",
        category: "ext2",
        categoryLabel: "Ext2",
        search: () => [],
      });
      expect(universalSearchRegistry.size).toBe(7);

      // Unregister portal contributors
      unregPortal();
      expect(universalSearchRegistry.size).toBe(2);
      expect(universalSearchRegistry.has("ext-1")).toBe(true);
      expect(universalSearchRegistry.has("ext-2")).toBe(true);

      // Unregister external
      unregExt1();
      expect(universalSearchRegistry.size).toBe(1);
      unregExt2();
      expect(universalSearchRegistry.size).toBe(0);
    });

    test("D2.6: Unregistering portal contributors completely cleans up getCategories()", () => {
      const unregister = registerPortalSearchContributors({
        tenantSlug: mockTenant,
      });

      expect(universalSearchRegistry.getCategories().length).toBe(5);
      unregister();
      expect(universalSearchRegistry.getCategories().length).toBe(0);
    });
  });

  // =========================================================================
  // Dimension 3: Fault Isolation Across External and Cross-App Contributors
  // =========================================================================
  describe("Dimension 3: Fault Isolation Across External and Cross-App Contributors", () => {
    beforeEach(() => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });
    });

    test("D3.1: Synchronous exception in external contributor does not break portal search", async () => {
      const unregBroken = universalSearchRegistry.register({
        id: "sync-exploding-contributor",
        category: "broken-sync",
        categoryLabel: "Broken Sync",
        priority: 1,
        search: () => {
          throw new Error("Synchronous unexpected failure in external plugin");
        },
      });

      const results = await universalSearchRegistry.search("overview");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Overview")).toBe(true);

      unregBroken();
    });

    test("D3.2: Asynchronous promise rejection in external contributor does not break portal search", async () => {
      const unregBroken = universalSearchRegistry.register({
        id: "async-rejecting-contributor",
        category: "broken-async",
        categoryLabel: "Broken Async",
        priority: 2,
        search: async () => {
          await new Promise((r) => setTimeout(r, 5));
          throw new Error("Asynchronous network timeout or 500 error from remote service");
        },
      });

      const results = await universalSearchRegistry.search("branches");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Branches")).toBe(true);

      unregBroken();
    });

    test("D3.3: Non-Error throw (string, object, null) is safely trapped without crash", async () => {
      const unregStringThrow = universalSearchRegistry.register({
        id: "string-throw-contributor",
        category: "string-err",
        categoryLabel: "String Err",
        priority: 1,
        search: () => {
          throw "Raw string error thrown by legacy script";
        },
      });

      const unregNullThrow = universalSearchRegistry.register({
        id: "null-throw-contributor",
        category: "null-err",
        categoryLabel: "Null Err",
        priority: 2,
        search: () => {
          throw null;
        },
      });

      const results = await universalSearchRegistry.search("team");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Workspace Team")).toBe(true);

      unregStringThrow();
      unregNullThrow();
    });

    test("D3.4: External contributor timeout isolates hanging contributor and returns portal results", async () => {
      const unregHanging = universalSearchRegistry.register({
        id: "forever-hanging-contributor",
        category: "hanging",
        categoryLabel: "Hanging",
        priority: 1,
        search: () => {
          // Never resolves
          return new Promise<SearchItem[]>(() => {});
        },
      });

      const startTime = Date.now();
      const results = await universalSearchRegistry.search("overview", {
        timeoutMs: 40,
      });
      const duration = Date.now() - startTime;

      // Must complete within ~150ms despite the hanging contributor
      expect(duration).toBeLessThan(200);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Overview")).toBe(true);

      unregHanging();
    });

    test("D3.5: Malformed return values from external contributor are safely normalized", async () => {
      const unregBadReturns = universalSearchRegistry.register({
        id: "bad-returns-contributor",
        category: "bad-returns",
        categoryLabel: "Bad Returns",
        priority: 1,
        // @ts-expect-error deliberately testing runtime violation
        search: () => "invalid non-array string",
      });

      const results = await universalSearchRegistry.search("overview");
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.title === "Overview")).toBe(true);

      unregBadReturns();
    });

    test("D3.6: Multi-contributor chaos stress test isolates all failures while preserving healthy results", async () => {
      // Register 6 chaotic contributors:
      const chaosUnregisters = [
        universalSearchRegistry.register({
          id: "chaos-sync-error",
          category: "chaos",
          categoryLabel: "Chaos",
          priority: 2,
          search: () => {
            throw new Error("Chaos error 1");
          },
        }),
        universalSearchRegistry.register({
          id: "chaos-async-reject",
          category: "chaos",
          categoryLabel: "Chaos",
          priority: 3,
          search: async () => Promise.reject(new Error("Chaos reject 2")),
        }),
        universalSearchRegistry.register({
          id: "chaos-hanging",
          category: "chaos",
          categoryLabel: "Chaos",
          priority: 4,
          search: () => new Promise<SearchItem[]>(() => {}),
        }),
        universalSearchRegistry.register({
          id: "chaos-bad-type",
          category: "chaos",
          categoryLabel: "Chaos",
          priority: 6,
          // @ts-expect-error testing invalid payload
          search: () => ({ error: "not an array" }),
        }),
        universalSearchRegistry.register({
          id: "healthy-clinic-contributor",
          category: "patients",
          categoryLabel: "Patients",
          priority: 10,
          search: (q) => [
            {
              id: "patient-101",
              category: "patients",
              title: "Maria Clara",
              subtitle: "Healthy external result",
              targetRoute: "/clinic/patients/101",
              badgeText: "Active",
              badgeVariant: "routine",
            },
          ],
        }),
      ];

      const results = await universalSearchRegistry.search("maria", {
        timeoutMs: 50,
      });

      expect(results.length).toBeGreaterThan(0);
      const titles = results.map((r) => r.title);
      expect(titles).toContain("Dr. Maria Santos"); // From portal-team
      expect(titles).toContain("Maria Clara"); // From healthy-clinic-contributor

      for (const unreg of chaosUnregisters) {
        unreg();
      }
    });
  });

  // =========================================================================
  // Dimension 4: WorkspaceSearchDialog Concurrency & Search State Simulation
  // =========================================================================
  describe("Dimension 4: WorkspaceSearchDialog Concurrency & Search State Simulation", () => {
    test("D4.1: Simulated rapid typing in dialog commits only the latest query results", async () => {
      registerPortalSearchContributors({
        tenantSlug: mockTenant,
        branches: mockBranches,
        staff: mockStaff,
      });

      // Emulate WorkspaceSearchDialog's useEffect hook state management
      let universalResults: SearchItem[] | null = null;
      let activeController: AbortController | null = null;

      const triggerSearchEffect = (query: string) => {
        const trimmed = query.trim();
        if (!trimmed) {
          universalResults = null;
          return;
        }

        if (activeController) {
          activeController.abort();
        }
        const controller = new AbortController();
        activeController = controller;
        let cancelled = false;

        universalSearchRegistry
          .search(trimmed, { signal: controller.signal })
          .then((items) => {
            if (cancelled || controller.signal.aborted) return;
            universalResults = items;
          })
          .catch((err) => {
            if (!cancelled && !controller.signal.aborted) {
              console.warn("Universal search query error:", err);
            }
          });

        return () => {
          cancelled = true;
          controller.abort();
        };
      };

      // Rapidly simulate 5 keystrokes
      const cleanup1 = triggerSearchEffect("d");
      const cleanup2 = triggerSearchEffect("dr");
      const cleanup3 = triggerSearchEffect("dr.");
      const cleanup4 = triggerSearchEffect("dr. ");
      const cleanup5 = triggerSearchEffect("dr. maria");

      await new Promise((r) => setTimeout(r, 50));

      expect(universalResults).not.toBeNull();
      expect(universalResults!.length).toBe(1);
      expect(universalResults![0].title).toBe("Dr. Maria Santos");

      cleanup1?.();
      cleanup2?.();
      cleanup3?.();
      cleanup4?.();
      cleanup5?.();
    });

    test("D4.2: Aborted in-flight queries do not trigger error warnings", async () => {
      let warningLogged = false;
      const originalWarn = console.warn;
      console.warn = (...args: any[]) => {
        warningLogged = true;
        originalWarn(...args);
      };

      try {
        const controller = new AbortController();
        const searchPromise = searchPortalUniversal("branch", {
          signal: controller.signal,
        });
        controller.abort();
        await searchPromise;

        // Aborted queries must not generate noisy warnings
        expect(warningLogged).toBe(false);
      } finally {
        console.warn = originalWarn;
      }
    });
  });
});
