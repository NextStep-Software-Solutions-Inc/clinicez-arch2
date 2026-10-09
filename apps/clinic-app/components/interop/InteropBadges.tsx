import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Badge, ThemedText } from '@ui';
import type { BadgeVariant } from '@ui';
import { theme } from '@constants/theme';
import type { ClinicLabOrderRecord, RxPharmacyStatus } from '../../services/clinicService';
import {
  describeLabOrderStage,
  getResultProvenance,
  type StatusTone,
} from '../../services/labResultReview';
import { describeRxStage } from '../../services/rxStatus';

const TONE_VARIANTS: Record<StatusTone, BadgeVariant> = {
  neutral: 'neutral',
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'emergency',
  accent: 'purple',
};

export function toneToVariant(tone: StatusTone): BadgeVariant {
  return TONE_VARIANTS[tone];
}

export interface ResultProvenanceBadgesProps {
  source: string;
  verificationState: string;
}

/** Source + verification badges for a lab result (e.g. "External lab" + "Unverified"). */
export function ResultProvenanceBadges({ source, verificationState }: ResultProvenanceBadgesProps) {
  const provenance = getResultProvenance(source, verificationState);
  const variant = toneToVariant(provenance.tone);
  return (
    <View style={styles.row}>
      <Badge label={provenance.sourceLabel} variant="outline" size="sm" />
      <Badge
        label={provenance.verificationLabel}
        variant={variant}
        size="sm"
        icon={provenance.tone === 'success' ? 'checkCircle' : provenance.tone === 'danger' ? 'close' : 'alert'}
      />
    </View>
  );
}

export interface LabOrderStageChipProps {
  order: Pick<
    ClinicLabOrderRecord,
    'stage' | 'stageReason' | 'quotedAmount' | 'quotedCurrency' | 'paymentRequired' | 'laboratoryName'
  >;
}

/**
 * Lifecycle chip for a lab order (`stage`), with the quote while payment is pending and the laboratory name.
 * Renders nothing for legacy orders that have no stage, so callers keep showing the legacy `status`.
 */
export function LabOrderStageChip({ order }: LabOrderStageChipProps) {
  const display = describeLabOrderStage(order);
  if (!display) return null;

  return (
    <View style={styles.row}>
      <Badge label={display.chip.label} variant={toneToVariant(display.chip.tone)} size="sm" />
      {display.quote ? (
        <Badge label={`Quote ${display.quote}`} variant="warning" size="sm" icon="cash" />
      ) : null}
      {display.laboratoryName ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Lab: {display.laboratoryName}
        </ThemedText>
      ) : null}
      {display.reason ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          {display.reason}
        </ThemedText>
      ) : null}
    </View>
  );
}

export interface RxStageChipProps {
  status: RxPharmacyStatus | null | undefined;
}

/**
 * Pharmacy stage chip for a prescription, with the pharmacy's quote and rejection reason.
 * Renders nothing until a pharmacy has reported a stage.
 */
export function RxStageChip({ status }: RxStageChipProps) {
  const display = describeRxStage(status);
  if (!display) return null;

  return (
    <View style={styles.row}>
      <Badge label={display.chip.label} variant={toneToVariant(display.chip.tone)} size="sm" />
      {display.quote ? <Badge label={`Quote ${display.quote}`} variant="warning" size="sm" icon="cash" /> : null}
      {display.pharmacyName ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Pharmacy: {display.pharmacyName}
        </ThemedText>
      ) : null}
      {display.reason ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          {display.reason}
        </ThemedText>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
