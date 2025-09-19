/**
 * Clerk authentication error handling utility
 * Provides user-friendly error messages and proper TypeScript types
 */

/**
 * Represents a Clerk API error object
 * Based on Clerk's official API error structure
 */
export interface ClerkAPIError {
  code: string;
  message: string;
  longMessage?: string;
  meta?: Record<string, unknown>;
}

/**
 * Represents a Clerk API response error
 * Contains an array of ClerkAPIError objects
 */
export interface ClerkAPIResponseError extends Error {
  errors: ClerkAPIError[];
  clerkError: true;
}

/**
 * Type guard to check if an error is a Clerk API response error
 * @param error - The error object to check
 * @returns True if the error is a ClerkAPIResponseError
 */
export function isClerkAPIResponseError(error: unknown): error is ClerkAPIResponseError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errors' in error &&
    Array.isArray((error as ClerkAPIResponseError).errors) &&
    (error as ClerkAPIResponseError).errors.length > 0
  );
}

/**
 * Authentication error result that includes user-friendly messaging
 */
export interface AuthErrorResult {
  hasError: boolean;
  errorMessage: string;
  errorCode?: string;
  isUserLocked?: boolean;
  lockoutExpiresInSeconds?: number;
}

/**
 * Maps common Clerk error codes to user-friendly messages
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Authentication errors
  form_identifier_not_found: 'Invalid email or password.',
  form_password_incorrect: 'The password you entered is incorrect.',
  form_password_pwned: 'This password has been compromised in a data breach. Please choose a different password.',
  session_token_invalid: 'Your session has expired. Please sign in again.',
  session_token_and_uat_not_same_user: 'Authentication error. Please sign in again.',

  // Account status errors
  user_locked: 'Your account has been temporarily locked due to multiple failed attempts.',
  user_not_found: 'No account found with this email address.',
  user_disabled: 'This account has been disabled. Please contact support.',
  user_not_activated: 'Your account is not activated. Please check your email for activation instructions.',

  // Sign-up specific errors
  form_identifier_exists: 'An account with this email address already exists.',
  form_password_length_too_short: 'Password must be at least 8 characters long.',
  form_password_not_strong_enough: 'Password is not strong enough. Please choose a stronger password.',
  form_password_size_in_bytes_exceeded: 'Password is too long. Please choose a shorter password.',

  // Email verification errors
  verification_expired: 'The verification code has expired. Please request a new one.',
  verification_failed: 'The verification code is incorrect. Please check and try again.',
  form_code_incorrect: 'The verification code is incorrect. Please check and try again.',
  form_identifier_not_found_code: 'Invalid verification code. Please request a new one.',

  // Password update errors
  password_not_secure: 'Password does not meet security requirements.',
  password_same_as_current: 'New password must be different from your current password.',

  // Rate limiting errors
  form_rate_limit_exceeded: 'Too many attempts. Please wait a moment and try again.',
  request_rate_limit_exceeded: 'Too many requests. Please wait a moment and try again.',

  // Network/Server errors
  network_error: 'Network error. Please check your connection and try again.',
  internal_error: 'Something went wrong. Please try again later.',
  clerk_js_load_failed: 'Failed to load authentication service. Please refresh and try again.',

  // MFA/2FA errors
  form_second_factor_required: 'Two-factor authentication is required.',
  form_second_factor_incorrect: 'Two-factor authentication code is incorrect.',

  // OAuth errors
  oauth_error: 'Authentication provider error. Please try again or use email login.',
  oauth_access_denied: 'Access denied by authentication provider.',
};

/**
 * Processes Clerk authentication errors and returns user-friendly messaging
 * @param error - The error object from Clerk authentication attempt
 * @returns AuthErrorResult with user-friendly error information
 */
export function handleAuthError(error: unknown): AuthErrorResult {
  // Handle non-Clerk errors (network, unexpected errors)
  if (!isClerkAPIResponseError(error)) {
    // Check if it's a basic Error object
    if (error instanceof Error) {
      // Handle common network errors
      if (error.message.toLowerCase().includes('network')) {
        return {
          hasError: true,
          errorMessage: ERROR_MESSAGES.network_error,
          errorCode: 'network_error',
        };
      }

      return {
        hasError: true,
        errorMessage: 'An unexpected error occurred. Please try again.',
        errorCode: 'unknown_error',
      };
    }

    // Handle completely unknown error types
    return {
      hasError: true,
      errorMessage: ERROR_MESSAGES.internal_error,
      errorCode: 'internal_error',
    };
  }

  // Handle Clerk API errors
  const clerkError = error.errors[0]; // Get the first error

  // Handle special cases
  if (clerkError.code === 'user_locked') {
    const lockoutSeconds = clerkError.meta?.lockout_expires_in_seconds as number | undefined;

    if (lockoutSeconds) {
      const minutes = Math.ceil(lockoutSeconds / 60);
      return {
        hasError: true,
        errorMessage: `Your account is locked. You can try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
        errorCode: clerkError.code,
        isUserLocked: true,
        lockoutExpiresInSeconds: lockoutSeconds,
      };
    }
  }

  // Get user-friendly message
  const userFriendlyMessage = ERROR_MESSAGES[clerkError.code] ||
    clerkError.longMessage ||
    clerkError.message ||
    'Authentication failed. Please check your credentials and try again.';

  return {
    hasError: true,
    errorMessage: userFriendlyMessage,
    errorCode: clerkError.code,
    isUserLocked: clerkError.code === 'user_locked',
    lockoutExpiresInSeconds: clerkError.code === 'user_locked'
      ? (clerkError.meta?.lockout_expires_in_seconds as number | undefined)
      : undefined,
  };
}

/**
 * Formats lockout expiration time for display
 * @param lockoutExpiresInSeconds - Number of seconds until lockout expires
 * @returns Human-readable time string
 */
export function formatLockoutExpiration(lockoutExpiresInSeconds: number): string {
  const currentDate = new Date();
  currentDate.setSeconds(currentDate.getSeconds() + lockoutExpiresInSeconds);

  return currentDate.toLocaleString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Enhanced error logging for development
 * Only logs in development environment
 * @param error - The error to log
 * @param context - Additional context for the error
 */
export function logAuthError(error: unknown, context: string = 'Authentication'): void {
  if (__DEV__) {
    console.group(`🔐 ${context} Error`);

    if (isClerkAPIResponseError(error)) {
      console.error('Clerk API Errors:', error.errors);
      error.errors.forEach((clerkError, index) => {
        console.error(`Error ${index + 1}:`, {
          code: clerkError.code,
          message: clerkError.message,
          longMessage: clerkError.longMessage,
          meta: clerkError.meta,
        });
      });
    } else {
      console.error('Non-Clerk Error:', error);
    }

    console.groupEnd();
  }
}