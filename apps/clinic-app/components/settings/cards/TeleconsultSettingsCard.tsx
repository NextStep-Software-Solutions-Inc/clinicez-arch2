import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Pressable, TextInput } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Icon from '../../ui/Icon';
import SettingsSplitCard from './SettingsSplitCard';
import { theme } from '../../../constants/theme';
import {
  clinicService,
  type ClinicSettingsRecord,
  type TeleconsultRecordingPolicy,
  type TeleconsultPaymentPolicy,
} from '../../../services/clinicService';
import { useClinic } from '../../../context/ClinicContext';
import { notify } from '../../../utils/feedback';

export interface TeleconsultSettingsCardProps {
  settings?: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function TeleconsultSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: TeleconsultSettingsCardProps) {
  const { refresh: refreshClinic } = useClinic();

  const [recordingPolicy, setRecordingPolicy] = useState<TeleconsultRecordingPolicy>(() => {
    return (settings?.teleconsultRecordingPolicy as TeleconsultRecordingPolicy) || 'WorkspaceVaultOnly';
  });

  const [retentionDays, setRetentionDays] = useState<number>(() => {
    return settings?.teleconsultRecordingRetentionDays ?? 30;
  });

  const [consentRequired, setConsentRequired] = useState<boolean>(() => {
    return settings?.teleconsultRecordingConsentRequired ?? true;
  });

  const [defaultPolicy, setDefaultPolicy] = useState<TeleconsultPaymentPolicy>(() => {
    return (settings?.teleconsultPaymentPolicy as TeleconsultPaymentPolicy) || 'Prepaid';
  });

  const [defaultFee, setDefaultFee] = useState<number>(() => {
    return settings?.teleconsultDefaultFee ?? 500;
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      if (settings.teleconsultRecordingPolicy) {
        setRecordingPolicy(settings.teleconsultRecordingPolicy as TeleconsultRecordingPolicy);
      }
      if (settings.teleconsultRecordingRetentionDays !== undefined) {
        setRetentionDays(settings.teleconsultRecordingRetentionDays);
      }
      if (settings.teleconsultRecordingConsentRequired !== undefined) {
        setConsentRequired(settings.teleconsultRecordingConsentRequired);
      }
      if (settings.teleconsultPaymentPolicy) {
        setDefaultPolicy(settings.teleconsultPaymentPolicy as TeleconsultPaymentPolicy);
      }
      if (settings.teleconsultDefaultFee !== undefined && settings.teleconsultDefaultFee !== null) {
        setDefaultFee(settings.teleconsultDefaultFee);
      }
    }
  }, [settings]);

  const handleSave = useCallback(async () => {
    if (retentionDays < 0) {
      notify.warning('Recording retention days cannot be negative.');
      return;
    }
    if (defaultFee < 0) {
      notify.warning('Default teleconsultation fee cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<ClinicSettingsRecord> = {
        teleconsultRecordingPolicy: recordingPolicy,
        teleconsultRecordingRetentionDays: retentionDays,
        teleconsultRecordingConsentRequired: consentRequired,
        teleconsultPaymentPolicy: defaultPolicy,
        teleconsultDefaultFee: defaultFee,
      };

      const [updated, err] = await clinicService.updateSettings(payload as any);
      if (err || !updated) {
        notify.error(err?.message || 'Failed to save teleconsultation settings.');
        return;
      }

      onSettingsUpdated?.(updated);
      notify.success('Teleconsultation facility settings saved successfully.');
      await refreshClinic();
    } catch (ex: any) {
      notify.error(ex?.message || 'An unexpected error occurred while saving.');
    } finally {
      setSaving(false);
    }
  }, [recordingPolicy, retentionDays, consentRequired, defaultPolicy, defaultFee, onSettingsUpdated, refreshClinic]);

  return (
    <SettingsSplitCard
      icon="consultations"
      title="Teleconsultation & Media Vault"
      subtitle="Configure recording retention, dual-party informed consent enforcement, and default outpatient billing gates."
      badgeLabel="Sovereign Telehealth"
      badgeVariant="purple"
      showSkeletons={showSkeletons}
      testID="teleconsult-settings-card"
    >
      <View style={styles.formContainer} testID="teleconsult-settings-form">
        {/* 1. Default Payment Policy */}
        <View style={styles.settingBlock}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
            Default Payment Policy
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Pre-fills payment gate for newly scheduled virtual consultations
          </ThemedText>
          <View style={styles.optionsRow} testID="setting-default-policy">
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
              {defaultPolicy}
            </ThemedText>
            {(['Prepaid', 'Postpaid', 'Exempt'] as const).map((pol) => {
              const isSelected = defaultPolicy === pol;
              return (
                <Pressable
                  key={pol}
                  onPress={() => setDefaultPolicy(pol)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Default policy ${pol}`}
                  style={[
                    styles.optionPill,
                    isSelected ? styles.optionPillSelected : styles.optionPillUnselected,
                  ]}
                >
                  <ThemedText
                    variant="smallBold"
                    color={isSelected ? theme.colors.routineText : theme.colors.text}
                  >
                    {pol}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 2. Default Teleconsult Fee */}
        <View style={styles.settingBlock}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
            Default Consultation Fee (₱)
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Standard charge applied to teleconsult billing invoices
          </ThemedText>
          <View style={styles.inputWrapper} testID="setting-default-fee">
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
              {String(defaultFee)}
            </ThemedText>
            <TextInput
              style={styles.textInput}
              value={String(defaultFee)}
              onChangeText={(val) => {
                const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
                setDefaultFee(isNaN(parsed) ? 0 : parsed);
              }}
              keyboardType="numeric"
              placeholder="500"
              placeholderTextColor={theme.colors.textLight}
              accessibilityLabel="Default Consultation Fee in Philippine Pesos"
            />
          </View>
        </View>

        {/* 3. Recording Policy */}
        <View style={styles.settingBlock}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
            Recording Policy
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Governs CMK AES-256-GCM encrypted vault video recording during consultations
          </ThemedText>
          <View style={styles.optionsRow} testID="setting-recording-policy">
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
              {recordingPolicy}
            </ThemedText>
            {(
              [
                { id: 'Disabled', label: 'Disabled' },
                { id: 'WorkspaceVaultOnly', label: 'WorkspaceVaultOnly' },
                { id: 'Both', label: 'Both' },
              ] as const
            ).map((opt) => {
              const isSelected = recordingPolicy === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => setRecordingPolicy(opt.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`Recording policy ${opt.label}`}
                  style={[
                    styles.optionPill,
                    isSelected ? styles.optionPillSelected : styles.optionPillUnselected,
                  ]}
                >
                  <ThemedText
                    variant="smallBold"
                    color={isSelected ? theme.colors.routineText : theme.colors.text}
                  >
                    {opt.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* 4. Retention Days */}
        <View style={styles.settingBlock}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
            Retention Policy (Days)
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Encrypted recordings are purged after this duration unless protected by Medico-Legal Hold
          </ThemedText>
          <View style={styles.inputWrapper} testID="setting-retention-days">
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
              {String(retentionDays)}
            </ThemedText>
            <TextInput
              style={styles.textInput}
              value={String(retentionDays)}
              onChangeText={(val) => {
                const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
                setRetentionDays(isNaN(parsed) ? 0 : parsed);
              }}
              keyboardType="numeric"
              placeholder="30"
              placeholderTextColor={theme.colors.textLight}
              accessibilityLabel="Recording Retention Policy in Days"
            />
          </View>
        </View>

        {/* 5. Dual Consent Enforcement */}
        <View style={styles.settingBlock}>
          <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
            Dual Informed Consent Requirement
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textSecondary}>
            Enforces patient acceptance prompt before recording stream initialization
          </ThemedText>
          <View style={styles.toggleRow} testID="setting-consent-required">
            <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
              {String(consentRequired)}
            </ThemedText>
            <Pressable
              onPress={() => setConsentRequired((prev) => !prev)}
              accessibilityRole="switch"
              accessibilityState={{ checked: consentRequired }}
              accessibilityLabel="Require Dual-Party Consent"
              style={[
                styles.togglePill,
                consentRequired ? styles.togglePillActive : styles.togglePillInactive,
              ]}
            >
              <Icon
                name={consentRequired ? 'check' : 'close'}
                size={theme.sizes.iconSm}
                color={consentRequired ? theme.colors.successText : theme.colors.textMuted}
              />
              <ThemedText
                variant="smallBold"
                color={consentRequired ? theme.colors.successText : theme.colors.text}
              >
                {consentRequired ? 'Dual Consent Enforced' : 'Clinician Discretion'}
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Save Action */}
        <View style={styles.saveActionRow}>
          <Button
            testID="btn-save-teleconsult-settings"
            variant="primary"
            size="md"
            icon="save"
            title="Save Teleconsult Settings"
            accessibilityLabel="Save teleconsultation settings"
            onPress={handleSave}
            loading={saving}
            style={styles.saveButton}
          />
        </View>
      </View>
    </SettingsSplitCard>
  );
}

const styles = StyleSheet.create({
  formContainer: {
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  settingBlock: {
    gap: theme.spacing.xs,
  },
  fieldLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accessibilityValue: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  optionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  optionPill: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionPillSelected: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
  },
  optionPillUnselected: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  inputWrapper: {
    marginTop: theme.spacing.xs,
  },
  textInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    minHeight: theme.sizes.touchTarget,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  togglePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
  togglePillActive: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  togglePillInactive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  saveActionRow: {
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    alignItems: 'flex-start',
  },
  saveButton: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
});
