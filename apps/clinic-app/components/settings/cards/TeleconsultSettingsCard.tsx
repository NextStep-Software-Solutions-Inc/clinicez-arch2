import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, Pressable, TextInput } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Icon from '../../ui/Icon';
import Badge from '../../ui/Badge';
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

  const isWorkspaceTeleconsultEntitled = Boolean(settings?.isWorkspaceTeleconsultEntitled);

  const [enableTeleconsultation, setEnableTeleconsultation] = useState<boolean>(() => {
    return settings?.enableTeleconsultation ?? false;
  });

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
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  const settingsDisabled = !isWorkspaceTeleconsultEntitled || !enableTeleconsultation;

  const serializeState = useCallback(
    (s: {
      enableTeleconsultation: boolean;
      recordingPolicy: TeleconsultRecordingPolicy;
      retentionDays: number;
      consentRequired: boolean;
      defaultPolicy: TeleconsultPaymentPolicy;
      defaultFee: number;
    }) => JSON.stringify(s),
    []
  );

  const lastSavedSnapshotRef = useRef<string>(
    serializeState({
      enableTeleconsultation: settings?.enableTeleconsultation ?? false,
      recordingPolicy: (settings?.teleconsultRecordingPolicy as TeleconsultRecordingPolicy) || 'WorkspaceVaultOnly',
      retentionDays: settings?.teleconsultRecordingRetentionDays ?? 30,
      consentRequired: settings?.teleconsultRecordingConsentRequired ?? true,
      defaultPolicy: (settings?.teleconsultPaymentPolicy as TeleconsultPaymentPolicy) || 'Prepaid',
      defaultFee: settings?.teleconsultDefaultFee ?? 500,
    })
  );
  const isHydratingRef = useRef(false);

  useEffect(() => {
    if (settings) {
      isHydratingRef.current = true;
      const nextEnable = settings.enableTeleconsultation !== undefined ? Boolean(settings.enableTeleconsultation) : false;
      const nextRec = (settings.teleconsultRecordingPolicy as TeleconsultRecordingPolicy) || 'WorkspaceVaultOnly';
      const nextRet = settings.teleconsultRecordingRetentionDays ?? 30;
      const nextConsent = settings.teleconsultRecordingConsentRequired ?? true;
      const nextPol = (settings.teleconsultPaymentPolicy as TeleconsultPaymentPolicy) || 'Prepaid';
      const nextFee = settings.teleconsultDefaultFee ?? 500;

      setEnableTeleconsultation(nextEnable);
      setRecordingPolicy(nextRec);
      setRetentionDays(nextRet);
      setConsentRequired(nextConsent);
      setDefaultPolicy(nextPol);
      setDefaultFee(nextFee);

      lastSavedSnapshotRef.current = serializeState({
        enableTeleconsultation: nextEnable,
        recordingPolicy: nextRec,
        retentionDays: nextRet,
        consentRequired: nextConsent,
        defaultPolicy: nextPol,
        defaultFee: nextFee,
      });
      isHydratingRef.current = false;
    }
  }, [settings, serializeState]);

  const performSave = useCallback(
    async (silent: boolean) => {
      if (retentionDays < 0) {
        if (!silent) notify.warning('Recording retention days cannot be negative.');
        return;
      }
      if (defaultFee < 0) {
        if (!silent) notify.warning('Default teleconsultation fee cannot be negative.');
        return;
      }

      const currentSnapshot = serializeState({
        enableTeleconsultation,
        recordingPolicy,
        retentionDays,
        consentRequired,
        defaultPolicy,
        defaultFee,
      });

      setSaving(true);
      setAutoSaveStatus('saving');
      try {
        const payload: Partial<ClinicSettingsRecord> = {
          enableTeleconsultation,
          teleconsultRecordingPolicy: recordingPolicy,
          teleconsultRecordingRetentionDays: retentionDays,
          teleconsultRecordingConsentRequired: consentRequired,
          teleconsultPaymentPolicy: defaultPolicy,
          teleconsultDefaultFee: defaultFee,
        };

        const [updated, err] = await clinicService.updateSettings(payload as any);
        if (err || !updated) {
          setAutoSaveStatus('error');
          notify.error(err?.message || 'Failed to save teleconsultation settings.');
          return;
        }

        lastSavedSnapshotRef.current = currentSnapshot;
        setLastSavedAt(new Date());
        setAutoSaveStatus('saved');
        onSettingsUpdated?.(updated);
        if (!silent) {
          notify.success('Teleconsultation facility settings saved successfully.');
        }
        await refreshClinic();
      } catch (ex: any) {
        setAutoSaveStatus('error');
        notify.error(ex?.message || 'An unexpected error occurred while saving.');
      } finally {
        setSaving(false);
      }
    },
    [
      enableTeleconsultation,
      recordingPolicy,
      retentionDays,
      consentRequired,
      defaultPolicy,
      defaultFee,
      onSettingsUpdated,
      refreshClinic,
      serializeState,
    ]
  );

  const handleSave = useCallback(() => performSave(false), [performSave]);

  // Debounced auto-save when any setting changes after initial hydration
  useEffect(() => {
    if (isHydratingRef.current || !settings) return;

    const currentSnapshot = serializeState({
      enableTeleconsultation,
      recordingPolicy,
      retentionDays,
      consentRequired,
      defaultPolicy,
      defaultFee,
    });

    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      void performSave(true);
    }, 600);

    return () => clearTimeout(timer);
  }, [
    enableTeleconsultation,
    recordingPolicy,
    retentionDays,
    consentRequired,
    defaultPolicy,
    defaultFee,
    settings,
    serializeState,
    performSave,
  ]);

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
        {/* Workspace Entitlement Lock Banner */}
        {!isWorkspaceTeleconsultEntitled && (
          <View style={styles.lockedBanner} testID="teleconsult-locked-banner">
            <View style={styles.lockedBannerHeader}>
              <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
              <ThemedText variant="smallBold" color={theme.colors.warningText}>
                Workspace Entitlement Required
              </ThemedText>
              <Badge label="Locked in Portal" variant="warning" size="sm" icon="lock" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.lockedBannerText}>
              Teleconsultation is not entitled for this workspace. The workspace owner must first enable Pay-As-You-Go Teleconsultation in the Portal under Billing &amp; Subscriptions before this clinic can activate it.
            </ThemedText>
          </View>
        )}

        {/* Master Teleconsultation Switch */}
        <View style={styles.switchSettingRow}>
          <View style={styles.switchLabelCol}>
            <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
              Clinic Teleconsultation Master Switch
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              {!isWorkspaceTeleconsultEntitled
                ? 'Locked — enable teleconsultation in the Portal first.'
                : 'Enable virtual teleconsultation appointments and video call staging for this facility.'}
            </ThemedText>
          </View>
          <Pressable
            data-testid="toggle-clinic-teleconsult-enabled"
            testID="toggle-clinic-teleconsult-enabled"
            accessibilityRole="switch"
            accessibilityLabel="Enable Teleconsultation for this Clinic"
            accessibilityState={{
              checked: enableTeleconsultation,
              disabled: !isWorkspaceTeleconsultEntitled,
            }}
            disabled={!isWorkspaceTeleconsultEntitled}
            onPress={() => {
              if (isWorkspaceTeleconsultEntitled) {
                setEnableTeleconsultation((prev) => !prev);
              }
            }}
            style={styles.switchHitTarget}
          >
            <View
              style={[
                styles.switchTrack,
                !isWorkspaceTeleconsultEntitled
                  ? styles.switchTrackDisabled
                  : enableTeleconsultation
                  ? styles.switchTrackOn
                  : styles.switchTrackOff,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  enableTeleconsultation && isWorkspaceTeleconsultEntitled
                    ? styles.switchThumbOn
                    : styles.switchThumbOff,
                ]}
              />
            </View>
          </Pressable>
        </View>

        {/* Dependent Settings (disabled when teleconsultation is off or locked) */}
        <View
          testID="teleconsult-dependent-settings"
          pointerEvents={settingsDisabled ? 'none' : 'auto'}
          style={[styles.dependentSettings, settingsDisabled && styles.dependentSettingsDisabled]}
        >
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
                  disabled={settingsDisabled}
                  onPress={() => setDefaultPolicy(pol)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: settingsDisabled }}
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
              editable={!settingsDisabled}
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
                  disabled={settingsDisabled}
                  onPress={() => setRecordingPolicy(opt.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: isSelected, disabled: settingsDisabled }}
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
              editable={!settingsDisabled}
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
        <View style={styles.switchSettingRow} testID="setting-consent-required">
          <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.accessibilityValue}>
            {String(consentRequired)}
          </ThemedText>
          <View style={styles.switchLabelCol}>
            <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.fieldLabel}>
              Dual Informed Consent Requirement
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Require patient acceptance before recording starts.
            </ThemedText>
          </View>
          <Pressable
            disabled={settingsDisabled}
            onPress={() => setConsentRequired((prev) => !prev)}
            accessibilityRole="switch"
            accessibilityState={{ checked: consentRequired, disabled: settingsDisabled }}
            accessibilityLabel="Require Dual-Party Consent"
            style={styles.switchHitTarget}
          >
            <View
              style={[
                styles.switchTrack,
                settingsDisabled
                  ? styles.switchTrackDisabled
                  : consentRequired
                  ? styles.switchTrackOn
                  : styles.switchTrackOff,
              ]}
            >
              <View
                style={[
                  styles.switchThumb,
                  consentRequired ? styles.switchThumbOn : styles.switchThumbOff,
                ]}
              />
            </View>
          </Pressable>
        </View>
        </View>

        {/* Auto-Save Status */}
        <View style={styles.saveActionRow}>
          <View style={styles.autoSaveIndicator} testID="teleconsult-autosave-status">
            {autoSaveStatus === 'saving' ? (
              <>
                <Icon name="clock" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Saving changes...
                </ThemedText>
              </>
            ) : autoSaveStatus === 'saved' && lastSavedAt ? (
              <>
                <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.successText} />
                <ThemedText variant="caption" color={theme.colors.successText}>
                  Last saved at{' '}
                  {lastSavedAt.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </ThemedText>
              </>
            ) : autoSaveStatus === 'error' ? (
              <>
                <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.warningText} />
                <ThemedText variant="caption" color={theme.colors.warningText}>
                  Auto-save failed.
                </ThemedText>
              </>
            ) : (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Changes auto-save automatically
              </ThemedText>
            )}
          </View>

          {autoSaveStatus === 'error' ? (
            <Button
              variant="outline"
              size="sm"
              icon="save"
              title="Retry"
              accessibilityLabel="Retry saving teleconsultation settings"
              onPress={handleSave}
              loading={saving}
            />
          ) : null}
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
  switchSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  switchLabelCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  switchHitTarget: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackOn: {
    backgroundColor: theme.colors.primary,
  },
  switchTrackOff: {
    backgroundColor: theme.colors.border,
  },
  switchTrackDisabled: {
    backgroundColor: theme.colors.borderLight,
    opacity: 0.6,
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  switchThumbOn: {
    alignSelf: 'flex-end',
  },
  switchThumbOff: {
    alignSelf: 'flex-start',
  },
  lockedBanner: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  lockedBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  lockedBannerText: {
    marginTop: theme.spacing.xs,
  },
  dependentSettings: {
    gap: theme.spacing.lg,
  },
  dependentSettingsDisabled: {
    opacity: 0.5,
  },
  saveActionRow: {
    paddingTop: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  autoSaveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  saveButton: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
});
