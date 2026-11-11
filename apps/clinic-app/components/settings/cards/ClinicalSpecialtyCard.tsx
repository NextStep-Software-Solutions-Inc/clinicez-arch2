import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import Icon from '../../ui/Icon';
import { Card, CardContent, CardHeader } from '../../ui/Card';
import { SkeletonList } from '../../ui/Skeleton';
import { ToggleSwitch } from '../FacilityReadinessTab';
import { theme } from '../../../constants/theme';
import { clinicService, type ClinicSettingsRecord } from '../../../services/clinicService';
import { notify } from '../../../utils/feedback';

export type ClinicSpecialtyMode = 'Medical' | 'Dental' | 'Multi-Specialty';

export interface SpecialtyOption {
  id: ClinicSpecialtyMode;
  label: string;
  badge: string;
  icon: 'medical' | 'scan' | 'clinic';
  description: string;
}

export const CLINIC_SPECIALTY_OPTIONS: SpecialtyOption[] = [
  {
    id: 'Medical',
    label: 'Medical Practice',
    badge: 'General & Family Medicine',
    icon: 'medical',
    description:
      'General medical consultations, vital signs, physical exams, and prescriptions. Dental tooth chart is turned off.',
  },
  {
    id: 'Dental',
    label: 'Dental Practice',
    badge: 'Exclusive Dentistry',
    icon: 'scan',
    description:
      'Full dental care with adult (11–48) and child (51–85) dental tooth charts, surface notes, and dental procedures. Dental tooth chart is always on.',
  },
  {
    id: 'Multi-Specialty',
    label: 'Multi-Specialty Clinic',
    badge: 'Medical & Dental Care',
    icon: 'clinic',
    description:
      'Combined medical consultations and dental care. Turn the dental tooth chart on or off based on your facility’s services.',
  },
];

export function normalizeSpecialtyMode(
  raw?: string | null
): ClinicSpecialtyMode {
  if (raw === 'MultiSpecialty' || raw === 'Multi-Specialty') {
    return 'Multi-Specialty';
  }
  if (raw === 'Dental') {
    return 'Dental';
  }
  return 'Medical';
}

export function resolveSpecialtyDentalState(
  specialty: ClinicSpecialtyMode,
  dentalToggle?: boolean
): boolean {
  if (specialty === 'Dental') return true;
  if (specialty === 'Medical') return false;
  return Boolean(dentalToggle);
}

export interface ClinicalSpecialtyCardProps {
  settings: ClinicSettingsRecord | null;
  specialtyMode?: ClinicSpecialtyMode;
  setSpecialtyMode?: (v: ClinicSpecialtyMode) => void;
  enableDentalModule?: boolean;
  setEnableDentalModule?: (v: boolean) => void;
  savingSettings?: boolean;
  showSkeletons: boolean;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
}

export default function ClinicalSpecialtyCard({
  settings,
  specialtyMode,
  setSpecialtyMode,
  enableDentalModule,
  setEnableDentalModule,
  savingSettings = false,
  showSkeletons,
  onSettingsUpdated,
}: ClinicalSpecialtyCardProps) {
  const [internalSpecialty, setInternalSpecialty] = useState<ClinicSpecialtyMode>(() => {
    if (specialtyMode) return specialtyMode;
    return normalizeSpecialtyMode(settings?.specialtyMode);
  });

  const [internalDentalEnabled, setInternalDentalEnabled] = useState<boolean>(() => {
    if (enableDentalModule !== undefined) return enableDentalModule;
    if (settings?.specialtyMode === 'Dental') return true;
    return Boolean(settings?.enableDentalModule);
  });

  const [savingSpecialty, setSavingSpecialty] = useState(false);

  useEffect(() => {
    if (settings?.specialtyMode) {
      const mode = normalizeSpecialtyMode(settings.specialtyMode);
      setInternalSpecialty(mode);
      if (mode === 'Dental') {
        setInternalDentalEnabled(true);
      } else if (settings.enableDentalModule !== undefined) {
        setInternalDentalEnabled(Boolean(settings.enableDentalModule));
      }
    }
  }, [settings?.specialtyMode, settings?.enableDentalModule]);

  const effectiveSpecialty = specialtyMode ?? internalSpecialty;
  const effectiveDentalEnabled = resolveSpecialtyDentalState(
    effectiveSpecialty,
    enableDentalModule ?? internalDentalEnabled
  );
  const savedSpecialty = normalizeSpecialtyMode(settings?.specialtyMode);
  const savedDentalEnabled = resolveSpecialtyDentalState(
    savedSpecialty,
    settings?.enableDentalModule
  );
  const isDirty = settings
    ? effectiveSpecialty !== savedSpecialty || effectiveDentalEnabled !== savedDentalEnabled
    : !showSkeletons && (effectiveSpecialty !== 'Medical' || effectiveDentalEnabled !== false);
  const isSaving = savingSpecialty || savingSettings;

  const handleSelectSpecialty = (mode: ClinicSpecialtyMode) => {
    setInternalSpecialty(mode);
    setSpecialtyMode?.(mode);
    if (mode === 'Dental') {
      setInternalDentalEnabled(true);
      setEnableDentalModule?.(true);
    } else if (mode === 'Medical') {
      setInternalDentalEnabled(false);
      setEnableDentalModule?.(false);
    }
  };

  const handleToggleDental = (nextVal: boolean) => {
    if (effectiveSpecialty === 'Dental' || effectiveSpecialty === 'Medical') return;
    setInternalDentalEnabled(nextVal);
    setEnableDentalModule?.(nextVal);
  };

  const handleSaveSpecialty = async () => {
    setSavingSpecialty(true);
    const [updated, err] = await clinicService.updateSettings({
      specialtyMode: effectiveSpecialty,
      enableDentalModule: effectiveDentalEnabled,
    });
    setSavingSpecialty(false);
    if (err || !updated) {
      notify.error(err?.message || 'Failed to update clinic specialty settings.');
      return;
    }
    notify.success('Clinic specialty settings saved.');
    onSettingsUpdated?.(updated);
  };

  return (
    <Card style={styles.card} testID="clinical-specialty-card">
      <CardHeader
        title="Clinic Specialty"
        subtitle="Choose whether your clinic sees medical patients, dental patients, or both"
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={3} />
        ) : (
          <View style={styles.container}>
            {/* Compact 3-Up Visual Radio Tile Grid */}
            <View style={styles.tilesRow}>
              {CLINIC_SPECIALTY_OPTIONS.map((opt) => {
                const isSelected = effectiveSpecialty === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectSpecialty(opt.id)}
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

            {/* Dental Tooth Chart Control Row */}
            <View style={styles.dentalModuleBox}>
              <View style={styles.dentalModuleHeader}>
                <View style={styles.dentalModuleTitleGroup}>
                  <View style={styles.dentalModuleIconBadgeRow}>
                    <Icon name="scan" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Dental Tooth Chart
                    </ThemedText>
                    {effectiveSpecialty === 'Dental' ? (
                      <Badge label="Permanently Active (Dental Practice)" variant="info" size="sm" />
                    ) : null}
                    {effectiveSpecialty === 'Medical' ? (
                      <Badge label="Inactive in Medical Mode" variant="neutral" size="sm" />
                    ) : null}
                    {effectiveSpecialty === 'Multi-Specialty' ? (
                      <Badge
                        label={effectiveDentalEnabled ? 'Active' : 'Disabled'}
                        variant={effectiveDentalEnabled ? 'success' : 'neutral'}
                        size="sm"
                      />
                    ) : null}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {effectiveSpecialty === 'Dental'
                      ? 'The FDI odontogram, tooth surface tracking, and dental procedure catalog are permanently active for dental clinics.'
                      : effectiveSpecialty === 'Medical'
                      ? 'Dental charting is turned off for medical-only clinics. Select Dental or Multi-Specialty to activate dental charting.'
                      : 'Enables adult (11–48) and child (51–85) FDI odontograms, tooth surface notes, and dental procedures in patient charts.'}
                  </ThemedText>
                </View>

                <ToggleSwitch
                  value={effectiveDentalEnabled}
                  onValueChange={handleToggleDental}
                  disabled={effectiveSpecialty === 'Dental' || effectiveSpecialty === 'Medical'}
                  accessibilityLabel="Toggle Dental Tooth Chart"
                />
              </View>
            </View>

            {isDirty || isSaving ? (
              <View style={styles.actionsEnd}>
                <Button
                  title="Save specialty"
                  icon="save"
                  size="sm"
                  onPress={handleSaveSpecialty}
                  loading={isSaving}
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
  dentalModuleBox: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
  },
  dentalModuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  dentalModuleTitleGroup: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  dentalModuleIconBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  actionsEnd: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.xs,
  },
});
