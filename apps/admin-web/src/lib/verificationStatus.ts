export type PlatformVerificationStatus =
  | "Unverified"
  | "PendingReview"
  | "Verified"
  | "Rejected"
  | "Suspended";

export type PractitionerVerificationLevel =
  | "Unverified"
  | "PendingVerification"
  | "AwaitingConfirmation"
  | "Verified"
  | "Rejected"
  | "Expired"
  | "Suspended";

export type VerificationBadgeTone = "neutral" | "info" | "warning" | "success" | "destructive";

export interface VerificationStatusDisplay {
  label: string;
  tone: VerificationBadgeTone;
  badgeClassName: string;
}

export const TONE_BADGE_CLASSES: Record<VerificationBadgeTone, string> = {
  neutral: "bg-surface-muted text-text-muted border-border",
  info: "bg-primary-subtle text-primary border-primary/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  destructive: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
};

/** Maps a facility's platform verification status to concise copy and semantic token styling. */
export function getPlatformVerificationDisplay(
  status?: PlatformVerificationStatus | string | null,
): VerificationStatusDisplay {
  switch (status) {
    case "PendingReview":
      return {
        label: "Pending Review",
        tone: "warning",
        badgeClassName: TONE_BADGE_CLASSES.warning,
      };
    case "Verified":
      return {
        label: "Verified",
        tone: "success",
        badgeClassName: TONE_BADGE_CLASSES.success,
      };
    case "Rejected":
    case "Suspended":
      return {
        label: "Action Required",
        tone: "destructive",
        badgeClassName: TONE_BADGE_CLASSES.destructive,
      };
    case "Unverified":
    default:
      return {
        label: "Unverified",
        tone: "neutral",
        badgeClassName: TONE_BADGE_CLASSES.neutral,
      };
  }
}

/** Maps a verification queue item or practitioner status to concise copy and semantic token styling. */
export function getQueueStatusDisplay(status?: string | null): VerificationStatusDisplay {
  switch (status) {
    case "Pending":
      return {
        label: "Pending",
        tone: "warning",
        badgeClassName: TONE_BADGE_CLASSES.warning,
      };
    case "PendingReview":
      return {
        label: "Pending Review",
        tone: "warning",
        badgeClassName: TONE_BADGE_CLASSES.warning,
      };
    case "InReview":
      return {
        label: "In Review",
        tone: "info",
        badgeClassName: TONE_BADGE_CLASSES.info,
      };
    case "AwaitingOtp":
    case "AwaitingConfirmation":
      return {
        label: "Awaiting Confirmation",
        tone: "info",
        badgeClassName: TONE_BADGE_CLASSES.info,
      };
    case "Approved":
    case "Verified":
      return {
        label: status === "Verified" ? "Verified" : "Approved",
        tone: "success",
        badgeClassName: TONE_BADGE_CLASSES.success,
      };
    case "Rejected":
    case "Suspended":
    case "Expired":
      return {
        label: status,
        tone: "destructive",
        badgeClassName: TONE_BADGE_CLASSES.destructive,
      };
    case "Withdrawn":
    case "Superseded":
    default:
      return {
        label: status || "Unverified",
        tone: "neutral",
        badgeClassName: TONE_BADGE_CLASSES.neutral,
      };
  }
}

export function getPractitionerLevelDisplay(
  level?: PractitionerVerificationLevel | string | null,
): VerificationStatusDisplay {
  if (level === "PendingVerification") {
    return {
      label: "Pending Verification",
      tone: "warning",
      badgeClassName: TONE_BADGE_CLASSES.warning,
    };
  }
  return getQueueStatusDisplay(level);
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface ScheduleWindowLike {
  dayOfWeek: number | string;
  startTime: string;
  endTime: string;
  slotDurationMinutes?: number;
}

/** Formats availability windows into a compact clinical schedule summary. */
export function formatScheduleSummary(windows?: ReadonlyArray<ScheduleWindowLike> | null): string {
  if (!windows || windows.length === 0) return "No schedule set";
  return windows
    .map((w) => {
      const dayLabel =
        typeof w.dayOfWeek === "number"
          ? DAY_NAMES[w.dayOfWeek] ?? `Day ${w.dayOfWeek}`
          : String(w.dayOfWeek).slice(0, 3);
      return `${dayLabel} ${w.startTime}–${w.endTime}`;
    })
    .join(", ");
}

/** Formats ISO UTC timestamps into readable local date/time strings without throwing on invalid input. */
export function formatVerificationTimestamp(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLERK_USER_ID_REGEX = /^user_[a-zA-Z0-9_-]+$/;

/** Returns true when a value is a raw UUID or Clerk `user_...` identifier rather than a human-readable name. */
export function isRawUserId(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return UUID_REGEX.test(trimmed) || CLERK_USER_ID_REGEX.test(trimmed);
}

export interface HumanActorDisplay {
  primary: string;
  secondary: string | null;
  tooltip: string | undefined;
}

function normalizeSpecialActorLabel(value: string): string {
  if (value.toLowerCase() === "practitioner-otp") {
    return "Practitioner (OTP Confirmation)";
  }
  return value;
}

/**
 * Resolves a human-readable actor label without ever returning a raw UUID or Clerk `user_...` ID as `primary`.
 * Raw IDs and emails are preserved for optional `tooltip` / `secondary` metadata.
 */
export function resolveHumanActorDisplay(
  displayName?: string | null,
  email?: string | null,
  rawId?: string | null,
  fallbackLabel = "Platform Reviewer",
): HumanActorDisplay {
  const cleanDisplay = displayName?.trim() || null;
  const cleanEmail = email?.trim() || null;
  const cleanRawId = rawId?.trim() || null;

  let primary = fallbackLabel;
  if (cleanDisplay && !isRawUserId(cleanDisplay)) {
    primary = normalizeSpecialActorLabel(cleanDisplay);
  } else if (cleanEmail && !isRawUserId(cleanEmail)) {
    primary = cleanEmail;
  } else if (cleanRawId && !isRawUserId(cleanRawId)) {
    primary = normalizeSpecialActorLabel(cleanRawId);
  }

  const secondary = cleanEmail && cleanEmail !== primary ? cleanEmail : null;
  const tooltipParts = [
    secondary,
    cleanRawId && cleanRawId !== primary ? cleanRawId : null,
  ].filter((part): part is string => Boolean(part));

  return {
    primary,
    secondary,
    tooltip: tooltipParts.length > 0 ? tooltipParts.join(" • ") : undefined,
  };
}

export type LicenseExpiryStatus = "valid" | "expiring_soon" | "expired" | "unknown";

export interface LicenseExpiryDisplay {
  dateText: string;
  status: LicenseExpiryStatus;
  badgeLabel: string | null;
  badgeClassName: string | null;
  daysRemaining: number | null;
}

/**
 * Evaluates a `YYYY-MM-DD` (or ISO date prefix) expiry date using UTC date-only arithmetic
 * so timezone offsets never shift expiration boundaries.
 */
export function getLicenseExpiryDisplay(
  dateStr?: string | null,
  referenceDate: Date = new Date(),
): LicenseExpiryDisplay | null {
  const trimmed = dateStr?.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return {
      dateText: trimmed,
      status: "unknown",
      badgeLabel: null,
      badgeClassName: null,
      daysRemaining: null,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const expiryUtc = Date.UTC(year, month - 1, day);
  const checkDate = new Date(expiryUtc);
  if (
    checkDate.getUTCFullYear() !== year ||
    checkDate.getUTCMonth() !== month - 1 ||
    checkDate.getUTCDate() !== day
  ) {
    return {
      dateText: trimmed,
      status: "unknown",
      badgeLabel: null,
      badgeClassName: null,
      daysRemaining: null,
    };
  }

  const todayUtc = Date.UTC(
    referenceDate.getUTCFullYear(),
    referenceDate.getUTCMonth(),
    referenceDate.getUTCDate(),
  );
  const daysRemaining = Math.floor((expiryUtc - todayUtc) / 86_400_000);

  if (daysRemaining < 0) {
    return {
      dateText: `${match[1]}-${match[2]}-${match[3]}`,
      status: "expired",
      badgeLabel: "Expired",
      badgeClassName: TONE_BADGE_CLASSES.destructive,
      daysRemaining,
    };
  }

  if (daysRemaining <= 30) {
    return {
      dateText: `${match[1]}-${match[2]}-${match[3]}`,
      status: "expiring_soon",
      badgeLabel: "Expiring Soon",
      badgeClassName: TONE_BADGE_CLASSES.warning,
      daysRemaining,
    };
  }

  return {
    dateText: `${match[1]}-${match[2]}-${match[3]}`,
    status: "valid",
    badgeLabel: null,
    badgeClassName: null,
    daysRemaining,
  };
}

/** Returns true when `updatedAtUtc` is present and meaningfully differs (> 1s) from `submittedAtUtc`. */
export function isDistinctTimestamp(
  updatedAtUtc?: string | null,
  submittedAtUtc?: string | null,
): boolean {
  const cleanUpdated = updatedAtUtc?.trim();
  if (!cleanUpdated) return false;
  const cleanSubmitted = submittedAtUtc?.trim();
  if (!cleanSubmitted) return true;

  const updatedMs = Date.parse(cleanUpdated);
  const submittedMs = Date.parse(cleanSubmitted);
  if (!Number.isNaN(updatedMs) && !Number.isNaN(submittedMs)) {
    return Math.abs(updatedMs - submittedMs) > 1000;
  }

  return cleanUpdated !== cleanSubmitted;
}

export type QueueStatusTab =
  | "pending"
  | "in_review"
  | "awaiting_confirmation"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "all";

export type QueueKindFilter = "all" | "facility" | "practitioner";

export interface VerificationQueueSearch {
  status?: QueueStatusTab;
  kind?: QueueKindFilter;
  q?: string;
}

const VALID_QUEUE_STATUS_TABS = new Set<QueueStatusTab>([
  "pending",
  "in_review",
  "awaiting_confirmation",
  "approved",
  "rejected",
  "withdrawn",
  "all",
]);

export function parseVerificationQueueSearch(
  raw: Record<string, unknown> | null | undefined,
): VerificationQueueSearch {
  if (!raw) return {};
  const result: VerificationQueueSearch = {};

  if (typeof raw.status === "string") {
    const trimmedStatus = raw.status.trim() as QueueStatusTab;
    if (VALID_QUEUE_STATUS_TABS.has(trimmedStatus) && trimmedStatus !== "pending") {
      result.status = trimmedStatus;
    }
  }

  if (raw.kind === "facility" || raw.kind === "practitioner") {
    result.kind = raw.kind;
  }

  if (typeof raw.q === "string" && raw.q.trim().length > 0) {
    result.q = raw.q.trim();
  }

  return result;
}

export function serializeVerificationQueueSearch(filters: {
  statusTab: QueueStatusTab;
  kindFilter: QueueKindFilter;
  q?: string;
}): VerificationQueueSearch {
  const result: VerificationQueueSearch = {};
  if (filters.statusTab && filters.statusTab !== "pending") {
    result.status = filters.statusTab;
  }
  if (filters.kindFilter && filters.kindFilter !== "all") {
    result.kind = filters.kindFilter;
  }
  const trimmedQ = filters.q?.trim();
  if (trimmedQ) {
    result.q = trimmedQ;
  }
  return result;
}

export function buildVerificationsQueueHref(search?: VerificationQueueSearch): string {
  if (!search) return "/verifications";
  const params = new URLSearchParams();
  if (search.status && search.status !== "pending") params.set("status", search.status);
  if (search.kind && search.kind !== "all") params.set("kind", search.kind);
  if (search.q?.trim()) params.set("q", search.q.trim());
  const qs = params.toString();
  return qs ? `/verifications?${qs}` : "/verifications";
}
