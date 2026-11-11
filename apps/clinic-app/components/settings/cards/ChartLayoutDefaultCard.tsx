import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import Icon, { type IconName } from '../../ui/Icon';
import { Card, CardContent, CardHeader } from '../../ui/Card';
import { SkeletonList } from '../../ui/Skeleton';
import { type ChartLayoutMode } from '../../chart/types';
import { theme } from '../../../constants/theme';
import { clinicService, type ClinicSettingsRecord } from '../../../services/clinicService';
import { useClinic } from '../../../context/ClinicContext';
import { notify } from '../../../utils/feedback';

export interface PlainChartViewOption {
  id: ChartLayoutMode;
  label: string;
  badge: string;
  icon: IconName;
  description: string;
}

export const PLAIN_CHART_VIEW_OPTIONS: readonly PlainChartViewOption[] = [
  {
    id: 'modal',
    label: 'Centered Window',
    badge: 'Standard',
    icon: 'layoutModal',
    description:
      'Opens the patient chart in a centered window with a one-click full-screen button. Great for everyday consultations.',
  },
  {
    id: 'split',
    label: 'Side-by-Side View',
    badge: 'Detailed Review',
    icon: 'layoutSplit',
    description:
      'Shows the patient summary on the left and visit notes on the right for easy side-by-side reading.',
  },
  {
    id: 'drawer',
    label: 'Side Panel',
    badge: 'Quick Check-In',
    icon: 'layoutDrawer',
    description:
      'Slides open on the right side of the screen while keeping the waiting list visible.',
  },
] as const;

export function buildChartLayoutSavePayload(
  layout: ChartLayoutMode
): Pick<ClinicSettingsRecord, 'preferredChartLayout'> {
  return { preferredChartLayout: layout };
}

export interface ChartLayoutDefaultCardProps {
  preferredChartLayout?: string;
  setPreferredChartLayout?: (v: ChartLayoutMode) => void;
  settings: ClinicSettingsRecord | null;
  savingSettings?: boolean;
  showSkeletons: boolean;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
}

/**
 * Clinic-default medical chart workstation layout selector.
 * Uses a compact 3-up visual radio tile grid and an independent Save handler
 * completely decoupled from clinic-name or fee validation.
 */
export default function ChartLayoutDefaultCard({
  preferredChartLayout,
  setPreferredChartLayout,
  settings,
  savingSettings = false,
  showSkeletons,
  onSettingsUpdated,
}: ChartLayoutDefaultCardProps) {
  const { refresh: refreshClinic } = useClinic();
  const savedLayout: ChartLayoutMode =
    (settings?.preferredChartLayout as ChartLayoutMode) || 'modal';
  const [internalLayout, setInternalLayout] = useState<ChartLayoutMode>(
    (preferredChartLayout as ChartLayoutMode) || savedLayout
  );
  const [savingLayout, setSavingLayout] = useState(false);

  useEffect(() => {
    if (preferredChartLayout) {
      setInternalLayout(preferredChartLayout as ChartLayoutMode);
    } else if (settings?.preferredChartLayout) {
      setInternalLayout(settings.preferredChartLayout as ChartLayoutMode);
    }
  }, [preferredChartLayout, settings?.preferredChartLayout]);

  const effectiveLayout: ChartLayoutMode =
    (preferredChartLayout as ChartLayoutMode) || internalLayout || savedLayout;
  const isDirty = settings
    ? effectiveLayout !== savedLayout
    : !showSkeletons && effectiveLayout !== 'modal';
  const isSaving = savingLayout || savingSettings;

  const handleSelectLayout = (layout: ChartLayoutMode) => {
    setInternalLayout(layout);
    setPreferredChartLayout?.(layout);
  };

  const handleSaveLayoutIndependent = async () => {
    setSavingLayout(true);
    const [updated, err] = await clinicService.updateSettings(
      buildChartLayoutSavePayload(effectiveLayout)
    );
    setSavingLayout(false);

    if (err || !updated) {
      notify.error(err?.message || 'Failed to save preferred medical chart layout.');
      return;
    }

    onSettingsUpdated?.(updated);
    notify.success('Preferred medical chart layout saved.');
    await refreshClinic();
  };

  return (
    <Card style={styles.card} testID="chart-layout-default-card">
      <CardHeader
        title="Default Patient Chart View"
        subtitle="Choose how patient medical charts open by default across your clinic"
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <View style={styles.container}>
            <View style={styles.tilesRow}>
              {PLAIN_CHART_VIEW_OPTIONS.map((opt) => {
                const isSelected = effectiveLayout === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectLayout(opt.id)}
                    style={({ pressed }) => [
                      styles.tile,
                      isSelected && styles.tileSelected,
                      pressed && styles.tilePressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${opt.label} (${opt.badge})`}
                  >
                    <View style={styles.tileTopRow}>
                      <View style={[styles.tileIconWrap, isSelected && styles.tileIconWrapSelected]}>
                        <Icon
                          name={opt.icon}
                          size={theme.sizes.iconMd}
                          color={isSelected ? theme.colors.onPrimary : theme.colors.primaryDark}
                        />
                      </View>
                      <View style={[styles.radioOuter, isSelected && styles.radioOuterSelected]}>
                        {isSelected ? <View style={styles.radioInner} /> : null}
                      </View>
                    </View>

                    <View style={styles.tileTitleBlock}>
                      <ThemedText
                        variant="bodyBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {opt.label}
                      </ThemedText>
                      <Badge
                        label={opt.badge}
                        variant={isSelected ? 'info' : 'neutral'}
                        size="sm"
                      />
                    </View>

                    <ThemedText
                      variant="caption"
                      color={theme.colors.textSecondary}
                      style={styles.tileDescription}
                    >
                      {opt.description}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            {isDirty || isSaving ? (
              <View style={styles.actionsEnd}>
                <Button
                  title="Save chart view"
                  icon="save"
                  size="sm"
                  onPress={handleSaveLayoutIndependent}
                  loading={isSaving}
                  testID="btn-save-chart-layout"
                />
              </View>
            ) : null}
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  container: {
    width: '100%',
    minWidth: 0,
    gap: theme.spacing.md,
  },
  tilesRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  tile: {
    flex: 1,
    flexBasis: 220,
    minWidth: 0,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tileSelected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  tilePressed: {
    opacity: 0.85,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileIconWrapSelected: {
    backgroundColor: theme.colors.primaryDark,
    borderColor: theme.colors.primaryDark,
  },
  tileTitleBlock: {
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
  },
  tileDescription: {
    lineHeight: 18,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: theme.colors.primaryDark,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryDark,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.xs,
  },
});
