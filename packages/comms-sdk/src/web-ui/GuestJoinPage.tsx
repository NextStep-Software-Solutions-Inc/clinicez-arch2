import React, { useRef, useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { GuestJoinPageProps, GuestVerificationResult } from './types';

export const GuestJoinPage: React.FC<GuestJoinPageProps> = ({
  inviteToken,
  apiBaseUrl,
  clinicName = 'ClinicEZ Healthcare',
  clinicLogoUrl,
  clinicSupportPhone = '(02) 8123-4567',
  onSessionEnded,
  mockVerificationHandler,
  className = ''
}) => {
  const [dob, setDob] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [attemptCount, setAttemptCount] = useState<number>(0);
  const [isLockedOut, setIsLockedOut] = useState<boolean>(false);
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeSession, setActiveSession] = useState<GuestVerificationResult | null>(null);

  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const remainingAttempts = Math.max(0, 5 - attemptCount);

  const handleOtpChange = (index: number, val: string) => {
    const digit = val.replace(/\D/g, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || isSubmitting) return;

    const fullOtp = otpDigits.join('');
    const isoDobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dob || !isoDobRegex.test(dob) || fullOtp.length !== 6) {
      setErrorMessage('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
      return;
    }

    const [yearStr, monthStr, dayStr] = dob.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1 || day > 31) {
      setErrorMessage('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
      return;
    }
    const parsedDate = new Date(`${dob}T00:00:00Z`);
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() + 1 !== month ||
      parsedDate.getUTCDate() !== day
    ) {
      setErrorMessage('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mockVerificationHandler) {
        const result = await mockVerificationHandler(dob, fullOtp);
        setActiveSession(result);
        return;
      }

      const res = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/v1/guest/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteToken,
          dateOfBirth: dob,
          otp: fullOtp
        })
      });

      if (res.status === 423) {
        setIsLockedOut(true);
        setAttemptCount(5);
        return;
      }

      if (res.status === 410) {
        setIsExpired(true);
        return;
      }

      if (!res.ok) {
        const nextAttempts = attemptCount + 1;
        setAttemptCount(nextAttempts);
        if (nextAttempts >= 5) {
          setIsLockedOut(true);
        } else {
          setErrorMessage(`Verification failed. ${5 - nextAttempts} attempts remaining.`);
        }
        return;
      }

      const json = await res.json();
      setActiveSession(json.data ?? json);
    } catch (err: any) {
      setErrorMessage(err?.message ?? 'Network error during verification.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // State 1: Locked out (HTTP 423)
  if (isLockedOut) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="w-full max-w-md p-8 rounded-xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 text-center shadow-lg">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center text-3xl">
            🛡️
          </div>
          <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
            Teleconsultation Link Locked
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
            This teleconsultation link has been permanently locked after 5 failed verification attempts to protect patient privacy and health records.
          </p>
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 mb-6">
            Please contact <strong>{clinicName}</strong> at{' '}
            <span className="font-semibold text-teal-700">{clinicSupportPhone}</span> to verify your identity and receive a new invitation link.
          </div>
        </div>
      </main>
    );
  }

  // State 2: Expired (HTTP 410)
  if (isExpired) {
    return (
      <main className={`min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="w-full max-w-md p-8 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 text-center shadow-lg">
          <div className="text-4xl mb-4">⏳</div>
          <h1 className="text-xl font-bold text-amber-800 dark:text-amber-300 mb-2">
            Consultation Link Expired
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">
            This appointment verification link has expired. Please contact {clinicName} for assistance.
          </p>
        </div>
      </main>
    );
  }

  // State 3: Active Consultation Room (HTTP 200)
  if (activeSession) {
    return (
      <main className={`min-h-screen flex flex-col bg-slate-950 text-white ${className}`}>
        {/* Call Header */}
        <div className="flex items-center justify-between p-4 bg-slate-900/80 backdrop-blur border-b border-slate-800">
          <div>
            <h1 className="text-sm font-bold">{clinicName} Video Consultation</h1>
            <p className="text-xs text-slate-400">Room: {activeSession.roomName}</p>
          </div>
          <button
            type="button"
            onClick={onSessionEnded}
            className="min-h-[44px] px-4 rounded bg-red-600 hover:bg-red-700 text-xs font-bold transition-colors"
          >
            Leave Consultation
          </button>
        </div>

        {/* Video Canvas Container */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <div className="w-full max-w-4xl aspect-video rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden relative">
            <div className="text-center text-slate-400">
              <div className="text-5xl mb-3">👨‍⚕️</div>
              <p className="text-sm font-medium">Clinician Video Feed Active</p>
              <p className="text-xs text-emerald-400 mt-1">● End-to-End Encrypted</p>
            </div>

            {/* Picture-in-picture patient self feed */}
            <div className="absolute bottom-4 right-4 w-40 aspect-video rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg">
              <span className="text-xs text-slate-300">You (Guest)</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // State 4: Landing & Dual-Factor Verification Form
  return (
    <main className={`min-h-screen flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-950 ${className}`}>
      <div className="w-full max-w-md p-8 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
        {/* Co-branding Header */}
        <div className="text-center mb-6">
          {clinicLogoUrl && (
            <img src={clinicLogoUrl} alt={clinicName} className="h-10 mx-auto mb-3" />
          )}
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">{clinicName}</h1>
          <p className="text-xs text-slate-500 mt-1">Join Your Teleconsultation</p>
        </div>

        {/* Attempt Warning */}
        <div className="p-3 mb-6 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200">
          <p className="font-semibold">Security Verification</p>
          <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-300">
            5 attempts allowed. <strong>{remainingAttempts}</strong> attempts remaining before permanent lockout.
          </p>
        </div>

        {errorMessage && (
          <div className="p-3 mb-4 rounded-lg bg-red-50 dark:bg-red-950 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* DOB Input */}
          <div>
            <label htmlFor="dob-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Patient Date of Birth (YYYY-MM-DD):
            </label>
            <input
              id="dob-input"
              type="text"
              pattern="^\d{4}-\d{2}-\d{2}$"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              placeholder="1985-04-12"
              className="w-full min-h-[44px] px-3.5 rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
              required
            />
          </div>

          {/* OTP 6-Digit Cells */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              6-Digit One-Time PIN (OTP):
            </label>
            <div className="flex justify-between gap-1.5">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpInputsRef.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  className="w-11 min-h-[44px] text-center text-lg font-bold rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  aria-label={`OTP digit ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-lg bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md"
          >
            {isSubmitting ? 'Verifying...' : 'Verify & Enter Waiting Room'}
          </button>
        </form>
      </div>
    </main>
  );
};
