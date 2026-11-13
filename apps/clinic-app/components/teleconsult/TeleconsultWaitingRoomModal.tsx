import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { getActiveThemeState, subscribeActiveTheme, theme } from '../../constants/theme';
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
      draggable: false,
      style: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        userSelect: 'none',
        pointerEvents: 'none',
        transform: mirror ? 'scaleX(-1)' : undefined,
      },
    });
  },
);

export interface TeleconsultWaitingRoomModalProps {
  onNavigateToChart?: (patientId?: string, patientName?: string) => void;
}

function getThemeSchemeSnapshot(): 'light' | 'dark' {
  return getActiveThemeState().scheme;
}

function getWebBodyPortal(): ((children: React.ReactNode, container: Element) => React.ReactPortal) | null {
  if (
    Platform.OS === 'web' &&
    typeof document !== 'undefined' &&
    Boolean(document.body) &&
    typeof (globalThis as any).Bun === 'undefined'
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return (require('react-dom') as typeof import('react-dom')).createPortal;
    } catch {
      return null;
    }
  }
  return null;
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

  const content = (
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

  const webPortal = getWebBodyPortal();
  if (webPortal && typeof document !== 'undefined' && document.body) {
    return webPortal(
      <View
        pointerEvents="box-none"
        testID="teleconsult-top-portal-host"
        style={styles.teleconsultTopPortalHost}
        {...({
          dataSet: { clinicezTopLayer: 'true' },
          'data-clinicez-top-layer': 'true',
        } as any)}
      >
        {content}
      </View>,
      document.body,
    );
  }

  return content;
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
  const activeThemeScheme = useSyncExternalStore(
    subscribeActiveTheme,
    getThemeSchemeSnapshot,
    getThemeSchemeSnapshot,
  );
  const isDarkTheme = activeThemeScheme === 'dark';
  const pipStageBg = isDarkTheme ? theme.colors.background : theme.colors.surfaceInverse;
  const pipStageText = isDarkTheme ? theme.colors.text : theme.colors.textInverted;
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
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const dockWrapperRef = useRef<any>(null);
  const activeDragCleanupRef = useRef<(() => void) | null>(null);

  const [hydratedStatus, setHydratedStatus] = useState<TeleconsultStatusDto | null>(null);
  const [patientInviteUrl, setPatientInviteUrl] = useState<string | undefined>(undefined);
  const [isPipActive, setIsPipActive] = useState<boolean>(false);
  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const [isDraggingDock, setIsDraggingDock] = useState<boolean>(false);
  const [isConfirmEndCallOpen, setIsConfirmEndCallOpen] = useState<boolean>(false);
  const isPipActiveRef = useRef<boolean>(isPipActive);
  const videoOrientationRef = useRef<'portrait' | 'landscape'>(videoOrientation);
  isPipActiveRef.current = isPipActive;
  videoOrientationRef.current = videoOrientation;

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

  const participantInitials = useMemo(() => {
    const trimmed = resolvedPatientName.trim();
    if (!trimmed) return '??';
    const parts = trimmed.split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [resolvedPatientName]);

  const revealPatientChart = useCallback(() => {
    if (onOpenConsultationChart) {
      onOpenConsultationChart(appointmentId, teleconsultSession.patientId);
    } else if (onNavigateToChart) {
      onNavigateToChart(teleconsultSession.patientId, teleconsultSession.patientName);
    }
  }, [
    appointmentId,
    onNavigateToChart,
    onOpenConsultationChart,
    teleconsultSession.patientId,
    teleconsultSession.patientName,
  ]);

  const handleDockAndOpenChart = useCallback(() => {
    setIsPipActive(false);
    dockCallStage();
    revealPatientChart();
  }, [dockCallStage, revealPatientChart]);

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

  // Unified In-App Coupled Picture-in-Picture + Dock support
  const isPipSupported = true;

  const handleTogglePip = useCallback(async () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined' && document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // Ignore browser PiP exit error
      }
    }
    if (!isCallStageDocked) {
      setIsPipActive(true);
      dockCallStage();
      revealPatientChart();
      return;
    }
    setIsPipActive((prev) => !prev);
  }, [dockCallStage, isCallStageDocked, revealPatientChart]);

  const handleMaximizeStage = useCallback(() => {
    setIsPipActive(false);
    maximizeCallStage();
  }, [maximizeCallStage]);

  const handleToggleOrientation = useCallback(() => {
    setVideoOrientation((prev) => (prev === 'landscape' ? 'portrait' : 'landscape'));
  }, []);

  const stopDragPropagation = useCallback((e: any) => {
    e?.stopPropagation?.();
  }, []);

  // Continuously attach remote patient audio track across both full-screen and docked layouts
  useEffect(() => {
    if (Platform.OS !== 'web' || !isActuallyInCall) return;
    const el = remoteAudioRef.current;
    if (!el) return;

    const remoteAudioTrack = mediaAdapter.getRemoteAudioTrack();
    if (!remoteAudioTrack) {
      if (el.srcObject) {
        el.srcObject = null;
      }
      return;
    }

    const attachable = remoteAudioTrack as {
      attach?: (element: HTMLMediaElement) => void;
      detach?: (element?: HTMLMediaElement) => void;
    };

    if (typeof attachable.attach === 'function') {
      attachable.attach(el);
      return () => {
        attachable.detach?.(el);
      };
    }

    if (typeof MediaStream !== 'undefined' && remoteAudioTrack instanceof MediaStreamTrack) {
      el.srcObject = new MediaStream([remoteAudioTrack]);
      return () => {
        if (el.srcObject) {
          el.srcObject = null;
        }
      };
    }

    return undefined;
  }, [isActuallyInCall, isCallStageDocked, mediaAdapter, mediaRevision]);

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

  // Unified Draggable State with Pointer Capture (Web) + PanResponder (Native) + Viewport Clamping
  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const panOffsetRef = useRef({ x: 0, y: 0 });

  const clampDockCoordinates = useCallback((rawX: number, rawY: number) => {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 768;

    const measuredRect =
      typeof (dockWrapperRef.current as HTMLElement | null)?.getBoundingClientRect === 'function'
        ? (dockWrapperRef.current as HTMLElement).getBoundingClientRect()
        : null;

    const width =
      measuredRect && measuredRect.width > 0
        ? measuredRect.width
        : isPipActiveRef.current
          ? 348
          : 340;
    const height =
      measuredRect && measuredRect.height > 0
        ? measuredRect.height
        : isPipActiveRef.current
          ? videoOrientationRef.current === 'portrait'
            ? 286
            : 234
          : 38;

    const maxX = 16;
    const maxY = 16;
    const minX = Math.min(maxX, -(windowWidth - width - 32));
    const minY = Math.min(maxY, -(windowHeight - height - 32));

    return {
      clampedX: Math.min(maxX, Math.max(minX, rawX)),
      clampedY: Math.min(maxY, Math.max(minY, rawY)),
      minX,
      maxX,
      minY,
      maxY,
    };
  }, []);

  // Re-clamp dock wrapper whenever PiP opens/rotates so the top edge stays inside the viewport
  useEffect(() => {
    if (!isActuallyInCall || !isCallStageDocked) return;
    const rafId =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
            const { clampedX, clampedY } = clampDockCoordinates(
              panOffsetRef.current.x,
              panOffsetRef.current.y,
            );
            panOffsetRef.current = { x: clampedX, y: clampedY };
            pan.setValue({ x: clampedX, y: clampedY });
          })
        : null;

    return () => {
      if (rafId !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rafId);
      }
    };
  }, [clampDockCoordinates, isActuallyInCall, isCallStageDocked, isPipActive, pan, videoOrientation]);

  const handleWebDragPointerDown = useCallback(
    (e: any) => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      if (typeof e?.button === 'number' && e.button !== 0) return;

      activeDragCleanupRef.current?.();
      e?.preventDefault?.();

      const captureTarget = e?.currentTarget as HTMLElement | null;
      const pointerId = e?.pointerId;
      if (typeof pointerId === 'number') {
        try {
          captureTarget?.setPointerCapture?.(pointerId);
        } catch {
          // Ignore pointer capture rejection if synthetic event
        }
      }

      const startClientX = Number(e?.clientX ?? 0);
      const startClientY = Number(e?.clientY ?? 0);
      const originX = panOffsetRef.current.x;
      const originY = panOffsetRef.current.y;

      const prevUserSelect = typeof document !== 'undefined' ? document.body?.style?.userSelect : '';
      const prevCursor = typeof document !== 'undefined' ? document.body?.style?.cursor : '';
      if (typeof document !== 'undefined' && document.body?.style) {
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      setIsDraggingDock(true);

      const onPointerMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startClientX;
        const dy = moveEvent.clientY - startClientY;
        const { clampedX, clampedY } = clampDockCoordinates(originX + dx, originY + dy);
        panOffsetRef.current = { x: clampedX, y: clampedY };
        pan.setValue({ x: clampedX, y: clampedY });
      };

      const finishDrag = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', finishDrag);
        window.removeEventListener('pointercancel', finishDrag);
        window.removeEventListener('blur', finishDrag);
        if (typeof pointerId === 'number') {
          try {
            if (captureTarget?.hasPointerCapture?.(pointerId)) {
              captureTarget.releasePointerCapture?.(pointerId);
            }
          } catch {
            // Ignore release error
          }
        }
        if (typeof document !== 'undefined' && document.body?.style) {
          document.body.style.userSelect = prevUserSelect || '';
          document.body.style.cursor = prevCursor || '';
        }
        setIsDraggingDock(false);
        activeDragCleanupRef.current = null;
      };

      activeDragCleanupRef.current = finishDrag;
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', finishDrag);
      window.addEventListener('pointercancel', finishDrag);
      window.addEventListener('blur', finishDrag);
    },
    [clampDockCoordinates, pan],
  );

  useEffect(() => {
    return () => {
      activeDragCleanupRef.current?.();
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Platform.OS !== 'web',
        onMoveShouldSetPanResponder: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          if (Platform.OS === 'web') return false;
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
          const { clampedX, clampedY } = clampDockCoordinates(
            panOffsetRef.current.x + gestureState.dx,
            panOffsetRef.current.y + gestureState.dy,
          );
          pan.setValue({
            x: clampedX - panOffsetRef.current.x,
            y: clampedY - panOffsetRef.current.y,
          });
        },
        onPanResponderRelease: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          pan.flattenOffset();
          const { clampedX, clampedY } = clampDockCoordinates(
            panOffsetRef.current.x + gestureState.dx,
            panOffsetRef.current.y + gestureState.dy,
          );
          panOffsetRef.current = { x: clampedX, y: clampedY };
          pan.setValue({ x: clampedX, y: clampedY });
        },
        onPanResponderTerminate: (_: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          pan.flattenOffset();
          const { clampedX, clampedY } = clampDockCoordinates(
            panOffsetRef.current.x + gestureState.dx,
            panOffsetRef.current.y + gestureState.dy,
          );
          panOffsetRef.current = { x: clampedX, y: clampedY };
          pan.setValue({ x: clampedX, y: clampedY });
        },
      }),
    [clampDockCoordinates, pan],
  );

  const remoteAudioElement =
    Platform.OS === 'web' && isActuallyInCall ? (
      <View
        testID="persistent-remote-audio-container"
        data-testid="persistent-remote-audio-container"
        style={styles.persistentVideoHidden}
        pointerEvents="none"
        aria-hidden={true}
      >
        {React.createElement('audio', {
          ref: remoteAudioRef,
          autoPlay: true,
          playsInline: true,
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

  // Unified Floating Draggable Frame: Coupled PiP Video (Top) + Ultra-Thin ~38px Dock Bar (Bottom)
  if (isActuallyInCall && isCallStageDocked) {
    void mediaRevision;
    const remoteVideoTrack = Platform.OS === 'web' ? mediaAdapter.getRemoteVideoTrack() : null;
    const localVideoTrack =
      Platform.OS === 'web' && session.mediaTracks.isCameraEnabled
        ? mediaAdapter.getLocalVideoTrack()
        : null;
    const primaryPipTrack = remoteVideoTrack || localVideoTrack;
    const isPrimaryLocal = !remoteVideoTrack && Boolean(localVideoTrack);

    return (
      <>
        {remoteAudioElement}
        <Animated.View
          ref={dockWrapperRef}
          style={[styles.dockedBarContainer, { transform: pan.getTranslateTransform() }]}
          pointerEvents="box-none"
          testID="docked-call-mini-bar-wrapper"
        >
          <View
            testID="docked-unified-card"
            data-testid="docked-unified-card"
            style={[
              styles.dockedUnifiedCard,
              Platform.OS === 'web' && ({ isolation: 'isolate' } as any),
            ]}
          >
            {isPipActive && (
              <View
                testID="docked-pip-frame"
                data-testid="docked-pip-frame"
                style={[
                  styles.dockedPipFrame,
                  { backgroundColor: pipStageBg },
                  videoOrientation === 'portrait'
                    ? styles.dockedPipFramePortrait
                    : styles.dockedPipFrameLandscape,
                  isDraggingDock && styles.dockedGrabbing,
                  Platform.OS === 'web' && ({ touchAction: 'none', WebkitUserSelect: 'none' } as any),
                ]}
                {...panResponder.panHandlers}
                {...(Platform.OS === 'web' ? { onPointerDown: handleWebDragPointerDown } : {})}
                accessibilityLabel="Picture-in-picture consultation preview"
              >
                {primaryPipTrack ? (
                  <View style={styles.dockedPipVideoLayer} pointerEvents="none">
                    <WebVideoTrackView
                      track={primaryPipTrack}
                      muted={true}
                      mirror={isPrimaryLocal}
                    />
                  </View>
                ) : (
                  <View
                    style={[styles.dockedPipFallback, { backgroundColor: pipStageBg }]}
                    testID="docked-pip-fallback"
                    data-testid="docked-pip-fallback"
                    pointerEvents="none"
                  >
                    <View style={styles.dockedPipAvatarCircle}>
                      <ThemedText variant="bodyBold" color={theme.colors.onPrimary}>
                        {participantInitials}
                      </ThemedText>
                    </View>
                    <ThemedText variant="captionBold" color={pipStageText} numberOfLines={1}>
                      {resolvedPatientName}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textLight}>
                      {session.mediaTracks.isCameraEnabled ? 'Waiting for Patient Video' : 'Camera Off'}
                    </ThemedText>
                  </View>
                )}

                {remoteVideoTrack && localVideoTrack && (
                  <View style={[styles.dockedPipSelfInset, { backgroundColor: pipStageBg }]} pointerEvents="none">
                    <WebVideoTrackView track={localVideoTrack} muted={true} mirror={true} />
                  </View>
                )}

                {isPrimaryLocal && (
                  <View style={styles.dockedPipBadgeBottomLeft} pointerEvents="none">
                    <ThemedText variant="caption" color={pipStageText}>
                      Self Preview
                    </ThemedText>
                  </View>
                )}

                <View
                  style={styles.dockedPipOverlayBar}
                  {...(Platform.OS === 'web' ? { onPointerDown: stopDragPropagation } : {})}
                >
                  <TouchableOpacity
                    testID="btn-rotate-docked-pip"
                    data-testid="btn-rotate-docked-pip"
                    style={styles.dockedCompactButton}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={handleToggleOrientation}
                    accessibilityLabel="Toggle picture-in-picture orientation"
                    accessibilityRole="button"
                  >
                    <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="btn-close-docked-pip"
                    data-testid="btn-close-docked-pip"
                    style={styles.dockedCompactButton}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                    onPress={() => setIsPipActive(false)}
                    accessibilityLabel="Close picture-in-picture"
                    accessibilityRole="button"
                  >
                    <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <View
              style={[styles.dockedBar, isPipActive && styles.dockedBarWithPip]}
              testID="docked-call-mini-bar"
              role="toolbar"
              accessibilityLabel="Docked Consultation Call Bar"
            >
              <View
                testID="docked-drag-handle"
                data-testid="docked-drag-handle"
                style={[
                  styles.dockedDragHandle,
                  isDraggingDock && styles.dockedGrabbing,
                  Platform.OS === 'web' && ({ touchAction: 'none', WebkitUserSelect: 'none' } as any),
                ]}
                {...panResponder.panHandlers}
                {...(Platform.OS === 'web' ? { onPointerDown: handleWebDragPointerDown } : {})}
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
                  onPress={handleMaximizeStage}
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
        {remoteAudioElement}
        <CallStage
          callId={callId}
          roomName={session.roomName || callId}
          userRole={isDoctor ? 'Clinician' : 'Staff'}
          participantName={resolvedPatientName}
          selfName={user?.name || 'You'}
          hideHeader
          videoOrientation={videoOrientation}
          onToggleOrientation={handleToggleOrientation}
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
                muted={true}
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
              <ThemedText variant="title" color={theme.colors.text} style={styles.headerTitleText}>
                Virtual Waiting Room
              </ThemedText>
            </View>
            <View style={styles.headerRightActions}>
              <TouchableOpacity
                testID="btn-close-waiting-room"
                data-testid="btn-close-waiting-room"
                style={styles.headerCloseButton}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                onPress={handleCancelCall}
                accessibilityLabel="Close teleconsult waiting room"
                accessibilityRole="button"
              >
                <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.text} />
              </TouchableOpacity>
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  headerTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: theme.spacing.sm,
  },
  headerTitleText: {
    lineHeight: 22,
    includeFontPadding: false,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerCloseButton: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  teleconsultTopPortalHost: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2147483000,
  },
  dockedBarContainer: {
    position: Platform.OS === 'web' ? ('fixed' as any) : 'absolute',
    bottom: theme.spacing.xl,
    right: theme.spacing.xl,
    zIndex: 2000000,
    alignItems: 'stretch',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.transparent,
    ...theme.shadows.lg,
  },
  dockedUnifiedCard: {
    borderRadius: theme.radii.md,
    overflow: 'hidden',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.transparent,
    alignItems: 'stretch',
  },
  dockedPipFrame: {
    backgroundColor: theme.colors.surfaceInverse,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.primaryBorder,
    overflow: 'hidden',
    position: 'relative',
    cursor: 'grab' as any,
    userSelect: 'none' as any,
  },
  dockedPipFrameLandscape: {
    minWidth: 348,
    height: 196,
  },
  dockedPipFramePortrait: {
    minWidth: 320,
    height: 248,
  },
  dockedPipVideoLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  dockedPipFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceInverse,
  },
  dockedPipAvatarCircle: {
    width: theme.sizes.touchTarget,
    height: theme.sizes.touchTarget,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockedPipSelfInset: {
    position: 'absolute',
    right: theme.spacing.sm,
    bottom: theme.spacing.sm,
    width: 84,
    height: 54,
    borderRadius: theme.radii.sm,
    overflow: 'hidden',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    backgroundColor: theme.colors.surfaceInverse,
  },
  dockedPipBadgeBottomLeft: {
    position: 'absolute',
    left: theme.spacing.sm,
    bottom: theme.spacing.sm,
    backgroundColor: theme.colors.overlay,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.full,
  },
  dockedPipOverlayBar: {
    position: 'absolute',
    top: theme.spacing.xs,
    right: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  dockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    height: 38,
    maxHeight: 38,
    gap: theme.spacing.xs,
    overflow: 'hidden',
  },
  dockedBarWithPip: {
    minWidth: 320,
  },
  dockedDragHandle: {
    cursor: 'grab' as any,
    userSelect: 'none' as any,
    paddingHorizontal: 2,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockedGrabbing: {
    cursor: 'grabbing' as any,
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
    zIndex: 2000000,
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
    zIndex: 2000001,
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
