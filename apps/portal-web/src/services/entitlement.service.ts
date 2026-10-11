import { z } from "zod";
import { apiClient } from "@/transport/apiClient";
import { entitlementStatusSchema, facilityKindSchema, parseWire } from "@/lib/wire";

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

const facilityAllocationSchema = z.object({
  facilityId: z.string(),
  facilityName: z.string(),
  facilityType: facilityKindSchema,
  maxStaff: z.number(),
  maxStorageMb: z.number(),
  concurrentTerminals: z.number(),
  explicitMaxStaff: z.number().nullable(),
  explicitMaxStorageMb: z.number().nullable(),
  explicitConcurrentTerminals: z.number().nullable(),
  licenseExpiresAt: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  appVersion: z.string().nullable(),
});

const workspaceEntitlementsSchema = z.object({
  planSlug: z.string(),
  planName: z.string(),
  status: entitlementStatusSchema,
  version: z.number(),
  periodEnd: z.string().nullable(),
  limits: z.record(z.string(), z.number().nullable()),
  features: z.array(z.string()),
  pools: z.object({ staff: z.number(), storageMb: z.number(), terminals: z.number() }),
  facilities: z.array(facilityAllocationSchema),
});

/** A facility's slice of the workspace pools, as it is in its signed license right now. Explicit shares: null means "automatic share of the pool". */
export type FacilityAllocation = z.infer<typeof facilityAllocationSchema>;

/** Mirrors `WorkspaceEntitlementsDto`. `limits` maps limit key → ceiling; null means unlimited. */
export type WorkspaceEntitlements = z.infer<typeof workspaceEntitlementsSchema>;

export type WorkspacePools = WorkspaceEntitlements["pools"];

/** A null value means "automatic share of the pool". */
export interface AllocationInput {
  maxStaff: number | null;
  maxStorageMb: number | null;
  concurrentTerminals: number | null;
}

export const entitlementService = {
  getEntitlements: async (tenantSlug: string): Promise<WorkspaceEntitlements> => {
    const res = await apiClient.get<unknown>(`/tenants/${encodeURIComponent(tenantSlug)}/entitlements`);
    return parseWire(workspaceEntitlementsSchema, res.data, "entitlements");
  },

  /** Sets (or, with all values null, clears) a facility's explicit pool shares. Answers 409 `allocation_exceeds_pool` when over a pool. */
  setAllocation: async (tenantSlug: string, facilityId: string, input: AllocationInput): Promise<WorkspaceEntitlements> => {
    const res = await apiClient.put<unknown>(
      `/tenants/${encodeURIComponent(tenantSlug)}/facilities/${encodeURIComponent(facilityId)}/allocation`,
      input,
    );
    return parseWire(workspaceEntitlementsSchema, res.data, "entitlements");
  },
};
