import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CommsContext } from '../CommsContext';
import {
  CallConsentState,
  CallParticipant,
  CallSessionStatus,
  EmergencyOverrideInput,
  TeleconsultPaymentPolicy,
  TeleconsultPaymentState,
  UseCallSessionOptions,
  UseCallSessionResult
} from '../types';
import type {
  CallPaymentClearedPayload,
  CallStateChangedPayload,
  RecordingConsentLoggedPayload
} from '../../core/events/CommsEventEmitter';
import { SegmentRecorder } from '../../core/media/SegmentRecorder';

export function useCallSession(
  sessionId: string,
  options?: UseCallSessionOptions
): UseCallSessionResult {
  // Graceful fallback: returns null safely when unprovided outside <CommsProvider>
  const commsContext = useContext(CommsContext);

  const [status, setStatus] = useState<CallSessionStatus>('in_waiting_room');
  const [isAdmitted, setIsAdmitted] = useState<boolean>(false);
  const [isDoctor, setIsDoctor] = useState<boolean>(options?.isDoctor ?? true);
  const [error, setError] = useState<Error | null>(null);

  const [paymentState, setPaymentState] = useState<TeleconsultPaymentState>({
    policy: options?.initialPaymentState?.policy ?? 'Exempt',
    status: options?.initialPaymentState?.status ?? 'Exempt',
    canAdmit: options?.initialPaymentState?.canAdmit ?? true,
    isYakapExempt: options?.initialPaymentState?.isYakapExempt ?? true,
    hasActiveYakapEnlistment: options?.initialPaymentState?.hasActiveYakapEnlistment ?? false,
    isEmergencyOverride: options?.initialPaymentState?.isEmergencyOverride ?? false,
    overrideReason: options?.initialPaymentState?.overrideReason
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
  const [recordingDurationSeconds, setRecordingDurationSeconds] = useState<number>(0);

  const segmentRecorderRef = useRef<SegmentRecorder | null>(null);
  const recordingSessionIdRef = useRef<string | null>(null);
  const isCameraEnabledRef = useRef<boolean>(isCameraEnabled);
  const isMicEnabledRef = useRef<boolean>(isMicEnabled);
  const isScreenSharingRef = useRef<boolean>(isScreenSharing);
  const prevSessionIdRef = useRef<string>(sessionId);

  useEffect(() => {
    isCameraEnabledRef.current = isCameraEnabled;
  }, [isCameraEnabled]);

  useEffect(() => {
    isMicEnabledRef.current = isMicEnabled;
  }, [isMicEnabled]);

  useEffect(() => {
    isScreenSharingRef.current = isScreenSharing;
  }, [isScreenSharing]);

  useEffect(() => {
    if (prevSessionIdRef.current === sessionId) return;
    prevSessionIdRef.current = sessionId;
    setStatus('in_waiting_room');
    setIsAdmitted(false);
    setError(null);
    setIsRecording(false);
    setRecordingDurationSeconds(0);
    isCameraEnabledRef.current = true;
    isMicEnabledRef.current = true;
    isScreenSharingRef.current = false;
    setIsCameraEnabled(true);
    setIsMicEnabled(true);
    setIsScreenSharing(false);
  }, [sessionId]);

  const [participants, setParticipants] = useState<CallParticipant[]>([
    {
      identity: options?.participantIdentity ?? 'staff-current',
      name: options?.participantName ?? (options?.isDoctor === false ? 'Participant' : 'Dr. Clinician'),
      isDoctor: options?.isDoctor ?? true,
      isCameraEnabled: true,
      isMicEnabled: true,
      isScreenSharing: false,
      joinedAt: new Date()
    }
  ]);

  // Recording duration timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingDurationSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setRecordingDurationSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRecording]);

  // Segment recorder lifecycle
  useEffect(() => {
    if (isRecording) {
      const adapter = options?.mediaAdapter;
      const stream = adapter?.getRecordingStream();
      if (stream || options?.onSegmentUploaded) {
        const recorder = new SegmentRecorder({
          timesliceMs: 10000,
          onSegmentReady: async (segment) => {
            if (options?.onSegmentUploaded) {
              await options.onSegmentUploaded({
                segmentIndex: segment.segmentIndex,
                durationMs: segment.durationMs,
                bytes: segment.data
              });
            }
          }
        });
        segmentRecorderRef.current = recorder;
        if (stream) {
          recorder.start(stream);
        }
      }
    } else {
      if (segmentRecorderRef.current) {
        segmentRecorderRef.current.stop().catch(() => {});
        segmentRecorderRef.current = null;
      }
    }
    return () => {
      if (segmentRecorderRef.current) {
        segmentRecorderRef.current.stop().catch(() => {});
        segmentRecorderRef.current = null;
      }
    };
  }, [isRecording, options?.mediaAdapter, options?.onSegmentUploaded]);

  // Wire up MediaAdapter tracks & remote participants if provided
  useEffect(() => {
    const adapter = options?.mediaAdapter;
    if (!adapter) return;

    const unsubJoined = adapter.on('participantJoined', (...args: unknown[]) => {
      const p = args[0] as {
        identity?: string;
        name?: string;
        isVideoEnabled?: boolean;
        isAudioEnabled?: boolean;
        isScreenSharing?: boolean;
        joinedAt?: Date;
      };
      if (!p || !p.identity) return;
      setParticipants((prev) => {
        if (prev.some((existing) => existing.identity === p.identity)) return prev;
        return [
          ...prev,
          {
            identity: p.identity!,
            name: p.name || 'Participant',
            isDoctor: false,
            isCameraEnabled: p.isVideoEnabled ?? true,
            isMicEnabled: p.isAudioEnabled ?? true,
            isScreenSharing: p.isScreenSharing ?? false,
            joinedAt: p.joinedAt || new Date()
          }
        ];
      });
    });

    const unsubLeft = adapter.on('participantLeft', (...args: unknown[]) => {
      const identity = args[0] as string;
      if (!identity) return;
      setParticipants((prev) => prev.filter((p) => p.identity !== identity));
    });

    const unsubTrack = adapter.on('localTrackChanged', (...args: unknown[]) => {
      const kind = args[0] as string;
      const enabled = Boolean(args[1]);
      if (kind === 'audio') {
        isMicEnabledRef.current = enabled;
        setIsMicEnabled((prev) => (prev === enabled ? prev : enabled));
      }
      if (kind === 'video') {
        isCameraEnabledRef.current = enabled;
        setIsCameraEnabled((prev) => (prev === enabled ? prev : enabled));
      }
      if (kind === 'screen') {
        isScreenSharingRef.current = enabled;
        setIsScreenSharing((prev) => (prev === enabled ? prev : enabled));
      }
    });

    const syncParticipants = () => {
      const remotes = adapter.getRemoteParticipants().map((rp) => ({
        identity: rp.identity,
        name: rp.name || 'Participant',
        isDoctor: false,
        isCameraEnabled: rp.isVideoEnabled,
        isMicEnabled: rp.isAudioEnabled,
        isScreenSharing: rp.isScreenSharing,
        joinedAt: rp.joinedAt || new Date()
      }));
      setParticipants((prev) => {
        const localSelf = prev[0] ?? {
          identity: options?.participantIdentity ?? 'staff-current',
          name: options?.participantName ?? (options?.isDoctor === false ? 'Participant' : 'Dr. Clinician'),
          isDoctor: options?.isDoctor ?? true,
          isCameraEnabled: true,
          isMicEnabled: true,
          isScreenSharing: false,
          joinedAt: new Date()
        };
        return [localSelf, ...remotes];
      });
    };

    const unsubSub = adapter.on('trackSubscribed', syncParticipants);
    const unsubUnsub = adapter.on('trackUnsubscribed', syncParticipants);

    return () => {
      unsubJoined();
      unsubLeft();
      unsubTrack();
      unsubSub();
      unsubUnsub();
    };
  }, [options?.mediaAdapter, options?.participantIdentity, options?.participantName, options?.isDoctor]);

  // SignalR CommsContext event subscriptions (only when mounted inside <CommsProvider>)
  useEffect(() => {
    if (!commsContext?.client?.events) return;
    const events = commsContext.client.events;

    const matchesCall = (id?: string | null) => {
      if (!id) return true;
      return id === sessionId || sessionId.includes(id) || id.includes(sessionId);
    };

    const handleCallState = (payload: CallStateChangedPayload) => {
      if (!matchesCall(payload.callId)) return;
      if (payload.status) {
        const lower = payload.status.toLowerCase();
        if (lower === 'connected' || lower === 'active') {
          setIsAdmitted(true);
          setStatus('connected');
        } else if (lower === 'admitted') {
          setIsAdmitted(true);
          setStatus('admitted');
        } else if (lower === 'ended' || lower === 'completed') {
          setStatus('ended');
          setIsRecording(false);
        } else if (lower === 'denied') {
          setStatus('denied');
        }
      }
    };

    const handlePaymentCleared = (payload: CallPaymentClearedPayload) => {
      if (!matchesCall(payload.callId)) return;
      setPaymentState((prev) => ({
        ...prev,
        status: payload.isEmergencyOverride ? 'Overridden' : 'Paid',
        canAdmit: true,
        isEmergencyOverride: payload.isEmergencyOverride ?? prev.isEmergencyOverride,
        overrideReason: payload.overrideReason ?? prev.overrideReason
      }));
    };

    const handleConsentLogged = (payload: RecordingConsentLoggedPayload) => {
      if (!matchesCall(payload.callId)) return;
      const decision = payload.decision?.toLowerCase();
      if (decision === 'approved') {
        setConsentState((prev) => ({
          ...prev,
          status: 'approved',
          decidedAt: new Date(payload.loggedAtUtc || Date.now())
        }));
        setIsRecording(true);
      } else if (decision === 'declined') {
        setConsentState((prev) => ({
          ...prev,
          status: 'declined',
          decidedAt: new Date(payload.loggedAtUtc || Date.now())
        }));
        setIsRecording(false);
      } else if (decision === 'revoked') {
        setConsentState((prev) => ({
          ...prev,
          status: 'revoked',
          decidedAt: new Date(payload.loggedAtUtc || Date.now())
        }));
        setIsRecording(false);
      }
    };

    const unsubState = events.on('callStateChanged', handleCallState);
    const unsubPayment = events.on('callPaymentCleared', handlePaymentCleared);
    const unsubConsent = events.on('recordingConsentLogged', handleConsentLogged);

    return () => {
      unsubState();
      unsubPayment();
      unsubConsent();
    };
  }, [commsContext, sessionId]);

  const toggleCamera = useCallback(async (): Promise<void> => {
    const next = !isCameraEnabledRef.current;
    isCameraEnabledRef.current = next;
    setIsCameraEnabled(next);
    if (options?.mediaAdapter) {
      await options.mediaAdapter.setCameraEnabled(next).catch(() => {});
    }
  }, [options?.mediaAdapter]);

  const toggleMic = useCallback(async (): Promise<void> => {
    const next = !isMicEnabledRef.current;
    isMicEnabledRef.current = next;
    setIsMicEnabled(next);
    if (options?.mediaAdapter) {
      await options.mediaAdapter.setMicrophoneEnabled(next).catch(() => {});
    }
  }, [options?.mediaAdapter]);

  const toggleScreenShare = useCallback(async (): Promise<void> => {
    const next = !isScreenSharingRef.current;
    isScreenSharingRef.current = next;
    setIsScreenSharing(next);
    if (options?.mediaAdapter) {
      await options.mediaAdapter.setScreenShareEnabled(next).catch(() => {});
    }
  }, [options?.mediaAdapter]);

  const switchCamera = useCallback(async (): Promise<void> => {
    if (options?.mediaAdapter) {
      await options.mediaAdapter.switchCamera();
    }
  }, [options?.mediaAdapter]);

  const updatePaymentPolicy = useCallback(
    async (policy: TeleconsultPaymentPolicy): Promise<void> => {
      if (options?.onUpdatePaymentPolicy) {
        await options.onUpdatePaymentPolicy(policy);
      }
      setPaymentState((prev) => {
        const canAdmit =
          policy === 'Exempt' ||
          policy === 'Postpaid' ||
          prev.status === 'Paid' ||
          prev.status === 'Overridden';
        const nextStatus =
          policy === 'Exempt'
            ? 'Exempt'
            : prev.status === 'Exempt'
            ? 'Unpaid'
            : prev.status;
        return {
          ...prev,
          policy,
          status: nextStatus,
          canAdmit
        };
      });
    },
    [options?.onUpdatePaymentPolicy]
  );

  const connectMediaIfConfigured = useCallback(
    async (
      joinRes?: {
        liveKitToken?: string;
        roomName?: string;
        wsUrl?: string;
        participantIdentity?: string;
      } | void
    ): Promise<void> => {
      const adapter = options?.mediaAdapter;
      if (!adapter || adapter.isConnected()) return;

      const resolvedRoomName =
        (joinRes && typeof joinRes === 'object' && joinRes.roomName) ||
        options?.roomName ||
        (sessionId.startsWith('call-') ? sessionId : `call-${sessionId}`);
      const resolvedIdentity =
        (joinRes && typeof joinRes === 'object' && joinRes.participantIdentity) ||
        options?.participantIdentity;

      await adapter.connect({
        url: joinRes && typeof joinRes === 'object' ? joinRes.wsUrl ?? '' : '',
        token: joinRes && typeof joinRes === 'object' ? joinRes.liveKitToken ?? '' : '',
        roomName: resolvedRoomName,
        participantIdentity: resolvedIdentity,
        audioEnabled: isMicEnabled,
        videoEnabled: isCameraEnabled
      });
    },
    [
      options?.mediaAdapter,
      options?.roomName,
      options?.participantIdentity,
      sessionId,
      isMicEnabled,
      isCameraEnabled
    ]
  );

  const admitPatient = useCallback(
    async (emergencyOverride?: EmergencyOverrideInput): Promise<void> => {
      // Guard against DOM/React Native SyntheticEvent mistakenly forwarded by click handlers
      const validOverride: EmergencyOverrideInput | undefined =
        emergencyOverride &&
        typeof emergencyOverride === 'object' &&
        !('nativeEvent' in emergencyOverride) &&
        !('currentTarget' in emergencyOverride) &&
        !('target' in emergencyOverride) &&
        'reasonNote' in emergencyOverride
          ? emergencyOverride
          : undefined;

      if (!paymentState.canAdmit && !validOverride && !paymentState.isYakapExempt) {
        throw new Error('Cannot admit patient: Prepaid consultation is unpaid.');
      }

      if (validOverride) {
        if (!validOverride.reasonNote || validOverride.reasonNote.trim().length < 5) {
          throw new Error('Override reason note must be at least 5 characters.');
        }
        setPaymentState((prev) => ({
          ...prev,
          status: 'Overridden',
          canAdmit: true,
          isEmergencyOverride: true,
          overrideReason: validOverride.reasonNote
        }));
      }

      if (options?.onAdmitPatient) {
        await options.onAdmitPatient(validOverride);
      }

      const joinRes = options?.onJoinCall ? await options.onJoinCall() : undefined;
      await connectMediaIfConfigured(joinRes);

      setIsAdmitted(true);
      setStatus('connected');
    },
    [
      paymentState.canAdmit,
      paymentState.isYakapExempt,
      options?.onAdmitPatient,
      options?.onJoinCall,
      connectMediaIfConfigured
    ]
  );

  const joinCall = useCallback(async (): Promise<void> => {
    const joinRes = options?.onJoinCall ? await options.onJoinCall() : undefined;
    await connectMediaIfConfigured(joinRes);
    setIsAdmitted(true);
    setStatus('connected');
  }, [options?.onJoinCall, connectMediaIfConfigured]);

  const requestRecordingConsent = useCallback(async (): Promise<void> => {
    const res = options?.onRequestRecordingConsent
      ? await options.onRequestRecordingConsent()
      : undefined;
    const sessionIdFromRes =
      typeof res === 'string'
        ? res
        : res && typeof res === 'object'
        ? res.recordingSessionId ?? null
        : null;
    const nextStatus =
      res && typeof res === 'object' && res.status ? res.status : 'requested';

    if (sessionIdFromRes) {
      recordingSessionIdRef.current = sessionIdFromRes;
    }

    setConsentState((prev) => ({
      ...prev,
      recordingSessionId: sessionIdFromRes ?? prev.recordingSessionId,
      status: nextStatus,
      requestedAt: new Date()
    }));
    if (nextStatus === 'approved') {
      setIsRecording(true);
    }
  }, [options?.onRequestRecordingConsent]);

  const respondToRecordingConsent = useCallback(
    async (approved: boolean, reason?: string): Promise<void> => {
      if (options?.onRespondRecordingConsent) {
        await options.onRespondRecordingConsent(approved, reason);
      }
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
    [options?.onRespondRecordingConsent]
  );

  const finalizeActiveRecording = useCallback(async (): Promise<void> => {
    if (segmentRecorderRef.current?.isRecording()) {
      try {
        await segmentRecorderRef.current.stop();
      } catch {
        // Best-effort segment flush before finalization
      }
      segmentRecorderRef.current = null;
    }
    const activeSessionId = recordingSessionIdRef.current ?? consentState.recordingSessionId;
    if (activeSessionId && options?.onFinalizeRecording) {
      try {
        await options.onFinalizeRecording(activeSessionId);
      } catch {
        // Best-effort recording session finalization
      }
    }
  }, [consentState.recordingSessionId, options?.onFinalizeRecording]);

  const revokeRecordingConsent = useCallback(
    async (reason?: string): Promise<void> => {
      await finalizeActiveRecording();
      if (options?.onRevokeRecordingConsent) {
        await options.onRevokeRecordingConsent(reason);
      }
      setConsentState((prev) => ({
        ...prev,
        status: 'revoked',
        decidedAt: new Date(),
        rejectionReason: reason
      }));
      setIsRecording(false);
    },
    [finalizeActiveRecording, options?.onRevokeRecordingConsent]
  );

  const leaveCall = useCallback(async (): Promise<void> => {
    setStatus('ended');
  }, []);

  const endCall = useCallback(async (): Promise<void> => {
    if (isRecording) {
      await finalizeActiveRecording();
      if (options?.onRevokeRecordingConsent) {
        try {
          await options.onRevokeRecordingConsent('Call ended');
        } catch {}
      }
    }
    if (options?.mediaAdapter) {
      try {
        await options.mediaAdapter.disconnect();
      } catch {}
    }
    if (options?.onEndCall) {
      await options.onEndCall();
    }
    setStatus('ended');
    setIsRecording(false);
  }, [
    isRecording,
    finalizeActiveRecording,
    options?.mediaAdapter,
    options?.onEndCall,
    options?.onRevokeRecordingConsent
  ]);

  return {
    callId: sessionId,
    roomName: options?.roomName ?? `call-${sessionId}`,
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
      revokeRecordingConsent,
      recordingDurationSeconds
    },
    updatePaymentPolicy,
    admitPatient,
    joinCall,
    leaveCall,
    endCall,
    mediaAdapter: options?.mediaAdapter,
    error
  };
}
