import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import { CallStage } from '@clinicez/comms-sdk/native-ui';
import type { CommsCallIconName } from '@clinicez/comms-sdk/native-ui';
import { useCallSession } from '@clinicez/comms-sdk';
import Badge from '../../../components/ui/Badge';
import ThemedText from '../../../components/ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { dialog } from '../../../utils/dialog';
import {
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  SwitchCamera,
  MessageSquare,
  PhoneOff,
  RotateCw,
  Copy,
  Maximize2,
  Lock,
  ShieldCheck,
  Circle,
} from 'lucide-react-native';

type Props = StaticScreenProps<{
  callId?: string;
  appointmentId?: string;
  clinicianName?: string;
  patientName?: string;
  isRecorded?: boolean;
  roomName?: string;
  relayUrl?: string;
  joinToken?: string;
}>;

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
  }
);

export default function TeleconsultCallScreen({ route }: Props) {
  const { colors, spacing } = useAppTheme();
  const navigation = useNavigation<any>();

  const callId = route.params?.callId ?? 'call-session';
  const clinicianName = route.params?.clinicianName ?? 'Attending Clinician';
  const patientName = route.params?.patientName ?? 'You';
  const isRecorded = route.params?.isRecorded ?? false;
  const roomName = route.params?.roomName ?? (callId ? `room-${callId}` : 'teleconsult-room');

  const isDemo =
    process.env.EXPO_PUBLIC_ENABLE_DEMO_TELECONSULT === 'true' ||
    process.env.EXPO_PUBLIC_DEMO_TELECONSULT === 'true';

  const [videoOrientation, setVideoOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [, setIsFrontCamera] = useState(true);

  const session = useCallSession(callId, {
    isDoctor: false,
    participantName: clinicianName,
    roomName,
  });

  const handleEndCall = useCallback(async () => {
    const ok = await dialog.confirm({
      title: 'End Consultation',
      message: 'Are you sure you want to end this consultation visit?',
      confirmLabel: 'End Visit',
      destructive: true,
    });
    if (ok) {
      if (session.endCall) {
        await session.endCall().catch(() => {});
      }
      navigation.navigate('HomeScreen');
    }
  }, [navigation, session]);

  const renderCommsIcon = useCallback(
    (name: CommsCallIconName, props?: { color?: string; size?: number }): React.ReactNode => {
      const size = props?.size ?? 18;
      const color = props?.color ?? colors.text;

      switch (name) {
        case 'mic':
          return <Mic size={size} color={color} />;
        case 'micOff':
          return <MicOff size={size} color={color} />;
        case 'video':
          return <VideoIcon size={size} color={color} />;
        case 'videoOff':
        case 'cameraOff':
          return <VideoOff size={size} color={color} />;
        case 'switchCamera':
          return <SwitchCamera size={size} color={color} />;
        case 'rotate':
          return <RotateCw size={size} color={color} />;
        case 'chat':
          return <MessageSquare size={size} color={color} />;
        case 'phoneOff':
          return <PhoneOff size={size} color={color} />;
        case 'dock':
        case 'share':
          return <Copy size={size} color={color} />;
        case 'pip':
          return <Maximize2 size={size} color={color} />;
        case 'lock':
          return <Lock size={size} color={color} />;
        case 'shieldCheck':
          return <ShieldCheck size={size} color={color} />;
        case 'recordDot':
          return <Circle size={size} color={color} fill={color} />;
        default:
          return null;
      }
    },
    [colors.text]
  );

  const renderVideoSurface = useCallback(
    (trackType: 'remote' | 'local') => {
      if (Platform.OS !== 'web') return undefined;
      if (trackType === 'local' && !session.mediaTracks.isCameraEnabled) return undefined;
      const track =
        trackType === 'local'
          ? session.mediaAdapter?.getLocalVideoTrack()
          : session.mediaAdapter?.getRemoteVideoTrack();
      if (!track) return undefined;
      return (
        <WebVideoTrackView
          track={track}
          muted={trackType === 'local'}
          mirror={trackType === 'local'}
        />
      );
    },
    [session.mediaAdapter, session.mediaTracks.isCameraEnabled]
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Top Header Overlay with Status Badge */}
      <View
        style={[
          styles.topBar,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
        ]}
      >
        <View style={styles.topInfo}>
          <ThemedText variant="bodyBold" numberOfLines={1}>
            {clinicianName}
          </ThemedText>
          <ThemedText variant="caption" color="textMuted">
            {isDemo ? `Private Video Visit • ${callId}` : 'Private Video Visit'}
          </ThemedText>
        </View>

        <View style={[styles.topActions, { gap: spacing.xs }]}>
          {isRecorded && <Badge label="REC" tone="danger" size="sm" />}
          <Badge
            label={isDemo ? 'Connected' : 'Waiting for Host'}
            tone={isDemo ? 'success' : 'warning'}
            size="sm"
          />
        </View>
      </View>

      {/* Main Video Call Stage */}
      <View style={styles.stageContainer}>
        <CallStage
          callId={callId}
          roomName={session.roomName || roomName}
          userRole="Patient"
          participantName={clinicianName}
          selfName={patientName}
          isMicEnabled={session.mediaTracks.isMicEnabled}
          isCameraEnabled={session.mediaTracks.isCameraEnabled}
          isScreenSharing={session.mediaTracks.isScreenSharing}
          onToggleMic={session.mediaTracks.toggleMic}
          onToggleCamera={session.mediaTracks.toggleCamera}
          onSwitchCamera={() => {
            session.mediaTracks.switchCamera().catch(() => {});
            setIsFrontCamera((prev) => !prev);
          }}
          videoOrientation={videoOrientation}
          onToggleOrientation={() =>
            setVideoOrientation((prev) => (prev === 'portrait' ? 'landscape' : 'portrait'))
          }
          isRecording={isRecorded || session.recordingState.isRecording}
          recordingDurationSeconds={session.recordingState.recordingDurationSeconds}
          recordingConsentStatus={isRecorded ? 'approved' : session.recordingState.consentStatus}
          remoteStatusLabel={
            isDemo
              ? 'Connected • Live Video Ready'
              : 'Teleconsultation session will connect once your physician initiates the call room'
          }
          renderIcon={renderCommsIcon}
          renderCustomVideoSurface={renderVideoSurface}
          onEndCall={handleEndCall}
          hideHeader
          style={styles.callStageFill}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  topInfo: {
    flex: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stageContainer: {
    flex: 1,
  },
  callStageFill: {
    flex: 1,
  },
});
