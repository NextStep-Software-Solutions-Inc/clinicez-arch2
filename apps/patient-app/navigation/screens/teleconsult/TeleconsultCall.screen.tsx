import React, { useCallback, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StaticScreenProps } from '@react-navigation/native';
import Screen from '../../../components/layout/Screen';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import Button from '../../../components/ui/Button';
import { AppIcon } from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { dialog } from '../../../utils/dialog';

type Props = StaticScreenProps<{
  callId?: string;
  appointmentId?: string;
  clinicianName?: string;
  isRecorded?: boolean;
}>;

export default function TeleconsultCallScreen({ route }: Props) {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();

  const callId = route.params?.callId ?? 'call-session';
  const clinicianName = route.params?.clinicianName ?? 'Attending Clinician';
  const isRecorded = route.params?.isRecorded ?? false;
  const isDemo =
    process.env.EXPO_PUBLIC_ENABLE_DEMO_TELECONSULT === 'true' ||
    process.env.EXPO_PUBLIC_DEMO_TELECONSULT === 'true';

  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  const handleEndCall = useCallback(async () => {
    const ok = await dialog.confirm({
      title: 'Leave Teleconsultation',
      message: 'Are you sure you want to end this teleconsultation call?',
      confirmLabel: 'End Call',
      destructive: true,
    });
    if (ok) {
      navigation.navigate('HomeScreen');
    }
  }, [navigation]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Top Header Overlay */}
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
            {isDemo ? `Encrypted Teleconsultation • ${callId}` : 'Encrypted Teleconsultation'}
          </ThemedText>
        </View>

        <View style={[styles.topActions, { gap: spacing.xs }]}>
          {isRecorded && (
            <Badge label="REC" tone="danger" size="sm" />
          )}
          <Badge
            label={isDemo ? 'Connected' : 'Waiting for Host'}
            tone={isDemo ? 'success' : 'warning'}
            size="sm"
          />
        </View>
      </View>

      {/* Main Remote Video Area */}
      <View style={styles.videoContainer}>
        <View
          style={[
            styles.remoteVideoSurface,
            {
              backgroundColor: colors.surfaceSubtle,
              borderColor: colors.border,
              borderRadius: radii.lg,
            },
          ]}
        >
          <View style={styles.clinicianCenter}>
            <View
              style={[
                styles.clinicianAvatar,
                {
                  backgroundColor: colors.primaryLight,
                  borderRadius: radii.full,
                },
              ]}
            >
              <AppIcon name="user" size={48} color="primary" />
            </View>
            <ThemedText variant="h3" style={{ marginTop: spacing.sm }}>
              {clinicianName}
            </ThemedText>
            <ThemedText variant="small" color="textSecondary" style={{ textAlign: 'center', marginTop: spacing.xs, paddingHorizontal: spacing.md }}>
              {isDemo
                ? 'Attending Physician (Audio & Video Live)'
                : 'Teleconsultation session will connect once your physician initiates the call room'}
            </ThemedText>
          </View>

          {/* Local Patient PiP (Picture-in-Picture) */}
          <View
            style={[
              styles.pipBox,
              {
                backgroundColor: colors.surface,
                borderColor: colors.primary,
                borderRadius: radii.md,
                padding: spacing.xs,
              },
            ]}
          >
            <View
              style={[
                styles.pipPlaceholder,
                {
                  backgroundColor: colors.surfaceSubtle,
                  borderRadius: radii.sm,
                },
              ]}
            >
              <AppIcon
                name={isCameraOff ? 'eyeOff' : 'camera'}
                size={20}
                color={isCameraOff ? 'textMuted' : 'primary'}
              />
              <ThemedText variant="caption" color="textMuted">
                {isCameraOff ? 'Self-view Off' : 'You (Live)'}
              </ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* Bottom Call Controls Dock */}
      <View
        style={[
          styles.controlsDock,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.md,
            gap: spacing.md,
          },
        ]}
      >
        <IconButton
          icon={isMuted ? 'alert' : 'check'}
          accessibilityLabel={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          color={isMuted ? 'emergency' : 'text'}
          tone={isMuted ? 'filled' : 'plain'}
          hitSize={52}
          onPress={() => setIsMuted((prev) => !prev)}
        />

        <IconButton
          icon={isCameraOff ? 'eyeOff' : 'camera'}
          accessibilityLabel={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          color={isCameraOff ? 'emergency' : 'text'}
          tone={isCameraOff ? 'filled' : 'plain'}
          hitSize={52}
          onPress={() => setIsCameraOff((prev) => !prev)}
        />

        <IconButton
          icon="refresh"
          accessibilityLabel="Flip Camera"
          color="text"
          hitSize={52}
          onPress={() => setIsFrontCamera((prev) => !prev)}
        />

        <IconButton
          icon="chat"
          accessibilityLabel="Toggle Chat"
          color={isChatOpen ? 'primary' : 'text'}
          tone={isChatOpen ? 'filled' : 'plain'}
          hitSize={52}
          onPress={() => setIsChatOpen((prev) => !prev)}
        />

        <IconButton
          icon="close"
          accessibilityLabel="End Call"
          color="emergency"
          tone="filled"
          hitSize={52}
          onPress={handleEndCall}
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
  videoContainer: {
    flex: 1,
    padding: 12,
  },
  remoteVideoSurface: {
    flex: 1,
    borderWidth: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicianCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clinicianAvatar: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipBox: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 110,
    height: 140,
    borderWidth: 1.5,
    elevation: 4,
  },
  pipPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  controlsDock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
