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
          notify.error(err?.message || 'Could not update PhilHealth YAKAP FPE facilitator setting.');
          return;
        }
        notify.success(
          nextVal
            ? 'Authorized Nurse/Midwife facilitator enabled for PhilHealth YAKAP FPE sign-off.'
            : 'PhilHealth YAKAP FPE sign-off restricted to Physicians.'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setAllowNurseMidwifeFpe(!nextVal);
        notify.error('Failed to update PhilHealth YAKAP FPE facilitator setting.');
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
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formCipherKey, setFormCipherKey] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('/soap/konsulta');

  const baselineAccreditation = settings?.accreditationNumber || accreditationNumber || '';
  const baselinePmcc = settings?.pmccNumber || '';
  const baselineCertId = settings?.softwareCertificateId || '';
  const baselineEndpoint = settings?.konsultaEndpoint || '/soap/konsulta';
  const isOverrideDirty =
    formAccreditation !== baselineAccreditation ||
    formPmcc !== baselinePmcc ||
    formCertId !== baselineCertId ||
    formUsername.trim().length > 0 ||
    formPassword.length > 0 ||
    formCipherKey.trim().length > 0 ||
    formEndpoint !== baselineEndpoint;

  const handleOpenOverrideModal = () => {
    setFormAccreditation(settings?.accreditationNumber || accreditationNumber || '');
    setFormPmcc(settings?.pmccNumber || '');
    setFormCertId(settings?.softwareCertificateId || '');
    setFormUsername('');
    setFormPassword('');
    setFormCipherKey('');
    setFormEndpoint(settings?.konsultaEndpoint || '/soap/konsulta');
    setOverrideModalVisible(true);
  };

  const handleSaveOverride = async () => {
    if (!formAccreditation.trim()) {
      notify.error('PhilHealth Accreditation Number is required.');
      return;
    }
    if (!formPmcc.trim()) {
      notify.error('PhilHealth PMCC Number is required.');
      return;
    }
    if (!formCertId.trim()) {
      notify.error('PhilHealth Software Certificate ID is required.');
      return;
    }

    setSavingOverride(true);
    const [saved, error] = await clinicService.overridePhilHealthSettings({
      accreditationNumber: formAccreditation.trim(),
      pmccNumber: formPmcc.trim(),
      softwareCertificateId: formCertId.trim(),
      username: formUsername.trim(),
      password: formPassword,
      cipherKey: formCipherKey.trim(),
      konsultaEndpoint: formEndpoint.trim() || '/soap/konsulta',
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
          title="PhilHealth Konsulta & eClaims Accreditation"
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
                  ? 'This facility is accredited and cryptographic PhilHealth credentials are configured for Konsulta reimbursement.'
                  : hasAccreditation
                  ? 'Accreditation number entered, but PhilHealth cryptographic credentials are still pending configuration.'
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
              label="Konsulta Benefit Package"
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
              <InfoRow label="PMCC Number" value={settings.pmccNumber} />
            ) : null}
            {settings?.softwareCertificateId ? (
              <InfoRow label="Software Certificate ID" value={settings.softwareCertificateId} />
            ) : null}
            <InfoRow
              label="Electronic Claims Engine"
              value="Clinic EZ Yakap eClaims v2.4 (Compliant)"
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
                label="Branch PMCC Number"
                value={settings?.branchPmccNumber || 'Not configured'}
              />
              <InfoRow
                label="Branch Software Certificate"
                value={settings?.branchSoftwareCertificateId || 'Not configured'}
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

      {/* PhilHealth YAKAP FPE Facilitator Authority */}
      <Card testID="philhealth-yakap-fpe-facilitator-card">
        <CardHeader
          icon="heartPulse"
          title="PhilHealth YAKAP FPE Facilitator Authority"
          subtitle="Control whether authorized nurses or midwives can finalize and sign off PhilHealth YAKAP First Patient Encounters"
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
                  Allow authorized Nurse/Midwife facilitator for PhilHealth YAKAP FPE
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  When disabled (default), YAKAP FPE screenings route from Nursing to a Physician for Station 3 Physical Exam and Station 4 Sign-Off. When enabled, authorized nurses and midwives can complete YAKAP FPE encounters as Facilitator Type H per PCAPI v2.0.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={allowNurseMidwifeFpe}
                onValueChange={handleToggleNurseMidwifeFacilitator}
                accessibilityLabel="Allow authorized Nurse/Midwife facilitator for PhilHealth YAKAP FPE"
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
            label="PMCC Number"
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
            label="PhilHealth Portal Username (Optional)"
            placeholder="Username for SOAP auth"
            value={formUsername}
            onChangeText={setFormUsername}
          />
          <Input
            label="PhilHealth Portal Password (Optional)"
            placeholder="Password for SOAP auth"
            value={formPassword}
            onChangeText={setFormPassword}
            secureTextEntry
          />
          <Input
            label="Custom Cipher Key (Optional)"
            placeholder="Leave empty for standard encryption key"
            value={formCipherKey}
            onChangeText={setFormCipherKey}
            secureTextEntry
          />
          <Input
            label="Konsulta SOAP Endpoint (Optional)"
            placeholder="/soap/konsulta"
            value={formEndpoint}
            onChangeText={setFormEndpoint}
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
