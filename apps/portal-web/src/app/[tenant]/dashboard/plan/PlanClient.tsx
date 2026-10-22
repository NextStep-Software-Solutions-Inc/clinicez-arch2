"use client";

import Link from "next/link";
import useSWR from "swr";
import { IconCheck, IconCircleDashed, IconCrown, IconSlice } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEntitlements } from "@/hooks/useEntitlements";
import type { EntitlementStatus } from "@/lib/wire";
import { billingService, type BillingPlan } from "@/services/billing.service";
import { branchService } from "@/services/branch.service";
import { ENTITLEMENT_KEYS, formatLimit, isUnlimited, type WorkspaceEntitlements } from "@/services/entitlement.service";
import { facilityService } from "@/services/facility.service";
import { staffService, type StaffMemberDto } from "@/services/staff.service";
import { AllocationEditor } from "./AllocationEditor";
import { UsageBar } from "./UsageBar";

interface LimitRow {
  key: string;
  label: string;
  hint?: string;
}

const LIMIT_ROWS: LimitRow[] = [
  { key: ENTITLEMENT_KEYS.clinics, label: "Clinics" },
  { key: ENTITLEMENT_KEYS.laboratories, label: "Laboratories" },
  { key: ENTITLEMENT_KEYS.pharmacies, label: "Pharmacies" },
  { key: ENTITLEMENT_KEYS.organizations, label: "Organizations" },
  { key: ENTITLEMENT_KEYS.branches, label: "Branches" },
  { key: ENTITLEMENT_KEYS.members, label: "Workspace members" },
  { key: ENTITLEMENT_KEYS.staff, label: "Staff seats", hint: "Pool shared by your facilities" },
  { key: ENTITLEMENT_KEYS.terminals, label: "Concurrent terminals", hint: "Pool shared by your facilities" },
  { key: ENTITLEMENT_KEYS.storageGb, label: "Storage (GB)", hint: "Pool shared by your facilities" },
  { key: ENTITLEMENT_KEYS.beds, label: "Beds" },
  { key: ENTITLEMENT_KEYS.analyzers, label: "Lab analyzers" },
  { key: ENTITLEMENT_KEYS.monthlyConsultations, label: "Consultations per month" },
  { key: ENTITLEMENT_KEYS.apiRequestsMonthly, label: "API requests per month" },
  { key: ENTITLEMENT_KEYS.patients, label: "Patient records" },
];

const FEATURE_LABELS: Record<string, string> = {
  [ENTITLEMENT_KEYS.crossTenantInterop]: "Links with other workspaces",
  [ENTITLEMENT_KEYS.onPrem]: "On-premise deployment",
};

function featureLabel(key: string): string {
  return (
    FEATURE_LABELS[key] ??
    key
      .replace(/^feature\./, "")
      .replace(/_/g, " ")
      .replace(/^./, (c) => c.toUpperCase())
  );
}

export interface WorkspaceUsage {
  facilitiesByType: Record<string, number>;
  branches: number | undefined;
  members: number | undefined;
  activeStaff: number | undefined;
  patients: number | undefined;
  apiRequests: number | undefined;
  plans: BillingPlan[];
}

/**
 * Counts active/invited operational staff members who occupy a staff seat across facilities.
 * Workspace-only administrative accounts (Owner/Admin/Billing without a facility profile)
 * and suspended/revoked/expired records do not consume a facility staff seat.
 */
export function countActiveStaff(members: StaffMemberDto[] | undefined): number | undefined {
  if (!members) return undefined;
  return members.filter(
    (m) =>
      (Boolean(m.facilityId) || (m.role !== "Owner" && m.role !== "Admin" && m.role !== "Billing")) &&
      m.status !== "Suspended" &&
      m.status !== "Revoked" &&
      m.status !== "Expired",
  ).length;
}

/** Optional figures: anything the viewer may not read simply shows without usage. */
async function loadUsage(tenantSlug: string): Promise<WorkspaceUsage> {
  const [facilities, branches, staff, billing, plans] = await Promise.all([
    facilityService.getFacilities(tenantSlug).catch(() => null),
    branchService.getBranches(tenantSlug).catch(() => null),
    staffService.getTenantStaff(tenantSlug).catch(() => null),
    billingService.getBillingInfo(tenantSlug).catch(() => null),
    billingService.getPlans().catch(() => [] as BillingPlan[]),
  ]);
  const facilitiesByType: Record<string, number> = {};
  for (const f of facilities ?? []) facilitiesByType[f.facilityType] = (facilitiesByType[f.facilityType] ?? 0) + 1;
  return {
    facilitiesByType,
    branches: branches?.length,
    members: staff ? (staff.quota?.currentCount ?? staff.members.length) : undefined,
    activeStaff: countActiveStaff(staff?.members),
    patients: billing?.usage?.activePatientRecordsCount,
    apiRequests: billing?.usage?.monthlyApiQuotaUsed,
    plans,
  };
}

export function usageFor(
  key: string,
  usage: WorkspaceUsage | undefined,
  _entitlements?: WorkspaceEntitlements,
): number | undefined {
  if (!usage) return undefined;
  switch (key) {
    case ENTITLEMENT_KEYS.clinics:
      return usage.facilitiesByType.Clinic ?? 0;
    case ENTITLEMENT_KEYS.laboratories:
      return usage.facilitiesByType.Laboratory ?? 0;
    case ENTITLEMENT_KEYS.pharmacies:
      return usage.facilitiesByType.Pharmacy ?? 0;
    case ENTITLEMENT_KEYS.organizations:
      return usage.facilitiesByType.Organization ?? 0;
    case ENTITLEMENT_KEYS.branches:
      return usage.branches;
    case ENTITLEMENT_KEYS.members:
      return usage.members;
    case ENTITLEMENT_KEYS.staff:
      return usage.activeStaff;
    case ENTITLEMENT_KEYS.patients:
      return usage.patients;
    case ENTITLEMENT_KEYS.apiRequestsMonthly:
      return usage.apiRequests;
    case ENTITLEMENT_KEYS.terminals:
    case ENTITLEMENT_KEYS.storageGb:
    default:
      return undefined;
  }
}

export function poolAllocationHint(
  key: string,
  defaultHint: string | undefined,
  entitlements: WorkspaceEntitlements,
): string | undefined {
  const count = entitlements.facilities.length;
  if (
    key !== ENTITLEMENT_KEYS.staff &&
    key !== ENTITLEMENT_KEYS.terminals &&
    key !== ENTITLEMENT_KEYS.storageGb
  ) {
    return defaultHint;
  }
  if (count === 0) {
    return "Pool shared by your facilities (no facilities created yet)";
  }
  const facilityLabel = count === 1 ? "1 facility" : `${count} facilities`;
  if (key === ENTITLEMENT_KEYS.staff) {
    if (isUnlimited(entitlements.pools.staff) || entitlements.facilities.some((f) => isUnlimited(f.maxStaff))) {
      return `Pool shared by your facilities · Unlimited capacity allocated across ${facilityLabel}`;
    }
    const allocated = entitlements.facilities.reduce((sum, f) => sum + f.maxStaff, 0);
    return `Pool shared by your facilities · ${allocated.toLocaleString()} seats allocated across ${facilityLabel}`;
  }
  if (key === ENTITLEMENT_KEYS.terminals) {
    if (
      isUnlimited(entitlements.pools.terminals) ||
      entitlements.facilities.some((f) => isUnlimited(f.concurrentTerminals))
    ) {
      return `Pool shared by your facilities · Unlimited capacity allocated across ${facilityLabel}`;
    }
    const allocated = entitlements.facilities.reduce((sum, f) => sum + f.concurrentTerminals, 0);
    return `Pool shared by your facilities · ${allocated.toLocaleString()} terminals allocated across ${facilityLabel}`;
  }
  if (key === ENTITLEMENT_KEYS.storageGb) {
    if (
      isUnlimited(entitlements.pools.storageMb) ||
      entitlements.facilities.some((f) => isUnlimited(f.maxStorageMb))
    ) {
      return `Pool shared by your facilities · Unlimited capacity allocated across ${facilityLabel}`;
    }
    const allocatedMb = entitlements.facilities.reduce((sum, f) => sum + f.maxStorageMb, 0);
    const allocatedGb = Number((allocatedMb / 1024).toFixed(1));
    return `Pool shared by your facilities · ${allocatedGb.toLocaleString()} GB allocated across ${facilityLabel}`;
  }
  return defaultHint;
}

function statusTone(status: EntitlementStatus): string {
  if (status === "Active" || status === "Trialing") return "border-emerald-300 text-emerald-700 dark:text-emerald-300";
  if (status === "Cancelled") return "border-amber-300 text-amber-700 dark:text-amber-300";
  return "border-rose-300 text-rose-700 dark:text-rose-300";
}

interface PlanClientProps {
  tenantSlug: string;
}

export default function PlanClient({ tenantSlug }: PlanClientProps) {
  const { entitlements, isLoading, isForbidden, error, mutate } = useEntitlements(tenantSlug);
  const { data: usage } = useSWR(`plan-usage/${tenantSlug}`, () => loadUsage(tenantSlug), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const currentPlan = usage?.plans.find(
    (p) => p.id.toLowerCase() === entitlements?.planSlug.toLowerCase() || p.name.toLowerCase() === entitlements?.planName.toLowerCase(),
  );
  const nextPlan = currentPlan
    ? usage?.plans.filter((p) => p.rank > currentPlan.rank).sort((a, b) => a.rank - b.rank)[0]
    : undefined;

  const allFeatureKeys = Array.from(
    new Set([...(entitlements?.features ?? []), ...(usage?.plans.flatMap((p) => p.enabledFeatures) ?? [])]),
  )
    .filter((k) => k.startsWith("feature."))
    .sort();

  return (
    <div className="w-full flex-1 flex flex-col gap-6 sm:gap-8 p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto animate-in fade-in-50 duration-300">
      <div className="border-b pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Plan &amp; Usage</h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1">
          What your plan includes, how much of it you use, and how your facilities share the workspace pools.
        </p>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64 rounded-xl" />
          <Skeleton className="h-72 w-full rounded-3xl" />
        </div>
      )}

      {isForbidden && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-6 text-sm text-amber-800 dark:text-amber-300">
          Only the workspace Owner or an Admin can view the plan and its usage.
        </div>
      )}

      {!isLoading && !isForbidden && error && (
        <div className="rounded-2xl border border-red-200 bg-red-50/50 dark:bg-red-950/20 p-6 text-sm text-red-700 dark:text-red-300">
          The plan could not be loaded. Please refresh and try again.
        </div>
      )}

      {entitlements && (
        <Tabs defaultValue="plan" className="w-full space-y-6">
          <TabsList className="inline-flex w-auto justify-start h-auto p-1 bg-muted/65 rounded-xl border gap-1">
            <TabsTrigger value="plan" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5">
              <IconCrown className="h-3.5 w-3.5 shrink-0" />
              Plan &amp; usage
            </TabsTrigger>
            <TabsTrigger value="allocation" className="px-4 sm:px-6 py-2 text-xs font-semibold flex items-center gap-1.5">
              <IconSlice className="h-3.5 w-3.5 shrink-0" />
              Facility allocation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plan" className="space-y-6">
            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader className="p-6 pb-3 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-lg font-bold flex flex-wrap items-center gap-2">
                    {entitlements.planName}
                    <Badge variant="outline" className={`text-[10px] ${statusTone(entitlements.status)}`}>
                      {entitlements.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs font-medium text-slate-500">
                    {entitlements.periodEnd
                      ? `Current period ends ${new Date(entitlements.periodEnd).toLocaleDateString()}.`
                      : "No period end on record."}
                    {nextPlan && ` The next step up is ${nextPlan.name}.`}
                  </CardDescription>
                </div>
                <Button asChild className="rounded-xl text-xs font-bold shrink-0">
                  <Link href={`/${tenantSlug}/dashboard/billing?tab=plans`}>Upgrade or change plan</Link>
                </Button>
              </CardHeader>
            </Card>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-lg font-bold">Limits &amp; usage</CardTitle>
                <CardDescription className="text-xs font-medium text-slate-500">
                  The effective ceilings of your plan. Bars turn amber from 80% and red at the ceiling.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 pt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                {LIMIT_ROWS.filter((row) => row.key in entitlements.limits).map((row) => {
                  const limit = entitlements.limits[row.key];
                  const used = usageFor(row.key, usage, entitlements);
                  const hint = poolAllocationHint(row.key, row.hint, entitlements);
                  return (
                    <div key={row.key} className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-bold">{row.label}</span>
                        <span className="text-xs text-slate-500">
                          {used !== undefined && <span className="font-semibold text-foreground">{used.toLocaleString()}</span>}
                          {used !== undefined && " of "}
                          {formatLimit(limit)}
                        </span>
                      </div>
                      <UsageBar used={used} limit={limit} label={row.label} />
                      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
                      {used !== undefined && !isUnlimited(limit) && limit !== null && used >= limit && (
                        <p className="text-[11px] font-semibold text-rose-600">
                          Limit reached.{" "}
                          <Link href={`/${tenantSlug}/dashboard/billing?tab=plans`} className="underline">
                            Change plan
                          </Link>
                        </p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border-slate-100 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950">
              <CardHeader className="p-6 pb-3">
                <CardTitle className="text-lg font-bold">Features</CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {allFeatureKeys.length === 0 && <p className="text-sm text-slate-500">This plan has no optional features.</p>}
                {allFeatureKeys.map((key) => {
                  const included = entitlements.features.includes(key);
                  return (
                    <div key={key} className="flex items-center gap-2 text-sm">
                      {included ? (
                        <IconCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                      ) : (
                        <IconCircleDashed className="h-4 w-4 text-slate-300 shrink-0" />
                      )}
                      <span className={included ? "font-medium" : "text-slate-400"}>{featureLabel(key)}</span>
                      {!included && <span className="text-[11px] text-slate-400">Not on your plan</span>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allocation">
            <AllocationEditor tenantSlug={tenantSlug} entitlements={entitlements} onChanged={(next) => mutate(next, { revalidate: false })} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
