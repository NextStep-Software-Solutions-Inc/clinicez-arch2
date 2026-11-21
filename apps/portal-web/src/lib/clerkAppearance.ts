/**
 * Global Clerk appearance configuration for ClinicEZ Portal.
 *
 * ClinicEZ manages workspace subscription plans, seat entitlements, payment methods,
 * and Philippine tax invoices natively at `/[tenant]/dashboard/billing` — Clerk's
 * built-in Subscription / Billing API is NOT used.
 *
 * Even if Clerk Billing is enabled in a Clerk environment dashboard, these overrides
 * ensure the inapplicable "Billing" tab, mobile menu item, and billing sections are
 * hidden across all Clerk UserProfile and OrganizationProfile dialogs.
 */
export const CLERK_PORTAL_APPEARANCE = {
  elements: {
    navbarButton__billing: { display: "none" },
    menuItem__billing: { display: "none" },
    profilePage__billing: { display: "none" },
    profileSection__subscriptionsList: { display: "none" },
    profileSection__paymentMethods: { display: "none" },
    profileSection__accountCredits: { display: "none" },
  },
} as const;

/**
 * Strips any stale `#/billing` or `#billing` URL hash in-place via `history.replaceState`
 * while preserving `history.state` (Next.js App Router state) so Clerk never mounts its
 * hidden billing route and clean URLs remain untouched (zero `#/` hash pollution).
 */
export function sanitizeStaleClerkBillingHash(
  loc?: Pick<Location, "hash" | "pathname" | "search">,
  hist?: Pick<History, "replaceState"> & { readonly state?: unknown },
): void {
  const locationObj = loc ?? (typeof window !== "undefined" ? window.location : undefined);
  const historyObj = hist ?? (typeof window !== "undefined" ? window.history : undefined);
  if (!locationObj || !historyObj) return;

  if (/^#\/?billing(\/|$|\?)/i.test(locationObj.hash)) {
    const cleanUrl = `${locationObj.pathname}${locationObj.search}`;
    historyObj.replaceState(historyObj.state ?? null, "", cleanUrl || "/");
  }
}
