import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const APP_ROOT = path.resolve(import.meta.dir, "..");
const SRC_DIR = path.join(APP_ROOT, "src");
const PACKAGE_JSON_PATH = path.join(APP_ROOT, "package.json");

function collectFiles(dir: string, predicate?: (filePath: string) => boolean): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== "dist") {
        results.push(...collectFiles(full, predicate));
      }
    } else if (!predicate || predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("marketing-web surface isolation & architectural invariants", () => {
  it("contains 0 @clerk/* references in package.json and across src/**", () => {
    const pkgRaw = fs.readFileSync(PACKAGE_JSON_PATH, "utf8");
    expect(pkgRaw).not.toContain("@clerk/");

    const srcFiles = collectFiles(SRC_DIR, (f) => /\.(ts|tsx|js|jsx|mjs|css)$/.test(f));
    expect(srcFiles.length).toBeGreaterThan(0);

    const clerkViolations: string[] = [];
    for (const file of srcFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("@clerk/") || content.includes("ClerkProvider")) {
        clerkViolations.push(path.relative(APP_ROOT, file));
      }
    }
    expect(clerkViolations).toEqual([]);
  });

  it("ensures src/app/layout.tsx is a static-capable server layout without force-dynamic", () => {
    const layoutPath = path.join(SRC_DIR, "app", "layout.tsx");
    expect(fs.existsSync(layoutPath)).toBe(true);

    const layoutSource = fs.readFileSync(layoutPath, "utf8");
    expect(layoutSource).not.toMatch(/["']use client["']/);
    expect(layoutSource).not.toMatch(/export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
    expect(layoutSource).not.toContain("ClerkProvider");
    expect(layoutSource).toContain("<Navigation />");
    expect(layoutSource).toContain("<Footer />");
  });

  it("does not host portal-owned auth or tenant routes inside marketing-web", () => {
    const forbiddenAppDirs = [
      path.join(SRC_DIR, "app", "tenants"),
      path.join(SRC_DIR, "app", "[tenant]"),
      path.join(SRC_DIR, "app", "sign-in"),
      path.join(SRC_DIR, "app", "sign-up"),
      path.join(SRC_DIR, "app", "sync-auth"),
    ];

    for (const dir of forbiddenAppDirs) {
      expect(fs.existsSync(dir)).toBe(false);
    }
  });

  it("contains 0 hardcoded #hex colors and 0 direct palette imports in .tsx/.jsx files", () => {
    const uiFiles = collectFiles(SRC_DIR, (f) => /\.(tsx|jsx)$/.test(f));
    expect(uiFiles.length).toBeGreaterThan(0);

    const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
    const paletteImportRegex = /from\s+['"][^'"]*palette(\.ts)?['"]/g;

    const violations: string[] = [];
    for (const file of uiFiles) {
      const raw = fs.readFileSync(file, "utf8");
      if (raw.includes("token-guard:ignore-file")) continue;
      const stripped = stripComments(raw);
      const hexMatches = stripped.match(hexRegex) || [];
      const paletteMatches = stripped.match(paletteImportRegex) || [];
      if (hexMatches.length > 0 || paletteMatches.length > 0) {
        violations.push(
          `${path.relative(APP_ROOT, file)} (hex=${hexMatches.length}, palette=${paletteMatches.length})`
        );
      }
    }

    expect(violations).toEqual([]);
  });

  it("contains 0 hardcoded clinicez.com / clinicez.ph / clinicez.net domain literals across src/**", () => {
    const targetFiles = [
      ...collectFiles(path.join(SRC_DIR, "utils")),
      ...collectFiles(path.join(SRC_DIR, "config")),
      path.join(SRC_DIR, "app", "sitemap.ts"),
      path.join(SRC_DIR, "app", "robots.ts"),
      ...collectFiles(SRC_DIR, (f) => /\.(ts|tsx)$/.test(f)),
    ];
    const uniqueFiles = Array.from(new Set(targetFiles)).filter((f) => fs.existsSync(f));

    const hardcodedDomainRegex = /\bclinicez\.(?:com|ph|net)\b/i;
    const domainViolations: string[] = [];

    for (const file of uniqueFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (hardcodedDomainRegex.test(content)) {
        domainViolations.push(path.relative(APP_ROOT, file));
      }
    }

    expect(domainViolations).toEqual([]);
  });

  it("enforces spaced 'Clinic EZ' branding with 0 unspaced 'ClinicEZ' occurrences in src/**", () => {
    const codeFiles = collectFiles(SRC_DIR, (f) => /\.(ts|tsx|css)$/.test(f));
    const brandingViolations: string[] = [];

    for (const file of codeFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("ClinicEZ")) {
        brandingViolations.push(path.relative(APP_ROOT, file));
      }
    }

    expect(brandingViolations).toEqual([]);
  });
});
