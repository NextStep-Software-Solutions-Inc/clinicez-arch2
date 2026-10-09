"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { IconAlertTriangle, IconBuildingHospital } from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  entitlementService,
  formatLimit,
  isUnlimited,
  type FacilityAllocation,
  type WorkspaceEntitlements,
  type WorkspacePools,
} from "@/services/entitlement.service";
import { describeApiError } from "@/lib/apiError";
import { toastApiError } from "@/lib/apiToast";
import { UsageBar } from "./UsageBar";

type PoolKey = keyof WorkspacePools;

interface PoolField {
  pool: PoolKey;
  label: string;
  unit: string;
  explicit: (f: FacilityAllocation) => number | null;
  effective: (f: FacilityAllocation) => number;
}

const POOL_FIELDS: PoolField[] = [
  { pool: "staff", label: "Staff seats", unit: "seats", explicit: (f) => f.explicitMaxStaff, effective: (f) => f.maxStaff },
  { pool: "terminals", label: "Concurrent terminals", unit: "terminals", explicit: (f) => f.explicitConcurrentTerminals, effective: (f) => f.concurrentTerminals },
  { pool: "storageMb", label: "Storage", unit: "MB", explicit: (f) => f.explicitMaxStorageMb, effective: (f) => f.maxStorageMb },
];

type Draft = Record<PoolKey, string>;

function toDraft(f: FacilityAllocation): Draft {
  const fmt = (v: number | null) => (v === null ? "" : String(v));
  return { staff: fmt(f.explicitMaxStaff), terminals: fmt(f.explicitConcurrentTerminals), storageMb: fmt(f.explicitMaxStorageMb) };
}

/** Blank is "automatic" (null); anything else must be a whole number of 0 or more, otherwise undefined. */
function parseShare(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : undefined;
}

function formatWhen(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Not reported yet";
}

interface AllocationRowProps {
  tenantSlug: string;
  facility: FacilityAllocation;
  /** Explicit shares of every other facility, summed per pool from the saved state. */
  othersExplicit: WorkspacePools;
  pools: WorkspacePools;
  draft: Draft;
  onDraftChange: (draft: Draft) => void;
  onSaved: (next: WorkspaceEntitlements) => void;
}

function AllocationRow({ tenantSlug, facility, othersExplicit, pools, draft, onDraftChange, onSaved }: AllocationRowProps) {
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const parsed = POOL_FIELDS.map((field) => ({ field, value: parseShare(draft[field.pool]) }));
  const hasInvalid = parsed.some((p) => p.value === undefined);
  const overPools = parsed.filter(({ field, value }) => {
    if (value === undefined || value === null || isUnlimited(pools[field.pool])) return false;
    return othersExplicit[field.pool] + value > pools[field.pool];
  });
  const saved = toDraft(facility);
  const dirty = POOL_FIELDS.some((field) => draft[field.pool].trim() !== saved[field.pool]);

  const save = async () => {
    const shares = parsed.map((p) => p.value);
    if (shares.some((v) => v === undefined)) return;
    setSaving(true);
    setServerError(null);
    try {
      const next = await entitlementService.setAllocation(tenantSlug, facility.facilityId, {
        maxStaff: parsed[0].value ?? null,
        concurrentTerminals: parsed[1].value ?? null,
        maxStorageMb: parsed[2].value ?? null,
      });
      toast.success(`${facility.facilityName} allocation saved`);
      onSaved(next);
    } catch (err: unknown) {
      const info = describeApiError(err, "Failed to save the allocation");
      setServerError(info.message);
      toastApiError(err, "Failed to save the allocation", tenantSlug);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-100 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <IconBuildingHospital className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="text-sm font-semibold">{facility.facilityName}</span>
        <Badge variant="outline" className="text-[10px]">{facility.facilityType}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {POOL_FIELDS.map((field) => {
          const text = draft[field.pool];
          const value = parseShare(text);
          const over = overPools.some((p) => p.field.pool === field.pool);
          const id = `${facility.facilityId}-${field.pool}`;
          return (
            <div key={field.pool} className="space-y-1.5">
              <Label htmlFor={id} className="text-xs font-bold">{field.label}</Label>
              <Input
                id={id}
                inputMode="numeric"
                placeholder="Automatic"
                value={text}
                aria-invalid={value === undefined || over}
                onChange={(e) => onDraftChange({ ...draft, [field.pool]: e.target.value })}
                className={`h-9 rounded-xl text-sm ${value === undefined || over ? "border-rose-500 focus-visible:ring-rose-500" : ""}`}
              />
              <p className="text-[11px] text-slate-500">
                Effective now: <span className="font-semibold">{formatLimit(field.effective(facility))}</span> {field.unit}
                {field.explicit(facility) === null && " (automatic)"}
              </p>
              {value === undefined && <p className="text-[11px] font-semibold text-rose-600">Enter a whole number or leave blank.</p>}
              {over && (
                <p className="text-[11px] font-semibold text-rose-600">
                  Over the pool: the other facilities already hold {othersExplicit[field.pool].toLocaleString()} of {formatLimit(pools[field.pool])}.
                </p>
              )}
            </div>
          );
        })}
      </div>

      <dl className="grid grid-cols-1 gap-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-900/40 sm:grid-cols-3">
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">License expires</dt>
          <dd className="mt-0.5 font-medium">{formatWhen(facility.licenseExpiresAt)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Last seen</dt>
          <dd className="mt-0.5 font-medium">{formatWhen(facility.lastSeenAt)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">App version</dt>
          <dd className="mt-0.5 font-mono font-medium">{facility.appVersion ?? "Not reported yet"}</dd>
        </div>
      </dl>

      {serverError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300" role="alert">
          <IconAlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {serverError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!dirty || saving}
          onClick={() => {
            onDraftChange(saved);
            setServerError(null);
          }}
          className="rounded-xl text-xs"
        >
          Reset
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || saving || hasInvalid || overPools.length > 0}
          onClick={save}
          className="rounded-xl text-xs font-bold"
        >
          {saving ? "Saving..." : "Save allocation"}
        </Button>
      </div>
    </div>
  );
}

interface AllocationEditorProps {
  tenantSlug: string;
  entitlements: WorkspaceEntitlements;
  onChanged: (next: WorkspaceEntitlements) => void;
}

/** Per-facility staff, terminal and storage shares of the workspace pools. Blank means an automatic share. */
export function AllocationEditor({ tenantSlug, entitlements, onChanged }: AllocationEditorProps) {
  const { facilities, pools } = entitlements;
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(facilities.map((f) => [f.facilityId, toDraft(f)])),
  );

  const draftFor = (f: FacilityAllocation): Draft => drafts[f.facilityId] ?? toDraft(f);

  const totals = useMemo(() => {
    const sum: WorkspacePools = { staff: 0, terminals: 0, storageMb: 0 };
    for (const f of facilities) {
      const d = drafts[f.facilityId] ?? toDraft(f);
      for (const field of POOL_FIELDS) {
        const value = parseShare(d[field.pool]);
        if (typeof value === "number") sum[field.pool] += value;
      }
    }
    return sum;
  }, [drafts, facilities]);

  const savedTotals = useMemo(() => {
    const sum: WorkspacePools = { staff: 0, terminals: 0, storageMb: 0 };
    for (const f of facilities) {
      for (const field of POOL_FIELDS) sum[field.pool] += field.explicit(f) ?? 0;
    }
    return sum;
  }, [facilities]);

  const automaticCount = facilities.filter((f) => POOL_FIELDS.some((field) => field.explicit(f) === null)).length;

  if (facilities.length === 0) {
    return <p className="text-sm text-slate-500">No facilities yet. Create one from the workspace overview to allocate the pools.</p>;
  }

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <CardHeader className="p-6 pb-3">
          <CardTitle className="text-lg font-bold">Workspace pools</CardTitle>
          <CardDescription className="text-xs font-medium text-slate-500">
            Your plan gives the workspace a pool of each resource. Set a fixed share for a facility, or leave it blank to let the
            facility take an equal part of whatever the fixed shares leave over. Fixed shares can never add up to more than the pool.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 p-6 pt-3 sm:grid-cols-3">
          {POOL_FIELDS.map((field) => {
            const pool = pools[field.pool];
            const over = !isUnlimited(pool) && totals[field.pool] > pool;
            return (
              <div key={field.pool} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-bold">{field.label}</span>
                  <span className={`text-xs font-semibold ${over ? "text-rose-600" : "text-slate-500"}`}>
                    {totals[field.pool].toLocaleString()} / {formatLimit(pool)}
                  </span>
                </div>
                <UsageBar used={totals[field.pool]} limit={pool} label={`${field.label} fixed shares`} />
                <p className="text-[11px] text-slate-500">
                  Fixed shares including your edits. Saved: {savedTotals[field.pool].toLocaleString()}.
                </p>
              </div>
            );
          })}
        </CardContent>
        {automaticCount > 0 && (
          <p className="px-6 pb-6 text-[11px] text-slate-500">
            {automaticCount} facilit{automaticCount === 1 ? "y has" : "ies have"} at least one automatic share.
          </p>
        )}
      </Card>

      <div className="space-y-4">
        {facilities.map((facility) => {
          const othersExplicit: WorkspacePools = { staff: 0, terminals: 0, storageMb: 0 };
          for (const other of facilities) {
            if (other.facilityId === facility.facilityId) continue;
            for (const field of POOL_FIELDS) othersExplicit[field.pool] += field.explicit(other) ?? 0;
          }
          return (
            <AllocationRow
              key={`${facility.facilityId}:${entitlements.version}`}
              tenantSlug={tenantSlug}
              facility={facility}
              othersExplicit={othersExplicit}
              pools={pools}
              draft={draftFor(facility)}
              onDraftChange={(next) => setDrafts((prev) => ({ ...prev, [facility.facilityId]: next }))}
              onSaved={(next) => {
                setDrafts(Object.fromEntries(next.facilities.map((f) => [f.facilityId, toDraft(f)])));
                onChanged(next);
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
