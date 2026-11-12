import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { theme } from '../../constants/theme';
import type { VisitWorkflowMode } from '../../services/clinicService';

export type DraftSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface WorkflowModeSelectorProps {
  mode: VisitWorkflowMode;
  onChange: (nextMode: VisitWorkflowMode) => void;
  disabled?: boolean;
  atcValue?: string;
  onChangeAtc?: (value: string) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  draftSaveStatus?: DraftSaveStatus;
  draftSavedAtLabel?: string | null;
  onRetryDraftSave?: () => void;
}

export default function WorkflowModeSelector({
  mode,
  onChange,
  disabled = false,
  atcValue,
  onChangeAtc,
  isExpanded = false,
  onToggleExpand,
  draftSaveStatus = 'idle',
  draftSavedAtLabel = null,
  onRetryDraftSave,
}: WorkflowModeSelectorProps) {
  const isYakap = mode === 'YakapAvailment';
  const showDraftIndicator = !disabled && draftSaveStatus !== 'idle';

  const renderDraftIndicator = () => {
    if (!showDraftIndicator) return null;

    if (draftSaveStatus === 'saving') {
      return (
        <View
          style={[styles.draftPill, styles.draftPillSaving]}
          testID="workflow-draft-status-indicator"
          accessibilityLiveRegion="polite"
        >
          <Icon
            name="clock"
            size={theme.sizes.iconSm}
            color={theme.colors.textSecondary}
          />
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Saving draft...
          </ThemedText>
        </View>
      );
    }

    if (draftSaveStatus === 'error') {
      const label = onRetryDraftSave
        ? 'Draft save failed · Tap to retry'
        : 'Draft save failed';
      if (onRetryDraftSave) {
        return (
          <TouchableOpacity
            onPress={onRetryDraftSave}
            style={[styles.draftPill, styles.draftPillError]}
            testID="workflow-draft-status-indicator"
            accessibilityRole="button"
            accessibilityLabel="Retry saving consultation draft"
          >
            <Icon
              name="alertCircle"
              size={theme.sizes.iconSm}
              color={theme.colors.emergency}
            />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>
              {label}
            </ThemedText>
          </TouchableOpacity>
        );
      }
      return (
        <View
          style={[styles.draftPill, styles.draftPillError]}
          testID="workflow-draft-status-indicator"
          accessibilityLiveRegion="polite"
        >
          <Icon
            name="alertCircle"
            size={theme.sizes.iconSm}
            color={theme.colors.emergency}
          />
          <ThemedText variant="caption" color={theme.colors.emergencyText}>
            {label}
          </ThemedText>
        </View>
      );
    }

    const savedText = draftSavedAtLabel
      ? `Saved as draft · ${draftSavedAtLabel}`
      : 'Saved as draft';
    return (
      <View
        style={[styles.draftPill, styles.draftPillSaved]}
        testID="workflow-draft-status-indicator"
        accessibilityLiveRegion="polite"
      >
        <Icon
          name="checkCircle"
          size={theme.sizes.iconSm}
          color={theme.colors.success}
        />
        <ThemedText variant="caption" color={theme.colors.successText}>
          {savedText}
        </ThemedText>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.titleArea}>
          <ThemedText variant="bodyBold">Clinical Workflow Mode</ThemedText>
          <ThemedText variant="small" color={theme.colors.textSecondary}>
            {isYakap
              ? 'PhilHealth YAKAP 2.0 statutory consultation encounter with full audit trail'
              : 'Standard EHR clinical consultation (Cash, HMO, Corporate, Walk-in)'}
          </ThemedText>
        </View>
        {showDraftIndicator || onToggleExpand ? (
          <View style={styles.headerActions}>
            {renderDraftIndicator()}
            {onToggleExpand ? (
              <Button
                iconOnly
                icon={isExpanded ? 'layoutSplit' : 'maximize'}
                variant="secondary"
                size="sm"
                onPress={onToggleExpand}
                accessibilityLabel={
                  isExpanded
                    ? 'Switch back to 2-column split pane'
                    : 'Expand consultation workspace'
                }
                testID={
                  isExpanded
                    ? 'toggle-split-pane-btn'
                    : 'expand-consultation-workspace-btn'
                }
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.toggleContainer}>
        <TouchableOpacity
          disabled={disabled}
          onPress={() => onChange('Regular')}
          style={[
            styles.toggleBtn,
            !isYakap && styles.activeRegularBtn,
          ]}
        >
          <Icon
            name="file"
            size={theme.sizes.iconSm}
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
            isYakap && styles.activeYakapBtn,
          ]}
        >
          <Icon
            name="shield"
            size={theme.sizes.iconSm}
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

      {isYakap && onChangeAtc ? (
        <View style={styles.atcSection}>
          <Input
            label="Authorization Transaction Code (ATC)"
            placeholder="e.g. WALKEDIN or ATC-2026-99214"
            value={atcValue ?? ''}
            onChangeText={onChangeAtc}
            editable={!disabled}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    width: '100%',
  },
  headerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  titleArea: {
    flex: 1,
    minWidth: 220,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    flexShrink: 0,
  },
  draftPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
  },
  draftPillSaved: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  draftPillSaving: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
  },
  draftPillError: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  activeRegularBtn: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    ...theme.shadows.sm,
  },
  activeYakapBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.sm,
    borderColor: theme.colors.primaryDark,
    borderWidth: theme.sizes.borderWidth,
    ...theme.shadows.brandSubtle,
  },
  atcSection: {
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
});
