/**
 * Dental Search Contributor for ClinicEZ Pluggable Search Framework
 *
 * Provides client-side search contributor definition, FDI tooth status-to-badge
 * mapping, error boundary isolation, and deep-link route parameter formatting.
 */

import type { SearchBadgeVariant, SearchResultItemDto } from './dto';
import type { SearchContributor, SearchItem } from './searchRegistry';

export const DENTAL_SEARCH_CONTRIBUTOR_ID = 'clinic-dental';
export const DENTAL_SEARCH_CATEGORY = 'Dental';
export const DENTAL_SEARCH_CATEGORY_LABEL = 'Dental Chart';
export const DENTAL_SEARCH_PRIORITY = 25;
export const DENTAL_SEARCH_REQUIRED_PERMISSION = 'Clinic.ConsultationsRead';

/**
 * Maps tooth condition status to semantic search badge variants.
 * Strictly adheres to @clinicez/design-tokens clinical triage and urgency scales.
 */
export function mapToothStatusBadgeVariant(status: string): SearchBadgeVariant {
  const normalized = (status || '').trim().toLowerCase();
  switch (normalized) {
    case 'decayed':
    case 'fractured':
    case 'impacted':
      return 'urgent';
    case 'forextraction':
    case 'for extraction':
      return 'emergency';
    case 'filled':
    case 'sealant':
    case 'implant':
      return 'routine';
    case 'crowned':
    case 'rootcanal':
    case 'root canal':
    case 'healthy':
    case 'missing':
    default:
      return 'neutral';
  }
}

/**
 * Formats a raw or backend SearchResultItemDto into a standardized dental SearchItem
 * with tab: 'dental', patientId, toothNumber, and resolved badge variant.
 */
export function formatDentalSearchItem(
  item: SearchResultItemDto | SearchItem,
  onSelectCallback?: () => void,
): SearchItem {
  const patientId = item.routeParams?.patientId || '';
  const toothNumber = item.routeParams?.toothNumber || '';
  const statusText = item.badgeText || item.badge?.text || '';
  const resolvedVariant: SearchBadgeVariant =
    item.badgeVariant || (statusText ? mapToothStatusBadgeVariant(statusText) : 'neutral');

  const existingOnSelect = 'onSelect' in item && typeof (item as SearchItem).onSelect === 'function'
    ? (item as SearchItem).onSelect
    : undefined;

  return {
    ...item,
    category: DENTAL_SEARCH_CATEGORY,
    targetRoute: item.targetRoute || 'Patients',
    routeParams: {
      ...item.routeParams,
      patientId,
      openPatientId: patientId,
      tab: 'dental',
      ...(toothNumber ? { toothNumber: String(toothNumber) } : {}),
    },
    badgeText: statusText,
    badgeVariant: resolvedVariant,
    badge: {
      text: statusText,
      variant: resolvedVariant,
    },
    onSelect: () => {
      existingOnSelect?.();
      onSelectCallback?.();
    },
  };
}

export type DentalSearchFn = (
  query: string,
  signal?: AbortSignal,
) => Promise<SearchResultItemDto[] | SearchItem[]> | SearchResultItemDto[] | SearchItem[];

export interface CreateDentalSearchContributorOptions {
  searchFn: DentalSearchFn;
  onSelectTooth?: (patientId: string, toothNumber: string | number) => void;
  onNavigateToDentalChart?: (patientId: string, toothNumber: string) => void;
  requiredPermission?: string;
  priority?: number;
}

/**
 * Factory creating a strongly-typed SearchContributor for the Dental module.
 * Supports both function-first signature and options-object signature.
 */
export function createDentalSearchContributor(
  searchFnOrOptions: DentalSearchFn | CreateDentalSearchContributorOptions,
  onNavigateToDentalChart?: (patientId: string, toothNumber: string) => void,
  extraOptions?: { requiredPermission?: string; priority?: number },
): SearchContributor {
  let searchFn: DentalSearchFn;
  let onSelectNav: ((patientId: string, toothNumber: string) => void) | undefined;
  let priority = DENTAL_SEARCH_PRIORITY;
  let requiredPermission = DENTAL_SEARCH_REQUIRED_PERMISSION;

  if (typeof searchFnOrOptions === 'function') {
    searchFn = searchFnOrOptions;
    onSelectNav = onNavigateToDentalChart;
    if (extraOptions?.priority !== undefined) priority = extraOptions.priority;
    if (extraOptions?.requiredPermission !== undefined) requiredPermission = extraOptions.requiredPermission;
  } else {
    searchFn = searchFnOrOptions.searchFn;
    onSelectNav =
      searchFnOrOptions.onNavigateToDentalChart ||
      (searchFnOrOptions.onSelectTooth
        ? (p, t) => searchFnOrOptions.onSelectTooth!(p, t)
        : undefined);
    if (searchFnOrOptions.priority !== undefined) priority = searchFnOrOptions.priority;
    if (searchFnOrOptions.requiredPermission !== undefined) {
      requiredPermission = searchFnOrOptions.requiredPermission;
    }
  }

  return {
    id: DENTAL_SEARCH_CONTRIBUTOR_ID,
    category: DENTAL_SEARCH_CATEGORY,
    categoryLabel: DENTAL_SEARCH_CATEGORY_LABEL,
    priority,
    requiredPermission,
    search: async (query: string, signal?: AbortSignal): Promise<SearchItem[]> => {
      try {
        const trimmed = (query ?? '').trim();
        if (!trimmed) {
          return [];
        }

        const rawResults = await searchFn(trimmed, signal);
        if (!Array.isArray(rawResults)) {
          return [];
        }

        return rawResults.map((item) => {
          const patientId = item.routeParams?.patientId || '';
          const toothNumber = item.routeParams?.toothNumber || '';
          return formatDentalSearchItem(item, () => {
            if (onSelectNav && patientId && toothNumber) {
              onSelectNav(patientId, toothNumber);
            }
          });
        });
      } catch {
        // Error boundary isolation - contributor failure returns empty array
        return [];
      }
    },
  };
}

let configuredSearchFn: DentalSearchFn | null = null;

/**
 * Configures the backend search delegation function for the default dentalSearchContributor singleton.
 */
export function configureDentalSearchFn(fn: DentalSearchFn): void {
  configuredSearchFn = fn;
}

/**
 * Default dental search contributor singleton implementing SearchContributor.
 */
export const dentalSearchContributor: SearchContributor = {
  id: DENTAL_SEARCH_CONTRIBUTOR_ID,
  category: DENTAL_SEARCH_CATEGORY,
  categoryLabel: DENTAL_SEARCH_CATEGORY_LABEL,
  priority: DENTAL_SEARCH_PRIORITY,
  requiredPermission: DENTAL_SEARCH_REQUIRED_PERMISSION,
  search: async (query: string, signal?: AbortSignal): Promise<SearchItem[]> => {
    try {
      const trimmed = (query ?? '').trim();
      if (!trimmed || !configuredSearchFn) {
        return [];
      }
      const rawResults = await configuredSearchFn(trimmed, signal);
      if (!Array.isArray(rawResults)) {
        return [];
      }
      return rawResults.map((item) => formatDentalSearchItem(item));
    } catch {
      return [];
    }
  },
};
