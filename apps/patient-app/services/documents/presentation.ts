import type { IconName } from '../../components/ui/iconNames';
import type {
  LabRequestStage,
  LabResultSource,
  LabResultVerification,
  PaymentStatus,
  PrescriptionStage,
} from '../api/wireEnums';

/** Presentation mapping for synced documents. Pure so it can be unit tested. */

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export interface Chip {
  label: string;
  tone: ChipTone;
  icon?: IconName;
}

const PROVENANCE_BADGES: Record<LabResultSource, Chip> = {
  ClinicEzLab: { label: 'ClinicEZ lab', tone: 'success', icon: 'lab' },
  ExternalLab: { label: 'External lab', tone: 'info', icon: 'building' },
  PatientUploaded: { label: 'Uploaded by me', tone: 'neutral', icon: 'upload' },
};

export function provenanceBadge(source: LabResultSource): Chip {
  return PROVENANCE_BADGES[source];
}

export interface VerificationBadge extends Chip {
  /** Explanation shown under the badge (e.g. the reviewing doctor's remarks). */
  detail: string | null;
}

export function verificationBadge(
  verification: LabResultVerification,
  remarks?: string | null,
): VerificationBadge {
  switch (verification) {
    case 'Verified':
      return { label: 'Verified', tone: 'success', icon: 'checkCircle', detail: null };
    case 'Rejected':
      return {
        label: 'Rejected',
        tone: 'danger',
        icon: 'alert',
        detail: remarks?.trim() ? remarks.trim() : 'The reviewing doctor did not accept this result.',
      };
    case 'Unverified':
      return {
        label: 'Pending doctor review',
        tone: 'warning',
        icon: 'clock',
        detail: 'Your ordering doctor has not reviewed this result yet.',
      };
  }
}

const PAYMENT_CHIPS: Record<PaymentStatus, Chip> = {
  Paid: { label: 'Paid', tone: 'success', icon: 'checkCircle' },
  Pending: { label: 'Payment pending', tone: 'warning', icon: 'clock' },
  None: { label: 'No payment due', tone: 'neutral' },
};

export function paymentChip(status: PaymentStatus): Chip {
  return PAYMENT_CHIPS[status];
}

export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  return `${currency ?? 'PHP'} ${amount.toFixed(2)}`;
}

// ── Lab request stages ────────────────────────────────────────────────────────

export const LAB_STAGE_LABELS: Record<LabRequestStage, string> = {
  Issued: 'Issued',
  Routed: 'Sent to lab',
  Claimed: 'Claimed at lab',
  AwaitingPayment: 'Awaiting payment',
  Paid: 'Paid',
  SpecimenCollected: 'Specimen collected',
  InProcess: 'Being processed',
  ResultFinalized: 'Result ready',
  ExternalSubmitted: 'Result uploaded',
  Reviewed: 'Reviewed by doctor',
  Rejected: 'Rejected',
  Cancelled: 'Cancelled',
};

const LAB_FLOW: readonly LabRequestStage[] = [
  'Issued',
  'Routed',
  'Claimed',
  'AwaitingPayment',
  'Paid',
  'SpecimenCollected',
  'InProcess',
  'ResultFinalized',
  'Reviewed',
];

const PAYMENT_STAGES: readonly LabRequestStage[] = ['AwaitingPayment', 'Paid'];
const EXTERNAL_FLOW: readonly LabRequestStage[] = ['Issued', 'ExternalSubmitted', 'Reviewed'];
const FAILED_STAGES: readonly LabRequestStage[] = ['Rejected', 'Cancelled'];

export type TimelineState = 'done' | 'current' | 'upcoming' | 'failed';

export interface TimelineStep {
  stage: LabRequestStage;
  label: string;
  state: TimelineState;
}

/** Ordered progress steps for a lab request slip; payment steps only appear when payment is required. */
export function labTimeline(stage: LabRequestStage, paymentRequired: boolean): TimelineStep[] {
  if (FAILED_STAGES.includes(stage)) {
    return [
      { stage: 'Issued', label: LAB_STAGE_LABELS.Issued, state: 'done' },
      { stage, label: LAB_STAGE_LABELS[stage], state: 'failed' },
    ];
  }

  const flow = stage === 'ExternalSubmitted'
    ? EXTERNAL_FLOW
    : LAB_FLOW.filter((step) => paymentRequired || !PAYMENT_STAGES.includes(step));

  const currentIndex = flow.indexOf(stage);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;
  const isLast = activeIndex === flow.length - 1;

  return flow.map((step, index) => ({
    stage: step,
    label: LAB_STAGE_LABELS[step],
    state:
      index < activeIndex || (isLast && index === activeIndex)
        ? 'done'
        : index === activeIndex
          ? 'current'
          : 'upcoming',
  }));
}

export function labStageChip(stage: LabRequestStage): Chip {
  const label = LAB_STAGE_LABELS[stage];
  if (stage === 'Reviewed' || stage === 'ResultFinalized') {
    return { label, tone: 'success', icon: 'checkCircle' };
  }
  if (FAILED_STAGES.includes(stage)) return { label, tone: 'danger', icon: 'alert' };
  if (stage === 'Issued') return { label, tone: 'info', icon: 'clipboard' };
  return { label, tone: 'primary', icon: 'clock' };
}

export function canUploadLabResult(stage: LabRequestStage): boolean {
  return stage !== 'Cancelled' && stage !== 'Reviewed';
}

export function showLabClaimQr(stage: LabRequestStage, claimToken: string | null): boolean {
  return claimToken !== null && !FAILED_STAGES.includes(stage) && stage !== 'Reviewed';
}

// ── Prescription stages ───────────────────────────────────────────────────────

export const PRESCRIPTION_STAGE_LABELS: Record<PrescriptionStage, string> = {
  Issued: 'Issued',
  Accepted: 'Accepted by pharmacy',
  PartiallyAccepted: 'Partially accepted',
  Rejected: 'Rejected',
  Dispensed: 'Dispensed',
  ExternalDispensed: 'Dispensed elsewhere',
};

export function prescriptionStageChip(stage: PrescriptionStage): Chip {
  const label = PRESCRIPTION_STAGE_LABELS[stage];
  switch (stage) {
    case 'Dispensed':
    case 'ExternalDispensed':
      return { label, tone: 'success', icon: 'checkCircle' };
    case 'Rejected':
      return { label, tone: 'danger', icon: 'alert' };
    case 'Accepted':
    case 'PartiallyAccepted':
      return { label, tone: 'primary', icon: 'clock' };
    case 'Issued':
      return { label, tone: 'info', icon: 'pill' };
  }
}

export function canDispenseElsewhere(stage: PrescriptionStage): boolean {
  return stage !== 'Dispensed' && stage !== 'ExternalDispensed';
}

export function showPrescriptionClaimQr(stage: PrescriptionStage, claimToken: string | null): boolean {
  return claimToken !== null && canDispenseElsewhere(stage) && stage !== 'Rejected';
}
// ── Lab result files & observations ───────────────────────────────────────────

export type ResultFileKind = 'image' | 'pdf' | 'other';

/** Classifies a (possibly signed) file URL by the extension of its path, ignoring the query string. */
export function fileKindFromUrl(url: string): ResultFileKind {
  const path = url.split(/[?#]/)[0].toLowerCase();
  if (path.endsWith('.pdf')) return 'pdf';
  if (/\.(jpe?g|png|heic|heif|webp)$/.test(path)) return 'image';
  return 'other';
}

/** Observation flag text (e.g. "H", "L", "critical") is abnormal unless empty or "N"/"normal". */
export function isAbnormalFlag(flag: string): boolean {
  const normalised = flag.trim().toLowerCase();
  return normalised !== '' && normalised !== 'n' && normalised !== 'normal';
}

// ── Notification deep links ───────────────────────────────────────────────────

export interface DocumentRoute {
  screen: string;
  label: string;
  icon: IconName;
}

const DOCUMENT_ROUTES: Record<string, DocumentRoute> = {
  labRequest: { screen: 'LabRequestDetailScreen', label: 'View lab request', icon: 'lab' },
  labResult: { screen: 'LabResultDetailScreen', label: 'View result', icon: 'clipboard' },
  prescription: { screen: 'PrescriptionDetailScreen', label: 'View prescription', icon: 'pill' },
  medicalCertificate: {
    screen: 'MedicalCertificateDetailScreen',
    label: 'View certificate',
    icon: 'document',
  },
};

/** Maps a document notification payload `{ kind }` to the screen that shows it; null for other kinds. */
export function documentRouteForKind(kind: unknown): DocumentRoute | null {
  return typeof kind === 'string' ? (DOCUMENT_ROUTES[kind] ?? null) : null;
}
