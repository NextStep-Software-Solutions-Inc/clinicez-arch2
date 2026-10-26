import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Modal, Pressable } from 'react-native';
import { CallWaitingRoom } from '@clinicez/comms-sdk/native-ui';
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { notify } from '../../utils/feedback';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';

export default function TeleconsultWaitingRoomModal() {
  const { teleconsultSession, closeTeleconsultWaitingRoom } = useClinicComms();
  const { user } = useAuth();

  const [paymentStatus, setPaymentStatus] = useState<'Unpaid' | 'Paid' | 'Exempt' | 'Overridden'>(
    teleconsultSession?.paymentStatus || 'Unpaid',
  );
  const [isReadyToAdmit, setIsReadyToAdmit] = useState(false);
  const [consentStatus, setConsentStatus] = useState<'Pending' | 'Approved' | 'Rejected' | 'Disabled'>('Pending');
  const [isInCall, setIsInCall] = useState(false);

  // Sync state if session changes
  React.useEffect(() => {
    if (teleconsultSession) {
      setPaymentStatus(teleconsultSession.paymentStatus || 'Unpaid');
      setIsReadyToAdmit(
        teleconsultSession.paymentStatus === 'Paid' ||
        teleconsultSession.paymentStatus === 'Exempt' ||
        teleconsultSession.isYakapExempt === true,
      );
      setConsentStatus('Pending');
      setIsInCall(false);
    }
  }, [teleconsultSession]);

  const handleEmergencyOverride = useCallback(async (reason: string) => {
    setPaymentStatus('Overridden');
    setIsReadyToAdmit(true);
    notify.success(`Emergency payment override applied: ${reason}`);
  }, []);

  const handleAdmitPatient = useCallback(async () => {
    setIsReadyToAdmit(true);
    notify.success('Patient admitted to teleconsultation room.');
  }, []);

  const handleConsent = useCallback(async (approved: boolean, reason?: string) => {
    if (approved) {
      setConsentStatus('Approved');
      notify.success('Recording consent verified by patient.');
    } else {
      setConsentStatus('Rejected');
      notify.info(`Patient declined recording: ${reason || 'Consent refused'}`);
    }
  }, []);

  const handleEnterCall = useCallback(() => {
    setIsInCall(true);
    notify.success('Connecting to encrypted teleconsultation session...');
  }, []);

  const handleCancelCall = useCallback(() => {
    setIsInCall(false);
    closeTeleconsultWaitingRoom();
  }, [closeTeleconsultWaitingRoom]);

  if (!teleconsultSession) {
    return null;
  }

  const isDoctor = user?.role === 'Doctor' || user?.role === 'Admin';
  const isYakapExempt = teleconsultSession.isYakapExempt ?? false;
  const paymentPolicy = isYakapExempt ? 'Exempt' : teleconsultSession.paymentPolicy || 'Prepaid';

  return (
    <Modal visible={true} animationType="fade" transparent onRequestClose={handleCancelCall}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <View style={styles.headerBar}>
            <View style={styles.headerTitleGroup}>
              <Icon name="consultations" size={theme.sizes.iconMd} color={theme.colors.primary} />
              <ThemedText variant="title" color={theme.colors.text}>
                Teleconsultation Staging Room
              </ThemedText>
            </View>
            <Pressable
              onPress={handleCancelCall}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close teleconsult waiting room"
            >
              <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.body}>
            {isInCall ? (
              <View style={styles.activeCallContainer}>
                <Icon name="activity" size={48} color={theme.colors.success} />
                <ThemedText variant="h2" color={theme.colors.text} style={styles.activeCallHeading}>
                  Teleconsultation in Progress
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.activeCallSub}>
                  Connected with {teleconsultSession.patientName} (Attending: {teleconsultSession.clinicianName})
                </ThemedText>
                <Pressable
                  onPress={handleCancelCall}
                  style={styles.endCallButton}
                  accessibilityRole="button"
                  accessibilityLabel="End consultation call"
                >
                  <Icon name="phone" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
                  <ThemedText variant="smallBold" color={theme.colors.onPrimary}>
                    End Teleconsultation
                  </ThemedText>
                </Pressable>
              </View>
            ) : (
              <CallWaitingRoom
                callId={teleconsultSession.callId}
                appointmentId={teleconsultSession.appointmentId}
                userRole={isDoctor ? 'Clinician' : 'Staff'}
                patientName={teleconsultSession.patientName}
                clinicianName={teleconsultSession.clinicianName}
                scheduledTime={teleconsultSession.scheduledTime}
                paymentPolicy={paymentPolicy}
                paymentStatus={isYakapExempt ? 'Exempt' : paymentStatus}
                isYakapExempt={isYakapExempt}
                isReadyToAdmit={isReadyToAdmit}
                recordingConsentStatus={consentStatus}
                onEmergencyPaymentOverride={handleEmergencyOverride}
                onAdmitPatient={handleAdmitPatient}
                onSubmitConsent={handleConsent}
                onEnterCall={handleEnterCall}
                onCancelCall={handleCancelCall}
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 820,
    maxHeight: '90%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    overflow: 'hidden',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  closeBtn: {
    width: theme.sizes.controlSm,
    height: theme.sizes.controlSm,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
  },
  body: {
    flex: 1,
    minHeight: 520,
  },
  activeCallContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
  activeCallHeading: {
    textAlign: 'center',
  },
  activeCallSub: {
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  endCallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergency,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    borderRadius: theme.radii.md,
  },
});
