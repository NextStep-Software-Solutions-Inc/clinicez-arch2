import axios from 'axios';
import { Platform } from 'react-native';
import { ApiError, extractApiError, ensureApiPrefix, resolveTenantContext, getStoredTenantSlug, getStoredFacilitySlug, type ApiResponse } from '@shared/safe';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStorage';
import { getApiBaseUrl, getOfflineGraceHours } from './runtimeConfig';
import { runBeforeLockHooks } from './sessionHooks';

/**
 * Facility-local session manager (no identity provider, no internet requirement).
 *
 * The clinic server issues a short-lived access token plus a rotating refresh token. This module owns them:
 *  - the access token lives in memory only;
 *  - the refresh token and a cached copy of the signed-in user live in secure storage
 *    (Keychain/Keystore on native, HttpOnly cookie managed by clinic-api on web);
 *  - refreshes are single-flight so a burst of 401s triggers exactly one rotation.
 */

export interface SessionPolicy {
  idleLockMinutes: number;
  maxLockedSessionHours: number;
  allowStaffPinUnlock: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email?: string | null;
  role: string;
  roleName?: string | null;
  clinicId: string;
  tenantId: string;
  clinicName: string;
  permissions: string[];
  mustChangePassword: boolean;
  hasQuickUnlockPin?: boolean;
  sessionPolicy?: SessionPolicy | null;
}

export interface LockedSessionInfo {
  staffId: string;
  name: string;
  email?: string | null;
  role: string;
  roleName?: string | null;
  clinicName: string;
  hasQuickUnlockPin: boolean;
  allowStaffPinUnlock: boolean;
  lockedAtUtc: string;
  lockExpiresAtUtc: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: AuthUser;
}

export interface AuthStatus {
  workspaceFound: boolean;
  licenseStatus: string;
  requiresBootstrap: boolean;
  clinicName?: string | null;
}

export type AuthResult<T> = [T | null, ApiError | null];

export interface SessionSnapshot {
  user: AuthUser | null;
  /** True when the user was restored from the local cache because the server is unreachable. */
  offline: boolean;
}

const REFRESH_KEY = 'clinicez.auth.refresh';
const USER_KEY = 'clinicez.auth.user';
const LAST_ONLINE_KEY = 'clinicez.auth.lastOnline';
const WORKSTATION_LOCKED_KEY = 'clinicez.auth.workstationLocked';
const EXPIRY_SKEW_MS = 30_000;
const AUTH_CHANNEL_NAME = 'clinicez-auth';
const REFRESH_LOCK_NAME = 'clinicez.auth.refresh';

const isWeb = (): boolean => Platform.OS === 'web';

function setWorkstationLockedFlag(locked: boolean): void {
  if (!isWeb() || typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (locked) {
      window.sessionStorage.setItem(WORKSTATION_LOCKED_KEY, '1');
    } else {
      window.sessionStorage.removeItem(WORKSTATION_LOCKED_KEY);
    }
  } catch {
    // Ignore restricted storage errors.
  }
}

function hasWorkstationLockedFlag(): boolean {
  if (!isWeb() || typeof window === 'undefined' || !window.sessionStorage) return false;
  try {
    return window.sessionStorage.getItem(WORKSTATION_LOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

type AuthBroadcastMessage =
  | { type: 'session-refreshed'; accessToken: string; accessTokenExpiresAtUtc: string; user: AuthUser }
  | { type: 'session-locked'; lockedSession: LockedSessionInfo }
  | { type: 'session-unlocked'; accessToken: string; accessTokenExpiresAtUtc: string; user: AuthUser }
  | { type: 'session-cleared'; reason?: 'logout' | 'expired' | 'idle' }
  | { type: 'activity'; timestamp: number };

let authChannel: BroadcastChannel | null = null;
let authChannelBound = false;

function handleBroadcastMessage(data: AuthBroadcastMessage | null | undefined) {
  if (!data || typeof data !== 'object') return;
  if (data.type === 'session-refreshed' || data.type === 'session-unlocked') {
    accessToken = data.accessToken;
    accessExpiresAt = Date.parse(data.accessTokenExpiresAtUtc) || Date.now() + 10 * 60_000;
    user = data.user;
    lockedSession = null;
    offline = false;
    setWorkstationLockedFlag(false);
    emit();
    if (data.type === 'session-unlocked') {
      sessionUnlockedHandler?.(data.user);
    }
  } else if (data.type === 'session-locked') {
    accessToken = null;
    accessExpiresAt = 0;
    user = null;
    lockedSession = data.lockedSession;
    offline = false;
    setWorkstationLockedFlag(true);
    emit();
    sessionLockedHandler?.(data.lockedSession);
  } else if (data.type === 'session-cleared') {
    const hadSession = user !== null || accessToken !== null || lockedSession !== null;
    accessToken = null;
    accessExpiresAt = 0;
    refreshToken = null;
    user = null;
    lockedSession = null;
    offline = false;
    setWorkstationLockedFlag(false);
    emit();
    if (hadSession) {
      if (data.reason === 'idle') sessionIdleHandler?.();
      else if (data.reason === 'expired') sessionExpiredHandler?.();
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
    // Ignore channel errors (e.g. closed channel or restricted contexts)
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

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshToken: string | null = null;
let user: AuthUser | null = null;
let lockedSession: LockedSessionInfo | null = null;
let lastRefreshLockedSession: LockedSessionInfo | null = null;
let offline = false;
let refreshInFlight: Promise<boolean> | null = null;
let lockInFlight: Promise<LockedSessionInfo | null> | null = null;
let lastNetworkFailureAt = 0;
const NETWORK_RETRY_BACKOFF_MS = 15_000;

type Listener = (snapshot: SessionSnapshot) => void;
const listeners = new Set<Listener>();
type ActivityListener = (timestamp: number) => void;
const activityListeners = new Set<ActivityListener>();
let sessionExpiredHandler: (() => void) | null = null;
let sessionIdleHandler: (() => void) | null = null;
let sessionLockedHandler: ((info: LockedSessionInfo) => void) | null = null;
let sessionUnlockedHandler: ((signedIn: AuthUser) => void) | null = null;

function snapshot(): SessionSnapshot {
  return { user, offline };
}

function emit() {
  const current = snapshot();
  listeners.forEach((listener) => listener(current));
}

export function subscribeSession(listener: Listener): () => void {
  getAuthChannel();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeRemoteActivity(listener: ActivityListener): () => void {
  getAuthChannel();
  activityListeners.add(listener);
  return () => activityListeners.delete(listener);
}

export function broadcastActivity(timestamp: number): void {
  if (!isWeb()) return;
  broadcastAuth({ type: 'activity', timestamp });
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot();
}

export function getLockedSession(): LockedSessionInfo | null {
  return lockedSession;
}

/** Called when the server rejects the refresh token (revoked, expired, reuse detected). */
export function onSessionExpired(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
}

/** Called when the web workstation logs out automatically due to inactivity. */
export function onSessionIdleExpired(handler: (() => void) | null) {
  sessionIdleHandler = handler;
}

/** Called when the workstation enters locked state locally or from a peer tab. */
export function onSessionLocked(handler: ((info: LockedSessionInfo) => void) | null) {
  sessionLockedHandler = handler;
}

/** Called when a peer tab unlocks the workstation. */
export function onSessionUnlocked(handler: ((signedIn: AuthUser) => void) | null) {
  sessionUnlockedHandler = handler;
}

export function getAccessToken(): string | null {
  return accessToken;
}

function apiRoot(): string {
  const base = getApiBaseUrl();
  if (!base) throw new ApiError('Connect this device to your clinic server first.', 0);
  return ensureApiPrefix(base);
}

function tenantHeaders(): Record<string, string> {
  const context = resolveTenantContext();
  const headers: Record<string, string> = {};
  const effectiveFacility = context.facilitySlug || getStoredFacilitySlug();
  const effectiveTenant = context.tenantSlug || (!effectiveFacility ? getStoredTenantSlug() : null);
  if (effectiveFacility) headers['X-Facility-Slug'] = effectiveFacility;
  if (effectiveTenant) headers['X-Tenant-Id'] = effectiveTenant;
  if (context.clinicId) headers['X-Clinic-Id'] = context.clinicId;
  return headers;
}

function toApiError(error: unknown): ApiError {
  return extractApiError(error);
}

async function post<T>(path: string, body: unknown, authorized = false): Promise<AuthResult<T>> {
  try {
    const response = await axios.post<ApiResponse<T>>(`${apiRoot()}${path}`, body, {
      timeout: 15000,
      withCredentials: isWeb(),
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': Platform.OS,
        ...tenantHeaders(),
        ...(authorized && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, toApiError(error)];
  }
}

async function deleteWithBody<T>(path: string, body: unknown, authorized = false): Promise<AuthResult<T>> {
  try {
    const response = await axios.delete<ApiResponse<T>>(`${apiRoot()}${path}`, {
      timeout: 15000,
      withCredentials: isWeb(),
      data: body,
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': Platform.OS,
        ...tenantHeaders(),
        ...(authorized && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, toApiError(error)];
  }
}

function extractLockedSessionFromAxiosError(error: unknown): LockedSessionInfo | null {
  const resp = (error as any)?.response;
  if (resp?.status === 423 && resp?.data?.errorCode === 'SESSION_LOCKED' && resp?.data?.data) {
    return resp.data.data as LockedSessionInfo;
  }
  return null;
}

function buildFallbackLockedSession(currentUser: AuthUser | null): LockedSessionInfo | null {
  if (!currentUser) return null;
  const maxHours = Math.min(24, Math.max(1, currentUser.sessionPolicy?.maxLockedSessionHours ?? 8));
  const lockedAt = new Date();
  const expiresAt = new Date(lockedAt.getTime() + maxHours * 3_600_000);
  return {
    staffId: currentUser.id,
    name: currentUser.name,
    email: currentUser.email ?? null,
    role: currentUser.role,
    roleName: currentUser.roleName ?? null,
    clinicName: currentUser.clinicName,
    hasQuickUnlockPin: Boolean(currentUser.hasQuickUnlockPin),
    allowStaffPinUnlock: currentUser.sessionPolicy?.allowStaffPinUnlock ?? true,
    lockedAtUtc: lockedAt.toISOString(),
    lockExpiresAtUtc: expiresAt.toISOString(),
  };
}

async function persist(tokens: AuthTokens, fallbackEmail?: string | null, broadcastType: 'session-refreshed' | 'session-unlocked' = 'session-refreshed') {
  const resolvedEmail = tokens.user.email ?? fallbackEmail ?? user?.email ?? null;
  const normalizedUser: AuthUser = resolvedEmail
    ? { ...tokens.user, email: resolvedEmail }
    : tokens.user;
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.parse(tokens.accessTokenExpiresAtUtc) || Date.now() + 10 * 60_000;
  user = normalizedUser;
  lockedSession = null;
  lastRefreshLockedSession = null;
  lastNetworkFailureAt = 0;
  offline = false;
  setWorkstationLockedFlag(false);

  if (isWeb()) {
    // Web refresh tokens live in an HttpOnly cookie managed by clinic-api; never store them in sessionStorage.
    refreshToken = null;
    broadcastAuth({
      type: broadcastType,
      accessToken: tokens.accessToken,
      accessTokenExpiresAtUtc: tokens.accessTokenExpiresAtUtc,
      user: normalizedUser,
    });
  } else {
    refreshToken = tokens.refreshToken ?? null;
    if (tokens.refreshToken) {
      await setSecureItem(REFRESH_KEY, tokens.refreshToken);
    }
    await setSecureItem(USER_KEY, JSON.stringify(normalizedUser));
    await setSecureItem(LAST_ONLINE_KEY, String(Date.now()));
  }
  emit();
}

async function clearSession(reason: 'none' | 'expired' | 'idle' = 'none') {
  const hadSession =
    user !== null ||
    accessToken !== null ||
    refreshToken !== null ||
    lockedSession !== null ||
    hasWorkstationLockedFlag();
  accessToken = null;
  accessExpiresAt = 0;
  refreshToken = null;
  user = null;
  lockedSession = null;
  lastRefreshLockedSession = null;
  lastNetworkFailureAt = 0;
  offline = false;
  setWorkstationLockedFlag(false);
  await deleteSecureItem(REFRESH_KEY);
  await deleteSecureItem(USER_KEY);
  await deleteSecureItem(LAST_ONLINE_KEY);
  if (isWeb() && (reason !== 'expired' || hadSession)) {
    broadcastAuth({
      type: 'session-cleared',
      reason: reason === 'none' ? 'logout' : reason,
    });
  }
  emit();
  if (reason === 'expired' && hadSession) sessionExpiredHandler?.();
  else if (reason === 'idle') sessionIdleHandler?.();
}

function deviceLabel(): string {
  return `Clinic EZ ${Platform.OS}`;
}

export async function getAuthStatus(): Promise<AuthResult<AuthStatus>> {
  try {
    const response = await axios.get<ApiResponse<AuthStatus>>(`${apiRoot()}/auth/status`, {
      timeout: 10000,
      headers: tenantHeaders(),
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, toApiError(error)];
  }
}

export async function login(email: string, password: string): Promise<AuthResult<AuthUser>> {
  const trimmedEmail = email.trim();
  const context = resolveTenantContext();
  const operationalWorkspace = context.facilitySlug || getStoredFacilitySlug() || context.tenantSlug || getStoredTenantSlug();
  const [tokens, error] = await post<AuthTokens>('/auth/login', {
    email: trimmedEmail,
    password,
    workspace: operationalWorkspace || undefined,
    deviceLabel: deviceLabel(),
  });
  if (error || !tokens) return [null, error ?? new ApiError('Sign-in failed.', 0)];
  await persist(tokens, trimmedEmail || null);
  return [user!, null];
}

export interface BootstrapInput {
  licenseToken: string;
  email: string;
  password: string;
  fullName: string;
  workspace?: string;
}

/** Creates the first administrator of a freshly activated facility (proof of license possession required). */
export async function bootstrapAdmin(input: BootstrapInput): Promise<AuthResult<AuthUser>> {
  const trimmedEmail = input.email.trim();
  const [tokens, error] = await post<AuthTokens>('/auth/bootstrap', {
    licenseToken: input.licenseToken.trim(),
    email: trimmedEmail,
    password: input.password,
    fullName: input.fullName.trim(),
    workspace: input.workspace || undefined,
  });
  if (error || !tokens) return [null, error ?? new ApiError('Setup failed.', 0)];
  await persist(tokens, trimmedEmail || null);
  return [user!, null];
}

export interface AdminRecoveryInput {
  licenseToken: string;
  email?: string;
  newPassword: string;
  workspace?: string;
}

/** Recovers an administrator account using facility cryptographic license key proof. */
export async function recoverAdmin(input: AdminRecoveryInput): Promise<AuthResult<AuthUser>> {
  const licenseToken = input.licenseToken.trim();
  const email = input.email?.trim();
  const [tokens, error] = await post<AuthTokens>('/auth/recover-admin', {
    licenseToken,
    email: email || undefined,
    newPassword: input.newPassword,
    workspace: input.workspace || undefined,
    deviceLabel: deviceLabel(),
  });
  if (error || !tokens) return [null, error ?? new ApiError('Recovery failed.', 0)];
  await persist(tokens, email || null);
  return [user!, null];
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthResult<AuthUser>> {
  if (!(await ensureFreshToken())) return [null, new ApiError('Your session has expired. Sign in again.', 401)];
  const [tokens, error] = await post<AuthTokens>('/auth/change-password', { currentPassword, newPassword }, true);
  if (error || !tokens) return [null, error ?? new ApiError('Could not change the password.', 0)];
  await persist(tokens);
  return [user!, null];
}

async function postRefreshRequest(body: unknown): Promise<{
  tokens: AuthTokens | null;
  locked: LockedSessionInfo | null;
  error: ApiError | null;
}> {
  try {
    const response = await axios.post<ApiResponse<AuthTokens>>(`${apiRoot()}/auth/refresh`, body, {
      timeout: 15000,
      withCredentials: isWeb(),
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Platform': Platform.OS,
        ...tenantHeaders(),
      },
    });
    return { tokens: response.data?.data ?? null, locked: null, error: null };
  } catch (error) {
    const locked = extractLockedSessionFromAxiosError(error);
    return { tokens: null, locked, error: toApiError(error) };
  }
}

async function executeRefresh(): Promise<boolean> {
  if (lockedSession || lockInFlight) return false;
  lastRefreshLockedSession = null;

  if (isWeb()) {
    // Another tab may have refreshed and broadcast a fresh access token while we waited on the Web Lock.
    if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) {
      return true;
    }
    const { tokens, locked, error } = await postRefreshRequest({});
    if (tokens) {
      await persist(tokens);
      return true;
    }
    if (locked) {
      accessToken = null;
      accessExpiresAt = 0;
      lockedSession = locked;
      lastRefreshLockedSession = locked;
      setWorkstationLockedFlag(true);
      emit();
      sessionLockedHandler?.(locked);
      return false;
    }
    if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
      await clearSession('expired');
    } else {
      lastNetworkFailureAt = Date.now();
    }
    return false;
  }

  if (!refreshToken) return false;
  const { tokens, locked, error } = await postRefreshRequest({ refreshToken });
  if (tokens) {
    await persist(tokens);
    return true;
  }
  if (locked) {
    accessToken = null;
    accessExpiresAt = 0;
    lockedSession = locked;
    lastRefreshLockedSession = locked;
    emit();
    sessionLockedHandler?.(locked);
    return false;
  }
  if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
    await clearSession('expired');
  } else {
    lastNetworkFailureAt = Date.now();
  }
  return false;
}

/**
 * Rotates the refresh token. Returns true when a fresh access token is available.
 * A definitive rejection (401/400) ends the session; a 423 SESSION_LOCKED retains the lock screen;
 * a network failure leaves the session intact so the caller can retry.
 */
export function refreshSession(): Promise<boolean> {
  if (lockedSession || lockInFlight) return Promise.resolve(false);
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (lockedSession || lockInFlight) return false;
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

/** Makes sure a valid access token exists (refreshing when it is about to expire). */
export async function ensureFreshToken(): Promise<boolean> {
  if (lockedSession || lockInFlight) return false;
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) return true;
  if (isWeb() && !user && !accessToken) return false;
  if (!isWeb() && !refreshToken) return false;
  // Don't make every request wait on a dead network while the server is unreachable.
  if (Date.now() - lastNetworkFailureAt < NETWORK_RETRY_BACKOFF_MS) return false;
  return refreshSession();
}

export type RestoreOutcome =
  | { state: 'signedIn'; user: AuthUser }
  | { state: 'workstationLocked'; lockedSession: LockedSessionInfo }
  | { state: 'offline'; user: AuthUser; lastOnlineAt: number }
  | { state: 'signedOut' };

/**
 * Restores a previous session on app start. If the server reports the workstation is locked (423 SESSION_LOCKED),
 * returns `workstationLocked` with zero access token so reloading (`F5`) cannot bypass the lock screen.
 * On native, if the server cannot be reached within the offline grace window, returns `offline` for local unlock.
 */
export async function restoreSession(): Promise<RestoreOutcome> {
  if (isWeb()) {
    if (hasWorkstationLockedFlag()) {
      const locked = await lockSession();
      if (locked) {
        return { state: 'workstationLocked', lockedSession: locked };
      }
      return { state: 'signedOut' };
    }
    // Web uses an HttpOnly session cookie sent automatically via withCredentials.
    // A fresh tab has empty JS memory, so try refreshing directly (no sessionStorage token needed).
    if (await refreshSession()) {
      return { state: 'signedIn', user: user! };
    }
    if (lastRefreshLockedSession) {
      return { state: 'workstationLocked', lockedSession: lastRefreshLockedSession };
    }
    return { state: 'signedOut' };
  }

  const storedRefresh = await getSecureItem(REFRESH_KEY);
  const storedUser = await getSecureItem(USER_KEY);
  const storedOnline = await getSecureItem(LAST_ONLINE_KEY);
  if (!storedRefresh) return { state: 'signedOut' };

  refreshToken = storedRefresh;
  if (await refreshSession()) {
    return { state: 'signedIn', user: user! };
  }
  if (lastRefreshLockedSession) {
    return { state: 'workstationLocked', lockedSession: lastRefreshLockedSession };
  }

  // refreshSession clears everything on a definitive rejection.
  if (!refreshToken) return { state: 'signedOut' };

  const lastOnlineAt = Number(storedOnline) || 0;
  const withinGrace = Date.now() - lastOnlineAt <= getOfflineGraceHours() * 3_600_000;
  let cached: AuthUser | null = null;
  try {
    cached = storedUser ? (JSON.parse(storedUser) as AuthUser) : null;
  } catch {
    cached = null;
  }
  if (Platform.OS !== 'web' && cached && withinGrace) {
    user = cached;
    offline = true;
    emit();
    return { state: 'offline', user: cached, lastOnlineAt };
  }
  return { state: 'signedOut' };
}

/** Leaves offline mode after the server became reachable again. */
export async function resumeOnline(): Promise<boolean> {
  if (!offline) return true;
  lastNetworkFailureAt = 0;
  return refreshSession();
}

/**
 * Locks the workstation cleanly: flushes registered drafts while the access token is still valid,
 * clears the in-memory access token, notifies peer tabs, and marks the refresh session locked on the server.
 */
export function lockSession(): Promise<LockedSessionInfo | null> {
  if (lockInFlight) return lockInFlight;
  lockInFlight = executeLockSession().finally(() => {
    lockInFlight = null;
  });
  return lockInFlight;
}

async function executeLockSession(): Promise<LockedSessionInfo | null> {
  runBeforeLockHooks();

  // Wait for any active refresh rotation before locking so /auth/lock does not race /auth/refresh
  // with an already-rotated cookie/token and trigger refresh-family revocation.
  if (refreshInFlight) {
    try {
      await refreshInFlight;
    } catch {
      // Ignore refresh failure and continue with locking.
    }
  }

  const previousUser = user;
  const fallbackLocked = lockedSession ?? buildFallbackLockedSession(previousUser);
  const token = refreshToken;

  // Set lockedSession & clear user/accessToken synchronously before awaiting /auth/lock so concurrent
  // API calls or 401 interceptors cannot trigger /auth/refresh while the workstation is locking.
  if (fallbackLocked) {
    lockedSession = fallbackLocked;
  }
  user = null;
  accessToken = null;
  accessExpiresAt = 0;
  offline = false;
  setWorkstationLockedFlag(true);

  const body = isWeb() ? {} : token ? { refreshToken: token } : {};
  const [serverLocked, error] = await post<LockedSessionInfo>('/auth/lock', body);

  if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
    await clearSession('expired');
    return null;
  }

  const effectiveLocked = serverLocked ?? fallbackLocked;
  if (!effectiveLocked) {
    await clearSession('none');
    return null;
  }

  lockedSession = effectiveLocked;
  emit();
  if (isWeb()) {
    broadcastAuth({ type: 'session-locked', lockedSession: effectiveLocked });
  }
  sessionLockedHandler?.(effectiveLocked);
  return effectiveLocked;
}

export async function unlockWithPin(pin: string): Promise<AuthResult<AuthUser>> {
  const body = isWeb() ? { pin: pin.trim() } : { pin: pin.trim(), refreshToken };
  const [tokens, error] = await post<AuthTokens>('/auth/unlock-pin', body);
  if (error || !tokens) {
    if (error && error.status === 401 && error.errorCode?.toUpperCase() === 'INVALIDTOKEN') {
      await clearSession('expired');
    }
    return [null, error ?? new ApiError('Unlock failed.', 0)];
  }
  await persist(tokens, tokens.user.email ?? lockedSession?.email ?? null, 'session-unlocked');
  sessionUnlockedHandler?.(user!);
  return [user!, null];
}

export async function unlockWithPassword(password: string): Promise<AuthResult<AuthUser>> {
  const body = isWeb() ? { password } : { password, refreshToken };
  const [tokens, error] = await post<AuthTokens>('/auth/unlock-password', body);
  if (error || !tokens) {
    if (error && error.status === 401 && error.errorCode?.toUpperCase() === 'INVALIDTOKEN') {
      await clearSession('expired');
    }
    return [null, error ?? new ApiError('Unlock failed.', 0)];
  }
  await persist(tokens, tokens.user.email ?? lockedSession?.email ?? null, 'session-unlocked');
  sessionUnlockedHandler?.(user!);
  return [user!, null];
}

export async function setQuickUnlockPin(currentPassword: string, pin: string): Promise<AuthResult<AuthUser>> {
  if (!(await ensureFreshToken())) return [null, new ApiError('Your session has expired. Sign in again.', 401)];
  const [updatedUser, error] = await post<AuthUser>('/auth/pin', { currentPassword, pin: pin.trim() }, true);
  if (error || !updatedUser) return [null, error ?? new ApiError('Could not save quick-unlock PIN.', 0)];
  user = { ...updatedUser, email: updatedUser.email ?? user?.email ?? null };
  if (!isWeb()) {
    await setSecureItem(USER_KEY, JSON.stringify(user));
  } else if (accessToken) {
    broadcastAuth({
      type: 'session-refreshed',
      accessToken,
      accessTokenExpiresAtUtc: new Date(accessExpiresAt).toISOString(),
      user,
    });
  }
  emit();
  return [user, null];
}

export async function removeQuickUnlockPin(currentPassword: string): Promise<AuthResult<AuthUser>> {
  if (!(await ensureFreshToken())) return [null, new ApiError('Your session has expired. Sign in again.', 401)];
  const [updatedUser, error] = await deleteWithBody<AuthUser>('/auth/pin', { currentPassword }, true);
  if (error || !updatedUser) return [null, error ?? new ApiError('Could not remove quick-unlock PIN.', 0)];
  user = { ...updatedUser, email: updatedUser.email ?? user?.email ?? null };
  if (!isWeb()) {
    await setSecureItem(USER_KEY, JSON.stringify(user));
  } else if (accessToken) {
    broadcastAuth({
      type: 'session-refreshed',
      accessToken,
      accessTokenExpiresAtUtc: new Date(accessExpiresAt).toISOString(),
      user,
    });
  }
  emit();
  return [user, null];
}

export function updateSessionPolicy(policy: SessionPolicy): void {
  if (!user) return;
  user = { ...user, sessionPolicy: policy };
  if (isWeb() && accessToken) {
    broadcastAuth({
      type: 'session-refreshed',
      accessToken,
      accessTokenExpiresAtUtc: new Date(accessExpiresAt).toISOString(),
      user,
    });
  } else if (!isWeb()) {
    void setSecureItem(USER_KEY, JSON.stringify(user));
  }
  emit();
}

export async function logout(): Promise<void> {
  const token = refreshToken;
  await clearSession('none');
  if (isWeb()) {
    // Best effort: revoke server-side cookie session, but never block sign-out on connectivity.
    await post('/auth/logout', {});
  } else if (token) {
    // Best effort: revoke server-side, but never block sign-out on connectivity.
    await post('/auth/logout', { refreshToken: token });
  }
}

/** Signs out all open web tabs after prolonged user inactivity. */
export async function idleLogout(): Promise<void> {
  const token = refreshToken;
  // Clear and broadcast 'idle' BEFORE revoking on the server so peer tabs/polls cannot race
  // into /auth/refresh and overwrite the inactivity reason with a generic 401 expiration notice.
  await clearSession('idle');
  if (isWeb()) {
    await post('/auth/logout', {});
  } else if (token) {
    await post('/auth/logout', { refreshToken: token });
  }
}

/** Local sign-out without contacting the server (e.g. offline lock or forgotten PIN). */
export async function discardLocalSession(): Promise<void> {
  await clearSession('none');
}

export function hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
  if (!permission) return true;
  if (!permissions) return false;
  return permissions.includes('*') || permissions.some((p) => p.toLowerCase() === permission.toLowerCase());
}

export interface ClinicInvitationDetails {
  id: string;
  clinicName: string;
  facilitySlug: string;
  inviteeFullName: string;
  inviteeEmail: string;
  role: string;
  isExpired: boolean;
  isAlreadyAccepted: boolean;
  expiresAt?: string | null;
  isRevoked: boolean;
  isSuspended: boolean;
}

export async function getInvitationDetails(token: string): Promise<AuthResult<ClinicInvitationDetails>> {
  try {
    const response = await axios.get<ApiResponse<ClinicInvitationDetails>>(
      `${apiRoot()}/auth/invitations/${encodeURIComponent(token.trim())}`,
      {
        timeout: 10000,
        headers: tenantHeaders(),
      }
    );
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, toApiError(error)];
  }
}

export async function acceptInvitation(token: string, password: string): Promise<AuthResult<AuthTokens>> {
  const [tokens, error] = await post<AuthTokens>(
    `/auth/invitations/${encodeURIComponent(token.trim())}/accept`,
    {
      password,
      deviceLabel: deviceLabel(),
    }
  );
  if (error || !tokens) return [null, error ?? new ApiError('Accept invitation failed.', 0)];
  await persist(tokens);
  return [tokens, null];
}

