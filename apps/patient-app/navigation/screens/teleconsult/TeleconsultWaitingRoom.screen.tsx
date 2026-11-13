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
import { teleconsultApi, type PatientTeleconsultCallDto } from '../../../services/api';

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
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const { user } = useUser();
  const { getToken } = useAuth();

  const appointmentId = route.params?.appointmentId ?? '';
  const callId = route.params?.callId ?? `call-${appointmentId}`;
  const patientName = route.params?.patientName ?? user?.fullName ?? 'Patient';
  const clinicianName = route.params?.clinicianName ?? 'Attending Clinician';
  const scheduledTime = route.params?.scheduledTime ?? 'Today, Scheduled Session';
  const paymentPolicy = route.params?.paymentPolicy ?? 'Exempt';
  const paymentStatus = route.params?.paymentStatus ?? 'Paid';
  const isYakapExempt = route.params?.isYakapExempt ?? true;

  const [recordingConsent, setRecordingConsent] = useState<'Pending' | 'Approved' | 'Rejected' | 'Disabled'>('Pending');
  const [isReadyToAdmit, setIsReadyToAdmit] = useState(false);
  const [callSessionData, setCallSessionData] = useState<PatientTeleconsultCallDto | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isDemo =
    process.env.EXPO_PUBLIC_ENABLE_DEMO_TELECONSULT === 'true' ||
    process.env.EXPO_PUBLIC_DEMO_TELECONSULT === 'true';

  // Doctor admission gating and call polling
  useEffect(() => {
    // If prepaid blocked and not yakap exempt, cannot admit
    const isBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid' && !isYakapExempt;
    if (isBlocked) return;

    if (isDemo) {
      // Simulate doctor ready to admit after 2.5 seconds for demo/preview mode
      const timer = setTimeout(() => {
        setIsReadyToAdmit(true);
      }, 2500);

      return () => clearTimeout(timer);
    } else {
      setIsReadyToAdmit(false);

      const targetGuid = callId.replace(/^call-/, '') || appointmentId;
      const isGuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetGuid);

      let isMounted = true;

      const pollCallStatus = async () => {
        if (!isGuid) return;
        try {
          const callData = await teleconsultApi.getCall(getToken, targetGuid);
          if (!isMounted || !callData) return;

          setCallSessionData(callData);

          const status = callData.status?.toLowerCase();
          const isAdmittedStatus =
            status === 'admitted' ||
            status === 'active' ||
            status === 'incall' ||
            status === 'connected' ||
            Boolean(callData.joinToken);

          if (isAdmittedStatus) {
            setIsReadyToAdmit(true);
          }
        } catch {
          // Silent polling retry on transient network error
        }
      };

      pollCallStatus();
      const interval = setInterval(pollCallStatus, 3000);

      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
  }, [appointmentId, callId, getToken, isDemo, isYakapExempt, paymentPolicy, paymentStatus]);

  const handleSubmitConsent = useCallback(async (approved: boolean, _reason?: string) => {
    setRecordingConsent(approved ? 'Approved' : 'Rejected');
    if (approved) {
      dialog.alert('Consent Saved', 'Your consent for recording this consultation has been saved. Your clinician will be notified.');
    } else {
      dialog.alert('Consultation Without Recording', "You've chosen not to record this visit. Your consultation will proceed normally without recording.");
    }
  }, []);

  const handleEnterCall = useCallback(() => {
    navigation.replace('Main', {
      screen: 'TeleconsultCallScreen',
      params: {
        callId,
        appointmentId,
        clinicianName,
        patientName,
        isRecorded: recordingConsent === 'Approved',
        roomName: callSessionData?.roomName ?? `room-${callId}`,
        relayUrl: callSessionData?.relayUrl ?? undefined,
        joinToken: callSessionData?.joinToken ?? undefined,
      },
    });
  }, [appointmentId, callId, clinicianName, navigation, patientName, recordingConsent, callSessionData]);

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

      {!isDemo && (
        <View
          style={[
            styles.sessionNotice,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.borderLight,
              borderRadius: radii.md,
              padding: spacing.md,
              marginHorizontal: spacing.md,
              marginTop: spacing.sm,
              borderWidth: StyleSheet.hairlineWidth,
            },
          ]}
        >
          <ThemedText variant="small" color="textSecondary" style={{ textAlign: 'center' }}>
            Teleconsultation session will connect once your physician initiates the call room
          </ThemedText>
        </View>
      )}

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
  sessionNotice: {},
});
