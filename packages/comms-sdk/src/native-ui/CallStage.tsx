import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
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
import { CallStageParticipant, CallStageProps } from './types';
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
  renderParticipantsIcon,
  isParticipantsOpen = false,
  onToggleParticipants,
  patientPin,
  onCopyPatientPin,
  soloWarningThresholdMs = 300_000,
  soloAutoLeaveGraceMs = 120_000,
  onSoloLeave,
  participants,
  hasRemoteParticipant,
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

  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [stageWidth, setStageWidth] = useState<number>(() =>
    isLiveWebDom && typeof window !== 'undefined' && typeof window.innerWidth === 'number'
      ? window.innerWidth
      : 1024
  );
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showSoloWarning, setShowSoloWarning] = useState(false);
  const [soloCountdown, setSoloCountdown] = useState(Math.round(soloAutoLeaveGraceMs / 1000));
  const [soloDismissedCount, setSoloDismissedCount] = useState(0);

  useEffect(() => {
    if (!isLiveWebDom || typeof window === 'undefined') return;
    const handleResize = () => {
      if (typeof window.innerWidth === 'number') {
        setStageWidth(window.innerWidth);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isCompactStage = stageWidth < 640;
  const canOfferRecordControl = Boolean(
    !isRecording &&
      onStartRecording &&
      canStartRecording &&
      recordingConsentStatus !== 'requested'
  );
  const hasMoreOptions = Boolean(
    onSwitchCamera ||
      onToggleOrientation ||
      (!isScreenSharing && onToggleScreenShare) ||
      onDockCall ||
      (onTogglePip && isPipSupported !== false) ||
      canOfferRecordControl
  );

  const hasRemote = useMemo(() => {
    if (typeof hasRemoteParticipant === 'boolean') {
      return hasRemoteParticipant;
    }
    if (participants && participants.length > 0) {
      return participants.some((p) => !p.isLocal && p.status === 'In call');
    }
    return Boolean(remoteStatusLabel && remoteStatusLabel.toLowerCase().includes('connected'));
  }, [hasRemoteParticipant, participants, remoteStatusLabel]);

  useEffect(() => {
    if (hasRemote) {
      setShowSoloWarning(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowSoloWarning(true);
      setSoloCountdown(Math.round(soloAutoLeaveGraceMs / 1000));
    }, soloWarningThresholdMs);

    return () => clearTimeout(timer);
  }, [hasRemote, soloWarningThresholdMs, soloAutoLeaveGraceMs, soloDismissedCount]);

  useEffect(() => {
    if (!showSoloWarning || hasRemote) return;

    const interval = setInterval(() => {
      setSoloCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (onSoloLeave) {
            void onSoloLeave();
          } else {
            void onEndCall();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [showSoloWarning, hasRemote, onSoloLeave, onEndCall]);

  const handleStayInCall = useCallback(() => {
    setShowSoloWarning(false);
    setSoloDismissedCount((c) => c + 1);
  }, []);

  const handleLeaveFromSolo = useCallback(() => {
    setShowSoloWarning(false);
    if (onSoloLeave) {
      void onSoloLeave();
    } else {
      void onEndCall();
    }
  }, [onSoloLeave, onEndCall]);

  const handleCopyInviteFromRoster = useCallback(async () => {
    if (onSharePatientLink) {
      await onSharePatientLink();
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    }
  }, [onSharePatientLink]);

  const handleCopyPinFromRoster = useCallback(async () => {
    if (onCopyPatientPin) {
      await onCopyPatientPin();
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    }
  }, [onCopyPatientPin]);

  const renderFallbackCopyGlyph = (copied: boolean, color: string) => {
    if (copied) {
      return (
        <View style={{ width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
          <View
            style={{
              width: 10,
              height: 6,
              borderLeftWidth: 2,
              borderBottomWidth: 2,
              borderColor: color,
              backgroundColor: resolvedColors.transparent,
              transform: [{ rotate: '-45deg' }, { translateY: -1 }]
            }}
          />
        </View>
      );
    }
    return (
      <View style={{ width: 16, height: 16, position: 'relative' }}>
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 10,
            height: 10,
            borderRadius: radiusScale.xs,
            borderWidth: 1.5,
            borderColor: color,
            backgroundColor: resolvedColors.transparent
          }}
        />
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 10,
            height: 10,
            borderRadius: radiusScale.xs,
            borderWidth: 1.5,
            borderColor: color,
            backgroundColor: resolvedColors.surfaceMuted
          }}
        />
      </View>
    );
  };

  const renderFallbackVideoOffGlyph = (color: string) => (
    <View style={{ width: 20, height: 16, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <View
        style={{
          width: 16,
          height: 12,
          borderRadius: radiusScale.xs,
          borderWidth: 1.5,
          borderColor: color,
          backgroundColor: resolvedColors.transparent
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: 20,
          height: 1.5,
          backgroundColor: color,
          transform: [{ rotate: '-35deg' }]
        }}
      />
    </View>
  );

  const deduplicatedRemotes = useMemo(() => {
    if (!participants || participants.length === 0) return [];
    const normalizedSelfName = (selfName || '').trim().toLowerCase();
    const seenIdentities = new Set<string>();
    const remotes: CallStageParticipant[] = [];

    for (const p of participants) {
      if (p.isLocal) continue;
      if (normalizedSelfName && p.name && p.name.trim().toLowerCase() === normalizedSelfName) continue;
      if (p.identity && seenIdentities.has(p.identity)) continue;
      if (p.identity) seenIdentities.add(p.identity);

      const effectiveName = (!p.name || p.name === 'Participant' || p.name.trim() === '')
        ? (participantName || 'Participant')
        : p.name;

      remotes.push({
        ...p,
        name: effectiveName
      });
    }

    return remotes;
  }, [participants, selfName, participantName]);

  const totalParticipantsCount = useMemo(() => {
    if (participants && participants.length > 0) {
      return 1 + deduplicatedRemotes.length;
    }
    return hasRemote ? 2 : 1;
  }, [participants, deduplicatedRemotes.length, hasRemote]);

  const renderRosterMicIcon = (active: boolean) => {
    if (renderIcon) {
      return renderIcon(active ? 'mic' : 'micOff', {
        size: 14,
        color: active ? resolvedColors.primary : resolvedColors.textMuted
      });
    }
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={active ? 'Microphone active' : 'Microphone muted'}
        style={{
          width: 8,
          height: 12,
          borderRadius: radiusScale.xs,
          backgroundColor: active ? resolvedColors.primary : resolvedColors.textMuted,
          opacity: active ? 1 : 0.6
        }}
      />
    );
  };

  const renderRosterCamIcon = (active: boolean) => {
    if (renderIcon) {
      return renderIcon(active ? 'video' : 'videoOff', {
        size: 14,
        color: active ? resolvedColors.primary : resolvedColors.textMuted
      });
    }
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={active ? 'Camera active' : 'Camera off'}
        style={{
          width: 11,
          height: 8,
          borderRadius: radiusScale.xs,
          backgroundColor: active ? resolvedColors.primary : resolvedColors.textMuted,
          opacity: active ? 1 : 0.6
        }}
      />
    );
  };

  const renderRosterScreenIcon = () => {
    if (renderIcon) {
      return renderIcon('screenShare', {
        size: 14,
        color: resolvedColors.primary
      });
    }
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="Screen sharing active"
        style={{
          width: 12,
          height: 9,
          borderWidth: 1.5,
          borderColor: resolvedColors.primary,
          borderRadius: radiusScale.xs
        }}
      />
    );
  };

  const renderFallbackMoreGlyph = (color: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spaceScale.xxs }}>
      <View style={{ width: 4, height: 4, borderRadius: radiusScale.full, backgroundColor: color }} />
      <View style={{ width: 4, height: 4, borderRadius: radiusScale.full, backgroundColor: color }} />
      <View style={{ width: 4, height: 4, borderRadius: radiusScale.full, backgroundColor: color }} />
    </View>
  );

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event) => {
        const nextWidth = event?.nativeEvent?.layout?.width;
        if (typeof nextWidth === 'number' && nextWidth > 0) {
          setStageWidth(nextWidth);
        }
      }}
    >
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
            </View>
          )}

          {/* Solo Participant Safeguard Warning */}
          {showSoloWarning && (
            <View testID="banner-solo-participant-warning" style={styles.soloWarningBanner}>
              <View style={{ flex: 1, marginRight: spaceScale.sm }}>
                <Text style={styles.soloWarningTitle}>Are you still waiting?</Text>
                <Text style={styles.soloWarningText}>
                  No other participants are currently in this room. You will auto-leave in {soloCountdown}s.
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spaceScale.xs }}>
                <TouchableOpacity
                  testID="btn-solo-stay"
                  style={styles.soloStayButton}
                  onPress={handleStayInCall}
                  accessibilityRole="button"
                  accessibilityLabel="Stay in Call"
                >
                  <Text style={styles.soloStayButtonText}>Stay in Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="btn-solo-leave"
                  style={styles.soloLeaveButton}
                  onPress={handleLeaveFromSolo}
                  accessibilityRole="button"
                  accessibilityLabel="Leave Room"
                >
                  <Text style={styles.soloLeaveButtonText}>Leave Room</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Screen Sharing Banner */}
          {isScreenSharing && (
            <View testID="banner-screen-sharing" style={styles.screenSharingBanner}>
              <Text style={styles.screenSharingBannerText}>You are sharing your screen</Text>
              {onToggleScreenShare && (
                <TouchableOpacity
                  style={styles.screenSharingStopButton}
                  onPress={() => void onToggleScreenShare()}
                  accessibilityRole="button"
                  accessibilityLabel="Stop Sharing"
                >
                  <Text style={styles.screenSharingStopButtonText}>Stop Sharing</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Picture-in-Picture Local Self-Preview Canvas (top-right, clear of bottom controls) */}
          {(isCameraEnabled || isScreenSharing) && (
            <View
              testID="call-stage-local-pip"
              accessibilityLabel={`${selfName} self preview`}
              style={[
                styles.pipCanvas,
                (isScreenSharing || videoOrientation === 'landscape')
                  ? styles.pipCanvasLandscape
                  : styles.pipCanvasPortrait,
                isCompactStage &&
                  ((isScreenSharing || videoOrientation === 'landscape')
                    ? styles.pipCanvasLandscapeCompact
                    : styles.pipCanvasPortraitCompact),
                showSoloWarning
                  ? styles.pipCanvasSoloOffset
                  : isScreenSharing
                    ? styles.pipCanvasShareOffset
                    : null
              ]}
            >
              {localVideoSurface ?? (
                <View style={styles.pipPlaceholder}>
                  {renderIcon
                    ? renderIcon('videoOff', { size: 20, color: resolvedColors.textMuted })
                    : renderFallbackVideoOffGlyph(resolvedColors.textMuted)}
                </View>
              )}
            </View>
          )}

          {/* Bottom Floating Media Controls Toolbar */}
          <View style={styles.mediaToolbarWrapper} pointerEvents="box-none">
            {isCompactStage && isMoreOpen && hasMoreOptions && (
              <View testID="popover-more-controls" style={styles.moreControlsPopover}>
                {onToggleScreenShare && !isScreenSharing && (
                  <TouchableOpacity
                    testID="more-menu-screen-share"
                    style={styles.moreControlRow}
                    onPress={() => {
                      setIsMoreOpen(false);
                      void onToggleScreenShare();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Share screen"
                  >
                    {renderIcon
                      ? renderIcon('screenShare', { size: 16, color: resolvedColors.onPrimary })
                      : null}
                    <Text style={styles.moreControlRowText}>Share screen</Text>
                  </TouchableOpacity>
                )}
                {onSwitchCamera && (
                  <TouchableOpacity
                    testID="more-menu-switch-camera"
                    style={styles.moreControlRow}
                    onPress={() => {
                      setIsMoreOpen(false);
                      void onSwitchCamera();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Switch camera"
                  >
                    {renderIcon
                      ? renderIcon('switchCamera', { size: 16, color: resolvedColors.onPrimary })
                      : null}
                    <Text style={styles.moreControlRowText}>Switch camera</Text>
                  </TouchableOpacity>
                )}
                {onToggleOrientation && (
                  <TouchableOpacity
                    testID="more-menu-toggle-orientation"
                    style={styles.moreControlRow}
                    onPress={() => {
                      setIsMoreOpen(false);
                      void onToggleOrientation();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle video orientation"
                  >
                    {renderIcon
                      ? renderIcon('rotate', { size: 16, color: resolvedColors.onPrimary })
                      : null}
                    <Text style={styles.moreControlRowText}>
                      {videoOrientation === 'landscape' ? 'Portrait view' : 'Landscape view'}
                    </Text>
                  </TouchableOpacity>
                )}
                {onTogglePip && isPipSupported !== false && (
                  <TouchableOpacity
                    testID="more-menu-toggle-pip"
                    style={styles.moreControlRow}
                    onPress={() => {
                      setIsMoreOpen(false);
                      void onTogglePip();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                  >
                    {renderIcon
                      ? renderIcon('pip', { size: 16, color: resolvedColors.onPrimary })
                      : null}
                    <Text style={styles.moreControlRowText}>
                      {isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                    </Text>
                  </TouchableOpacity>
                )}
                {onDockCall && (
                  <TouchableOpacity
                    testID="more-menu-dock-call"
                    style={styles.moreControlRow}
                    onPress={() => {
                      setIsMoreOpen(false);
                      void onDockCall();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Dock call and open chart"
                  >
                    {renderIcon
                      ? renderIcon('dock', { size: 16, color: resolvedColors.onPrimary })
                      : null}
                    <Text style={styles.moreControlRowText}>Dock call</Text>
                  </TouchableOpacity>
                )}
                {canOfferRecordControl && onStartRecording && (
                  <TouchableOpacity
                    testID="more-menu-start-recording"
                    disabled={isRecordDisabled}
                    style={[
                      styles.moreControlRow,
                      isRecordDisabled && styles.recStartButtonDisabled
                    ]}
                    onPress={() => {
                      if (!isRecordDisabled) {
                        setIsMoreOpen(false);
                        void onStartRecording();
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Start Recording"
                  >
                    {renderIcon
                      ? renderIcon('recordDot', {
                          size: 16,
                          color: isRecordDisabled ? resolvedColors.textMuted : resolvedColors.onPrimary
                        })
                      : null}
                    <Text
                      style={[
                        styles.moreControlRowText,
                        isRecordDisabled && styles.recStartButtonTextDisabled
                      ]}
                    >
                      Start recording
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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
                      color: resolvedColors.onPrimary
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
                      color: resolvedColors.onPrimary
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

              {!isCompactStage && onSwitchCamera && (
                <OverlayTooltip label="Switch camera" colors={resolvedColors} shadows={resolvedShadows}>
                  <TouchableOpacity
                    style={styles.controlButton}
                    onPress={onSwitchCamera}
                    accessibilityRole="button"
                    accessibilityLabel="Switch camera"
                  >
                    {renderIcon ? (
                      renderIcon('switchCamera', { size: 18, color: resolvedColors.onPrimary })
                    ) : (
                      <Text style={styles.controlButtonText}>FLIP</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {!isCompactStage && onToggleOrientation && (
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
                      renderIcon('rotate', { size: 18, color: resolvedColors.onPrimary })
                    ) : (
                      <Text style={styles.controlButtonText}>ROTATE</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {onToggleScreenShare && (!isCompactStage || isScreenSharing) && (
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
                        color: resolvedColors.onPrimary
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

              {!isCompactStage && onDockCall && (
                <OverlayTooltip label="Dock call and open chart" colors={resolvedColors} shadows={resolvedShadows}>
                  <TouchableOpacity
                    testID="btn-dock-call"
                    style={styles.controlButton}
                    onPress={onDockCall}
                    accessibilityRole="button"
                    accessibilityLabel="Dock call and open chart"
                  >
                    {renderIcon ? (
                      renderIcon('dock', { size: 18, color: resolvedColors.onPrimary })
                    ) : (
                      <Text style={styles.controlButtonText}>DOCK</Text>
                    )}
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {!isCompactStage && onTogglePip && isPipSupported !== false && (
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
                        color: resolvedColors.onPrimary
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
                        color: resolvedColors.onPrimary
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

              {onToggleParticipants && (
                <OverlayTooltip
                  label={isParticipantsOpen ? 'Hide participants' : 'Open participants'}
                  colors={resolvedColors}
                  shadows={resolvedShadows}
                >
                  <TouchableOpacity
                    testID="btn-toggle-participants"
                    style={[styles.controlButton, isParticipantsOpen && styles.controlButtonActive]}
                    onPress={onToggleParticipants}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle participants roster"
                  >
                    {renderParticipantsIcon ? (
                      renderParticipantsIcon({
                        size: 18,
                        color: resolvedColors.onPrimary
                      })
                    ) : (
                      <Text
                        style={[
                          styles.controlButtonText,
                          isParticipantsOpen && styles.controlButtonTextInverted
                        ]}
                      >
                        USERS
                      </Text>
                    )}
                    <View testID="badge-participants-count" style={styles.chatUnreadBadge}>
                      <Text style={styles.chatUnreadBadgeText}>
                        {totalParticipantsCount}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </OverlayTooltip>
              )}

              {!isCompactStage && canOfferRecordControl && onStartRecording && (
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
                        color: isRecordDisabled ? resolvedColors.textMuted : resolvedColors.onPrimary
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

              {isCompactStage && hasMoreOptions && (
                <TouchableOpacity
                  testID="btn-toggle-more-controls"
                  style={[styles.controlButton, isMoreOpen && styles.controlButtonActive]}
                  onPress={() => setIsMoreOpen((prev) => !prev)}
                  accessibilityRole="button"
                  accessibilityLabel="More call controls"
                >
                  {renderFallbackMoreGlyph(resolvedColors.onPrimary)}
                </TouchableOpacity>
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

        {/* Participants Roster Drawer (Mutually exclusive with In-Call Chat) */}
        {isParticipantsOpen && !isChatOpen && (
          <View testID="panel-participants-roster" style={styles.rosterContainer}>
            <View style={styles.rosterHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spaceScale.xs }}>
                <Text style={styles.rosterTitle}>Participants</Text>
                <View style={styles.chatUnreadBadgeInline}>
                  <Text style={styles.chatUnreadBadgeText}>{totalParticipantsCount}</Text>
                </View>
              </View>
              {onToggleParticipants && (
                <TouchableOpacity
                  testID="btn-close-participants"
                  style={styles.rosterCloseButton}
                  onPress={onToggleParticipants}
                  accessibilityRole="button"
                  accessibilityLabel="Close participants roster"
                >
                  <View style={{ width: 14, height: 14, justifyContent: 'center', alignItems: 'center' }}>
                    <View
                      style={{
                        position: 'absolute',
                        width: 14,
                        height: 2,
                        backgroundColor: resolvedColors.textMuted,
                        borderRadius: radiusScale.xs,
                        transform: [{ rotate: '45deg' }]
                      }}
                    />
                    <View
                      style={{
                        position: 'absolute',
                        width: 14,
                        height: 2,
                        backgroundColor: resolvedColors.textMuted,
                        borderRadius: radiusScale.xs,
                        transform: [{ rotate: '-45deg' }]
                      }}
                    />
                  </View>
                </TouchableOpacity>
              )}
            </View>

            {/* Invite Link & PIN Section */}
            {(patientLink || onSharePatientLink || patientPin || onCopyPatientPin) && (
              <View style={styles.rosterSection}>
                <Text style={styles.rosterSectionTitle}>Invite Link</Text>
                <View style={styles.rosterInviteRow}>
                  <Text style={styles.rosterInviteText} numberOfLines={1} ellipsizeMode="middle">
                    {patientLink || 'Consultation Invite Link'}
                  </Text>
                  {onSharePatientLink && (
                    <TouchableOpacity
                      testID="btn-roster-copy-invite"
                      style={styles.rosterCopyButton}
                      onPress={handleCopyInviteFromRoster}
                      accessibilityRole="button"
                      accessibilityLabel={copiedInvite ? 'Copied!' : 'Copy consultation invite link'}
                    >
                      {copiedInvite ? (
                        renderFallbackCopyGlyph(true, resolvedColors.successText)
                      ) : renderIcon ? (
                        renderIcon('share', { size: 16, color: resolvedColors.primary })
                      ) : (
                        renderFallbackCopyGlyph(false, resolvedColors.primary)
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {patientPin && (
                  <>
                    <Text style={[styles.rosterSectionTitle, { marginTop: spaceScale.xs }]}>Access PIN</Text>
                    <View style={styles.rosterPinRow}>
                      <Text testID="text-roster-invite-pin" style={styles.rosterPinValue}>
                        {patientPin}
                      </Text>
                      {onCopyPatientPin && (
                        <TouchableOpacity
                          testID="btn-roster-copy-pin"
                          style={styles.rosterCopyButton}
                          onPress={handleCopyPinFromRoster}
                          accessibilityRole="button"
                          accessibilityLabel={copiedPin ? 'Copied!' : 'Copy access PIN'}
                        >
                          {copiedPin ? (
                            renderFallbackCopyGlyph(true, resolvedColors.successText)
                          ) : renderIcon ? (
                            renderIcon('share', { size: 16, color: resolvedColors.primary })
                          ) : (
                            renderFallbackCopyGlyph(false, resolvedColors.primary)
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Participants List */}
            <ScrollView style={styles.rosterList}>
              <Text style={styles.rosterSectionTitle}>In Room</Text>

              {/* Local Participant (You) */}
              <View style={styles.rosterParticipantItem}>
                <View>
                  <Text style={styles.rosterParticipantName}>{selfName} (You)</Text>
                  <Text style={styles.rosterParticipantStatusBadge}>In call</Text>
                </View>
                <View style={styles.rosterStatusIcons}>
                  {renderRosterMicIcon(isMicEnabled)}
                  {renderRosterCamIcon(isCameraEnabled)}
                  {isScreenSharing && renderRosterScreenIcon()}
                </View>
              </View>

              {/* Remote Participants */}
              {deduplicatedRemotes.length > 0 ? (
                deduplicatedRemotes.map((p) => (
                  <View key={p.identity} style={styles.rosterParticipantItem}>
                    <View>
                      <Text style={styles.rosterParticipantName}>{p.name}</Text>
                      <Text
                        style={[
                          styles.rosterParticipantStatusBadge,
                          p.status === 'Waiting to join' && {
                            backgroundColor: resolvedColors.warningBg,
                            color: resolvedColors.warningText
                          }
                        ]}
                      >
                        {p.status || 'In call'}
                      </Text>
                    </View>
                    <View style={styles.rosterStatusIcons}>
                      {renderRosterMicIcon(Boolean(p.isMicActive))}
                      {renderRosterCamIcon(Boolean(p.isCameraActive))}
                      {p.isScreenSharing && renderRosterScreenIcon()}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.rosterParticipantItem}>
                  <View>
                    <Text style={styles.rosterParticipantName}>{participantName}</Text>
                    <Text
                      style={[
                        styles.rosterParticipantStatusBadge,
                        !hasRemote && {
                          backgroundColor: resolvedColors.warningBg,
                          color: resolvedColors.warningText
                        }
                      ]}
                    >
                      {hasRemote ? 'In call' : 'Waiting to join'}
                    </Text>
                  </View>
                  <View style={styles.rosterStatusIcons}>
                    {renderRosterMicIcon(hasRemote)}
                    {renderRosterCamIcon(hasRemote)}
                  </View>
                </View>
              )}
            </ScrollView>
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
    top: spaceScale.md,
    right: spaceScale.md,
    zIndex: 20,
    borderRadius: radiusScale.md,
    backgroundColor: c.surfaceHighlight,
    borderWidth: sizes.borderWidth,
    borderColor: c.borderDark,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    ...s.lg
  },
  pipCanvasSoloOffset: {
    top: 120
  },
  pipCanvasShareOffset: {
    top: 56
  },
  pipCanvasPortrait: {
    width: 105,
    aspectRatio: 3 / 4
  },
  pipCanvasPortraitCompact: {
    width: 84
  },
  pipCanvasLandscape: {
    width: 140,
    aspectRatio: 16 / 9
  },
  pipCanvasLandscapeCompact: {
    width: 112
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
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: '95%',
    gap: spaceScale.xs,
    backgroundColor: c.overlay,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.full,
    ...s.lg
  },
  moreControlsPopover: {
    marginBottom: spaceScale.sm,
    minWidth: 196,
    borderRadius: radiusScale.md,
    backgroundColor: c.surfaceInverse,
    borderWidth: sizes.borderWidth,
    borderColor: c.borderDark,
    padding: spaceScale.xs,
    gap: spaceScale.xs,
    ...s.lg
  },
  moreControlRow: {
    minHeight: sizes.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.sm,
    paddingHorizontal: spaceScale.md,
    borderRadius: radiusScale.sm
  },
  moreControlRowText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: c.onPrimary
  },
  controlButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
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
    color: c.onPrimary
  },
  controlButtonTextInverted: {
    color: c.onPrimary
  },
  endCallButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.emergency,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    ...s.dangerSm
  },
  endCallButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  recStartButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    borderRadius: radiusScale.full,
    backgroundColor: c.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,
    ...s.brandSubtle
  },
  recStartButtonDisabled: {
    opacity: 0.45,
    ...s.none
  },
  recStartButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
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
  },
  chatUnreadBadgeInline: {
    minWidth: 18,
    height: 18,
    borderRadius: radiusScale.full,
    backgroundColor: c.primary,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  rosterContainer: {
    width: 320,
    borderLeftWidth: 1,
    borderLeftColor: c.borderDark,
    backgroundColor: c.surface,
    flexDirection: 'column',
    ...s.lg
  },
  rosterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark
  },
  rosterTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: c.text
  },
  rosterCloseButton: {
    padding: spaceScale.xs,
    borderRadius: radiusScale.sm,
    backgroundColor: c.surfaceMuted,
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  rosterSection: {
    padding: spaceScale.md,
    borderBottomWidth: 1,
    borderBottomColor: c.borderDark
  },
  rosterSectionTitle: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: c.textMuted,
    marginBottom: spaceScale.xs,
    textTransform: 'uppercase'
  },
  rosterInviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceMuted,
    padding: spaceScale.sm,
    borderRadius: radiusScale.sm,
    marginBottom: spaceScale.xs
  },
  rosterInviteText: {
    flex: 1,
    fontSize: fontSizeScale.xs,
    color: c.text,
    fontFamily: 'monospace',
    marginRight: spaceScale.xs
  },
  rosterCopyButton: {
    backgroundColor: c.transparent,
    borderWidth: 0,
    padding: spaceScale.xs,
    borderRadius: radiusScale.sm,
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  rosterCopyButtonText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: c.onPrimary
  },
  rosterPinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: c.surfaceMuted,
    padding: spaceScale.sm,
    borderRadius: radiusScale.sm
  },
  rosterPinValue: {
    fontSize: fontSizeScale.md,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 2,
    color: c.text
  },
  rosterList: {
    flex: 1,
    padding: spaceScale.md
  },
  rosterParticipantItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spaceScale.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.borderLight
  },
  rosterParticipantName: {
    fontSize: fontSizeScale.sm,
    fontWeight: '600',
    color: c.text
  },
  rosterParticipantStatusBadge: {
    fontSize: fontSizeScale.xs,
    fontWeight: '600',
    color: c.primary,
    backgroundColor: c.primarySubtle,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: 2,
    borderRadius: radiusScale.xs,
    marginTop: 2
  },
  rosterStatusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  soloWarningBanner: {
    position: 'absolute',
    top: spaceScale.md,
    left: spaceScale.md,
    right: spaceScale.md,
    backgroundColor: c.warningBg,
    borderColor: c.warningBorder,
    borderWidth: 1,
    borderRadius: radiusScale.md,
    padding: spaceScale.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 30,
    ...s.md
  },
  soloWarningTitle: {
    fontSize: fontSizeScale.sm,
    fontWeight: '700',
    color: c.warningText
  },
  soloWarningText: {
    fontSize: fontSizeScale.xs,
    color: c.warningText,
    marginTop: 2
  },
  soloStayButton: {
    backgroundColor: c.primary,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.sm,
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  soloStayButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: fontSizeScale.xs
  },
  soloLeaveButton: {
    backgroundColor: c.emergency,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.sm,
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center'
  },
  soloLeaveButtonText: {
    color: c.onPrimary,
    fontWeight: '700',
    fontSize: fontSizeScale.xs
  },
  screenSharingBanner: {
    position: 'absolute',
    top: spaceScale.md,
    alignSelf: 'center',
    backgroundColor: c.primaryDark,
    borderRadius: radiusScale.full,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.sm,
    zIndex: 25,
    ...s.md
  },
  screenSharingBannerText: {
    color: c.onPrimary,
    fontSize: fontSizeScale.xs,
    fontWeight: '600'
  },
  screenSharingStopButton: {
    backgroundColor: c.emergency,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 4,
    borderRadius: radiusScale.full,
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center'
  },
  screenSharingStopButtonText: {
    color: c.onPrimary,
    fontSize: fontSizeScale.xs,
    fontWeight: '700'
  }
  });
}
