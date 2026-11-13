import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  fontSizeScale,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import { CallStageProps } from './types';

function formatDuration(totalSeconds: number = 0): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const CallStage: React.FC<CallStageProps> = ({
  callId,
  roomName,
  userRole = 'Clinician',
  participantName,
  selfName = 'You',
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing = false,
  onToggleMic,
  onToggleCamera,
  onToggleScreenShare,
  onSwitchCamera,
  isRecording = false,
  recordingDurationSeconds = 0,
  onStartRecording,
  canStartRecording = true,
  recordingConsentStatus = 'none',
  onApproveConsentPreview,
  onStopRecording,
  canStopRecording = true,
  isChatOpen = false,
  unreadChatCount = 0,
  onToggleChat,
  renderChatDrawer,
  renderWorkstationAction,
  renderCustomVideoSurface,
  renderIcon,
  hideHeader = false,
  remoteStatusLabel,
  onEndCall,
  isE2eeActive = true,
  networkQuality = 'good',
  isLoading = false,
  error = null,
  style,
  videoOrientation = 'portrait',
  onToggleOrientation,
  patientLink,
  onSharePatientLink,
  onDockCall,
  onTogglePip,
  isPipSupported,
  isPipActive = false
}) => {
  const participantInitials = useMemo(() => {
    if (!participantName) return '??';
    const parts = participantName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [participantName]);

  const remoteVideoSurface = renderCustomVideoSurface ? renderCustomVideoSurface('remote') : null;
  const localVideoSurface = renderCustomVideoSurface ? renderCustomVideoSurface('local') : null;

  return (
    <View style={[styles.container, style]}>
      {/* Top Header Bar */}
      {!hideHeader && (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.roomTitle} numberOfLines={1}>
              {participantName}
            </Text>
            <View style={styles.metaRow}>
              {isE2eeActive && (
                <View style={styles.e2eeBadge}>
                  <Text style={styles.e2eeBadgeText}>E2EE Encrypted</Text>
                </View>
              )}
              <Text style={styles.roomSubtitle}>Room: {roomName || callId}</Text>
            </View>
          </View>

          {/* Workstation Action Slot */}
          <View style={styles.headerRight}>
            {renderWorkstationAction && (
              <View style={styles.workstationSlot}>
                {renderWorkstationAction()}
              </View>
            )}

            <TouchableOpacity
              style={styles.endCallHeaderButton}
              onPress={onEndCall}
              accessibilityRole="button"
              accessibilityLabel="End consultation call"
            >
              <Text style={styles.endCallHeaderText}>End Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Persistent Red REC Banner with Single-Party Stop */}
      {isRecording && (
        <View style={styles.recBanner}>
          <View style={styles.recDotContainer}>
            <View style={styles.recDot} />
            <Text style={styles.recText}>REC</Text>
          </View>
          <Text style={styles.recTimer}>{formatDuration(recordingDurationSeconds)}</Text>
          <Text style={styles.recLabel}>Recording in progress</Text>
          {onStopRecording && canStopRecording && (
            <TouchableOpacity
              style={styles.stopRecButton}
              onPress={onStopRecording}
              accessibilityRole="button"
              accessibilityLabel="Stop recording consultation"
            >
              <Text style={styles.stopRecButtonText}>Stop Recording</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!isRecording && recordingConsentStatus === 'requested' && (
        <View style={styles.consentBanner}>
          <Text style={styles.consentBannerText}>Awaiting patient recording consent</Text>
          {onApproveConsentPreview && (
            <TouchableOpacity
              style={styles.approvePreviewButton}
              onPress={onApproveConsentPreview}
              accessibilityRole="button"
              accessibilityLabel="Approve recording consent in local preview"
            >
              <Text style={styles.approvePreviewButtonText}>Approve Preview</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Main Video View Area */}
      <View style={styles.stageBody}>
        <View style={styles.primaryVideoSurface}>
          {remoteVideoSurface ?? (
            <View style={styles.remotePlaceholder}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{participantInitials}</Text>
              </View>
              <Text style={styles.remotePlaceholderText}>{participantName}</Text>
              <Text style={styles.remoteStatusText}>
                {remoteStatusLabel ??
                  (isCameraEnabled
                    ? 'Connected • Waiting for Patient Video Stream'
                    : 'Connected • Local Camera Paused')}
              </Text>
            </View>
          )}

          {/* Picture-in-Picture Local Self-Preview Canvas */}
          <View
            style={[
              styles.pipCanvas,
              videoOrientation === 'landscape' ? styles.pipCanvasLandscape : styles.pipCanvasPortrait
            ]}
          >
            {localVideoSurface ?? (
              <View style={styles.pipPlaceholder}>
                <Text style={styles.pipLabel}>
                  {isCameraEnabled ? selfName : `${selfName} (Cam Off)`}
                </Text>
              </View>
            )}
          </View>

          {/* Bottom Floating Media Controls Toolbar */}
          <View style={styles.mediaToolbarWrapper} pointerEvents="box-none">
            <View style={styles.mediaToolbar}>
              <TouchableOpacity
                style={[styles.controlButton, !isMicEnabled && styles.controlButtonEmergency]}
                onPress={onToggleMic}
                accessibilityRole="button"
                accessibilityLabel={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {renderIcon ? (
                  renderIcon(isMicEnabled ? 'mic' : 'micOff', {
                    size: 18,
                    color: isMicEnabled ? lightColors.text : lightColors.onPrimary
                  })
                ) : (
                  <Text
                    style={[
                      styles.controlButtonText,
                      !isMicEnabled && styles.controlButtonTextInverted
                    ]}
                  >
                    {isMicEnabled ? 'MIC' : 'MUTE'}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.controlButton, !isCameraEnabled && styles.controlButtonEmergency]}
                onPress={onToggleCamera}
                accessibilityRole="button"
                accessibilityLabel={isCameraEnabled ? 'Stop video' : 'Start video'}
              >
                {renderIcon ? (
                  renderIcon(isCameraEnabled ? 'video' : 'videoOff', {
                    size: 18,
                    color: isCameraEnabled ? lightColors.text : lightColors.onPrimary
                  })
                ) : (
                  <Text
                    style={[
                      styles.controlButtonText,
                      !isCameraEnabled && styles.controlButtonTextInverted
                    ]}
                  >
                    {isCameraEnabled ? 'CAM' : 'OFF'}
                  </Text>
                )}
              </TouchableOpacity>

              {onSwitchCamera && (
                <TouchableOpacity
                  style={styles.controlButton}
                  onPress={onSwitchCamera}
                  accessibilityRole="button"
                  accessibilityLabel="Switch camera"
                >
                  {renderIcon ? (
                    renderIcon('switchCamera', { size: 18, color: lightColors.text })
                  ) : (
                    <Text style={styles.controlButtonText}>FLIP</Text>
                  )}
                </TouchableOpacity>
              )}

              {onToggleOrientation && (
                <TouchableOpacity
                  testID="btn-toggle-orientation"
                  style={styles.controlButton}
                  onPress={onToggleOrientation}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle video orientation"
                >
                  {renderIcon ? (
                    renderIcon('rotate', { size: 18, color: lightColors.text })
                  ) : (
                    <Text style={styles.controlButtonText}>ROTATE</Text>
                  )}
                </TouchableOpacity>
              )}

              {onToggleScreenShare && (
                <TouchableOpacity
                  style={[styles.controlButton, isScreenSharing && styles.controlButtonActive]}
                  onPress={onToggleScreenShare}
                  accessibilityRole="button"
                  accessibilityLabel={isScreenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
                >
                  {renderIcon ? (
                    renderIcon(isScreenSharing ? 'screenShareOff' : 'screenShare', {
                      size: 18,
                      color: isScreenSharing ? lightColors.onPrimary : lightColors.text
                    })
                  ) : (
                    <Text
                      style={[
                        styles.controlButtonText,
                        isScreenSharing && styles.controlButtonTextInverted
                      ]}
                    >
                      {isScreenSharing ? 'SHARING' : 'SHARE'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {onDockCall && (
                <TouchableOpacity
                  testID="btn-dock-call"
                  style={styles.controlButton}
                  onPress={onDockCall}
                  accessibilityRole="button"
                  accessibilityLabel="Dock call and open chart"
                >
                  {renderIcon ? (
                    renderIcon('dock', { size: 18, color: lightColors.text })
                  ) : (
                    <Text style={styles.controlButtonText}>DOCK</Text>
                  )}
                </TouchableOpacity>
              )}

              {onTogglePip && isPipSupported !== false && (
                <TouchableOpacity
                  testID="btn-toggle-pip"
                  style={[styles.controlButton, isPipActive && styles.controlButtonActive]}
                  onPress={onTogglePip}
                  accessibilityRole="button"
                  accessibilityLabel={isPipActive ? 'Exit picture in picture' : 'Toggle picture in picture'}
                >
                  {renderIcon ? (
                    renderIcon('pip', {
                      size: 18,
                      color: isPipActive ? lightColors.onPrimary : lightColors.text
                    })
                  ) : (
                    <Text
                      style={[
                        styles.controlButtonText,
                        isPipActive && styles.controlButtonTextInverted
                      ]}
                    >
                      PIP
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {onToggleChat && (
                <TouchableOpacity
                  style={[styles.controlButton, isChatOpen && styles.controlButtonActive]}
                  onPress={onToggleChat}
                  accessibilityRole="button"
                  accessibilityLabel="Toggle in-call chat"
                >
                  {renderIcon ? (
                    renderIcon('chat', {
                      size: 18,
                      color: isChatOpen ? lightColors.onPrimary : lightColors.text
                    })
                  ) : (
                    <Text
                      style={[
                        styles.controlButtonText,
                        isChatOpen && styles.controlButtonTextInverted
                      ]}
                    >
                      {unreadChatCount > 0 ? `CHAT (${unreadChatCount})` : 'CHAT'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}

              {!isRecording &&
                onStartRecording &&
                canStartRecording &&
                recordingConsentStatus !== 'requested' && (
                  <TouchableOpacity
                    style={styles.recStartButton}
                    onPress={onStartRecording}
                    accessibilityRole="button"
                    accessibilityLabel="Start Recording"
                  >
                    {renderIcon ? (
                      renderIcon('recordDot', { size: 18, color: lightColors.onPrimary })
                    ) : (
                      <Text style={styles.recStartButtonText}>REC</Text>
                    )}
                  </TouchableOpacity>
                )}

              <TouchableOpacity
                style={styles.endCallButton}
                onPress={onEndCall}
                accessibilityRole="button"
                accessibilityLabel="Leave or terminate call"
              >
                {renderIcon ? (
                  renderIcon('phoneOff', { size: 18, color: lightColors.onPrimary })
                ) : (
                  <Text style={styles.endCallButtonText}>END</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* In-Call Chat Drawer (Rendered conditionally) */}
        {isChatOpen && renderChatDrawer && (
          <View style={styles.chatDrawerContainer}>
            {renderChatDrawer()}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.surfaceInverse
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.sm,
    backgroundColor: lightColors.surfaceInverse,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.borderDark
  },
  headerLeft: {
    flex: 1,
    marginRight: spaceScale.md
  },
  roomTitle: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: lightColors.textInverted
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs,
    marginTop: spaceScale.xxs
  },
  e2eeBadge: {
    backgroundColor: lightColors.routine,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: spaceScale.xxs,
    borderRadius: radiusScale.xs
  },
  e2eeBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  roomSubtitle: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textLight
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  workstationSlot: {
    marginRight: spaceScale.xs
  },
  endCallHeaderButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    backgroundColor: lightColors.emergency,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center'
  },
  endCallHeaderText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  recBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.sm,
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderBottomWidth: 1,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs
  },
  recDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  recDot: {
    width: 10,
    height: 10,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.emergency
  },
  recText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  recTimer: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  recLabel: {
    fontSize: fontSizeScale.xs,
    color: lightColors.emergencyText
  },
  stopRecButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.sm,
    backgroundColor: lightColors.emergency,
    borderRadius: radiusScale.xs,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spaceScale.xs
  },
  stopRecButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  consentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.sm,
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderBottomWidth: 1,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs
  },
  consentBannerText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.warningText
  },
  approvePreviewButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.sm,
    backgroundColor: lightColors.warning,
    borderRadius: radiusScale.xs,
    justifyContent: 'center',
    alignItems: 'center'
  },
  approvePreviewButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  stageBody: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative'
  },
  primaryVideoSurface: {
    flex: 1,
    position: 'relative',
    backgroundColor: lightColors.surfaceInverse,
    justifyContent: 'center',
    alignItems: 'center'
  },
  remotePlaceholder: {
    alignItems: 'center',
    padding: spaceScale.xl
  },
  avatarCircle: {
    width: sizes.avatarLg,
    height: sizes.avatarLg,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spaceScale.md
  },
  avatarText: {
    fontSize: fontSizeScale['2xl'],
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  remotePlaceholderText: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: lightColors.textInverted,
    marginBottom: spaceScale.xxs
  },
  remoteStatusText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textLight
  },
  pipCanvas: {
    position: 'absolute',
    bottom: spaceScale.lg,
    right: spaceScale.lg,
    borderRadius: radiusScale.md,
    backgroundColor: lightColors.surfaceHighlight,
    borderWidth: sizes.borderWidth,
    borderColor: lightColors.borderDark,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center'
  },
  pipCanvasPortrait: {
    width: 105,
    aspectRatio: 3 / 4
  },
  pipCanvasLandscape: {
    width: 140,
    aspectRatio: 16 / 9
  },
  pipPlaceholder: {
    padding: spaceScale.xs,
    alignItems: 'center'
  },
  pipLabel: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: lightColors.text
  },
  mediaToolbarWrapper: {
    position: 'absolute',
    bottom: spaceScale.lg,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mediaToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.sm,
    backgroundColor: lightColors.overlay,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.full
  },
  controlButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs
  },
  controlButtonActive: {
    backgroundColor: lightColors.primary
  },
  controlButtonEmergency: {
    backgroundColor: lightColors.emergency
  },
  controlButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.text
  },
  controlButtonTextInverted: {
    color: lightColors.onPrimary
  },
  endCallButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs
  },
  endCallButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  recStartButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs
  },
  recStartButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  chatDrawerContainer: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: lightColors.borderDark,
    backgroundColor: lightColors.surface
  }
});
