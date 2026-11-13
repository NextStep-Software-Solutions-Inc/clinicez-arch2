import React, { useMemo } from 'react';
import { WebCallStageProps } from './types';

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
    <div className={`flex flex-col h-full bg-slate-950 text-slate-100 ${className}`}>
      {/* Top Header Bar */}
      {!hideHeader && (
        <header className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-sm font-bold text-slate-100">{participantName}</h1>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                {isE2eeActive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-800 text-teal-100">
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
              aria-label="Stop recording consultation"
            >
              Stop Recording
            </button>
          )}
        </div>
      )}

      {!isRecording && recordingConsentStatus === 'requested' && (
        <div className="flex items-center justify-center gap-3 bg-amber-950/80 border-b border-amber-800/60 px-4 py-2 text-xs text-amber-200">
          <span className="font-semibold">Awaiting patient recording consent</span>
          {onApproveConsentPreview && (
            <button
              type="button"
              onClick={onApproveConsentPreview}
              className="min-h-[44px] px-3 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
              aria-label="Approve recording consent in local preview"
            >
              Approve Preview
            </button>
          )}
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Video Canvas Stage */}
        <main className="flex-1 relative flex items-center justify-center bg-slate-900 overflow-hidden">
          {remoteVideoSurface ?? (
            <div className="text-center p-8 space-y-3">
              <div className="w-20 h-20 rounded-full bg-teal-700 text-white mx-auto flex items-center justify-center text-2xl font-bold">
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

          {/* Picture-in-Picture Local Self-Preview Canvas */}
          <div
            className={`absolute bottom-4 right-4 ${
              videoOrientation === 'landscape'
                ? 'w-44 sm:w-56 aspect-video'
                : 'w-28 sm:w-36 aspect-[3/4]'
            } rounded-xl bg-slate-800 border border-slate-700 shadow-xl overflow-hidden flex items-center justify-center`}
          >
            {localVideoSurface ?? (
              <span className="text-xs font-semibold text-slate-300">
                {isCameraEnabled ? selfName : `${selfName} (Cam Off)`}
              </span>
            )}
          </div>

          {/* Floating Media Controls Toolbar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-full border border-slate-700 shadow-2xl">
            <button
              type="button"
              onClick={onToggleMic}
              className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isMicEnabled
                  ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
              aria-label={isMicEnabled ? 'Mute microphone' : 'Unmute microphone'}
            >
              {renderIcon
                ? renderIcon(isMicEnabled ? 'mic' : 'micOff', { size: 18 })
                : isMicEnabled
                  ? 'MIC'
                  : 'MUTE'}
            </button>

            <button
              type="button"
              onClick={onToggleCamera}
              className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                isCameraEnabled
                  ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
              aria-label={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {renderIcon
                ? renderIcon(isCameraEnabled ? 'video' : 'videoOff', { size: 18 })
                : isCameraEnabled
                  ? 'CAM'
                  : 'OFF'}
            </button>

            {onToggleScreenShare && (
              <button
                type="button"
                onClick={onToggleScreenShare}
                className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isScreenSharing
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
                aria-label={isScreenSharing ? 'Stop screen sharing' : 'Start screen sharing'}
              >
                {renderIcon
                  ? renderIcon(isScreenSharing ? 'screenShareOff' : 'screenShare', { size: 18 })
                  : isScreenSharing
                    ? 'SHARING'
                    : 'SHARE'}
              </button>
            )}

            {onDockCall && (
              <button
                type="button"
                id="btn-dock-call"
                data-testid="btn-dock-call"
                onClick={() => void onDockCall()}
                className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 flex items-center justify-center text-xs font-bold transition-colors"
                aria-label="Dock call and open chart"
                title="Dock call and open chart"
              >
                {renderIcon ? renderIcon('dock', { size: 18 }) : 'DOCK'}
              </button>
            )}

            {onTogglePip && isPipSupported !== false && (
              <button
                type="button"
                id="btn-toggle-pip"
                data-testid="btn-toggle-pip"
                onClick={() => void onTogglePip()}
                className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isPipActive ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
                aria-label={isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
                title={isPipActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
              >
                {renderIcon ? renderIcon('pip', { size: 18 }) : 'PIP'}
              </button>
            )}

            {onToggleOrientation && (
              <button
                type="button"
                id="btn-toggle-orientation"
                data-testid="btn-toggle-orientation"
                onClick={() => void onToggleOrientation()}
                className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-slate-800 text-slate-100 hover:bg-slate-700 flex items-center justify-center text-xs font-bold transition-colors"
                aria-label="Toggle camera orientation"
                title="Toggle camera orientation"
              >
                {renderIcon ? renderIcon('rotate', { size: 18 }) : 'ROTATE'}
              </button>
            )}

            {onToggleChat && (
              <button
                type="button"
                onClick={onToggleChat}
                className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isChatOpen
                    ? 'bg-teal-700 text-white'
                    : 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                }`}
                aria-label="Toggle in-call chat"
              >
                {renderIcon
                  ? renderIcon('chat', { size: 18 })
                  : unreadChatCount > 0
                    ? `CHAT (${unreadChatCount})`
                    : 'CHAT'}
              </button>
            )}

            {!isRecording &&
              onStartRecording &&
              canStartRecording &&
              recordingConsentStatus !== 'requested' && (
                <button
                  type="button"
                  onClick={onStartRecording}
                  className="min-h-[44px] min-w-[44px] px-3.5 rounded-full bg-red-700 hover:bg-red-800 text-white text-xs font-bold flex items-center justify-center transition-colors"
                  aria-label="Start Recording"
                >
                  {renderIcon ? renderIcon('recordDot', { size: 18 }) : 'REC'}
                </button>
              )}

            <button
              type="button"
              onClick={onEndCall}
              className="min-h-[44px] min-w-[44px] px-4 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center justify-center transition-colors"
              aria-label="Leave or terminate call"
            >
              {renderIcon ? renderIcon('phoneOff', { size: 18 }) : 'END'}
            </button>
          </div>
        </main>

        {/* In-Call Chat Drawer (Rendered conditionally) */}
        {isChatOpen && renderChatDrawer && (
          <aside className="w-80 lg:w-96 border-l border-slate-800 bg-slate-900 flex flex-col h-full shadow-2xl">
            {renderChatDrawer()}
          </aside>
        )}
      </div>
    </div>
  );
};
