import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("Admin Decoupling & Isolation Regression Guard (apps/portal-web)", () => {
  const portalWebRoot = path.resolve(__dirname, "..");
  const srcDir = path.join(portalWebRoot, "src");

  test("R4.1: Exactly 0 admin files exist under apps/portal-web/src/app/admin", () => {
    const adminAppDir = path.join(srcDir, "app", "admin");
    expect(fs.existsSync(adminAppDir)).toBe(false);
  });

  test("R4.2: Exactly 0 admin components exist under apps/portal-web/src/components/admin", () => {
    const adminComponentsDir = path.join(srcDir, "components", "admin");
    expect(fs.existsSync(adminComponentsDir)).toBe(false);
  });

  test("R4.3: admin.service.ts is completely deleted from apps/portal-web/src/services", () => {
    const adminServiceFile = path.join(srcDir, "services", "admin.service.ts");
    expect(fs.existsSync(adminServiceFile)).toBe(false);
  });

  test("R4.4: permissions.ts is completely deleted from apps/portal-web/src/constants", () => {
    const permissionsFile = path.join(srcDir, "constants", "permissions.ts");
    expect(fs.existsSync(permissionsFile)).toBe(false);
  });

  test("R4.5: proxy.ts contains zero /admin routes and strictly retains 'admin' in RESERVED_SUBDOMAINS", () => {
    const proxyFile = path.join(srcDir, "proxy.ts");
    expect(fs.existsSync(proxyFile)).toBe(true);

    const proxyContent = fs.readFileSync(proxyFile, "utf-8");

    // Zero /admin protected or public route patterns
    expect(proxyContent).not.toContain("'/admin(.*)'");
    expect(proxyContent).not.toContain("'/admin/invitations(.*)'");
    expect(proxyContent).not.toMatch(/['"]\/admin(\/|\b|\()/);

    // Strictly retains 'admin' in RESERVED_SUBDOMAINS
    expect(proxyContent).toContain("RESERVED_SUBDOMAINS");
    expect(proxyContent).toMatch(/RESERVED_SUBDOMAINS\s*=\s*new\s+Set\(\[\s*[^\]]*'admin'[^\]]*\]\)/);
  });

  test("R4.6: nav-user.tsx contains zero /admin/settings fallback", () => {
    const navUserFile = path.join(srcDir, "components", "dashboard", "nav-user.tsx");
    expect(fs.existsSync(navUserFile)).toBe(true);

    const navUserContent = fs.readFileSync(navUserFile, "utf-8");
    expect(navUserContent).not.toContain("/admin/settings");
    expect(navUserContent).toContain('tenant ? `/${tenant}/dashboard/settings` : "/settings"');
  });

  test("R4.7: join.ts contains zero /admin/invitations pattern in isProxyPublicRoute", () => {
    const joinFile = path.join(srcDir, "lib", "join.ts");
    expect(fs.existsSync(joinFile)).toBe(true);

    const joinContent = fs.readFileSync(joinFile, "utf-8");
    expect(joinContent).not.toContain("/admin/invitations");
  });

  test("R4.8: billing.service.ts contains zero admin re-exports or admin.service imports", () => {
    const billingServiceFile = path.join(srcDir, "services", "billing.service.ts");
    expect(fs.existsSync(billingServiceFile)).toBe(true);

    const billingContent = fs.readFileSync(billingServiceFile, "utf-8");
    expect(billingContent).not.toContain("admin.service");
    expect(billingContent).not.toContain("AdminSystemSettingDto");
  });

  test("R4.9: selfActionGuard.ts contains zero admin-specific restriction guards", () => {
    const selfActionGuardFile = path.join(srcDir, "lib", "selfActionGuard.ts");
    expect(fs.existsSync(selfActionGuardFile)).toBe(true);

    const guardContent = fs.readFileSync(selfActionGuardFile, "utf-8");
    expect(guardContent).not.toContain("isSelfAdminUser");
    expect(guardContent).not.toContain("getAdminUserActionRestriction");
    expect(guardContent).not.toContain("adminRevoke");
    expect(guardContent).not.toContain("adminSuspend");
    expect(guardContent).not.toContain("adminDelete");
  });

  test("R4.10: invitationCookie.ts is strictly workspace-only", () => {
    const cookieFile = path.join(srcDir, "lib", "invitationCookie.ts");
    expect(fs.existsSync(cookieFile)).toBe(true);

    const cookieContent = fs.readFileSync(cookieFile, "utf-8");
    expect(cookieContent).not.toContain('"workspace" | "admin"');
    expect(cookieContent).toContain('type: "workspace"');
  });
});
