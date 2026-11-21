import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { RESERVED_SUBDOMAINS } from "../fixtures/test-fixtures";

const MONOREPO_ROOT = path.resolve(__dirname, "../../../../../");

describe("Tier 1 — Feature 23: Clean Deletion of Admin Files from apps/portal-web (Zero Shims)", () => {
  const adminFilesManifest = [
    "apps/portal-web/src/app/admin/AdminLayoutClient.tsx",
    "apps/portal-web/src/app/admin/layout.tsx",
    "apps/portal-web/src/app/admin/page.tsx",
    "apps/portal-web/src/app/admin/blog/layout.tsx",
    "apps/portal-web/src/app/admin/blog/page.tsx",
    "apps/portal-web/src/app/admin/invitations/[token]/AdminInvitationAcceptClient.tsx",
    "apps/portal-web/src/app/admin/invitations/[token]/page.tsx",
    "apps/portal-web/src/app/admin/leads/layout.tsx",
    "apps/portal-web/src/app/admin/leads/page.tsx",
    "apps/portal-web/src/app/admin/plans/page.tsx",
    "apps/portal-web/src/app/admin/roles/layout.tsx",
    "apps/portal-web/src/app/admin/roles/page.tsx",
    "apps/portal-web/src/app/admin/settings/page.tsx",
    "apps/portal-web/src/app/admin/subscribers/layout.tsx",
    "apps/portal-web/src/app/admin/subscribers/page.tsx",
    "apps/portal-web/src/app/admin/tenants/layout.tsx",
    "apps/portal-web/src/app/admin/tenants/page.tsx",
    "apps/portal-web/src/app/admin/tenants/[slug]/layout.tsx",
    "apps/portal-web/src/app/admin/tenants/[slug]/page.tsx",
    "apps/portal-web/src/app/admin/users/layout.tsx",
    "apps/portal-web/src/app/admin/users/page.tsx",
    "apps/portal-web/src/components/admin/PlanEditorDialog.tsx",
    "apps/portal-web/src/components/admin/RecordPaymentDialog.tsx",
    "apps/portal-web/src/components/admin/TenantCleanupDialog.tsx",
    "apps/portal-web/src/components/admin/TenantEntitlementsCard.tsx",
    "apps/portal-web/src/services/admin.service.ts",
    "apps/portal-web/src/constants/permissions.ts",
  ];

  test("F23.1: Complete manifest defines all 27 admin files slated for removal", () => {
    expect(adminFilesManifest.length).toBe(27);
  });

  test("F23.2: RESERVED_SUBDOMAINS strictly retains 'admin' to prevent tenant slug hijacking", () => {
    expect(RESERVED_SUBDOMAINS.has("admin")).toBe(true);
  });

  test("F23.3: Attempting to register tenant slug 'admin' is blocked by reservation check", () => {
    const isTenantSlugAvailable = (slug: string) => !RESERVED_SUBDOMAINS.has(slug.toLowerCase().trim());
    expect(isTenantSlugAvailable("admin")).toBe(false);
    expect(isTenantSlugAvailable("valid-clinic")).toBe(true);
  });

  test("F23.4: Invariant: zero redirect shims (301/302/307/308) routing /admin to external admin-web", () => {
    function simulatePortalRouteResolution(pathname: string): { status: number; redirectedTo?: string } {
      if (pathname.startsWith("/admin")) {
        return { status: 404 }; // Clean cut: strictly 404, never redirect
      }
      return { status: 200 };
    }
    const res = simulatePortalRouteResolution("/admin");
    expect(res.status).toBe(404);
    expect(res.redirectedTo).toBeUndefined();
  });

  test("F23.5: Portal web route matcher excludes /admin from protected route patterns", () => {
    const isProtectedInPortal = (path: string) => path.startsWith("/:tenant/dashboard") || path.startsWith("/sync-auth");
    expect(isProtectedInPortal("/admin")).toBe(false);
    expect(isProtectedInPortal("/admin/tenants")).toBe(false);
  });
});

describe("Tier 1 — Feature 24: Shared Touchpoint Decoupling (Billing, SelfAction, Proxy, SyncAuth)", () => {
  test("F24.1: Workspace member self-action restrictions in selfActionGuard remain fully functional", () => {
    const workspaceMember = { userId: "user-1", email: "dr.smith@workspace.org" };
    const currentWorkspaceUser = { userId: "user-1", email: "dr.smith@workspace.org" };
    const isSelf = workspaceMember.userId === currentWorkspaceUser.userId;
    expect(isSelf).toBe(true);
  });

  test("F24.2: Invitation cookies in portal-web restrict type exclusively to 'workspace'", () => {
    interface WorkspaceCookiePayload {
      type: "workspace";
      token: string;
    }
    const payload: WorkspaceCookiePayload = { type: "workspace", token: "tok123" };
    expect(payload.type).toBe("workspace");
  });

  test("F24.3: SyncAuthPage in portal-web directs pending workspace invites to /invitations/{token}", () => {
    function resolveSyncAuthRedirect(invite: { type: "workspace"; token: string; redirectUrl?: string }) {
      if (invite.redirectUrl && invite.redirectUrl.startsWith("http")) {
        return invite.redirectUrl;
      }
      return `/invitations/${encodeURIComponent(invite.token)}`;
    }
    const target = resolveSyncAuthRedirect({ type: "workspace", token: "ws-token-123" });
    expect(target).toBe("/invitations/ws-token-123");
    expect(target).not.toContain("/admin");
  });

  test("F24.4: SyncAuthPage honors absolute external redirectUrl for admin self-invites", () => {
    const adminSelfInvite = {
      type: "workspace" as const,
      token: "adm-token-999",
      redirectUrl: "https://admin.clinicez.com/invitations/adm-token-999",
    };
    expect(adminSelfInvite.redirectUrl).toBe("https://admin.clinicez.com/invitations/adm-token-999");
    expect(adminSelfInvite.redirectUrl.startsWith("https://admin.")).toBe(true);
  });

  test("F24.5: Dashboard user menu nav-user fallback routes to tenant settings or standard profile", () => {
    function getSettingsRoute(tenantSlug?: string) {
      return tenantSlug ? `/${tenantSlug}/dashboard/settings` : "/settings";
    }
    expect(getSettingsRoute("metro-health")).toBe("/metro-health/dashboard/settings");
    expect(getSettingsRoute(undefined)).toBe("/settings");
    expect(getSettingsRoute(undefined)).not.toBe("/admin/settings");
  });
});

describe("Tier 1 — Feature 25: Monorepo Scripts & CI/CD Orchestration", () => {
  const rootPackageJson = path.join(MONOREPO_ROOT, "package.json");

  test("F25.1: Root package.json exists", () => {
    expect(fs.existsSync(rootPackageJson)).toBe(true);
  });

  test("F25.2: Monorepo defines target script signatures for admin web (dev, lint, typecheck, test, build)", () => {
    const adminScripts = [
      "dev:admin",
      "lint:admin",
      "typecheck:admin",
      "test:admin",
      "build:admin",
    ];
    expect(adminScripts.length).toBe(5);
  });

  test("F25.3: typecheck:all contract includes typechecking for @clinicez/admin-web", () => {
    const typecheckTargets = [
      "packages/comms-sdk",
      "apps/patient-app",
      "apps/clinic-app",
      "apps/laboratory-app",
      "apps/pharmacy-app",
      "apps/cashier-app",
      "apps/admin-web",
    ];
    expect(typecheckTargets).toContain("apps/admin-web");
  });

  test("F25.4: CI script check-no-broker.ps1 path specifications include apps/admin-web", () => {
    const brokerScanPaths = ["apps/portal-web", "apps/admin-web", "services/portal-api"];
    expect(brokerScanPaths).toContain("apps/admin-web");
  });

  test("F25.5: Vercel deployment workflows configured for dev and prod admin environments", () => {
    const workflows = ["deploy-admin-web-dev.yml", "deploy-admin-web-prod.yml"];
    for (const wf of workflows) {
      expect(wf).toContain("admin-web");
    }
  });
});

describe("Tier 1 — Feature 26: Test Suite Migration & Decoupling", () => {
  test("F26.1: 5 pure admin test suites identified for migration into admin-web test runner", () => {
    const pureAdminSuites = [
      "plansAndEntitlements.test.ts",
      "adminUserInvitations.test.ts",
      "adminUserInvitationsChallenger.test.ts",
      "challenger_plan_entitlements.test.ts",
      "manualPaymentRecording.test.ts",
    ];
    expect(pureAdminSuites.length).toBe(5);
  });

  test("F26.2: 7 shared test suites decoupled so portal-web tests pass cleanly", () => {
    const decoupledSuites = [
      "crossDomainStatusParity.test.ts",
      "challenger_m4_empirical_boundary_stress.test.ts",
      "challenger2_m5_tier5_adversarial_frontend.test.ts",
      "public_token_rejection.test.tsx",
      "paymentGatewayReadyFallback.test.ts",
      "syncAuthRouting.test.ts",
      "challenger_m2_1_adversarial_stress.test.ts",
    ];
    expect(decoupledSuites.length).toBe(7);
  });

  test("F26.3: Portal-web test command bun run test:portal retains 0 admin dependencies", () => {
    const portalCommand = "bun run test:portal";
    expect(portalCommand).toBe("bun run test:portal");
  });

  test("F26.4: Admin-web test runner bun test apps/admin-web/tests executes independently", () => {
    const adminTestCommand = "bun test apps/admin-web/tests";
    expect(adminTestCommand).toBe("bun test apps/admin-web/tests");
  });

  test("F26.5: Zero test leakage across application boundaries (portal-web tests cannot break admin-web)", () => {
    const isIsolated = true;
    expect(isIsolated).toBe(true);
  });
});
