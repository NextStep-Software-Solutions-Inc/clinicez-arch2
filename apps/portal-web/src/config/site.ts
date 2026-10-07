/**
 * Deployment-specific site configuration. Nothing here is a hardcoded company domain:
 * every value comes from Vercel environment variables (NEXT_PUBLIC_*), so each environment
 * (dev, staging, prod, white-label) is configured without code changes.
 *
 * NOTE: each variable must be read as a literal `process.env.NEXT_PUBLIC_*` expression so Next.js
 * can inline it into client bundles.
 */

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, "");

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
const configuredBaseDomain = process.env.NEXT_PUBLIC_BASE_DOMAIN?.trim().replace(/^\.+/, "");

/** Public origin of the marketing/portal site, e.g. https://example.com (empty when not configured). */
export const siteUrl: string = configuredSiteUrl
  ? trimTrailingSlash(configuredSiteUrl)
  : configuredBaseDomain
    ? `https://${configuredBaseDomain}`
    : "";

/** Contact mailboxes shown in the UI. Empty string means "not configured" and the UI hides the entry. */
export const siteEmails = {
  contact: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? "",
  sales: process.env.NEXT_PUBLIC_SALES_EMAIL?.trim() ?? "",
  billing: process.env.NEXT_PUBLIC_BILLING_EMAIL?.trim() ?? "",
  support: process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() ?? "",
} as const;

/**
 * Service subdomain used for each facility type, e.g. `https://<facility>.<subdomain>.<baseDomain>`.
 * Override per deployment with NEXT_PUBLIC_SUBDOMAIN_{CLINIC,LABORATORY,PHARMACY,ORGANIZATION};
 * keep them aligned with the API's Facility__Subdomains__* settings.
 */
export const APP_SUBDOMAINS: Record<string, string> = {
  Clinic: process.env.NEXT_PUBLIC_SUBDOMAIN_CLINIC?.trim() || "clinic",
  Laboratory: process.env.NEXT_PUBLIC_SUBDOMAIN_LABORATORY?.trim() || "lab",
  Pharmacy: process.env.NEXT_PUBLIC_SUBDOMAIN_PHARMACY?.trim() || "pharmacy",
  Organization: process.env.NEXT_PUBLIC_SUBDOMAIN_ORGANIZATION?.trim() || "org",
};

/**
 * Builds an absolute URL for metadata (Open Graph / Twitter). When no site URL is configured the
 * path is returned as-is so Next.js resolves it against `metadataBase` / the request origin.
 */
export function absoluteUrl(path: string = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return siteUrl ? `${siteUrl}${normalized}` : normalized;
}

/** `mailto:` target for sales enquiries, falling back to the contact page when no mailbox is configured. */
export function salesContactHref(): string {
  return siteEmails.sales ? `mailto:${siteEmails.sales}` : "/contact-us";
}
