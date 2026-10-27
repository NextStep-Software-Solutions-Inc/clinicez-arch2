import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { CallWaitingRoom } from '@clinicez/comms-sdk/native-ui';
import Screen from '../../../components/layout/Screen';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { useUser } from '@clerk/expo';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{
  appointmentId?: string;
  callId?: string;
  patientName?: string;
  clinicianName?: string;
  scheduledTime?: string;
  paymentPolicy?: 'Prepaid' | 'Postpaid' | 'Exempt';
  paymentStatus?: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden';
  isYakapExempt?: boolean;
}>;

export default function TeleconsultWaitingRoomScreen({ route }: Props) {
  const { colors, spacing } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();

  const appointmentId = route.params?.appointmentId ?? 'APT-TC-001';
  const callId = route.params?.callId ?? `call-${appointmentId}`;
  const patientName = route.params?.patientName ?? user?.fullName ?? 'Patient';
  const clinicianName = route.params?.clinicianName ?? 'Attending Clinician';
  const scheduledTime = route.params?.scheduledTime ?? 'Today, Scheduled Session';
  const paymentPolicy = route.params?.paymentPolicy ?? 'Exempt';
  const paymentStatus = route.params?.paymentStatus ?? 'Paid';
  const isYakapExempt = route.params?.isYakapExempt ?? true;

  const [recordingConsent, setRecordingConsent] = useState<'Pending' | 'Approved' | 'Rejected' | 'Disabled'>('Pending');
  const [isReadyToAdmit, setIsReadyToAdmit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Simulate or listen for doctor admission
  useEffect(() => {
    // If prepaid blocked and not yakap exempt, cannot admit
    const isBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid' && !isYakapExempt;
    if (isBlocked) return;

    // Simulate doctor ready to admit after 3 seconds for smooth UX
    const timer = setTimeout(() => {
      setIsReadyToAdmit(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [isYakapExempt, paymentPolicy, paymentStatus]);

  const handleSubmitConsent = useCallback(async (approved: boolean, reason?: string) => {
    setRecordingConsent(approved ? 'Approved' : 'Rejected');
    if (approved) {
      dialog.alert('Consent Recorded', 'Informed consent for teleconsultation audio/video recording has been saved.');
    } else {
      dialog.alert('Consultation Without Recording', 'You have opted out of session recording. Your consultation will proceed without recording.');
    }
  }, []);

  const handleEnterCall = useCallback(() => {
    navigation.replace('Main', {
      screen: 'TeleconsultCallScreen',
      params: {
        callId,
        appointmentId,
        clinicianName,
        isRecorded: recordingConsent === 'Approved',
      },
    });
  }, [appointmentId, callId, clinicianName, navigation, recordingConsent]);

  const handleCancelCall = useCallback(async () => {
    const ok = await dialog.confirm({
      title: 'Leave Waiting Room',
      message: 'Are you sure you want to exit the virtual waiting room?',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (ok) {
      navigation.goBack();
    }
  }, [navigation]);

  return (
    <Screen width="form" contentContainerStyle={styles.screenContainer}>
      <View
        style={[
          styles.navBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <IconButton
          icon="back"
          accessibilityLabel="Back to Appointment"
          onPress={() => navigation.goBack()}
        />
        <ThemedText variant="bodyBold" style={styles.navTitle}>
          Teleconsultation Virtual Waiting Room
        </ThemedText>
      </View>

      <CallWaitingRoom
        callId={callId}
        appointmentId={appointmentId}
        userRole="Patient"
        patientName={patientName}
        clinicianName={clinicianName}
        scheduledTime={scheduledTime}
        paymentPolicy={paymentPolicy}
        paymentStatus={paymentStatus}
        isYakapExempt={isYakapExempt}
        isReadyToAdmit={isReadyToAdmit}
        recordingConsentStatus={recordingConsent}
        onSubmitConsent={handleSubmitConsent}
        onEnterCall={handleEnterCall}
        onCancelCall={handleCancelCall}
        isLoading={isLoading}
        style={styles.waitingRoomContent}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    padding: 0,
    flex: 1,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  navTitle: {
    marginLeft: 8,
  },
  waitingRoomContent: {
    flex: 1,
  },
});
