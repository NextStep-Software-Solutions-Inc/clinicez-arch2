import axios from 'axios';
import { ApiError, extractApiError, type ApiResponse } from '@shared/safe';
import type { AuthToken, AuthUser } from '../types/billing';
import { getBillingApiBaseUrl } from './runtimeConfig';

/**
 * Cell-local cashier session (no identity provider, no internet requirement). billing-api issues a signed access
 * token that lasts a shift; there is no refresh token. The token lives in memory only, so staff sign in again after the
 * app restarts, and an expired or revoked session (HTTP 401) drops back to the sign-in screen.
 */

export type AuthResult<T> = [T | null, ApiError | null];

export interface SignInInput {
  tenantId: string;
  facilityId: string;
  email: string;
  password: string;
}

let accessToken: string | null = null;
let accessExpiresAt = 0;
let user: AuthUser | null = null;

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

/** The bearer token while the session is alive; expired tokens are dropped so the app asks for sign-in. */
export function getAccessToken(): string | null {
  if (accessToken && Date.now() >= accessExpiresAt) endSession();
  return accessToken;
}

export function endSession() {
  accessToken = null;
  accessExpiresAt = 0;
  user = null;
  emit();
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
      { timeout: 15000, headers: { 'Content-Type': 'application/json' } },
    );
    const token = response.data?.data;
    if (!token) return [null, new ApiError('Sign-in failed.', 0)];

    accessToken = token.accessToken;
    accessExpiresAt = Date.parse(token.expiresAtUtc) || Date.now() + 10 * 60 * 60_000;
    user = token.user;
    emit();
    return [token.user, null];
  } catch (error) {
    return [null, extractApiError(error, 'Sign-in failed.')];
  }
}

export function logout() {
  endSession();
}

export function hasPermission(permissions: readonly string[] | undefined, permission: string): boolean {
  if (!permission) return true;
  if (!permissions) return false;
  return permissions.some((p) => p.toLowerCase() === permission.toLowerCase());
}
