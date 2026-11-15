import React, { useEffect, useMemo, useRef, useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { WebCallWaitingRoomProps } from './types';
import { OverlayTooltip } from './OverlayTooltip';
import { resolveWebTheme } from './shadows';
import {
  VideoIcon,
  VideoOffIcon,
  MicIcon,
  MicOffIcon,
  RotateCwIcon,
  ShareIcon,
  CopyIcon,
  CheckIcon,
  LockIcon,
  ShieldCheckIcon,
  AlertCircleIcon,
  LoaderIcon
} from './icons';

export const CallWaitingRoom: React.FC<WebCallWaitingRoomProps> = ({
  callId,
  appointmentId,
  userRole,
  patientName,
  clinicianName,
  scheduledTime,
  paymentPolicy,
  paymentStatus,
  hasActiveYakapEnlistment,
  isYakapExempt,
  onChangePaymentPolicy,
  onStaffPaymentOverride,
  onEmergencyPaymentOverride,
  isReadyToAdmit,
  recordingConsentStatus,
  onAdmitPatient,
  onSubmitConsent,
  onEnterCall,
  onCancelCall,
  isCameraEnabled,
  isMicEnabled,
  onToggleCamera,
  onToggleMic,
  micLevel,
  renderVideoPreview,
  renderIcon,
  hideHeader = false,
  mediaModeLabel,
  isLoading = false,
  error = null,
  className = '',
  videoOrientation = 'portrait',
  onToggleOrientation,
  patientLink,
  onSharePatientLink,
  videoServerUnavailable = false,
  videoServerBannerMessage,
  onRetryVideoServer,
  recordingToggleHint,
  patientPin,
  onCopyPatientPin,
  colors,
  shadows
}) => {
  const webTheme = useMemo(() => resolveWebTheme(colors, shadows), [colors, shadows]);
  const webShadows = webTheme.shadows;
  const webColors = webTheme.colors;
  const [localCameraActive, setLocalCameraActive] = useState(true);
  const [localMicActive, setLocalMicActive] = useState(true);
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);
  const [isAdmitting, setIsAdmitting] = useState(false);
  const [isRetryingVideoServer, setIsRetryingVideoServer] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const copiedLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedPinTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedLinkTimerRef.current) clearTimeout(copiedLinkTimerRef.current);
      if (copiedPinTimerRef.current) clearTimeout(copiedPinTimerRef.current);
    };
  }, []);

  const handleCopyLinkCardClick = async () => {
    if (!onSharePatientLink) return;
    await onSharePatientLink();
    setCopiedLink(true);
    if (copiedLinkTimerRef.current) clearTimeout(copiedLinkTimerRef.current);
    copiedLinkTimerRef.current = setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyPinCardClick = async () => {
    if (!onCopyPatientPin) return;
    await onCopyPatientPin();
    setCopiedPin(true);
    if (copiedPinTimerRef.current) clearTimeout(copiedPinTimerRef.current);
    copiedPinTimerRef.current = setTimeout(() => setCopiedPin(false), 2000);
  };

  const isCameraActive = isCameraEnabled ?? localCameraActive;
  const isMicActive = isMicEnabled ?? localMicActive;

  const isPrepaidBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid';
  const isAdmitBlocked = isPrepaidBlocked || videoServerUnavailable;
  const isStaffOrDoctor = userRole === 'Clinician' || userRole === 'Staff';
  const isDoctor = userRole === 'Clinician';
  const isPatientView = userRole === 'Patient';

  const isRecordingEnabled = recordingConsentStatus === 'Approved';
  const recordingSubtitle =
    recordingToggleHint ??
    (isRecordingEnabled
      ? 'Recording is on for this consultation.'
      : recordingConsentStatus === 'Rejected'
        ? 'Recording is off for this consultation.'
        : 'Turn on to record this consultation for the medical chart.');
  const trimmedReason = overrideReason.trim();
  const isReasonValid = trimmedReason.length >= 5;
  const canSubmitOverride =
    isReasonValid &&
    !isSubmittingOverride &&
    (Boolean(onStaffPaymentOverride) || Boolean(onEmergencyPaymentOverride));

  const clearedBannerCopy =
    paymentPolicy === 'Exempt'
      ? isPatientView
        ? {
            title: isReadyToAdmit ? 'Ready to Join' : 'No Payment Needed',
            subtitle: isReadyToAdmit
              ? 'Your video room is ready. Tap Join Video Call below.'
              : 'Everything is set. Please wait while your doctor opens the room.',
          }
        : {
            title: 'Exempt — Admission Cleared',
            subtitle: 'This consultation is exempt from payment and ready to start.',
          }
      : paymentPolicy === 'Postpaid'
        ? isPatientView
          ? {
              title: isReadyToAdmit ? 'Ready to Join' : 'Pay After Your Visit',
              subtitle: isReadyToAdmit
                ? 'Your video room is ready. Tap Join Video Call below.'
                : 'No payment is needed now. Please wait while your doctor opens the room.',
            }
          : {
              title: 'Postpaid — Admission Cleared',
              subtitle: 'Charges will be settled after the visit. Ready to start.',
            }
        : isPatientView
          ? {
              title: 'Ready to Join',
              subtitle: isReadyToAdmit
                ? 'Payment confirmed. Tap Join Video Call below.'
                : 'Payment confirmed. Please wait while your doctor opens the room.',
            }
          : {
              title:
                paymentStatus === 'Overridden'
                  ? 'Prepaid — Override Approved'
                  : 'Prepaid — Payment Cleared',
              subtitle:
                paymentStatus === 'Overridden'
                  ? 'Staff admission override approved. Ready to start.'
                  : 'Prepayment confirmed and ready to start.',
            };

  const handlePolicyChange = async (newPolicy: 'Prepaid' | 'Postpaid' | 'Exempt') => {
    if (!onChangePaymentPolicy || isUpdatingPolicy || newPolicy === paymentPolicy) return;
    setIsUpdatingPolicy(true);
    try {
      await onChangePaymentPolicy(newPolicy);
    } finally {
      setIsUpdatingPolicy(false);
    }
  };

  const handleToggleMic = () => {
    if (onToggleMic) {
      void onToggleMic();
    } else {
      setLocalMicActive((prev) => !prev);
    }
  };

  const handleToggleCamera = () => {
    if (onToggleCamera) {
      void onToggleCamera();
    } else {
      setLocalCameraActive((prev) => !prev);
    }
  };

  const handleAdmitPress = async () => {
    if (!onAdmitPatient || isAdmitBlocked || isAdmitting) return;
    setIsAdmitting(true);
    try {
      await onAdmitPatient();
    } finally {
      setIsAdmitting(false);
    }
  };

  const handleRetryPress = async () => {
    if (isRetryingVideoServer) return;
    setIsRetryingVideoServer(true);
    try {
      if (onRetryVideoServer) {
        await onRetryVideoServer();
      } else if (isDoctor && onAdmitPatient) {
        await onAdmitPatient();
      } else {
        onEnterCall();
      }
    } finally {
      setIsRetryingVideoServer(false);
    }
  };

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitOverride) return;
    setIsSubmittingOverride(true);
    try {
      if (onStaffPaymentOverride) {
        await onStaffPaymentOverride(trimmedReason);
      } else if (onEmergencyPaymentOverride) {
        await onEmergencyPaymentOverride(trimmedReason);
      }
      setOverrideModalVisible(false);
      setOverrideReason('');
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  const computedMicPercent = !isMicActive
    ? 0
    : typeof micLevel === 'number'
      ? Math.max(8, Math.min(100, Math.round(micLevel)))
      : 65;

  return (
    <div className={`flex flex-col min-h-dvh sm:h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header */}
      {!hideHeader && (
        <div
          className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800"
          style={{ boxShadow: webShadows.sm }}
        >
          <h1 className="text-lg sm:text-xl font-bold tracking-tight">
            {isPatientView ? 'Waiting Room' : 'Teleconsultation Waiting Room'}
            <span className="sr-only"> (Teleconsultation Staging &amp; Waiting Room)</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isPatientView
              ? scheduledTime
              : `Appointment: ${scheduledTime} • ID: ${appointmentId || callId}`}
          </p>
        </div>
      )}

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <LoaderIcon size={32} className="animate-spin mb-2" />
          <p className="text-sm">
            Checking camera and microphone...
            <span className="sr-only"> Staging teleconsultation hardware</span>
          </p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <AlertCircleIcon size={32} className="mb-2 text-red-600" />
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
            Hardware or Media Connection Error
          </p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-w-2xl lg:max-w-5xl mx-auto w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 items-start">
            <div className="lg:col-span-6 space-y-3">
              {/* Dynamic Video Preview */}
              <div
                className={`relative ${
                  videoOrientation === 'landscape'
                    ? 'aspect-video w-full'
                    : 'aspect-[3/4] max-w-[220px] sm:max-w-xs lg:max-w-sm mx-auto w-full'
                } rounded-2xl bg-slate-900 flex items-center justify-center overflow-hidden shadow-md`}
                style={{ boxShadow: webShadows.md }}
              >
                {renderVideoPreview ? (
                  renderVideoPreview()
                ) : (
                  <div className="text-center text-slate-400 px-3">
                    <div className="text-4xl mb-2 font-bold flex items-center justify-center">
                      {renderIcon ? (
                        renderIcon(isCameraActive ? 'video' : 'videoOff', { size: 32 })
                      ) : (
                        <>
                          <span className="sr-only">{isCameraActive ? 'CAM' : 'OFF'}</span>
                          {isCameraActive ? <VideoIcon size={32} /> : <VideoOffIcon size={32} />}
                        </>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-medium">
                      {isCameraActive
                        ? isPatientView
                          ? 'Camera is on'
                          : 'Camera Self-Preview Active'
                        : isPatientView
                          ? 'Camera is off'
                          : 'Camera Disabled'}
                    </p>
                  </div>
                )}

                {/* Mic Meter + Media Mode Pill */}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
                  <div className="flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded-full text-xs text-white">
                    <span>{isPatientView ? (isMicActive ? 'Mic' : 'Muted') : 'Mic:'}</span>
                    <div className="w-14 sm:w-16 h-2 rounded-full bg-white/30 overflow-hidden">
                      <div
                        className={`h-full transition-all ${isMicActive ? 'bg-teal-500' : ''}`}
                        style={{
                          width: `${computedMicPercent}%`,
                          backgroundColor: isMicActive ? webColors.primary : undefined,
                        }}
                      />
                    </div>
                  </div>
                  {mediaModeLabel && (
                    <span className="bg-black/60 px-2.5 py-1 rounded-full text-xs font-semibold text-white">
                      {mediaModeLabel}
                    </span>
                  )}
                </div>

                {/* Media Bar */}
                <div className="absolute bottom-3 flex items-center gap-3">
              <OverlayTooltip label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}>
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isMicActive
                      ? 'bg-white text-slate-900 hover:bg-slate-100'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                  style={{
                    boxShadow: isMicActive ? webShadows.brandSubtle : webShadows.dangerSm,
                  }}
                  aria-label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
                  title={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
                >
                  {renderIcon ? (
                    renderIcon(isMicActive ? 'mic' : 'micOff', { size: 18 })
                  ) : (
                    <>
                      <span className="sr-only">{isMicActive ? 'MIC' : 'MUTE'}</span>
                      {isMicActive ? <MicIcon size={18} /> : <MicOffIcon size={18} />}
                    </>
                  )}
                </button>
              </OverlayTooltip>

              <OverlayTooltip label={isCameraActive ? 'Turn off camera' : 'Turn on camera'}>
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isCameraActive
                      ? 'bg-white text-slate-900 hover:bg-slate-100'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                  style={{
                    boxShadow: isCameraActive ? webShadows.brandSubtle : webShadows.dangerSm,
                  }}
                  aria-label={isCameraActive ? 'Stop video' : 'Start video'}
                  title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
                >
                  {renderIcon ? (
                    renderIcon(isCameraActive ? 'video' : 'videoOff', { size: 18 })
                  ) : (
                    <>
                      <span className="sr-only">{isCameraActive ? 'CAM' : 'OFF'}</span>
                      {isCameraActive ? <VideoIcon size={18} /> : <VideoOffIcon size={18} />}
                    </>
                  )}
                </button>
              </OverlayTooltip>

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
                    onClick={onToggleOrientation}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs"
                    style={{ boxShadow: webShadows.brandSubtle }}
                    aria-label="Toggle camera orientation"
                    title="Toggle camera orientation"
                  >
                    {renderIcon ? (
                      renderIcon('rotate', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">{videoOrientation === 'landscape' ? 'PORTRAIT' : 'LANDSCAPE'}</span>
                        <RotateCwIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              )}

              {(!patientLink && onSharePatientLink) && (
                <OverlayTooltip label="Copy patient invite link">
                  <button
                    type="button"
                    id="btn-share-patient-link"
                    data-testid="btn-share-patient-link"
                    onClick={() => void onSharePatientLink?.()}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs"
                    style={{ boxShadow: webShadows.brandSubtle }}
                    aria-label="Share patient invite link"
                    title="Copy patient invite link"
                  >
                    {renderIcon ? (
                      renderIcon('share', { size: 18 })
                    ) : (
                      <>
                        <span className="sr-only">SHARE</span>
                        <ShareIcon size={18} />
                      </>
                    )}
                  </button>
                </OverlayTooltip>
              )}
            </div>
          </div>
          </div>

          <div className="lg:col-span-6 space-y-4">
          {/* Patient Invite Link and PIN Card */}
          {(patientLink || patientPin) && (
            <div
              className="flex flex-col gap-2 p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs"
              style={{
                backgroundColor: webColors.primarySubtle,
                borderColor: webColors.primaryBorder,
                boxShadow: webShadows.sm,
              }}
            >
              {patientLink && (
                <div className="flex items-center justify-between">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span
                      className="font-semibold text-teal-900 dark:text-teal-200"
                      style={{ color: webColors.primaryDark }}
                    >
                      Patient Consultation Link
                    </span>
                    <span
                      className="text-teal-700 dark:text-teal-400 font-mono text-[11px] truncate"
                      style={{ color: webColors.primary }}
                    >
                      {patientLink}
                    </span>
                  </div>
                  {onSharePatientLink && (
                    <OverlayTooltip label={copiedLink ? 'Copied!' : 'Copy patient invite link'} placement="bottom">
                      <button
                        type="button"
                        id="btn-share-patient-link-card"
                        data-testid="btn-share-patient-link-card"
                        onClick={() => void handleCopyLinkCardClick()}
                        className="min-h-[36px] min-w-[36px] p-1.5 rounded-md bg-transparent hover:opacity-75 transition-opacity flex items-center justify-center shrink-0 border-0"
                        style={{
                          color: copiedLink ? lightColors.successText : webColors.primary,
                        }}
                        aria-label={copiedLink ? 'Copied!' : 'Copy patient consultation link'}
                        title={copiedLink ? 'Copied!' : 'Copy patient invite link'}
                      >
                        {copiedLink ? (
                          <CheckIcon size={16} />
                        ) : renderIcon ? (
                          renderIcon('share', { size: 16, color: webColors.primary })
                        ) : (
                          <CopyIcon size={16} />
                        )}
                      </button>
                    </OverlayTooltip>
                  )}
                </div>
              )}
              {patientPin && (
                <div className="flex items-center justify-between pt-1 border-t border-teal-200/60 dark:border-teal-800/60">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-semibold text-teal-900 dark:text-teal-200"
                      style={{ color: webColors.primaryDark }}
                    >
                      Access PIN:
                    </span>
                    <span
                      data-testid="text-waiting-room-pin"
                      className="font-mono font-bold tracking-wider text-teal-800 dark:text-teal-300"
                      style={{ color: webColors.primaryDark }}
                    >
                      {patientPin}
                    </span>
                  </div>
                  {onCopyPatientPin && (
                    <OverlayTooltip label={copiedPin ? 'Copied!' : 'Copy access PIN'} placement="bottom">
                      <button
                        type="button"
                        id="btn-copy-patient-pin"
                        data-testid="btn-copy-patient-pin"
                        onClick={() => void handleCopyPinCardClick()}
                        className="min-h-[36px] min-w-[36px] p-1.5 rounded-md bg-transparent hover:opacity-75 transition-opacity flex items-center justify-center shrink-0 border-0"
                        style={{
                          color: copiedPin ? lightColors.successText : webColors.primary,
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
                    </OverlayTooltip>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Details Card */}
          <div
            className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs sm:text-sm"
            style={{ boxShadow: webShadows.sm }}
          >
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isPatientView ? 'Your Name' : 'Patient:'}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">{patientName}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{isPatientView ? 'Your Doctor' : 'Doctor / Clinician:'}</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">{clinicianName}</span>
            </div>
            {isPatientView && scheduledTime && (
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Scheduled</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100 text-right">{scheduledTime}</span>
              </div>
            )}
          </div>

          {/* Staff Payment Policy Selector */}
          {isStaffOrDoctor && onChangePaymentPolicy && (
            <div
              className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
              style={{ boxShadow: webShadows.sm }}
            >
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Facility Payment Policy
                </span>
                {isUpdatingPolicy && <span className="text-xs text-slate-400">Updating...</span>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['Prepaid', 'Postpaid', 'Exempt'] as const).map((policy) => {
                  const isSelected = paymentPolicy === policy;
                  return (
                    <button
                      key={policy}
                      type="button"
                      onClick={() => handlePolicyChange(policy)}
                      disabled={isUpdatingPolicy || isSelected}
                      className={`min-h-[44px] px-3 py-2 rounded text-xs font-bold transition-all ${
                        isSelected
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
                      style={
                        isSelected
                          ? {
                              backgroundColor: webColors.primary,
                              borderColor: webColors.primaryDark,
                              color: webColors.onPrimary,
                              boxShadow: webShadows.brandSm,
                            }
                          : { boxShadow: webShadows.none }
                      }
                    >
                      {policy}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Payment Gate Banner */}
          {isPrepaidBlocked ? (
            <div
              className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-3"
              style={{ boxShadow: webShadows.sm }}
            >
              <span className="p-1 text-base font-bold flex items-center justify-center shrink-0">
                {renderIcon ? (
                  renderIcon('lock', { size: 18 })
                ) : (
                  <>
                    <span className="sr-only">LOCK</span>
                    <LockIcon size={18} />
                  </>
                )}
              </span>
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-300">
                  {isPatientView
                    ? 'Payment Needed Before Joining'
                    : 'Prepaid — Payment Required Before Consultation'}
                  <span className="sr-only"> (Prepayment Gate: Settlement Required)</span>
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  {isPatientView
                    ? 'Please complete payment with the clinic so your visit can begin.'
                    : 'This visit requires prepayment. Admission unlocks immediately after payment.'}
                </p>
                {isStaffOrDoctor && (onStaffPaymentOverride || onEmergencyPaymentOverride) && (
                  <button
                    type="button"
                    onClick={() => setOverrideModalVisible(true)}
                    className="mt-2.5 min-h-[44px] px-3 py-1.5 rounded text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 hover:bg-red-200 transition-colors"
                    style={{ boxShadow: webShadows.dangerSm }}
                  >
                    Staff Admission Override
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div
              className="p-3.5 rounded-lg border flex items-center gap-3"
              style={{
                backgroundColor: webColors.primarySubtle,
                borderColor: webColors.primaryBorder,
                color: webColors.primaryDark,
                boxShadow: webShadows.brandSubtle,
              }}
            >
              <span
                className="p-1 text-base font-bold flex items-center justify-center shrink-0"
                style={{ color: webColors.primaryDark }}
              >
                {renderIcon ? (
                  renderIcon('shieldCheck', { size: 18 })
                ) : (
                  <>
                    <span className="sr-only">OK</span>
                    <ShieldCheckIcon size={18} />
                  </>
                )}
              </span>
              <div>
                <p className="text-xs font-bold" style={{ color: webColors.primaryDark }}>
                  {clearedBannerCopy.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: webColors.primaryDark }}>
                  {clearedBannerCopy.subtitle}
                </p>
              </div>
            </div>
          )}

          {/* Informed Recording Consent */}
          {recordingConsentStatus !== 'Disabled' && userRole !== 'Patient' && (
            <div
              className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4"
              style={{ boxShadow: webShadows.sm }}
            >
              <div className="flex-1">
                <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-0.5">
                  Call Recording
                  <span className="sr-only"> (Informed Recording Disclosure)</span>
                </h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {recordingSubtitle}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isRecordingEnabled}
                aria-label={isRecordingEnabled ? 'Turn off call recording' : 'Turn on call recording'}
                data-testid="switch-call-recording"
                onClick={() =>
                  onSubmitConsent &&
                  onSubmitConsent(
                    !isRecordingEnabled,
                    isRecordingEnabled ? 'Patient declined recording' : undefined,
                  )
                }
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0 focus:outline-hidden"
              >
                <span
                  className={`relative inline-flex h-7 w-12 items-center rounded-full p-0.5 transition-colors ${
                    isRecordingEnabled
                      ? 'bg-teal-700'
                      : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                  style={{
                    backgroundColor: isRecordingEnabled ? webColors.primary : undefined,
                    boxShadow: isRecordingEnabled ? webShadows.brandSubtle : webShadows.none,
                  }}
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow-xs transition-transform ${
                      isRecordingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                    style={{ boxShadow: webShadows.sm }}
                  />
                </span>
              </button>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
            <button
              type="button"
              onClick={onCancelCall}
              className="w-full sm:flex-1 min-h-[48px] px-4 rounded-xl text-xs sm:text-sm font-semibold border transition-all"
              style={{
                backgroundColor: webColors.primarySubtle,
                borderColor: webColors.primaryBorder,
                color: webColors.primaryDark,
                boxShadow: webShadows.brandSubtle,
              }}
            >
              {isPatientView ? 'Leave' : 'Cancel / Leave'}
            </button>

            {videoServerUnavailable ? (
              <OverlayTooltip
                label={
                  videoServerBannerMessage ||
                  'Live video server could not be reached. Click to retry.'
                }
                placement="top"
                className="w-full sm:flex-[2] min-w-0"
              >
                <button
                  type="button"
                  data-testid="btn-retry-video-server"
                  onClick={() => void handleRetryPress()}
                  disabled={isRetryingVideoServer}
                  className="w-full min-h-[48px] px-4 rounded-xl text-xs sm:text-sm font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-all truncate"
                  style={{
                    boxShadow: isRetryingVideoServer ? webShadows.none : webShadows.dangerSm,
                  }}
                  aria-label="Video Server Unavailable — Retry"
                >
                  {isRetryingVideoServer
                    ? isPatientView
                      ? 'Reconnecting...'
                      : 'Retrying Video Server...'
                    : isPatientView
                      ? 'Connection Issue — Tap to Retry'
                      : 'Video Server Unavailable • Retry'}
                </button>
              </OverlayTooltip>
            ) : (
              <>
                {isDoctor && onAdmitPatient && (
                  <button
                    type="button"
                    onClick={handleAdmitPress}
                    disabled={isAdmitBlocked || isAdmitting}
                    className="w-full sm:flex-[2] min-h-[48px] px-4 rounded-xl text-xs sm:text-sm font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-all"
                    style={{
                      backgroundColor: webColors.primary,
                      color: webColors.onPrimary,
                      boxShadow: isAdmitBlocked || isAdmitting ? webShadows.none : webShadows.brandSm,
                    }}
                  >
                    {isAdmitting ? 'Admitting Patient...' : 'Admit Patient to Video Consultation'}
                  </button>
                )}

                {!isDoctor && (
                  <button
                    type="button"
                    onClick={onEnterCall}
                    disabled={!isReadyToAdmit}
                    className="w-full sm:flex-[2] min-h-[48px] px-4 rounded-xl text-sm sm:text-base font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-all"
                    style={{
                      backgroundColor: webColors.primary,
                      color: webColors.onPrimary,
                      boxShadow: !isReadyToAdmit ? webShadows.none : webShadows.brandSm,
                    }}
                  >
                    {isReadyToAdmit
                      ? isPatientView
                        ? 'Join Video Call'
                        : 'Enter Consultation Room'
                      : isPatientView
                        ? 'Waiting for Your Doctor...'
                        : 'Waiting for Clinician...'}
                  </button>
                )}
              </>
            )}
          </div>
            </div>
          </div>
        </div>
      )}

      {/* Staff Plain-Note Override Modal */}
      {overrideModalVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleOverrideSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-xl space-y-4"
            style={{ boxShadow: webShadows.lg }}
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Staff Admission Override
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Facility staff or attending clinicians may bypass the prepayment gate by submitting a plain reason note. This administrative action is permanently recorded in the facility audit log.
              </p>
            </div>

            <div>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Enter reason for admission override (min 5 characters)..."
                rows={3}
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-1 focus:ring-teal-500"
              />
              <p className={`text-[11px] mt-1 ${isReasonValid ? 'text-slate-500' : 'text-amber-600 font-semibold'}`}>
                {trimmedReason.length < 5
                  ? `Minimum 5 characters required (${trimmedReason.length}/5)`
                  : `Valid reason note (${trimmedReason.length} characters)`}
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setOverrideModalVisible(false)}
                disabled={isSubmittingOverride}
                className="min-h-[44px] px-4 rounded text-xs font-semibold border transition-all"
                style={{
                  backgroundColor: webColors.primarySubtle,
                  borderColor: webColors.primaryBorder,
                  color: webColors.primaryDark,
                  boxShadow: isSubmittingOverride ? webShadows.none : webShadows.brandSubtle,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmitOverride}
                className="min-h-[44px] px-4 rounded text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                style={{ boxShadow: canSubmitOverride ? webShadows.dangerSm : webShadows.none }}
              >
                {isSubmittingOverride ? 'Overriding...' : 'Audit & Admit Patient'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
