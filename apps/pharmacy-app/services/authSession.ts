import axios from 'axios';
import { ApiError, extractApiError, resolveTenantContext, type ApiResponse } from '@shared/safe';
import { getPharmacyApiBaseUrl } from './runtimeConfig';

/**
 * Facility-local pharmacy session (no identity provider, no internet requirement).
 *
 * The pharmacy server issues a short-lived access token plus a rotating refresh token. Both are kept in memory only,
 * so staff sign in again after the app restarts. Refreshes are single-flight so a burst of requests triggers exactly
 * one rotation.
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
  refreshToken: string;
  accessTokenExpiresAtUtc: string;
  refreshTokenExpiresAtUtc: string;
  user: AuthUser;
}

export type AuthResult<T> = [T | null, ApiError | null];

const EXPIRY_SKEW_MS = 30_000;
const FALLBACK_ACCESS_LIFETIME_MS = 10 * 60_000;

let accessToken: string | null = null;
let accessExpiresAt = 0;
let refreshToken: string | null = null;
let user: AuthUser | null = null;
let refreshInFlight: Promise<boolean> | null = null;

type Listener = (user: AuthUser | null) => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((listener) => listener(user));
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSessionUser(): AuthUser | null {
  return user;
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
      headers: { 'Content-Type': 'application/json', ...tenantHeaders() },
    });
    return [response.data?.data ?? null, null];
  } catch (error) {
    return [null, extractApiError(error)];
  }
}

function applyTokens(tokens: AuthTokens) {
  accessToken = tokens.accessToken;
  accessExpiresAt = Date.parse(tokens.accessTokenExpiresAtUtc) || Date.now() + FALLBACK_ACCESS_LIFETIME_MS;
  refreshToken = tokens.refreshToken;
  user = tokens.user;
  emit();
}

function clearSession() {
  accessToken = null;
  accessExpiresAt = 0;
  refreshToken = null;
  user = null;
  emit();
}

export async function login(email: string, password: string): Promise<AuthResult<AuthUser>> {
  const [tokens, error] = await postAuth<AuthTokens>('/auth/login', {
    email: email.trim(),
    password,
    deviceLabel: 'Clinic EZ Pharmacy',
  });
  if (error || !tokens) return [null, error ?? new ApiError('Sign-in failed.', 0)];
  applyTokens(tokens);
  return [tokens.user, null];
}

export async function logout(): Promise<void> {
  const token = refreshToken;
  clearSession();
  if (token) {
    await postAuth<object>('/auth/logout', { refreshToken: token });
  }
}

async function refreshSession(): Promise<boolean> {
  if (!refreshToken) return false;
  if (!refreshInFlight) {
    const current = refreshToken;
    refreshInFlight = (async () => {
      const [tokens, error] = await postAuth<AuthTokens>('/auth/refresh', { refreshToken: current });
      if (tokens) {
        applyTokens(tokens);
        return true;
      }
      // A rejected refresh token ends the session; a network failure keeps it so the next call can retry.
      if (error && error.status !== 0) clearSession();
      return false;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Returns an access token that is valid for at least a few more seconds, rotating it first if needed. */
export async function getValidAccessToken(): Promise<string | null> {
  if (accessToken && Date.now() < accessExpiresAt - EXPIRY_SKEW_MS) return accessToken;
  if (!refreshToken) return accessToken;
  await refreshSession();
  return accessToken;
}

export function hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
  if (!permission) return true;
  if (!permissions) return false;
  return permissions.includes('*') || permissions.some((p) => p.toLowerCase() === permission.toLowerCase());
}
