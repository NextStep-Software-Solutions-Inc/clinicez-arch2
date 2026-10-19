import useSWR from "swr";
import { entitlementService, WorkspaceEntitlements } from "@/services/entitlement.service";

/**
 * Effective plan limits and features of a workspace (Owner/Admin only). Not suspense-based so pages render their
 * own loading / forbidden states.
 */
export function useEntitlements(tenantSlug: string) {
  const { data, error, isLoading, mutate } = useSWR<WorkspaceEntitlements>(
    tenantSlug ? `/tenants/${tenantSlug}/entitlements` : null,
    () => entitlementService.getEntitlements(tenantSlug),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const features = data?.features;

  return {
    entitlements: data,
    isLoading,
    error,
    isForbidden: (error as { response?: { status?: number } } | undefined)?.response?.status === 403,
    /** Unknown (still loading, or failed) counts as unknown, not as missing: callers decide how to treat it. */
    hasFeature: (key: string): boolean | undefined => (features ? features.includes(key) : undefined),
    mutate,
  };
}
