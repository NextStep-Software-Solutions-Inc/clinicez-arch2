import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, Modal, TouchableOpacity, Platform } from 'react-native';
import { CallWaitingRoom, CallStage } from '@clinicez/comms-sdk/native-ui';
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
import { useClinicComms } from '../../context/ClinicCommsContext';
import { useAuth } from '../../context/AuthContext';
import { clinicService } from '../../services/clinicService';
import { notify } from '../../utils/feedback';
import { theme } from '../../constants/theme';
import Button from '../ui/Button';
import ThemedText from '../ui/ThemedText';
import Icon from '../ui/Icon';

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

export default function TeleconsultWaitingRoomModal() {
  const {
    teleconsultSession,
    closeTeleconsultWaitingRoom,
    isCallStageDocked,
    dockCallStage,
    maximizeCallStage,
    onOpenConsultationChart,
  } = useClinicComms();
  const { user } = useAuth();
  const [isInCall, setIsInCall] = useState(false);
  const [isLocalPreviewMode, setIsLocalPreviewMode] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);

  const isDoctor = user?.role === 'Doctor' || user?.role === 'Admin';
  const callId = teleconsultSession?.callId || '';
  const appointmentId = teleconsultSession?.appointmentId;
  const preferLiveKitRef = useRef<boolean>(false);
  const recordingSessionIdRef = useRef<string | null>(
    teleconsultSession?.activeRecordingSessionId ?? null,
  );

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
    recordingSessionIdRef.current = teleconsultSession?.activeRecordingSessionId ?? null;
    preferLiveKitRef.current = false;
    setIsLocalPreviewMode(false);
    return () => {
      mediaAdapter.disconnect().catch(() => {});
    };
  }, [callId, mediaAdapter, teleconsultSession?.activeRecordingSessionId]);

  const session = useCallSession(callId, {
    appointmentId,
    participantIdentity: user?.id ? `staff:${user.id}` : undefined,
    participantName: user?.name || 'Clinic Attending',
    isDoctor,
    mediaAdapter,
    initialPaymentState: {
      policy: (teleconsultSession?.paymentPolicy as any) || 'Prepaid',
      status: mapToCommsPaymentStatus(
        teleconsultSession?.paymentStatus,
        teleconsultSession?.paymentPolicy,
      ),
      canAdmit:
        teleconsultSession?.paymentStatus === 'Paid' ||
        teleconsultSession?.paymentPolicy === 'Exempt' ||
        teleconsultSession?.paymentStatus === 'Overridden',
      isYakapExempt: teleconsultSession?.isYakapExempt ?? (teleconsultSession?.paymentPolicy === 'Exempt'),
      hasActiveYakapEnlistment: teleconsultSession?.hasActiveYakapEnlistment ?? false,
    },
    onUpdatePaymentPolicy: async (policy) => {
      if (appointmentId) {
        await clinicService.updateTeleconsultPaymentPolicy(appointmentId, policy);
      }
    },
    onAdmitPatient: async (override) => {
      if (appointmentId) {
        await clinicService.admitTeleconsultPatient(
          appointmentId,
          override
            ? { reasonCode: override.reasonCode || 'EMERG-99', reasonNote: override.reasonNote }
            : undefined,
        );
      }
    },
    onJoinCall: async () => {
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
      if (appointmentId) {
        await clinicService.endTeleconsultCall(appointmentId);
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
      notify.success('Teleconsultation ended.');
    } catch {
      notify.error('Failed to cleanly end teleconsultation session.');
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
      notify.success('Connected to encrypted teleconsultation session.');
    } catch {
      notify.error('Could not join media room.');
    }
  }, [session]);

  if (!teleconsultSession) {
    return null;
  }

  const isActuallyInCall = isInCall || session.status === 'connected' || session.status === 'connecting';

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

  // Floating Docked Mini-Bar view when call is docked
  if (isActuallyInCall && isCallStageDocked) {
    return (
      <View
        style={styles.dockedBarContainer}
        pointerEvents="box-none"
        testID="docked-call-mini-bar-wrapper"
      >
        <View
          style={styles.dockedBar}
          testID="docked-call-mini-bar"
          role="toolbar"
          accessibilityLabel="Docked Consultation Call Bar"
        >
          <View style={styles.dockedInfoSection}>
            <View style={styles.dockedLivePill}>
              <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
              <ThemedText
                variant="caption"
                color={theme.colors.primaryDark}
                testID="docked-audio-indicator"
              >
                Audio Connected
              </ThemedText>
            </View>
            <ThemedText
              variant="smallBold"
              color={theme.colors.text}
              numberOfLines={1}
              testID="docked-patient-label"
            >
              Active Call: {teleconsultSession.patientName}
            </ThemedText>
            {session.recordingState.isRecording && (
              <View style={styles.dockedRecordingPill}>
                <Icon name="dot" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                <ThemedText variant="caption" color={theme.colors.emergencyText}>
                  REC
                </ThemedText>
              </View>
            )}
          </View>

          <View style={styles.dockedControlsSection}>
            <TouchableOpacity
              style={styles.dockedIconButton}
              onPress={session.mediaTracks.toggleMic}
              accessibilityLabel={session.mediaTracks.isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
              accessibilityRole="button"
            >
              <Icon
                name={session.mediaTracks.isMicEnabled ? 'volume2' : 'volumeX'}
                size={theme.sizes.iconSm}
                color={session.mediaTracks.isMicEnabled ? theme.colors.text : theme.colors.emergencyText}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.dockedIconButton}
              onPress={session.mediaTracks.toggleCamera}
              accessibilityLabel={session.mediaTracks.isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              accessibilityRole="button"
            >
              <Icon
                name="camera"
                size={theme.sizes.iconSm}
                color={session.mediaTracks.isCameraEnabled ? theme.colors.text : theme.colors.emergencyText}
              />
            </TouchableOpacity>

            <Button
              testID="btn-maximize-call"
              variant="primary"
              size="sm"
              icon="maximize"
              title="Maximize Call"
              accessibilityLabel="Maximize call stage"
              onPress={maximizeCallStage}
              style={styles.touchableMinSize}
            />

            <Button
              testID="btn-docked-end-call"
              variant="danger"
              size="sm"
              icon="phone"
              title="End"
              accessibilityLabel="End consultation call"
              onPress={handleEndCall}
              style={styles.touchableMinSize}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <Modal visible={true} animationType="fade" transparent onRequestClose={handleCancelCall}>
      <View style={styles.overlay}>
        <View style={styles.modalCard} testID="teleconsult-waiting-room-modal" role="dialog">
          <View style={styles.headerBar}>
            <View style={styles.headerTitleGroup}>
              <Icon name="consultations" size={theme.sizes.iconMd} color={theme.colors.primary} />
              <ThemedText variant="title" color={theme.colors.text}>
                {isActuallyInCall ? 'Teleconsultation Call Stage' : 'Teleconsultation Staging Room'}
              </ThemedText>
            </View>
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

          <View style={styles.body}>
            {isActuallyInCall ? (
              <CallStage
                callId={callId}
                roomName={session.roomName || callId}
                userRole={isDoctor ? 'Clinician' : 'Staff'}
                participantName={teleconsultSession.patientName}
                selfName={user?.name || 'You'}
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
                renderCustomVideoSurface={(trackType) => {
                  if (Platform.OS !== 'web') return undefined;
                  if (trackType === 'local' && !session.mediaTracks.isCameraEnabled) return undefined;
                  const track =
                    trackType === 'local'
                      ? mediaAdapter.getLocalVideoTrack()
                      : mediaAdapter.getRemoteVideoTrack();
                  if (!track) return undefined;
                  return React.createElement('video', {
                    key: `${trackType}-${mediaRevision}`,
                    autoPlay: true,
                    playsInline: true,
                    muted: trackType === 'local',
                    style: { width: '100%', height: '100%', objectFit: 'cover' },
                    ref: (el: HTMLVideoElement | null) => {
                      if (!el) return;
                      const attachable = track as { attach?: (element: HTMLMediaElement) => void };
                      if (typeof attachable.attach === 'function') {
                        attachable.attach(el);
                      } else if (typeof MediaStream !== 'undefined' && track instanceof MediaStreamTrack) {
                        el.srcObject = new MediaStream([track]);
                      }
                    },
                  });
                }}
                onEndCall={handleEndCall}
                renderWorkstationAction={() => (
                  <Button
                    testID="btn-dock-call"
                    variant="secondary"
                    size="sm"
                    icon="clipboard"
                    title="Dock Call & Chart"
                    accessibilityLabel="Dock teleconsultation call and open chart"
                    onPress={() => {
                      dockCallStage();
                      onOpenConsultationChart?.(appointmentId, teleconsultSession.patientId);
                    }}
                    style={styles.touchableMinSize}
                  />
                )}
              />
            ) : (
              <CallWaitingRoom
                callId={callId}
                appointmentId={appointmentId}
                userRole={isDoctor ? 'Clinician' : 'Staff'}
                patientName={teleconsultSession.patientName}
                clinicianName={teleconsultSession.clinicianName}
                scheduledTime={teleconsultSession.scheduledTime}
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
  body: {
    flex: 1,
    minHeight: 540,
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.md,
    minHeight: theme.sizes.touchTarget,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  dockedInfoSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
    gap: theme.spacing.sm,
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
  touchableMinSize: {
    minHeight: theme.sizes.touchTarget,
    minWidth: theme.sizes.touchTarget,
  },
});
