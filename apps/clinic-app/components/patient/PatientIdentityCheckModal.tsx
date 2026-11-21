import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { Modal, ThemedText, Button, Icon, Badge, Input, Select } from '@ui';
import { theme } from '@constants/theme';
import { notify } from '../../utils/feedback';
import { useClinic } from '../../context/ClinicContext';
import {
  formatPhilHealthServerError,
  isMissingPhilHealthConnectionUrlKnown,
  MISSING_CONNECTION_URL_MESSAGE,
} from '../../utils/philhealthError';
import {
  clinicService,
  type YakapIdentityVerificationDto,
  type YakapPcuStartResultDto,
} from '../../services/clinicService';

export type IdentityCheckMethod = 'pcu' | 'otp' | 'valid_id';

export const VALID_ID_TYPE_OPTIONS = [
  { label: 'PhilSys / National ID', value: 'P02' },
  { label: 'PhilHealth ID', value: 'P01' },
  { label: "Driver's License", value: 'P04' },
  { label: 'Philippine Passport', value: 'P03' },
  { label: 'UMID / SSS ID', value: 'P05' },
  { label: 'Senior Citizen ID', value: 'P07' },
  { label: 'PWD ID', value: 'P08' },
  { label: 'PRC License ID', value: 'P09' },
  { label: 'Postal ID', value: 'P10' },
  { label: 'Other Government ID', value: 'P99' },
];

export interface PatientIdentityCheckModalProps {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  patientName: string;
  philHealthPin?: string | null;
  initialMethod?: IdentityCheckMethod;
  onVerified?: (verification: YakapIdentityVerificationDto) => void;
}

export default function PatientIdentityCheckModal({
  visible,
  onClose,
  patientId,
  patientName,
  philHealthPin,
  initialMethod = 'pcu',
  onVerified,
}: PatientIdentityCheckModalProps) {
  const { settings: clinicSettings } = useClinic();
  const [method, setMethod] = useState<IdentityCheckMethod>(initialMethod);
  const [consent, setConsent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Face Scan state
  const [scanSession, setScanSession] = useState<YakapPcuStartResultDto | null>(null);

  // Text Code (OTP) state
  const [textCode, setTextCode] = useState('');

  // Photo ID state
  const [idTypeCode, setIdTypeCode] = useState('P02');
  const [idNumber, setIdNumber] = useState('');

  useEffect(() => {
    if (visible) {
      setMethod(initialMethod);
      setConsent(true);
      setSubmitting(false);
      setErrorText(null);
      setScanSession(null);
      setTextCode('');
      setIdNumber('');
    }
  }, [visible, initialMethod]);

  const handleStartFaceScan = async () => {
    if (!consent) {
      setErrorText('Please confirm patient consent before continuing.');
      return;
    }
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      setErrorText(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      const [started, err] = await clinicService.startPatientPcuSession(patientId);
      if (err || !started) {
        setErrorText(
          formatPhilHealthServerError(
            err,
            clinicSettings,
            'Unable to start face scan right now. You can use Text Code or Photo ID instead.'
          )
        );
        return;
      }
      setScanSession(started);
      notify.info('Face scan link is ready. Open it for the patient, then tap Confirm Face Scan.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmFaceScan = async () => {
    if (!consent) {
      setErrorText('Please confirm patient consent before continuing.');
      return;
    }
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      setErrorText(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      const [verified, err] = await clinicService.verifyPatientPcuSession(patientId, {
        verificationId: scanSession?.verificationId,
        livenessAuthorizationId: scanSession?.livenessAuthorizationId,
      });
      if (err || !verified) {
        setErrorText(
          formatPhilHealthServerError(
            err,
            clinicSettings,
            'Face scan is not yet confirmed. Please have the patient finish the scan or try Text Code / Photo ID.'
          )
        );
        return;
      }
      notify.success('Patient identity confirmed by face scan.');
      onVerified?.(verified);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmTextCode = async () => {
    if (!consent) {
      setErrorText('Please confirm patient consent before continuing.');
      return;
    }
    if (isMissingPhilHealthConnectionUrlKnown(clinicSettings)) {
      setErrorText(MISSING_CONNECTION_URL_MESSAGE);
      return;
    }
    const cleanCode = textCode.trim();
    if (!cleanCode) {
      setErrorText('Enter the 6-digit text verification code from the patient.');
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      const [verified, err] = await clinicService.validatePatientOtp(patientId, {
        oneTimePin: cleanCode,
        consent,
      });
      if (err || !verified) {
        setErrorText(
          formatPhilHealthServerError(
            err,
            clinicSettings,
            'That code could not be verified. Please double-check the digits and try again.'
          )
        );
        return;
      }
      notify.success('Patient identity confirmed by text code.');
      onVerified?.(verified);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleSavePhotoId = async () => {
    if (!consent) {
      setErrorText('Please confirm patient consent before continuing.');
      return;
    }
    if (!idTypeCode) {
      setErrorText('Select the government ID presented by the patient.');
      return;
    }
    setErrorText(null);
    setSubmitting(true);
    try {
      const [verified, err] = await clinicService.recordPatientValidId(patientId, {
        validIdTypeCode: idTypeCode,
        validIdNumber: idNumber.trim() || undefined,
        consent,
      });
      if (err || !verified) {
        setErrorText(err?.message || 'Could not save photo ID verification.');
        return;
      }
      notify.success('Photo ID identity check recorded.');
      onVerified?.(verified);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenScanUrl = () => {
    if (!scanSession?.sdkUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(scanSession.sdkUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(scanSession.sdkUrl).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title="Confirm Patient Identity"
      subtitle={`${patientName}${philHealthPin ? ` · PhilHealth PIN ${philHealthPin}` : ''}`}
      maxWidth={540}
      testID="patient-identity-check-modal"
      footer={
        <View style={styles.footerRow}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            disabled={submitting}
            testID="identity-check-cancel-btn"
          />
          {method === 'pcu' ? (
            scanSession ? (
              <Button
                title={submitting ? 'Checking...' : 'Check Face Scan Result'}
                variant="primary"
                onPress={handleConfirmFaceScan}
                disabled={submitting}
                testID="identity-check-verify-pcu-btn"
              />
            ) : (
              <Button
                title={submitting ? 'Starting...' : 'Start Face Scan'}
                variant="primary"
                onPress={handleStartFaceScan}
                disabled={submitting}
                testID="identity-check-start-pcu-btn"
              />
            )
          ) : method === 'otp' ? (
            <Button
              title={submitting ? 'Checking...' : 'Confirm Code'}
              variant="primary"
              onPress={handleConfirmTextCode}
              disabled={submitting}
              testID="identity-check-verify-otp-btn"
            />
          ) : (
            <Button
              title={submitting ? 'Saving...' : 'Save Photo ID Check'}
              variant="primary"
              onPress={handleSavePhotoId}
              disabled={submitting}
              testID="identity-check-save-id-btn"
            />
          )}
        </View>
      }
    >
      <View style={styles.body}>
        <ThemedText variant="small" color={theme.colors.textSecondary}>
          PhilHealth requires confirming that the patient is physically present before assigning their clinic or completing an annual checkup.
        </ThemedText>

        {/* Method Selector */}
        <View style={styles.methodGrid}>
          {(
            [
              { key: 'pcu', label: 'Face Scan', hint: 'Camera check', icon: 'camera' as const },
              { key: 'otp', label: 'Text Code (OTP)', hint: '6-digit SMS code', icon: 'phone' as const },
              { key: 'valid_id', label: 'Photo ID', hint: 'In-person fallback', icon: 'patientVerified' as const },
            ] as const
          ).map((item) => {
            const active = method === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setMethod(item.key);
                  setErrorText(null);
                }}
                style={[styles.methodCard, active && styles.methodCardActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`identity-method-${item.key}`}
              >
                <Icon
                  name={item.icon}
                  size={theme.sizes.iconMd}
                  color={active ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant="smallBold"
                  color={active ? theme.colors.primaryDark : theme.colors.text}
                >
                  {item.label}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {item.hint}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Consent Confirmation */}
        <Pressable
          onPress={() => setConsent((prev) => !prev)}
          style={styles.consentRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consent }}
          testID="identity-check-consent-toggle"
        >
          <View style={[styles.checkbox, consent && styles.checkboxChecked]}>
            {consent ? <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.textInverted} /> : null}
          </View>
          <View style={styles.flexOne}>
            <ThemedText variant="smallBold" color={theme.colors.text}>
              Patient consent confirmed
            </ThemedText>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              The patient agrees to share their PhilHealth identity check for today&apos;s clinic visit.
            </ThemedText>
          </View>
        </Pressable>

        {/* Active Method Panel */}
        {method === 'pcu' ? (
          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Live Face Scan
              </ThemedText>
              <Badge label={scanSession ? 'Ready to Scan' : 'Recommended'} variant="info" size="sm" />
            </View>
            {!scanSession ? (
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                Tap Start Face Scan to open the PhilHealth camera check. Ask the patient to look straight at the camera in good lighting.
              </ThemedText>
            ) : (
              <View style={styles.scanStartedBox}>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  Reference ID: <ThemedText variant="smallBold" color={theme.colors.text}>{scanSession.livenessAuthorizationId}</ThemedText>
                </ThemedText>
                <Button
                  title="Open Face Scan Link"
                  variant="outline"
                  size="sm"
                  onPress={handleOpenScanUrl}
                  testID="identity-check-open-scan-url-btn"
                />
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Once the scan finishes, tap Check Face Scan Result below.
                </ThemedText>
              </View>
            )}
          </View>
        ) : method === 'otp' ? (
          <View style={styles.panel}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              6-Digit Text Code
            </ThemedText>
            <Input
              label="Verification Code"
              placeholder="Enter 6-digit code from patient's phone"
              value={textCode}
              onChangeText={setTextCode}
              keyboardType="number-pad"
              maxLength={12}
              testID="identity-check-otp-input"
            />
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Ask the patient for the one-time text code sent by PhilHealth to their registered mobile number.
            </ThemedText>
          </View>
        ) : (
          <View style={styles.panel}>
            <ThemedText variant="bodyBold" color={theme.colors.text}>
              Government Photo ID Check
            </ThemedText>
            <Select
              label="ID Type"
              value={idTypeCode}
              options={VALID_ID_TYPE_OPTIONS}
              onSelect={setIdTypeCode}
              allowCustom={false}
            />
            <Input
              label="ID Number (Optional)"
              placeholder="Last 4 digits or reference number"
              value={idNumber}
              onChangeText={setIdNumber}
              testID="identity-check-id-number-input"
            />
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Use this when camera scan and text code are not possible (for example, lost phone or weak mobile signal).
            </ThemedText>
          </View>
        )}

        {errorText ? (
          <View style={styles.errorBanner}>
            <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flexOne}>
              {errorText}
            </ThemedText>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: theme.spacing.md,
  },
  flexOne: {
    flex: 1,
  },
  methodGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  methodCard: {
    flex: 1,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  methodCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  panel: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  scanStartedBox: {
    gap: theme.spacing.sm,
    alignItems: 'flex-start',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.emergencyBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
});
