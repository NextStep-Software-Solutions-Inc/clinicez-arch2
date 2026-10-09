import type { IconName } from '../../components/ui/iconNames';

/** Presentation mapping for synced documents. Pure so it can be unit tested. */

export type ChipTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export interface Chip {
  label: string;
  tone: ChipTone;
  icon?: IconName;
}

export function provenanceBadge(source: string): Chip {
  switch (source) {
    case 'clinicEzLab':
      return { label: 'ClinicEZ lab', tone: 'success', icon: 'lab' };
    case 'externalLab':
      return { label: 'External lab', tone: 'info', icon: 'building' };
    case 'patientUploaded':
      return { label: 'Uploaded by me', tone: 'neutral', icon: 'upload' };
    default:
      return { label: 'Unknown source', tone: 'neutral' };
  }
}

export interface VerificationBadge extends Chip {
  /** Explanation shown under the badge (e.g. the reviewing doctor's remarks). */
  detail: string | null;
}

export function verificationBadge(verification: string, remarks?: string | null): VerificationBadge {
  switch (verification) {
    case 'verified':
      return { label: 'Verified', tone: 'success', icon: 'checkCircle', detail: null };
    case 'rejected':
      return {
        label: 'Rejected',
        tone: 'danger',
        icon: 'alert',
        detail: remarks?.trim() ? remarks.trim() : 'The reviewing doctor did not accept this result.',
      };
    case 'unverified':
      return {
        label: 'Pending doctor review',
        tone: 'warning',
        icon: 'clock',
        detail: 'Your ordering doctor has not reviewed this result yet.',
      };
    default:
      return { label: 'Unknown status', tone: 'neutral', detail: null };
  }
}

export function paymentChip(status: string): Chip {
  switch (status) {
    case 'paid':
      return { label: 'Paid', tone: 'success', icon: 'checkCircle' };
    case 'pending':
      return { label: 'Payment pending', tone: 'warning', icon: 'clock' };
    case 'none':
      return { label: 'No payment due', tone: 'neutral' };
    default:
      return { label: status, tone: 'neutral' };
  }
}

export function formatAmount(amount: number | null, currency: string | null): string | null {
  if (amount === null) return null;
  return `${currency ?? 'PHP'} ${amount.toFixed(2)}`;
}

// ── Lab request stages ────────────────────────────────────────────────────────

export const LAB_STAGE_LABELS: Record<string, string> = {
  issued: 'Issued',
  routed: 'Sent to lab',
  claimed: 'Claimed at lab',
  awaitingPayment: 'Awaiting payment',
  paid: 'Paid',
  specimenCollected: 'Specimen collected',
  inProcess: 'Being processed',
  resultFinalized: 'Result ready',
  externalSubmitted: 'Result uploaded',
  reviewed: 'Reviewed by doctor',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
};

const LAB_FLOW: readonly string[] = [
  'issued',
  'routed',
  'claimed',
  'awaitingPayment',
  'paid',
  'specimenCollected',
  'inProcess',
  'resultFinalized',
  'reviewed',
];

const PAYMENT_STAGES: readonly string[] = ['awaitingPayment', 'paid'];
const EXTERNAL_FLOW: readonly string[] = ['issued', 'externalSubmitted', 'reviewed'];
const FAILED_STAGES: readonly string[] = ['rejected', 'cancelled'];

export type TimelineState = 'done' | 'current' | 'upcoming' | 'failed';

export interface TimelineStep {
  stage: string;
  label: string;
  state: TimelineState;
}

function stageLabel(stage: string): string {
  return LAB_STAGE_LABELS[stage] ?? stage;
}

/** Ordered progress steps for a lab request slip; payment steps only appear when payment is required. */
export function labTimeline(stage: string, paymentRequired: boolean): TimelineStep[] {
  if (FAILED_STAGES.includes(stage)) {
    return [
      { stage: 'issued', label: stageLabel('issued'), state: 'done' },
      { stage, label: stageLabel(stage), state: 'failed' },
    ];
  }

  const flow = stage === 'externalSubmitted'
    ? EXTERNAL_FLOW
    : LAB_FLOW.filter((step) => paymentRequired || !PAYMENT_STAGES.includes(step));

  const currentIndex = flow.indexOf(stage);
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;
  const isLast = activeIndex === flow.length - 1;

  return flow.map((step, index) => ({
    stage: step,
    label: stageLabel(step),
    state:
      index < activeIndex || (isLast && index === activeIndex)
        ? 'done'
        : index === activeIndex
          ? 'current'
          : 'upcoming',
  }));
}

export function labStageChip(stage: string): Chip {
  if (stage === 'reviewed' || stage === 'resultFinalized') {
    return { label: stageLabel(stage), tone: 'success', icon: 'checkCircle' };
  }
  if (FAILED_STAGES.includes(stage)) return { label: stageLabel(stage), tone: 'danger', icon: 'alert' };
  if (stage === 'issued') return { label: stageLabel(stage), tone: 'info', icon: 'clipboard' };
  return { label: stageLabel(stage), tone: 'primary', icon: 'clock' };
}

export function canUploadLabResult(stage: string): boolean {
  return stage !== 'cancelled' && stage !== 'reviewed';
}

export function showLabClaimQr(stage: string, claimToken: string | null): boolean {
  return claimToken !== null && !FAILED_STAGES.includes(stage) && stage !== 'reviewed';
}

// ── Prescription stages ───────────────────────────────────────────────────────

export const PRESCRIPTION_STAGE_LABELS: Record<string, string> = {
  issued: 'Issued',
  accepted: 'Accepted by pharmacy',
  partiallyAccepted: 'Partially accepted',
  rejected: 'Rejected',
  dispensed: 'Dispensed',
  externalDispensed: 'Dispensed elsewhere',
};

export function prescriptionStageChip(stage: string): Chip {
  const label = PRESCRIPTION_STAGE_LABELS[stage] ?? stage;
  switch (stage) {
    case 'dispensed':
    case 'externalDispensed':
      return { label, tone: 'success', icon: 'checkCircle' };
    case 'rejected':
      return { label, tone: 'danger', icon: 'alert' };
    case 'accepted':
    case 'partiallyAccepted':
      return { label, tone: 'primary', icon: 'clock' };
    default:
      return { label, tone: 'info', icon: 'pill' };
  }
}

export function canDispenseElsewhere(stage: string): boolean {
  return stage !== 'dispensed' && stage !== 'externalDispensed';
}

export function showPrescriptionClaimQr(stage: string, claimToken: string | null): boolean {
  return claimToken !== null && canDispenseElsewhere(stage) && stage !== 'rejected';
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
