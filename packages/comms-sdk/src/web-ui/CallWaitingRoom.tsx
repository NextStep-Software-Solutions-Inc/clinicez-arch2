import React, { useState } from 'react';
import { WebCallWaitingRoomProps } from './types';

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
  onSharePatientLink
}) => {
  const [localCameraActive, setLocalCameraActive] = useState(true);
  const [localMicActive, setLocalMicActive] = useState(true);
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);
  const [isAdmitting, setIsAdmitting] = useState(false);

  const isCameraActive = isCameraEnabled ?? localCameraActive;
  const isMicActive = isMicEnabled ?? localMicActive;

  // YAKAP enlistment is informational; it does NOT automatically exempt prepayment unless legacy isYakapExempt is true
  const isYakapEnlisted = Boolean(hasActiveYakapEnlistment ?? isYakapExempt);
  const isPrepaidBlocked =
    paymentPolicy === 'Prepaid' &&
    paymentStatus === 'Unpaid' &&
    !isYakapExempt;
  const isStaffOrDoctor = userRole === 'Clinician' || userRole === 'Staff';
  const isDoctor = userRole === 'Clinician';

  const isRecordingEnabled = recordingConsentStatus === 'Approved';
  const recordingSubtitle = isRecordingEnabled
    ? 'Recording is on for this consultation.'
    : recordingConsentStatus === 'Rejected'
      ? 'Recording is off for this consultation.'
      : 'Turn on to record this consultation for the medical chart.';
  const trimmedReason = overrideReason.trim();
  const isReasonValid = trimmedReason.length >= 5;
  const canSubmitOverride =
    isReasonValid &&
    !isSubmittingOverride &&
    (Boolean(onStaffPaymentOverride) || Boolean(onEmergencyPaymentOverride));

  const clearedBannerCopy =
    paymentPolicy === 'Exempt'
      ? {
          title: 'Exempt — Admission Cleared',
          subtitle: 'This consultation is exempt from payment and ready to start.',
        }
      : paymentPolicy === 'Postpaid'
        ? {
            title: 'Postpaid — Admission Cleared',
            subtitle: 'Charges will be settled after the visit. Ready to start.',
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
    if (!onAdmitPatient || isPrepaidBlocked || isAdmitting) return;
    setIsAdmitting(true);
    try {
      await onAdmitPatient();
    } finally {
      setIsAdmitting(false);
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
    <div className={`flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header */}
      {!hideHeader && (
        <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
          <h1 className="text-lg font-bold">
            Teleconsultation Waiting Room
            <span className="sr-only"> (Teleconsultation Staging &amp; Waiting Room)</span>
          </h1>
          <p className="text-xs text-slate-500">
            Appointment: {scheduledTime} • ID: {appointmentId || callId}
          </p>
        </div>
      )}

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <div className="animate-spin text-3xl mb-2 font-bold">...</div>
          <p className="text-sm">
            Checking camera and microphone...
            <span className="sr-only"> Staging teleconsultation hardware</span>
          </p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <div className="text-3xl mb-2 font-bold text-red-600">!</div>
          <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">
            Hardware or Media Connection Error
          </p>
          <p className="text-xs text-slate-500">{error}</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full space-y-4">
          {/* Dynamic Video Preview */}
          <div
            className={`relative ${
              videoOrientation === 'landscape'
                ? 'aspect-video w-full'
                : 'aspect-[3/4] max-w-sm mx-auto w-full'
            } rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden shadow-inner`}
          >
            {renderVideoPreview ? (
              renderVideoPreview()
            ) : (
              <div className="text-center text-slate-400">
                <div className="text-4xl mb-2 font-bold flex items-center justify-center">
                  {renderIcon
                    ? renderIcon(isCameraActive ? 'video' : 'videoOff', { size: 32 })
                    : isCameraActive
                      ? 'CAM'
                      : 'OFF'}
                </div>
                <p className="text-sm font-medium">
                  {isCameraActive ? 'Camera Self-Preview Active' : 'Camera Disabled'}
                </p>
              </div>
            )}

            {/* Mic Meter + Media Mode Pill */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded text-xs text-white">
                <span>Mic:</span>
                <div className="w-16 h-2 rounded-full bg-white/30 overflow-hidden">
                  <div
                    className={`h-full transition-all ${isMicActive ? 'bg-teal-500' : ''}`}
                    style={{ width: `${computedMicPercent}%` }}
                  />
                </div>
              </div>
              {mediaModeLabel && (
                <span className="bg-black/60 px-2.5 py-1 rounded text-[11px] font-semibold text-white">
                  {mediaModeLabel}
                </span>
              )}
            </div>

            {/* Media Bar */}
            <div className="absolute bottom-3 flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleMic}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isMicActive
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                aria-label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
              >
                {renderIcon
                  ? renderIcon(isMicActive ? 'mic' : 'micOff', { size: 18 })
                  : isMicActive
                    ? 'MIC'
                    : 'MUTE'}
              </button>

              <button
                type="button"
                onClick={handleToggleCamera}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  isCameraActive
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                aria-label={isCameraActive ? 'Stop video' : 'Start video'}
              >
                {renderIcon
                  ? renderIcon(isCameraActive ? 'video' : 'videoOff', { size: 18 })
                  : isCameraActive
                    ? 'CAM'
                    : 'OFF'}
              </button>

              {onToggleOrientation && (
                <button
                  type="button"
                  id="btn-toggle-orientation"
                  data-testid="btn-toggle-orientation"
                  onClick={onToggleOrientation}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs"
                  aria-label="Toggle camera orientation"
                  title="Toggle camera orientation"
                >
                  {renderIcon
                    ? renderIcon('rotate', { size: 18 })
                    : videoOrientation === 'landscape'
                      ? 'PORTRAIT'
                      : 'LANDSCAPE'}
                </button>
              )}

              {(patientLink || onSharePatientLink) && (
                <button
                  type="button"
                  id="btn-share-patient-link"
                  data-testid="btn-share-patient-link"
                  onClick={() => void onSharePatientLink?.()}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-xs font-bold transition-colors bg-white/20 hover:bg-white/30 text-white backdrop-blur-xs"
                  aria-label="Share patient invite link"
                  title="Share patient invite link"
                >
                  {renderIcon ? renderIcon('share', { size: 18 }) : 'SHARE'}
                </button>
              )}
            </div>
          </div>

          {/* Patient Invite Link Card */}
          {patientLink && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-xs">
              <div className="flex flex-col min-w-0 pr-2">
                <span className="font-semibold text-teal-900 dark:text-teal-200">Patient Consultation Link</span>
                <span className="text-teal-700 dark:text-teal-400 font-mono text-[11px] truncate">
                  {patientLink}
                </span>
              </div>
              {onSharePatientLink && (
                <button
                  type="button"
                  id="btn-share-patient-link-card"
                  data-testid="btn-share-patient-link-card"
                  onClick={() => void onSharePatientLink()}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-md text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 transition-colors flex items-center gap-1.5 shrink-0"
                  aria-label="Share patient consultation link"
                >
                  {renderIcon ? renderIcon('share', { size: 16 }) : null}
                  <span>Share Link</span>
                </button>
              )}
            </div>
          )}

          {/* Details Card */}
          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Patient:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Doctor / Clinician:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{clinicianName}</span>
            </div>
          </div>

          {/* Informational YAKAP Badge (Non-Mutating) */}
          {isYakapEnlisted && (
            <div className="p-3.5 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200 flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white">
                  PHILHEALTH YAKAP
                </span>
                <span className="text-xs font-bold text-blue-800 dark:text-blue-300">
                  {isYakapExempt
                    ? 'YAKAP Auto-Exempt • Active Konsulta Enlistment Verified'
                    : 'Active Konsulta Enlistment Verified'}
                </span>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                Patient has an active PhilHealth YAKAP enlistment. Staff may adjust the payment policy to Exempt or Postpaid if covered under primary care capitation.
              </p>
            </div>
          )}

          {/* Staff Payment Policy Selector */}
          {isStaffOrDoctor && onChangePaymentPolicy && (
            <div className="p-3.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
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
                      className={`min-h-[44px] px-3 py-2 rounded text-xs font-bold transition-colors ${
                        isSelected
                          ? 'bg-teal-700 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                      }`}
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
            <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <span className="p-1 text-base font-bold flex items-center justify-center shrink-0">
                {renderIcon ? renderIcon('lock', { size: 18 }) : 'LOCK'}
              </span>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Prepaid — Payment Required Before Consultation
                  <span className="sr-only"> (Prepayment Gate: Settlement Required)</span>
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  This visit requires prepayment. Admission unlocks immediately after payment.
                </p>
                {isStaffOrDoctor && (onStaffPaymentOverride || onEmergencyPaymentOverride) && (
                  <button
                    type="button"
                    onClick={() => setOverrideModalVisible(true)}
                    className="mt-2.5 min-h-[44px] px-3 py-1.5 rounded text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 hover:bg-red-200 transition-colors"
                  >
                    Staff Admission Override
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 flex items-center gap-3">
              <span className="p-1 text-base text-emerald-600 font-bold flex items-center justify-center shrink-0">
                {renderIcon ? renderIcon('shieldCheck', { size: 18 }) : 'OK'}
              </span>
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {clearedBannerCopy.title}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {clearedBannerCopy.subtitle}
                </p>
              </div>
            </div>
          )}

          {/* Informed Recording Consent */}
          {recordingConsentStatus !== 'Disabled' && (
            <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
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
                >
                  <span
                    className={`inline-block h-6 w-6 rounded-full bg-white shadow-xs transition-transform ${
                      isRecordingEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </span>
              </button>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onCancelCall}
              className="flex-1 min-h-[44px] px-4 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
            >
              Cancel / Leave
            </button>

            {isDoctor && onAdmitPatient && (
              <button
                type="button"
                onClick={handleAdmitPress}
                disabled={isPrepaidBlocked || isAdmitting}
                className="flex-[2] min-h-[44px] px-4 rounded text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {isAdmitting ? 'Admitting Patient...' : 'Admit Patient to Video Consultation'}
              </button>
            )}

            {!isDoctor && (
              <button
                type="button"
                onClick={onEnterCall}
                disabled={!isReadyToAdmit}
                className="flex-[2] min-h-[44px] px-4 rounded text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                {isReadyToAdmit ? 'Enter Consultation Room' : 'Waiting for Clinician...'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Staff Plain-Note Override Modal */}
      {overrideModalVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <form
            onSubmit={handleOverrideSubmit}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-xl space-y-4"
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
                className="min-h-[44px] px-4 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmitOverride}
                className="min-h-[44px] px-4 rounded text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
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
