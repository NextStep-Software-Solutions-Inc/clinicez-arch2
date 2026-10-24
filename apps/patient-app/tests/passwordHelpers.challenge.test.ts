import { describe, expect, test, mock } from 'bun:test';
import {
  validatePasswordForm,
  extractClerkPasswordError,
  isPasswordReverificationEnabled,
  executeChangeOrSetPassword,
} from '../utils/passwordHelpers';

function createMockClerkEnvironment(reverification = true) {
  return {
    environment: {
      authConfig: {
        reverification,
      },
    },
  };
}

function createMockSession(options?: {
  reverificationStatus?: 'complete' | 'needs_first_factor' | 'needs_second_factor';
  firstFactorError?: any;
  secondFactorError?: any;
  startVerificationError?: any;
}) {
  const startVerification = mock(async ({ level }: { level: string }) => {
    if (options?.startVerificationError) throw options.startVerificationError;
    return {
      status: options?.reverificationStatus ?? 'needs_first_factor',
      level,
      supportedFirstFactors: [{ strategy: 'password' }, { strategy: 'email_code' }],
      supportedSecondFactors: [{ strategy: 'totp' }],
    };
  });

  const attemptFirstFactorVerification = mock(async (params: any) => {
    if (options?.firstFactorError) throw options.firstFactorError;
    return {
      status: options?.reverificationStatus ?? 'complete',
    };
  });

  const prepareFirstFactorVerification = mock(async (params: any) => ({
    status: 'needs_first_factor',
  }));

  const attemptSecondFactorVerification = mock(async (params: any) => {
    if (options?.secondFactorError) throw options.secondFactorError;
    return {
      status: 'complete',
    };
  });

  return {
    startVerification,
    prepareFirstFactorVerification,
    attemptFirstFactorVerification,
    attemptSecondFactorVerification,
  };
}

function createMockUser(options?: {
  passwordEnabled?: boolean;
  updatePasswordError?: any;
  updatePasswordHandler?: (params: any) => Promise<any>;
}) {
  let recordedUpdateParams: any = null;

  const updatePassword = mock(async (params: any) => {
    recordedUpdateParams = params;
    if (options?.updatePasswordHandler) {
      return options.updatePasswordHandler(params);
    }
    if (options?.updatePasswordError) {
      throw options.updatePasswordError;
    }
    return { id: 'user_test_123', passwordEnabled: true };
  });

  return {
    id: 'user_test_123',
    passwordEnabled: options?.passwordEnabled ?? true,
    updatePassword,
    getRecordedUpdateParams: () => recordedUpdateParams,
  };
}

describe('CHALLENGER: Adversarial Stress & Edge Case Verification', () => {
  // ── Dimension 1: Session is Null, Undefined, or Incomplete ───────────────────

  describe('Null / Undefined / Malformed Session Handling', () => {
    test('ADV-01: Change mode with session === null executes legacy fallback without crashing', async () => {
      const user = createMockUser({ passwordEnabled: true });
      const clerk = createMockClerkEnvironment(true);

      const result = await executeChangeOrSetPassword({
        user,
        session: null,
        clerk,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      // When session is null, reverification is not possible, so it falls back to passing currentPassword
      expect(result.success).toBe(true);
      expect(user.updatePassword).toHaveBeenCalledTimes(1);
      expect(user.getRecordedUpdateParams()).toEqual({
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        signOutOfOtherSessions: false,
      });
    });

    test('ADV-02: Change mode with session === undefined and updatePassword rejection returns clean error', async () => {
      const user = createMockUser({
        passwordEnabled: true,
        updatePasswordError: {
          errors: [{ message: 'Session expired. Please re-authenticate.' }],
        },
      });

      const result = await executeChangeOrSetPassword({
        user,
        session: undefined,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Session expired. Please re-authenticate.');
    });

    test('ADV-03: Set mode with session === null and session_reverification_required handles missing session gracefully', async () => {
      const user = createMockUser({
        passwordEnabled: false,
        updatePasswordError: {
          status: 403,
          errors: [{ code: 'session_reverification_required', message: 'Reverification required' }],
        },
      });

      const result = await executeChangeOrSetPassword({
        user,
        session: null,
        newPassword: 'NewPassword456!',
        isSetPasswordMode: true,
      });

      // session?.startVerification is undefined, so it falls through to top-level catch without crashing
      expect(result.success).toBe(false);
      expect(result.error).toBe('Reverification required');
    });

    test('ADV-04: session with non-function startVerification does not throw TypeError', () => {
      const malformedSession = { startVerification: 'not-a-function' };
      expect(isPasswordReverificationEnabled(malformedSession)).toBe(false);

      const emptySession = {};
      expect(isPasswordReverificationEnabled(emptySession)).toBe(false);
    });
  });

  // ── Dimension 2: Network / Offline / Timeout Injections ───────────────────────

  describe('Network Errors & Infrastructure Failures', () => {
    test('ADV-05: startVerification throws TypeError("Failed to fetch") -> maps to network error', async () => {
      const session = createMockSession({
        startVerificationError: new TypeError('Failed to fetch'),
      });
      const user = createMockUser({ passwordEnabled: true });

      const result = await executeChangeOrSetPassword({
        user,
        session,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection error. Please check your internet connection and try again.');
      expect(user.updatePassword).not.toHaveBeenCalled();
    });

    test('ADV-06: attemptFirstFactorVerification throws network request failed', async () => {
      const session = createMockSession({
        firstFactorError: new TypeError('Network request failed: fetch error'),
      });
      const user = createMockUser({ passwordEnabled: true });

      const result = await executeChangeOrSetPassword({
        user,
        session,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network connection error. Please check your internet connection and try again.');
      expect(user.updatePassword).not.toHaveBeenCalled();
    });

    test('ADV-07: user.updatePassword throws generic AbortError or socket timeout', async () => {
      const session = createMockSession();
      const user = createMockUser({
        passwordEnabled: true,
        updatePasswordError: new Error('The operation was aborted due to timeout'),
      });

      const result = await executeChangeOrSetPassword({
        user,
        session,
        currentPassword: 'CurrentPassword123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('The operation was aborted due to timeout');
    });
  });

  // ── Dimension 3: Pathological Clerk Error Structures ──────────────────────────

  describe('Pathological & Unexpected Clerk Error Structures', () => {
    test('ADV-08: extractClerkPasswordError handles extreme/malformed error shapes without throwing', () => {
      // Primitive types
      expect(typeof extractClerkPasswordError(null)).toBe('string');
      expect(typeof extractClerkPasswordError(undefined)).toBe('string');
      expect(typeof extractClerkPasswordError(404)).toBe('string');
      expect(typeof extractClerkPasswordError(true)).toBe('string');
      expect(typeof extractClerkPasswordError(Symbol('error'))).toBe('string');

      // Malformed errors container
      expect(typeof extractClerkPasswordError({ errors: null })).toBe('string');
      expect(typeof extractClerkPasswordError({ errors: 'not-an-array' })).toBe('string');
      expect(typeof extractClerkPasswordError({ errors: [null] })).toBe('string');
      expect(typeof extractClerkPasswordError({ errors: [undefined] })).toBe('string');
      expect(typeof extractClerkPasswordError({ errors: [{}] })).toBe('string');

      // Empty string vs whitespace messages
      expect(extractClerkPasswordError({ errors: [{ message: '' }] }, false)).toBe(
        'Failed to change password. Please check your current password and try again.'
      );
      expect(extractClerkPasswordError({ errors: [{ message: '' }] }, true)).toBe(
        'Failed to set password. Please try again.'
      );

      // Non-string message in object
      expect(typeof extractClerkPasswordError({ message: { nested: true } })).toBe('string');

      // Standard Error object
      expect(extractClerkPasswordError(new Error('Custom internal failure'))).toBe('Custom internal failure');
    });

    test('ADV-09: HTML error page (Cloudflare 502/504 Bad Gateway) handled gracefully', () => {
      const cloudflareError = '<html><body>502 Bad Gateway</body></html>';
      const extracted = extractClerkPasswordError(cloudflareError);
      expect(extracted).toBe('<html><body>502 Bad Gateway</body></html>');
    });
  });

  // ── Dimension 4: Race Conditions & Concurrent Invocations ────────────────────

  describe('Race Conditions & Concurrent Execution', () => {
    test('ADV-10: 10 concurrent executeChangeOrSetPassword calls resolve deterministically without corruption', async () => {
      let callCount = 0;
      const session = createMockSession();
      const user = createMockUser({
        passwordEnabled: true,
        updatePasswordHandler: async (params) => {
          callCount++;
          // simulate slight asynchronous jitter
          await new Promise((r) => setTimeout(r, Math.random() * 20));
          return { id: 'user_test_123', passwordEnabled: true };
        },
      });

      const promises = Array.from({ length: 10 }).map((_, i) =>
        executeChangeOrSetPassword({
          user,
          session,
          currentPassword: `CurrentPass${i}!`,
          newPassword: `NewPassword${i}!`,
          isSetPasswordMode: false,
        })
      );

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      for (const res of results) {
        expect(res.success).toBe(true);
        expect(res.error).toBeUndefined();
      }
      expect(callCount).toBe(10);
    });
  });

  // ── Dimension 5: Self-Healing 422 Edge Scenarios ──────────────────────────────

  describe('422 Self-Healing Edge Scenarios', () => {
    test('ADV-11: 422 self-healing with failing session reverification stops cleanly and returns error', async () => {
      const session = createMockSession({
        firstFactorError: {
          errors: [{ message: 'Reverification failed: Invalid credentials during retry' }],
        },
      });

      const user = createMockUser({
        passwordEnabled: true,
        updatePasswordHandler: async (params) => {
          if (params.currentPassword) {
            throw {
              errors: [
                {
                  code: 'form_param_unknown',
                  message: 'current_password is not valid',
                  param_name: 'current_password',
                },
              ],
            };
          }
          return { id: 'user_123' };
        },
      });

      const clerk = createMockClerkEnvironment(false); // triggers legacy branch first

      const result = await executeChangeOrSetPassword({
        user,
        session,
        clerk,
        currentPassword: 'WrongPassword!',
        newPassword: 'NewPassword123!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Reverification failed: Invalid credentials during retry');
    });

    test('ADV-12: 422 self-healing respects param_name at root and in meta', async () => {
      // Test variant with meta.paramName (camelCase)
      const session = createMockSession();
      const user = createMockUser({
        passwordEnabled: true,
        updatePasswordHandler: async (params) => {
          if (params.currentPassword) {
            throw {
              errors: [
                {
                  code: 'form_param_unknown',
                  message: 'current_password is unknown',
                  meta: { paramName: 'current_password' },
                },
              ],
            };
          }
          return { id: 'user_123' };
        },
      });

      const clerk = createMockClerkEnvironment(false);

      const result = await executeChangeOrSetPassword({
        user,
        session,
        clerk,
        currentPassword: 'ValidOld123!',
        newPassword: 'NewPassword456!',
        isSetPasswordMode: false,
      });

      expect(result.success).toBe(true);
      expect(session.startVerification).toHaveBeenCalledTimes(1);
    });
  });

  // ── Dimension 6: Form Validation Extreme Boundaries ───────────────────────────

  describe('Form Validation Boundary Testing', () => {
    test('ADV-13: Passwords containing only whitespace are rejected as empty', () => {
      const res = validatePasswordForm({
        currentPassword: '   \t\n  ',
        newPassword: '   ',
        confirmPassword: '   ',
        isSetPasswordMode: false,
      });

      expect(res.isValid).toBe(false);
      expect(res.errors.currentPassword).toBe('Current password is required');
      expect(res.errors.newPassword).toBe('New password is required');
      expect(res.errors.confirmPassword).toBe('Please confirm your new password');
    });

    test('ADV-14: Exactly 8 characters passes, 7 characters fails', () => {
      const seven = validatePasswordForm({
        currentPassword: 'ValidOld123!',
        newPassword: '1234567',
        confirmPassword: '1234567',
        isSetPasswordMode: false,
      });
      expect(seven.isValid).toBe(false);
      expect(seven.errors.newPassword).toBe('Password must be at least 8 characters');

      const eight = validatePasswordForm({
        currentPassword: 'ValidOld123!',
        newPassword: '12345678',
        confirmPassword: '12345678',
        isSetPasswordMode: false,
      });
      expect(eight.isValid).toBe(true);
      expect(eight.errors.newPassword).toBeUndefined();
    });

    test('ADV-15: Case sensitivity in confirmation is strictly enforced', () => {
      const res = validatePasswordForm({
        currentPassword: 'OldPassword123!',
        newPassword: 'SecurePassword123!',
        confirmPassword: 'securepassword123!',
        isSetPasswordMode: false,
      });
      expect(res.isValid).toBe(false);
      expect(res.errors.confirmPassword).toBe('Passwords do not match');
    });
  });
});
