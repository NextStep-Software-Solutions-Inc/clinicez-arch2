import { useCallback, useState } from 'react';
import {
  CallConsentState,
  CallParticipant,
  CallSessionStatus,
  EmergencyOverrideInput,
  TeleconsultPaymentPolicy,
  TeleconsultPaymentState,
  TeleconsultPaymentStatus,
  UseCallSessionOptions,
  UseCallSessionResult
} from '../types';

export function useCallSession(
  sessionId: string,
  options?: UseCallSessionOptions
): UseCallSessionResult {
  const [status, setStatus] = useState<CallSessionStatus>('in_waiting_room');
  const [isAdmitted, setIsAdmitted] = useState<boolean>(false);
  const [isDoctor, setIsDoctor] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const [paymentState, setPaymentState] = useState<TeleconsultPaymentState>({
    policy: 'Exempt',
    status: 'Exempt',
    canAdmit: true,
    isYakapExempt: true,
    isEmergencyOverride: false
  });

  const [consentState, setConsentState] = useState<CallConsentState>({
    recordingSessionId: null,
    consentRequired: true,
    status: 'none',
    requestedAt: null,
    decidedAt: null
  });

  const [isCameraEnabled, setIsCameraEnabled] = useState<boolean>(true);
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const [participants, setParticipants] = useState<CallParticipant[]>([
    {
      identity: options?.participantIdentity ?? 'staff-current',
      name: 'Dr. Clinician',
      isDoctor: true,
      isCameraEnabled: true,
      isMicEnabled: true,
      isScreenSharing: false,
      joinedAt: new Date()
    }
  ]);

  const toggleCamera = useCallback(async (): Promise<void> => {
    setIsCameraEnabled((prev) => !prev);
  }, []);

  const toggleMic = useCallback(async (): Promise<void> => {
    setIsMicEnabled((prev) => !prev);
  }, []);

  const toggleScreenShare = useCallback(async (): Promise<void> => {
    setIsScreenSharing((prev) => !prev);
  }, []);

  const switchCamera = useCallback(async (): Promise<void> => {
    // Camera toggle / switcher
  }, []);

  const admitPatient = useCallback(
    async (emergencyOverride?: EmergencyOverrideInput): Promise<void> => {
      if (!paymentState.canAdmit && !emergencyOverride && !paymentState.isYakapExempt) {
        throw new Error('Cannot admit patient: Prepaid consultation is unpaid.');
      }

      if (emergencyOverride) {
        setPaymentState((prev) => ({
          ...prev,
          status: 'Overridden',
          canAdmit: true,
          isEmergencyOverride: true,
          overrideReason: emergencyOverride.reasonNote
        }));
      }

      setIsAdmitted(true);
      setStatus('connected');
    },
    [paymentState.canAdmit, paymentState.isYakapExempt]
  );

  const requestRecordingConsent = useCallback(async (): Promise<void> => {
    setConsentState((prev) => ({
      ...prev,
      status: 'requested',
      requestedAt: new Date()
    }));
  }, []);

  const respondToRecordingConsent = useCallback(
    async (approved: boolean, reason?: string): Promise<void> => {
      setConsentState((prev) => ({
        ...prev,
        status: approved ? 'approved' : 'declined',
        decidedAt: new Date(),
        rejectionReason: reason
      }));
      if (approved) {
        setIsRecording(true);
      } else {
        setIsRecording(false);
      }
    },
    []
  );

  const revokeRecordingConsent = useCallback(async (reason?: string): Promise<void> => {
    setConsentState((prev) => ({
      ...prev,
      status: 'revoked',
      decidedAt: new Date(),
      rejectionReason: reason
    }));
    setIsRecording(false);
  }, []);

  const leaveCall = useCallback(async (): Promise<void> => {
    setStatus('ended');
  }, []);

  const endCall = useCallback(async (): Promise<void> => {
    setStatus('ended');
    setIsRecording(false);
  }, []);

  return {
    callId: sessionId,
    roomName: `call-${sessionId}`,
    status,
    isWaitingRoom: !isAdmitted,
    isAdmitted,
    isDoctor,
    paymentState,
    consentState,
    isE2eeEnabled: true,
    mediaTracks: {
      isCameraEnabled,
      isMicEnabled,
      isScreenSharing,
      toggleCamera,
      toggleMic,
      toggleScreenShare,
      switchCamera,
      selectedCameraId: null,
      selectedMicId: null
    },
    participants,
    recordingState: {
      isRecording,
      recordingSessionId: consentState.recordingSessionId,
      consentStatus: consentState.status,
      requestRecordingConsent,
      respondToRecordingConsent,
      revokeRecordingConsent
    },
    admitPatient,
    leaveCall,
    endCall,
    error
  };
}
