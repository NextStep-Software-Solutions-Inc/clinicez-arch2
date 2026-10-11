import { isUnlimited } from "@/services/entitlement.service";

interface UsageBarProps {
  /** Current consumption; undefined when the app has no figure for it. */
  used?: number;
  /** Ceiling; null or negative means unlimited. */
  limit: number | null | undefined;
  label: string;
}

/** Usage against a ceiling. Turns amber from 80% and red at the ceiling. */
export function UsageBar({ used, limit, label }: UsageBarProps) {
  const unlimited = limit === undefined || isUnlimited(limit);
  const hasUsage = used !== undefined;
  const ratio = !unlimited && hasUsage && limit && limit > 0 ? Math.min(used / limit, 1) : 0;
  const atLimit = !unlimited && hasUsage && limit !== undefined && limit !== null && used >= limit;
  const color = atLimit ? "bg-rose-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary";

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={unlimited || limit === undefined || limit === null ? undefined : limit}
      aria-valuenow={hasUsage ? used : undefined}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
    >
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
    </div>
  );
}
