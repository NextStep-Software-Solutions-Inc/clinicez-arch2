import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Badge, { type BadgeVariant } from '../ui/Badge';
import Button from '../ui/Button';
import type { ClinicAuditEntryDto } from '../../services/clinicService';

export interface AuditTableRowProps {
  entry: ClinicAuditEntryDto;
  onInspect: (entry: ClinicAuditEntryDto) => void;
  isEven?: boolean;
}

export const AuditTableRow = React.memo(function AuditTableRow({ entry, onInspect, isEven = false }: AuditTableRowProps) {
  const formattedTimestamp = formatTimestamp(entry.timestamp);

  const severityVariant: BadgeVariant =
    entry.severity === 'Emergency'
      ? 'emergency'
      : entry.severity === 'Urgent'
        ? 'urgent'
        : 'routine';

  const severityLabel = entry.severity === 'Emergency' ? 'STAT' : entry.severity;

  const outcomeVariant: BadgeVariant =
    entry.outcome === 'Success'
      ? 'success'
      : entry.outcome === 'Failure'
        ? 'emergency'
        : 'warning';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Inspect audit entry ${entry.action} by ${entry.actorName}`}
      onPress={() => onInspect(entry)}
      style={[
        styles.row,
        isEven ? styles.rowEven : styles.rowOdd,
      ]}
    >
      {/* 1. Timestamp */}
      <View style={[styles.cell, styles.colTimestamp]}>
        <ThemedText style={styles.timestampText}>{formattedTimestamp}</ThemedText>
      </View>

      {/* 2. Category */}
      <View style={[styles.cell, styles.colCategory]}>
        <ThemedText style={styles.categoryText} numberOfLines={1}>
          {entry.category}
        </ThemedText>
      </View>

      {/* 3. Severity Badge (Dual visual + textual encoding) */}
      <View style={[styles.cell, styles.colSeverity, styles.cellCenter]}>
        <Badge variant={severityVariant} label={severityLabel} size="sm" />
      </View>

      {/* 4. Action */}
      <View style={[styles.cell, styles.colAction]}>
        <ThemedText style={styles.actionText} numberOfLines={1}>
          {entry.action}
        </ThemedText>
      </View>

      {/* 5. Actor */}
      <View style={[styles.cell, styles.colActor]}>
        <ThemedText style={styles.actorNameText} numberOfLines={1}>
          {entry.actorName}
        </ThemedText>
        <ThemedText style={styles.actorRoleText} numberOfLines={1}>
          {entry.actorRole}
        </ThemedText>
      </View>

      {/* 6. Target */}
      <View style={[styles.cell, styles.colTarget]}>
        <ThemedText style={styles.targetTypeText} numberOfLines={1}>
          {entry.targetEntityType}
        </ThemedText>
        {entry.targetEntityId ? (
          <ThemedText style={styles.targetIdText} numberOfLines={1}>
            {entry.targetEntityId}
          </ThemedText>
        ) : null}
      </View>

      {/* 7. Patient (Masked) */}
      <View style={[styles.cell, styles.colPatient]}>
        {entry.patientNameMasked ? (
          <>
            <ThemedText style={styles.patientNameText} numberOfLines={1}>
              {entry.patientNameMasked}
            </ThemedText>
            {entry.patientPinMasked ? (
              <ThemedText style={styles.patientPinText} numberOfLines={1}>
                {entry.patientPinMasked}
              </ThemedText>
            ) : null}
          </>
        ) : (
          <ThemedText style={styles.patientFallbackText}>—</ThemedText>
        )}
      </View>

      {/* 8. Outcome */}
      <View style={[styles.cell, styles.colOutcome, styles.cellCenter]}>
        <Badge variant={outcomeVariant} label={entry.outcome} size="sm" />
      </View>

      {/* 9. Inspect CTA */}
      <View style={[styles.cell, styles.colInspect, styles.cellCenter]}>
        <Button
          size="sm"
          variant="secondary"
          icon="eye"
          title="Inspect"
          onPress={() => onInspect(entry)}
        />
      </View>
    </Pressable>
  );
});

function formatTimestamp(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toISOString().replace('T', ' ').slice(0, 19);
  } catch {
    return isoString;
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: theme.sizes.controlLg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  rowEven: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowOdd: {
    backgroundColor: theme.colors.surface,
  },
  cell: {
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  cellCenter: {
    alignItems: 'center',
  },
  colTimestamp: {
    width: 160,
  },
  colCategory: {
    width: 110,
  },
  colSeverity: {
    width: 100,
  },
  colAction: {
    width: 200,
  },
  colActor: {
    width: 160,
  },
  colTarget: {
    width: 150,
  },
  colPatient: {
    width: 140,
  },
  colOutcome: {
    width: 90,
  },
  colInspect: {
    width: 90,
  },
  timestampText: {
    color: theme.colors.textSecondary,
    ...theme.typography.code,
  },
  categoryText: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  actionText: {
    color: theme.colors.text,
    ...theme.typography.code,
  },
  actorNameText: {
    color: theme.colors.text,
    ...theme.typography.bodyBold,
  },
  actorRoleText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  targetTypeText: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  targetIdText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  patientNameText: {
    color: theme.colors.text,
    ...theme.typography.smallBold,
  },
  patientPinText: {
    color: theme.colors.textMuted,
    ...theme.typography.caption,
  },
  patientFallbackText: {
    color: theme.colors.textLight,
    ...theme.typography.body,
  },
});
export default AuditTableRow;
