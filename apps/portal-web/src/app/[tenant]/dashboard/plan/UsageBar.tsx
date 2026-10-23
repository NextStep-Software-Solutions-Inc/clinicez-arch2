import { isUnlimited } from "@/services/entitlement.service";

interface UsageBarProps {
  /** Current consumption; undefined when the app has no figure for it. */
  used?: number;
  /** Optional secondary share (e.g., automatic pool distribution) stacked after `used`. */
  secondaryUsed?: number;
  /** Ceiling; null or negative means unlimited. */
  limit: number | null | undefined;
  label: string;
  /**
   * When true, only turns red when `used > limit` (over-allocated pool) rather than `used >= limit`.
   * Defaults to false (consumption mode: amber from 80%, red at 100%).
   */
  allowFullPool?: boolean;
}

/** Usage against a ceiling. Turns amber from 80% and red at the ceiling (or when over ceiling in pool mode). */
export function UsageBar({ used, secondaryUsed, limit, label, allowFullPool = false }: UsageBarProps) {
  const unlimited = limit === undefined || isUnlimited(limit);
  const hasUsage = used !== undefined;
  const primaryRatio = !unlimited && hasUsage && limit && limit > 0 ? Math.min(Math.max(used, 0) / limit, 1) : 0;
  const isDanger =
    !unlimited &&
    hasUsage &&
    limit !== undefined &&
    limit !== null &&
    (allowFullPool ? used > limit : used >= limit);
  const isWarning = !allowFullPool && !isDanger && primaryRatio >= 0.8;
  const color = isDanger ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-primary";

  const secondaryRatio =
    !unlimited && !isDanger && secondaryUsed !== undefined && secondaryUsed > 0 && limit && limit > 0
      ? Math.min(secondaryUsed / limit, Math.max(0, 1 - primaryRatio))
      : 0;

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={unlimited || limit === undefined || limit === null ? undefined : limit}
      aria-valuenow={hasUsage ? used : undefined}
      className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
    >
      <div
        className={`h-full transition-all ${secondaryRatio > 0 ? "rounded-l-full" : "rounded-full"} ${color}`}
        style={{ width: `${Math.round(primaryRatio * 100)}%` }}
      />
      {secondaryRatio > 0 && (
        <div
          className={`h-full bg-primary/35 dark:bg-primary/45 transition-all ${primaryRatio > 0 ? "rounded-r-full" : "rounded-full"}`}
          style={{ width: `${Math.round(secondaryRatio * 100)}%` }}
        />
      )}
    </div>
  );
}
