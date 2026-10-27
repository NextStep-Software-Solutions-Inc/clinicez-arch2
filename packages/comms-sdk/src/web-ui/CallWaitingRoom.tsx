import React, { useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
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
  isYakapExempt,
  isReadyToAdmit,
  recordingConsentStatus,
  onAdmitPatient,
  onEmergencyPaymentOverride,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPrepaidBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid' && !isYakapExempt;
  const isDoctor = userRole === 'Clinician';

  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim() || isSubmitting || !onEmergencyPaymentOverride) return;
    setIsSubmitting(true);
    try {
      await onEmergencyPaymentOverride(overrideReason.trim());
      setOverrideModalVisible(false);
      setOverrideReason('');
    } finally {
      setIsSubmitting(false);
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
          <div className="animate-spin text-3xl mb-2">...</div>
          <p className="text-sm">Staging teleconsultation hardware...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center" role="alert">
          <div className="text-3xl mb-2">!</div>
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
              <div className="text-4xl mb-2">{isCameraActive ? 'CAM' : 'OFF'}</div>
              <p className="text-sm font-medium">
                {isCameraActive ? 'Camera Self-Preview Active' : 'Camera Disabled'}
              </p>
            </div>

            {/* Mic Meter */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded text-xs text-white">
              <span>Mic:</span>
              <div className="w-16 h-2 rounded-full bg-white/30 overflow-hidden">
                <div
                  className={`h-full transition-all ${isMicActive ? 'w-2/3 bg-teal-700' : 'w-0'}`}
                />
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

          {/* Payment Gate Banner */}
          {isYakapExempt ? (
            <div className="p-3.5 rounded-lg border border-teal-300 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 flex items-start gap-3">
              <span className="text-base text-teal-700 font-bold">OK</span>
              <div>
                <p className="text-xs font-bold text-teal-700 dark:text-teal-300">
                  Admission Cleared • YAKAP Auto-Exempt
                </p>
                <p className="text-[11px] text-teal-800 dark:text-teal-400 mt-0.5">
                  PhilHealth Konsulta consultation automatically cleared for admission without prepayment gate.
                </p>
              </div>
            </div>
          ) : isPrepaidBlocked ? (
            <div className="p-3.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 flex items-start gap-3">
              <span className="text-base">LOCK</span>
              <div className="flex-1">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                  Prepayment Gate: Settlement Required
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  This consultation is prepaid. Admission will unlock immediately upon cashier settlement.
                </p>
                {isDoctor && onEmergencyPaymentOverride && (
                  <button
                    type="button"
                    onClick={() => setOverrideModalVisible(true)}
                    className="mt-2.5 px-3 py-1.5 rounded text-xs font-bold bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-800 hover:bg-red-200"
                  >
                    Emergency Clinical Override
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 flex items-start gap-3">
              <span className="text-base text-emerald-600 font-bold">OK</span>
              <div>
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Payment Cleared
                </p>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Payment confirmed. Ready for consultation admission.
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
              <p className="text-[11px] text-slate-500 leading-relaxed">
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

      {/* Emergency Override Modal */}
      {overrideModalVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <form
            onSubmit={handleOverrideSubmit}
            className="w-full max-w-md rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-xl"
          >
            <h2 className="text-base font-bold text-red-600 dark:text-red-400 mb-2">
              Emergency Clinical Override
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              Attending clinicians may bypass the prepayment gate for acute clinical urgency. This action is permanently logged and audited.
            </p>

            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Clinical rationale for emergency admission..."
              rows={3}
              className="w-full p-2.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
              required
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModalVisible(false)}
                disabled={isSubmitting}
                className="min-h-[44px] px-4 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !overrideReason.trim()}
                className="min-h-[44px] px-4 rounded text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Bypassing...' : 'Audit & Admit Patient'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
