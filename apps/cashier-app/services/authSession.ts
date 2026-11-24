import axios from 'axios';
import { Platform } from 'react-native';
import { ApiError, extractApiError, type ApiResponse } from '@shared/safe';
import type { AuthToken, AuthUser } from '../types/billing';
import { getBillingApiBaseUrl } from './runtimeConfig';

/**
 * Cell-local cashier session (no identity provider, no internet requirement).
 *
 * - On web (`Platform.OS === 'web'`), `billing-api` sets a shift-long `HttpOnly; SameSite=Lax; Path=/api/v1/auth`
 *   session cookie (`clinicez_billing_session`) and returns a short-lived `accessToken` kept in JS memory only.
 *   Opening a new tab restores the access token via `/auth/refresh`, while tabs coordinate refreshes and logouts
 *   through Web Locks + `BroadcastChannel`.
 * - On native (`Platform.OS !== 'web'`), `billing-api` returns a shift-long `accessToken` kept in memory only.
 */

export type AuthResult<T> = [T | null, ApiError | null];

export interface SignInInput {
  tenantId: string;
  facilityId: string;
  email: string;
  password: string;
}

const AUTH_CHANNEL_NAME = 'clinicez-cashier-auth';
const REFRESH_LOCK_NAME = 'clinicez.cashier.auth.refresh';
const EXPIRY_SKEW_MS = 30_000;
const FALLBACK_SHIFT_MS = 10 * 60 * 60_000;
const FALLBACK_WEB_ACCESS_MS = 15 * 60_000;
const NETWORK_RETRY_BACKOFF_MS = 15_000;

const isWeb = (): boolean => Platform.OS === 'web';

type AuthBroadcastMessage =
  | { type: 'session-refreshed'; accessToken: string; expiresAtUtc: string; user: AuthUser }
  | { type: 'session-cleared'; reason?: 'logout' | 'expired' | 'idle' }
  | { type: 'activity'; timestamp: number };

let accessToken: string | null = null;
let accessExpiresAt = 0;
let user: AuthUser | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let lastNetworkFailureAt = 0;

let authChannel: BroadcastChannel | null = null;
let authChannelBound = false;

type Listener = (user: AuthUser | null) => void;
const listeners = new Set<Listener>();
type ActivityListener = (timestamp: number) => void;
const activityListeners = new Set<ActivityListener>();
let noticeHandler: ((notice: string | null) => void) | null = null;

function emit() {
  listeners.forEach((listener) => listener(user));
}

function notifyReason(reason: 'logout' | 'expired' | 'idle') {
  if (reason === 'idle') {
    noticeHandler?.('Signed out due to inactivity. Please sign in again.');
  } else if (reason === 'expired') {
    noticeHandler?.('Your session has ended. Please sign in again.');
  }
}

function handleBroadcastMessage(data: AuthBroadcastMessage | null | undefined) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'session-refreshed') {
    accessToken = data.accessToken;
    accessExpiresAt = Date.parse(data.expiresAtUtc) || Date.now() + FALLBACK_WEB_ACCESS_MS;
    user = data.user;
    emit();
  } else if (data.type === 'session-cleared') {
    const hadSession = user !== null || accessToken !== null;
    accessToken = null;
    accessExpiresAt = 0;
    user = null;
    emit();
    if (hadSession && data.reason && data.reason !== 'logout') {
      notifyReason(data.reason);
    }
  } else if (data.type === 'activity') {
    if (typeof data.timestamp === 'number' && Number.isFinite(data.timestamp)) {
      activityListeners.forEach((listener) => listener(data.timestamp));
    }
  }
}

function getAuthChannel(): BroadcastChannel | null {
  if (!isWeb() || typeof BroadcastChannel === 'undefined') return null;
  if (!authChannel) {
    try {
      authChannel = new BroadcastChannel(AUTH_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  if (!authChannelBound && authChannel) {
    authChannelBound = true;
    authChannel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
      handleBroadcastMessage(event?.data);
    };
  }
  return authChannel;
}

function broadcastAuth(message: AuthBroadcastMessage) {
  try {
    getAuthChannel()?.postMessage(message);
  } catch {
    // Ignore restricted/closed channel errors.
  }
}

/** Resets cached BroadcastChannel reference (used by unit tests). */
export function __resetAuthChannelForTests() {
  try {
    authChannel?.close?.();
  } catch {
    // ignore
  }
  authChannel = null;
  authChannelBound = false;
}

export function subscribeSession(listener: Listener): () => void {
  getAuthChannel();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function subscribeRemoteActivity(listener: ActivityListener): () => void {
  getAuthChannel();
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
}

export function broadcastActivity(timestamp: number): void {
  if (!isWeb()) return;
  broadcastAuth({ type: 'activity', timestamp });
}

export function onSessionNotice(handler: ((notice: string | null) => void) | null) {
  noticeHandler = handler;
}

export function getSessionUser(): AuthUser | null {
  return user;
}

function applyToken(token: AuthToken) {
  const fallbackMs = isWeb() ? FALLBACK_WEB_ACCESS_MS : FALLBACK_SHIFT_MS;
  accessToken = token.accessToken;
  accessExpiresAt = Date.parse(token.expiresAtUtc) || Date.now() + fallbackMs;
  user = token.user;
  lastNetworkFailureAt = 0;
  if (isWeb()) {
    broadcastAuth({
      type: 'session-refreshed',
      accessToken: token.accessToken,
      expiresAtUtc: token.expiresAtUtc,
      user: token.user,
    });
  }
  emit();
}

function clearSession(reason: 'none' | 'expired' | 'idle' | 'logout' = 'none') {
  const hadSession = user !== null || accessToken !== null;
  accessToken = null;
  accessExpiresAt = 0;
  user = null;
  lastNetworkFailureAt = 0;
  if (isWeb() && (reason !== 'expired' || hadSession)) {
    broadcastAuth({
      type: 'session-cleared',
      reason: reason === 'none' ? 'logout' : reason,
    });
  }
  emit();
  if ((reason === 'expired' && hadSession) || reason === 'idle') {
    notifyReason(reason);
  }
}

/** The bearer token while the session is alive; expired tokens are dropped so the app asks for sign-in. */
export function getAccessToken(): string | null {
  if (accessToken && Date.now() >= accessExpiresAt) endSession();
  return accessToken;
}

export function endSession() {
  clearSession('expired');
}

export async function login(input: SignInInput): Promise<AuthResult<AuthUser>> {
  try {
    const response = await axios.post<ApiResponse<AuthToken>>(
      `${getBillingApiBaseUrl()}/auth/login`,
      {
        tenantId: input.tenantId.trim(),
        facilityId: input.facilityId.trim(),
        email: input.email.trim(),
        password: input.password,
      },
      {
        timeout: 15000,
        withCredentials: isWeb(),
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': Platform.OS,
        },
      },
    );
    const token = response.data?.data;
    if (!token) return [null, new ApiError('Sign-in failed.', 0)];

    applyToken(token);
    noticeHandler?.(null);
    return [token.user, null];
  } catch (error) {
    return [null, extractApiError(error, 'Sign-in failed.')];
  }
}

async function executeRefresh(): Promise<boolean> {
  if (!isWeb()) return false;
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) {
    return true;
  }

  try {
    const response = await axios.post<ApiResponse<AuthToken>>(
      `${getBillingApiBaseUrl()}/auth/refresh`,
      {},
      {
        timeout: 15000,
        withCredentials: true,
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Platform': Platform.OS,
        },
      },
    );
    const token = response.data?.data;
    if (token) {
      applyToken(token);
      return true;
    }
    return false;
  } catch (error) {
    const apiError = extractApiError(error);
    if (apiError.status !== 0 && apiError.status >= 400 && apiError.status < 500) {
      clearSession('expired');
    } else {
      lastNetworkFailureAt = Date.now();
    }
    return false;
  }
}

export function refreshSession(): Promise<boolean> {
  if (!isWeb()) return Promise.resolve(false);
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request(REFRESH_LOCK_NAME, () => executeRefresh());
    }
    return executeRefresh();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Ensures an active bearer token is available (refreshing from the web HttpOnly cookie when needed). */
export async function ensureFreshAccessToken(): Promise<string | null> {
  if (!isWeb()) return getAccessToken();
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) return accessToken;
  if (!user && !accessToken) return null;
  if (Date.now() - lastNetworkFailureAt < NETWORK_RETRY_BACKOFF_MS) return accessToken;
  await refreshSession();
  return accessToken;
}

/** Restores a web cookie session when opening a new tab or reloading. */
export async function restoreSession(): Promise<AuthUser | null> {
  if (!isWeb()) return user;
  if (await refreshSession()) {
    return user;
  }
  return null;
}

export async function logout(): Promise<void> {
  if (isWeb()) {
    try {
      await axios.post(
        `${getBillingApiBaseUrl()}/auth/logout`,
        {},
        {
          timeout: 15000,
          withCredentials: true,
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': Platform.OS,
          },
        },
      );
    } catch {
      // Never block sign-out on connectivity.
    }
  }
  clearSession('logout');
}

export async function idleLogout(): Promise<void> {
  if (isWeb()) {
    try {
      await axios.post(
        `${getBillingApiBaseUrl()}/auth/logout`,
        {},
        {
          timeout: 15000,
          withCredentials: true,
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Platform': Platform.OS,
          },
        },
      );
    } catch {
      // Never block idle sign-out on connectivity.
    }
  }
  clearSession('idle');
}

export function hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
  if (!permission) return true;
  if (!permissions) return false;
  return permissions.some((p) => p.toLowerCase() === permission.toLowerCase());
}
