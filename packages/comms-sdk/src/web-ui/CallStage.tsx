import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  CloseIcon
} from './icons';

function formatDuration(totalSeconds: number = 0): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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

  return (
    <div className={`flex flex-col h-full bg-slate-950 text-slate-100 ${className}`}>
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
              <p className="text-xs text-slate-400">
                {remoteStatusLabel ??
                  (isCameraEnabled
                    ? 'Connected • Waiting for Patient Video Stream'
                    : 'Connected • Local Camera Paused')}
              </p>
            </div>
          )}

          {/* Solo Participant Safeguard Warning */}
          {showSoloWarning && (
            <div
              data-testid="banner-solo-participant-warning"
              className="absolute top-4 left-4 right-4 z-30 p-4 rounded-xl border border-amber-500/40 bg-amber-950/90 text-amber-200 flex items-center justify-between gap-4 shadow-xl"
            >
              <div>
                <p className="font-bold text-sm">Are you still waiting?</p>
                <p className="text-xs mt-0.5">
                  No other participants are currently in this room. You will auto-leave in {soloCountdown}s.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
              className="absolute top-4 left-1/2 -translate-x-1/2 z-25 px-4 py-1.5 rounded-full flex items-center gap-3"
              style={{
                backgroundColor: webColors.primaryDark,
                color: webColors.onPrimary,
                boxShadow: webShadows.md
              }}
            >
              <span className="text-xs font-semibold">You are sharing your screen</span>
              {onToggleScreenShare && (
                <button
                  type="button"
                  onClick={() => void onToggleScreenShare()}
                  className="min-h-[28px] px-2.5 py-0.5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
                >
                  Stop Sharing
                </button>
              )}
            </div>
          )}

          {/* Picture-in-Picture Local Self-Preview Canvas */}
          <div
            className={`absolute bottom-4 right-4 ${
              isScreenSharing || videoOrientation === 'landscape'
                ? 'w-44 sm:w-56 aspect-video'
                : 'w-28 sm:w-36 aspect-[3/4]'
            } rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden flex items-center justify-center`}
            style={{ boxShadow: webShadows.lg }}
          >
            {localVideoSurface ?? (
              <span className="text-xs font-semibold text-slate-300">
                {isCameraEnabled ? selfName : `${selfName} (Cam Off)`}
              </span>
            )}
          </div>

          {/* Floating Media Controls Toolbar */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-700 shadow-2xl"
            style={{ boxShadow: webShadows.lg }}
          >
            <OverlayTooltip label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}>
              <button
                type="button"
                onClick={onToggleMic}
                className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isMicEnabled
                    ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
                className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isCameraEnabled
                    ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
              <OverlayTooltip label={isScreenSharing ? 'Stop screen share' : 'Share screen'}>
                <button
                  type="button"
                  onClick={onToggleScreenShare}
                  className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isScreenSharing
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
            )}

            {onDockCall && (
              <OverlayTooltip label="Dock call and open chart">
                <button
                  type="button"
                  id="btn-dock-call"
                  data-testid="btn-dock-call"
                  onClick={() => void onDockCall()}
                  className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 flex items-center justify-center text-xs font-bold transition-colors"
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
            )}

            {onTogglePip && isPipSupported !== false && (
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
                  className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isPipActive ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
            )}

            {onToggleOrientation && (
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
                  className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 flex items-center justify-center text-xs font-bold transition-colors"
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
            )}

            {onToggleChat && (
              <OverlayTooltip label={isChatOpen ? 'Hide in-call chat' : 'Open in-call chat'}>
                <button
                  type="button"
                  data-testid="btn-toggle-chat"
                  onClick={onToggleChat}
                  className={`relative min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isChatOpen
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
                  className={`relative min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isParticipantsOpen
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
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
                    className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full text-xs font-bold flex items-center justify-center transition-colors ${
                      isRecordDisabled
                        ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed opacity-50'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
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
              )}

            <OverlayTooltip label="End consultation call">
              <button
                type="button"
                onClick={onEndCall}
                className="min-h-[44px] min-w-[44px] px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center transition-colors"
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
            className="w-80 lg:w-96 border-l border-slate-800 bg-slate-900 flex flex-col h-full shadow-2xl"
            style={{ boxShadow: webShadows.lg }}
          >
            {renderChatDrawer()}
          </aside>
        )}

        {/* Participants Roster Drawer (Mutually exclusive with In-Call Chat) */}
        {isParticipantsOpen && !isChatOpen && (
          <aside
            data-testid="panel-participants-roster"
            className="w-80 lg:w-96 border-l border-slate-800 bg-slate-900 flex flex-col h-full shadow-2xl"
            style={{ boxShadow: webShadows.lg }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-100">Participants</h2>
                <span
                  className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
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
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
                        className="min-h-[36px] min-w-[44px] px-2.5 py-1 rounded-md text-xs font-bold transition-colors shrink-0"
                        style={{
                          backgroundColor: webColors.primary,
                          color: webColors.onPrimary
                        }}
                      >
                        {copiedInvite ? 'Copied!' : 'Copy Link'}
                      </button>
                    )}
                  </div>
                </div>

                {patientPin && (
                  <div className="space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
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
                          className="min-h-[36px] min-w-[44px] px-2.5 py-1 rounded-md text-xs font-bold transition-colors shrink-0"
                          style={{
                            backgroundColor: webColors.primary,
                            color: webColors.onPrimary
                          }}
                        >
                          {copiedPin ? 'Copied!' : 'Copy PIN'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Participants List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                In Room
              </span>

              {/* Local Participant (You) */}
              <div className="flex items-center justify-between py-2 border-b border-slate-800">
                <div>
                  <p className="text-sm font-medium text-slate-200">{selfName} (You)</p>
                  <span
                    className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold"
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
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
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
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${
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
