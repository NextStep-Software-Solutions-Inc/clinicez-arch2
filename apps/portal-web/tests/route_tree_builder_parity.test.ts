import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import { publicRoutes } from "@shared/safe";

/**
 * Route Tree Discovery & @shared/safe publicRoutes Builder Parity Test Suite
 *
 * Verifies:
 * 1. Recursive discovery of all public page.tsx routes under apps/portal-web/src/app/.
 * 2. Strict two-way parity:
 *    - Every builder emits paths resolving to an actual page.tsx on disk.
 *    - No orphan public routes exist in src/app without a corresponding builder.
 * 3. Complete absence of retired legacy routes (rx-verify, join/[joinKey], verify/[...ref], verify/[token]).
 * 4. Sibling dynamic slug consistency under join/ and verify/.
 */

const APP_DIR = path.resolve(__dirname, "..", "src", "app");
const ROUTE_FILE = /^page\.(tsx|ts|jsx|js)$/;

// Non-public directories excluded from canonical patient/verification discovery
const EXCLUDED_DIRS = new Set([
  // Route groups and private auth directories
  "(auth)",
  "admin",
  "dashboard",
  "portal",
  "[tenant]",
  // Workspace onboarding & registration flow (authenticated/portal shell, not patient QR/token builder)
  "tenants",
  // Clerk authentication flows
  "sign-in",
  "sign-up",
  "sync-auth",
  // Auxiliary, token, or display flows
  "invitations",
  "reset-password",
  "notfound",
  "queue-display",
  "queue-tv",
  "upload",
]);

/**
 * Discovers all page routes across the entire App Router tree without exclusions.
 */
export function discoverAllPageRoutes(appDir: string): string[] {
  const routes = new Set<string>();

  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name;
        const next = path.join(dir, name);
        if (name.startsWith("_")) continue;
        if (name.startsWith("@")) walk(next, segments);
        else if (/^\(.*\)$/.test(name)) walk(next, segments);
        else walk(next, [...segments, name]);
      } else if (ROUTE_FILE.test(entry.name)) {
        routes.add("/" + segments.join("/"));
      }
    }
  };

  walk(appDir, []);
  return [...routes].sort();
}

/**
 * Discovers canonical public unauthenticated page routes, ignoring private/admin/auth/marketing folders.
 */
export function discoverPublicRoutes(appDir: string): string[] {
  const routes = new Set<string>();

  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name;
        if (name.startsWith("_")) continue;
        if (EXCLUDED_DIRS.has(name)) continue;
        const next = path.join(dir, name);
        if (name.startsWith("@")) walk(next, segments);
        else if (/^\(.*\)$/.test(name)) walk(next, segments);
        else walk(next, [...segments, name]);
      } else if (ROUTE_FILE.test(entry.name)) {
        // Root src/app/page.tsx is the portal.{domain} auth gateway redirect (/sync-auth or /sign-in),
        // not a canonical unauthenticated patient/verification route.
        if (segments.length > 0) {
          routes.add("/" + segments.join("/"));
        }
      }
    }
  };

  walk(appDir, []);
  return [...routes].sort();
}

/**
 * Extracts pathname from either absolute URL or relative path with query/hash.
 */
export function extractPathname(urlOrPath: string): string {
  try {
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      return new URL(urlOrPath).pathname;
    }
  } catch {}
  return urlOrPath.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
}

/**
 * Matches a concrete URL/pathname against discovered route templates.
 * Supports Next.js dynamic parameters like [tenantSlug] or [kind].
 */
export function matchRouteTemplate(concreteUrlOrPath: string, routeTemplates: string[]): string | null {
  const pathname = extractPathname(concreteUrlOrPath);
  const pathParts = pathname === "/" ? [] : pathname.split("/").filter(Boolean);

  for (const template of routeTemplates) {
    const templateClean = template.replace(/\/+$/, "") || "/";
    const templateParts = templateClean === "/" ? [] : templateClean.split("/").filter(Boolean);

    if (templateParts.length !== pathParts.length) {
      continue;
    }

    let match = true;
    for (let i = 0; i < templateParts.length; i++) {
      const tPart = templateParts[i];
      const pPart = pathParts[i];

      // Next.js dynamic segment: [param]
      if (tPart.startsWith("[") && tPart.endsWith("]")) {
        if (!pPart || pPart.length === 0) {
          match = false;
          break;
        }
        continue;
      }

      // Static segment match (case-insensitive & URL-decoded)
      if (tPart.toLowerCase() !== decodeURIComponent(pPart).toLowerCase()) {
        match = false;
        break;
      }
    }

    if (match) {
      return template;
    }
  }

  return null;
}

/**
 * Resolves a route template to its underlying page.tsx filesystem path.
 */
export function resolveTemplateToDiskFile(appDir: string, template: string): string {
  const segments = template.split("/").filter(Boolean);
  return path.join(appDir, ...segments, "page.tsx");
}

describe("Route Tree Discovery & @shared/safe publicRoutes Builder Parity", () => {
  // Alias mapping supporting both canonical and semantic builder names
  const builders = {
    join: publicRoutes.join,
    facilityJoin: publicRoutes.facilityJoin,
    claim: publicRoutes.claim,
    teleconsultJoin: publicRoutes.teleconsultJoin,
    teleconsultInvite: publicRoutes.teleconsultInvite,
    verifyLookup: publicRoutes.verifyLookup,
    verifyDocument: (publicRoutes as any).verifyDocument ?? publicRoutes.verifyKind,
    rxVerify: (publicRoutes as any).rxVerify ?? publicRoutes.verifyRx,
    verifyKind: publicRoutes.verifyKind,
    verifyRx: publicRoutes.verifyRx,
  };

  test("T1: Discovers the canonical set of unauthenticated public routes under src/app", () => {
    const publicTemplates = discoverPublicRoutes(APP_DIR);
    expect(publicTemplates).toEqual([
      "/claim",
      "/join",
      "/join/[tenantSlug]/[facilitySlug]",
      "/teleconsult/join",
      "/teleconsult/join/[token]",
      "/verify",
      "/verify/[kind]/[token]",
    ]);
  });

  test("T2: Every discovered public route corresponds to a genuine page.tsx file on disk", () => {
    const publicTemplates = discoverPublicRoutes(APP_DIR);
    for (const template of publicTemplates) {
      const diskPath = resolveTemplateToDiskFile(APP_DIR, template);
      expect(fs.existsSync(diskPath)).toBe(true);
    }
  });

  test("T3: Dynamic slug naming integrity (zero slug conflicts under join/ and verify/)", () => {
    const joinDir = path.join(APP_DIR, "join");
    const verifyDir = path.join(APP_DIR, "verify");

    const dynamicJoin = fs
      .readdirSync(joinDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("["))
      .map((e) => e.name);

    const dynamicVerify = fs
      .readdirSync(verifyDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name.startsWith("["))
      .map((e) => e.name);

    expect(dynamicJoin).toEqual(["[tenantSlug]"]);
    expect(dynamicVerify).toEqual(["[kind]"]);
  });

  test("T4: Retired route paths are permanently absent from discovered routes and disk", () => {
    const allRoutes = discoverAllPageRoutes(APP_DIR);
    const retiredPatterns = [
      "/rx-verify",
      "/rx-verify/[token]",
      "/join/[joinKey]",
      "/verify/[...ref]",
      "/verify/[token]",
    ];

    for (const retired of retiredPatterns) {
      expect(allRoutes).not.toContain(retired);
    }

    // Direct filesystem folder checks
    expect(fs.existsSync(path.join(APP_DIR, "rx-verify"))).toBe(false);
    expect(fs.existsSync(path.join(APP_DIR, "join", "[joinKey]"))).toBe(false);
    expect(fs.existsSync(path.join(APP_DIR, "verify", "[...ref]"))).toBe(false);
    expect(fs.existsSync(path.join(APP_DIR, "verify", "[token]"))).toBe(false);
  });

  test("T5: Every publicRoutes builder emits paths that resolve to an actual page.tsx in src/app", () => {
    const publicTemplates = discoverPublicRoutes(APP_DIR);

    const testMatrix = [
      // 1. join
      { label: "join()", url: builders.join(), expected: "/join" },
      { label: "join({ code })", url: builders.join({ code: "E2FW28KT" }), expected: "/join" },
      { label: "join({ baseUrl, code })", url: builders.join({ baseUrl: "https://portal.clinicez.ph", code: "APEX2026" }), expected: "/join" },

      // 2. facilityJoin
      { label: "facilityJoin(slugs)", url: builders.facilityJoin("ustp", "cdo-campus"), expected: "/join/[tenantSlug]/[facilitySlug]" },
      { label: "facilityJoin(slugs, { code })", url: builders.facilityJoin("st-jude", "main", { code: "B4C7-JOINNOW" }), expected: "/join/[tenantSlug]/[facilitySlug]" },
      { label: "facilityJoin(slugs, { baseUrl, code })", url: builders.facilityJoin("apex", "branch-1", { baseUrl: "https://portal.clinicez.ph", code: "VIP888" }), expected: "/join/[tenantSlug]/[facilitySlug]" },

      // 3. claim
      { label: "claim(token)", url: builders.claim("tok-12345"), expected: "/claim" },
      { label: "claim(token, { baseUrl })", url: builders.claim("eyJhbGciOiJIUzI1NiJ9.test", { baseUrl: "https://portal.clinicez.ph" }), expected: "/claim" },

      // 4. verifyLookup
      { label: "verifyLookup()", url: builders.verifyLookup(), expected: "/verify" },
      { label: "verifyLookup({ ref })", url: builders.verifyLookup({ ref: "MC-2026-0001" }), expected: "/verify" },
      { label: "verifyLookup({ ref, sig })", url: builders.verifyLookup({ ref: "MC-2026-0001", sig: "SEC-SHA256-4FA8B19C30E2" }), expected: "/verify" },
      { label: "verifyLookup({ baseUrl, ref })", url: builders.verifyLookup({ baseUrl: "https://portal.clinicez.ph", ref: "MC-01" }), expected: "/verify" },

      // 5. verifyDocument / verifyKind
      { label: "verifyDocument(med-cert)", url: builders.verifyDocument("med-cert", "MC-2026-0001"), expected: "/verify/[kind]/[token]" },
      { label: "verifyDocument(lab, { sig })", url: builders.verifyDocument("lab", "LAB-99", { sig: "4FA8B19C30E2" }), expected: "/verify/[kind]/[token]" },
      { label: "verifyKind(med-cert)", url: builders.verifyKind("med-cert", "MC-2026-0001"), expected: "/verify/[kind]/[token]" },

      // 6. rxVerify / verifyRx
      { label: "rxVerify(rxToken)", url: builders.rxVerify("RX-20261025-0001"), expected: "/verify/[kind]/[token]" },
      { label: "rxVerify(rxToken, { baseUrl })", url: builders.rxVerify("RX-SECRET-99", { baseUrl: "https://portal.clinicez.ph" }), expected: "/verify/[kind]/[token]" },
      { label: "verifyRx(rxToken)", url: builders.verifyRx("RX-20261025-0001"), expected: "/verify/[kind]/[token]" },

      // 7. teleconsultJoin & teleconsultInvite
      { label: "teleconsultJoin()", url: builders.teleconsultJoin(), expected: "/teleconsult/join" },
      { label: "teleconsultJoin({ token })", url: builders.teleconsultJoin({ token: "INV-01" }), expected: "/teleconsult/join" },
      { label: "teleconsultInvite(token)", url: builders.teleconsultInvite("INV-01"), expected: "/teleconsult/join/[token]" },
    ];

    for (const tc of testMatrix) {
      const matched = matchRouteTemplate(tc.url, publicTemplates);
      expect(matched).toBe(tc.expected);

      // Verify the target page.tsx file exists on disk
      const filePath = resolveTemplateToDiskFile(APP_DIR, matched!);
      expect(fs.existsSync(filePath)).toBe(true);
    }
  });

  test("T6: Assert that no orphan public route exists in src/app without a corresponding builder", () => {
    const publicTemplates = discoverPublicRoutes(APP_DIR);

    // Collect all template routes covered by builder emissions
    const allBuilderOutputs = [
      builders.join(),
      builders.facilityJoin("tenant", "facility"),
      builders.claim("token"),
      builders.teleconsultJoin(),
      builders.teleconsultInvite("token"),
      builders.verifyLookup(),
      builders.verifyDocument("med-cert", "token"),
      builders.rxVerify("token"),
    ];

    const coveredTemplates = new Set<string>();
    for (const url of allBuilderOutputs) {
      const matched = matchRouteTemplate(url, publicTemplates);
      if (matched) {
        coveredTemplates.add(matched);
      }
    }

    const orphanRoutes = publicTemplates.filter((t) => !coveredTemplates.has(t));
    expect(orphanRoutes).toEqual([]);
  });

  test("T7: Parameterized and URL-encoded input resilience", () => {
    const publicTemplates = discoverPublicRoutes(APP_DIR);

    // Multi-hyphenated facility slugs
    const fJoin = builders.facilityJoin("metro-health-cdo", "uptown-branch-2", { code: "B4C7-JOINNOW" });
    expect(matchRouteTemplate(fJoin, publicTemplates)).toBe("/join/[tenantSlug]/[facilitySlug]");

    // Special token characters
    const claimUrl = builders.claim("TOKEN+SPECIAL/KEY=");
    expect(matchRouteTemplate(claimUrl, publicTemplates)).toBe("/claim");

    // Cryptographic signature digest normalization
    const verifyDoc = builders.verifyDocument("vaccine-cert", "VC/2026/001", { sig: "SEC-SHA256-A1B2C3D4E5F67890" });
    expect(matchRouteTemplate(verifyDoc, publicTemplates)).toBe("/verify/[kind]/[token]");
  });
});
