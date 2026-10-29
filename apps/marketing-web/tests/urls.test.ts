import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  getMarketingBaseUrl,
  getPatientAppUrl,
  getPortalApiUrl,
  getPortalAppUrl,
  resolveBaseDomain,
} from "../src/utils/urls";

const ENV_KEYS = [
  "NEXT_PUBLIC_BASE_DOMAIN",
  "NEXT_PUBLIC_MARKETING_URL",
  "NEXT_PUBLIC_MARKETING_PORT",
  "NEXT_PUBLIC_PORTAL_URL",
  "NEXT_PUBLIC_PORTAL_PORT",
  "NEXT_PUBLIC_PATIENT_APP_URL",
  "NEXT_PUBLIC_PATIENT_APP_PORT",
  "NEXT_PUBLIC_PORTAL_API_URL",
  "PORTAL_API_URL",
  "NEXT_PUBLIC_API_URL",
] as const;

describe("marketing-web cross-surface URL resolvers", () => {
  const savedEnv: Record<string, string | undefined> = {};
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    delete (globalThis as { window?: unknown }).window;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedEnv[key];
      }
    }
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  describe("resolveBaseDomain", () => {
    it("resolves root {domain}, www.{domain}, and home.{domain} to {domain}", () => {
      expect(resolveBaseDomain("carenetwork.health")).toBe("carenetwork.health");
      expect(resolveBaseDomain("www.carenetwork.health")).toBe("carenetwork.health");
      expect(resolveBaseDomain("home.carenetwork.health")).toBe("carenetwork.health");
    });

    it("strips service prefixes (portal, admin, app, dashboard) and ports", () => {
      expect(resolveBaseDomain("portal.carenetwork.health")).toBe("carenetwork.health");
      expect(resolveBaseDomain("admin.carenetwork.health:8443")).toBe("carenetwork.health");
      expect(resolveBaseDomain("app.carenetwork.health")).toBe("carenetwork.health");
      expect(resolveBaseDomain("dashboard.carenetwork.health")).toBe("carenetwork.health");
    });

    it("reads window.location.hostname when hostname argument is omitted", () => {
      (globalThis as { window?: unknown }).window = {
        location: { hostname: "home.metroclinic.org" },
      };
      expect(resolveBaseDomain()).toBe("metroclinic.org");

      (globalThis as { window?: unknown }).window = {
        location: { hostname: "www.metroclinic.org" },
      };
      expect(resolveBaseDomain()).toBe("metroclinic.org");
    });

    it("prioritizes NEXT_PUBLIC_BASE_DOMAIN over active hostname and strips leading dots", () => {
      process.env.NEXT_PUBLIC_BASE_DOMAIN = "  .enterprise-health.example  ";
      expect(resolveBaseDomain("localhost")).toBe("enterprise-health.example");
      expect(resolveBaseDomain("www.other.example")).toBe("enterprise-health.example");
    });

    it("returns empty string for localhost, loopback IPs, *.localhost, *.lvh.me, and raw IPv4", () => {
      expect(resolveBaseDomain()).toBe("");
      expect(resolveBaseDomain("localhost")).toBe("");
      expect(resolveBaseDomain("localhost:3002")).toBe("");
      expect(resolveBaseDomain("127.0.0.1")).toBe("");
      expect(resolveBaseDomain("127.0.0.1:3002")).toBe("");
      expect(resolveBaseDomain("::1")).toBe("");
      expect(resolveBaseDomain("[::1]:3002")).toBe("");
      expect(resolveBaseDomain("marketing.localhost")).toBe("");
      expect(resolveBaseDomain("home.lvh.me")).toBe("");
      expect(resolveBaseDomain("lvh.me")).toBe("");
      expect(resolveBaseDomain("192.168.1.42")).toBe("");
      expect(resolveBaseDomain("10.0.0.15:3002")).toBe("");
    });
  });

  describe("getMarketingBaseUrl", () => {
    it("falls back to http://localhost:3002 in local dev and respects NEXT_PUBLIC_MARKETING_PORT", () => {
      expect(getMarketingBaseUrl()).toBe("http://localhost:3002/");
      expect(getMarketingBaseUrl("/pricing")).toBe("http://localhost:3002/pricing");
      expect(getMarketingBaseUrl("about")).toBe("http://localhost:3002/about");

      process.env.NEXT_PUBLIC_MARKETING_PORT = "4302";
      expect(getMarketingBaseUrl("/blogs")).toBe("http://localhost:4302/blogs");
    });

    it("canonicalizes {domain}, www.{domain}, and home.{domain} to https://{domain}", () => {
      expect(getMarketingBaseUrl("/pricing", "carenetwork.health")).toBe(
        "https://carenetwork.health/pricing"
      );
      expect(getMarketingBaseUrl("/pricing", "www.carenetwork.health")).toBe(
        "https://carenetwork.health/pricing"
      );
      expect(getMarketingBaseUrl("/pricing", "home.carenetwork.health")).toBe(
        "https://carenetwork.health/pricing"
      );
    });

    it("uses NEXT_PUBLIC_MARKETING_URL override when set", () => {
      process.env.NEXT_PUBLIC_MARKETING_URL = " https://home.custom-brand.io/ ";
      expect(getMarketingBaseUrl("/sitemap.xml")).toBe(
        "https://home.custom-brand.io/sitemap.xml"
      );
      expect(getMarketingBaseUrl("/")).toBe("https://home.custom-brand.io/");
    });
  });

  describe("getPortalAppUrl", () => {
    it("falls back to http://localhost:3000 in local dev and respects NEXT_PUBLIC_PORTAL_PORT", () => {
      expect(getPortalAppUrl("/sign-in")).toBe("http://localhost:3000/sign-in");
      expect(getPortalAppUrl("sign-up")).toBe("http://localhost:3000/sign-up");

      process.env.NEXT_PUBLIC_PORTAL_PORT = "4300";
      expect(getPortalAppUrl("/tenants/register")).toBe(
        "http://localhost:4300/tenants/register"
      );
    });

    it("builds https://portal.{domain} across {domain}, www.{domain}, home.{domain}, and NEXT_PUBLIC_BASE_DOMAIN", () => {
      expect(getPortalAppUrl("/sign-in", undefined, "carenetwork.health")).toBe(
        "https://portal.carenetwork.health/sign-in"
      );
      expect(getPortalAppUrl("/sign-up", undefined, "www.carenetwork.health")).toBe(
        "https://portal.carenetwork.health/sign-up"
      );
      expect(getPortalAppUrl("/tenants/register", undefined, "home.carenetwork.health")).toBe(
        "https://portal.carenetwork.health/tenants/register"
      );

      process.env.NEXT_PUBLIC_BASE_DOMAIN = "regionalclinic.org";
      expect(getPortalAppUrl("/sign-in")).toBe(
        "https://portal.regionalclinic.org/sign-in"
      );
    });

    it("appends query params cleanly while omitting undefined, null, and empty values", () => {
      const url = getPortalAppUrl(
        "/sign-up",
        {
          plan: "growth",
          billing: "annual",
          redirect_url: "/tenants/register?plan=growth&billing=annual",
          ignoredUndefined: undefined,
          ignoredNull: null,
          ignoredEmpty: "",
        },
        "home.carenetwork.health"
      );

      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://portal.carenetwork.health");
      expect(parsed.pathname).toBe("/sign-up");
      expect(parsed.searchParams.get("plan")).toBe("growth");
      expect(parsed.searchParams.get("billing")).toBe("annual");
      expect(parsed.searchParams.get("redirect_url")).toBe(
        "/tenants/register?plan=growth&billing=annual"
      );
      expect(parsed.searchParams.has("ignoredUndefined")).toBe(false);
      expect(parsed.searchParams.has("ignoredNull")).toBe(false);
      expect(parsed.searchParams.has("ignoredEmpty")).toBe(false);
    });

    it("uses NEXT_PUBLIC_PORTAL_URL override when set", () => {
      process.env.NEXT_PUBLIC_PORTAL_URL = "https://console.white-label.org/";
      expect(getPortalAppUrl("/sign-up", { plan: "starter" })).toBe(
        "https://console.white-label.org/sign-up?plan=starter"
      );
    });
  });

  describe("getPortalApiUrl & getPatientAppUrl", () => {
    it("falls back to http://localhost:5000/api/v1 locally and derives https://portal-api.{domain}/api/v1 on domains", () => {
      expect(getPortalApiUrl()).toBe("http://localhost:5000/api/v1");
      expect(getPortalApiUrl("carenetwork.health")).toBe(
        "https://portal-api.carenetwork.health/api/v1"
      );
      expect(getPortalApiUrl("www.carenetwork.health")).toBe(
        "https://portal-api.carenetwork.health/api/v1"
      );
      expect(getPortalApiUrl("home.carenetwork.health")).toBe(
        "https://portal-api.carenetwork.health/api/v1"
      );
    });

    it("respects NEXT_PUBLIC_PORTAL_API_URL, PORTAL_API_URL, and NEXT_PUBLIC_API_URL ensuring /api/v1 suffix", () => {
      process.env.NEXT_PUBLIC_API_URL = "https://api-fallback.example.org";
      expect(getPortalApiUrl()).toBe("https://api-fallback.example.org/api/v1");

      process.env.PORTAL_API_URL = "https://internal-portal-api.example.org/api/v1/";
      expect(getPortalApiUrl()).toBe("https://internal-portal-api.example.org/api/v1");

      process.env.NEXT_PUBLIC_PORTAL_API_URL = "https://public-portal-api.example.org/";
      expect(getPortalApiUrl()).toBe("https://public-portal-api.example.org/api/v1");
    });

    it("resolves patient booking URLs without hardcoded domains", () => {
      expect(getPatientAppUrl("/booking", { clinic: "st-luke" })).toBe(
        "http://localhost:3003/booking?clinic=st-luke"
      );
      expect(
        getPatientAppUrl("/booking", { clinic: "st-luke" }, "home.carenetwork.health")
      ).toBe("https://patient.carenetwork.health/booking?clinic=st-luke");
    });
  });
});
