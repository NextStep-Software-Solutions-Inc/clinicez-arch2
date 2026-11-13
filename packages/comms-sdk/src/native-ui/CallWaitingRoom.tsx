import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  fontSizeScale,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import { CallWaitingRoomProps } from './types';

export const CallWaitingRoom: React.FC<CallWaitingRoomProps> = ({
  callId,
  appointmentId,
  userRole,
  patientName,
  clinicianName,
  scheduledTime,
  paymentPolicy,
  paymentStatus,
  hasActiveYakapEnlistment,
  isYakapExempt,
  onChangePaymentPolicy,
  onStaffPaymentOverride,
  onEmergencyPaymentOverride,
  isReadyToAdmit,
  recordingConsentStatus,
  onAdmitPatient,
  onSubmitConsent,
  onEnterCall,
  onCancelCall,
  isLoading = false,
  error = null,
  style
}) => {
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMicActive, setIsMicActive] = useState(true);
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);

  // YAKAP enlistment is informational; it does NOT automatically exempt prepayment unless legacy isYakapExempt is true
  const isYakapEnlisted = Boolean(hasActiveYakapEnlistment ?? isYakapExempt);
  const isPrepaidBlocked =
    paymentPolicy === 'Prepaid' &&
    paymentStatus === 'Unpaid' &&
    !isYakapExempt;
  const isStaffOrDoctor = userRole === 'Clinician' || userRole === 'Staff';
  const isDoctor = userRole === 'Clinician';

  // Override note validation: reasonNote >= 5 chars
  const trimmedReason = overrideReason.trim();
  const isReasonValid = trimmedReason.length >= 5;
  const canSubmitOverride =
    isReasonValid &&
    !isSubmittingOverride &&
    (Boolean(onStaffPaymentOverride) || Boolean(onEmergencyPaymentOverride));

  const handlePolicyChange = async (newPolicy: 'Prepaid' | 'Postpaid' | 'Exempt') => {
    if (!onChangePaymentPolicy || isUpdatingPolicy || newPolicy === paymentPolicy) return;
    setIsUpdatingPolicy(true);
    try {
      await onChangePaymentPolicy(newPolicy);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!canSubmitOverride) return;
    setIsSubmittingOverride(true);
    try {
      if (onStaffPaymentOverride) {
        await onStaffPaymentOverride(trimmedReason);
      } else if (onEmergencyPaymentOverride) {
        await onEmergencyPaymentOverride(trimmedReason);
      }
      setOverrideModalVisible(false);
      setOverrideReason('');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Teleconsultation Waiting Room</Text>
        <Text style={styles.headerSubtitle}>
          Appointment: {scheduledTime} • ID: {appointmentId || callId}
        </Text>
      </View>

      {/* Content States */}
      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.stateText}>Staging teleconsultation session...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>Hardware or Connection Error</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : (
        <View style={styles.body}>
          {/* Video Preview Box */}
          <View style={styles.previewBox}>
            <View style={styles.videoPlaceholder}>
              <Text style={styles.videoPlaceholderIcon}>{isCameraActive ? 'CAM' : 'OFF'}</Text>
              <Text style={styles.videoPlaceholderText}>
                {isCameraActive ? 'Camera Self-Preview Active' : 'Camera Disabled'}
              </Text>
            </View>

            {/* Audio meter */}
            <View style={styles.audioMeterContainer}>
              <Text style={styles.audioMeterLabel}>Mic Level: </Text>
              <View style={styles.audioMeterBar}>
                <View style={[styles.audioMeterFill, !isMicActive && styles.audioMeterMuted]} />
              </View>
            </View>

            {/* Floating Controls Bar */}
            <View style={styles.mediaBar}>
              <TouchableOpacity
                style={[styles.mediaButton, !isMicActive && styles.mediaButtonOff]}
                onPress={() => setIsMicActive((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
              >
                <Text style={styles.mediaButtonText}>{isMicActive ? 'MIC' : 'MUTE'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mediaButton, !isCameraActive && styles.mediaButtonOff]}
                onPress={() => setIsCameraActive((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={isCameraActive ? 'Stop video' : 'Start video'}
              >
                <Text style={styles.mediaButtonText}>{isCameraActive ? 'CAM' : 'OFF'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Appointment Details Card */}
          <View style={styles.detailsCard}>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Patient:</Text>
              <Text style={styles.detailsValue}>{patientName}</Text>
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>Attending Clinician:</Text>
              <Text style={styles.detailsValue}>{clinicianName}</Text>
            </View>
          </View>

          {/* Informational YAKAP Badge (Non-Mutating) */}
          {isYakapEnlisted && (
            <View style={styles.yakapCard}>
              <View style={styles.yakapBadgeHeader}>
                <View style={styles.yakapPill}>
                  <Text style={styles.yakapPillText}>PHILHEALTH YAKAP</Text>
                </View>
                <Text style={styles.yakapBadgeTitle}>Active Konsulta Enlistment</Text>
              </View>
              <Text style={styles.yakapBadgeDescription}>
                Patient has an active PhilHealth YAKAP enlistment. Staff may adjust the payment policy to Exempt or Postpaid if covered under primary care capitation.
              </Text>
            </View>
          )}

          {/* Staff Payment Policy Selector */}
          {isStaffOrDoctor && onChangePaymentPolicy && (
            <View style={styles.policyCard}>
              <Text style={styles.policyCardTitle}>Facility Payment Policy</Text>
              <View style={styles.policySelectorRow}>
                {(['Prepaid', 'Postpaid', 'Exempt'] as const).map((policy) => {
                  const isSelected = paymentPolicy === policy;
                  return (
                    <TouchableOpacity
                      key={policy}
                      style={[styles.policyOptionButton, isSelected && styles.policyOptionButtonSelected]}
                      onPress={() => handlePolicyChange(policy)}
                      disabled={isUpdatingPolicy || isSelected}
                      accessibilityRole="button"
                      accessibilityLabel={`Set payment policy to ${policy}`}
                    >
                      <Text style={[styles.policyOptionText, isSelected && styles.policyOptionTextSelected]}>
                        {policy}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Payment Gate Banner */}
          {isPrepaidBlocked ? (
            <View style={styles.blockedCard}>
              <Text style={styles.blockedIcon}>LOCK</Text>
              <View style={styles.gateTextContainer}>
                <Text style={styles.blockedTitle}>Prepayment Gate: Settlement Required</Text>
                <Text style={styles.blockedSubtitle}>
                  This consultation is prepaid. Admission will unlock immediately upon cashier or online payment.
                </Text>
                {isStaffOrDoctor && (onStaffPaymentOverride || onEmergencyPaymentOverride) && (
                  <TouchableOpacity
                    style={styles.overrideButton}
                    onPress={() => setOverrideModalVisible(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Open plain-note override modal"
                  >
                    <Text style={styles.overrideButtonText}>Staff Plain-Note Override</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.clearedCard}>
              <Text style={styles.clearedIcon}>OK</Text>
              <View style={styles.gateTextContainer}>
                <Text style={styles.clearedTitle}>
                  {paymentPolicy === 'Exempt' ? 'Admission Cleared (Exempt)' : 'Payment Cleared'}
                </Text>
                <Text style={styles.clearedSubtitle}>
                  {paymentPolicy === 'Exempt'
                    ? 'Consultation is exempt from prepayment. Ready for admission.'
                    : 'Payment confirmed. Ready for consultation.'}
                </Text>
              </View>
            </View>
          )}

          {/* Informed Recording Consent */}
          <View style={styles.consentCard}>
            <Text style={styles.consentTitle}>Informed Recording Disclosure</Text>
            <Text style={styles.consentSubtitle}>
              This teleconsultation may be recorded for medical records under RA 10173 and facility policy.
            </Text>

            <View style={styles.consentActions}>
              <TouchableOpacity
                style={[
                  styles.consentButton,
                  recordingConsentStatus === 'Approved' && styles.consentButtonApproved
                ]}
                onPress={() => onSubmitConsent && onSubmitConsent(true)}
                disabled={recordingConsentStatus === 'Approved'}
                accessibilityRole="button"
                accessibilityLabel="Consent to session recording"
              >
                <Text
                  style={[
                    styles.consentButtonText,
                    recordingConsentStatus === 'Approved' && styles.consentButtonTextApproved
                  ]}
                >
                  Consent to Recording
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.consentButton,
                  recordingConsentStatus === 'Rejected' && styles.consentButtonRejected
                ]}
                onPress={() => onSubmitConsent && onSubmitConsent(false, 'Patient declined recording')}
                disabled={recordingConsentStatus === 'Rejected'}
                accessibilityRole="button"
                accessibilityLabel="Consult without recording"
              >
                <Text
                  style={[
                    styles.consentButtonText,
                    recordingConsentStatus === 'Rejected' && styles.consentButtonTextRejected
                  ]}
                >
                  Consult Without Recording
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Main Action Buttons */}
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancelCall} accessibilityRole="button">
              <Text style={styles.cancelButtonText}>Cancel / Leave</Text>
            </TouchableOpacity>

            {isDoctor && onAdmitPatient && (
              <TouchableOpacity
                style={[styles.admitButton, isPrepaidBlocked && styles.admitButtonDisabled]}
                onPress={onAdmitPatient}
                disabled={isPrepaidBlocked}
                accessibilityRole="button"
              >
                <Text style={styles.admitButtonText}>Admit Patient to Call</Text>
              </TouchableOpacity>
            )}

            {!isDoctor && (
              <TouchableOpacity
                style={[styles.admitButton, !isReadyToAdmit && styles.admitButtonDisabled]}
                onPress={onEnterCall}
                disabled={!isReadyToAdmit}
                accessibilityRole="button"
              >
                <Text style={styles.admitButtonText}>
                  {isReadyToAdmit ? 'Enter Consultation Room' : 'Waiting for Clinician...'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Staff Plain-Note Override Modal */}
      <Modal
        visible={overrideModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOverrideModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Staff Admission Override</Text>
            <Text style={styles.modalDescription}>
              Facility staff or attending clinicians may bypass the prepayment gate by submitting a plain reason note. This administrative action is permanently recorded in the facility audit log.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={overrideReason}
              onChangeText={setOverrideReason}
              placeholder="Enter reason for admission override (min 5 characters)..."
              placeholderTextColor={lightColors.textMuted}
              multiline
              numberOfLines={3}
              accessibilityLabel="Override reason input"
            />

            <Text style={[styles.charCountText, !isReasonValid && trimmedReason.length > 0 && styles.charCountWarning]}>
              {trimmedReason.length < 5
                ? `Minimum 5 characters required (${trimmedReason.length}/5)`
                : `Valid reason note (${trimmedReason.length} characters)`}
            </Text>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setOverrideModalVisible(false)}
                disabled={isSubmittingOverride}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitButton, !canSubmitOverride && styles.modalSubmitButtonDisabled]}
                onPress={handleOverrideSubmit}
                disabled={!canSubmitOverride}
                accessibilityRole="button"
              >
                <Text style={styles.modalSubmitText}>
                  {isSubmittingOverride ? 'Overriding...' : 'Audit & Admit Patient'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background
  },
  header: {
    padding: spaceScale.md,
    backgroundColor: lightColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border
  },
  headerTitle: {
    fontSize: fontSizeScale.xl,
    fontWeight: '700',
    color: lightColors.text
  },
  headerSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    marginTop: spaceScale.xxs
  },
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spaceScale['2xl']
  },
  stateText: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textSecondary,
    marginTop: spaceScale.sm
  },
  errorIcon: {
    fontSize: fontSizeScale['3xl'],
    color: lightColors.emergency,
    fontWeight: '700',
    marginBottom: spaceScale.xs
  },
  errorTitle: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xxs
  },
  errorSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted,
    textAlign: 'center'
  },
  body: {
    flex: 1,
    padding: spaceScale.md
  },
  previewBox: {
    aspectRatio: 16 / 9,
    width: '100%',
    backgroundColor: lightColors.surfaceHighlight,
    borderRadius: radiusScale.md,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: spaceScale.md,
    justifyContent: 'center',
    alignItems: 'center'
  },
  videoPlaceholder: {
    alignItems: 'center'
  },
  videoPlaceholderIcon: {
    fontSize: fontSizeScale['3xl'],
    fontWeight: '700',
    color: lightColors.textMuted,
    marginBottom: spaceScale.xs
  },
  videoPlaceholderText: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textSecondary
  },
  audioMeterContainer: {
    position: 'absolute',
    top: spaceScale.sm,
    left: spaceScale.sm,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.overlay,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: spaceScale.xxs,
    borderRadius: radiusScale.xs
  },
  audioMeterLabel: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    marginRight: spaceScale.xs
  },
  audioMeterBar: {
    width: 60,
    height: 6,
    backgroundColor: lightColors.surfaceHighlight,
    borderRadius: radiusScale.full,
    overflow: 'hidden'
  },
  audioMeterFill: {
    width: '65%',
    height: '100%',
    backgroundColor: lightColors.routine
  },
  audioMeterMuted: {
    width: '0%'
  },
  mediaBar: {
    position: 'absolute',
    bottom: spaceScale.sm,
    flexDirection: 'row',
    gap: spaceScale.sm
  },
  mediaButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    backgroundColor: lightColors.surface,
    borderRadius: radiusScale.full,
    justifyContent: 'center',
    alignItems: 'center'
  },
  mediaButtonOff: {
    backgroundColor: lightColors.emergencyBg
  },
  mediaButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.text
  },
  detailsCard: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spaceScale.xs
  },
  detailsLabel: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted
  },
  detailsValue: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.text
  },
  yakapCard: {
    backgroundColor: lightColors.infoBg,
    borderColor: lightColors.infoBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  yakapBadgeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs,
    marginBottom: spaceScale.xs
  },
  yakapPill: {
    backgroundColor: lightColors.info,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: spaceScale.xxs,
    borderRadius: radiusScale.xs
  },
  yakapPillText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  yakapBadgeTitle: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.infoText
  },
  yakapBadgeDescription: {
    fontSize: fontSizeScale.xs,
    color: lightColors.infoText,
    lineHeight: 18
  },
  policyCard: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  policyCardTitle: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.textSecondary,
    marginBottom: spaceScale.sm
  },
  policySelectorRow: {
    flexDirection: 'row',
    gap: spaceScale.xs
  },
  policyOptionButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  policyOptionButtonSelected: {
    backgroundColor: lightColors.primary,
    borderColor: lightColors.primaryDark
  },
  policyOptionText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  policyOptionTextSelected: {
    color: lightColors.onPrimary,
    fontWeight: '700'
  },
  blockedCard: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spaceScale.md
  },
  blockedIcon: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.warningText,
    marginRight: spaceScale.sm
  },
  gateTextContainer: {
    flex: 1
  },
  blockedTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.warningText
  },
  blockedSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.warningText,
    marginTop: spaceScale.xxs
  },
  overrideButton: {
    marginTop: spaceScale.sm,
    alignSelf: 'flex-start',
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.sm,
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    borderRadius: radiusScale.xs
  },
  overrideButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  clearedCard: {
    backgroundColor: lightColors.successBg,
    borderColor: lightColors.successBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spaceScale.md
  },
  clearedIcon: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.successText,
    marginRight: spaceScale.sm
  },
  clearedTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.successText
  },
  clearedSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.successText,
    marginTop: spaceScale.xxs
  },
  consentCard: {
    backgroundColor: lightColors.surface,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    marginBottom: spaceScale.md
  },
  consentTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.xxs
  },
  consentSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    marginBottom: spaceScale.sm
  },
  consentActions: {
    flexDirection: 'row',
    gap: spaceScale.xs
  },
  consentButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs
  },
  consentButtonApproved: {
    backgroundColor: lightColors.routineBg,
    borderColor: lightColors.routineBorder
  },
  consentButtonRejected: {
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border
  },
  consentButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.textSecondary,
    textAlign: 'center'
  },
  consentButtonTextApproved: {
    color: lightColors.routineText,
    fontWeight: '700'
  },
  consentButtonTextRejected: {
    color: lightColors.textMuted
  },
  bottomBar: {
    flexDirection: 'row',
    gap: spaceScale.sm,
    marginTop: 'auto',
    paddingTop: spaceScale.md
  },
  cancelButton: {
    flex: 1,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center'
  },
  cancelButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  admitButton: {
    flex: 2,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  admitButtonDisabled: {
    opacity: 0.5
  },
  admitButtonText: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: lightColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spaceScale.md
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: lightColors.surface,
    borderRadius: radiusScale.md,
    padding: spaceScale.lg,
    borderWidth: 1,
    borderColor: lightColors.border
  },
  modalTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.text,
    marginBottom: spaceScale.xs
  },
  modalDescription: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    marginBottom: spaceScale.md,
    lineHeight: 18
  },
  modalInput: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: radiusScale.sm,
    padding: spaceScale.sm,
    fontSize: fontSizeScale.xs,
    color: lightColors.text,
    minHeight: sizes.touchTarget * 1.8,
    textAlignVertical: 'top'
  },
  charCountText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted,
    marginTop: spaceScale.xs,
    marginBottom: spaceScale.md
  },
  charCountWarning: {
    color: lightColors.warningText,
    fontWeight: '600'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spaceScale.sm
  },
  modalCancelButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle
  },
  modalCancelText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    fontWeight: '600'
  },
  modalSubmitButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.emergency
  },
  modalSubmitButtonDisabled: {
    opacity: 0.5
  },
  modalSubmitText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    fontWeight: '700'
  }
});
