/**
 * Portal Web Domain Search Contributors
 *
 * Implements the Universal Pluggable Search Provider Framework contributors
 * for portal-web, registering domain categories into universalSearchRegistry.
 */

import {
  universalSearchRegistry,
  type SearchContributor,
  type SearchItem,
  type SearchBadgeVariant,
  type SearchExecutionOptions,
} from "@shared/safe";
import type { BranchDto } from "./branch.service";
import type { StaffMemberDto } from "./staff.service";
import {
  getNavigationItems,
  getQuickActionItems,
  getBranchItems,
  getStaffItems,
  filterSearchItems,
} from "../components/dashboard/WorkspaceSearchDialog";

export interface PortalSearchContext {
  tenantSlug?: string;
  branches?: BranchDto[];
  staff?: StaffMemberDto[];
}

/**
 * Resolves a semantic badge variant conforming to SearchBadgeVariant.
 * Follows @clinicez/design-tokens clinical and operational urgency tiers.
 */
export function resolveBadgeVariant(
  category: string,
  badgeText?: string
): SearchBadgeVariant {
  if (!badgeText) return "neutral";
  const normalized = badgeText.toLowerCase().trim();

  // Emergency urgency (STAT, Emergency, Critical, Failed)
  if (
    /\bstat\b/i.test(normalized) ||
    normalized.includes("emergency") ||
    normalized.includes("critical") ||
    normalized.includes("failed")
  ) {
    return "emergency";
  }

  // Urgent urgency (Urgent, Priority, Pending, Warning, Suspended)
  if (
    normalized.includes("urgent") ||
    normalized.includes("priority") ||
    normalized.includes("pending") ||
    normalized.includes("warning") ||
    normalized.includes("suspended")
  ) {
    return "urgent";
  }

  // Routine urgency (Actions, Active, Accredited, Doctor, Clinic, Admin, Owner)
  if (
    normalized.includes("action") ||
    normalized.includes("routine") ||
    normalized.includes("active") ||
    normalized.includes("accredited") ||
    normalized.includes("doctor") ||
    normalized.includes("clinic") ||
    normalized.includes("owner") ||
    normalized.includes("admin")
  ) {
    return "routine";
  }

  return "neutral";
}

/**
 * Registers all 5 portal search contributors into universalSearchRegistry:
 * 1. portal-quick-actions (actions, Quick Actions, priority 5)
 * 2. portal-navigation (navigation, Navigation, priority 15)
 * 3. portal-branches (branches, Branches, priority 25)
 * 4. portal-facilities (facilities, Facilities, priority 30)
 * 5. portal-team (team, Workspace Team, priority 35)
 *
 * @returns cleanup function that unregisters all 5 contributors
 */
export function registerPortalSearchContributors(
  context: PortalSearchContext = {}
): () => void {
  const tenantSlug = context.tenantSlug || "demo-tenant";
  const branches = context.branches || [];
  const staff = context.staff || [];

  const quickActionsContributor: SearchContributor = {
    id: "portal-quick-actions",
    category: "actions",
    categoryLabel: "Quick Actions",
    priority: 5,
    search: (query: string, signal?: AbortSignal) => {
      if (signal?.aborted) return [];
      const items = getQuickActionItems(tenantSlug);
      const filtered = filterSearchItems(items, query);
      if (signal?.aborted) return [];
      return filtered.map((item): SearchItem => {
        const variant = resolveBadgeVariant("actions", item.badge);
        return {
          id: item.id,
          category: "actions",
          title: item.title,
          subtitle: item.subtitle || "",
          badgeText: item.badge,
          badgeVariant: variant,
          targetRoute: item.url,
          badge: item.badge ? { text: item.badge, variant } : undefined,
        };
      });
    },
  };

  const navigationContributor: SearchContributor = {
    id: "portal-navigation",
    category: "navigation",
    categoryLabel: "Navigation",
    priority: 15,
    search: (query: string, signal?: AbortSignal) => {
      if (signal?.aborted) return [];
      const items = getNavigationItems(tenantSlug);
      const filtered = filterSearchItems(items, query);
      if (signal?.aborted) return [];
      return filtered.map((item): SearchItem => {
        const variant = resolveBadgeVariant("navigation", item.badge);
        return {
          id: item.id,
          category: "navigation",
          title: item.title,
          subtitle: item.subtitle || "",
          badgeText: item.badge,
          badgeVariant: variant,
          targetRoute: item.url,
          badge: item.badge ? { text: item.badge, variant } : undefined,
        };
      });
    },
  };

  const branchesContributor: SearchContributor = {
    id: "portal-branches",
    category: "branches",
    categoryLabel: "Branches",
    priority: 25,
    search: (query: string, signal?: AbortSignal) => {
      if (signal?.aborted) return [];
      const items = getBranchItems(branches, tenantSlug).filter(
        (i) => i.category === "branches"
      );
      const filtered = filterSearchItems(items, query);
      if (signal?.aborted) return [];
      return filtered.map((item): SearchItem => {
        const variant = resolveBadgeVariant("branches", item.badge);
        return {
          id: item.id,
          category: "branches",
          title: item.title,
          subtitle: item.subtitle || "",
          badgeText: item.badge,
          badgeVariant: variant,
          targetRoute: item.url,
          badge: item.badge ? { text: item.badge, variant } : undefined,
        };
      });
    },
  };

  const facilitiesContributor: SearchContributor = {
    id: "portal-facilities",
    category: "facilities",
    categoryLabel: "Facilities",
    priority: 30,
    search: (query: string, signal?: AbortSignal) => {
      if (signal?.aborted) return [];
      const items = getBranchItems(branches, tenantSlug).filter(
        (i) => i.category === "facilities"
      );
      const filtered = filterSearchItems(items, query);
      if (signal?.aborted) return [];
      return filtered.map((item): SearchItem => {
        const variant = resolveBadgeVariant("facilities", item.badge);
        return {
          id: item.id,
          category: "facilities",
          title: item.title,
          subtitle: item.subtitle || "",
          badgeText: item.badge,
          badgeVariant: variant,
          targetRoute: item.url,
          badge: item.badge ? { text: item.badge, variant } : undefined,
        };
      });
    },
  };

  const teamContributor: SearchContributor = {
    id: "portal-team",
    category: "team",
    categoryLabel: "Workspace Team",
    priority: 35,
    search: (query: string, signal?: AbortSignal) => {
      if (signal?.aborted) return [];
      const items = getStaffItems(staff, tenantSlug);
      const filtered = filterSearchItems(items, query);
      if (signal?.aborted) return [];
      return filtered.map((item): SearchItem => {
        const variant = resolveBadgeVariant("team", item.badge);
        return {
          id: item.id,
          category: "team",
          title: item.title,
          subtitle: item.subtitle || "",
          badgeText: item.badge,
          badgeVariant: variant,
          targetRoute: item.url,
          badge: item.badge ? { text: item.badge, variant } : undefined,
        };
      });
    },
  };

  const unregisters = [
    universalSearchRegistry.register(quickActionsContributor),
    universalSearchRegistry.register(navigationContributor),
    universalSearchRegistry.register(branchesContributor),
    universalSearchRegistry.register(facilitiesContributor),
    universalSearchRegistry.register(teamContributor),
  ];

  return () => {
    for (const unreg of unregisters) {
      unreg();
    }
  };
}

/**
 * Executes a search through universalSearchRegistry across all registered portal and cross-app contributors.
 */
export async function searchPortalUniversal(
  query: string,
  options?: SearchExecutionOptions
): Promise<SearchItem[]> {
  return universalSearchRegistry.search(query, options);
}
