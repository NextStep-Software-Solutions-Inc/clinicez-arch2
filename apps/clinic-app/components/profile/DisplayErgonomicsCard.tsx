import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Icon, { type IconName } from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { ToggleSwitch } from '../settings/AddEditFieldModal';
import {
  BRAND_COLOR_PRESETS,
  HEX_COLOR,
  isUsableAccent,
  readableForeground,
  relativeLuminance,
} from '../../constants/color';
import { theme } from '../../constants/theme';
import { TEXT_SCALE_OPTIONS, type TextScalePreset } from '../../context/TextScaleContext';
import {
  THEME_MODE_OPTIONS,
  useThemeMode,
  type ThemeMode,
} from '../../context/ThemeModeContext';
import { UI_DENSITY_OPTIONS, type UiDensity } from '../../context/UiDensityContext';
import type { PersonalChartLayoutMode, PreferencesSyncState } from './types';

export interface DisplayErgonomicsCardProps {
  density: UiDensity;
  scale: number;
  textPreset: TextScalePreset;
  personalChartLayout: PersonalChartLayoutMode;
  themeMode?: ThemeMode;
  isDark?: boolean;
  userBrandColorHex?: string | null;
  clinicPrimaryColorHex?: string | null;
  syncStatusBadge: React.ReactNode;
  onSelectThemeMode?: (mode: ThemeMode) => void;
  onSelectUserBrandColor?: (colorHex: string | null, label?: string) => void;
  onSelectDensity: (density: UiDensity, label: string) => void;
  onSelectTextPreset: (preset: TextScalePreset, label: string) => void;
  onStepScaleDown: () => void;
  onStepScaleUp: () => void;
  onSelectChartLayout: (layout: PersonalChartLayoutMode) => void;
}

export type PersonalAccentValidationResult =
  | { valid: true; hex: string }
  | { valid: false; error: string };

export function validatePersonalAccentHex(raw: string): PersonalAccentValidationResult {
  const trimmed = (raw || '').trim().toUpperCase();
  if (!trimmed) {
    return { valid: false, error: 'Enter a 6-character color code.' };
  }
  const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR.test(normalized)) {
    return { valid: false, error: 'Enter a valid 6-character color code (for example RRGGBB).' };
  }
  if (!isUsableAccent(normalized) || relativeLuminance(normalized) > 0.72) {
    return {
      valid: false,
      error:
        'This color does not have enough contrast for readable buttons and highlights. Choose a richer shade.',
    };
  }
  return { valid: true, hex: normalized };
}

const CHART_LAYOUT_TILES: readonly {
  id: PersonalChartLayoutMode;
  name: string;
  desc: string;
  icon: IconName;
}[] = [
  {
    id: 'default',
    name: 'Use Clinic Default',
    desc: "Follow your clinic's standard chart view",
    icon: 'clinic',
  },
  {
    id: 'split',
    name: 'Side-by-Side',
    desc: 'Keep the patient list open next to the chart on wide screens',
    icon: 'layoutSplit',
  },
  {
    id: 'modal',
    name: 'Pop-up Window',
    desc: 'Open the patient chart in a centered window',
    icon: 'layoutModal',
  },
  {
    id: 'drawer',
    name: 'Side Panel',
    desc: 'Slide the patient chart in from the right side',
    icon: 'layoutDrawer',
  },
];

export const DENSITY_ICON_MAP: Record<
  UiDensity,
  { icon: IconName; pct: string; shortLabel: string; plainDesc: string }
> = {
  standard: {
    icon: 'maximize',
    pct: '100%',
    shortLabel: 'Standard (100%)',
    plainDesc: 'Comfortable spacing for everyday clinic use',
  },
  compact: {
    icon: 'grid',
    pct: '85%',
    shortLabel: 'Compact (85%)',
    plainDesc: 'Slightly tighter spacing to fit more rows on screen',
  },
  ultraCompact: {
    icon: 'minimize',
    pct: '70%',
    shortLabel: 'Ultra Compact (70%)',
    plainDesc: 'Tightest spacing for busy patient lists on wide monitors',
  },
};

export function SyncStatusBadge({
  syncState,
  onRetrySync,
}: {
  syncState: PreferencesSyncState;
  onRetrySync: () => void;
}) {
  if (syncState === 'syncing') {
    return <Badge label="Saving..." variant="info" size="sm" icon="refresh" />;
  }
  if (syncState === 'error') {
    return (
      <View style={styles.syncRetryInline}>
        <Badge label="Save Failed" variant="emergency" size="sm" icon="alertCircle" />
        <Button
          title="Try Again"
          variant="outline"
          size="sm"
          icon="refresh"
          onPress={onRetrySync}
        />
      </View>
    );
  }
  if (syncState === 'offline') {
    return <Badge label="Saved on This Device" variant="warning" size="sm" icon="cloud" />;
  }
  return <Badge label="Saved" variant="success" size="sm" icon="check" />;
}

export default function DisplayErgonomicsCard({
  density,
  scale,
  textPreset,
  personalChartLayout,
  themeMode: propThemeMode,
  isDark: propIsDark,
  userBrandColorHex: propUserBrandColorHex,
  clinicPrimaryColorHex,
  syncStatusBadge,
  onSelectThemeMode,
  onSelectUserBrandColor,
  onSelectDensity,
  onSelectTextPreset,
  onStepScaleDown,
  onStepScaleUp,
  onSelectChartLayout,
}: DisplayErgonomicsCardProps) {
  const themeCtx = useThemeMode();
  const effectiveThemeMode = propThemeMode ?? themeCtx.themeMode;
  const effectiveIsDark =
    propIsDark !== undefined
      ? propIsDark
      : effectiveThemeMode === 'dark'
      ? true
      : effectiveThemeMode === 'light'
      ? false
      : themeCtx.isDark;

  const rawUserHex =
    propUserBrandColorHex !== undefined ? propUserBrandColorHex : themeCtx.userBrandColorHex;
  const effectiveUserBrandHex =
    typeof rawUserHex === 'string' && HEX_COLOR.test(rawUserHex.trim())
      ? rawUserHex.trim().toUpperCase()
      : null;

  const resolvedClinicHex =
    typeof clinicPrimaryColorHex === 'string' && HEX_COLOR.test(clinicPrimaryColorHex.trim())
      ? clinicPrimaryColorHex.trim().toUpperCase()
      : BRAND_COLOR_PRESETS[0].color;

  const [customHexInput, setCustomHexInput] = useState<string>(() => effectiveUserBrandHex ?? '');
  const [customColorError, setCustomColorError] = useState<string | null>(null);

  useEffect(() => {
    setCustomHexInput(effectiveUserBrandHex ?? '');
    setCustomColorError(null);
  }, [effectiveUserBrandHex]);

  const handleSelectThemeMode = (nextMode: ThemeMode) => {
    if (onSelectThemeMode) {
      onSelectThemeMode(nextMode);
    } else {
      themeCtx.setThemeMode(nextMode);
    }
  };

  const handleSelectUserColor = (nextHex: string | null, label?: string) => {
    setCustomColorError(null);
    setCustomHexInput(nextHex ?? '');
    if (onSelectUserBrandColor) {
      onSelectUserBrandColor(nextHex, label);
    } else {
      themeCtx.setUserBrandColorHex(nextHex);
    }
  };

  const handleApplyCustomColor = () => {
    const check = validatePersonalAccentHex(customHexInput);
    if (!check.valid) {
      setCustomColorError(check.error);
      return;
    }
    handleSelectUserColor(check.hex, `Custom (${check.hex})`);
  };

  const activeThemeMeta =
    THEME_MODE_OPTIONS.find((opt) => opt.mode === effectiveThemeMode) ?? THEME_MODE_OPTIONS[0];

  const orderedDensityOptions = [...UI_DENSITY_OPTIONS].sort((a, b) => b.multiplier - a.multiplier);

  const chartLayoutBadgeLabel =
    personalChartLayout === 'default'
      ? 'Use Clinic Default'
      : personalChartLayout === 'split'
      ? 'Side-by-Side'
      : personalChartLayout === 'modal'
      ? 'Pop-up Window'
      : 'Side Panel';

  return (
    <Card>
      <CardHeader
        icon={effectiveIsDark ? 'moon' : 'sun'}
        title="Appearance, Text Size & Screen Layout"
        subtitle="Choose light or dark mode, adjust text size and spacing, and pick how patient charts open"
        rightAction={syncStatusBadge}
      />
      <CardContent style={styles.cardSection}>
        {/* 1. Color Theme & Dark Mode */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              COLOR THEME & DARK MODE
            </ThemedText>
            <Badge
              label={activeThemeMeta.badgeLabel}
              variant="primary"
              size="xs"
              icon={activeThemeMeta.icon}
            />
          </View>

          <View style={styles.darkToggleRow}>
            <View style={styles.darkToggleInfo}>
              <View style={styles.inlineHeader}>
                <Icon
                  name={effectiveIsDark ? 'moon' : 'sun'}
                  size={theme.sizes.iconMd}
                  color={theme.colors.primary}
                />
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Dark Mode
                </ThemedText>
                {effectiveIsDark ? <Badge label="On" variant="primary" size="xs" /> : null}
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Use darker screen backgrounds to reduce eye strain in dim consultation rooms.
              </ThemedText>
            </View>
            <ToggleSwitch
              value={effectiveIsDark}
              onValueChange={(enabled) => handleSelectThemeMode(enabled ? 'dark' : 'light')}
              accessibilityLabel="Dark Mode"
            />
          </View>

          <View style={styles.tileGrid}>
            {THEME_MODE_OPTIONS.map((opt) => {
              const isSelected = effectiveThemeMode === opt.mode;
              return (
                <Pressable
                  key={opt.mode}
                  onPress={() => handleSelectThemeMode(opt.mode)}
                  style={({ hovered }: any) => [
                    styles.compactTile,
                    hovered && !isSelected && styles.compactTileHover,
                    isSelected && styles.compactTileActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, selected: isSelected }}
                  accessibilityLabel={opt.label}
                  testID={`theme-mode-tile-${opt.mode}`}
                >
                  <View style={styles.tileTopRow}>
                    <View style={styles.inlineHeader}>
                      <Icon
                        name={opt.icon}
                        size={theme.sizes.iconSm}
                        color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                      />
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primary : theme.colors.text}
                      >
                        {opt.label}
                      </ThemedText>
                    </View>
                    {isSelected ? (
                      <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    ) : null}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
                    {opt.description}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 1b. Personal Accent Color */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              PERSONAL ACCENT COLOR
            </ThemedText>
            <Badge
              label={effectiveUserBrandHex ? 'Personal Color Active' : 'Using Clinic Color'}
              variant={effectiveUserBrandHex ? 'primary' : 'neutral'}
              size="xs"
              icon="palette"
            />
          </View>

          <View style={styles.darkToggleRow}>
            <View style={styles.darkToggleInfo}>
              <View style={styles.inlineHeader}>
                <View
                  style={[
                    styles.activeColorDot,
                    { backgroundColor: effectiveUserBrandHex || resolvedClinicHex },
                  ]}
                />
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Personal Accent Color
                </ThemedText>
              </View>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Choose your own button and highlight color for your account, or follow your clinic&apos;s default color.
              </ThemedText>
            </View>
            {effectiveUserBrandHex !== null ? (
              <View style={styles.inlineHeader}>
                <View
                  style={[styles.clinicColorDot, { backgroundColor: resolvedClinicHex }]}
                />
                <Button
                  title="Use Clinic Default"
                  variant="outline"
                  size="sm"
                  icon="undo"
                  testID="reset-user-accent-color"
                  accessibilityLabel="Use Clinic Default"
                  onPress={() => handleSelectUserColor(null, 'Clinic Default')}
                />
              </View>
            ) : null}
          </View>

          <View style={styles.accentPresetGrid}>
            {BRAND_COLOR_PRESETS.map((preset) => {
              const isSelected =
                effectiveUserBrandHex !== null &&
                effectiveUserBrandHex.toUpperCase() === preset.color.toUpperCase();
              const isClinicMatch =
                effectiveUserBrandHex === null &&
                resolvedClinicHex.toUpperCase() === preset.color.toUpperCase();

              return (
                <Pressable
                  key={preset.color}
                  onPress={() => handleSelectUserColor(preset.color, preset.label)}
                  style={({ hovered }: any) => [
                    styles.accentPresetTile,
                    hovered && !isSelected && styles.compactTileHover,
                    isSelected && styles.accentPresetTileActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected, selected: isSelected }}
                  accessibilityLabel={preset.label}
                  testID={`user-accent-preset-${preset.color}`}
                >
                  <View
                    style={[
                      styles.accentSwatchCircle,
                      { backgroundColor: preset.color },
                    ]}
                  >
                    {isSelected ? (
                      <Icon
                        name="check"
                        size={theme.sizes.iconSm}
                        color={readableForeground(preset.color)}
                      />
                    ) : null}
                  </View>
                  <View style={styles.accentPresetTextCol}>
                    <ThemedText
                      variant="smallBold"
                      color={isSelected ? theme.colors.primary : theme.colors.text}
                      numberOfLines={1}
                    >
                      {preset.label}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {isClinicMatch ? `${preset.color} (Clinic)` : preset.color}
                    </ThemedText>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.customColorBlock}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Custom Color Code
            </ThemedText>

            <View style={styles.customColorRow}>
              <View style={styles.customColorInputWrap}>
                <Input
                  value={customHexInput}
                  onChangeText={(val) => {
                    setCustomHexInput(val);
                    if (customColorError) {
                      setCustomColorError(null);
                    }
                  }}
                  placeholder="RRGGBB"
                  accessibilityLabel="Custom Color Code"
                  testID="user-accent-custom-input"
                />
              </View>
              <Button
                title="Apply Custom Color"
                variant="secondary"
                size="md"
                icon="palette"
                testID="apply-user-accent-custom"
                onPress={handleApplyCustomColor}
              />
            </View>

            {customColorError ? (
              <View style={styles.customColorFeedbackRow}>
                <Icon
                  name="alertCircle"
                  size={theme.sizes.iconSm}
                  color={theme.colors.emergency}
                />
                <ThemedText variant="caption" color={theme.colors.emergency}>
                  {customColorError}
                </ThemedText>
              </View>
            ) : (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Enter any 6-character color code with readable contrast.
              </ThemedText>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 2. Screen Spacing (100% / 85% / 70% Compact 3-Up Visual Tiles) */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              SCREEN SPACING (100% / 85% / 70%)
            </ThemedText>
            <Badge label={DENSITY_ICON_MAP[density].shortLabel} variant="primary" size="xs" />
          </View>

          <View style={styles.tileGrid}>
            {orderedDensityOptions.map((opt) => {
              const isSelected = density === opt.density;
              const meta = DENSITY_ICON_MAP[opt.density];
              return (
                <Pressable
                  key={opt.density}
                  onPress={() => onSelectDensity(opt.density, meta.shortLabel)}
                  style={({ hovered }: any) => [
                    styles.compactTile,
                    hovered && !isSelected && styles.compactTileHover,
                    isSelected && styles.compactTileActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={meta.shortLabel}
                >
                  <View style={styles.tileTopRow}>
                    <View style={styles.inlineHeader}>
                      <Icon
                        name={meta.icon}
                        size={theme.sizes.iconSm}
                        color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                      />
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primary : theme.colors.text}
                      >
                        {meta.shortLabel}
                      </ThemedText>
                    </View>
                    {isSelected ? (
                      <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    ) : null}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
                    {meta.plainDesc}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 3. Text Size (60% - 130%) */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              TEXT SIZE (60% - 130%)
            </ThemedText>
            <Badge label={`${Math.round(scale * 100)}% Text Size`} variant="neutral" size="xs" />
          </View>

          <View style={styles.stepperContainer}>
            <View style={styles.stepperInfo}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Adjust Text Size
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Make words smaller or larger in 5% steps from 60% to 130%.
              </ThemedText>
            </View>

            <View style={styles.stepperControls}>
              <Button
                title="-5%"
                variant="outline"
                size="sm"
                icon="minus"
                onPress={onStepScaleDown}
                disabled={scale <= 0.601}
              />
              <View style={styles.stepperValueBadge}>
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  {Math.round(scale * 100)}%
                </ThemedText>
              </View>
              <Button
                title="+5%"
                variant="outline"
                size="sm"
                icon="plus"
                onPress={onStepScaleUp}
                disabled={scale >= 1.299}
              />
              <Button
                title="Reset (100%)"
                variant="ghost"
                size="sm"
                onPress={() => onSelectTextPreset('standard', 'Standard (100%)')}
                disabled={scale === 1.0}
              />
            </View>
          </View>

          <View style={styles.scalePresetsRow}>
            {TEXT_SCALE_OPTIONS.map((opt) => {
              const isSelected = textPreset === opt.preset;
              return (
                <Pressable
                  key={opt.preset}
                  onPress={() => onSelectTextPreset(opt.preset, opt.label)}
                  style={({ hovered }: any) => [
                    styles.scalePill,
                    hovered && !isSelected && styles.scalePillHover,
                    isSelected && styles.scalePillActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={opt.label}
                >
                  <ThemedText
                    variant={isSelected ? 'captionBold' : 'caption'}
                    color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.divider} />

        {/* 4. How Patient Charts Open */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              HOW PATIENT CHARTS OPEN
            </ThemedText>
            <Badge label={chartLayoutBadgeLabel} variant="primary" size="xs" />
          </View>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Choose how a patient&apos;s chart opens when you click their name on your screen.
          </ThemedText>

          <View style={styles.tileGrid}>
            {CHART_LAYOUT_TILES.map((layoutOpt) => {
              const isSelected = personalChartLayout === layoutOpt.id;
              return (
                <Pressable
                  key={layoutOpt.id}
                  onPress={() => onSelectChartLayout(layoutOpt.id)}
                  style={({ hovered }: any) => [
                    styles.compactTile,
                    hovered && !isSelected && styles.compactTileHover,
                    isSelected && styles.compactTileActive,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={layoutOpt.name}
                >
                  <View style={styles.tileTopRow}>
                    <View style={styles.inlineHeader}>
                      <Icon
                        name={layoutOpt.icon}
                        size={theme.sizes.iconSm}
                        color={isSelected ? theme.colors.primary : theme.colors.textMuted}
                      />
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primary : theme.colors.text}
                      >
                        {layoutOpt.name}
                      </ThemedText>
                    </View>
                    {isSelected ? (
                      <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primary} />
                    ) : null}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} numberOfLines={2}>
                    {layoutOpt.desc}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 5. Compact Sample Preview */}
        <View style={styles.previewBox}>
          <View style={styles.previewHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              SAMPLE PREVIEW
            </ThemedText>
            <View style={styles.stepperControls}>
              <Badge
                label={activeThemeMeta.badgeLabel}
                variant="primary"
                size="xs"
                icon={activeThemeMeta.icon}
              />
              {effectiveUserBrandHex ? (
                <Badge
                  label="Personal Color"
                  variant="primary"
                  size="xs"
                  icon="palette"
                />
              ) : null}
              <Badge label={`${DENSITY_ICON_MAP[density].pct} Spacing`} variant="primary" size="xs" />
              <Badge label={`${Math.round(scale * 100)}% Text`} variant="neutral" size="xs" />
              <Badge label={chartLayoutBadgeLabel} variant="outline" size="xs" />
            </View>
          </View>

          <View style={styles.previewCard}>
            <View style={styles.previewTopRow}>
              <Badge label="Sample Row" variant="primary" size="sm" />
              <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={1}>
                Heading and Patient List Item
              </ThemedText>
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Preview how your selected color theme, spacing, and text size appear across patient queues and consultation notes.
            </ThemedText>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardSection: {
    gap: theme.spacing.md,
  },
  subsection: {
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  syncRetryInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  darkToggleRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  darkToggleInfo: {
    flex: 1,
    minWidth: 200,
    gap: 2,
  },
  activeColorDot: {
    width: theme.sizes.iconSm,
    height: theme.sizes.iconSm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  clinicColorDot: {
    width: theme.spacing.md,
    height: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  accentPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  accentPresetTile: {
    flex: 1,
    minWidth: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  accentPresetTileActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  accentSwatchCircle: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexShrink: 0,
  },
  accentPresetTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  customColorBlock: {
    gap: theme.spacing.xs,
  },
  customColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  customColorInputWrap: {
    flex: 1,
    minWidth: 220,
  },
  customColorFeedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  compactTile: {
    flex: 1,
    minWidth: 180,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  compactTileHover: {
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
  },
  compactTileActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  divider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.xs,
  },
  stepperContainer: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  stepperInfo: {
    gap: 2,
    flex: 1,
    minWidth: 180,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  stepperValueBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minWidth: 56,
    alignItems: 'center',
  },
  scalePresetsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  scalePill: {
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  scalePillHover: {
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.primarySubtle,
  },
  scalePillActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  previewBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  previewCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    gap: theme.spacing.xs,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
});
