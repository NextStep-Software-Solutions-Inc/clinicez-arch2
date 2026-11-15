import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { WebCallStageProps } from './types';
import { OverlayTooltip } from './OverlayTooltip';
import { resolveWebTheme } from './shadows';
import {
  MicIcon,
  MicOffIcon,
  VideoIcon,
  VideoOffIcon,
  ScreenShareIcon,
  UsersIcon,
  MessageSquareIcon,
  CircleDotIcon,
  PhoneOffIcon,
  DockIcon,
  PipIcon,
  RotateCwIcon,
  CopyIcon,
  CheckIcon,
  CloseIcon,
  MoreHorizontalIcon
} from './icons';

function formatDuration(totalSeconds: number = 0): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Resolves top clearance classes for stage banners and the self-preview PiP so overlaid headers never collide with them. */
function resolveTopStageOffsets(
  hasHeaderOverlay: boolean,
  showSoloWarning: boolean,
  isScreenSharing: boolean
): { bannerTopClass: string; pipTopClass: string } {
  if (hasHeaderOverlay) {
    const pipTop = showSoloWarning
      ? 'top-52 sm:top-40'
      : isScreenSharing
        ? 'top-36 sm:top-32'
        : 'top-20 sm:top-20';
    return {
      bannerTopClass: 'top-20 mt-[env(safe-area-inset-top)] sm:top-20',
      pipTopClass: `mt-[env(safe-area-inset-top)] ${pipTop}`,
    };
  }
  const pipTop = showSoloWarning
    ? 'top-36 sm:top-24'
    : isScreenSharing
      ? 'top-16 sm:top-16'
      : 'top-3 sm:top-4';
  return {
    bannerTopClass: 'top-3 sm:top-4',
    pipTopClass: pipTop,
  };
}

export const CallStage: React.FC<WebCallStageProps> = ({
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
  headerOverlay,
  remoteStatusLabel,
  onEndCall,
  isE2eeActive = true,
  networkQuality = 'good',
  isLoading = false,
  error = null,
  className = '',
  videoOrientation = 'portrait',
  onToggleOrientation,
  patientLink,
  onSharePatientLink,
  onDockCall,
  onTogglePip,
  isPipSupported = true,
  isPipActive = false,
  onMessagePatient: _onMessagePatient,
  isRecordDisabled = false,
  recordButtonTooltip,
  colors,
  shadows
}) => {
  const webTheme = useMemo(() => resolveWebTheme(colors, shadows), [colors, shadows]);
  const webShadows = webTheme.shadows;
  const webColors = webTheme.colors;
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showSoloWarning, setShowSoloWarning] = useState(false);
  const [soloCountdown, setSoloCountdown] = useState(Math.round(soloAutoLeaveGraceMs / 1000));
  const [soloDismissedCount, setSoloDismissedCount] = useState(0);

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

  const deduplicatedRemotes = useMemo(() => {
    if (!participants || participants.length === 0) return [];
    const normalizedSelfName = (selfName || '').trim().toLowerCase();
    const seenIdentities = new Set<string>();
    const remotes = [];

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
      return renderIcon(active ? 'mic' : 'micOff', { size: 14 });
    }
    return active ? (
      <span className="text-teal-400"><MicIcon size={14} /></span>
    ) : (
      <span className="text-slate-500"><MicOffIcon size={14} /></span>
    );
  };

  const renderRosterCamIcon = (active: boolean) => {
    if (renderIcon) {
      return renderIcon(active ? 'video' : 'videoOff', { size: 14 });
    }
    return active ? (
      <span className="text-teal-400"><VideoIcon size={14} /></span>
    ) : (
      <span className="text-slate-500"><VideoOffIcon size={14} /></span>
    );
  };

  const renderRosterScreenIcon = () => {
    if (renderIcon) {
      return renderIcon('screenShare', { size: 14 });
    }
    return <span className="text-teal-400"><ScreenShareIcon size={14} /></span>;
  };

  const { bannerTopClass, pipTopClass } = resolveTopStageOffsets(
    Boolean(headerOverlay),
    showSoloWarning,
    isScreenSharing
  );

  return (
    <div className={`flex flex-col min-h-0 h-full bg-slate-950 text-slate-100 ${className}`}>
      {/* Top Header Bar */}
      {!hideHeader && (
        <header
          className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800"
          style={{ boxShadow: webShadows.sm }}
        >
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-bold text-slate-100">{participantName}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                {isE2eeActive && (
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-800 text-teal-100"
                    style={{
                      backgroundColor: webColors.primarySubtle,
                      color: webColors.primaryDark,
                      borderWidth: 1,
                      borderStyle: 'solid',
                      borderColor: webColors.primaryBorder,
                    }}
                  >
                    E2EE Encrypted
                  </span>
                )}
                <span className="font-mono text-[11px]">Room: {roomName || callId}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {renderWorkstationAction && (
              <div className="mr-1">
                {renderWorkstationAction()}
              </div>
            )}

            <button
              type="button"
              onClick={onEndCall}
              className="min-h-[44px] px-4 py-2 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition-colors"
              style={{ boxShadow: webShadows.dangerSm }}
              aria-label="End consultation call"
            >
              End Call
            </button>
          </div>
        </header>
      )}

      {/* Persistent Red REC Banner with Single-Party Stop */}
      {isRecording && (
        <div className="flex items-center justify-center gap-3 bg-red-950/80 border-b border-red-800/60 px-4 py-2 text-xs text-red-200" role="alert">
          <div className="flex items-center gap-1.5 font-bold">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
            <span>REC</span>
          </div>
          <span className="font-mono font-bold">{formatDuration(recordingDurationSeconds)}</span>
          <span className="hidden sm:inline text-red-300">Recording in progress</span>
          {onStopRecording && canStopRecording && (
            <button
              type="button"
              onClick={onStopRecording}
              className="min-h-[44px] px-3 py-1 rounded bg-red-700 hover:bg-red-800 text-white text-xs font-bold transition-colors ml-2"
              style={{ boxShadow: webShadows.dangerSm }}
              aria-label="Stop recording consultation"
            >
              Stop Recording
            </button>
          )}
        </div>
      )}

      {!isRecording && recordingConsentStatus === 'requested' && (
        <div
          className="flex items-center justify-center gap-3 bg-amber-950/80 border-b border-amber-800/60 px-4 py-2 text-xs text-amber-200"
          style={{ boxShadow: webShadows.sm }}
        >
          <span className="font-semibold">Awaiting patient recording consent</span>
          {onApproveConsentPreview && (
            <button
              type="button"
              onClick={onApproveConsentPreview}
              className="min-h-[44px] px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
              style={{ boxShadow: webShadows.sm }}
              aria-label="Approve recording consent in local preview"
            >
              Approve Preview
            </button>
          )}
        </div>
      )}

      {(networkQuality === 'poor' || networkQuality === 'reconnecting') && (
        <div
          data-testid="banner-network-quality"
          role="alert"
          className={`flex items-center justify-center border-b px-4 py-2 text-xs font-semibold text-center ${
            networkQuality === 'reconnecting'
              ? 'bg-red-950/80 border-red-800/60 text-red-200'
              : 'bg-amber-950/80 border-amber-800/60 text-amber-200'
          }`}
          style={{ boxShadow: webShadows.sm }}
        >
          {networkQuality === 'reconnecting'
            ? 'Connection Interrupted — Reconnecting video stream (audio prioritized)...'
            : 'Weak Network Connection — Video quality reduced to preserve audio.'}
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Canvas Stage */}
        <main className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden">
          {remoteVideoSurface ?? (
            <div className="text-center p-8 space-y-3">
              <div
                className="w-20 h-20 rounded-full bg-teal-700 text-white mx-auto flex items-center justify-center text-2xl font-bold"
                style={{
                  backgroundColor: webColors.primary,
                  color: webColors.onPrimary,
                  boxShadow: webShadows.brandSm,
                }}
              >
                {participantInitials}
              </div>
              <h2 className="text-lg font-bold text-slate-100">{participantName}</h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                {remoteStatusLabel ??
                  (isCameraEnabled
                    ? `Waiting for ${participantName} to join...`
                    : 'Camera is off')}
                <span className="sr-only">
                  {' '}
                  {isCameraEnabled ? 'Clinician Video Feed Active' : 'Local Camera Paused'}
                </span>
              </p>
            </div>
          )}

          {/* Optional Overlaid Clinic / Session Header Banner */}
          {headerOverlay && (
            <div
              data-testid="call-stage-header-overlay"
              className="pointer-events-none absolute inset-x-0 top-0 z-25"
            >
              {headerOverlay}
            </div>
          )}

          {/* Solo Participant Safeguard Warning */}
          {showSoloWarning && (
            <div
              data-testid="banner-solo-participant-warning"
              className={`absolute left-3 right-3 sm:left-4 sm:right-4 z-30 p-3.5 sm:p-4 rounded-xl border border-amber-500/40 bg-amber-950/95 text-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 shadow-xl ${bannerTopClass}`}
            >
              <div>
                <p className="font-bold text-sm">Are you still waiting?</p>
                <p className="text-xs mt-0.5">
                  No other participants are currently in this room. You will auto-leave in {soloCountdown}s.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  data-testid="btn-solo-stay"
                  onClick={handleStayInCall}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors"
                  style={{
                    backgroundColor: webColors.primary,
                    color: webColors.onPrimary
                  }}
                >
                  Stay in Call
                </button>
                <button
                  type="button"
                  data-testid="btn-solo-leave"
                  onClick={handleLeaveFromSolo}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  Leave Room
                </button>
              </div>
            </div>
          )}

          {/* Screen Sharing Banner */}
          {isScreenSharing && (
            <div
              data-testid="banner-screen-sharing"
              className={`absolute left-1/2 -translate-x-1/2 z-25 max-w-[calc(100vw-1.5rem)] px-3 sm:px-4 py-1.5 rounded-full flex items-center gap-2 sm:gap-3 ${bannerTopClass}`}
              style={{
                backgroundColor: webColors.primaryDark,
                color: webColors.onPrimary,
                boxShadow: webShadows.md
              }}
            >
              <span className="text-xs font-semibold truncate">You are sharing your screen</span>
              {onToggleScreenShare && (
                <button
                  type="button"
                  onClick={() => void onToggleScreenShare()}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors shrink-0"
                >
                  Stop Sharing
                </button>
              )}
            </div>
          )}

          {/* Picture-in-Picture Local Self-Preview Canvas (top-right, clear of overlaid header & bottom controls) */}
          {(isCameraEnabled || isScreenSharing) && (
            <div
              data-testid="call-stage-local-pip"
              className={`absolute right-3 sm:right-5 lg:right-6 z-20 ${pipTopClass} ${
                isScreenSharing || videoOrientation === 'landscape'
                  ? 'w-28 sm:w-36 lg:w-44 aspect-video'
                  : 'w-20 sm:w-28 lg:w-32 aspect-[3/4]'
              } rounded-xl bg-slate-900 border border-white/15 shadow-xl overflow-hidden flex items-center justify-center`}
              style={{ boxShadow: webShadows.lg }}
            >
              {localVideoSurface ?? (
                renderIcon ? (
                  renderIcon('videoOff', { size: 20, color: lightColors.textMuted })
                ) : (
                  <VideoOffIcon size={20} className="text-slate-400" />
                )
              )}
            </div>
          )}

          {/* Floating Media Controls Toolbar */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 mb-[env(safe-area-inset-bottom)] z-30 flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-950/65 backdrop-blur-md px-2.5 py-1.5 rounded-full border border-white/10 shadow-2xl max-w-[calc(100vw-1rem)]"
            style={{ boxShadow: webShadows.lg }}
          >
            <OverlayTooltip label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}>
              <button
                type="button"
                onClick={onToggleMic}
                className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                  isMicEnabled
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                style={{ boxShadow: isMicEnabled ? webShadows.brandSubtle : webShadows.dangerSm }}
                aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
                title={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
              >
                {renderIcon ? (
                  renderIcon(isMicEnabled ? 'mic' : 'micOff', { size: 18 })
                ) : (
                  <>
                    <span className="sr-only">{isMicEnabled ? 'MIC' : 'MUTE'}</span>
                    {isMicEnabled ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
                  </>
                )}
              </button>
            </OverlayTooltip>

            <OverlayTooltip label={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}>
              <button
                type="button"
                onClick={onToggleCamera}
                className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                  isCameraEnabled
                    ? 'bg-white/10 text-white hover:bg-white/20'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                style={{ boxShadow: isCameraEnabled ? webShadows.brandSubtle : webShadows.dangerSm }}
                aria-label={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
              >
                {renderIcon ? (
                  renderIcon(isCameraEnabled ? 'video' : 'videoOff', { size: 18 })
                ) : (
                  <>
                    <span className="sr-only">{isCameraEnabled ? 'CAM' : 'OFF'}</span>
                    {isCameraEnabled ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
                  </>
                )}
              </button>
            </OverlayTooltip>

            {onToggleScreenShare && (
              <div className={!isScreenSharing ? 'hidden sm:inline-flex' : 'inline-flex'}>
                <OverlayTooltip label={isScreenSharing ? 'Stop screen share' : 'Share screen'}>
                  <button
                    type="button"
                    onClick={onToggleScreenShare}
                    className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                      isScreenSharing
                        ? 'bg-teal-700 text-white'
                        : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    style={
                      isScreenSharing
                        ? {
                            backgroundColor: webColors.primary,
                            color: webColors.onPrimary,
                            boxShadow: webShadows.brandSm,
                          }
                        : { boxShadow: webShadows.brandSubtle }
                    }
                    aria-label={isScreenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
                    title={isScreenSharing ? 'Stop screen share' : 'Share screen'}
                  >
                    {renderIcon ? (
                      renderIcon(isScreenSharing ? 'screenShareOff' : 'screenShare', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">{isScreenSharing ? 'SHARING' : 'SHARE'}</span>
                        <ScreenShareIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              </div>
            )}

            {onDockCall && (
              <div className="hidden sm:inline-flex">
                <OverlayTooltip label="Dock call and open chart">
                  <button
                    type="button"
                    id="btn-dock-call"
                    data-testid="btn-dock-call"
                    onClick={() => void onDockCall()}
                    className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                    style={{ boxShadow: webShadows.brandSubtle }}
                    aria-label="Dock call and open chart"
                    title="Dock call and open chart"
                  >
                    {renderIcon ? (
                      renderIcon('dock', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">DOCK</span>
                        <DockIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              </div>
            )}

            {onTogglePip && isPipSupported !== false && (
              <div className="hidden sm:inline-flex">
                <OverlayTooltip
                  label={
                    isPipActive
                      ? 'Exit picture-in-picture & return'
                      : 'Minimize to picture-in-picture'
                  }
                >
                  <button
                    type="button"
                    id="btn-toggle-pip"
                    data-testid="btn-toggle-pip"
                    onClick={() => void onTogglePip()}
                    className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                      isPipActive ? 'bg-teal-700 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    style={
                      isPipActive
                        ? {
                            backgroundColor: webColors.primary,
                            color: webColors.onPrimary,
                            boxShadow: webShadows.brandSm,
                          }
                        : { boxShadow: webShadows.brandSubtle }
                    }
                    aria-label={isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                    title={
                      isPipActive
                        ? 'Exit Picture-in-Picture'
                        : 'Picture-in-Picture'
                    }
                  >
                    {renderIcon ? (
                      renderIcon('pip', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">PIP</span>
                        <PipIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              </div>
            )}

            {onToggleOrientation && (
              <div className="hidden sm:inline-flex">
                <OverlayTooltip
                  label={
                    videoOrientation === 'landscape'
                      ? 'Switch to portrait view'
                      : 'Switch to landscape view'
                  }
                >
                  <button
                    type="button"
                    id="btn-toggle-orientation"
                    data-testid="btn-toggle-orientation"
                    onClick={() => void onToggleOrientation()}
                    className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                    style={{ boxShadow: webShadows.brandSubtle }}
                    aria-label="Toggle camera orientation"
                    title="Toggle camera orientation"
                  >
                    {renderIcon ? (
                      renderIcon('rotate', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">ROTATE</span>
                        <RotateCwIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              </div>
            )}

            {onToggleChat && (
              <OverlayTooltip label={isChatOpen ? 'Hide in-call chat' : 'Open in-call chat'}>
                <button
                  type="button"
                  data-testid="btn-toggle-chat"
                  onClick={onToggleChat}
                  className={`relative h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                    isChatOpen
                      ? 'bg-teal-700 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  style={
                    isChatOpen
                      ? {
                          backgroundColor: webColors.primary,
                          color: webColors.onPrimary,
                          boxShadow: webShadows.brandSm,
                        }
                      : { boxShadow: webShadows.brandSubtle }
                  }
                  aria-label="Toggle in-call chat"
                  title={isChatOpen ? 'Hide in-call chat' : 'Open in-call chat'}
                >
                  {renderIcon ? (
                    <>
                      <span className="sr-only">In-Call Chat</span>
                      {renderIcon('chat', { size: 18 })}
                    </>
                  ) : (
                    <>
                      <span className="sr-only">{unreadChatCount > 0 ? `CHAT (${unreadChatCount})` : 'CHAT'}</span>
                      <MessageSquareIcon size={18} />
                    </>
                  )}
                  {renderIcon && unreadChatCount > 0 && (
                    <span
                      data-testid="badge-unread-chat"
                      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center"
                    >
                      {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                  )}
                </button>
              </OverlayTooltip>
            )}

            {onToggleParticipants && (
              <OverlayTooltip label={isParticipantsOpen ? 'Hide participants' : 'Open participants'}>
                <button
                  type="button"
                  data-testid="btn-toggle-participants"
                  onClick={onToggleParticipants}
                  className={`relative h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                    isParticipantsOpen
                      ? 'bg-teal-700 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  style={
                    isParticipantsOpen
                      ? {
                          backgroundColor: webColors.primary,
                          color: webColors.onPrimary,
                          boxShadow: webShadows.brandSm,
                        }
                      : { boxShadow: webShadows.brandSubtle }
                  }
                  aria-label="Toggle participants roster"
                  title={isParticipantsOpen ? 'Hide participants' : 'Open participants'}
                >
                  {renderParticipantsIcon ? (
                    renderParticipantsIcon({
                      size: 18,
                      color: isParticipantsOpen ? webColors.onPrimary : undefined
                    })
                  ) : (
                    <>
                      <span className="sr-only">USERS</span>
                      <UsersIcon size={18} />
                    </>
                  )}
                  <span
                    data-testid="badge-participants-count"
                    className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{
                      backgroundColor: webColors.primary,
                      color: webColors.onPrimary
                    }}
                  >
                    {totalParticipantsCount}
                  </span>
                </button>
              </OverlayTooltip>
            )}

            {!isRecording &&
              onStartRecording &&
              canStartRecording &&
              recordingConsentStatus !== 'requested' && (
                <div className="hidden sm:inline-flex">
                  <OverlayTooltip
                    label={
                      recordButtonTooltip ||
                      (isRecordDisabled
                        ? 'Waiting for patient to join before recording'
                        : 'Start call recording')
                    }
                  >
                    <button
                      type="button"
                      data-testid="btn-start-recording"
                      onClick={() => {
                        if (!isRecordDisabled) {
                          void onStartRecording();
                        }
                      }}
                      disabled={isRecordDisabled}
                      className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full text-xs font-bold flex items-center justify-center transition-colors shrink-0 ${
                        isRecordDisabled
                          ? 'bg-white/5 text-slate-400 cursor-not-allowed opacity-50'
                          : 'bg-white/10 hover:bg-white/20 text-white'
                      }`}
                      style={{
                        boxShadow: isRecordDisabled ? webShadows.none : webShadows.brandSubtle,
                      }}
                      aria-label="Start Recording"
                      title={
                        recordButtonTooltip ||
                        (isRecordDisabled
                          ? 'Waiting for patient to join before recording'
                          : 'Start call recording')
                      }
                    >
                      {renderIcon ? (
                        renderIcon('recordDot', { size: 18 })
                      ) : (
                        <>
                          <span className="sr-only">REC</span>
                          <CircleDotIcon size={18} />
                        </>
                      )}
                    </button>
                  </OverlayTooltip>
                </div>
              )}

            {((!isScreenSharing && Boolean(onToggleScreenShare)) ||
              Boolean(onDockCall) ||
              Boolean(onTogglePip && isPipSupported !== false) ||
              Boolean(onToggleOrientation) ||
              Boolean(
                !isRecording &&
                  onStartRecording &&
                  canStartRecording &&
                  recordingConsentStatus !== 'requested'
              )) && (
              <div className="relative sm:hidden">
                <button
                  type="button"
                  data-testid="btn-toggle-more-controls"
                  onClick={() => setIsMoreOpen((prev) => !prev)}
                  className={`h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                    isMoreOpen
                      ? 'bg-white/20 text-white'
                      : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                  aria-label="More call controls"
                  aria-expanded={isMoreOpen}
                  title="More call controls"
                >
                  <MoreHorizontalIcon size={18} />
                </button>
                {isMoreOpen && (
                  <div
                    data-testid="popover-more-controls"
                    className="absolute bottom-14 right-0 min-w-[192px] rounded-xl bg-slate-950/90 backdrop-blur-md border border-white/15 p-1.5 shadow-2xl flex flex-col gap-1 z-40"
                    style={{ boxShadow: webShadows.lg }}
                  >
                    {onToggleScreenShare && !isScreenSharing && (
                      <button
                        type="button"
                        data-testid="more-menu-screen-share"
                        onClick={() => {
                          setIsMoreOpen(false);
                          void onToggleScreenShare();
                        }}
                        className="min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold text-white hover:bg-white/10 flex items-center gap-2.5 text-left"
                      >
                        {renderIcon ? renderIcon('screenShare', { size: 16 }) : <ScreenShareIcon size={16} />}
                        <span>Share screen</span>
                      </button>
                    )}
                    {onToggleOrientation && (
                      <button
                        type="button"
                        data-testid="more-menu-toggle-orientation"
                        onClick={() => {
                          setIsMoreOpen(false);
                          void onToggleOrientation();
                        }}
                        className="min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold text-white hover:bg-white/10 flex items-center gap-2.5 text-left"
                      >
                        {renderIcon ? renderIcon('rotate', { size: 16 }) : <RotateCwIcon size={16} />}
                        <span>{videoOrientation === 'landscape' ? 'Portrait view' : 'Landscape view'}</span>
                      </button>
                    )}
                    {onTogglePip && isPipSupported !== false && (
                      <button
                        type="button"
                        data-testid="more-menu-toggle-pip"
                        onClick={() => {
                          setIsMoreOpen(false);
                          void onTogglePip();
                        }}
                        className="min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold text-white hover:bg-white/10 flex items-center gap-2.5 text-left"
                      >
                        {renderIcon ? renderIcon('pip', { size: 16 }) : <PipIcon size={16} />}
                        <span>{isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}</span>
                      </button>
                    )}
                    {onDockCall && (
                      <button
                        type="button"
                        data-testid="more-menu-dock-call"
                        onClick={() => {
                          setIsMoreOpen(false);
                          void onDockCall();
                        }}
                        className="min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold text-white hover:bg-white/10 flex items-center gap-2.5 text-left"
                      >
                        {renderIcon ? renderIcon('dock', { size: 16 }) : <DockIcon size={16} />}
                        <span>Dock call</span>
                      </button>
                    )}
                    {!isRecording &&
                      onStartRecording &&
                      canStartRecording &&
                      recordingConsentStatus !== 'requested' && (
                        <button
                          type="button"
                          data-testid="more-menu-start-recording"
                          disabled={isRecordDisabled}
                          onClick={() => {
                            if (!isRecordDisabled) {
                              setIsMoreOpen(false);
                              void onStartRecording();
                            }
                          }}
                          className={`min-h-[44px] w-full px-3 rounded-lg text-xs font-semibold flex items-center gap-2.5 text-left ${
                            isRecordDisabled
                              ? 'text-slate-400 opacity-50 cursor-not-allowed'
                              : 'text-white hover:bg-white/10'
                          }`}
                        >
                          {renderIcon ? renderIcon('recordDot', { size: 16 }) : <CircleDotIcon size={16} />}
                          <span>Start recording</span>
                        </button>
                      )}
                  </div>
                )}
              </div>
            )}

            <OverlayTooltip label="End consultation call">
              <button
                type="button"
                onClick={onEndCall}
                className="h-11 w-11 min-h-[44px] min-w-[44px] p-0 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center transition-colors shrink-0"
                style={{ boxShadow: webShadows.dangerSm }}
                aria-label="Leave or terminate call"
                title="End consultation call"
              >
                {renderIcon ? (
                  <>
                    <span className="sr-only">Leave</span>
                    {renderIcon('phoneOff', { size: 18 })}
                  </>
                ) : (
                  <>
                    <span className="sr-only">END</span>
                    <PhoneOffIcon size={18} />
                  </>
                )}
              </button>
            </OverlayTooltip>
          </div>
        </main>

        {/* In-Call Chat Drawer (Rendered conditionally) */}
        {isChatOpen && renderChatDrawer && (
          <aside
            className="fixed inset-0 z-40 sm:static sm:z-auto w-full sm:w-80 lg:w-96 sm:border-l border-slate-800 bg-slate-900 flex flex-col h-full shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
            style={{ boxShadow: webShadows.lg }}
          >
            {renderChatDrawer()}
          </aside>
        )}

        {/* Participants Roster Drawer (Mutually exclusive with In-Call Chat) */}
        {isParticipantsOpen && !isChatOpen && (
          <aside
            data-testid="panel-participants-roster"
            className="fixed inset-0 z-40 sm:static sm:z-auto w-full sm:w-80 lg:w-96 sm:border-l border-slate-800 bg-slate-900 flex flex-col h-full shadow-2xl pb-[env(safe-area-inset-bottom)] sm:pb-0"
            style={{ boxShadow: webShadows.lg }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">Participants</h2>
                <span
                  className="min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center"
                  style={{
                    backgroundColor: webColors.primary,
                    color: webColors.onPrimary
                  }}
                >
                  {totalParticipantsCount}
                </span>
              </div>
              {onToggleParticipants && (
                <button
                  type="button"
                  data-testid="btn-close-participants"
                  onClick={onToggleParticipants}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
                  aria-label="Close participants roster"
                >
                  <CloseIcon size={18} />
                </button>
              )}
            </div>

            {/* Invite Link & PIN Section */}
            {(patientLink || onSharePatientLink || patientPin || onCopyPatientPin) && (
              <div className="p-4 border-b border-slate-800 space-y-3">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Invite Link
                  </span>
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700">
                    <span className="text-xs font-mono text-slate-300 truncate">
                      {patientLink || 'Consultation Invite Link'}
                    </span>
                    {onSharePatientLink && (
                      <button
                        type="button"
                        data-testid="btn-roster-copy-invite"
                        onClick={handleCopyInviteFromRoster}
                        className="min-h-[44px] min-w-[44px] p-2 rounded-md bg-transparent hover:bg-slate-700/40 transition-colors flex items-center justify-center shrink-0 border-0"
                        style={{
                          color: copiedInvite ? lightColors.successText : webColors.primary
                        }}
                        aria-label={copiedInvite ? 'Copied!' : 'Copy consultation invite link'}
                        title={copiedInvite ? 'Copied!' : 'Copy consultation invite link'}
                      >
                        {copiedInvite ? (
                          <CheckIcon size={16} />
                        ) : renderIcon ? (
                          renderIcon('share', { size: 16, color: webColors.primary })
                        ) : (
                          <CopyIcon size={16} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {patientPin && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Access PIN
                    </span>
                    <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/80 border border-slate-700">
                      <span
                        data-testid="text-roster-invite-pin"
                        className="text-sm font-mono font-bold tracking-widest text-slate-100"
                      >
                        {patientPin}
                      </span>
                      {onCopyPatientPin && (
                        <button
                          type="button"
                          data-testid="btn-roster-copy-pin"
                          onClick={handleCopyPinFromRoster}
                          className="min-h-[44px] min-w-[44px] p-2 rounded-md bg-transparent hover:bg-slate-700/40 transition-colors flex items-center justify-center shrink-0 border-0"
                          style={{
                            color: copiedPin ? lightColors.successText : webColors.primary
                          }}
                          aria-label={copiedPin ? 'Copied!' : 'Copy access PIN'}
                          title={copiedPin ? 'Copied!' : 'Copy access PIN'}
                        >
                          {copiedPin ? (
                            <CheckIcon size={16} />
                          ) : renderIcon ? (
                            renderIcon('share', { size: 16, color: webColors.primary })
                          ) : (
                            <CopyIcon size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Participants List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                In Room
              </span>

              {/* Local Participant (You) */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-200">{selfName} (You)</p>
                  <span
                    className="inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold"
                    style={{
                      backgroundColor: webColors.primarySubtle,
                      color: webColors.primaryDark
                    }}
                  >
                    In call
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  {renderRosterMicIcon(Boolean(isMicEnabled))}
                  {renderRosterCamIcon(Boolean(isCameraEnabled))}
                  {isScreenSharing && renderRosterScreenIcon()}
                </div>
              </div>

              {/* Remote Participants */}
              {deduplicatedRemotes.length > 0 ? (
                deduplicatedRemotes.map((p) => (
                  <div key={p.identity} className="flex items-center justify-between py-2 border-b border-slate-800">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{p.name}</p>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                          p.status === 'Waiting to join'
                            ? 'bg-amber-900/60 text-amber-200'
                            : 'bg-teal-900/60 text-teal-200'
                        }`}
                      >
                        {p.status || 'In call'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      {renderRosterMicIcon(Boolean(p.isMicActive))}
                      {renderRosterCamIcon(Boolean(p.isCameraActive))}
                      {p.isScreenSharing && renderRosterScreenIcon()}
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-between py-2 border-b border-slate-800">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{participantName}</p>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded text-xs font-bold ${
                        !hasRemote
                          ? 'bg-amber-900/60 text-amber-200'
                          : 'bg-teal-900/60 text-teal-200'
                      }`}
                    >
                      {hasRemote ? 'In call' : 'Waiting to join'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    {renderRosterMicIcon(Boolean(hasRemote))}
                    {renderRosterCamIcon(Boolean(hasRemote))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
