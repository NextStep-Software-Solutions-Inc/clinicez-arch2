import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import type { VisitWorkflowMode } from '../../services/clinicService';

export interface WorkflowModeSelectorProps {
  mode: VisitWorkflowMode;
  onChange: (nextMode: VisitWorkflowMode) => void;
  disabled?: boolean;
}

export default function WorkflowModeSelector({
  mode,
  onChange,
  disabled = false,
}: WorkflowModeSelectorProps) {
  const isYakap = mode === 'YakapAvailment';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderRadius: theme.radii.lg, padding: theme.spacing.md }]}>
      <View style={styles.headerRow}>
        <View style={styles.titleArea}>
          <ThemedText variant="bodyBold">Clinical Workflow Mode</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            {isYakap
              ? 'PhilHealth YAKAP 2.0 statutory consultation encounter with full audit trail'
              : 'Standard EHR clinical consultation (Cash, HMO, Corporate, Walk-in)'}
          </ThemedText>
        </View>
        <Badge
          variant={isYakap ? 'primary' : 'neutral'}
          label={isYakap ? 'YAKAP 2.0 Availment' : 'Regular Clinical'}
        />
      </View>

      <View style={[styles.toggleContainer, { backgroundColor: theme.colors.surfaceMuted, borderRadius: theme.radii.md, marginTop: theme.spacing.sm }]}>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => onChange('Regular')}
          style={[
            styles.toggleBtn,
            !isYakap && [
              styles.activeBtn,
              {
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.sm,
                borderColor: theme.colors.border,
              },
            ],
          ]}
        >
          <Icon
            name="file"
            size={16}
            color={!isYakap ? theme.colors.primary : theme.colors.textSecondary}
          />
          <ThemedText
            variant="smallBold"
            color={!isYakap ? theme.colors.primary : theme.colors.textSecondary}
          >
            Regular Consultation
          </ThemedText>
        </TouchableOpacity>

        <TouchableOpacity
          disabled={disabled}
          onPress={() => onChange('YakapAvailment')}
          style={[
            styles.toggleBtn,
            isYakap && [
              styles.activeBtn,
              {
                backgroundColor: theme.colors.primary,
                borderRadius: theme.radii.sm,
                borderColor: theme.colors.primaryDark,
              },
            ],
          ]}
        >
          <Icon
            name="shield"
            size={16}
            color={isYakap ? theme.colors.onPrimary : theme.colors.textSecondary}
          />
          <ThemedText
            variant="smallBold"
            color={isYakap ? theme.colors.onPrimary : theme.colors.textSecondary}
          >
            Yakap Availment
          </ThemedText>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleArea: {
    flex: 1,
    marginRight: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    padding: 3,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 6,
  },
  activeBtn: {
    borderWidth: 1,
    elevation: 1,
  },
});
