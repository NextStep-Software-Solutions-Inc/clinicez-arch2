import axios from 'axios';
import { Platform } from 'react-native';
import { ApiError, extractApiError, resolveTenantContext, type ApiResponse } from '@shared/safe';
import { getPharmacyApiBaseUrl } from './runtimeConfig';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStorage';

/**
 * Facility-local pharmacy session (no identity provider, no internet requirement).
 *
 * The pharmacy server issues a short-lived access token plus a rotating refresh token.
 * - On web (`Platform.OS === 'web'`), the refresh token lives in an HttpOnly session cookie managed by
 *   `pharmacy-api`, the access token lives in JS memory only, and tabs coordinate via Web Locks + BroadcastChannel.
 * - On native (`Platform.OS !== 'web'`), the refresh token lives in Keychain/Keystore via `expo-secure-store`.
 */

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  roleName?: string | null;
  pharmacyId: string;
  tenantId: string;
  pharmacyName: string;
  permissions: string[];
  mustChangePassword: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: AuthUser;
}

export type AuthResult<T> = [T | null, ApiError | null];

const REFRESH_KEY = 'clinicez.pharmacy.auth.refresh';
const AUTH_CHANNEL_NAME = 'clinicez-pharmacy-auth';
const REFRESH_LOCK_NAME = 'clinicez.pharmacy.auth.refresh';
const EXPIRY_SKEW_MS = 30_000;
const FALLBACK_ACCESS_LIFETIME_MS = 10 * 60_000;
const NETWORK_RETRY_BACKOFF_MS = 15_000;

const isWeb = (): boolean => Platform.OS === 'web';

type AuthBroadcastMessage =
  | { type: 'session-refreshed'; accessToken: string; accessTokenExpiresAtUtc: string; user: AuthUser }
  | { type: 'session-cleared'; reason?: 'logout' | 'expired' | 'idle' }
  | { type: 'activity'; timestamp: number };

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshToken: string | null = null;
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
    accessExpiresAt = Date.parse(data.accessTokenExpiresAtUtc) || Date.now() + FALLBACK_ACCESS_LIFETIME_MS;
    user = data.user;
    emit();
  } else if (data.type === 'session-cleared') {
    const hadSession = user !== null || accessToken !== null;
    accessToken = null;
    accessExpiresAt = 0;
    refreshToken = null;
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

export function getAccessToken(): string | null {
  return accessToken;
}

export function tenantHeaders(): Record<string, string> {
  const context = resolveTenantContext();
  const headers: Record<string, string> = {};
  if (context.tenantSlug) headers['X-Tenant-Id'] = context.tenantSlug;
  if (context.facilitySlug) headers['X-Facility-Slug'] = context.facilitySlug;
  return headers;
}

async function postAuth<T>(path: string, body: unknown): Promise<AuthResult<T>> {
  try {
    const response = await axios.post<ApiResponse<T>>(`${getPharmacyApiBaseUrl()}${path}`, body, {
      timeout: 15000,
      withCredentials: isWeb(),
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': Platform.OS,
        ...tenantHeaders(),
      },
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, extractApiError(error)];
  }
}

async function applyTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.parse(tokens.accessTokenExpiresAtUtc) || Date.now() + FALLBACK_ACCESS_LIFETIME_MS;
  user = tokens.user;

  if (isWeb()) {
    refreshToken = null;
    broadcastAuth({
      type: 'session-refreshed',
      accessToken: tokens.accessToken,
      accessTokenExpiresAtUtc: tokens.accessTokenExpiresAtUtc,
      user: tokens.user,
    });
  } else {
    refreshToken = tokens.refreshToken ?? null;
    if (tokens.refreshToken) {
      await setSecureItem(REFRESH_KEY, tokens.refreshToken);
    }
  }
  emit();
}

async function clearSession(reason: 'none' | 'expired' | 'idle' | 'logout' = 'none') {
  accessToken = null;
  accessExpiresAt = 0;
  refreshToken = null;
  user = null;
  await deleteSecureItem(REFRESH_KEY);
  if (isWeb()) {
    broadcastAuth({
      type: 'session-cleared',
      reason: reason === 'none' ? 'logout' : reason,
    });
  }
  emit();
  if (reason === 'expired' || reason === 'idle') {
    notifyReason(reason);
  }
}

export async function login(email: string, password: string): Promise<AuthResult<AuthUser>> {
  const [tokens, error] = await postAuth<AuthTokens>('/auth/login', {
    email: email.trim(),
    password,
    deviceLabel: `Clinic EZ Pharmacy ${Platform.OS}`,
  });
  if (error || !tokens) return [null, error ?? new ApiError('Sign-in failed.', 0)];
  await applyTokens(tokens);
  noticeHandler?.(null);
  return [tokens.user, null];
}

export async function logout(): Promise<void> {
  if (isWeb()) {
    await postAuth<object>('/auth/logout', {});
  } else {
    const token = refreshToken;
    if (token) {
      await postAuth<object>('/auth/logout', { refreshToken: token });
    }
  }
  await clearSession('logout');
}

export async function idleLogout(): Promise<void> {
  if (isWeb()) {
    await postAuth<object>('/auth/logout', {});
  } else {
    const token = refreshToken;
    if (token) {
      await postAuth<object>('/auth/logout', { refreshToken: token });
    }
  }
  await clearSession('idle');
}

async function executeRefresh(): Promise<boolean> {
  if (isWeb()) {
    if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) {
      return true;
    }
    const [tokens, error] = await postAuth<AuthTokens>('/auth/refresh', {});
    if (tokens) {
      await applyTokens(tokens);
      return true;
    }
    if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
      await clearSession('expired');
    } else {
      lastNetworkFailureAt = Date.now();
    }
    return false;
  }

  if (!refreshToken) return false;
  const [tokens, error] = await postAuth<AuthTokens>('/auth/refresh', { refreshToken });
  if (tokens) {
    await applyTokens(tokens);
    return true;
  }
  if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
    await clearSession('expired');
  } else {
    lastNetworkFailureAt = Date.now();
  }
  return false;
}

export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (isWeb() && locks?.request) {
      return locks.request(REFRESH_LOCK_NAME, () => executeRefresh());
    }
    return executeRefresh();
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Restores a web cookie session on new tab load, or a native Keychain/Keystore session on app restart. */
export async function restoreSession(): Promise<AuthUser | null> {
  if (isWeb()) {
    if (await refreshSession()) {
      return user;
    }
    return null;
  }

  const storedRefresh = await getSecureItem(REFRESH_KEY);
  if (!storedRefresh) return null;
  refreshToken = storedRefresh;
  if (await refreshSession()) {
    return user;
  }
  return null;
}

/** Returns an access token that is valid for at least a few more seconds, rotating it first if needed. */
export async function getValidAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) return accessToken;
  if (Date.now() - lastNetworkFailureAt < NETWORK_RETRY_BACKOFF_MS) return accessToken;
  if (!isWeb() && !refreshToken) return accessToken;
  await refreshSession();
  return accessToken;
}

export function hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
  if (!permission) return true;
  if (!permissions) return false;
  return permissions.includes('*') || permissions.some((p) => p.toLowerCase() === permission.toLowerCase());
}
