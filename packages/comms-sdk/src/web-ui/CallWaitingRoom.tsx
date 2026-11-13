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
  isLoading = false,
  error = null,
  className = ''
}) => {
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMicActive, setIsMicActive] = useState(true);
  const [overrideModalVisible, setOverrideModalVisible] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);
  const [isUpdatingPolicy, setIsUpdatingPolicy] = useState(false);

  // YAKAP enlistment is informational; it does NOT automatically exempt prepayment unless legacy isYakapExempt is true
  const isYakapEnlisted = Boolean(hasActiveYakapEnlistment ?? isYakapExempt);
  const isPrepaidBlocked =
    paymentPolicy === 'Prepaid' &&
    paymentStatus === 'Unpaid' &&
    !isYakapExempt;
  const isStaffOrDoctor = userRole === 'Clinician' || userRole === 'Staff';
  const isDoctor = userRole === 'Clinician';

  const trimmedReason = overrideReason.trim();
  const isReasonValid = trimmedReason.length >= 5;
  const canSubmitOverride =
    isReasonValid &&
    !isSubmittingOverride &&
    (Boolean(onStaffPaymentOverride) || Boolean(onEmergencyPaymentOverride));

  const handlePolicyChange = async (newPolicy: 'Prepaid' | 'Postpaid' | 'Exempt') => {
    if (!onChangePaymentPolicy || isUpdatingPolicy || newPolicy === paymentPolicy) return;
    setIsUpdatingPolicy(true);
    try {
      await onChangePaymentPolicy(newPolicy);
    } finally {
      setIsUpdatingPolicy(false);
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

  return (
    <div className={`flex flex-col h-full bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 ${className}`}>
      {/* Header */}
      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <h1 className="text-lg font-bold">Teleconsultation Staging & Waiting Room</h1>
        <p className="text-xs text-slate-500">
          Appointment: {scheduledTime} • ID: {appointmentId || callId}
        </p>
      </div>

      {/* Content States */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400" role="status">
          <div className="animate-spin text-3xl mb-2 font-bold">...</div>
          <p className="text-sm">Staging teleconsultation hardware...</p>
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
          {/* 16:9 Video Preview */}
          <div className="relative aspect-video w-full rounded-lg bg-slate-900 flex items-center justify-center overflow-hidden shadow-inner">
            <div className="text-center text-slate-400">
              <div className="text-4xl mb-2 font-bold">{isCameraActive ? 'CAM' : 'OFF'}</div>
              <p className="text-sm font-medium">
                {isCameraActive ? 'Camera Self-Preview Active' : 'Camera Disabled'}
              </p>
            </div>

            {/* Mic Meter */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded text-xs text-white">
              <span>Mic:</span>
              <div className="w-16 h-2 rounded-full bg-white/30 overflow-hidden">
                <div className={`h-full transition-all ${isMicActive ? 'w-2/3 bg-teal-700' : 'w-0'}`} />
              </div>
            </div>

            {/* Media Bar */}
            <div className="absolute bottom-3 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsMicActive((prev) => !prev)}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-base transition-colors ${
                  isMicActive
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                aria-label={isMicActive ? 'Mute microphone' : 'Unmute microphone'}
              >
                {isMicActive ? 'MIC' : 'MUTE'}
              </button>

              <button
                type="button"
                onClick={() => setIsCameraActive((prev) => !prev)}
                className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-base transition-colors ${
                  isCameraActive
                    ? 'bg-white text-slate-900 hover:bg-slate-100'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
                aria-label={isCameraActive ? 'Stop video' : 'Start video'}
              >
                {isCameraActive ? 'CAM' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Details Card */}
          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Patient:</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{patientName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Attending Clinician:</span>
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
                  Active Konsulta Enlistment Verified
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
              <span className="text-base font-bold">LOCK</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Prepayment Gate: Settlement Required
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                  This consultation is prepaid. Admission will unlock immediately upon cashier settlement.
                </p>
                {isStaffOrDoctor && (onStaffPaymentOverride || onEmergencyPaymentOverride) && (
                  <button
                    type="button"
                    onClick={() => setOverrideModalVisible(true)}
                    className="mt-2.5 min-h-[44px] px-3 py-1.5 rounded text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 hover:bg-red-200 transition-colors"
                  >
                    Staff Plain-Note Override
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
              <span className="text-base text-emerald-600 font-bold">OK</span>
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  {paymentPolicy === 'Exempt' ? 'Admission Cleared (Exempt)' : 'Payment Cleared'}
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {paymentPolicy === 'Exempt'
                    ? 'Consultation is exempt from prepayment. Ready for admission.'
                    : 'Payment confirmed. Ready for consultation admission.'}
                </p>
              </div>
            </div>
          )}

          {/* Informed Recording Consent */}
          <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <div>
              <h2 className="text-xs font-bold text-slate-900 dark:text-slate-100 mb-0.5">
                Informed Recording Disclosure
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                This clinical consultation may be recorded for medical records under RA 10173 and facility policy.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSubmitConsent && onSubmitConsent(true)}
                disabled={recordingConsentStatus === 'Approved'}
                className={`flex-1 min-h-[44px] px-3 rounded text-xs font-semibold border transition-colors ${
                  recordingConsentStatus === 'Approved'
                    ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-200 border-teal-300 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Consent to Recording
              </button>

              <button
                type="button"
                onClick={() => onSubmitConsent && onSubmitConsent(false, 'Patient declined recording')}
                disabled={recordingConsentStatus === 'Rejected'}
                className={`flex-1 min-h-[44px] px-3 rounded text-xs font-semibold border transition-colors ${
                  recordingConsentStatus === 'Rejected'
                    ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 font-bold'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                Consult Without Recording
              </button>
            </div>
          </div>

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
                onClick={onAdmitPatient}
                disabled={isPrepaidBlocked}
                className="flex-[2] min-h-[44px] px-4 rounded text-xs font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 transition-colors"
              >
                Admit Patient to Video Consultation
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
