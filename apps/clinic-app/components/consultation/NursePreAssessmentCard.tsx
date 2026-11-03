import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import type { TriageVitals } from '../../services/clinicService';

export interface NursePreAssessmentCardProps {
  vitals: TriageVitals | null | undefined;
  fallbackNurseName?: string | null;
}

function formatRecordedTime(iso?: string | null): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function NursePreAssessmentCard({
  vitals,
  fallbackNurseName,
}: NursePreAssessmentCardProps) {
  const observationChips = vitals?.preAssessmentRemarks
    ? vitals.preAssessmentRemarks
        .split('•')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const notesText = vitals?.preAssessmentNotes?.trim() || '';
  const acuity = vitals?.triageAcuityReason?.trim() || '';

  if (!vitals || (observationChips.length === 0 && !notesText && !acuity)) {
    return null;
  }

  const nurseSnapshotName =
    vitals.recordedByNurseName?.trim() ||
    fallbackNurseName?.trim() ||
    null;
  const recordedTime = formatRecordedTime(vitals.recordedAt);

  const acuityVariant =
    acuity === 'Emergency'
      ? 'emergency'
      : acuity === 'Urgent'
      ? 'urgent'
      : 'routine';

  const hasBodyContent = observationChips.length > 0 || Boolean(notesText);

  return (
    <View style={styles.card} testID="nurse-pre-assessment-card">
      <View style={styles.headerRow}>
        <View style={styles.identityGroup}>
          <View style={styles.iconTile}>
            <Icon name="stethoscope" size={theme.sizes.iconSm} color={theme.colors.primary} />
          </View>
          <View style={styles.titleStack}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              Nurse Pre-assessment
            </ThemedText>
            <View style={styles.metaRow}>
              {nurseSnapshotName ? (
                <>
                  <Icon
                    name="patientVerified"
                    size={theme.sizes.iconSm - 2}
                    color={theme.colors.primary}
                  />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Recorded by{' '}
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      {nurseSnapshotName}
                    </ThemedText>
                  </ThemedText>
                  {recordedTime ? (
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      • {recordedTime}
                    </ThemedText>
                  ) : null}
                </>
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {recordedTime ? `Recorded at ${recordedTime}` : 'Triage handoff summary'}
                </ThemedText>
              )}
            </View>
          </View>
        </View>

        {acuity ? (
          <View style={styles.badgeSlot}>
            <Badge
              label={`Triage: ${acuity}`}
              variant={acuityVariant}
              size="sm"
            />
          </View>
        ) : null}
      </View>

      {hasBodyContent ? (
        <View style={styles.bodySection}>
          {observationChips.length > 0 ? (
            <View style={styles.observationsRow}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Observations
              </ThemedText>
              <View style={styles.chipsWrap}>
                {observationChips.map((chip) => (
                  <View key={chip} style={styles.observationChip}>
                    <Icon
                      name="check"
                      size={theme.sizes.iconSm - 4}
                      color={theme.colors.primaryDark}
                    />
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      {chip}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {notesText ? (
            <View style={styles.notesBox}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Notes
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.text}>
                {notesText}
              </ThemedText>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
    ...theme.shadows.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  identityGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 200,
  },
  iconTile: {
    width: theme.sizes.controlMd - theme.spacing.xs,
    height: theme.sizes.controlMd - theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleStack: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  badgeSlot: {
    flexShrink: 0,
  },
  bodySection: {
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  observationsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    flex: 1,
  },
  observationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
  },
  notesBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.borderLight,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    gap: 2,
  },
});
