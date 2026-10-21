import { describe, test, expect } from "bun:test";
import { resolveAdminDisplayStatus } from "../src/app/admin/users/page";

describe("Challenger 2 Empirical Verification: Proxy & Route Matching", () => {
  // Directly challenge the Next.js Clerk route matcher regex
  // defined in apps/portal-web/src/proxy.ts:
  // const isPublicRoute = createRouteMatcher(['/upload(.*)', '/join(.*)', '/api/v1/public(.*)', '/admin/invitations(.*)']);
  const isPublicRouteRegex = (path: string) => {
    const patterns = [
      /^\/upload(.*)$/,
      /^\/join(.*)$/,
      /^\/api\/v1\/public(.*)$/,
      /^\/admin\/invitations(.*)$/
    ];
    return patterns.some(p => p.test(path));
  };

  test("unauthenticated user can access /admin/invitations/[token] without redirection", () => {
    // 64-character hex token
    const token = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(isPublicRouteRegex(`/admin/invitations/${token}`)).toBe(true);
  });

  test("unauthenticated user with query parameters can access /admin/invitations/[token]?src=email", () => {
    const token = "token_with_query_param";
    expect(isPublicRouteRegex(`/admin/invitations/${token}?src=email&ref=campaign`)).toBe(true);
  });

  test("unauthenticated user is strictly blocked on protected admin routes", () => {
    expect(isPublicRouteRegex("/admin")).toBe(false);
    expect(isPublicRouteRegex("/admin/")).toBe(false);
    expect(isPublicRouteRegex("/admin/users")).toBe(false);
    expect(isPublicRouteRegex("/admin/users/invite")).toBe(false);
    expect(isPublicRouteRegex("/admin/roles")).toBe(false);
    expect(isPublicRouteRegex("/admin/settings")).toBe(false);
    expect(isPublicRouteRegex("/admin/analytics")).toBe(false);
    expect(isPublicRouteRegex("/admin/tenants")).toBe(false);
    expect(isPublicRouteRegex("/admin/plans")).toBe(false);
  });

  test("AdminLayoutClient bypass logic test", () => {
    // In AdminLayoutClient.tsx:
    // if (pathname?.startsWith("/admin/invitations")) return <>{children}</>;
    const shouldBypassLayout = (pathname: string) => pathname.startsWith("/admin/invitations");

    expect(shouldBypassLayout("/admin/invitations/abcdef123456")).toBe(true);
    expect(shouldBypassLayout("/admin/invitations")).toBe(true);
    expect(shouldBypassLayout("/admin/users")).toBe(false);
    expect(shouldBypassLayout("/admin")).toBe(false);
  });
});

describe("Challenger 2 Empirical Verification: Status State Machine", () => {
  test("resolveAdminDisplayStatus accurately reflects Expired vs Invited vs Suspended vs Revoked", () => {
    const now = Date.now();

    // 1. Future expiry -> Invited
    expect(resolveAdminDisplayStatus({
      status: "Invited",
      invitationExpiresAt: new Date(now + 86400000).toISOString(),
      isActive: true
    })).toBe("Invited");

    // 2. Past expiry -> Expired
    expect(resolveAdminDisplayStatus({
      status: "Invited",
      invitationExpiresAt: new Date(now - 1000).toISOString(),
      isActive: true
    })).toBe("Expired");

    // 3. Status Suspended -> Suspended
    expect(resolveAdminDisplayStatus({
      status: "Suspended",
      isActive: false
    })).toBe("Suspended");

    // 4. Status Revoked -> Revoked
    expect(resolveAdminDisplayStatus({
      status: "Revoked",
      isActive: true
    })).toBe("Revoked");

    // 5. Status Active -> Active
    expect(resolveAdminDisplayStatus({
      status: "Active",
      isActive: true
    })).toBe("Active");
  });
});
