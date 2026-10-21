import axios from 'axios';
import { Platform } from 'react-native';
import { ApiError, extractApiError, ensureApiPrefix, resolveTenantContext, type ApiResponse } from '@shared/safe';
import { deleteSecureItem, getSecureItem, setSecureItem } from './secureStorage';
import { getApiBaseUrl, getOfflineGraceHours } from './runtimeConfig';

/**
 * Facility-local session manager (no identity provider, no internet requirement).
 *
 * The clinic server issues a short-lived access token plus a rotating refresh token. This module owns them:
 *  - the access token lives in memory only;
 *  - the refresh token and a cached copy of the signed-in user live in secure storage
 *    (Keychain/Keystore on native, tab-scoped sessionStorage on web);
 *  - refreshes are single-flight so a burst of 401s triggers exactly one rotation.
 */

export interface AuthUser {
  id: string;
  name: string;
  role: string;
  roleName?: string | null;
  clinicId: string;
  tenantId: string;
  clinicName: string;
  permissions: string[];
  mustChangePassword: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: AuthUser;
}

export interface AuthStatus {
  workspaceFound: boolean;
  licenseStatus: string;
  requiresBootstrap: boolean;
  clinicName?: string | null;
  turnstileEnabled?: boolean;
  turnstileSiteKey?: string | null;
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
const EXPIRY_SKEW_MS = 30_000;

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshToken: string | null = null;
let user: AuthUser | null = null;
let offline = false;
let refreshInFlight: Promise<boolean> | null = null;
let lastNetworkFailureAt = 0;
const NETWORK_RETRY_BACKOFF_MS = 15_000;

type Listener = (snapshot: SessionSnapshot) => void;
const listeners = new Set<Listener>();
let sessionExpiredHandler: (() => void) | null = null;

function snapshot(): SessionSnapshot {
  return { user, offline };
}

function emit() {
  const current = snapshot();
  listeners.forEach((listener) => listener(current));
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSessionSnapshot(): SessionSnapshot {
  return snapshot();
}

/** Called when the server rejects the refresh token (revoked, expired, reuse detected). */
export function onSessionExpired(handler: (() => void) | null) {
  sessionExpiredHandler = handler;
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
  if (context.tenantSlug) headers['X-Tenant-Id'] = context.tenantSlug;
  if (context.facilitySlug) headers['X-Facility-Slug'] = context.facilitySlug;
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
      headers: {
        'Content-Type': 'application/json',
        ...tenantHeaders(),
        ...(authorized && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, toApiError(error)];
  }
}

async function persist(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.parse(tokens.accessTokenExpiresAtUtc) || Date.now() + 10 * 60_000;
  refreshToken = tokens.refreshToken;
  user = tokens.user;
  offline = false;
  await setSecureItem(REFRESH_KEY, tokens.refreshToken);
  await setSecureItem(USER_KEY, JSON.stringify(tokens.user));
  await setSecureItem(LAST_ONLINE_KEY, String(Date.now()));
  emit();
}

async function clearSession(notify: boolean) {
  accessToken = null;
  accessExpiresAt = 0;
  refreshToken = null;
  user = null;
  offline = false;
  await deleteSecureItem(REFRESH_KEY);
  await deleteSecureItem(USER_KEY);
  await deleteSecureItem(LAST_ONLINE_KEY);
  emit();
  if (notify) sessionExpiredHandler?.();
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

export async function login(email: string, password: string, turnstileToken?: string | null): Promise<AuthResult<AuthUser>> {
  const [tokens, error] = await post<AuthTokens>('/auth/login', {
    email: email.trim(),
    password,
    deviceLabel: deviceLabel(),
    turnstileToken: turnstileToken || undefined,
  });
  if (error || !tokens) return [null, error ?? new ApiError('Sign-in failed.', 0)];
  await persist(tokens);
  return [tokens.user, null];
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
  const [tokens, error] = await post<AuthTokens>('/auth/bootstrap', {
    licenseToken: input.licenseToken.trim(),
    email: input.email.trim(),
    password: input.password,
    fullName: input.fullName.trim(),
    workspace: input.workspace || undefined,
  });
  if (error || !tokens) return [null, error ?? new ApiError('Setup failed.', 0)];
  await persist(tokens);
  return [tokens.user, null];
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<AuthResult<AuthUser>> {
  if (!(await ensureFreshToken())) return [null, new ApiError('Your session has expired. Sign in again.', 401)];
  const [tokens, error] = await post<AuthTokens>('/auth/change-password', { currentPassword, newPassword }, true);
  if (error || !tokens) return [null, error ?? new ApiError('Could not change the password.', 0)];
  await persist(tokens);
  return [tokens.user, null];
}

/**
 * Rotates the refresh token. Returns true when a fresh access token is available.
 * A definitive rejection (401/400) ends the session; a network failure leaves it intact so the caller can retry.
 */
export function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    if (!refreshToken) return false;
    const [tokens, error] = await post<AuthTokens>('/auth/refresh', { refreshToken });
    if (tokens) {
      await persist(tokens);
      return true;
    }
    if (error && error.status !== 0 && error.status >= 400 && error.status < 500) {
      await clearSession(true);
    } else {
      lastNetworkFailureAt = Date.now();
    }
    return false;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Makes sure a valid access token exists (refreshing when it is about to expire). */
export async function ensureFreshToken(): Promise<boolean> {
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) return true;
  // Don't make every request wait on a dead network while the server is unreachable.
  if (Date.now() - lastNetworkFailureAt < NETWORK_RETRY_BACKOFF_MS) return false;
  return refreshSession();
}

export type RestoreOutcome =
  | { state: 'signedIn'; user: AuthUser }
  | { state: 'offline'; user: AuthUser; lastOnlineAt: number }
  | { state: 'signedOut' };

/**
 * Restores a previous session on app start. If the server cannot be reached and the device was online within the
 * offline grace window, the cached user is returned as `offline` so the app can ask for a PIN/biometric unlock
 * instead of a password.
 */
export async function restoreSession(): Promise<RestoreOutcome> {
  const storedRefresh = await getSecureItem(REFRESH_KEY);
  const storedUser = await getSecureItem(USER_KEY);
  const storedOnline = await getSecureItem(LAST_ONLINE_KEY);
  if (!storedRefresh) return { state: 'signedOut' };

  refreshToken = storedRefresh;
  if (await refreshSession()) {
    return { state: 'signedIn', user: user! };
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

export async function logout(): Promise<void> {
  const token = refreshToken;
  if (token) {
    // Best effort: revoke server-side, but never block sign-out on connectivity.
    await post('/auth/logout', { refreshToken: token });
  }
  await clearSession(false);
}

/** Local sign-out without contacting the server (e.g. offline lock or forgotten PIN). */
export async function discardLocalSession(): Promise<void> {
  await clearSession(false);
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

