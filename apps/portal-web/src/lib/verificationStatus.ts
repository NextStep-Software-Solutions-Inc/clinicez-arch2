import type { PlatformVerificationStatus, PractitionerVerificationLevel } from "@/lib/wire";

export const LTO_PROOF_MAX_BYTES = 5 * 1024 * 1024;
export const LTO_PROOF_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;

export type VerificationBadgeTone = "neutral" | "info" | "warning" | "success" | "destructive";

export interface VerificationStatusDisplay {
  label: string;
  tone: VerificationBadgeTone;
  badgeClassName: string;
}

const TONE_BADGE_CLASSES: Record<VerificationBadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-primary/10 text-primary border-primary/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  success: "bg-success/10 text-success border-success/25",
  destructive: "bg-destructive/10 text-destructive border-destructive/25",
};

/** Maps a facility's platform verification status to concise clinical UI copy and semantic token styling. */
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

/** Maps a verification queue item / practitioner status to concise clinical UI copy and semantic token styling. */
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

/** Validates a DOH LTO proof file prior to upload (PDF, JPEG, or PNG up to 5 MiB). */
export function validateLtoProofFile(
  file: Pick<File, "type" | "size" | "name">,
): { valid: true } | { valid: false; message: string } {
  if (!file || file.size <= 0) {
    return { valid: false, message: "Select a non-empty PDF, JPEG, or PNG file." };
  }
  if (file.size > LTO_PROOF_MAX_BYTES) {
    return { valid: false, message: "DOH LTO proof file must be 5 MiB or smaller." };
  }
  const normalizedType = (file.type || "").toLowerCase();
  const hasAllowedExt = /\.(pdf|jpe?g|png)$/i.test(file.name || "");
  if (
    normalizedType &&
    !LTO_PROOF_ALLOWED_TYPES.includes(normalizedType as (typeof LTO_PROOF_ALLOWED_TYPES)[number])
  ) {
    return { valid: false, message: "Only PDF, JPEG, and PNG files are accepted." };
  }
  if (!normalizedType && !hasAllowedExt) {
    return { valid: false, message: "Only PDF, JPEG, and PNG files are accepted." };
  }
  return { valid: true };
}
