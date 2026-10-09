import useSWR from "swr";
import { tenantService, WorkspaceSettingsDto } from "@/services/tenant.service";

/**
 * Workspace settings for the current tenant (Owner/Admin only).
 * Not suspense-based: the settings page renders its own loading / forbidden states.
 */
export function useWorkspaceSettings(tenantSlug: string) {
  const { data, error, isLoading, mutate } = useSWR<WorkspaceSettingsDto>(
    tenantSlug ? `/tenants/${tenantSlug}/settings` : null,
    () => tenantService.getWorkspaceSettings(tenantSlug),
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  return {
    settings: data,
    isLoading,
    error,
    /** True when the signed-in user is not an Owner/Admin of this workspace. */
    isForbidden: (error as { response?: { status?: number } } | undefined)?.response?.status === 403,
    mutate,
  };
}
