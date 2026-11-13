import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Animated,
  type GestureResponderEvent,
  type PanResponderGestureState,
} from 'react-native';
import * as ReactNative from 'react-native';

const PanResponder =
  (ReactNative as any).PanResponder || {
    create: (c: any) => ({ panHandlers: {}, ...c }),
  };
import {
  CallWaitingRoom,
  CallStage,
  type CommsCallIconName,
} from '@clinicez/comms-sdk/native-ui';
import { useCallSession } from '@clinicez/comms-sdk/react';
import {
  LiveKitMediaAdapter,
  LocalPreviewMediaAdapter,
  isWebRtcSupported,
  type IMediaRoomAdapter,
  type MediaAdapterEventType,
  type MediaConnectOptions,
  type MediaConnectionState,
  type MediaEventListener,
  type RemoteMediaParticipant,
} from '@clinicez/comms-sdk/core';
import { useClinicComms, type TeleconsultSessionParams } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { clinicService, type TeleconsultStatusDto } from '../../services/clinicService';
import { notify } from '../../utils/feedback';
import { theme } from '../../constants/theme';
import CustomModal from '../ui/Modal';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import Icon, { type IconName } from '../ui/Icon';

interface WorkstationMediaAdapterOptions {
  shouldPreferLiveKit: () => boolean;
  onModeChanged: (isLocalPreview: boolean) => void;
  onTracksChanged: () => void;
}

class WorkstationMediaAdapter implements IMediaRoomAdapter {
  private activeAdapter: IMediaRoomAdapter;
  private listeners: Map<MediaAdapterEventType, Set<MediaEventListener>> = new Map();
  private unsubscribers: Array<() => void> = [];
  private readonly opts: WorkstationMediaAdapterOptions;

  constructor(opts: WorkstationMediaAdapterOptions) {
    this.opts = opts;
    this.activeAdapter = new LocalPreviewMediaAdapter();
    this.bindAdapterEvents(this.activeAdapter);
  }

  get connectionState(): MediaConnectionState {
    return this.activeAdapter.connectionState;
  }

  isConnected(): boolean {
    return this.activeAdapter.isConnected();
  }

  async connect(connectOpts: MediaConnectOptions): Promise<void> {
    if (this.activeAdapter.isConnected()) {
      return;
    }

    const useLiveKit =
      this.opts.shouldPreferLiveKit() &&
      Boolean(connectOpts.url) &&
      Boolean(connectOpts.token) &&
      isWebRtcSupported();

    if (useLiveKit) {
      const liveKit = new LiveKitMediaAdapter();
      this.swapActiveAdapter(liveKit);
      try {
        await liveKit.connect(connectOpts);
        this.opts.onModeChanged(false);
        this.opts.onTracksChanged();
        return;
      } catch {
        try {
          await liveKit.disconnect();
        } catch {
          // Ignore cleanup error before local preview fallback
        }
      }
    }

    const localPreview = new LocalPreviewMediaAdapter();
    this.swapActiveAdapter(localPreview);
    await localPreview.connect(connectOpts);
    this.opts.onModeChanged(true);
    this.opts.onTracksChanged();
  }

  async disconnect(): Promise<void> {
    await this.activeAdapter.disconnect();
    this.opts.onTracksChanged();
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    await this.activeAdapter.setMicrophoneEnabled(enabled);
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    await this.activeAdapter.setCameraEnabled(enabled);
    this.opts.onTracksChanged();
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    await this.activeAdapter.setScreenShareEnabled(enabled);
    this.opts.onTracksChanged();
  }

  async switchCamera(deviceId?: string): Promise<void> {
    await this.activeAdapter.switchCamera(deviceId);
  }

  getLocalVideoTrack(): unknown | null {
    return this.activeAdapter.getLocalVideoTrack();
  }

  getLocalAudioTrack(): unknown | null {
    return this.activeAdapter.getLocalAudioTrack();
  }

  getRemoteVideoTrack(participantIdentity?: string): unknown | null {
    return this.activeAdapter.getRemoteVideoTrack(participantIdentity);
  }

  getRemoteAudioTrack(participantIdentity?: string): unknown | null {
    return this.activeAdapter.getRemoteAudioTrack(participantIdentity);
  }

  getRemoteParticipants(): RemoteMediaParticipant[] {
    return this.activeAdapter.getRemoteParticipants();
  }

  getRecordingStream(): MediaStream | null {
    return this.activeAdapter.getRecordingStream();
  }

  on(event: MediaAdapterEventType, listener: MediaEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: MediaAdapterEventType, listener: MediaEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private swapActiveAdapter(next: IMediaRoomAdapter): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.activeAdapter = next;
    this.bindAdapterEvents(next);
  }

  private bindAdapterEvents(adapter: IMediaRoomAdapter): void {
    const events: MediaAdapterEventType[] = [
      'connected',
      'disconnected',
      'reconnecting',
      'reconnected',
      'participantJoined',
      'participantLeft',
      'trackSubscribed',
      'trackUnsubscribed',
      'localTrackChanged',
      'error',
    ];
    for (const evt of events) {
      this.unsubscribers.push(
        adapter.on(evt, (...args: unknown[]) => {
          if (evt === 'trackSubscribed' || evt === 'trackUnsubscribed' || evt === 'localTrackChanged') {
            this.opts.onTracksChanged();
          }
          const handlers = this.listeners.get(evt);
          if (handlers) {
            for (const handler of handlers) {
              handler(...args);
            }
          }
        }),
      );
    }
  }
}

/**
 * Maps statutory backend/DTO payment status ('Pending', 'Paid', 'Exempt', 'Overridden')
 * to @clinicez/comms-sdk TeleconsultPaymentStatus ('Unpaid', 'Paid', 'Exempt', 'Overridden').
 *
 * In the clinic API backend, unpaid appointments are represented by statutory status 'Pending'.
 * In comms-sdk CallWaitingRoom, prepayment admission gating explicitly checks paymentStatus === 'Unpaid'.
 */
export function mapToCommsPaymentStatus(
  status?: string | null,
  policy?: string | null,
): 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden' {
  if (status === 'Paid') return 'Paid';
  if (status === 'Overridden') return 'Overridden';
  if (status === 'Exempt' || policy === 'Exempt') return 'Exempt';
  return status === 'Pending' ? 'Unpaid' : 'Unpaid';
}

const COMMS_ICON_MAP: Record<CommsCallIconName, IconName> = {
  mic: 'mic',
  micOff: 'micOff',
  video: 'video',
  videoOff: 'videoOff',
  cameraOff: 'cameraOff',
  screenShare: 'screenShare',
  screenShareOff: 'screenShareOff',
  switchCamera: 'switchCamera',
  chat: 'messageSquare',
  recordDot: 'recordDot',
  phoneOff: 'phoneOff',
  shieldCheck: 'shieldCheck',
  lock: 'lock',
  dock: 'clipboard',
  pip: 'layoutModal',
  rotate: 'refresh',
  share: 'copy',
};

const renderCommsIcon = (
  name: CommsCallIconName,
  props?: { color?: string; size?: number },
): React.ReactNode => (
  <Icon
    name={COMMS_ICON_MAP[name]}
    size={props?.size ?? theme.sizes.iconMd}
    color={props?.color ?? theme.colors.text}
  />
);

let activeTeleconsultHostId: symbol | null = null;

function useSingletonTeleconsultHost(): boolean {
  const hostIdRef = useRef<symbol>(Symbol('teleconsult-host'));
  const [isOwner, setIsOwner] = useState<boolean>(() => {
    if (!activeTeleconsultHostId) {
      activeTeleconsultHostId = hostIdRef.current;
      return true;
    }
    return false;
  });

  useEffect(() => {
    if (!activeTeleconsultHostId || activeTeleconsultHostId === hostIdRef.current) {
      activeTeleconsultHostId = hostIdRef.current;
      setIsOwner(true);
    }
    return () => {
      if (activeTeleconsultHostId === hostIdRef.current) {
        activeTeleconsultHostId = null;
      }
    };
  }, []);

  return isOwner;
}

interface WebVideoTrackViewProps {
  track: unknown;
  muted?: boolean;
  mirror?: boolean;
}

const WebVideoTrackView: React.FC<WebVideoTrackViewProps> = React.memo(
  ({ track, muted = false, mirror = false }) => {
    const videoElRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
      const el = videoElRef.current;
      if (!el || !track) return;
      const attachable = track as {
        attach?: (element: HTMLMediaElement) => void;
        detach?: (element?: HTMLMediaElement) => void;
      };
      if (typeof attachable.attach === 'function') {
        attachable.attach(el);
        return () => {
          attachable.detach?.(el);
        };
      }
      if (typeof MediaStream !== 'undefined' && track instanceof MediaStreamTrack) {
        el.srcObject = new MediaStream([track]);
        return () => {
          if (el.srcObject) {
            el.srcObject = null;
          }
        };
      }
      return undefined;
    }, [track]);

    if (Platform.OS !== 'web' || !track) return null;

    return React.createElement('video', {
      ref: videoElRef,
      autoPlay: true,
      playsInline: true,
      muted,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        transform: mirror ? 'scaleX(-1)' : undefined,
      },
    });
  },
);

export interface TeleconsultWaitingRoomModalProps {
  onNavigateToChart?: (patientId?: string, patientName?: string) => void;
}

export default function TeleconsultWaitingRoomModal({
  onNavigateToChart,
}: TeleconsultWaitingRoomModalProps = {}) {
  const isHostOwner = useSingletonTeleconsultHost();
  const {
    teleconsultSession,
    closeTeleconsultWaitingRoom,
    isCallStageDocked,
    dockCallStage,
    maximizeCallStage,
    onOpenConsultationChart,
  } = useClinicComms();

  if (!isHostOwner || !teleconsultSession) {
    return null;
  }

  return (
    <ActiveTeleconsultModal
      key={teleconsultSession.callId || teleconsultSession.appointmentId}
      teleconsultSession={teleconsultSession}
      closeTeleconsultWaitingRoom={closeTeleconsultWaitingRoom}
      isCallStageDocked={isCallStageDocked}
      dockCallStage={dockCallStage}
      maximizeCallStage={maximizeCallStage}
      onOpenConsultationChart={onOpenConsultationChart}
      onNavigateToChart={onNavigateToChart}
    />
  );
}

interface ActiveTeleconsultModalProps {
  teleconsultSession: TeleconsultSessionParams;
  closeTeleconsultWaitingRoom: () => void;
  isCallStageDocked: boolean;
  dockCallStage: () => void;
  maximizeCallStage: () => void;
  onOpenConsultationChart?: ((appointmentId?: string, patientId?: string) => void) | null;
  onNavigateToChart?: (patientId?: string, patientName?: string) => void;
}

function ActiveTeleconsultModal({
  teleconsultSession,
  closeTeleconsultWaitingRoom,
  isCallStageDocked,
  dockCallStage,
  maximizeCallStage,
  onOpenConsultationChart,
  onNavigateToChart,
}: ActiveTeleconsultModalProps) {
  const { user } = useAuth();
  const [isInCall, setIsInCall] = useState(false);
  const [isLocalPreviewMode, setIsLocalPreviewMode] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [stagingVideoTrack, setStagingVideoTrack] = useState<MediaStreamTrack | null>(null);
  const [stagingHardwareNote, setStagingHardwareNote] = useState<string>('Initializing camera & mic...');
  const [micLevel, setMicLevel] = useState<number>(0);

  const isDoctor = user?.role === 'Doctor' || user?.role === 'Admin';
  const callId = teleconsultSession.callId || '';
  const appointmentId = teleconsultSession.appointmentId;
  const preferLiveKitRef = useRef<boolean>(false);
  const stagingStreamRef = useRef<MediaStream | null>(null);
  const recordingSessionIdRef = useRef<string | null>(
    teleconsultSession.activeRecordingSessionId ?? null,
  );
  const persistentVideoRef = useRef<HTMLVideoElement | null>(null);

  const [hydratedStatus, setHydratedStatus] = useState<TeleconsultStatusDto | null>(null);
  const [patientInviteUrl, setPatientInviteUrl] = useState<string | undefined>(undefined);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [isConfirmEndCallOpen, setIsConfirmEndCallOpen] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    if (!appointmentId) return;

    void (async () => {
      try {
        const [status, err] = await clinicService.getTeleconsultStatus(appointmentId);
        if (!isMounted || err || !status) return;
        setHydratedStatus(status);
        if (status.activeRecordingSessionId) {
          recordingSessionIdRef.current = status.activeRecordingSessionId;
        }
      } catch {
        // Fallback to initial teleconsultSession
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [appointmentId]);

  const resolvedClinicianName = useMemo(() => {
    if (isDoctor && user?.name) {
      return user.name;
    }
    if (teleconsultSession.clinicianName && teleconsultSession.clinicianName !== 'Clinic Attending') {
      return teleconsultSession.clinicianName;
    }
    if (hydratedStatus?.clinicianName) {
      return hydratedStatus.clinicianName;
    }
    return 'Attending Clinician';
  }, [isDoctor, user?.name, teleconsultSession.clinicianName, hydratedStatus?.clinicianName]);

  const resolvedPatientName =
    teleconsultSession.patientName || hydratedStatus?.patientName || 'Patient';

  const handleSharePatientLink = useCallback(async () => {
    if (!appointmentId) return;
    try {
      const [invite, err] = await clinicService.createTeleconsultGuestInvite(appointmentId);
      if (err || !invite?.inviteUrl) {
        notify.error(err?.message || 'Could not generate patient consultation link.');
        return;
      }
      setPatientInviteUrl(invite.inviteUrl);
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(invite.inviteUrl);
        notify.success('Patient consultation link copied to clipboard.');
      } else {
        notify.success('Patient link generated: ' + invite.inviteUrl);
      }
    } catch {
      notify.error('Could not generate patient consultation link.');
    }
  }, [appointmentId]);

  const stopStagingStream = useCallback(() => {
    const stream = stagingStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stagingStreamRef.current = null;
    }
    setStagingVideoTrack(null);
  }, []);

  const mediaAdapter = useMemo(
    () =>
      new WorkstationMediaAdapter({
        shouldPreferLiveKit: () => preferLiveKitRef.current,
        onModeChanged: (local) => setIsLocalPreviewMode(local),
        onTracksChanged: () => setMediaRevision((rev) => rev + 1),
      }),
    [callId],
  );

  useEffect(() => {
    recordingSessionIdRef.current = teleconsultSession.activeRecordingSessionId ?? null;
    preferLiveKitRef.current = false;
    setIsLocalPreviewMode(false);
    return () => {
      stopStagingStream();
      mediaAdapter.disconnect().catch(() => {});
    };
  }, [callId, mediaAdapter, stopStagingStream, teleconsultSession.activeRecordingSessionId]);

  const session = useCallSession(callId, {
    appointmentId,
    participantIdentity: user?.id ? `staff:${user.id}` : undefined,
    participantName: resolvedClinicianName,
    isDoctor,
    mediaAdapter,
    initialPaymentState: {
      policy: (teleconsultSession.paymentPolicy as any) || 'Prepaid',
      status: mapToCommsPaymentStatus(
        teleconsultSession.paymentStatus,
        teleconsultSession.paymentPolicy,
      ),
      canAdmit:
        teleconsultSession.paymentStatus === 'Paid' ||
        teleconsultSession.paymentPolicy === 'Exempt' ||
        teleconsultSession.paymentStatus === 'Overridden',
      isYakapExempt: teleconsultSession.isYakapExempt ?? (teleconsultSession.paymentPolicy === 'Exempt'),
      hasActiveYakapEnlistment: teleconsultSession.hasActiveYakapEnlistment ?? false,
    },
    onUpdatePaymentPolicy: async (policy) => {
      if (appointmentId) {
        const [, err] = await clinicService.updateTeleconsultPaymentPolicy(appointmentId, policy);
        if (err) {
          notify.error(err.message || 'Failed to update payment policy.');
          throw err;
        }
      }
    },
    onAdmitPatient: async (override) => {
      // Release waiting-room preview stream so active media adapter can claim hardware cleanly
      stopStagingStream();
      if (appointmentId) {
        const [, err] = await clinicService.admitTeleconsultPatient(
          appointmentId,
          override
            ? { reasonCode: override.reasonCode || 'EMERG-99', reasonNote: override.reasonNote }
            : undefined,
        );
        if (err) {
          notify.error(err.message || 'Failed to admit patient to teleconsultation.');
          throw err;
        }
      }
    },
    onJoinCall: async () => {
      stopStagingStream();
      if (appointmentId) {
        const [res, err] = await clinicService.joinTeleconsultCall(appointmentId);
        if (err) {
          if (err.status === 404) {
            preferLiveKitRef.current = false;
            return {
              roomName: callId.startsWith('call-') ? callId : `call-${callId}`,
              mediaAvailable: false,
              isFallbackToken: true,
              participantIdentity: user?.id ? `staff:${user.id}` : undefined,
            };
          }
          notify.error(err.message || 'Could not connect to consultation call.');
          throw err;
        }
        const token = res?.clinicianToken || res?.token || res?.accessToken || undefined;
        const wsUrl = res?.relayUrl || res?.liveKitServerUrl || undefined;
        const hasRealLiveKit = Boolean(
          res?.mediaAvailable && !res?.isFallbackToken && wsUrl && token && isWebRtcSupported(),
        );
        preferLiveKitRef.current = hasRealLiveKit;
        return {
          liveKitToken: token,
          roomName: res?.roomName,
          wsUrl,
          mediaAvailable: res?.mediaAvailable,
          isFallbackToken: res?.isFallbackToken,
          participantIdentity: res?.participantIdentity || (user?.id ? `staff:${user.id}` : undefined),
        };
      }
    },
    onEndCall: async () => {
      stopStagingStream();
      if (appointmentId) {
        const [, err] = await clinicService.endTeleconsultCall(appointmentId);
        if (err && err.status !== 404) {
          throw err;
        }
      }
    },
    onRequestRecordingConsent: async () => {
      if (!appointmentId) return;
      const [res, err] = await clinicService.requestRecordingConsent({
        callId: callId || undefined,
        patientId: teleconsultSession?.patientId,
        doctorId: user?.id,
        appointmentId,
        policy: (teleconsultSession?.recordingPolicy as any) || 'Both',
      });
      if (err) {
        if (err.status === 404) {
          const previewSessionId = `local-preview-${appointmentId}`;
          recordingSessionIdRef.current = previewSessionId;
          return {
            recordingSessionId: previewSessionId,
            status: 'requested',
          };
        }
        throw err;
      }
      if (res?.id) {
        recordingSessionIdRef.current = res.id;
      }
      const nextStatus =
        res?.consentStatus === 'Consented' || res?.consentStatus === 'approved'
          ? 'approved'
          : 'requested';
      return {
        recordingSessionId: res?.id,
        status: nextStatus,
      };
    },
    onRespondRecordingConsent: async (approved, reason) => {
      const sid = recordingSessionIdRef.current || session.recordingState.recordingSessionId;
      if (sid && !sid.startsWith('local-preview-')) {
        await clinicService.submitPatientRecordingConsent(sid, {
          approved,
          rejectionReason: reason,
        });
      }
    },
    onRevokeRecordingConsent: async (reason) => {
      const sid = recordingSessionIdRef.current || session.recordingState.recordingSessionId;
      if (sid && !sid.startsWith('local-preview-')) {
        await clinicService.revokeRecordingConsent(sid, reason);
      }
    },
    onSegmentUploaded: async (segment) => {
      const sid = recordingSessionIdRef.current || session.recordingState.recordingSessionId;
      if (sid && !sid.startsWith('local-preview-')) {
        await clinicService.uploadRecordingSegment(sid, segment.bytes, {
          segmentIndex: segment.segmentIndex,
          durationMs: segment.durationMs,
        });
      }
    },
    onFinalizeRecording: async (sid) => {
      if (!sid.startsWith('local-preview-')) {
        await clinicService.finalizeRecordingSession(sid);
      }
    },
  });

  const handleCancelCall = useCallback(async () => {
    setIsInCall(false);
    if ((session.status === 'connected' || session.status === 'connecting') && session.endCall) {
      try {
        await session.endCall();
      } catch {
        // Ignore endCall error on cancel
      }
    }
    closeTeleconsultWaitingRoom();
  }, [closeTeleconsultWaitingRoom, session]);

  const handleEndCall = useCallback(async () => {
    try {
      if (session.endCall) {
        await session.endCall();
      }
      notify.success('Consultation ended.');
    } catch {
      notify.error('Failed to end teleconsultation call.');
    } finally {
      setIsInCall(false);
      closeTeleconsultWaitingRoom();
    }
  }, [closeTeleconsultWaitingRoom, session]);

  const handleEnterCall = useCallback(async () => {
    try {
      if (session.joinCall) {
        await session.joinCall();
      }
      setIsInCall(true);
      notify.success('Connected to teleconsultation.');
    } catch {
      notify.error('Could not connect to consultation call.');
    }
  }, [session]);

  const isActuallyInCall = isInCall || session.status === 'connected' || session.status === 'connecting';

  // Acquire eager local camera/mic preview on Web while staging in waiting room
  useEffect(() => {
    if (Platform.OS !== 'web' || isActuallyInCall) {
      return;
    }
    let cancelled = false;
    let audioContext: AudioContext | null = null;
    let meterTimer: ReturnType<typeof setInterval> | null = null;

    const startStagingPreview = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setStagingHardwareNote('Browser preview unavailable');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stagingStreamRef.current = stream;
        const vTrack = stream.getVideoTracks()[0] ?? null;
        if (vTrack) {
          vTrack.enabled = session.mediaTracks.isCameraEnabled;
        }
        stream.getAudioTracks().forEach((t) => {
          t.enabled = session.mediaTracks.isMicEnabled;
        });
        setStagingVideoTrack(vTrack);
        setStagingHardwareNote(vTrack ? 'Camera & Mic Ready' : 'Mic Ready • No Camera');

        // Start lightweight mic level sampler
        const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx && stream.getAudioTracks().length > 0) {
          const ctx = new AudioCtx() as AudioContext;
          audioContext = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          meterTimer = setInterval(() => {
            analyser.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i += 1) {
              sum += data[i];
            }
            const avg = sum / Math.max(1, data.length);
            setMicLevel(Math.min(100, Math.round(avg * 2.2)));
          }, 150);
        }
      } catch {
        // Fallback to audio-only when camera hardware is missing or blocked
        try {
          const audioOnly = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (cancelled) {
            audioOnly.getTracks().forEach((t) => t.stop());
            return;
          }
          stagingStreamRef.current = audioOnly;
          audioOnly.getAudioTracks().forEach((t) => {
            t.enabled = session.mediaTracks.isMicEnabled;
          });
          setStagingVideoTrack(null);
          setStagingHardwareNote('Audio Only • No Camera Detected');
        } catch {
          if (!cancelled) {
            setStagingVideoTrack(null);
            setStagingHardwareNote('Preview Only (Microphone & Camera Off)');
          }
        }
      }
    };

    void startStagingPreview();

    return () => {
      cancelled = true;
      if (meterTimer) clearInterval(meterTimer);
      if (audioContext) audioContext.close().catch(() => {});
    };
    // Only re-acquire when transitioning into/out of call or callId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, isActuallyInCall]);

  // Reflect waiting-room Camera/Mic toggle changes immediately onto active staging tracks
  useEffect(() => {
    const stream = stagingStreamRef.current;
    if (!stream || isActuallyInCall) return;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = session.mediaTracks.isCameraEnabled;
    });
  }, [isActuallyInCall, session.mediaTracks.isCameraEnabled]);

  useEffect(() => {
    const stream = stagingStreamRef.current;
    if (!stream || isActuallyInCall) return;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = session.mediaTracks.isMicEnabled;
    });
    if (!session.mediaTracks.isMicEnabled) {
      setMicLevel(0);
    }
  }, [isActuallyInCall, session.mediaTracks.isMicEnabled]);

  const handleDockAndOpenChart = useCallback(() => {
    dockCallStage();
    if (onOpenConsultationChart) {
      onOpenConsultationChart(appointmentId, teleconsultSession.patientId);
    } else if (onNavigateToChart) {
      onNavigateToChart(teleconsultSession.patientId, teleconsultSession.patientName);
    }
  }, [
    appointmentId,
    dockCallStage,
    onNavigateToChart,
    onOpenConsultationChart,
    teleconsultSession.patientId,
    teleconsultSession.patientName,
  ]);

  const mappedPaymentStatus = mapToCommsPaymentStatus(
    session.paymentState.status || teleconsultSession.paymentStatus,
    session.paymentState.policy || teleconsultSession.paymentPolicy,
  );

  const recordingConsentStatus: 'Pending' | 'Approved' | 'Rejected' | 'Disabled' =
    session.recordingState.consentStatus === 'approved'
      ? 'Approved'
      : session.recordingState.consentStatus === 'declined' || session.recordingState.consentStatus === 'revoked'
        ? 'Rejected'
        : teleconsultSession.recordingPolicy === 'Disabled'
          ? 'Disabled'
          : 'Pending';

  // Native Web Picture-in-Picture Support
  const isPipSupported = useMemo(() => {
    if (Platform.OS !== 'web') return false;
    return (
      typeof document !== 'undefined' &&
      'pictureInPictureEnabled' in document &&
      Boolean(document.pictureInPictureEnabled)
    );
  }, []);

  const handleTogglePip = useCallback(async () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else if (persistentVideoRef.current) {
        await persistentVideoRef.current.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch {
      notify.info('Picture-in-picture is currently unavailable in this browser.');
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || !isActuallyInCall) return;
    const el = persistentVideoRef.current;
    if (!el) return;

    const onEnterPip = () => setIsPipActive(true);
    const onLeavePip = () => setIsPipActive(false);

    el.addEventListener('enterpictureinpicture', onEnterPip);
    el.addEventListener('leavepictureinpicture', onLeavePip);

    return () => {
      el.removeEventListener('enterpictureinpicture', onEnterPip);
      el.removeEventListener('leavepictureinpicture', onLeavePip);
    };
  }, [isActuallyInCall]);

  // Continuously attach remote video track (or local preview track) to persistent hidden video element
  useEffect(() => {
    if (Platform.OS !== 'web' || !isActuallyInCall) return;
    const el = persistentVideoRef.current;
    if (!el) return;

    const remoteTrack = mediaAdapter.getRemoteVideoTrack();
    const track = remoteTrack || mediaAdapter.getLocalVideoTrack();

    if (!track) {
      if (el.srcObject) {
        el.srcObject = null;
      }
      return;
    }

    const attachable = track as {
      attach?: (element: HTMLMediaElement) => void;
      detach?: (element?: HTMLMediaElement) => void;
    };

    if (typeof attachable.attach === 'function') {
      attachable.attach(el);
      return () => {
        attachable.detach?.(el);
      };
    }

    if (typeof MediaStream !== 'undefined' && track instanceof MediaStreamTrack) {
      el.srcObject = new MediaStream([track]);
      return () => {
        if (el.srcObject) {
          el.srcObject = null;
        }
      };
    }

    return undefined;
  }, [isActuallyInCall, mediaAdapter, mediaRevision]);

  // MediaSession API Integration on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || !isActuallyInCall) return;
    if (
      typeof navigator === 'undefined' ||
      !('mediaSession' in navigator) ||
      !navigator.mediaSession
    ) {
      return;
    }

    try {
      const MediaMetadataClass = (window as any).MediaMetadata;
      if (MediaMetadataClass) {
        navigator.mediaSession.metadata = new MediaMetadataClass({
          title: `Teleconsultation: ${resolvedPatientName}`,
          artist: `ClinicEZ • ${resolvedClinicianName}`,
          album: 'Active Consultation',
        });
      }

      navigator.mediaSession.setActionHandler('hangup' as any, () => {
        setIsConfirmEndCallOpen(true);
      });

      navigator.mediaSession.setActionHandler('togglemicrophone' as any, () => {
        session.mediaTracks.toggleMic();
      });

      navigator.mediaSession.setActionHandler('togglecamera' as any, () => {
        session.mediaTracks.toggleCamera();
      });
    } catch {
      // Ignore unsupported mediaSession actions in browser
    }

    return () => {
      try {
        navigator.mediaSession.setActionHandler('hangup' as any, null);
        navigator.mediaSession.setActionHandler('togglemicrophone' as any, null);
        navigator.mediaSession.setActionHandler('togglecamera' as any, null);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [isActuallyInCall, resolvedPatientName, resolvedClinicianName, session.mediaTracks]);

  // Draggable PanResponder with boundary clamping math
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panOffsetRef = useRef({ x: 0, y: 0 });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          return Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1;
        },
        onPanResponderGrant: () => {
          pan.setOffset({
            x: panOffsetRef.current.x,
            y: panOffsetRef.current.y,
          });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          const currentX = panOffsetRef.current.x + gestureState.dx;
          const currentY = panOffsetRef.current.y + gestureState.dy;

          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
          const barWidth = 480;
          const barHeight = 38;

          const minX = -(windowWidth - barWidth - 32);
          const maxX = 16;
          const minY = -(windowHeight - barHeight - 32);
          const maxY = 16;

          const clampedX = Math.min(maxX, Math.max(minX, currentX));
          const clampedY = Math.min(maxY, Math.max(minY, currentY));

          pan.setValue({
            x: clampedX - panOffsetRef.current.x,
            y: clampedY - panOffsetRef.current.y,
          });
        },
        onPanResponderRelease: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          pan.flattenOffset();
          const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
          const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 768;
          const barWidth = 480;
          const barHeight = 38;

          const rawX = panOffsetRef.current.x + gestureState.dx;
          const rawY = panOffsetRef.current.y + gestureState.dy;

          const minX = -(windowWidth - barWidth - 32);
          const maxX = 16;
          const minY = -(windowHeight - barHeight - 32);
          const maxY = 16;

          const finalX = Math.min(maxX, Math.max(minX, rawX));
          const finalY = Math.min(maxY, Math.max(minY, rawY));

          panOffsetRef.current = { x: finalX, y: finalY };
          pan.setValue({ x: finalX, y: finalY });
        },
      }),
    [pan],
  );

  const persistentVideoElement =
    Platform.OS === 'web' && isActuallyInCall ? (
      <View
        testID="persistent-pip-video-container"
        data-testid="persistent-pip-video-container"
        style={styles.persistentVideoHidden}
        pointerEvents="none"
        aria-hidden={true}
      >
        {React.createElement('video', {
          ref: persistentVideoRef,
          autoPlay: true,
          playsInline: true,
          muted: false,
          style: {
            width: 1,
            height: 1,
            opacity: 0,
            position: 'absolute',
            pointerEvents: 'none',
          },
        })}
      </View>
    ) : null;

  const confirmEndCallDialog = isConfirmEndCallOpen ? (
    <View
      style={styles.confirmModalOverlay}
      testID="confirm-end-call-dialog"
      data-testid="confirm-end-call-dialog"
      role="alertdialog"
      aria-modal={true}
    >
      <View style={styles.confirmModalCard}>
        <View style={styles.confirmModalHeader}>
          <Icon name="phoneOff" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
          <ThemedText variant="title" color={theme.colors.text}>
            End Teleconsultation?
          </ThemedText>
        </View>
        <ThemedText variant="body" color={theme.colors.textMuted} style={styles.confirmModalBody}>
          Are you sure you want to end this consultation with {resolvedPatientName}?
        </ThemedText>
        <View style={styles.confirmModalActions}>
          <Button
            testID="btn-cancel-end-call"
            data-testid="btn-cancel-end-call"
            variant="secondary"
            size="sm"
            title="Keep In Call"
            onPress={() => setIsConfirmEndCallOpen(false)}
            style={styles.touchableMinSize}
          />
          <Button
            testID="btn-confirm-end-call"
            data-testid="btn-confirm-end-call"
            variant="danger"
            size="sm"
            title="End Consultation"
            onPress={async () => {
              setIsConfirmEndCallOpen(false);
              await handleEndCall();
            }}
            style={styles.touchableMinSize}
          />
        </View>
      </View>
    </View>
  ) : null;

  // Ultra-Thin Draggable Dock Bar (~36-38px) when call is docked
  if (isActuallyInCall && isCallStageDocked) {
    return (
      <>
        {persistentVideoElement}
        <Animated.View
          style={[styles.dockedBarContainer, { transform: pan.getTranslateTransform() }]}
          pointerEvents="box-none"
          testID="docked-call-mini-bar-wrapper"
        >
          <View
            style={styles.dockedBar}
            testID="docked-call-mini-bar"
            role="toolbar"
            accessibilityLabel="Docked Consultation Call Bar"
          >
            <View
              testID="docked-drag-handle"
              data-testid="docked-drag-handle"
              style={styles.dockedDragHandle}
              {...panResponder.panHandlers}
              accessibilityLabel="Drag docked consultation bar"
              accessibilityRole="adjustable"
            >
              <Icon name="gripVertical" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
            </View>

            <View style={styles.dockedInfoSection}>
              <ThemedText
                variant="captionBold"
                color={theme.colors.text}
                numberOfLines={1}
                style={styles.dockedPatientName}
                testID="docked-patient-label"
                data-testid="docked-patient-label"
              >
                {resolvedPatientName}
              </ThemedText>
              {session.recordingState.isRecording && (
                <View style={styles.dockedRecordingPill}>
                  <Icon name="recordDot" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                  <ThemedText variant="caption" color={theme.colors.emergencyText}>
                    REC
                  </ThemedText>
                </View>
              )}
            </View>

            <View style={styles.dockedControlsSection}>
              <TouchableOpacity
                style={styles.dockedCompactButton}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={session.mediaTracks.toggleMic}
                accessibilityLabel={session.mediaTracks.isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                accessibilityRole="button"
              >
                <Icon
                  name={session.mediaTracks.isMicEnabled ? 'mic' : 'micOff'}
                  size={theme.sizes.iconSm}
                  color={session.mediaTracks.isMicEnabled ? theme.colors.text : theme.colors.emergencyText}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.dockedCompactButton}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={session.mediaTracks.toggleCamera}
                accessibilityLabel={session.mediaTracks.isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                accessibilityRole="button"
              >
                <Icon
                  name={session.mediaTracks.isCameraEnabled ? 'video' : 'videoOff'}
                  size={theme.sizes.iconSm}
                  color={session.mediaTracks.isCameraEnabled ? theme.colors.text : theme.colors.emergencyText}
                />
              </TouchableOpacity>

              {isPipSupported && (
                <TouchableOpacity
                  testID="btn-toggle-pip"
                  data-testid="btn-toggle-pip"
                  style={[styles.dockedCompactButton, isPipActive && styles.dockedActiveButton]}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  onPress={handleTogglePip}
                  accessibilityLabel={isPipActive ? 'Exit picture-in-picture' : 'Enter picture-in-picture'}
                  accessibilityRole="button"
                >
                  <Icon
                    name="layoutModal"
                    size={theme.sizes.iconSm}
                    color={isPipActive ? theme.colors.primaryDark : theme.colors.text}
                  />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                testID="btn-maximize-call"
                data-testid="btn-maximize-call"
                style={styles.dockedCompactButton}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={maximizeCallStage}
                accessibilityLabel="Maximize call stage"
                accessibilityRole="button"
              >
                <Icon name="maximize" size={theme.sizes.iconSm} color={theme.colors.primary} />
              </TouchableOpacity>

              <TouchableOpacity
                testID="btn-docked-end-call"
                data-testid="btn-docked-end-call"
                style={[styles.dockedCompactButton, styles.dockedEndButton]}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                onPress={() => setIsConfirmEndCallOpen(true)}
                accessibilityLabel="End consultation call"
                accessibilityRole="button"
              >
                <Icon name="phoneOff" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
        {confirmEndCallDialog}
      </>
    );
  }

  // 100% Full Screen Edge-to-Edge Call Stage without header bar or close button
  if (isActuallyInCall && !isCallStageDocked) {
    return (
      <View style={styles.fullScreenStage} testID="teleconsult-active-stage-container">
        {persistentVideoElement}
        <CallStage
          callId={callId}
          roomName={session.roomName || callId}
          userRole={isDoctor ? 'Clinician' : 'Staff'}
          participantName={resolvedPatientName}
          selfName={user?.name || 'You'}
          hideHeader
          remoteStatusLabel={
            isLocalPreviewMode
              ? 'Waiting for Patient to Connect'
              : 'Waiting for Patient Video'
          }
          renderIcon={renderCommsIcon}
          isMicEnabled={session.mediaTracks.isMicEnabled}
          isCameraEnabled={session.mediaTracks.isCameraEnabled}
          isScreenSharing={session.mediaTracks.isScreenSharing}
          onToggleMic={session.mediaTracks.toggleMic}
          onToggleCamera={session.mediaTracks.toggleCamera}
          onToggleScreenShare={session.mediaTracks.toggleScreenShare}
          isRecording={session.recordingState.isRecording}
          recordingDurationSeconds={session.recordingState.recordingDurationSeconds}
          onStartRecording={session.recordingState.requestRecordingConsent}
          canStartRecording={teleconsultSession.recordingPolicy !== 'Disabled'}
          recordingConsentStatus={session.recordingState.consentStatus}
          onApproveConsentPreview={
            isLocalPreviewMode
              ? () => session.recordingState.respondToRecordingConsent(true)
              : undefined
          }
          onStopRecording={() => session.recordingState.revokeRecordingConsent('Clinician stopped recording')}
          canStopRecording={true}
          patientLink={patientInviteUrl}
          onSharePatientLink={handleSharePatientLink}
          onDockCall={handleDockAndOpenChart}
          onTogglePip={handleTogglePip}
          isPipSupported={isPipSupported}
          isPipActive={isPipActive}
          renderCustomVideoSurface={(trackType) => {
            if (Platform.OS !== 'web') return undefined;
            if (trackType === 'local' && !session.mediaTracks.isCameraEnabled) return undefined;
            const track =
              trackType === 'local'
                ? mediaAdapter.getLocalVideoTrack()
                : mediaAdapter.getRemoteVideoTrack();
            if (!track) return undefined;
            // Keep DOM <video> instance stable across unrelated renders
            void mediaRevision;
            return (
              <WebVideoTrackView
                track={track}
                muted={trackType === 'local'}
                mirror={trackType === 'local'}
              />
            );
          }}
          onEndCall={() => setIsConfirmEndCallOpen(true)}
          renderWorkstationAction={() => (
            <Button
              testID="btn-dock-call"
              variant="secondary"
              size="sm"
              icon="clipboard"
              title="Dock Call & Chart"
              accessibilityLabel="Dock teleconsultation call and open chart"
              onPress={handleDockAndOpenChart}
              style={styles.touchableMinSize}
            />
          )}
        />
        {confirmEndCallDialog}
      </View>
    );
  }

  // Virtual Waiting Room Staging
  return (
    <CustomModal
      visible={true}
      raw
      animationType="fade"
      transparent
      backdropDismissible={false}
      onClose={handleCancelCall}
      testID="teleconsult-waiting-room-portal"
    >
      <View style={styles.overlay}>
        <View style={styles.modalCard} testID="teleconsult-waiting-room-modal" role="dialog">
          <View style={styles.headerBar}>
            <View style={styles.headerTitleGroup}>
              <Icon name="video" size={theme.sizes.iconMd} color={theme.colors.primary} />
              <View>
                <ThemedText variant="title" color={theme.colors.text}>
                  Virtual Waiting Room
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  {resolvedPatientName} • {teleconsultSession.scheduledTime}
                </ThemedText>
              </View>
            </View>
            <View style={styles.headerRightActions}>
              <Button
                testID="btn-close-waiting-room"
                variant="secondary"
                size="sm"
                icon="close"
                iconOnly
                onPress={handleCancelCall}
                accessibilityLabel="Close teleconsult waiting room"
                style={styles.touchableMinSize}
              />
            </View>
          </View>

          <View style={styles.body}>
            <CallWaitingRoom
              callId={callId}
              appointmentId={appointmentId}
              userRole={isDoctor ? 'Clinician' : 'Staff'}
              patientName={resolvedPatientName}
              clinicianName={resolvedClinicianName}
              scheduledTime={teleconsultSession.scheduledTime}
              hideHeader
              mediaModeLabel={stagingHardwareNote}
              isCameraEnabled={session.mediaTracks.isCameraEnabled}
              isMicEnabled={session.mediaTracks.isMicEnabled}
              onToggleCamera={session.mediaTracks.toggleCamera}
              onToggleMic={session.mediaTracks.toggleMic}
              micLevel={micLevel}
              renderIcon={renderCommsIcon}
              patientLink={patientInviteUrl}
              onSharePatientLink={handleSharePatientLink}
              renderVideoPreview={() => {
                if (Platform.OS === 'web' && session.mediaTracks.isCameraEnabled && stagingVideoTrack) {
                  return <WebVideoTrackView track={stagingVideoTrack} muted mirror />;
                }
                return (
                  <View style={styles.stagingPlaceholder}>
                    <Icon
                      name={session.mediaTracks.isCameraEnabled ? 'video' : 'videoOff'}
                      size={theme.sizes.iconLg}
                      color={theme.colors.textLight}
                    />
                    <ThemedText variant="small" color={theme.colors.textLight}>
                      {session.mediaTracks.isCameraEnabled
                        ? stagingHardwareNote
                        : 'Camera Paused'}
                    </ThemedText>
                  </View>
                );
              }}
              paymentPolicy={(session.paymentState.policy as any) || (teleconsultSession.paymentPolicy as any) || 'Prepaid'}
              paymentStatus={mappedPaymentStatus}
              hasActiveYakapEnlistment={
                session.paymentState.hasActiveYakapEnlistment ?? teleconsultSession.hasActiveYakapEnlistment ?? false
              }
              isYakapExempt={teleconsultSession.isYakapExempt ?? false}
              isReadyToAdmit={session.paymentState.canAdmit}
              recordingConsentStatus={recordingConsentStatus}
              onChangePaymentPolicy={session.updatePaymentPolicy}
              onStaffPaymentOverride={async (reasonNote) => {
                await session.admitPatient({ reasonCode: 'STAFF_OVERRIDE', reasonNote });
              }}
              onEmergencyPaymentOverride={async (reason) => {
                await session.admitPatient({ reasonCode: 'CLINICAL_EMERGENCY', reasonNote: reason });
              }}
              onAdmitPatient={session.admitPatient}
              onSubmitConsent={session.recordingState.respondToRecordingConsent}
              onEnterCall={handleEnterCall}
              onCancelCall={handleCancelCall}
            />
          </View>
        </View>
      </View>
    </CustomModal>
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
    maxWidth: 960,
    maxHeight: '92%',
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
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  body: {
    flex: 1,
    minHeight: 540,
  },
  stagingPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
  },
  dockedBarContainer: {
    position: 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.xl,
    zIndex: 9999,
  },
  dockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primaryBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    height: 38,
    maxHeight: 38,
    gap: theme.spacing.xs,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  dockedDragHandle: {
    cursor: 'grab' as any,
    paddingHorizontal: 2,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockedInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dockedPatientName: {
    maxWidth: 200,
  },
  dockedLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  dockedRecordingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.emergencyBg,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  dockedControlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dockedIconButton: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  dockedCompactButton: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockedActiveButton: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  dockedEndButton: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  touchableMinSize: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
  fullScreenStage: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100vw' as any,
    height: '100vh' as any,
    zIndex: 9999,
    backgroundColor: theme.colors.surface,
  },
  persistentVideoHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  confirmModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    padding: theme.spacing.lg,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  confirmModalBody: {
    lineHeight: 20,
  },
  confirmModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
