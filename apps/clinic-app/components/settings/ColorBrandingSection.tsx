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
import { theme } from '../../constants/theme';
import { useClinic } from '../../context/ClinicContext';
import {
  BRAND_COLOR_PRESETS,
  HEX_COLOR,
  isUsableAccent,
  readableForeground,
  DEFAULT_CLINIC_BRAND_COLOR,
} from '../../constants/color';
import { Alert, notify } from '../../utils/feedback';

interface ColorBrandingSectionProps {
  onSaved?: (newColor: string | null) => void;
}

export default function ColorBrandingSection({ onSaved }: ColorBrandingSectionProps) {
  const {
    primaryColorHex,
    workspaceAccentColorHex,
    workspaceProfile,
    isColorOverridden,
    setPrimaryColorHex,
  } = useClinic();

  const [selectedColor, setSelectedColor] = useState<string>(primaryColorHex || DEFAULT_CLINIC_BRAND_COLOR);
  const [customHexInput, setCustomHexInput] = useState<string>(primaryColorHex || DEFAULT_CLINIC_BRAND_COLOR);
  const [saving, setSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync state if primaryColorHex updates externally
  useEffect(() => {
    if (primaryColorHex) {
      setSelectedColor(primaryColorHex);
      setCustomHexInput(primaryColorHex);
      setValidationError(null);
    }
  }, [primaryColorHex]);

  const handleSelectPreset = (hex: string) => {
    setSelectedColor(hex);
    setCustomHexInput(hex);
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
        setValidationError('Invalid hex color format. Use #RRGGBB.');
      } else if (!isUsableAccent(clean)) {
        setValidationError('This color has insufficient contrast for readable text. Please choose a darker or more vibrant shade.');
      } else {
        setValidationError(null);
        setSelectedColor(clean);
      }
    } else if (clean.length > 7) {
      setValidationError('Hex color must be exactly 7 characters including #.');
    } else {
      setValidationError(null);
    }
  };

  const handleSaveOverride = async () => {
    if (!HEX_COLOR.test(selectedColor) || !isUsableAccent(selectedColor)) {
      Alert.alert('Invalid color', 'Please select or enter a valid hex color with sufficient contrast.');
      return;
    }

    setSaving(true);
    try {
      const success = await setPrimaryColorHex(selectedColor);
      if (success) {
        notify.success('Clinic color branding saved.');
        onSaved?.(selectedColor);
      } else {
        Alert.alert('Saved locally', 'Color branding updated on device, but could not sync to server database.');
      }
    } catch (err: any) {
      Alert.alert('Save error', err?.message || 'Failed to save color branding.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevertToWorkspace = async () => {
    const targetWorkspaceColor = workspaceAccentColorHex || DEFAULT_CLINIC_BRAND_COLOR;
    setSaving(true);
    try {
      const success = await setPrimaryColorHex(null);
      if (success) {
        setSelectedColor(targetWorkspaceColor);
        setCustomHexInput(targetWorkspaceColor);
        setValidationError(null);
        notify.success('Reverted to portal tenant workspace brand color.');
        onSaved?.(null);
      } else {
        Alert.alert('Notice', 'Unable to sync revert to server.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to revert color branding.');
    } finally {
      setSaving(false);
    }
  };

  const previewForeground = readableForeground(selectedColor);
  const workspaceDisplayName = workspaceProfile?.displayName || 'Portal Workspace';
  const hasPendingChanges = selectedColor.toUpperCase() !== primaryColorHex.toUpperCase();

  return (
    <View style={styles.container}>
      {/* Header and Status */}
      <View style={styles.headerRow}>
        <View style={styles.headerTextCol}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Workstation Color Branding
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Auto-inherits from your Portal Tenant Workspace brand, or choose a custom color override for this clinic.
          </ThemedText>
        </View>

        <View style={styles.statusBadgeWrapper}>
          <Badge
            label={isColorOverridden ? 'Custom Clinic Override' : 'Inherited from Workspace'}
            variant={isColorOverridden ? 'warning' : 'success'}
            size="sm"
          />
        </View>
      </View>

      {/* Inheritance Info Banner */}
      <View style={[styles.infoBanner, isColorOverridden ? styles.infoBannerOverride : styles.infoBannerInherited]}>
        <View style={styles.infoBannerIcon}>
          <Icon
            name={isColorOverridden ? 'palette' : 'checkCircle'}
            size={theme.sizes.iconSm}
            color={isColorOverridden ? theme.colors.warningText : theme.colors.successText}
          />
        </View>
        <View style={styles.infoBannerContent}>
          <ThemedText variant="captionBold" color={isColorOverridden ? theme.colors.warningText : theme.colors.successText}>
            {isColorOverridden ? 'Facility Custom Override Active' : `Auto-Inheriting from ${workspaceDisplayName}`}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            {isColorOverridden
              ? `This clinic facility has overridden the tenant default with ${primaryColorHex}. Click Revert to restore inheritance.`
              : `Workstation is dynamically aligned with your organization's brand color (${selectedColor}).`}
          </ThemedText>
        </View>
        {isColorOverridden ? (
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

      {/* Preset Swatches Grid */}
      <View style={styles.sectionBlock}>
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
          Curated Brand Presets
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
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    {preset.color}
                  </ThemedText>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Custom Hex Code Input */}
      <View style={styles.sectionBlock}>
        <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.sectionLabel}>
          Custom Hex Code
        </ThemedText>
        <View style={styles.customHexRow}>
          <View style={styles.hexInputWrapper}>
            <ThemedText variant="bodyBold" color={theme.colors.textMuted} style={styles.hexPrefix}>
              #
            </ThemedText>
            <TextInput
              value={customHexInput.replace(/^#/, '')}
              onChangeText={(val) => handleCustomHexChange('#' + val)}
              placeholder="0D6963"
              placeholderTextColor={theme.colors.textLight}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              style={styles.hexTextInput}
            />
            <View style={[styles.hexIndicator, { backgroundColor: selectedColor }]} />
          </View>

          <Button
            title="Save Color Override"
            variant="primary"
            icon="save"
            size="md"
            onPress={handleSaveOverride}
            loading={saving}
            disabled={saving || !!validationError || (!hasPendingChanges && isColorOverridden)}
          />
        </View>
        {validationError ? (
          <ThemedText variant="caption" color={theme.colors.emergency} style={styles.errorText}>
            {validationError}
          </ThemedText>
        ) : null}
      </View>

      {/* Live Workstation UI Preview Box */}
      <View style={styles.previewBox}>
        <View style={styles.previewHeader}>
          <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Live Workstation Component Preview
          </ThemedText>
          <View style={styles.previewActiveSwatchWrapper}>
            <View style={[styles.miniSwatch, { backgroundColor: selectedColor }]} />
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {selectedColor}
            </ThemedText>
          </View>
        </View>

        <View style={styles.previewComponentsRow}>
          {/* Simulated Primary Action Button */}
          <View style={styles.previewItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
              Primary Button
            </ThemedText>
            <View style={[styles.simulatedButton, { backgroundColor: selectedColor }]}>
              <Icon name="check" size={theme.sizes.iconSm} color={previewForeground} />
              <ThemedText variant="captionBold" color={previewForeground}>
                Save Changes
              </ThemedText>
            </View>
          </View>

          {/* Simulated Active Sidebar Item */}
          <View style={styles.previewItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
              Active Sidebar Rail
            </ThemedText>
            <View style={styles.simulatedSidebarItem}>
              <View style={[styles.simulatedPill, { backgroundColor: selectedColor }]} />
              <Icon name="calendar" size={theme.sizes.iconSm} color={selectedColor} />
              <ThemedText variant="captionBold" color={selectedColor}>
                Appointments
              </ThemedText>
            </View>
          </View>

          {/* Simulated Clinic Badge */}
          <View style={styles.previewItem}>
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.previewSubLabel}>
              Workstation Accent Badge
            </ThemedText>
            <View style={[styles.simulatedBadge, { borderColor: selectedColor }]}>
              <View style={[styles.simulatedDot, { backgroundColor: selectedColor }]} />
              <ThemedText variant="captionBold" color={selectedColor}>
                Routine Encounter
              </ThemedText>
            </View>
          </View>
        </View>
      </View>
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
  },
  headerTextCol: {
    flex: 1,
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
  },
  infoBannerInherited: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  infoBannerOverride: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  infoBannerIcon: {
    alignSelf: 'center',
  },
  infoBannerContent: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  sectionBlock: {
    marginBottom: theme.spacing.lg,
  },
  sectionLabel: {
    marginBottom: theme.spacing.sm,
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
    minWidth: 150,
  },
  presetCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  swatchCircle: {
    width: 26,
    height: 26,
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
  errorText: {
    marginTop: theme.spacing.xs,
  },
  previewBox: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surfaceSubtle,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
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
  previewComponentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    alignItems: 'center',
  },
  previewItem: {
    gap: theme.spacing.xs,
  },
  previewSubLabel: {
    textTransform: 'uppercase',
  },
  simulatedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    gap: theme.spacing.xs,
    minHeight: theme.sizes.controlSm,
  },
  simulatedSidebarItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  simulatedPill: {
    width: 3,
    height: 16,
    borderRadius: theme.radii.full,
  },
  simulatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  simulatedDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.full,
  },
});
