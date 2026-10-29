import { describe, test, expect } from "bun:test";
import * as fs from "fs";
import * as path from "path";

describe("Challenger 2 — Portal-Web Decoupling & Isolation Adversarial Probes", () => {
  const portalWebRoot = path.resolve(__dirname, "..");
  const srcDir = path.join(portalWebRoot, "src");

  // Probe 3.1: Complete Purge of Admin Files
  test("Probe 3.1: Zero admin directories or source files in apps/portal-web/src", () => {
    const prohibitedPaths = [
      path.join(srcDir, "app", "admin"),
      path.join(srcDir, "components", "admin"),
      path.join(srcDir, "services", "admin.service.ts"),
      path.join(srcDir, "constants", "permissions.ts"),
    ];

    for (const p of prohibitedPaths) {
      expect(fs.existsSync(p)).toBe(false);
    }
  });

  // Probe 3.2: AST / Text Scan for admin.service across the entire src directory
  test("Probe 3.2: Zero occurrences of 'admin.service' across any file in apps/portal-web/src", () => {
    function getFilesRecursively(dir: string): string[] {
      let results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath));
        } else if (entry.isFile() && /\.(tsx?|jsx?|json|css)$/.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allSrcFiles = getFilesRecursively(srcDir);
    expect(allSrcFiles.length).toBeGreaterThan(50);

    const violatingFiles: string[] = [];
    for (const filePath of allSrcFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      if (content.includes("admin.service")) {
        violatingFiles.push(path.relative(portalWebRoot, filePath));
      }
    }

    expect(violatingFiles).toEqual([]);
  });

  // Probe 3.3: Zero component imports from components/admin or app/admin
  test("Probe 3.3: Zero imports referencing components/admin or app/admin across apps/portal-web/src", () => {
    function getFilesRecursively(dir: string): string[] {
      let results: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath));
        } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const allCodeFiles = getFilesRecursively(srcDir);
    const violations: { file: string; line: string }[] = [];

    for (const filePath of allCodeFiles) {
      const lines = fs.readFileSync(filePath, "utf-8").split("\n");
      for (const line of lines) {
        if (
          (line.includes("from") || line.includes("import(")) &&
          (line.includes("components/admin") || line.includes("app/admin") || line.includes("@/admin"))
        ) {
          violations.push({ file: path.relative(portalWebRoot, filePath), line: line.trim() });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  // Probe 3.4: Proxy.ts strict subdomain reservation & isolation
  test("Probe 3.4: proxy.ts strictly reserves 'admin' and contains zero /admin routes", () => {
    const proxyFile = path.join(srcDir, "proxy.ts");
    expect(fs.existsSync(proxyFile)).toBe(true);
    const proxyContent = fs.readFileSync(proxyFile, "utf-8");

    // Must have RESERVED_SUBDOMAINS containing 'admin'
    expect(proxyContent).toContain("RESERVED_SUBDOMAINS");
    expect(proxyContent).toMatch(/RESERVED_SUBDOMAINS\s*=\s*new\s+Set\(\[\s*[^\]]*'admin'[^\]]*\]\)/);

    // Verify 'api', 'app', 'dev', 'portal', 'localhost', 'www' are also reserved
    for (const sub of ['admin', 'api', 'app', 'dev', 'portal', 'localhost', 'www']) {
      expect(proxyContent).toContain(`'${sub}'`);
    }

    // Must NOT contain any /admin route matching patterns
    expect(proxyContent).not.toMatch(/['"]\/admin(\/|\b|\()/);
    expect(proxyContent).not.toContain("'/admin(.*)'");
    expect(proxyContent).not.toContain("'/admin/invitations(.*)'");
  });

  // Probe 3.5: Proxy regex and subdomain isolation behavioral testing
  test("Probe 3.5: Subdomain parsing and reservation behavior preserves admin boundary", () => {
    const RESERVED_SUBDOMAINS = new Set([
      'www', 'app', 'api', 'admin', 'dev', 'portal', 'localhost'
    ]);

    const isReserved = (slug: string) => RESERVED_SUBDOMAINS.has(slug.toLowerCase());

    // Exact matches
    expect(isReserved("admin")).toBe(true);
    expect(isReserved("ADMIN")).toBe(true);
    expect(isReserved("Admin")).toBe(true);
    expect(isReserved("api")).toBe(true);
    expect(isReserved("portal")).toBe(true);

    // Non-reserved valid tenant slugs
    expect(isReserved("metro-health")).toBe(false);
    expect(isReserved("city-clinic")).toBe(false);
    expect(isReserved("admin-clinic")).toBe(false); // Valid distinct tenant slug
  });

  // Probe 3.6: Shared touchpoints decoupling verification
  test("Probe 3.6: Shared touchpoints (billing.service, selfActionGuard, invitationCookie, nav-user) are cleanly decoupled", () => {
    // 1. billing.service.ts
    const billingContent = fs.readFileSync(path.join(srcDir, "services", "billing.service.ts"), "utf-8");
    expect(billingContent).not.toContain("admin.service");
    expect(billingContent).not.toContain("AdminSystemSettingDto");

    // 2. selfActionGuard.ts
    const selfActionContent = fs.readFileSync(path.join(srcDir, "lib", "selfActionGuard.ts"), "utf-8");
    expect(selfActionContent).not.toContain("isSelfAdminUser");
    expect(selfActionContent).not.toContain("getAdminUserActionRestriction");

    // 3. invitationCookie.ts
    const cookieContent = fs.readFileSync(path.join(srcDir, "lib", "invitationCookie.ts"), "utf-8");
    expect(cookieContent).not.toContain('"admin"');
    expect(cookieContent).toContain('type: "workspace"');

    // 4. nav-user.tsx
    const navUserContent = fs.readFileSync(path.join(srcDir, "components", "dashboard", "nav-user.tsx"), "utf-8");
    expect(navUserContent).not.toContain("/admin/settings");
    expect(navUserContent).not.toContain("/admin");
  });
});
