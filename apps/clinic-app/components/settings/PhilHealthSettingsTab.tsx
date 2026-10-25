import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import PhilHealthCatalogSection from './PhilHealthCatalogSection';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { InfoRow } from './common';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';

export interface PhilHealthSettingsTabProps {
  accreditationNumber: string;
  clinicName: string;
  settings?: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
}

export default function PhilHealthSettingsTab({
  accreditationNumber,
  clinicName,
  settings,
  onSettingsUpdated,
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

  // Override Modal form states
  const [formAccreditation, setFormAccreditation] = useState('');
  const [formPmcc, setFormPmcc] = useState('');
  const [formCertId, setFormCertId] = useState('');
  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formCipherKey, setFormCipherKey] = useState('');
  const [formEndpoint, setFormEndpoint] = useState('/soap/konsulta');

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
            <Button
              title={savingOverride ? 'Verifying & Saving...' : 'Save & Apply Override'}
              variant="primary"
              onPress={handleSaveOverride}
              disabled={savingOverride}
            />
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
});
