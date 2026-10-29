import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useClerk, useAuth } from '@clerk/clerk-react';
import { IconClock, IconShieldLock } from '@tabler/icons-react';
import {
  getIdleTimeoutMinutes,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  getIdleBroadcastChannel,
  ADMIN_LAST_ACTIVE_KEY,
  WARNING_COUNTDOWN_SECONDS,
} from '@/lib/idleGuard';

interface IdleSessionGuardProps {
  children: React.ReactNode;
}

export function IdleSessionGuard({ children }: IdleSessionGuardProps) {
  const { isSignedIn } = useAuth();
  const { signOut } = useClerk();

  const [isWarningOpen, setIsWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(WARNING_COUNTDOWN_SECONDS);

  const lastRecordedRef = useRef<number>(Date.now());
  const channelRef = useRef<BroadcastChannel | null>(null);

  const timeoutMinutes = getIdleTimeoutMinutes();
  const totalTimeoutSeconds = timeoutMinutes * 60;
  const warningStartSeconds = Math.max(10, totalTimeoutSeconds - WARNING_COUNTDOWN_SECONDS);

  const recordActivity = useCallback(() => {
    const now = Date.now();
    if (lastRecordedRef.current > now) {
      lastRecordedRef.current = now;
    }
    // Throttle writes to at most once per second
    if (now - lastRecordedRef.current < 1000) return;

    lastRecordedRef.current = now;
    setLastActiveTimestamp(now);
    setIsWarningOpen(false);

    if (channelRef.current) {
      channelRef.current.postMessage({ type: 'ACTIVITY', timestamp: now });
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    setIsWarningOpen(false);
    try {
      await signOut();
    } catch {
      // Ignored if signOut errors
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/sign-in?reason=session_expired';
    }
  }, [signOut]);

  useEffect(() => {
    if (!isSignedIn) {
      setIsWarningOpen(false);
      return;
    }

    // Set initial timestamp
    recordActivity();

    // Setup broadcast channel
    const channel = getIdleBroadcastChannel();
    channelRef.current = channel;

    if (channel) {
      channel.onmessage = (event) => {
        if (event.data?.type === 'ACTIVITY') {
          lastRecordedRef.current = event.data.timestamp || Date.now();
          setIsWarningOpen(false);
        } else if (event.data?.type === 'LOGOUT') {
          handleSignOut();
        }
      };
    }

    // Listen to storage events from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_LAST_ACTIVE_KEY && e.newValue) {
        const parsed = parseInt(e.newValue, 10);
        if (!isNaN(parsed)) {
          lastRecordedRef.current = parsed;
          setIsWarningOpen(false);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // Activity event listeners
    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];

    const onUserActivity = () => {
      // If warning modal is open, don't automatically dismiss on background mouse movements;
      // require explicit "Stay Signed In" button click or key press.
      if (!isWarningOpen) {
        recordActivity();
      }
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    // Check interval every second
    const intervalId = window.setInterval(() => {
      const lastActive = getLastActiveTimestamp();
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - lastActive) / 1000));

      if (elapsedSeconds >= totalTimeoutSeconds) {
        if (channelRef.current) {
          channelRef.current.postMessage({ type: 'LOGOUT' });
        }
        handleSignOut();
      } else if (elapsedSeconds >= warningStartSeconds) {
        const remaining = Math.max(0, totalTimeoutSeconds - elapsedSeconds);
        setSecondsRemaining(remaining);
        setIsWarningOpen(true);
      } else {
        setIsWarningOpen(false);
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorage);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      if (channel) {
        channel.close();
      }
    };
  }, [isSignedIn, isWarningOpen, recordActivity, handleSignOut, totalTimeoutSeconds, warningStartSeconds]);

  return (
    <>
      {children}

      {isWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="max-w-md w-full bg-surface border border-border rounded-2xl shadow-2xl p-6 text-text space-y-5">
            <div className="flex items-center gap-3.5">
              <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <IconClock className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text">
                  Session Inactivity Warning
                </h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Clinic EZ Governance Workstation
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-surface-muted border border-border text-xs text-text-secondary leading-relaxed space-y-2">
              <p>
                Due to administrative inactivity, your session will automatically terminate in:
              </p>
              <div className="text-center py-2">
                <span className="text-3xl font-mono font-bold text-amber-600 dark:text-amber-400">
                  {secondsRemaining}s
                </span>
              </div>
              <p className="text-[11px] text-text-muted text-center">
                Multi-tab security sync is active. Click below to continue working.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-border">
              <button
                type="button"
                onClick={handleSignOut}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-lg transition-colors cursor-pointer"
              >
                Sign Out Now
              </button>
              <button
                type="button"
                onClick={recordActivity}
                className="px-5 py-2 text-xs font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg transition-colors cursor-pointer shadow-sm"
              >
                Stay Signed In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
