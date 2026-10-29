import { describe, test, expect, mock, beforeEach } from "bun:test";
import React from "react";
import fs from "fs";
import path from "path";
import { renderToString } from "react-dom/server";

let mockTenantParam: string | string[] | undefined = "nextstep";
let mockPathname = "/nextstep/dashboard/team";
const pushedUrls: string[] = [];
const openUserProfileCalls: unknown[] = [];
const signOutCalls: unknown[] = [];

mock.module("next/navigation", () => ({
  useParams: () => (mockTenantParam !== undefined ? { tenant: mockTenantParam } : {}),
  useRouter: () => ({
    push: (url: string) => {
      pushedUrls.push(url);
    },
    replace: () => {},
    prefetch: () => {},
    refresh: () => {},
    back: () => {},
    forward: () => {},
  }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

mock.module("@clerk/nextjs", () => ({
  useClerk: () => ({
    openUserProfile: (opts?: unknown) => {
      openUserProfileCalls.push(opts);
    },
    signOut: async (opts?: unknown) => {
      signOutCalls.push(opts);
    },
  }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useAuth: () => ({
    isLoaded: true,
    isSignedIn: false,
    userId: null,
    getToken: async () => null,
  }),
  useSignIn: () => ({ isLoaded: true, signIn: null }),
  useSignUp: () => ({ isLoaded: true, signUp: null, setActive: async () => {} }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignedIn: () => null,
  SignedOut: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignInButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SignUpButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UserButton: () => <div data-testid="clerk-user-button" />,
  SignOutButton: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import {
  NavUser,
  createNavUserActions,
  getSubscriptionPlansHref,
  getUserInitials,
} from "../src/components/dashboard/nav-user";
import {
  NotificationsDialog,
  NotificationsDialogBody,
  getNotificationSeverityMeta,
} from "../src/components/dashboard/NotificationsDialog";
import { NotificationPopover } from "../src/components/dashboard/NotificationPopover";
import { MfaRequiredGate } from "../src/components/dashboard/MfaRequiredGate";
import { Dialog } from "../src/components/ui/dialog";
import { SidebarProvider } from "../src/components/ui/sidebar";
import {
  CLERK_PORTAL_APPEARANCE,
  sanitizeStaleClerkBillingHash,
} from "../src/lib/clerkAppearance";
import {
  buildPortalNotificationsKey,
  buildMarkAllNotificationsReadUrl,
  formatNotificationRelativeTime,
  sanitizeNotificationActionUrl,
  applyMarkNotificationRead,
  applyMarkAllNotificationsRead,
  filterNotifications,
  fetchPortalNotifications,
  type PortalNotificationItem,
  type PortalNotificationListPayload,
} from "../src/hooks/usePortalNotifications";
import { apiClient } from "../src/transport/apiClient";

const portalSrcRoot = path.resolve(__dirname, "../src");

describe("Issue #117 — Workspace Team Profile Menu Navigation & Clerk Billing Suppression", () => {
  beforeEach(() => {
    mockTenantParam = "nextstep";
    mockPathname = "/nextstep/dashboard/team";
    pushedUrls.length = 0;
    openUserProfileCalls.length = 0;
    signOutCalls.length = 0;
  });

  describe("R1: Subscription Plans Route Resolution", () => {
    test("maps active workspace tenant slug to canonical /[tenant]/dashboard/billing?tab=plans route", () => {
      expect(getSubscriptionPlansHref("nextstep")).toBe(
        "/nextstep/dashboard/billing?tab=plans",
      );
      expect(getSubscriptionPlansHref("  apex-health  ")).toBe(
        "/apex-health/dashboard/billing?tab=plans",
      );
    });

    test("handles array route params and safely URL-encodes special characters", () => {
      expect(getSubscriptionPlansHref(["st-lukes"])).toBe(
        "/st-lukes/dashboard/billing?tab=plans",
      );
      expect(getSubscriptionPlansHref("clinic one")).toBe(
        "/clinic%20one/dashboard/billing?tab=plans",
      );
    });

    test("falls back to /pricing when outside a tenant context", () => {
      expect(getSubscriptionPlansHref(undefined)).toBe("/pricing");
      expect(getSubscriptionPlansHref(null)).toBe("/pricing");
      expect(getSubscriptionPlansHref("")).toBe("/pricing");
      expect(getSubscriptionPlansHref("   ")).toBe("/pricing");
      expect(getSubscriptionPlansHref([])).toBe("/pricing");
    });
  });

  describe("R2: User Avatar Initials Computation", () => {
    test("computes two-letter uppercase initials and strips clinical honorifics", () => {
      expect(getUserInitials("Justine Mae", "justine@clinicez.net")).toBe("JM");
      expect(getUserInitials("Dr. Admin", "admin@clinicez.net")).toBe("AD");
      expect(getUserInitials("Dr. Maria Clara Santos", "maria@clinicez.net")).toBe("MS");
    });

    test("falls back to single word, email initial, or U without hardcoded CN", () => {
      expect(getUserInitials("Reception", "desk@clinicez.net")).toBe("RE");
      expect(getUserInitials("", "biller@clinicez.net")).toBe("B");
      expect(getUserInitials("   ", "")).toBe("U");
      expect(getUserInitials(null, null)).toBe("U");
    });
  });

  describe("R3: Clerk Subscription / Billing Tab Suppression (Not Using Clerk Subscription API)", () => {
    test("CLERK_PORTAL_APPEARANCE explicitly hides Clerk Billing navbar tab, mobile menu item, page, and sections", () => {
      expect(CLERK_PORTAL_APPEARANCE.elements.navbarButton__billing).toEqual({
        display: "none",
      });
      expect(CLERK_PORTAL_APPEARANCE.elements.menuItem__billing).toEqual({
        display: "none",
      });
      expect(CLERK_PORTAL_APPEARANCE.elements.profilePage__billing).toEqual({
        display: "none",
      });
      expect(CLERK_PORTAL_APPEARANCE.elements.profileSection__subscriptionsList).toEqual({
        display: "none",
      });
      expect(CLERK_PORTAL_APPEARANCE.elements.profileSection__paymentMethods).toEqual({
        display: "none",
      });
      expect(CLERK_PORTAL_APPEARANCE.elements.profileSection__accountCredits).toEqual({
        display: "none",
      });
    });

    test("sanitizeStaleClerkBillingHash strips stale #/billing hashes while preserving Next.js history.state", () => {
      const calls: Array<{ state: unknown; url: string }> = [];
      const nextRouterState = { __NA: true, tree: ["nextstep", "dashboard"] };
      const mockHistory = {
        state: nextRouterState,
        replaceState: (data: unknown, _unused: string, url?: string | URL | null) => {
          calls.push({ state: data, url: String(url ?? "") });
        },
      };

      sanitizeStaleClerkBillingHash(
        { hash: "#/billing", pathname: "/nextstep/dashboard/team", search: "" },
        mockHistory,
      );
      expect(calls).toEqual([
        { state: nextRouterState, url: "/nextstep/dashboard/team" },
      ]);

      calls.length = 0;
      sanitizeStaleClerkBillingHash(
        { hash: "#billing/plans", pathname: "/nextstep/dashboard/team", search: "?role=Admin" },
        mockHistory,
      );
      expect(calls).toEqual([
        { state: nextRouterState, url: "/nextstep/dashboard/team?role=Admin" },
      ]);

      // Clean URLs and unrelated anchors must never be mutated
      calls.length = 0;
      sanitizeStaleClerkBillingHash(
        { hash: "", pathname: "/nextstep/dashboard/team", search: "" },
        mockHistory,
      );
      sanitizeStaleClerkBillingHash(
        { hash: "#overview", pathname: "/nextstep/dashboard/team", search: "" },
        mockHistory,
      );
      expect(calls).toEqual([]);
    });

    test("RootLayout, ApiProvider, and globals.css enforce global Clerk Billing suppression & hash cleanup", () => {
      const layoutSrc = fs.readFileSync(
        path.join(portalSrcRoot, "app/layout.tsx"),
        "utf8",
      );
      expect(layoutSrc).toContain("CLERK_PORTAL_APPEARANCE");
      expect(layoutSrc).toContain('afterSignOutUrl="/"');
      expect(layoutSrc).toContain("appearance={CLERK_PORTAL_APPEARANCE}");

      const apiProviderSrc = fs.readFileSync(
        path.join(portalSrcRoot, "components/providers/ApiProvider.tsx"),
        "utf8",
      );
      expect(apiProviderSrc).toContain("sanitizeStaleClerkBillingHash");
      expect(apiProviderSrc).toContain('"hashchange"');
      expect(apiProviderSrc).toContain('"popstate"');

      const globalsCss = fs.readFileSync(
        path.join(portalSrcRoot, "app/globals.css"),
        "utf8",
      );
      expect(globalsCss).toContain(".cl-navbarButton__billing");
      expect(globalsCss).toContain(".cl-menuItem__billing");
      expect(globalsCss).toContain(".cl-profilePage__billing");
      expect(globalsCss).toContain('button[data-localization-key="userProfile.navbar.billing"]');
      expect(globalsCss).toContain('[role="menuitem"][data-localization-key="userProfile.navbar.billing"]');
      expect(globalsCss).toContain("display: none !important;");
    });
  });

  describe("R4: Behavioral Execution of All 4 Profile Menu Actions (createNavUserActions)", () => {
    test("Account action suppresses dropdown close auto-focus, closes menus, sanitizes hash, releases lock, and opens Clerk UserProfile on next tick", () => {
      let dropdownOpen = true;
      let mobileOpen = true;
      let hashSanitized = false;
      let closeAutoFocusSuppressed = false;
      let scrollLockReleased = false;
      const clerkCalls: unknown[] = [];
      const scheduledCallbacks: Array<() => void> = [];

      const actions = createNavUserActions({
        tenant: "nextstep",
        isMobile: true,
        setDropdownOpen: (v) => {
          dropdownOpen = v;
        },
        setOpenMobile: (v) => {
          mobileOpen = v;
        },
        openUserProfile: (props) => {
          clerkCalls.push(props);
        },
        pushRoute: () => {
          throw new Error("Account must not navigate routes");
        },
        openNotificationsModal: () => {
          throw new Error("Account must not open notifications");
        },
        signOut: () => {
          throw new Error("Account must not sign out");
        },
        sanitizeHash: () => {
          hashSanitized = true;
        },
        suppressDropdownCloseAutoFocus: () => {
          closeAutoFocusSuppressed = true;
        },
        releaseBodyScrollLock: () => {
          scrollLockReleased = true;
        },
        scheduleNextTick: (cb) => {
          scheduledCallbacks.push(cb);
        },
      });

      actions.handleOpenAccount();
      expect(closeAutoFocusSuppressed).toBe(true);
      expect(dropdownOpen).toBe(false);
      expect(mobileOpen).toBe(false);
      expect(hashSanitized).toBe(true);
      expect(clerkCalls).toHaveLength(0);

      expect(scheduledCallbacks).toHaveLength(1);
      scheduledCallbacks[0]();
      expect(scrollLockReleased).toBe(true);
      expect(clerkCalls).toEqual([{ appearance: CLERK_PORTAL_APPEARANCE }]);
    });

    test("Subscription Plans action navigates to /[tenant]/dashboard/billing?tab=plans instead of Clerk modal", () => {
      let dropdownOpen = true;
      const routes: string[] = [];

      const actions = createNavUserActions({
        tenant: "nextstep",
        isMobile: false,
        setDropdownOpen: (v) => {
          dropdownOpen = v;
        },
        openUserProfile: () => {
          throw new Error("Subscription Plans must NOT open Clerk UserProfile modal");
        },
        pushRoute: (href) => {
          routes.push(href);
        },
        openNotificationsModal: () => {},
        signOut: () => {},
      });

      actions.handleNavigateSubscriptionPlans();
      expect(dropdownOpen).toBe(false);
      expect(routes).toEqual(["/nextstep/dashboard/billing?tab=plans"]);
    });

    test("Notifications action suppresses close auto-focus, closes dropdown & mobile sheet, releases lock, and opens NotificationsDialog without redirecting to settings", () => {
      let dropdownOpen = true;
      let mobileOpen = true;
      let notificationsOpened = false;
      let closeAutoFocusSuppressed = false;
      let scrollLockReleased = false;
      const routes: string[] = [];
      const scheduledCallbacks: Array<() => void> = [];

      const actions = createNavUserActions({
        tenant: "nextstep",
        isMobile: true,
        setDropdownOpen: (v) => {
          dropdownOpen = v;
        },
        setOpenMobile: (v) => {
          mobileOpen = v;
        },
        openUserProfile: () => {},
        pushRoute: (href) => {
          routes.push(href);
        },
        openNotificationsModal: () => {
          notificationsOpened = true;
        },
        signOut: () => {},
        suppressDropdownCloseAutoFocus: () => {
          closeAutoFocusSuppressed = true;
        },
        releaseBodyScrollLock: () => {
          scrollLockReleased = true;
        },
        scheduleNextTick: (cb) => {
          scheduledCallbacks.push(cb);
        },
      });

      actions.handleOpenNotifications();
      expect(closeAutoFocusSuppressed).toBe(true);
      expect(dropdownOpen).toBe(false);
      expect(mobileOpen).toBe(false);
      expect(notificationsOpened).toBe(false);
      expect(routes).toEqual([]);

      expect(scheduledCallbacks).toHaveLength(1);
      scheduledCallbacks[0]();
      expect(scrollLockReleased).toBe(true);
      expect(notificationsOpened).toBe(true);
      expect(routes).toEqual([]);
    });

    test("Log out action closes menus and invokes Clerk signOut with redirectUrl '/'", () => {
      let dropdownOpen = true;
      const signOutOpts: unknown[] = [];

      const actions = createNavUserActions({
        tenant: "nextstep",
        isMobile: false,
        setDropdownOpen: (v) => {
          dropdownOpen = v;
        },
        openUserProfile: () => {},
        pushRoute: () => {},
        openNotificationsModal: () => {},
        signOut: (opts) => {
          signOutOpts.push(opts);
        },
      });

      actions.handleSignOut();
      expect(dropdownOpen).toBe(false);
      expect(signOutOpts).toEqual([{ redirectUrl: "/" }]);
    });
  });

  describe("R5: Portal Notifications Scoping, State Transitions & URL Sanitization", () => {
    const sampleNotifications: PortalNotificationItem[] = [
      {
        id: "n-1",
        tenantId: "t-1",
        title: "Seat limit approaching",
        body: "9 of 10 staff seats allocated.",
        category: "Quota",
        severity: "Warning",
        actionUrl: "/nextstep/dashboard/plan",
        isRead: false,
        createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
      },
      {
        id: "n-2",
        tenantId: "t-1",
        title: "Lab analyzer offline",
        body: "Main branch hematology link disconnected.",
        category: "System",
        severity: "Critical",
        actionUrl: "javascript:alert(1)",
        isRead: true,
        createdAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      },
      {
        id: "n-3",
        tenantId: "t-1",
        title: "Status Page Advisory",
        body: "Scheduled maintenance window published.",
        category: "System",
        severity: "Info",
        actionUrl: "https://status.clinicez.net/incidents/42",
        isRead: false,
        createdAt: new Date(Date.now() - 15 * 60_000).toISOString(),
      },
    ];

    test("buildPortalNotificationsKey and buildMarkAllNotificationsReadUrl scope requests to active workspace slug", () => {
      expect(buildPortalNotificationsKey("nextstep")).toBe(
        "/portal/notifications?tenantSlug=nextstep",
      );
      expect(buildPortalNotificationsKey(["clinic one"])).toBe(
        "/portal/notifications?tenantSlug=clinic%20one",
      );
      expect(buildPortalNotificationsKey(undefined)).toBe("/portal/notifications");
      expect(buildPortalNotificationsKey("")).toBe("/portal/notifications");

      expect(buildMarkAllNotificationsReadUrl("nextstep")).toBe(
        "/portal/notifications/read-all?tenantSlug=nextstep",
      );
      expect(buildMarkAllNotificationsReadUrl(undefined)).toBe(
        "/portal/notifications/read-all",
      );
    });

    test("sanitizeNotificationActionUrl permits safe paths and HTTPS URLs while blocking XSS schemes", () => {
      expect(sanitizeNotificationActionUrl("/nextstep/dashboard/team")).toBe(
        "/nextstep/dashboard/team",
      );
      expect(sanitizeNotificationActionUrl("https://dev.clinicez.net/nextstep/dashboard")).toBe(
        "https://dev.clinicez.net/nextstep/dashboard",
      );
      expect(sanitizeNotificationActionUrl("javascript:alert(1)")).toBeNull();
      expect(sanitizeNotificationActionUrl("  JAVASCRIPT:void(0) ")).toBeNull();
      expect(sanitizeNotificationActionUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
      expect(sanitizeNotificationActionUrl("//evil.example.com/phish")).toBeNull();
      expect(sanitizeNotificationActionUrl("/\\evil.example.com")).toBeNull();
      expect(sanitizeNotificationActionUrl("")).toBeNull();
      expect(sanitizeNotificationActionUrl(null)).toBeNull();
      expect(sanitizeNotificationActionUrl(undefined)).toBeNull();
    });

    test("applyMarkNotificationRead marks target item read and is idempotent against duplicate clicks", () => {
      const initial: PortalNotificationListPayload = {
        items: sampleNotifications,
        unreadCount: 2,
      };

      const afterFirst = applyMarkNotificationRead(initial, "n-1");
      expect(afterFirst.unreadCount).toBe(1);
      expect(afterFirst.items.find((i) => i.id === "n-1")?.isRead).toBe(true);

      // Rapid double-click on an already-read item must not underflow or decrement again
      const afterDuplicate = applyMarkNotificationRead(afterFirst, "n-1");
      expect(afterDuplicate.unreadCount).toBe(1);
    });

    test("applyMarkAllNotificationsRead sets all items to read and zeroes unreadCount", () => {
      const initial: PortalNotificationListPayload = {
        items: sampleNotifications,
        unreadCount: 2,
      };
      const updated = applyMarkAllNotificationsRead(initial);
      expect(updated.unreadCount).toBe(0);
      expect(updated.items.every((i) => i.isRead)).toBe(true);
    });

    test("filterNotifications filters all vs unread items accurately", () => {
      expect(filterNotifications(sampleNotifications, "all")).toHaveLength(3);
      expect(filterNotifications(sampleNotifications, "unread")).toHaveLength(2);
      expect(filterNotifications(sampleNotifications, "unread")[0].id).toBe("n-1");
    });

    test("formatNotificationRelativeTime handles seconds, minutes, hours, and invalid dates", () => {
      const now = Date.UTC(2026, 9, 27, 12, 0, 0);
      expect(formatNotificationRelativeTime(new Date(now - 15_000).toISOString(), now)).toBe(
        "Just now",
      );
      expect(formatNotificationRelativeTime(new Date(now - 12 * 60_000).toISOString(), now)).toBe(
        "12m ago",
      );
      expect(formatNotificationRelativeTime(new Date(now - 4 * 3600_000).toISOString(), now)).toBe(
        "4h ago",
      );
      expect(formatNotificationRelativeTime("not-a-valid-date", now)).toBe("not-a-valid-date");
    });

    test("fetchPortalNotifications normalizes backend ApiResponse envelope and throws on succeeded=false", async () => {
      const origGet = apiClient.get;
      try {
        (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => ({
          data: {
            succeeded: true,
            data: {
              items: sampleNotifications,
              unreadCount: -5,
            },
          },
        })) as unknown as typeof apiClient.get;

        const res = await fetchPortalNotifications("/portal/notifications?tenantSlug=nextstep");
        expect(res.items).toHaveLength(3);
        expect(res.unreadCount).toBe(0);

        (apiClient as unknown as { get: typeof apiClient.get }).get = (async () => ({
          data: {
            succeeded: false,
            message: "Service temporarily unavailable",
          },
        })) as unknown as typeof apiClient.get;

        await expect(fetchPortalNotifications()).rejects.toThrow(
          "Service temporarily unavailable",
        );
      } finally {
        apiClient.get = origGet;
      }
    });

    test("NotificationsDialogBody renders all 4 UI states, accessible filter group, and safe external/internal links", () => {
      // 1. Skeleton Loading State
      const loadingHtml = renderToString(
        <Dialog open>
          <NotificationsDialogBody
            notifications={[]}
            unreadCount={0}
            isLoading={true}
            error={null}
            filter="all"
            onFilterChange={() => {}}
            onMarkAsRead={() => {}}
            onMarkAllAsRead={() => {}}
            onRefresh={() => {}}
            onClose={() => {}}
          />
        </Dialog>,
      );
      expect(loadingHtml).toContain('aria-label="Loading notifications"');

      // 2. Error + Retry State
      const errorHtml = renderToString(
        <Dialog open>
          <NotificationsDialogBody
            notifications={[]}
            unreadCount={0}
            isLoading={false}
            error={new Error("Network timeout")}
            filter="all"
            onFilterChange={() => {}}
            onMarkAsRead={() => {}}
            onMarkAllAsRead={() => {}}
            onRefresh={() => {}}
            onClose={() => {}}
          />
        </Dialog>,
      );
      expect(errorHtml).toContain("Unable to load notifications");
      expect(errorHtml).toContain("Try again");

      // 3. Empty States (All & Unread)
      const emptyAllHtml = renderToString(
        <Dialog open>
          <NotificationsDialogBody
            notifications={[]}
            unreadCount={0}
            isLoading={false}
            error={null}
            filter="all"
            onFilterChange={() => {}}
            onMarkAsRead={() => {}}
            onMarkAllAsRead={() => {}}
            onRefresh={() => {}}
            onClose={() => {}}
          />
        </Dialog>,
      );
      expect(emptyAllHtml).toContain("No notifications");

      const emptyUnreadHtml = renderToString(
        <Dialog open>
          <NotificationsDialogBody
            notifications={[sampleNotifications[1]]}
            unreadCount={0}
            isLoading={false}
            error={null}
            filter="unread"
            onFilterChange={() => {}}
            onMarkAsRead={() => {}}
            onMarkAllAsRead={() => {}}
            onRefresh={() => {}}
            onClose={() => {}}
          />
        </Dialog>,
      );
      expect(emptyUnreadHtml).toContain("No unread notifications");
      expect(emptyUnreadHtml).toContain("Show all notifications");

      // 4. Active State (Internal Link, External Link with noopener noreferrer, Blocked javascript: URL)
      const activeHtml = renderToString(
        <Dialog open>
          <NotificationsDialogBody
            notifications={sampleNotifications}
            unreadCount={2}
            isLoading={false}
            error={null}
            filter="all"
            onFilterChange={() => {}}
            onMarkAsRead={() => {}}
            onMarkAllAsRead={() => {}}
            onRefresh={() => {}}
            onClose={() => {}}
          />
        </Dialog>,
      );
      expect(activeHtml).toContain('role="group"');
      expect(activeHtml).toContain('aria-pressed="true"');
      expect(activeHtml).toContain('href="/nextstep/dashboard/plan"');
      expect(activeHtml).toContain('href="https://status.clinicez.net/incidents/42"');
      expect(activeHtml).toContain('rel="noopener noreferrer"');
      expect(activeHtml).not.toContain("javascript:");
    });
  });

  describe("R6: NavUser, AppSidebar, NotificationsDialog & NotificationPopover Contracts", () => {
    test("nav-user.tsx contains zero broken settings redirects, zero URL hash mutations, and mobile unmount safety", () => {
      const navUserSrc = fs.readFileSync(
        path.join(portalSrcRoot, "components/dashboard/nav-user.tsx"),
        "utf8",
      );

      expect(navUserSrc).not.toContain("window.location.hash");
      expect(navUserSrc).not.toContain("#/billing");
      expect(navUserSrc).not.toContain("/dashboard/settings");
      expect(navUserSrc).not.toContain("/admin/settings");
      expect(navUserSrc).not.toContain("clearTimeout");
      expect(navUserSrc).toContain("onCloseAutoFocus={handleDropdownCloseAutoFocus}");
      expect(navUserSrc).toContain("getSubscriptionPlansHref");
      expect(navUserSrc).toContain("CLERK_PORTAL_APPEARANCE");
      expect(navUserSrc).toContain("NotificationsDialog");
      expect(navUserSrc).toContain('redirectUrl: "/"');
    });

    test("NotificationPopover uses Radix Popover (not DropdownMenu role='menu') and high-contrast text-white badge", () => {
      const popoverSrc = fs.readFileSync(
        path.join(portalSrcRoot, "components/dashboard/NotificationPopover.tsx"),
        "utf8",
      );

      expect(popoverSrc).toContain("@/components/ui/popover");
      expect(popoverSrc).not.toContain("@/components/ui/dropdown-menu");
      expect(popoverSrc).toContain("bg-destructive");
      expect(popoverSrc).toContain("text-white");
      expect(popoverSrc).not.toContain("text-primary-foreground");
    });

    test("app-sidebar.tsx mounts NotificationsDialog outside Sidebar Sheet so mobile close never unmounts it", () => {
      const sidebarSrc = fs.readFileSync(
        path.join(portalSrcRoot, "components/dashboard/app-sidebar.tsx"),
        "utf8",
      );

      const sidebarCloseIdx = sidebarSrc.indexOf("</Sidebar>");
      const dialogIdx = sidebarSrc.indexOf("<NotificationsDialog");
      expect(sidebarCloseIdx).toBeGreaterThan(-1);
      expect(dialogIdx).toBeGreaterThan(sidebarCloseIdx);
    });

    test("NavUser, NotificationPopover, NotificationsDialog, and MfaRequiredGate render cleanly in SSR", () => {
      const navHtml = renderToString(
        <SidebarProvider>
          <NavUser
            user={{
              name: "Dr. Justine Mae",
              email: "justine@clinicez.net",
              avatar: "",
              role: "Member",
            }}
          />
        </SidebarProvider>,
      );
      expect(navHtml).toContain("Dr. Justine Mae");
      expect(navHtml).toContain("justine@clinicez.net");
      expect(navHtml).toContain("JM");
      expect(navHtml).not.toContain(">CN<");

      const popoverHtml = renderToString(<NotificationPopover />);
      expect(popoverHtml).toContain("Notifications");

      const dialogClosedHtml = renderToString(
        <NotificationsDialog open={false} onOpenChange={() => {}} />,
      );
      expect(typeof dialogClosedHtml).toBe("string");

      const mfaHtml = renderToString(<MfaRequiredGate workspaceName="NextStep Clinic" />);
      expect(mfaHtml).toContain("NextStep Clinic");
      expect(mfaHtml).toContain("Open account security");
    });

    test("getNotificationSeverityMeta maps Critical, Warning, and Info to semantic badge classes", () => {
      expect(getNotificationSeverityMeta("Critical").label).toBe("Critical");
      expect(getNotificationSeverityMeta("Critical").badgeClass).toContain("text-destructive");
      expect(getNotificationSeverityMeta("Warning").label).toBe("Warning");
      expect(getNotificationSeverityMeta("Warning").badgeClass).toContain("text-warning");
      expect(getNotificationSeverityMeta("Info").label).toBe("Notice");
      expect(getNotificationSeverityMeta("Info").badgeClass).toContain("text-primary");
    });
  });

  describe("R7: ClinicEZ UI/UX Design Token Compliance Gate", () => {
    const touchedFiles = [
      "lib/clerkAppearance.ts",
      "hooks/usePortalNotifications.ts",
      "components/ui/popover.tsx",
      "components/providers/ApiProvider.tsx",
      "components/dashboard/NotificationsDialog.tsx",
      "components/dashboard/NotificationPopover.tsx",
      "components/dashboard/nav-user.tsx",
      "components/dashboard/app-sidebar.tsx",
      "components/dashboard/MfaRequiredGate.tsx",
    ];

    test("zero raw hex color codes and zero direct palette imports in touched files", () => {
      const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;

      for (const rel of touchedFiles) {
        const content = fs.readFileSync(path.join(portalSrcRoot, rel), "utf8");
        const hexMatches = content.match(hexRegex) ?? [];
        expect(hexMatches).toEqual([]);
        expect(content).not.toContain("palette.ts");
      }
    });
  });
});
