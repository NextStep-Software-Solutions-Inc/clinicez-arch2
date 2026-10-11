import type { RxPharmacyStatus, RxStage } from './clinicService';
import { formatQuote, humanizeEnum, type StageChip } from './labResultReview';

/**
 * Pure presentation logic for a prescription's pharmacy stage (`rx.status.changed`).
 * Kept free of React / React Native imports so it can be unit tested with `bun test`.
 */

const RX_STAGE_CHIPS: Record<RxStage, StageChip> = {
  Issued: { label: 'Issued', tone: 'neutral' },
  Accepted: { label: 'Accepted by pharmacy', tone: 'info' },
  PartiallyAccepted: { label: 'Partly accepted', tone: 'warning' },
  Rejected: { label: 'Rejected by pharmacy', tone: 'danger' },
  Dispensed: { label: 'Dispensed', tone: 'success' },
  ExternalDispensed: { label: 'Dispensed externally', tone: 'success' },
};

/** Chip for a stage; unknown strings from a newer server degrade to a neutral humanized label. */
export function getRxStageChip(stage: string): StageChip {
  return RX_STAGE_CHIPS[stage as RxStage] ?? { label: humanizeEnum(stage), tone: 'neutral' };
}

export interface RxStageDisplay {
  chip: StageChip;
  /** Pharmacy that holds the prescription, when it has reported one. */
  pharmacyName: string | null;
  /** The pharmacy's quote, formatted (PHP). */
  quote: string | null;
  /** Why the pharmacy rejected or partly accepted the prescription. */
  reason: string | null;
}

/** Everything the UI shows for a prescription's pharmacy stage; null while no pharmacy has reported anything. */
export function describeRxStage(status: RxPharmacyStatus | null | undefined): RxStageDisplay | null {
  if (!status) return null;
  if (status.stage === 'Issued' && !status.pharmacyName) return null;
  return {
    chip: getRxStageChip(status.stage),
    pharmacyName: status.pharmacyName?.trim() || null,
    quote: formatQuote(status.quotedAmount, 'PHP'),
    reason: status.reason?.trim() || null,
  };
}
