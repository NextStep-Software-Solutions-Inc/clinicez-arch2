import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { SkeletonList } from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { Card, CardContent, CardHeader } from '../ui/Card';
import PhilHealthCatalogSection from './PhilHealthCatalogSection';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { InfoRow } from './common';
import { clinicService, ClinicSettingsRecord, ClinicServiceItem } from '../../services/clinicService';
import { resolveEffectivePhilHealthConnectionUrl } from '../../utils/philhealthError';

export interface PhilHealthSettingsTabProps {
  accreditationNumber: string;
  clinicName: string;
  settings?: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  services?: ClinicServiceItem[];
  servicesLoadError?: string | null;
  showSkeletons?: boolean;
  settingsLoadError?: string | null;
  onRetrySettings?: () => Promise<void> | void;
  onRefreshServices?: () => Promise<void>;
}

export default function PhilHealthSettingsTab({
  accreditationNumber,
  clinicName,
  settings,
  onSettingsUpdated,
  showSkeletons = false,
  settingsLoadError = null,
  onRetrySettings,
}: PhilHealthSettingsTabProps) {
  const isConfigured = Boolean(settings?.isPhilHealthConfigured);
  const hasAccreditation = Boolean(accreditationNumber?.trim());
  const isOverridden = Boolean(settings?.isPhilHealthOverridden);
  const hasBranch = Boolean(
    settings?.branchId ||
    settings?.branchName ||
    settings?.branchPhilHealthAccreditationNumber
  );
  const effectiveConnectionUrl = resolveEffectivePhilHealthConnectionUrl(settings);
  const isSandboxConnectionUrl =
    effectiveConnectionUrl.toLowerCase().includes('sandbox') ||
    effectiveConnectionUrl.toLowerCase().includes('simulator');

  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [allowNurseMidwifeFpe, setAllowNurseMidwifeFpe] = useState<boolean>(
    Boolean(settings?.allowNurseMidwifeYakapFpeFacilitator)
  );
  const [savingFacilitator, setSavingFacilitator] = useState(false);

  useEffect(() => {
    if (settings) {
      setAllowNurseMidwifeFpe(Boolean(settings.allowNurseMidwifeYakapFpeFacilitator));
    }
  }, [settings]);

  const handleToggleNurseMidwifeFacilitator = useCallback(
    async (nextVal: boolean) => {
      if (savingFacilitator) return;
      setAllowNurseMidwifeFpe(nextVal);
      setSavingFacilitator(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          allowNurseMidwifeYakapFpeFacilitator: nextVal,
        });
        if (err || !updated) {
          setAllowNurseMidwifeFpe(!nextVal);
          notify.error(err?.message || 'Could not update PhilHealth Annual Checkup sign-off setting.');
          return;
        }
        notify.success(
          nextVal
            ? 'Authorized Nurse/Midwife sign-off enabled for PhilHealth Annual Checkups.'
            : 'PhilHealth Annual Checkup sign-off restricted to Physicians.'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setAllowNurseMidwifeFpe(!nextVal);
        notify.error('Failed to update PhilHealth Annual Checkup sign-off setting.');
      } finally {
        setSavingFacilitator(false);
      }
    },
    [onSettingsUpdated, savingFacilitator]
  );

  // Override Modal form states
  const [formAccreditation, setFormAccreditation] = useState('');
  const [formPmcc, setFormPmcc] = useState('');
  const [formCertId, setFormCertId] = useState('');
  const [formSecretKey, setFormSecretKey] = useState('');
  const [formCipherKey, setFormCipherKey] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('');

  const baselineAccreditation = settings?.accreditationNumber || accreditationNumber || '';
  const baselinePmcc = settings?.pmccNumber || '';
  const baselineCertId = settings?.softwareCertificateId || '';
  const baselineEndpoint = settings?.philHealthBaseUrl || '';
  const isOverrideDirty =
    formAccreditation !== baselineAccreditation ||
    formPmcc !== baselinePmcc ||
    formCertId !== baselineCertId ||
    formSecretKey.trim().length > 0 ||
    formCipherKey.trim().length > 0 ||
    formEndpoint !== baselineEndpoint;

  const handleOpenOverrideModal = () => {
    setFormAccreditation(settings?.accreditationNumber || accreditationNumber || '');
    setFormPmcc(settings?.pmccNumber || '');
    setFormCertId(settings?.softwareCertificateId || '');
    setFormSecretKey('');
    setFormCipherKey('');
    setFormEndpoint(settings?.philHealthBaseUrl || '');
    setOverrideModalVisible(true);
  };

  const handleSaveOverride = async () => {
    if (!formAccreditation.trim()) {
      notify.error('PhilHealth Accreditation Number is required.');
      return;
    }
    if (!formPmcc.trim()) {
      notify.error('PhilHealth Facility Code is required.');
      return;
    }
    if (!formCertId.trim()) {
      notify.error('PhilHealth Software Certificate ID is required.');
      return;
    }
    const trimmedEndpoint = formEndpoint.trim();
    const effectiveOverrideUrl =
      trimmedEndpoint ||
      settings?.branchPhilHealthBaseUrl?.trim() ||
      settings?.philHealthBaseUrl?.trim() ||
      '';
    if (!effectiveOverrideUrl) {
      notify.error('PhilHealth Connection URL is required when no branch baseline URL is configured.');
      return;
    }
    if (trimmedEndpoint) {
      try {
        const parsed = new URL(trimmedEndpoint);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          notify.error('PhilHealth Connection URL must start with HTTP or HTTPS.');
          return;
        }
      } catch {
        notify.error('Enter a valid PhilHealth Connection URL.');
        return;
      }
    }

    setSavingOverride(true);
    const [saved, error] = await clinicService.overridePhilHealthSettings({
      accreditationNumber: formAccreditation.trim(),
      pmccNumber: formPmcc.trim(),
      softwareCertificateId: formCertId.trim(),
      secretKey: formSecretKey.trim() || undefined,
      cipherKey: formCipherKey.trim() || undefined,
      baseUrl: formEndpoint.trim() || undefined,
    });
    setSavingOverride(false);

    if (error || !saved) {
      notify.error(error?.message || 'Failed to configure override PhilHealth credentials.');
      return;
    }

    setOverrideModalVisible(false);
    notify.success('PhilHealth credentials overridden and verified successfully.');
    onSettingsUpdated?.(saved);
  };

  const handleRevertToBranch = async () => {
    setReverting(true);
    const [saved, error] = await clinicService.revertPhilHealthToBranch();
    setReverting(false);

    if (error || !saved) {
      notify.error(error?.message || 'Failed to revert PhilHealth credentials to branch baseline.');
      return;
    }

    notify.success('Reverted to branch baseline PhilHealth credentials.');
    onSettingsUpdated?.(saved);
  };

  return (
    <View style={styles.container}>
      {/* PhilHealth Facility Accreditation Overview */}
      <Card>
        <CardHeader
          title="PhilHealth YAKAP Accreditation"
          subtitle="Accreditation credentials and eClaims electronic submission status"
        />
        <CardContent>
          <View style={styles.statusRow}>
            <View style={styles.statusInfo}>
              <View style={styles.titleWithBadge}>
                <ThemedText variant="bodyBold">Accreditation Status</ThemedText>
                <Badge
                  label={
                    isConfigured
                      ? 'Accredited HCI'
                      : hasAccreditation
                      ? 'Credentials Pending'
                      : 'Accreditation Required'
                  }
                  variant={isConfigured ? 'success' : 'warning'}
                  size="md"
                />
                {hasBranch && (
                  <Badge
                    label={isOverridden ? 'Clinic Override' : 'Inherited from Branch'}
                    variant={isOverridden ? 'warning' : 'info'}
                    size="md"
                  />
                )}
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {isConfigured
                  ? 'This facility is accredited and its PhilHealth credentials are configured for Annual Checkup coverage.'
                  : hasAccreditation
                  ? 'Accreditation number entered, but PhilHealth access credentials are still pending setup.'
                  : 'Enter your DOH/PhilHealth accreditation number in General Settings or inherit branch baseline credentials.'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.detailsList}>
            <InfoRow
              label="Accredited Facility Name"
              value={clinicName || 'Not configured'}
            />
            <InfoRow
              label="PhilHealth Accreditation No."
              value={accreditationNumber || settings?.accreditationNumber || 'Not set'}
              valueColor={isConfigured ? theme.colors.primary : theme.colors.textMuted}
            />
            <InfoRow
              label="PhilHealth Annual Checkup Package"
              value={
                isConfigured
                  ? 'Active'
                  : hasAccreditation
                  ? 'Credentials Pending'
                  : 'Pending Accreditation'
              }
              valueColor={isConfigured ? theme.colors.successText : theme.colors.warningText}
            />
            {settings?.pmccNumber ? (
              <InfoRow label="PhilHealth Facility Code" value={settings.pmccNumber} />
            ) : null}
            {settings?.softwareCertificateId ? (
              <InfoRow label="Software Certificate ID" value={settings.softwareCertificateId} />
            ) : null}
            <InfoRow
              label="PhilHealth Connection URL"
              value={effectiveConnectionUrl || 'Not configured'}
              valueColor={effectiveConnectionUrl ? theme.colors.primary : theme.colors.emergencyText}
            />
            <InfoRow
              label="PhilHealth Connection"
              value={
                !effectiveConnectionUrl
                  ? 'Connection URL Required'
                  : isSandboxConnectionUrl
                    ? 'Sandbox / Test Mode'
                    : 'PhilHealth YAKAP Ready'
              }
              valueColor={
                !effectiveConnectionUrl
                  ? theme.colors.emergencyText
                  : isSandboxConnectionUrl
                    ? theme.colors.warningText
                    : theme.colors.successText
              }
            />
          </View>

          <View style={styles.actionsRow}>
            <Button
              title="Override PhilHealth Credentials"
              variant="outline"
              size="sm"
              onPress={handleOpenOverrideModal}
            />
            {hasBranch && isOverridden && (
              <Button
                title={reverting ? 'Reverting...' : 'Revert to Branch Baseline'}
                variant="secondary"
                size="sm"
                disabled={reverting}
                onPress={handleRevertToBranch}
              />
            )}
          </View>
        </CardContent>
      </Card>

      {/* Head Office / Branch Baseline Card */}
      {hasBranch && (
        <Card>
          <CardHeader
            title="Head Office / Branch Baseline"
            subtitle="Central workspace branch PhilHealth credentials and pre-boot inheritance"
          />
          <CardContent>
            <View style={styles.detailsList}>
              <InfoRow
                label="Assigned Branch"
                value={settings?.branchName || 'Central Branch'}
              />
              <InfoRow
                label="Branch Accreditation No."
                value={settings?.branchPhilHealthAccreditationNumber || 'Not set'}
                valueColor={
                  settings?.isBranchPhilHealthAccredited
                    ? theme.colors.primary
                    : theme.colors.textMuted
                }
              />
              <InfoRow
                label="Branch Facility Code"
                value={settings?.branchPmccNumber || 'Not configured'}
              />
              <InfoRow
                label="Branch Software Certificate"
                value={settings?.branchSoftwareCertificateId || 'Not configured'}
              />
              <InfoRow
                label="Branch Connection URL"
                value={settings?.branchPhilHealthBaseUrl || 'Not configured'}
              />
              <InfoRow
                label="Branch Accreditation Status"
                value={
                  settings?.isBranchPhilHealthAccredited
                    ? 'Accredited Branch'
                    : 'Unaccredited Branch'
                }
                valueColor={
                  settings?.isBranchPhilHealthAccredited
                    ? theme.colors.successText
                    : theme.colors.warningText
                }
              />
              <InfoRow
                label="Inheritance State"
                value={
                  isOverridden
                    ? 'Bypassed (Facility uses explicit override credentials)'
                    : 'Active (Facility automatically inherits branch baseline)'
                }
                valueColor={
                  isOverridden ? theme.colors.warningText : theme.colors.infoText
                }
              />
            </View>
          </CardContent>
        </Card>
      )}

      {/* PhilHealth Annual Checkup Sign-Off Authority */}
      <Card testID="philhealth-yakap-fpe-facilitator-card">
        <CardHeader
          icon="heartPulse"
          title="PhilHealth Annual Checkup Sign-Off"
          subtitle="Control whether authorized nurses or midwives can finalize and sign off PhilHealth Annual Checkups"
          rightAction={
            <Badge
              label={allowNurseMidwifeFpe ? 'Nurse/Midwife Enabled' : 'Physician Sign-Off Only'}
              variant={allowNurseMidwifeFpe ? 'success' : 'neutral'}
              size="sm"
            />
          }
        />
        <CardContent>
          {showSkeletons ? (
            <SkeletonList rows={2} />
          ) : settingsLoadError && !settings ? (
            <ErrorState
              compact
              title="Settings unavailable"
              message={settingsLoadError}
              onRetry={onRetrySettings ? () => void onRetrySettings() : undefined}
            />
          ) : (
            <View style={styles.toggleRow}>
              <View style={styles.toggleTextContainer}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Allow authorized Nurse/Midwife sign-off for PhilHealth Annual Checkups
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  When disabled (default), PhilHealth annual checkups route from Nursing to a Physician for Step 3 Physical Exam and Step 4 Sign-Off. When enabled, authorized nurses and midwives can complete the checkup sign-off directly.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={allowNurseMidwifeFpe}
                onValueChange={handleToggleNurseMidwifeFacilitator}
                accessibilityLabel="Allow authorized Nurse/Midwife sign-off for PhilHealth Annual Checkups"
              />
            </View>
          )}
        </CardContent>
      </Card>

      {/* Official PhilHealth Master Catalog & Release Kits */}
      <PhilHealthCatalogSection />

      {/* Override Credentials Modal */}
      <Modal
        visible={overrideModalVisible}
        onClose={() => setOverrideModalVisible(false)}
        title="Override PhilHealth Credentials"
        subtitle="Configure explicit clinic-level credentials that take precedence over the branch baseline."
        footer={
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={() => setOverrideModalVisible(false)}
              disabled={savingOverride}
            />
            {isOverrideDirty || savingOverride ? (
              <Button
                title={savingOverride ? 'Verifying & Saving...' : 'Save & Apply Override'}
                variant="primary"
                onPress={handleSaveOverride}
                disabled={savingOverride}
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.modalBody}>
          <Input
            label="PhilHealth Accreditation Number"
            placeholder="e.g. P123456789"
            value={formAccreditation}
            onChangeText={setFormAccreditation}
            required
          />
          <Input
            label="PhilHealth Facility Code"
            placeholder="e.g. 123456"
            value={formPmcc}
            onChangeText={setFormPmcc}
            required
          />
          <Input
            label="Software Certificate ID"
            placeholder="e.g. CERT-2026-XXXX"
            value={formCertId}
            onChangeText={setFormCertId}
            required
          />
          <Input
            label="Access Secret (Optional)"
            placeholder="Secret provided by PhilHealth"
            value={formSecretKey}
            onChangeText={setFormSecretKey}
            secureTextEntry
          />
          <Input
            label="Record Encryption Key (Optional)"
            placeholder="Leave empty to keep existing encryption key"
            value={formCipherKey}
            onChangeText={setFormCipherKey}
            secureTextEntry
          />
          <Input
            label="PhilHealth Connection URL"
            placeholder={
              settings?.branchPhilHealthBaseUrl?.trim()
                ? `Leave empty for branch default (${settings.branchPhilHealthBaseUrl.trim()})`
                : 'Enter your PhilHealth YAKAP gateway address'
            }
            value={formEndpoint}
            onChangeText={setFormEndpoint}
            required={!settings?.branchPhilHealthBaseUrl?.trim() && !settings?.philHealthBaseUrl?.trim()}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  statusInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  detailsList: {
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    flexWrap: 'wrap',
  },
  modalBody: {
    gap: theme.spacing.md,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  toggleTextContainer: {
    flex: 1,
    gap: theme.spacing.xs,
  },
});
