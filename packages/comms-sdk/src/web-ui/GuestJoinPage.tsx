import React, { useRef, useState } from 'react';
import { lightColors } from '@clinicez/design-tokens';
import { GuestJoinPageProps, GuestVerificationResult } from './types';
import { AlertCircleIcon, LockIcon, ShieldCheckIcon, UserIcon, VideoIcon } from './icons';

/**
 * Formats user-typed or pasted Date of Birth digits incrementally as `YYYY-MM-DD`.
 * Leaves no dangling trailing hyphen so Backspace removes characters naturally.
 */
export function formatDobInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export const GuestJoinPage: React.FC<GuestJoinPageProps> = ({
  inviteToken,
  apiBaseUrl,
  clinicName = 'ClinicEZ Healthcare',
  clinicLogoUrl,
  clinicSupportPhone = '(02) 8123-4567',
  onSessionVerified,
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

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedDigits = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '').slice(0, 6);
    if (!pastedDigits) return;
    e.preventDefault();
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pastedDigits.length; i++) {
      next[i] = pastedDigits[i];
    }
    setOtpDigits(next);
    const focusIdx = Math.min(pastedDigits.length, 5);
    otpInputsRef.current[focusIdx]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLockedOut || isSubmitting) return;

    const fullOtp = otpDigits.join('');
    const isoDobRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dob || !isoDobRegex.test(dob) || fullOtp.length !== 6) {
      setErrorMessage('Please enter your birth date (YYYY-MM-DD) and all 6 digits of your access code.');
      return;
    }

    const [yearStr, monthStr, dayStr] = dob.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const day = parseInt(dayStr, 10);
    const currentYear = new Date().getFullYear();
    if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1 || day > 31) {
      setErrorMessage('Please enter your birth date (YYYY-MM-DD) and all 6 digits of your access code.');
      return;
    }
    const parsedDate = new Date(`${dob}T00:00:00Z`);
    if (
      isNaN(parsedDate.getTime()) ||
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() + 1 !== month ||
      parsedDate.getUTCDate() !== day
    ) {
      setErrorMessage('Please enter your birth date (YYYY-MM-DD) and all 6 digits of your access code.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      if (mockVerificationHandler) {
        const result = await mockVerificationHandler(dob, fullOtp);
        setActiveSession(result);
        onSessionVerified?.(result);
        return;
      }

      const normalizedBase = apiBaseUrl.replace(/\/+$/, '');
      const verifyUrl = normalizedBase.endsWith('/api/v1')
        ? `${normalizedBase}/portal/guest/teleconsult/verify`
        : `${normalizedBase}/api/v1/portal/guest/teleconsult/verify`;

      const res = await fetch(verifyUrl, {
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
          const remaining = 5 - nextAttempts;
          setErrorMessage(
            `Those details did not match. ${remaining} ${remaining === 1 ? 'try' : 'tries'} left.`
          );
        }
        return;
      }

      const json = await res.json();
      const verifiedPayload: GuestVerificationResult = json.data ?? json;
      setActiveSession(verifiedPayload);
      onSessionVerified?.(verifiedPayload);
    } catch (err: any) {
      setErrorMessage(
        err?.message ?? 'Something went wrong while checking your details. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // State 1: Locked out (HTTP 423)
  if (isLockedOut) {
    const telHref = `tel:${clinicSupportPhone.replace(/[^+\d]/g, '')}`;
    return (
      <main className={`min-h-dvh flex items-center justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center">
            <LockIcon size={28} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-red-700 dark:text-red-400 mb-2">
            Link Locked for Your Privacy
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-6">
            You entered details that didn&apos;t match 5 times, so we locked this link to protect your privacy.
          </p>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300">
            Please contact <strong>{clinicName}</strong>
            {clinicSupportPhone ? (
              <>
                {' '}at{' '}
                <a
                  href={telHref}
                  className="font-semibold text-teal-700 dark:text-teal-400 underline underline-offset-2 inline-flex items-center min-h-[44px]"
                >
                  {clinicSupportPhone}
                </a>
              </>
            ) : null}{' '}
            for a new link.
          </div>
        </div>
      </main>
    );
  }

  // State 2: Expired (HTTP 410)
  if (isExpired) {
    const telHref = `tel:${clinicSupportPhone.replace(/[^+\d]/g, '')}`;
    return (
      <main className={`min-h-dvh flex items-center justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-slate-50 dark:bg-slate-950 ${className}`}>
        <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900 text-center shadow-xl">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <AlertCircleIcon size={28} />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Visit Link Expired
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-4">
            This link has expired. Please call <strong>{clinicName}</strong> for a new link.
          </p>
          {clinicSupportPhone && (
            <a
              href={telHref}
              className="w-full min-h-[48px] inline-flex items-center justify-center rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-base font-semibold px-4 transition-colors"
            >
              Call {clinicSupportPhone}
            </a>
          )}
        </div>
      </main>
    );
  }

  // State 3: Active Consultation Room (HTTP 200)
  if (activeSession) {
    return (
      <main className={`min-h-dvh flex flex-col bg-slate-950 text-white ${className}`}>
        {/* Call Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900/80 backdrop-blur border-b border-slate-800">
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold truncate">{clinicName} Video Visit</h1>
            <p className="text-xs text-slate-400">
              Private video room
              <span className="sr-only"> Room: {activeSession.roomName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onSessionEnded}
            className="min-h-[44px] px-4 rounded-xl bg-red-600 hover:bg-red-700 text-xs sm:text-sm font-bold transition-colors shrink-0"
          >
            Leave
          </button>
        </div>

        {/* Video Canvas Container */}
        <div className="flex-1 flex items-center justify-center p-4 relative">
          <div className="w-full max-w-4xl aspect-video rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl overflow-hidden relative">
            <div className="text-center text-slate-400 px-4">
              <div className="flex justify-center mb-3">
                <UserIcon size={48} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-200">Waiting for your doctor&apos;s video...</p>
              <p className="text-xs text-emerald-400 mt-1 inline-flex items-center gap-1.5">
                <ShieldCheckIcon size={14} />
                <span>Private and encrypted</span>
              </p>
            </div>

            {/* Picture-in-picture patient self feed */}
            <div className="absolute bottom-3 right-3 w-28 sm:w-40 aspect-video rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center shadow-lg">
              <span className="text-xs text-slate-300">You</span>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // State 4: Landing & Dual-Factor Verification Form
  return (
    <main className={`min-h-dvh flex items-center justify-center px-4 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-slate-50 dark:bg-slate-950 ${className}`}>
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl">
        {/* Co-branding Header */}
        <div className="text-center mb-6">
          {clinicLogoUrl ? (
            <img src={clinicLogoUrl} alt={clinicName} className="h-10 mx-auto mb-3" />
          ) : (
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
              <VideoIcon size={24} />
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">{clinicName}</h1>
          <p className="text-base font-medium text-slate-800 dark:text-slate-200 mt-1">Join Your Video Visit</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Confirm your birth date and the 6-digit code from your invitation.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3.5 mb-5 rounded-xl bg-red-50 dark:bg-red-950 text-sm text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* DOB Input */}
          <div>
            <label htmlFor="dob-input" className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Date of Birth (YYYY-MM-DD)
            </label>
            <input
              id="dob-input"
              type="text"
              inputMode="numeric"
              autoComplete="bday"
              maxLength={10}
              pattern="^\d{4}-\d{2}-\d{2}$"
              value={dob}
              onChange={(e) => setDob(formatDobInput(e.target.value))}
              placeholder="1985-04-12"
              className="w-full min-h-[48px] px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-base text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
              required
            />
          </div>

          {/* OTP 6-Digit Cells */}
          <div>
            <label className="block text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              6-Digit Access Code
            </label>
            <div className="grid grid-cols-6 gap-1.5 sm:gap-2.5">
              {otpDigits.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    otpInputsRef.current[idx] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                  onPaste={handleOtpPaste}
                  className="w-full h-12 sm:h-14 text-center text-base sm:text-lg font-bold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-700"
                  aria-label={`OTP digit ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Submit CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[48px] rounded-xl bg-teal-700 text-white text-base font-bold hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-md flex items-center justify-center"
          >
            {isSubmitting ? 'Checking...' : 'Continue'}
          </button>
        </form>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheckIcon size={14} className="text-teal-700 dark:text-teal-400 shrink-0" />
          <span>Private and encrypted connection</span>
        </p>
      </div>
    </main>
  );
};
