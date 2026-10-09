import { apiClient } from "@/transport/apiClient";

/** Entitlement keys of `EntitlementKeys` (portal-api). Limits are `limit.*`, features `feature.*`. */
export const ENTITLEMENT_KEYS = {
  clinics: "limit.clinics",
  laboratories: "limit.laboratories",
  pharmacies: "limit.pharmacies",
  organizations: "limit.organizations",
  branches: "limit.branches",
  members: "limit.members",
  staff: "limit.staff",
  storageGb: "limit.storage_gb",
  terminals: "limit.terminals",
  beds: "limit.beds",
  analyzers: "limit.analyzers",
  monthlyConsultations: "limit.monthly_consultations",
  apiRequestsMonthly: "limit.api_requests_monthly",
  patients: "limit.patients",
  crossTenantInterop: "feature.cross_tenant_interop",
  onPrem: "feature.on_prem",
} as const;

/** The server reports an unlimited pool or share as `int.MaxValue`. */
const SERVER_UNLIMITED = 2_147_483_647;

/** True for an unlimited limit: `null` (entitlements), any negative value (-1) or the server's `int.MaxValue`. */
export function isUnlimited(value: number | null | undefined): boolean {
  return value === null || (value !== undefined && (value < 0 || value >= SERVER_UNLIMITED));
}

/** Human text of a limit: "Unlimited", a grouped number, or an em dash when the plan does not define it. */
export function formatLimit(value: number | null | undefined): string {
  if (value === undefined) return "—";
  if (value === null || isUnlimited(value)) return "Unlimited";
  return value.toLocaleString();
}

/** A facility's slice of the workspace pools, as it is in its signed license right now. */
export interface FacilityAllocation {
  facilityId: string;
  facilityName: string;
  facilityType: string;
  maxStaff: number;
  maxStorageMb: number;
  concurrentTerminals: number;
  /** Explicit share; null means "automatic share of the pool". */
  explicitMaxStaff: number | null;
  explicitMaxStorageMb: number | null;
  explicitConcurrentTerminals: number | null;
  licenseExpiresAt: string | null;
  lastSeenAt: string | null;
  appVersion: string | null;
}

export interface WorkspacePools {
  staff: number;
  storageMb: number;
  terminals: number;
}

/** Mirrors `WorkspaceEntitlementsDto`. */
export interface WorkspaceEntitlements {
  planSlug: string;
  planName: string;
  status: string;
  version: number;
  periodEnd: string | null;
  /** Limit key → ceiling; null means unlimited. */
  limits: Record<string, number | null>;
  features: string[];
  pools: WorkspacePools;
  facilities: FacilityAllocation[];
}

/** A null value means "automatic share of the pool". */
export interface AllocationInput {
  maxStaff: number | null;
  maxStorageMb: number | null;
  concurrentTerminals: number | null;
}

export const entitlementService = {
  getEntitlements: async (tenantSlug: string): Promise<WorkspaceEntitlements> => {
    const res = await apiClient.get<WorkspaceEntitlements>(`/tenants/${encodeURIComponent(tenantSlug)}/entitlements`);
    return res.data;
  },

  /** Sets (or, with all values null, clears) a facility's explicit pool shares. Answers 409 `allocation_exceeds_pool` when over a pool. */
  setAllocation: async (tenantSlug: string, facilityId: string, input: AllocationInput): Promise<WorkspaceEntitlements> => {
    const res = await apiClient.put<WorkspaceEntitlements>(
      `/tenants/${encodeURIComponent(tenantSlug)}/facilities/${encodeURIComponent(facilityId)}/allocation`,
      input,
    );
    return res.data;
  },
};
