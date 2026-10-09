import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useIsFocused } from '@react-navigation/native';
import { useAuth } from 'contexts/AuthContext';
import { ApiError } from 'services/api/apiClient';
import { createShareToken, type ShareTokenResponse } from 'services/api/sharingApi';
import {
  createQrRefresher,
  remainingFraction,
  remainingSeconds,
  type QrSession,
} from 'services/sharing/qrRefresh';
import type { SharingScope } from 'services/sharing/scopes';

const SCOPE_CHANGE_DEBOUNCE_MS = 400;
const TICK_MS = 1000;

export interface ShareQrState {
  session: QrSession<ShareTokenResponse> | null;
  /** Last request failure; cleared by the next successful token. */
  error: string | null;
  isOffline: boolean;
  /** 0..1 of the current token's validity left (1 when there is no token yet). */
  fraction: number;
  secondsLeft: number;
}

/**
 * Keeps a fresh, rotating share token for the selected scopes. The QR stops rotating while the
 * screen is blurred/unmounted, the app is backgrounded or the device is offline, and restarts
 * (with a brand-new token) when any of those end or the scope selection changes.
 */
export function useShareQr(patientId: string, scopes: readonly SharingScope[]): ShareQrState {
  const { getToken } = useAuth();
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [isOnline, setIsOnline] = useState(true);
  const [session, setSession] = useState<QrSession<ShareTokenResponse> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const scopesKey = scopes.join(',');
  const stableScopes = useMemo(() => (scopesKey ? (scopesKey.split(',') as SharingScope[]) : []), [scopesKey]);
  const active = isFocused && appActive && isOnline && stableScopes.length > 0;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false)), []);

  useEffect(() => {
    setSession(null);
    if (!active) return undefined;

    const refresher = createQrRefresher<ShareTokenResponse>({
      request: () => createShareToken(getToken, patientId, stableScopes),
      onSession: (next) => {
        setError(null);
        setNow(Date.now());
        setSession(next);
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err.firstMessage : 'Could not create a share code. Retrying…');
      },
    });
    const startTimer = setTimeout(refresher.start, SCOPE_CHANGE_DEBOUNCE_MS);
    return () => {
      clearTimeout(startTimer);
      refresher.stop();
    };
  }, [active, getToken, patientId, stableScopes]);

  useEffect(() => {
    if (!session) return undefined;
    const ticker = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(ticker);
  }, [session]);

  return {
    session,
    error,
    isOffline: !isOnline,
    fraction: session ? remainingFraction(session, now) : 1,
    secondsLeft: session ? remainingSeconds(session, now) : 0,
  };
}
