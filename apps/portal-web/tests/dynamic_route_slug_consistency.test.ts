import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
// Next's own route-trie builder: the exact code path that throws
// "You cannot use different slug names for the same dynamic path" at request time.
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";

/**
 * Regression guard: `next build` and the unit suite never start the Next.js server, so an invalid
 * route tree (sibling dynamic folders with different slug names, e.g. `join/[code]` next to
 * `join/[tenantSlug]/[facilitySlug]`) only fails at runtime — on EVERY request. This test feeds the
 * real `src/app` tree through the same sorter the server uses.
 */

const APP_DIR = path.resolve(__dirname, "..", "src", "app");
const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js)$/;

/** Maps `src/app` files to URL route patterns, honouring route groups, parallel slots and private folders. */
export function discoverRoutes(appDir: string): string[] {
  const routes = new Set<string>();

  const walk = (dir: string, segments: string[]) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const name = entry.name;
        const next = path.join(dir, name);
        if (name.startsWith("_")) continue; // private folder: not routable
        if (name.startsWith("@")) walk(next, segments); // parallel slot: no URL segment
        else if (/^\(.*\)$/.test(name)) walk(next, segments); // route group: no URL segment
        else walk(next, [...segments, name]);
      } else if (ROUTE_FILE.test(entry.name)) {
        routes.add("/" + segments.join("/"));
      }
    }
  };

  walk(appDir, []);
  return [...routes].sort();
}

function dynamicChildren(relDir: string): string[] {
  return fs
    .readdirSync(path.join(APP_DIR, relDir), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.startsWith("["))
    .map((e) => e.name)
    .sort();
}

describe("Next.js app route tree validity", () => {
  test("discovers a realistic route set", () => {
    const routes = discoverRoutes(APP_DIR);
    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain("/join");
    expect(routes).toContain("/verify");
  });

  test("route tree has no conflicting dynamic slug names (Next.js route-trie validation)", () => {
    expect(() => getSortedRoutes(discoverRoutes(APP_DIR))).not.toThrow();
  });

  test("the validator rejects the exact conflicts that took dev.clinicez.net down", () => {
    expect(() =>
      getSortedRoutes(["/join", "/join/[code]", "/join/[tenantSlug]/[facilitySlug]"]),
    ).toThrow(/different slug names/);
    expect(() =>
      getSortedRoutes(["/verify", "/verify/[token]", "/verify/[kind]/[token]"]),
    ).toThrow(/different slug names/);
  });

  test("join/ and verify/ expose exactly one dynamic chain each", () => {
    expect(dynamicChildren("join")).toEqual(["[joinKey]"]);
    expect(dynamicChildren("verify")).toEqual(["[...ref]"]);
  });
});
