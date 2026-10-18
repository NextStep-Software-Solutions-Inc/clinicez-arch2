import type {
  ClinicLabOrderRecord,
  LabOrderStage,
  LabResultReviewItem,
  LabResultReviewScope,
  LabResultVerificationState,
} from './clinicService';

/**
 * Pure presentation logic for interoperable lab results and lab-order stages.
 * Kept free of React / React Native imports so it can be unit tested with `bun test`.
 */

/** Semantic tone; the UI maps it to a Badge variant. */
export type StatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'accent';

export interface ResultProvenance {
  sourceLabel: string;
  verificationLabel: string;
  tone: StatusTone;
}

const SOURCE_LABELS: Record<string, string> = {
  ClinicEzLab: 'Clinic EZ Lab',
  ExternalLab: 'External lab',
  PatientUploaded: 'Patient uploaded',
};

/**
 * Provenance badge content for a result. The verification state drives the tone:
 * Rejected is always danger, Verified is success, anything else is an unverified warning.
 */
export function getResultProvenance(source: string, verificationState: string): ResultProvenance {
  const sourceLabel = SOURCE_LABELS[source] ?? humanizeEnum(source);
  if (verificationState === 'Rejected') {
    return { sourceLabel, verificationLabel: 'Rejected', tone: 'danger' };
  }
  if (verificationState === 'Verified') {
    return { sourceLabel, verificationLabel: 'Verified', tone: 'success' };
  }
  return { sourceLabel, verificationLabel: 'Unverified', tone: 'warning' };
}

/** "LabResults" -> "Lab results"; empty input -> "Unknown". */
export function humanizeEnum(value: string | null | undefined): string {
  const text = (value ?? '').trim();
  if (!text) return 'Unknown';
  const spaced = text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export const REVIEW_STATE_OPTIONS: ReadonlyArray<{ value: LabResultVerificationState; label: string }> = [
  { value: 'Unverified', label: 'Unverified' },
  { value: 'Verified', label: 'Verified' },
  { value: 'Rejected', label: 'Rejected' },
];

export const REVIEW_SCOPE_OPTIONS: ReadonlyArray<{ value: LabResultReviewScope; label: string }> = [
  { value: 'mine', label: 'My patients' },
  { value: 'all', label: 'All' },
];

/** Who or what the result came from, for the inbox row. */
export function resultOriginName(item: Pick<LabResultReviewItem, 'source' | 'externalLabName'>): string {
  const name = item.externalLabName?.trim();
  if (item.source === 'ClinicEzLab') return name || SOURCE_LABELS.ClinicEzLab;
  if (item.source === 'PatientUploaded') return name || 'Uploaded by patient';
  return name || 'Unnamed laboratory';
}

/** Only unverified results from outside the Clinic EZ lab can be accepted or rejected. */
export function canReviewResult(item: Pick<LabResultReviewItem, 'source' | 'verificationState'>): boolean {
  return item.verificationState === 'Unverified' && item.source !== 'ClinicEzLab';
}

export type ReviewDecisionCheck = { ok: true; remarks?: string } | { ok: false; error: string };

/** Remarks are optional on accept but required (non-blank) on reject. */
export function validateReviewDecision(accepted: boolean, remarks: string): ReviewDecisionCheck {
  const trimmed = remarks.trim();
  if (!accepted && trimmed.length === 0) {
    return { ok: false, error: 'Enter remarks explaining why this result is rejected.' };
  }
  return trimmed ? { ok: true, remarks: trimmed } : { ok: true };
}

/** Whether a reviewed item still belongs in the list for the active filter. */
export function belongsInReviewFilter(
  item: Pick<LabResultReviewItem, 'verificationState'>,
  filter: LabResultVerificationState,
): boolean {
  return item.verificationState === filter;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Lab order stage chips
// ---------------------------------------------------------------------------

export interface StageChip {
  label: string;
  tone: StatusTone;
}

const STAGE_CHIPS: Record<LabOrderStage, StageChip> = {
  Issued: { label: 'Issued', tone: 'neutral' },
  Routed: { label: 'Routed to lab', tone: 'neutral' },
  Claimed: { label: 'Claimed by lab', tone: 'neutral' },
  AwaitingPayment: { label: 'Awaiting payment', tone: 'warning' },
  Paid: { label: 'Paid', tone: 'info' },
  SpecimenCollected: { label: 'Specimen collected', tone: 'info' },
  InProcess: { label: 'In process', tone: 'info' },
  ResultFinalized: { label: 'Result finalized', tone: 'accent' },
  ExternalSubmitted: { label: 'External result submitted', tone: 'accent' },
  Reviewed: { label: 'Reviewed', tone: 'success' },
  Rejected: { label: 'Rejected', tone: 'danger' },
  Cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** Chip for a stage; unknown strings from a newer server degrade to a neutral humanized label. */
export function getStageChip(stage: string): StageChip {
  return STAGE_CHIPS[stage as LabOrderStage] ?? { label: humanizeEnum(stage), tone: 'neutral' };
}

/** "PHP 1,250.00"; null when there is no quote. Falls back to a plain number if the currency code is invalid. */
export function formatQuote(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return null;
  const code = (currency ?? '').trim().toUpperCase();
  const number = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return code ? `${code} ${number}` : number;
}

export interface LabOrderStageDisplay {
  chip: StageChip;
  /** e.g. "PHP 1,250.00" while the order is awaiting payment and a quote exists. */
  quote: string | null;
  laboratoryName: string | null;
  reason: string | null;
}

type StageSource = Pick<
  ClinicLabOrderRecord,
  'stage' | 'stageReason' | 'quotedAmount' | 'quotedCurrency' | 'paymentRequired' | 'laboratoryName'
>;

/** Everything the lab-order list needs to render a stage chip; null for legacy orders without a stage. */
export function describeLabOrderStage(order: StageSource): LabOrderStageDisplay | null {
  if (!order.stage) return null;
  const showQuote = order.stage === 'AwaitingPayment' && order.paymentRequired === true;
  return {
    chip: getStageChip(order.stage),
    quote: showQuote ? formatQuote(order.quotedAmount, order.quotedCurrency) : null,
    laboratoryName: order.laboratoryName?.trim() || null,
    reason: order.stageReason?.trim() || null,
  };
}
