import { describe, test, expect } from "bun:test";
import fs from "fs";
import path from "path";

import robots from "../src/app/robots";
import {
  MULTI_PART_TLDS,
  RESERVED_TENANT_SLUGS,
  getConsoleBaseDomain,
  getMarketingSiteUrl,
  getPortalEntryUrl,
  getTenantWorkspaceUrl,
  isReservedTenantSlug,
  isTenantSubdomainHost,
} from "../src/utils/domain";
import {
  extractSubdomainCandidate,
  isReservedSubdomain,
  isTenantSubdomainBypassPath,
  resolvePortalCanonicalRedirect,
  resolveTenantDashboardRewritePath,
} from "../src/proxy";
import {
  isDashboardNavActive,
  resolveDashboardNavHref,
} from "../src/components/dashboard/nav-main";
import { resolveSignUpRedirectTarget } from "../src/app/sign-up/_lib/signUpFlow";

const portalWebRoot = path.resolve(__dirname, "..");
const portalSrcRoot = path.join(portalWebRoot, "src");

function withCleanEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => T,
): T {
  const keys = [
    "NEXT_PUBLIC_BASE_DOMAIN",
    "NEXT_PUBLIC_MARKETING_URL",
    "NEXT_PUBLIC_MARKETING_PORT",
    "NEXT_PUBLIC_PORTAL_URL",
    "NEXT_PUBLIC_PORTAL_PORT",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

describe("Part 2 — Portal Web Marketing Surface Separation & Subdomain Workspace Architecture", () => {
  describe("1. Marketing Route Tree Removal & Onboarding Relocation", () => {
    test("src/app/(main) and src/app/sitemap.ts do NOT exist in portal-web", () => {
      expect(fs.existsSync(path.join(portalSrcRoot, "app/(main)"))).toBe(false);
      expect(fs.existsSync(path.join(portalSrcRoot, "app/sitemap.ts"))).toBe(false);
    });

    test("unused marketing-only components are removed while ClinicEzLogo is preserved", () => {
      const removedComponents = [
        "components/Navigation.tsx",
        "components/footer.tsx",
        "components/Hero.tsx",
        "components/HeroBackground.tsx",
        "components/HeaderEffects.tsx",
        "components/FeaturedItems.tsx",
        "components/SolutionList.tsx",
        "components/SolutionPage.tsx",
        "components/ContactUsForm.tsx",
        "components/NewsletterForm.tsx",
        "components/TenantRegistration.tsx",
      ];

      for (const rel of removedComponents) {
        expect(fs.existsSync(path.join(portalSrcRoot, rel))).toBe(false);
      }

      expect(
        fs.existsSync(path.join(portalSrcRoot, "components/ClinicEzLogo.tsx")),
      ).toBe(true);
    });

    test("/tenants/register lives at src/app/tenants/register with minimal onboarding shell layout", () => {
      const layoutPath = path.join(portalSrcRoot, "app/tenants/register/layout.tsx");
      const pagePath = path.join(portalSrcRoot, "app/tenants/register/page.tsx");
      const clientPath = path.join(
        portalSrcRoot,
        "app/tenants/register/_components/TenantRegistrationClient.tsx",
      );

      expect(fs.existsSync(layoutPath)).toBe(true);
      expect(fs.existsSync(pagePath)).toBe(true);
      expect(fs.existsSync(clientPath)).toBe(true);

      const layoutSrc = fs.readFileSync(layoutPath, "utf8");
      expect(layoutSrc).toContain("ClinicEzLogo");
      expect(layoutSrc).toContain("getMarketingSiteUrl");
      expect(layoutSrc).not.toContain("NewsletterForm");
      expect(layoutSrc).not.toContain("Navigation");
    });

    test("root src/app/page.tsx gates portal.{domain}/ to /sync-auth when signed in and /sign-in when signed out", () => {
      const rootPagePath = path.join(portalSrcRoot, "app/page.tsx");
      expect(fs.existsSync(rootPagePath)).toBe(true);

      const rootPageSrc = fs.readFileSync(rootPagePath, "utf8");
      expect(rootPageSrc).toContain('redirect("/sync-auth")');
      expect(rootPageSrc).toContain('redirect("/sign-in")');
    });

    test("robots.ts disallows indexing of portal and tenant workspace surfaces with zero hardcoded domains", () => {
      expect(robots()).toEqual({
        rules: {
          userAgent: "*",
          disallow: "/",
        },
      });

      const robotsSrc = fs.readFileSync(
        path.join(portalSrcRoot, "app/robots.ts"),
        "utf8",
      );
      expect(robotsSrc).not.toMatch(/clinicez\.(?:com|ph|net)/i);
    });
  });

  describe("2. Reserved Tenant Slugs Parity (RESERVED_TENANT_SLUGS & isReservedTenantSlug)", () => {
    test("blocks all platform, service, clinical, and infrastructure reserved slugs case-insensitively", () => {
      const criticalReserved = [
        "home",
        "www",
        "portal",
        "admin",
        "app",
        "api",
        "dev",
        "stage",
        "staging",
        "prod",
        "production",
        "test",
        "clinic",
        "clinics",
        "lab",
        "laboratory",
        "laboratories",
        "pharmacy",
        "pharmacies",
        "org",
        "organization",
        "organizations",
        "cashier",
        "patient",
        "patients",
        "hub",
        "interop",
        "interop-hub",
        "billing",
        "billing-api",
        "portal-api",
        "clinic-api",
        "laboratory-api",
        "pharmacy-api",
        "organization-api",
        "patient-api",
        "comms-api",
        "media-broker",
        "philhealth",
        "philhealth-proxy",
        "clerk",
        "auth",
        "login",
        "mail",
        "smtp",
        "imap",
        "pop",
        "cdn",
        "static",
        "assets",
        "media",
        "files",
        "docs",
        "status",
        "support",
        "help",
        "blog",
        "blogs",
        "marketing",
        "go",
        "web",
        "site",
        "dashboard",
        "console",
        "workspace",
        "root",
        "localhost",
      ];

      expect(RESERVED_TENANT_SLUGS.size).toBe(67);

      for (const slug of criticalReserved) {
        expect(RESERVED_TENANT_SLUGS.has(slug)).toBe(true);
        expect(RESERVED_TENANT_SLUGS.has(slug.toUpperCase())).toBe(true);
        expect(isReservedTenantSlug(slug)).toBe(true);
        expect(isReservedTenantSlug(`  ${slug.toUpperCase()}  `)).toBe(true);
      }
    });

    test("permits legitimate healthcare tenant workspace slugs", () => {
      const validTenantSlugs = [
        "st-lukes",
        "metro-health",
        "makati-med-center",
        "cebu-doctors-clinic",
        "nextstep",
      ];

      for (const slug of validTenantSlugs) {
        expect(RESERVED_TENANT_SLUGS.has(slug)).toBe(false);
        expect(isReservedTenantSlug(slug)).toBe(false);
      }
      expect(isReservedTenantSlug("")).toBe(false);
    });
  });

  describe("3. Subdomain Proxy Hardening (src/proxy.ts)", () => {
    test("treats home.{domain}, portal.{domain}, www.{domain}, and all RESERVED_TENANT_SLUGS as reserved subdomains", () => {
      expect(isReservedSubdomain("home")).toBe(true);
      expect(isReservedSubdomain("portal")).toBe(true);
      expect(isReservedSubdomain("www")).toBe(true);
      expect(isReservedSubdomain("admin")).toBe(true);
      expect(isReservedSubdomain("clinic")).toBe(true);
      expect(isReservedSubdomain("laboratory")).toBe(true);
      expect(isReservedSubdomain("pharmacy")).toBe(true);
      expect(isReservedSubdomain("philhealth-proxy")).toBe(true);
      expect(isReservedSubdomain("st-lukes")).toBe(false);
      expect(isReservedSubdomain("metro-health")).toBe(false);
    });

    test("bypasses auth and shared portal routes on {slug}.{domain} so Clerk flows never loop", () => {
      const bypassedPaths = [
        "/sign-in",
        "/sign-in/sso-callback",
        "/sign-up",
        "/sign-up/verify-email-address",
        "/sync-auth",
        "/tenants/register",
        "/api",
        "/api/webhooks/clerk",
        "/_next/static/chunks/main.js",
        "/notfound",
        "/robots.txt",
        "/sitemap.xml",
      ];
      for (const p of bypassedPaths) {
        expect(isTenantSubdomainBypassPath(p)).toBe(true);
      }

      const rewrittenPaths = [
        "/",
        "/dashboard",
        "/dashboard/branches",
        "/dashboard/billing",
        "/branches",
        "/team",
      ];
      for (const p of rewrittenPaths) {
        expect(isTenantSubdomainBypassPath(p)).toBe(false);
      }
    });

    test("rewrites /dashboard/branches to /{slug}/dashboard/branches with zero double /dashboard/dashboard prefix", () => {
      expect(resolveTenantDashboardRewritePath("st-lukes", "/")).toBe(
        "/st-lukes/dashboard",
      );
      expect(resolveTenantDashboardRewritePath("st-lukes", "/dashboard")).toBe(
        "/st-lukes/dashboard",
      );
      expect(
        resolveTenantDashboardRewritePath("st-lukes", "/dashboard/branches"),
      ).toBe("/st-lukes/dashboard/branches");
      expect(
        resolveTenantDashboardRewritePath("st-lukes", "/dashboard/billing"),
      ).toBe("/st-lukes/dashboard/billing");
      expect(resolveTenantDashboardRewritePath("st-lukes", "/branches")).toBe(
        "/st-lukes/dashboard/branches",
      );
      expect(resolveTenantDashboardRewritePath("st-lukes", "/st-lukes")).toBe(
        "/st-lukes/dashboard",
      );
      expect(
        resolveTenantDashboardRewritePath("st-lukes", "/st-lukes/dashboard/team"),
      ).toBe("/st-lukes/dashboard/team");
    });

    test("308-redirects cloud portal.{baseDomain}/{slug}/dashboard(...) to https://{slug}.{baseDomain}/dashboard(...)", () => {
      expect(
        resolvePortalCanonicalRedirect(
          "portal.dev.acmehealth.org",
          "/st-lukes/dashboard",
        ),
      ).toBe("https://st-lukes.dev.acmehealth.org/dashboard");

      expect(
        resolvePortalCanonicalRedirect(
          "portal.acmehealth.com.ph",
          "/st-lukes/dashboard/billing",
          "?tab=plans",
        ),
      ).toBe("https://st-lukes.acmehealth.com.ph/dashboard/billing?tab=plans");

      // Does not redirect local dev or non-dashboard paths or reserved slugs
      expect(
        resolvePortalCanonicalRedirect("portal.localhost", "/st-lukes/dashboard"),
      ).toBeNull();
      expect(
        resolvePortalCanonicalRedirect(
          "portal.dev.acmehealth.org",
          "/tenants/register",
        ),
      ).toBeNull();
      expect(
        resolvePortalCanonicalRedirect(
          "portal.dev.acmehealth.org",
          "/admin/dashboard",
        ),
      ).toBeNull();

      const proxySrc = fs.readFileSync(
        path.join(portalSrcRoot, "proxy.ts"),
        "utf8",
      );
      expect(proxySrc).toContain("NextResponse.redirect(new URL(canonicalRedirectUrl), 308)");
    });

    test("extractSubdomainCandidate handles dev tiers, local wildcards, and multi-part TLDs accurately", () => {
      expect(extractSubdomainCandidate("st-lukes.dev.acmehealth.org")).toBe(
        "st-lukes",
      );
      expect(extractSubdomainCandidate("st-lukes.acmehealth.org")).toBe(
        "st-lukes",
      );
      expect(extractSubdomainCandidate("st-lukes.acmehealth.com.ph")).toBe(
        "st-lukes",
      );
      expect(extractSubdomainCandidate("acmehealth.com.ph")).toBeNull();
      expect(extractSubdomainCandidate("st-lukes.localhost")).toBe("st-lukes");
      expect(extractSubdomainCandidate("st-lukes.lvh.me")).toBe("st-lukes");
      expect(extractSubdomainCandidate("localhost")).toBeNull();
      expect(MULTI_PART_TLDS.has("com.ph")).toBe(true);
    });
  });

  describe("4. Domain Helpers, Subdomain Workspace Links & Onboarding Handoff", () => {
    test("getConsoleBaseDomain strips portal, marketing, and tenant subdomains across standard and multi-part TLDs", () => {
      withCleanEnv({}, () => {
        expect(getConsoleBaseDomain("portal.dev.acmehealth.org")).toBe(
          "dev.acmehealth.org",
        );
        expect(getConsoleBaseDomain("st-lukes.dev.acmehealth.org")).toBe(
          "dev.acmehealth.org",
        );
        expect(getConsoleBaseDomain("st-lukes.acmehealth.org")).toBe(
          "acmehealth.org",
        );
        expect(getConsoleBaseDomain("st-lukes.acmehealth.com.ph")).toBe(
          "acmehealth.com.ph",
        );
        expect(getConsoleBaseDomain("st-lukes.dev.acmehealth.com.ph")).toBe(
          "dev.acmehealth.com.ph",
        );
        expect(getConsoleBaseDomain("home.acmehealth.org")).toBe(
          "acmehealth.org",
        );
        expect(getConsoleBaseDomain("localhost:3000")).toBe("");
        expect(getConsoleBaseDomain("st-lukes.localhost:3000")).toBe("");
        expect(getConsoleBaseDomain("127.0.0.1:3000")).toBe("");
      });

      withCleanEnv({ NEXT_PUBLIC_BASE_DOMAIN: "custom.example.org" }, () => {
        expect(getConsoleBaseDomain("localhost:3000")).toBe(
          "custom.example.org",
        );
      });
    });

    test("getMarketingSiteUrl and getPortalEntryUrl resolve cloud, env-override, and localhost URLs cleanly", () => {
      withCleanEnv({}, () => {
        expect(getMarketingSiteUrl("/pricing", "portal.dev.acmehealth.org")).toBe(
          "https://dev.acmehealth.org/pricing",
        );
        expect(getMarketingSiteUrl("/", "localhost:3000")).toBe(
          "http://localhost:3002/",
        );
        expect(getPortalEntryUrl("/sign-in", "st-lukes.dev.acmehealth.org")).toBe(
          "https://portal.dev.acmehealth.org/sign-in",
        );
        expect(getPortalEntryUrl("/sign-in", "localhost:3000")).toBe(
          "http://localhost:3000/sign-in",
        );
      });

      withCleanEnv(
        {
          NEXT_PUBLIC_MARKETING_URL: "https://www.acmehealth.org/",
          NEXT_PUBLIC_PORTAL_URL: "https://portal.acmehealth.org/",
        },
        () => {
          expect(getMarketingSiteUrl("/contact")).toBe(
            "https://www.acmehealth.org/contact",
          );
          expect(getPortalEntryUrl("/sync-auth")).toBe(
            "https://portal.acmehealth.org/sync-auth",
          );
        },
      );
    });

    test("isTenantSubdomainHost distinguishes tenant subdomains from reserved surfaces, bare roots, and localhost", () => {
      withCleanEnv({}, () => {
        expect(isTenantSubdomainHost("st-lukes.dev.acmehealth.org")).toBe(true);
        expect(isTenantSubdomainHost("st-lukes.acmehealth.org")).toBe(true);
        expect(isTenantSubdomainHost("st-lukes.acmehealth.com.ph")).toBe(true);
        expect(isTenantSubdomainHost("st-lukes.localhost:3000")).toBe(true);
        expect(isTenantSubdomainHost("st-lukes.lvh.me:3000")).toBe(true);

        expect(isTenantSubdomainHost("portal.dev.acmehealth.org")).toBe(false);
        expect(isTenantSubdomainHost("home.acmehealth.org")).toBe(false);
        expect(isTenantSubdomainHost("www.acmehealth.org")).toBe(false);
        expect(isTenantSubdomainHost("admin.acmehealth.org")).toBe(false);
        expect(isTenantSubdomainHost("portal.localhost:3000")).toBe(false);
        expect(isTenantSubdomainHost("acmehealth.org")).toBe(false);
        expect(isTenantSubdomainHost("acmehealth.com.ph")).toBe(false);
        expect(isTenantSubdomainHost("localhost:3000")).toBe(false);
        expect(isTenantSubdomainHost("127.0.0.1:3000")).toBe(false);
      });
    });

    test("getTenantWorkspaceUrl builds canonical cloud subdomain, local wildcard subdomain, and plain localhost fallback URLs", () => {
      withCleanEnv({}, () => {
        expect(
          getTenantWorkspaceUrl(
            "st-lukes",
            "/dashboard",
            "portal.dev.acmehealth.org",
          ),
        ).toBe("https://st-lukes.dev.acmehealth.org/dashboard");

        expect(
          getTenantWorkspaceUrl(
            "st-lukes",
            "/dashboard/billing",
            "metro.acmehealth.com.ph",
          ),
        ).toBe("https://st-lukes.acmehealth.com.ph/dashboard/billing");

        expect(
          getTenantWorkspaceUrl(
            "st-lukes",
            "/dashboard",
            "portal.localhost:3000",
          ),
        ).toBe("http://st-lukes.localhost:3000/dashboard");

        expect(
          getTenantWorkspaceUrl("st-lukes", "/dashboard", "localhost:3000"),
        ).toBe("/st-lukes/dashboard");
      });
    });

    test("NavMain and NavSecondary helpers produce clean /dashboard/... links on subdomains and match active state on both paths", () => {
      // Subdomain mode: clean /dashboard/... URLs
      expect(resolveDashboardNavHref("st-lukes", "/dashboard", true)).toBe(
        "/dashboard",
      );
      expect(
        resolveDashboardNavHref("st-lukes", "/dashboard/branches", true),
      ).toBe("/dashboard/branches");

      // Path-prefix fallback mode: /{tenant}/dashboard/... URLs
      expect(resolveDashboardNavHref("st-lukes", "/dashboard", false)).toBe(
        "/st-lukes/dashboard",
      );
      expect(
        resolveDashboardNavHref("st-lukes", "/dashboard/branches", false),
      ).toBe("/st-lukes/dashboard/branches");

      // Active state works whether usePathname() returns /dashboard/branches or /st-lukes/dashboard/branches
      expect(
        isDashboardNavActive("/dashboard/branches", "st-lukes", "/dashboard/branches"),
      ).toBe(true);
      expect(
        isDashboardNavActive(
          "/st-lukes/dashboard/branches",
          "st-lukes",
          "/dashboard/branches",
        ),
      ).toBe(true);
      expect(
        isDashboardNavActive(
          "/dashboard/branches/makati",
          "st-lukes",
          "/dashboard/branches",
        ),
      ).toBe(true);

      // Overview /dashboard does NOT stay active when viewing /dashboard/branches
      expect(
        isDashboardNavActive("/dashboard/branches", "st-lukes", "/dashboard"),
      ).toBe(false);
      expect(
        isDashboardNavActive("/dashboard", "st-lukes", "/dashboard"),
      ).toBe(true);
    });

    test("resolveSignUpRedirectTarget preserves marketing plan and billing query params for new and signed-in users", () => {
      expect(
        resolveSignUpRedirectTarget({
          plan: "Pro",
          billing: "annual",
          alreadySignedIn: true,
        }),
      ).toBe("/tenants/register?plan=Pro&billing=annual");

      expect(
        resolveSignUpRedirectTarget({
          redirectUrl: "/tenants/register",
          plan: "Starter",
          billing: "monthly",
        }),
      ).toBe("/tenants/register?plan=Starter&billing=monthly");

      expect(
        resolveSignUpRedirectTarget({
          redirectUrl: "//evil.example.com/phish",
        }),
      ).toBe("/sync-auth");
    });

    test("zero raw hex color literals, zero direct palette imports, and zero hardcoded production domains across touched src files", () => {
      const touchedFiles = [
        "utils/domain.ts",
        "proxy.ts",
        "lib/planPricing.ts",
        "app/page.tsx",
        "app/robots.ts",
        "app/sync-auth/page.tsx",
        "app/sign-in/[[...sign-in]]/page.tsx",
        "app/sign-up/[[...sign-up]]/page.tsx",
        "app/sign-up/_components/CustomSignUpForm.tsx",
        "app/sign-up/_lib/signUpFlow.ts",
        "app/tenants/register/layout.tsx",
        "app/tenants/register/page.tsx",
        "app/tenants/register/_components/TenantRegistrationClient.tsx",
        "components/dashboard/WorkspaceSwitcher.tsx",
        "components/dashboard/nav-main.tsx",
        "components/dashboard/nav-secondary.tsx",
        "components/dashboard/app-sidebar.tsx",
        "components/dashboard/nav-user.tsx",
      ];

      const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
      const hardcodedDomainRegex = /clinicez\.(?:com|ph|net)/gi;

      for (const rel of touchedFiles) {
        const content = fs.readFileSync(path.join(portalSrcRoot, rel), "utf8");
        expect(content.match(hexRegex) ?? []).toEqual([]);
        expect(content).not.toContain("palette.ts");
        expect(content.match(hardcodedDomainRegex) ?? []).toEqual([]);
      }
    });
  });
});
