import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import {
  createShadows,
  fontSizeScale,
  isLiveWebDom,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import { CallStageProps } from './types';
import { OverlayTooltip } from './OverlayTooltip';

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
  isPipActive = false,
  onMessagePatient,
  isRecordDisabled = false,
  recordButtonTooltip,
  colors: colorsProp,
  shadows: shadowsProp
}) => {
  const resolvedColors = useMemo(
    () => ({ ...lightColors, ...(colorsProp ?? {}) }),
    [colorsProp]
  );
  const resolvedShadows = useMemo(
    () => ({ ...createShadows(resolvedColors, isLiveWebDom), ...(shadowsProp ?? {}) }),
    [resolvedColors, shadowsProp]
  );
  const styles = useMemo(
    () => createStyles(resolvedColors, resolvedShadows),
    [resolvedColors, resolvedShadows]
  );

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

      {(networkQuality === 'poor' || networkQuality === 'reconnecting') && (
        <View
          testID="banner-network-quality"
          style={[
            styles.networkBanner,
            networkQuality === 'reconnecting' && styles.networkBannerCritical
          ]}
          accessibilityRole="alert"
        >
          <Text
            style={[
              styles.networkBannerText,
              networkQuality === 'reconnecting' && styles.networkBannerTextCritical
            ]}
          >
            {networkQuality === 'reconnecting'
              ? 'Connection Interrupted — Reconnecting video stream (audio prioritized)...'
              : 'Weak Network Connection — Video quality reduced to preserve audio.'}
          </Text>
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
              {(onSharePatientLink || onMessagePatient) && (
                <View style={styles.placeholderActionsRow}>
                  {onSharePatientLink && (
                    <TouchableOpacity
                      testID="btn-stage-copy-invite"
                      style={styles.placeholderSecondaryButton}
                      onPress={() => void onSharePatientLink()}
                      accessibilityRole="button"
                      accessibilityLabel="Copy invite link"
                    >
                      {renderIcon
                        ? renderIcon('share', { size: 16, color: resolvedColors.textInverted })
                        : null}
                      <Text style={styles.placeholderButtonText}>Copy Invite Link</Text>
                    </TouchableOpacity>
                  )}
                  {onMessagePatient && (
                    <TouchableOpacity
                      testID="btn-stage-message-patient"
                      style={styles.placeholderPrimaryButton}
                      onPress={() => void onMessagePatient()}
                      accessibilityRole="button"
                      accessibilityLabel="Message patient"
                    >
                      {renderIcon
                        ? renderIcon('chat', { size: 16, color: resolvedColors.onPrimary })
                        : null}
                      <Text style={styles.placeholderButtonText}>Message Patient</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
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
              <OverlayTooltip
                label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                colors={resolvedColors}
                shadows={resolvedShadows}
              >
                <TouchableOpacity
                  style={[styles.controlButton, !isMicEnabled && styles.controlButtonEmergency]}
                  onPress={onToggleMic}
                  accessibilityRole="button"
                  accessibilityLabel={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {renderIcon ? (
                    renderIcon(isMicEnabled ? 'mic' : 'micOff', {
                      size: 18,
                      color: isMicEnabled ? resolvedColors.text : resolvedColors.onPrimary
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
              </OverlayTooltip>

              <OverlayTooltip
                label={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                colors={resolvedColors}
                shadows={resolvedShadows}
              >
                <TouchableOpacity
                  style={[styles.controlButton, !isCameraEnabled && styles.controlButtonEmergency]}
                  onPress={onToggleCamera}
                  accessibilityRole="button"
                  accessibilityLabel={isCameraEnabled ? 'Stop video' : 'Start video'}
                >
                  {renderIcon ? (
                    renderIcon(isCameraEnabled ? 'video' : 'videoOff', {
                      size: 18,
                      color: isCameraEnabled ? resolvedColors.text : resolvedColors.onPrimary
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
              </OverlayTooltip>

              {onSwitchCamera && (
                <OverlayTooltip label="Switch camera" colors={resolvedColors} shadows={resolvedShadows}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={onSwitchCamera}
                    accessibilityRole="button"
                    accessibilityLabel="Switch camera"
                  >
                    {renderIcon ? (
                      renderIcon('switchCamera', { size: 18, color: resolvedColors.text })
                    ) : (
                      <Text style={styles.controlButtonText}>FLIP</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {onToggleOrientation && (
                <OverlayTooltip
                  label={
                    videoOrientation === 'landscape'
                      ? 'Switch to portrait view'
                      : 'Switch to landscape view'
                  }
                  colors={resolvedColors}
                  shadows={resolvedShadows}
                >
                  <TouchableOpacity
                    testID="btn-toggle-orientation"
                    style={styles.controlButton}
                    onPress={onToggleOrientation}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle video orientation"
                  >
                    {renderIcon ? (
                      renderIcon('rotate', { size: 18, color: resolvedColors.text })
                    ) : (
                      <Text style={styles.controlButtonText}>ROTATE</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {onToggleScreenShare && (
                <OverlayTooltip
                  label={isScreenSharing ? 'Stop screen share' : 'Share screen'}
                  colors={resolvedColors}
                  shadows={resolvedShadows}
                >
                  <TouchableOpacity
                    style={[styles.controlButton, isScreenSharing && styles.controlButtonActive]}
                    onPress={onToggleScreenShare}
                    accessibilityRole="button"
                    accessibilityLabel={isScreenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
                  >
                    {renderIcon ? (
                      renderIcon(isScreenSharing ? 'screenShareOff' : 'screenShare', {
                        size: 18,
                        color: isScreenSharing ? resolvedColors.onPrimary : resolvedColors.text
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
                </OverlayTooltip>
              )}

              {onDockCall && (
                <OverlayTooltip label="Dock call and open chart" colors={resolvedColors} shadows={resolvedShadows}>
                  <TouchableOpacity
                    testID="btn-dock-call"
                    style={styles.controlButton}
                    onPress={onDockCall}
                    accessibilityRole="button"
                    accessibilityLabel="Dock call and open chart"
                  >
                    {renderIcon ? (
                      renderIcon('dock', { size: 18, color: resolvedColors.text })
                    ) : (
                      <Text style={styles.controlButtonText}>DOCK</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {onTogglePip && isPipSupported !== false && (
                <OverlayTooltip
                  label={
                    isPipActive
                      ? 'Exit picture-in-picture & return'
                      : 'Minimize to picture-in-picture'
                  }
                  colors={resolvedColors}
                  shadows={resolvedShadows}
                >
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
                        color: isPipActive ? resolvedColors.onPrimary : resolvedColors.text
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
                </OverlayTooltip>
              )}

              {onToggleChat && (
                <OverlayTooltip
                  label={isChatOpen ? 'Hide in-call chat' : 'Open in-call chat'}
                  colors={resolvedColors}
                  shadows={resolvedShadows}
                >
                  <TouchableOpacity
                    testID="btn-toggle-chat"
                    style={[styles.controlButton, isChatOpen && styles.controlButtonActive]}
                    onPress={onToggleChat}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle in-call chat"
                  >
                    {renderIcon ? (
                      renderIcon('chat', {
                        size: 18,
                        color: isChatOpen ? resolvedColors.onPrimary : resolvedColors.text
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
                    {renderIcon && unreadChatCount > 0 && (
                      <View testID="badge-unread-chat" style={styles.chatUnreadBadge}>
                        <Text style={styles.chatUnreadBadgeText}>
                          {unreadChatCount > 99 ? '99+' : String(unreadChatCount)}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {!isRecording &&
                onStartRecording &&
                canStartRecording &&
                recordingConsentStatus !== 'requested' && (
                  <OverlayTooltip
                    label={
                      recordButtonTooltip ||
                      (isRecordDisabled
                        ? 'Waiting for patient to join before recording'
                        : 'Start call recording')
                    }
                    colors={resolvedColors}
                    shadows={resolvedShadows}
                  >
                    <TouchableOpacity
                      testID="btn-start-recording"
                      style={[
                        styles.recStartButton,
                        isRecordDisabled && styles.recStartButtonDisabled
                      ]}
                      onPress={() => {
                        if (!isRecordDisabled) {
                          void onStartRecording();
                        }
                      }}
                      disabled={isRecordDisabled}
                      accessibilityRole="button"
                      accessibilityLabel="Start Recording"
                    >
                      {renderIcon ? (
                        renderIcon('recordDot', {
                          size: 18,
                          color: isRecordDisabled ? resolvedColors.textMuted : resolvedColors.text
                        })
                      ) : (
                        <Text
                          style={[
                            styles.recStartButtonText,
                            isRecordDisabled && styles.recStartButtonTextDisabled
                          ]}
                        >
                          REC
                        </Text>
                      )}
                    </TouchableOpacity>
                  </OverlayTooltip>
                )}

              <OverlayTooltip label="End consultation call" colors={resolvedColors} shadows={resolvedShadows}>
                <TouchableOpacity
                  style={styles.endCallButton}
                  onPress={onEndCall}
                  accessibilityRole="button"
                  accessibilityLabel="Leave or terminate call"
                >
                  {renderIcon ? (
                    renderIcon('phoneOff', { size: 18, color: resolvedColors.onPrimary })
                  ) : (
                    <Text style={styles.endCallButtonText}>END</Text>
                  )}
                </TouchableOpacity>
              </OverlayTooltip>
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

function createStyles(
  c: Record<keyof typeof lightColors, string>,
  s: ReturnType<typeof createShadows>
) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.surfaceInverse
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.sm,
    backgroundColor: c.surfaceInverse,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark,
    ...s.sm
  },
  headerLeft: {
    flex: 1,
    marginRight: spaceScale.md
  },
  roomTitle: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    color: c.textInverted
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs,
    marginTop: spaceScale.xxs
  },
  e2eeBadge: {
    backgroundColor: c.routine,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: spaceScale.xxs,
    borderRadius: radiusScale.xs
  },
  e2eeBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  roomSubtitle: {
    fontSize: fontSizeScale.xs,
    color: c.textLight
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
    backgroundColor: c.emergency,
    borderRadius: radiusScale.sm,
    justifyContent: 'center',
    alignItems: 'center',
    ...s.dangerSm
  },
  endCallHeaderText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  recBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.sm,
    backgroundColor: c.emergencyBg,
    borderColor: c.emergencyBorder,
    borderBottomWidth: 1,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    ...s.sm
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
    backgroundColor: c.emergency
  },
  recText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.emergencyText
  },
  recTimer: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.emergencyText
  },
  recLabel: {
    fontSize: fontSizeScale.xs,
    color: c.emergencyText
  },
  stopRecButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.sm,
    backgroundColor: c.emergency,
    borderRadius: radiusScale.xs,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spaceScale.xs,
    ...s.dangerSm
  },
  stopRecButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  consentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.sm,
    backgroundColor: c.warningBg,
    borderColor: c.warningBorder,
    borderBottomWidth: 1,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    ...s.sm
  },
  consentBannerText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: c.warningText
  },
  networkBanner: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.warningBg,
    borderColor: c.warningBorder,
    borderBottomWidth: 1,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    ...s.sm
  },
  networkBannerCritical: {
    backgroundColor: c.emergencyBg,
    borderColor: c.emergencyBorder
  },
  networkBannerText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: c.warningText,
    textAlign: 'center'
  },
  networkBannerTextCritical: {
    color: c.emergencyText
  },
  approvePreviewButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.sm,
    backgroundColor: c.warning,
    borderRadius: radiusScale.xs,
    justifyContent: 'center',
    alignItems: 'center',
    ...s.sm
  },
  approvePreviewButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  stageBody: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative'
  },
  primaryVideoSurface: {
    flex: 1,
    position: 'relative',
    backgroundColor: c.surfaceInverse,
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
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spaceScale.md
  },
  avatarText: {
    fontSize: fontSizeScale['2xl'],
    fontWeight: '700',
    color: c.onPrimary
  },
  remotePlaceholderText: {
    fontSize: fontSizeScale.lg,
    fontWeight: '700',
    color: c.textInverted,
    marginBottom: spaceScale.xxs
  },
  remoteStatusText: {
    fontSize: fontSizeScale.xs,
    color: c.textLight
  },
  placeholderActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spaceScale.sm,
    marginTop: spaceScale.lg
  },
  placeholderPrimaryButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    borderRadius: radiusScale.sm,
    backgroundColor: c.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.xs,
    ...s.brandSm
  },
  placeholderSecondaryButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    borderRadius: radiusScale.sm,
    backgroundColor: c.overlay,
    borderColor: c.primaryBorder,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spaceScale.xs,
    ...s.brandSubtle
  },
  placeholderButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  pipCanvas: {
    position: 'absolute',
    bottom: spaceScale.lg,
    right: spaceScale.lg,
    borderRadius: radiusScale.md,
    backgroundColor: c.surfaceHighlight,
    borderWidth: sizes.borderWidth,
    borderColor: c.borderDark,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    ...s.lg
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
    color: c.text
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
    backgroundColor: c.overlay,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.full,
    ...s.lg
  },
  controlButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs,
    ...s.brandSubtle
  },
  controlButtonActive: {
    backgroundColor: c.primary,
    ...s.brandSm
  },
  controlButtonEmergency: {
    backgroundColor: c.emergency,
    ...s.dangerSm
  },
  controlButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.text
  },
  controlButtonTextInverted: {
    color: c.onPrimary
  },
  endCallButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs,
    ...s.dangerSm
  },
  endCallButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  recStartButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.surface,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spaceScale.xs,
    ...s.brandSubtle
  },
  recStartButtonDisabled: {
    opacity: 0.45,
    ...s.none
  },
  recStartButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.text
  },
  recStartButtonTextDisabled: {
    color: c.textMuted
  },
  chatUnreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: radiusScale.full,
    backgroundColor: c.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  chatUnreadBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  chatDrawerContainer: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: c.borderDark,
    backgroundColor: c.surface,
    ...s.lg
  }
  });
}
