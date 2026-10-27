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
  isYakapExempt,
  isReadyToAdmit,
  recordingConsentStatus,
  onAdmitPatient,
  onEmergencyPaymentOverride,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPrepaidBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid' && !isYakapExempt;
  const isDoctor = userRole === 'Clinician';

  const handleOverrideSubmit = async () => {
    if (!overrideReason.trim() || isSubmitting || !onEmergencyPaymentOverride) return;
    setIsSubmitting(true);
    try {
      await onEmergencyPaymentOverride(overrideReason.trim());
      setOverrideModalVisible(false);
      setOverrideReason('');
    } finally {
      setIsSubmitting(false);
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
                accessibilityLabel={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
              >
                <Text style={styles.mediaButtonText}>{isMicActive ? 'MIC' : 'MUTE'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.mediaButton, !isCameraActive && styles.mediaButtonOff]}
                onPress={() => setIsCameraActive((prev) => !prev)}
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

          {/* Payment Gate Banner */}
          {isYakapExempt ? (
            <View style={styles.exemptCard}>
              <Text style={styles.exemptIcon}>OK</Text>
              <View style={styles.gateTextContainer}>
                <Text style={styles.exemptTitle}>Admission Cleared • YAKAP Auto-Exempt</Text>
                <Text style={styles.exemptSubtitle}>
                  PhilHealth Konsulta consultation automatically cleared for admission.
                </Text>
              </View>
            </View>
          ) : isPrepaidBlocked ? (
            <View style={styles.blockedCard}>
              <Text style={styles.blockedIcon}>LOCK</Text>
              <View style={styles.gateTextContainer}>
                <Text style={styles.blockedTitle}>Prepayment Gate: Settlement Required</Text>
                <Text style={styles.blockedSubtitle}>
                  This consultation is prepaid. Admission will unlock immediately upon cashier or online payment.
                </Text>
                {isDoctor && onEmergencyPaymentOverride && (
                  <TouchableOpacity
                    style={styles.overrideButton}
                    onPress={() => setOverrideModalVisible(true)}
                  >
                    <Text style={styles.overrideButtonText}>Emergency Clinical Override</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ) : (
            <View style={styles.clearedCard}>
              <Text style={styles.clearedIcon}>OK</Text>
              <View style={styles.gateTextContainer}>
                <Text style={styles.clearedTitle}>Payment Cleared</Text>
                <Text style={styles.clearedSubtitle}>Payment confirmed. Ready for consultation.</Text>
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
            <TouchableOpacity style={styles.cancelButton} onPress={onCancelCall}>
              <Text style={styles.cancelButtonText}>Cancel / Leave</Text>
            </TouchableOpacity>

            {isDoctor && onAdmitPatient && (
              <TouchableOpacity
                style={[styles.admitButton, isPrepaidBlocked && styles.admitButtonDisabled]}
                onPress={onAdmitPatient}
                disabled={isPrepaidBlocked}
              >
                <Text style={styles.admitButtonText}>Admit Patient to Call</Text>
              </TouchableOpacity>
            )}

            {!isDoctor && (
              <TouchableOpacity
                style={[styles.admitButton, !isReadyToAdmit && styles.admitButtonDisabled]}
                onPress={onEnterCall}
                disabled={!isReadyToAdmit}
              >
                <Text style={styles.admitButtonText}>
                  {isReadyToAdmit ? 'Enter Consultation Room' : 'Waiting for Clinician...'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Emergency Override Modal */}
      <Modal
        visible={overrideModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOverrideModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Emergency Clinical Override</Text>
            <Text style={styles.modalDescription}>
              Under facility policy, an attending clinician may bypass prepayment for acute clinical urgency. This action is permanently audited.
            </Text>

            <TextInput
              style={styles.modalInput}
              value={overrideReason}
              onChangeText={setOverrideReason}
              placeholder="Clinical rationale for emergency admission..."
              placeholderTextColor={lightColors.textMuted}
              multiline
              numberOfLines={3}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setOverrideModalVisible(false)}
                disabled={isSubmitting}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSubmitButton}
                onPress={handleOverrideSubmit}
                disabled={isSubmitting || !overrideReason.trim()}
              >
                <Text style={styles.modalSubmitText}>
                  {isSubmitting ? 'Bypassing...' : 'Audit & Admit Patient'}
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
    marginTop: 2
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
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  audioMeterLabel: {
    fontSize: fontSizeScale.xs,
    color: lightColors.onPrimary,
    marginRight: 4
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
    fontSize: fontSizeScale.lg
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
  exemptCard: {
    backgroundColor: lightColors.routineBg,
    borderColor: lightColors.routineBorder,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spaceScale.md
  },
  exemptIcon: {
    fontSize: fontSizeScale.xl,
    color: lightColors.routineText,
    marginRight: spaceScale.sm
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
    fontSize: fontSizeScale.xl,
    marginRight: spaceScale.sm
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
    fontSize: fontSizeScale.xl,
    color: lightColors.successText,
    marginRight: spaceScale.sm
  },
  gateTextContainer: {
    flex: 1
  },
  exemptTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.routineText
  },
  exemptSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.routineText,
    marginTop: 2
  },
  blockedTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.warningText
  },
  blockedSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.warningText,
    marginTop: 2
  },
  clearedTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.successText
  },
  clearedSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.successText,
    marginTop: 2
  },
  overrideButton: {
    marginTop: spaceScale.sm,
    alignSelf: 'flex-start',
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 4,
    borderRadius: radiusScale.xs
  },
  overrideButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
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
    marginBottom: 2
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
    fontSize: fontSizeScale.sm,
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
    padding: spaceScale.lg
  },
  modalContent: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: lightColors.surface,
    borderRadius: radiusScale.md,
    padding: spaceScale.lg
  },
  modalTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs
  },
  modalDescription: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textSecondary,
    lineHeight: 16,
    marginBottom: spaceScale.md
  },
  modalInput: {
    backgroundColor: lightColors.surfaceSubtle,
    borderColor: lightColors.border,
    borderWidth: 1,
    borderRadius: radiusScale.sm,
    padding: spaceScale.md,
    fontSize: fontSizeScale.sm,
    color: lightColors.text,
    marginBottom: spaceScale.md,
    textAlignVertical: 'top'
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spaceScale.sm
  },
  modalCancelButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCancelText: {
    fontSize: fontSizeScale.sm,
    fontWeight: '600',
    color: lightColors.textSecondary
  },
  modalSubmitButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.emergency,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalSubmitText: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spaceScale.xl
  },
  stateText: {
    marginTop: spaceScale.sm,
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted
  },
  errorIcon: {
    fontSize: fontSizeScale['3xl'],
    marginBottom: spaceScale.sm
  },
  errorTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '600',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs
  },
  errorSubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center'
  }
});
