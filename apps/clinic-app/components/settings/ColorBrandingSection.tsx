import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Skeleton, SkeletonList } from '../ui/Skeleton';
import {
  theme,
  buildPreviewShadowStyle,
  getActiveThemeState,
  subscribeActiveTheme,
  type ThemeColorScheme,
} from '../../constants/theme';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useClinic } from '../../context/ClinicContext';
import {
  BRAND_COLOR_PRESETS,
  HEX_COLOR,
  isUsableAccent,
  readableForeground,
  deriveBrandPalette,
  DEFAULT_CLINIC_BRAND_COLOR,
  isColorBrandingDirty,
} from '../../constants/color';
import { Alert, notify } from '../../utils/feedback';

interface ColorBrandingSectionProps {
  onSaved?: (newColor: string | null) => void;
  showSkeletons?: boolean;
}

export default function ColorBrandingSection({
  onSaved,
  showSkeletons = false,
}: ColorBrandingSectionProps) {
  const { isDesktop } = useBreakpoint();
  const {
    primaryColorHex,
    workspaceAccentColorHex,
    workspaceProfile,
    isColorOverridden,
    setPrimaryColorHex,
    loading,
  } = useClinic();
  const isLoading = Boolean(showSkeletons || loading);

  const initialColor = (primaryColorHex || DEFAULT_CLINIC_BRAND_COLOR).toUpperCase();
  const [savedBaselineColor, setSavedBaselineColor] = useState<string>(initialColor);
  const [selectedColor, setSelectedColor] = useState<string>(initialColor);
  const [customHexInput, setCustomHexInput] = useState<string>(initialColor);
  const [saving, setSaving] = useState<boolean>(false);
  const [reverting, setReverting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [activeScheme, setActiveScheme] = useState<ThemeColorScheme>(() => getActiveThemeState().scheme);
  const [userBrandColorHex, setUserBrandColorHex] = useState<string | null>(
    () => getActiveThemeState().userBrandColorHex
  );

  useEffect(() => {
    return subscribeActiveTheme(() => {
      const nextThemeState = getActiveThemeState();
      setActiveScheme(nextThemeState.scheme);
      setUserBrandColorHex(nextThemeState.userBrandColorHex);
    });
  }, []);

  // Sync state if primaryColorHex updates externally
  useEffect(() => {
    if (primaryColorHex) {
      const normalized = primaryColorHex.toUpperCase();
      setSavedBaselineColor(normalized);
      setSelectedColor(normalized);
      setCustomHexInput(normalized);
      setValidationError(null);
    }
  }, [primaryColorHex]);

  const handleSelectPreset = (hex: string) => {
    const normalized = hex.toUpperCase();
    setSelectedColor(normalized);
    setCustomHexInput(normalized);
    setValidationError(null);
  };

  const handleCustomHexChange = (text: string) => {
    let clean = text.trim();
    if (!clean.startsWith('#') && clean.length > 0) {
      clean = '#' + clean;
    }
    clean = clean.toUpperCase();
    setCustomHexInput(clean);

    if (clean.length === 7) {
      if (!HEX_COLOR.test(clean)) {
        setValidationError('Enter a 6-character color code using 0-9 and A-F.');
      } else if (!isUsableAccent(clean)) {
        setValidationError('This color is too light for white or dark button text. Choose a deeper shade.');
      } else {
        setValidationError(null);
        setSelectedColor(clean);
      }
    } else if (clean.length > 7) {
      setValidationError('Color code must be 6 characters.');
    } else {
      setValidationError(null);
    }
  };

  const handleSaveOverride = async () => {
    if (!HEX_COLOR.test(selectedColor) || !isUsableAccent(selectedColor)) {
      Alert.alert('Invalid color', 'Please choose a preset or enter a valid 6-character color code.');
      return;
    }

    setSaving(true);
    try {
      const normalized = selectedColor.toUpperCase();
      const success = await setPrimaryColorHex(normalized);
      if (success) {
        setSavedBaselineColor(normalized);
        setSelectedColor(normalized);
        setCustomHexInput(normalized);
        setValidationError(null);
        notify.success('Clinic brand color saved.');
        onSaved?.(normalized);
      } else {
        Alert.alert('Saved on this device', 'Brand color updated locally, but could not reach the server.');
      }
    } catch (err: any) {
      Alert.alert('Save error', err?.message || 'Failed to save brand color.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevertToWorkspace = async () => {
    const targetWorkspaceColor = (workspaceAccentColorHex || DEFAULT_CLINIC_BRAND_COLOR).toUpperCase();
    setReverting(true);
    try {
      const success = await setPrimaryColorHex(null);
      if (success) {
        setSavedBaselineColor(targetWorkspaceColor);
        setSelectedColor(targetWorkspaceColor);
        setCustomHexInput(targetWorkspaceColor);
        setValidationError(null);
        notify.success('Reset to default brand color.');
        onSaved?.(null);
      } else {
        Alert.alert('Notice', 'Unable to save reset to server.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to reset brand color.');
    } finally {
      setReverting(false);
    }
  };

  const previewPalette = deriveBrandPalette(selectedColor, activeScheme);
  const workspaceDisplayName = (workspaceProfile?.displayName || '').trim();
  const isDirty = isColorBrandingDirty({
    selectedColor,
    customHexInput,
    savedPrimaryColorHex: savedBaselineColor,
  });

  return (
    <View style={styles.container}>
      {/* Header and Status */}
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <View style={styles.titleRow}>
            <Icon name="palette" size={theme.sizes.iconSm} color={theme.colors.primary} />
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              Clinic Brand Color
            </ThemedText>
          </View>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Choose the main color used for buttons, active menus, alerts, and badges in this clinic.
          </ThemedText>
        </View>

        <View style={styles.statusBadgeWrapper}>
          {isLoading ? (
            <Skeleton width={120} height={theme.spacing.xl} radius={theme.radii.full} />
          ) : (
            <Badge
              label={isColorOverridden ? 'Custom color active' : 'Using default color'}
              variant={isColorOverridden ? 'primary' : 'success'}
              size="sm"
            />
          )}
        </View>
      </View>

      {isLoading ? (
        <SkeletonList rows={3} />
      ) : (
        <>
          {/* Active Color Status Banner */}
          <View style={[styles.infoBanner, isColorOverridden ? styles.infoBannerOverride : styles.infoBannerInherited]}>
            <View style={styles.infoBannerIcon}>
              <Icon
                name={isColorOverridden ? 'palette' : 'checkCircle'}
                size={theme.sizes.iconSm}
                color={isColorOverridden ? theme.colors.primary : theme.colors.successText}
              />
            </View>
            <View style={styles.infoBannerContent}>
              <ThemedText variant="captionBold" color={isColorOverridden ? theme.colors.primaryDark : theme.colors.successText}>
                {isColorOverridden ? 'Custom color active' : 'Using default color'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {isColorOverridden
                  ? workspaceDisplayName
                    ? `This clinic is using a custom color (${primaryColorHex}). Click Reset to Default to return to ${workspaceDisplayName}'s default color.`
                    : `This clinic is using a custom color (${primaryColorHex}). Click Reset to Default to return to the default brand color.`
                  : workspaceDisplayName
                  ? `Matching ${workspaceDisplayName}'s default brand color (${selectedColor}).`
                  : `Using the default brand color (${selectedColor}).`}
              </ThemedText>
            </View>
            {isColorOverridden ? (
              <Button
                title="Reset to Default"
                variant="outline"
                icon="undo"
                size="sm"
                onPress={handleRevertToWorkspace}
                loading={reverting}
                disabled={saving || reverting}
              />
            ) : null}
          </View>

          {userBrandColorHex ? (
            <View style={styles.personalOverrideNote}>
              <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.infoText} />
              <ThemedText variant="caption" color={theme.colors.infoText} style={styles.errorText}>
                {'Note: You also have a personal accent color active in My Profile -> Display & Sound, which overrides this clinic color on your screen.'}
              </ThemedText>
            </View>
          ) : null}

      <View style={[styles.splitContent, isDesktop && styles.splitContentDesktop]}>
        <View style={styles.controlsColumn}>
          {/* Preset Swatches Grid */}
          <View style={styles.sectionBlock}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
              Color Presets
            </ThemedText>
            <View style={styles.presetsGrid}>
              {BRAND_COLOR_PRESETS.map((preset) => {
                const isSelected = selectedColor.toUpperCase() === preset.color.toUpperCase();
                const swatchFg = readableForeground(preset.color);

                return (
                  <Pressable
                    key={preset.color}
                    onPress={() => handleSelectPreset(preset.color)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select color ${preset.label}`}
                    accessibilityState={{ selected: isSelected }}
                    style={[
                      styles.presetCard,
                      isSelected && styles.presetCardSelected,
                    ]}
                  >
                    <View style={[styles.swatchCircle, { backgroundColor: preset.color }]}>
                      {isSelected ? (
                        <Icon name="check" size={theme.sizes.iconSm} color={swatchFg} />
                      ) : null}
                    </View>
                    <View style={styles.presetTextCol}>
                      <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                        {preset.label}
                      </ThemedText>
                      <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                        {preset.description ? `${preset.color} · ${preset.description}` : preset.color}
                      </ThemedText>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Custom Color Code Input */}
          <View style={styles.sectionBlock}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
              Custom Color Code
            </ThemedText>
            <View style={styles.customHexRow}>
              <View style={styles.hexInputWrapper}>
                <ThemedText variant="bodyBold" color={theme.colors.textMuted} style={styles.hexPrefix}>
                  #
                </ThemedText>
                <TextInput
                  value={customHexInput.replace(/^#/, '')}
                  onChangeText={(val) => handleCustomHexChange('#' + val)}
                  placeholder="Color code"
                  placeholderTextColor={theme.colors.textLight}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  style={styles.hexTextInput}
                />
                <View style={[styles.hexIndicator, { backgroundColor: selectedColor }]} />
              </View>

              {isDirty || saving ? (
                <Button
                  title="Save Brand Color"
                  variant="primary"
                  icon="save"
                  size="md"
                  onPress={handleSaveOverride}
                  loading={saving}
                  disabled={saving || !!validationError || !HEX_COLOR.test(customHexInput)}
                />
              ) : null}
            </View>
            {validationError ? (
              <View style={styles.validationRow}>
                <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                <ThemedText variant="caption" color={theme.colors.emergency} style={styles.errorText}>
                  {validationError}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        {/* Live Preview Box */}
        <View style={[styles.previewBox, isDesktop && styles.previewBoxDesktop]}>
          <View style={styles.previewHeader}>
            <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Live Preview
            </ThemedText>
            <View style={styles.previewActiveSwatchWrapper}>
              <View style={[styles.miniSwatch, { backgroundColor: previewPalette.primary }]} />
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {selectedColor}
              </ThemedText>
            </View>
          </View>

          <View style={styles.previewComponentsStack}>
            {/* Real Shadowed Primary + Outline Buttons Preview */}
            <View style={styles.previewItem}>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
                Primary &amp; Outline Buttons
              </ThemedText>
              <View style={styles.previewButtonRow}>
                <Button
                  title="Save Changes"
                  icon="check"
                  variant="primary"
                  size="sm"
                  accessibilityLabel="Preview Primary Button"
                  onPress={() => {}}
                  style={{
                    backgroundColor: previewPalette.primary,
                    borderColor: previewPalette.primary,
                    ...buildPreviewShadowStyle(previewPalette.primaryShadowSm, 'sm'),
                  }}
                  textStyle={{ color: previewPalette.onPrimary }}
                />

                <Button
                  title="Outline Action"
                  variant="outline"
                  size="sm"
                  accessibilityLabel="Preview Outline Button"
                  onPress={() => {}}
                  style={{
                    borderColor: previewPalette.primary,
                    backgroundColor: theme.colors.surface,
                    ...buildPreviewShadowStyle(previewPalette.primaryShadowSubtle, 'subtle'),
                  }}
                  textStyle={{ color: previewPalette.primary }}
                />
              </View>
            </View>

            {/* Simulated Active Menu Item / Active Tab */}
            <View style={styles.previewItem}>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
                Active Menu Item &amp; Tab
              </ThemedText>
              <View
                style={[
                  styles.simulatedSidebarItem,
                  {
                    backgroundColor: previewPalette.primaryLight,
                    borderColor: previewPalette.primaryBorder,
                    ...buildPreviewShadowStyle(previewPalette.primaryShadowSubtle, 'subtle'),
                  },
                ]}
              >
                <View style={[styles.simulatedPill, { backgroundColor: previewPalette.primary }]} />
                <Icon name="calendar" size={theme.sizes.iconSm} color={previewPalette.primaryDark} />
                <ThemedText variant="captionBold" color={previewPalette.primaryDark}>
                  Appointments
                </ThemedText>
              </View>
            </View>

            {/* Simulated Alert Banner */}
            <View style={styles.previewItem}>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
                Alert Banner
              </ThemedText>
              <View
                style={[
                  styles.simulatedAlertBanner,
                  {
                    backgroundColor: previewPalette.primaryLight,
                    borderColor: previewPalette.primaryBorder,
                  },
                ]}
              >
                <Icon name="info" size={theme.sizes.iconSm} color={previewPalette.primaryDark} />
                <ThemedText variant="captionBold" color={previewPalette.primaryDark} style={styles.simulatedAlertText}>
                  Clinic schedule updated
                </ThemedText>
              </View>
            </View>

            {/* Simulated Status Badge */}
            <View style={styles.previewItem}>
              <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
                Status Badge
              </ThemedText>
              <View
                style={[
                  styles.simulatedBadge,
                  {
                    backgroundColor: previewPalette.primaryLight,
                    borderColor: previewPalette.primaryBorder,
                  },
                ]}
              >
                <View style={[styles.simulatedDot, { backgroundColor: previewPalette.primary }]} />
                <ThemedText variant="captionBold" color={previewPalette.primaryDark}>
                  Routine Visit
                </ThemedText>
              </View>
            </View>
          </View>
        </View>
      </View>
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
  },
  headerTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 220,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  statusBadgeWrapper: {
    alignSelf: 'flex-start',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  infoBannerInherited: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  infoBannerOverride: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  infoBannerIcon: {
    alignSelf: 'center',
  },
  infoBannerContent: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.xs,
  },
  personalOverrideNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
    marginBottom: theme.spacing.lg,
  },
  splitContent: {
    flexDirection: 'column',
    gap: theme.spacing.lg,
  },
  splitContentDesktop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xl,
  },
  controlsColumn: {
    flex: 1,
    gap: theme.spacing.lg,
  },
  sectionBlock: {
    gap: theme.spacing.xs,
  },
  sectionLabel: {
    marginBottom: theme.spacing.xs,
    textTransform: 'uppercase',
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
    minWidth: 180,
    flexGrow: 1,
  },
  presetCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  swatchCircle: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTextCol: {
    flex: 1,
  },
  customHexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  hexInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    height: theme.sizes.controlMd,
    minWidth: 200,
  },
  hexPrefix: {
    marginRight: theme.spacing.xs,
  },
  hexTextInput: {
    flex: 1,
    height: '100%',
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: theme.fontSizes.md,
  },
  hexIndicator: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    marginLeft: theme.spacing.xs,
  },
  validationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  errorText: {
    flex: 1,
  },
  previewBox: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  previewBoxDesktop: {
    width: 340,
    flexShrink: 0,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flexWrap: 'wrap',
  },
  previewActiveSwatchWrapper: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  miniSwatch: {
    width: 14,
    height: 14,
    borderRadius: theme.radii.full,
  },
  previewComponentsStack: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  previewButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  previewItem: {
    gap: theme.spacing.xs,
  },
  previewSubLabel: {
    textTransform: 'uppercase',
  },
  simulatedSidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    alignSelf: 'flex-start',
    ...theme.shadows.brandSubtle,
  },
  simulatedPill: {
    width: 3,
    height: 16,
    borderRadius: theme.radii.full,
  },
  simulatedAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.sm,
  },
  simulatedAlertText: {
    flex: 1,
  },
  simulatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    gap: theme.spacing.xs,
  },
  simulatedDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.full,
  },
});
