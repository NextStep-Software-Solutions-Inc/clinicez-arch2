import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import {
  CLINIC_COMMON_TIMEZONES,
  CLINIC_DATE_FORMAT_OPTIONS,
  CLINIC_TIME_FORMAT_OPTIONS,
  ClinicTimeFormat,
  formatClinicDate,
  formatClinicTime,
  formatClinicDateTime,
  getClinicTodayStr,
} from '../../services/clinicService';
import { Alert, notify } from '../../utils/feedback';

interface RegionalDateTimeSettingsCardProps {
  showSkeletons?: boolean;
  onSaved?: () => void;
}

export default function RegionalDateTimeSettingsCard({
  showSkeletons = false,
  onSaved,
}: RegionalDateTimeSettingsCardProps) {
  const {
    timeZoneId,
    dateFormat,
    timeFormat,
    workspaceTimeZoneId,
    workspaceDateFormat,
    workspaceProfile,
    isRegionalOverridden,
    setRegionalSettings,
  } = useClinic();

  const [selectedTimeZone, setSelectedTimeZone] = useState<string>(timeZoneId || 'Asia/Manila');
  const [customTimeZoneInput, setCustomTimeZoneInput] = useState<string>(timeZoneId || 'Asia/Manila');
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>(dateFormat || 'MMM d, yyyy');
  const [selectedTimeFormat, setSelectedTimeFormat] = useState<ClinicTimeFormat>(timeFormat || '12h');
  const [saving, setSaving] = useState<boolean>(false);
  const [tzError, setTzError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTimeZone(timeZoneId || 'Asia/Manila');
    setCustomTimeZoneInput(timeZoneId || 'Asia/Manila');
    setSelectedDateFormat(dateFormat || 'MMM d, yyyy');
    setSelectedTimeFormat(timeFormat || '12h');
    setTzError(null);
  }, [timeZoneId, dateFormat, timeFormat]);

  const validateTimeZone = (tz: string): boolean => {
    const clean = tz.trim();
    if (!clean) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: clean }).format(new Date());
      return true;
    } catch {
      return false;
    }
  };

  const handleSelectTimeZoneChip = (tz: string) => {
    setSelectedTimeZone(tz);
    setCustomTimeZoneInput(tz);
    setTzError(null);
  };

  const handleCustomTimeZoneChange = (text: string) => {
    setCustomTimeZoneInput(text);
    const trimmed = text.trim();
    if (!trimmed) {
      setTzError('Time zone cannot be empty (e.g. Asia/Manila).');
      return;
    }
    if (validateTimeZone(trimmed)) {
      setSelectedTimeZone(trimmed);
      setTzError(null);
    } else {
      setTzError('Enter a valid IANA time zone identifier (e.g. Asia/Manila, Asia/Singapore, UTC).');
    }
  };

  const handleSaveRegional = async () => {
    const candidateTz = customTimeZoneInput.trim() || selectedTimeZone;
    if (!validateTimeZone(candidateTz)) {
      Alert.alert(
        'Invalid Time Zone',
        'Please select or enter a valid IANA time zone identifier (such as Asia/Manila, Asia/Singapore, America/New_York, or UTC).'
      );
      return;
    }

    setSaving(true);
    try {
      const success = await setRegionalSettings({
        timeZoneId: candidateTz,
        dateFormat: selectedDateFormat,
        timeFormat: selectedTimeFormat,
      });
      if (success) {
        notify.success('Clinic timezone, date, and time formats saved.');
        onSaved?.();
      } else {
        Alert.alert(
          'Saved locally',
          'Regional date & time settings updated on this workstation, but could not sync to server.'
        );
      }
    } catch (err: any) {
      Alert.alert('Save error', err?.message || 'Failed to save regional settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevertToWorkspace = async () => {
    setSaving(true);
    try {
      const success = await setRegionalSettings({
        timeZoneId: null,
        dateFormat: null,
        timeFormat: null,
      });
      if (success) {
        const revertedTz = workspaceTimeZoneId || 'Asia/Manila';
        const revertedDf = workspaceDateFormat || 'MMM d, yyyy';
        setSelectedTimeZone(revertedTz);
        setCustomTimeZoneInput(revertedTz);
        setSelectedDateFormat(revertedDf);
        setSelectedTimeFormat('12h');
        setTzError(null);
        notify.success('Reverted to portal tenant workspace regional settings.');
        onSaved?.();
      } else {
        Alert.alert('Notice', 'Unable to sync revert to server.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to revert regional settings.');
    } finally {
      setSaving(false);
    }
  };

  const sampleNow = useMemo(() => new Date(), [selectedTimeZone, selectedDateFormat, selectedTimeFormat]);
  const previewDate = formatClinicDate(sampleNow, {
    dateFormat: selectedDateFormat,
    timeZoneId: selectedTimeZone,
  });
  const previewTime = formatClinicTime(sampleNow, {
    timeFormat: selectedTimeFormat,
    timeZoneId: selectedTimeZone,
  });
  const previewDateTime = formatClinicDateTime(sampleNow, {
    dateFormat: selectedDateFormat,
    timeFormat: selectedTimeFormat,
    timeZoneId: selectedTimeZone,
  });
  const previewQueueDate = getClinicTodayStr(sampleNow, selectedTimeZone);

  const workspaceDisplayName = workspaceProfile?.displayName || 'Portal Workspace';
  const hasPendingChanges =
    selectedTimeZone !== timeZoneId ||
    selectedDateFormat !== dateFormat ||
    selectedTimeFormat !== timeFormat;

  return (
    <Card>
      <CardHeader
        title="Regional Timezone, Date & Time Format"
        subtitle="Configure clinic timezone, calendar date format, and 12h/24h time display across queues, EOD cutoffs, consultations, billing, and printed reports"
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <View style={styles.container}>
            {/* Inheritance Status Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerTextCol}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Workstation & Clinical Clock Configuration
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Auto-inherits regional defaults from {workspaceDisplayName} ({workspaceTimeZoneId} · {workspaceDateFormat}), or override for this clinic branch.
                </ThemedText>
              </View>
              <Badge
                label={isRegionalOverridden ? 'Custom Clinic Override' : 'Inherited from Workspace'}
                variant={isRegionalOverridden ? 'warning' : 'success'}
                size="sm"
              />
            </View>

            {/* Inheritance / Override Info Banner */}
            <View
              style={[
                styles.infoBanner,
                isRegionalOverridden ? styles.infoBannerOverride : styles.infoBannerInherited,
              ]}
            >
              <View style={styles.infoBannerIcon}>
                <Icon
                  name={isRegionalOverridden ? 'clock' : 'checkCircle'}
                  size={theme.sizes.iconSm}
                  color={isRegionalOverridden ? theme.colors.warningText : theme.colors.successText}
                />
              </View>
              <View style={styles.infoBannerContent}>
                <ThemedText
                  variant="captionBold"
                  color={isRegionalOverridden ? theme.colors.warningText : theme.colors.successText}
                >
                  {isRegionalOverridden
                    ? 'Clinic Regional Override Active'
                    : `Auto-Inheriting from ${workspaceDisplayName}`}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {isRegionalOverridden
                    ? `This facility overrides the workspace regional settings with ${timeZoneId} • ${dateFormat} • ${timeFormat === '24h' ? '24-Hour' : '12-Hour'}.`
                    : `Using workspace default timezone (${workspaceTimeZoneId}) and date format (${workspaceDateFormat}).`}
                </ThemedText>
              </View>
              {isRegionalOverridden ? (
                <Button
                  title="Inherit from Workspace"
                  variant="outline"
                  icon="undo"
                  size="sm"
                  onPress={handleRevertToWorkspace}
                  disabled={saving}
                />
              ) : null}
            </View>

            {/* Live Preview Banner */}
            <View style={styles.previewCard}>
              <View style={styles.previewCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  LIVE CLINIC TIMESTAMP PREVIEW
                </ThemedText>
                <ThemedText variant="subtitle" color={theme.colors.primaryDark}>
                  {previewDateTime}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Timezone: {selectedTimeZone} • Active Queue Date: {previewQueueDate}
                </ThemedText>
              </View>
              <View style={styles.previewBadgesRow}>
                <Badge label={`Date: ${previewDate}`} variant="info" size="sm" />
                <Badge label={`Time: ${previewTime}`} variant="neutral" size="sm" />
              </View>
            </View>

            {/* 1. Timezone Selection */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                1. Clinic Time Zone (IANA)
              </ThemedText>
              <View style={styles.chipGrid}>
                {CLINIC_COMMON_TIMEZONES.map((tz) => {
                  const isSelected = selectedTimeZone === tz;
                  return (
                    <Pressable
                      key={tz}
                      onPress={() => handleSelectTimeZoneChip(tz)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select timezone ${tz}`}
                      accessibilityState={{ selected: isSelected }}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                    >
                      <ThemedText
                        variant={isSelected ? 'captionBold' : 'caption'}
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {tz.replace(/_/g, ' ')}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
              <Input
                label="Custom / Full IANA Time Zone Identifier"
                value={customTimeZoneInput}
                onChangeText={handleCustomTimeZoneChange}
                placeholder="e.g. Asia/Manila, Asia/Singapore, America/New_York, UTC"
                error={tzError ?? undefined}
                helperText="Used for daily queue partitioning, midnight rollover, and automated EOD cutoff evaluation."
              />
            </View>

            {/* 2. Date Format Selection */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                2. Date Display Format
              </ThemedText>
              <View style={styles.optionsGrid}>
                {CLINIC_DATE_FORMAT_OPTIONS.map((fmt) => {
                  const isSelected = selectedDateFormat === fmt.value;
                  const liveExample = formatClinicDate(sampleNow, {
                    dateFormat: fmt.value,
                    timeZoneId: selectedTimeZone,
                  });
                  return (
                    <Pressable
                      key={fmt.value}
                      onPress={() => setSelectedDateFormat(fmt.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`Date format ${fmt.value}`}
                      accessibilityState={{ selected: isSelected }}
                      style={[styles.formatCard, isSelected && styles.formatCardSelected]}
                    >
                      <View style={styles.formatCardTop}>
                        <ThemedText
                          variant="bodyBold"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                        >
                          {liveExample}
                        </ThemedText>
                        <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                          {isSelected ? <View style={styles.radioInner} /> : null}
                        </View>
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        {fmt.label} ({fmt.value})
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* 3. Time Format Selection */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
                3. Time Display Format (12-Hour vs 24-Hour)
              </ThemedText>
              <View style={styles.timeFormatRow}>
                {CLINIC_TIME_FORMAT_OPTIONS.map((tf) => {
                  const isSelected = selectedTimeFormat === tf.value;
                  const liveExample = formatClinicTime(sampleNow, {
                    timeFormat: tf.value,
                    timeZoneId: selectedTimeZone,
                  });
                  return (
                    <Pressable
                      key={tf.value}
                      onPress={() => setSelectedTimeFormat(tf.value)}
                      accessibilityRole="radio"
                      accessibilityLabel={`Time format ${tf.label}`}
                      accessibilityState={{ selected: isSelected }}
                      style={[styles.timeFormatCard, isSelected && styles.formatCardSelected]}
                    >
                      <View style={styles.formatCardTop}>
                        <View style={styles.timeTitleGroup}>
                          <ThemedText
                            variant="bodyBold"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                          >
                            {tf.label}
                          </ThemedText>
                          <Badge label={liveExample} variant={isSelected ? 'info' : 'neutral'} size="sm" />
                        </View>
                        <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                          {isSelected ? <View style={styles.radioInner} /> : null}
                        </View>
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {tf.description}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Save Actions */}
            <View style={styles.actionsEnd}>
              <Button
                title="Save Regional Settings"
                icon="check"
                onPress={handleSaveRegional}
                loading={saving}
                disabled={saving || Boolean(tzError)}
              />
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 220,
    gap: 2,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  infoBannerInherited: {
    backgroundColor: theme.colors.successSoft,
    borderColor: theme.colors.success,
  },
  infoBannerOverride: {
    backgroundColor: theme.colors.warningSoft,
    borderColor: theme.colors.warning,
  },
  infoBannerIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  infoBannerContent: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  previewCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  previewCol: {
    gap: 2,
  },
  previewBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  sectionBlock: {
    gap: theme.spacing.sm,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  chip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  formatCard: {
    flexGrow: 1,
    flexBasis: 170,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  formatCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  formatCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  timeFormatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  timeFormatCard: {
    flex: 1,
    minWidth: 240,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  timeTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.colors.primary,
  },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.xs,
  },
});
