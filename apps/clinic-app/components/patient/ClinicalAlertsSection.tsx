import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import Icon, { IconName } from '../ui/Icon';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { TextInput } from '../ui/Text';
import { theme } from '../../constants/theme';

export interface AlertPreset {
  id: string;
  label: string;
  tag: string;
  icon?: IconName;
  variant: 'emergency' | 'urgent' | 'warning' | 'info';
}

export const CLINICAL_ALERT_PRESETS: AlertPreset[] = [
  {
    id: 'fall-risk',
    label: 'High Fall Risk',
    tag: 'High Fall Risk',
    icon: 'alert',
    variant: 'emergency',
  },
  {
    id: 'hearing',
    label: 'Hearing Impaired',
    tag: 'Hearing Impaired',
    icon: 'info',
    variant: 'warning',
  },
  {
    id: 'vision',
    label: 'Visually Impaired',
    tag: 'Visually Impaired',
    icon: 'eye',
    variant: 'warning',
  },
  {
    id: 'mobility',
    label: 'Wheelchair / Mobility Assist',
    tag: 'Wheelchair / Mobility Assist',
    icon: 'accessibility',
    variant: 'info',
  },
  {
    id: 'seizure',
    label: 'Seizure Precautions',
    tag: 'Seizure Precautions',
    icon: 'zap',
    variant: 'emergency',
  },
  {
    id: 'left-arm',
    label: 'Left Arm Alert (No BP/IV)',
    tag: 'Left Arm Alert (No BP/IV)',
    icon: 'alertCircle',
    variant: 'urgent',
  },
  {
    id: 'right-arm',
    label: 'Right Arm Alert (No BP/IV)',
    tag: 'Right Arm Alert (No BP/IV)',
    icon: 'alertCircle',
    variant: 'urgent',
  },
  {
    id: 'combative',
    label: 'Combative / Aggressive Risk',
    tag: 'Combative Risk',
    icon: 'alert',
    variant: 'emergency',
  },
];

export interface ClinicalAlertsSectionProps {
  alerts: string;
  onChangeAlerts: (alerts: string) => void;
  disabled?: boolean;
}

/**
 * Checks if a preset tag exists inside the current alerts string.
 */
export function isPresetActive(alerts: string, tag: string): boolean {
  if (!alerts || !alerts.trim()) return false;
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(^|,\\s*)${escaped}(\\s*,|$)`, 'i');
  return regex.test(alerts);
}

/**
 * Toggles a preset tag in or out of the alerts string cleanly without orphaned commas.
 */
export function toggleAlertPreset(currentAlerts: string, tag: string): string {
  const current = currentAlerts.trim();
  if (isPresetActive(current, tag)) {
    // Remove the tag
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|,\\s*)${escaped}(\\s*,|$)`, 'i');
    const replaced = current.replace(regex, (match, prefix, suffix) => {
      if (prefix && suffix) return ', ';
      return '';
    });
    return replaced.replace(/^[,\s]+|[,\s]+$/g, '').trim();
  } else {
    // Add the tag
    if (!current) return tag;
    return `${current}, ${tag}`;
  }
}

export default function ClinicalAlertsSection({
  alerts,
  onChangeAlerts,
  disabled = false,
}: ClinicalAlertsSectionProps) {
  const handleToggle = (preset: AlertPreset) => {
    if (disabled) return;
    const nextAlerts = toggleAlertPreset(alerts, preset.tag);
    onChangeAlerts(nextAlerts);
  };

  const handleClear = () => {
    if (disabled) return;
    onChangeAlerts('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Icon name="shield" size={16} color={theme.colors.emergencyText} />
          <ThemedText variant="captionBold" color={theme.colors.text}>
            Clinical & Safety Alerts
          </ThemedText>
        </View>
        {alerts.trim() ? (
          <Button
            title="Clear Alerts"
            variant="outline"
            size="sm"
            onPress={handleClear}
            disabled={disabled}
          />
        ) : null}
      </View>

      <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.subtitle}>
        Select 1-tap safety presets to flag high-risk clinical precautions on workstation summary & charts.
      </ThemedText>

      {/* Preset Chips */}
      <View style={styles.presetsGrid}>
        {CLINICAL_ALERT_PRESETS.map((preset) => {
          const active = isPresetActive(alerts, preset.tag);
          return (
            <Pressable
              key={preset.id}
              style={[
                styles.presetChip,
                active && styles.presetChipActive,
                active && preset.variant === 'emergency' && styles.presetEmergencyActive,
              ]}
              onPress={() => handleToggle(preset)}
              disabled={disabled}
            >
              {preset.icon ? (
                <Icon
                  name={preset.icon}
                  size={14}
                  color={
                    active
                      ? preset.variant === 'emergency'
                        ? theme.colors.emergencyText
                        : theme.colors.primary
                      : theme.colors.textMuted
                  }
                />
              ) : null}
              <ThemedText
                variant={active ? 'captionBold' : 'caption'}
                color={
                  active
                    ? preset.variant === 'emergency'
                      ? theme.colors.emergencyText
                      : theme.colors.primary
                    : theme.colors.textSecondary
                }
              >
                {preset.label}
              </ThemedText>
              {active ? (
                <Icon
                  name="check"
                  size={12}
                  color={
                    preset.variant === 'emergency'
                      ? theme.colors.emergencyText
                      : theme.colors.primary
                  }
                />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* Custom Alert Notes Input */}
      <View style={styles.inputBox}>
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
          Custom Safety Notes / Combined Alerts
        </ThemedText>
        <TextInput
          style={styles.textInput}
          placeholder="e.g. High Fall Risk, Morse score: 65, bed rails up, strict aspiration precautions"
          placeholderTextColor={theme.colors.textMuted}
          value={alerts}
          onChangeText={onChangeAlerts}
          editable={!disabled}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  subtitle: {
    marginBottom: 4,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.full || 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  presetChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  presetEmergencyActive: {
    borderColor: theme.colors.emergencyBorder,
    backgroundColor: theme.colors.emergencyBg,
  },
  inputBox: {
    marginTop: 4,
  },
  inputLabel: {
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    color: theme.colors.text,
  },
});
