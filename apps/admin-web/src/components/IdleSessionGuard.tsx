import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useClerk, useAuth } from '@clerk/clerk-react';
import { IconClock } from '@tabler/icons-react';
import {
  getIdleTimeoutMinutes,
  getLastActiveTimestamp,
  setLastActiveTimestamp,
  clearLastActiveTimestamp,
  evaluateIdleStatus,
  createSafeIdleBroadcastChannel,
  type SafeIdleChannel,
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

  const lastRecordedRef = useRef<number>(0);
  const channelRef = useRef<SafeIdleChannel | null>(null);
  const isWarningOpenRef = useRef<boolean>(false);
  const isSigningOutRef = useRef<boolean>(false);
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  const timeoutMinutes = getIdleTimeoutMinutes();
  const totalTimeoutSeconds = timeoutMinutes * 60;
  const warningStartSeconds = Math.max(10, totalTimeoutSeconds - WARNING_COUNTDOWN_SECONDS);

  const setWarningOpen = useCallback((open: boolean) => {
    isWarningOpenRef.current = open;
    setIsWarningOpen(open);
  }, []);

  const recordActivity = useCallback(
    (force = false) => {
      if (isSigningOutRef.current) return;

      const now = Date.now();
      if (lastRecordedRef.current > now) {
        lastRecordedRef.current = now;
      }
      // Throttle passive writes to at most once per second
      if (!force && now - lastRecordedRef.current < 1000) return;

      lastRecordedRef.current = now;
      setLastActiveTimestamp(now);
      setWarningOpen(false);

      const channel = channelRef.current;
      if (channel && !channel.isClosed) {
        channel.postMessage({ type: 'ACTIVITY', timestamp: now });
      }
    },
    [setWarningOpen]
  );

  const handleStaySignedIn = useCallback(() => {
    recordActivity(true);
  }, [recordActivity]);

  const handleSignOut = useCallback(
    async (broadcastLogout = false) => {
      if (isSigningOutRef.current) return;
      isSigningOutRef.current = true;
      setWarningOpen(false);

      if (broadcastLogout) {
        const channel = channelRef.current;
        if (channel && !channel.isClosed) {
          channel.postMessage({ type: 'LOGOUT' });
        }
      }

      clearLastActiveTimestamp();

      try {
        await signOutRef.current();
      } catch {
        // Ignored if signOut errors
      }
      if (typeof window !== 'undefined') {
        window.location.href = '/sign-in?reason=session_expired';
      }
    },
    [setWarningOpen]
  );

  const handleManualSignOut = useCallback(() => {
    void handleSignOut(true);
  }, [handleSignOut]);

  useEffect(() => {
    if (!isSignedIn) {
      if (channelRef.current) {
        const staleChannel = channelRef.current;
        channelRef.current = null;
        staleChannel.close();
      }
      isSigningOutRef.current = false;
      lastRecordedRef.current = 0;
      setWarningOpen(false);
      return;
    }

    let isDisposed = false;
    isSigningOutRef.current = false;

    // Setup lifecycle-guarded broadcast channel BEFORE posting any initial activity
    const channel = createSafeIdleBroadcastChannel();
    channelRef.current = channel;

    const evaluateAndEnforceIdle = () => {
      if (isDisposed || isSigningOutRef.current) return;

      const lastActive = getLastActiveTimestamp();
      const status = evaluateIdleStatus(
        lastActive,
        Date.now(),
        totalTimeoutSeconds,
        warningStartSeconds
      );

      if (status.isExpired) {
        void handleSignOut(true);
      } else if (status.isWarning) {
        setSecondsRemaining(status.remainingSeconds);
        setWarningOpen(true);
      } else {
        setWarningOpen(false);
      }
    };

    if (channel) {
      channel.setOnMessage((event) => {
        if (isDisposed) return;
        if (event.data?.type === 'ACTIVITY') {
          if (isSigningOutRef.current) return;
          const now = Date.now();
          const incoming =
            typeof event.data.timestamp === 'number' && Number.isFinite(event.data.timestamp)
              ? Math.min(event.data.timestamp, now)
              : now;
          lastRecordedRef.current = incoming;
          setWarningOpen(false);
        } else if (event.data?.type === 'LOGOUT') {
          void handleSignOut(false);
        }
      });
    }

    // Initialize activity timestamp safely after channel setup
    recordActivity(true);

    // Listen to storage events from other tabs
    const handleStorage = (e: StorageEvent) => {
      if (isDisposed || isSigningOutRef.current) return;
      if (e.key === ADMIN_LAST_ACTIVE_KEY && e.newValue) {
        const parsed = parseInt(e.newValue, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          lastRecordedRef.current = Math.min(parsed, Date.now());
          setWarningOpen(false);
        }
      }
    };
    window.addEventListener('storage', handleStorage);

    // Re-evaluate immediately when returning to a backgrounded or sleeping tab
    const handleVisibilityChange = () => {
      if (isDisposed) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        evaluateAndEnforceIdle();
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    const handleFocus = () => {
      if (isDisposed) return;
      evaluateAndEnforceIdle();
    };
    window.addEventListener('focus', handleFocus);

    // Activity event listeners
    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];

    const onUserActivity = () => {
      if (isDisposed || isSigningOutRef.current) return;
      // If warning modal is open, don't automatically dismiss on background mouse movements;
      // require explicit "Stay Signed In" button click.
      if (isWarningOpenRef.current) return;

      // Guard against browser-throttled timers: if the idle window has already expired
      // before setInterval or visibilitychange fired, enforce sign-out instead of extending.
      const status = evaluateIdleStatus(
        getLastActiveTimestamp(),
        Date.now(),
        totalTimeoutSeconds,
        warningStartSeconds
      );
      if (status.isExpired) {
        void handleSignOut(true);
        return;
      }

      recordActivity(false);
    };

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, onUserActivity, { passive: true });
    });

    // Check interval every second
    const intervalId = window.setInterval(evaluateAndEnforceIdle, 1000);

    return () => {
      isDisposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleStorage);
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      window.removeEventListener('focus', handleFocus);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, onUserActivity);
      });
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      if (channel) {
        channel.close();
      }
    };
  }, [isSignedIn, recordActivity, handleSignOut, setWarningOpen, totalTimeoutSeconds, warningStartSeconds]);

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
                onClick={handleManualSignOut}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text rounded-lg transition-colors cursor-pointer"
              >
                Sign Out Now
              </button>
              <button
                type="button"
                onClick={handleStaySignedIn}
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
