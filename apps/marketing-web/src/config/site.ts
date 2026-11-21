import { getMarketingBaseUrl, resolveBaseDomain } from "@/utils/urls";

/**
 * Deployment-specific site configuration for Clinic EZ marketing-web.
 * Zero hardcoded company domains: every value derives from NEXT_PUBLIC_* environment
 * variables or the active deployment base domain.
 */

export const siteName = "Clinic EZ";

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

/** Public origin of the Clinic EZ marketing site (no trailing slash). */
export function getSiteOrigin(hostname?: string): string {
  return trimTrailingSlash(getMarketingBaseUrl("/", hostname));
}

export const siteUrl: string = getSiteOrigin();

function resolveDefaultMailbox(localPart: string): string {
  const baseDomain = resolveBaseDomain();
  return baseDomain ? `${localPart}@${baseDomain}` : "";
}

/** Contact mailboxes shown in the UI, derived from env vars or active deployment domain. */
export const siteEmails = {
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || resolveDefaultMailbox("support"),
  sales: process.env.NEXT_PUBLIC_SALES_EMAIL?.trim() || resolveDefaultMailbox("sales"),
  billing: process.env.NEXT_PUBLIC_BILLING_EMAIL?.trim() || resolveDefaultMailbox("billing"),
  support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || resolveDefaultMailbox("support"),
  careers: process.env.NEXT_PUBLIC_CAREERS_EMAIL?.trim() || "connect@nextstep-software.com",
} as const;

export const socialLinks = {
  facebook: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK?.trim() || "https://facebook.com/clinicezph",
  twitter: process.env.NEXT_PUBLIC_SOCIAL_TWITTER?.trim() || "https://twitter.com/clinicezph",
  instagram: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM?.trim() || "https://instagram.com/clinicezph",
  linkedin:
    process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN?.trim() ||
    "https://linkedin.com/company/nextstep-software",
} as const;

/**
 * Service subdomain used for each facility type, e.g. `https://<facility>.<subdomain>.<baseDomain>`.
 */
export const APP_SUBDOMAINS: Record<string, string> = {
  Clinic: process.env.NEXT_PUBLIC_SUBDOMAIN_CLINIC?.trim() || "clinic",
  Laboratory: process.env.NEXT_PUBLIC_SUBDOMAIN_LABORATORY?.trim() || "lab",
  Pharmacy: process.env.NEXT_PUBLIC_SUBDOMAIN_PHARMACY?.trim() || "pharmacy",
  Organization: process.env.NEXT_PUBLIC_SUBDOMAIN_ORGANIZATION?.trim() || "org",
};

/**
 * Builds an absolute URL on the Clinic EZ marketing surface for Open Graph / Twitter metadata.
 */
export function absoluteUrl(path: string = "/"): string {
  return getMarketingBaseUrl(path);
}

/** `mailto:` target for sales enquiries, falling back to `/contact-us` when no mailbox is configured. */
export function salesContactHref(): string {
  const salesEmail = process.env.NEXT_PUBLIC_SALES_EMAIL?.trim() || resolveDefaultMailbox("sales");
  return salesEmail ? `mailto:${salesEmail}` : "/contact-us";
}

/** `mailto:` target for careers and talent connections (Nextstep Software Corporation). */
export function careersContactHref(): string {
  return siteEmails.careers
    ? `mailto:${siteEmails.careers}?subject=Clinic%20EZ%20Talent%20Connection`
    : "/contact-us";
}
