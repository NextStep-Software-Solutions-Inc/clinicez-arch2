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
}) {
  const startVerification = mock(async ({ level }: { level: string }) => ({
    status: options?.reverificationStatus ?? 'needs_first_factor',
    level,
    supportedFirstFactors: [{ strategy: 'password' }, { strategy: 'email_code' }],
    supportedSecondFactors: [{ strategy: 'totp' }],
  }));

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

describe('passwordHelpers Test Suite (TC-01 through TC-14)', () => {
  // TC-01: Standard Password Change (reverification: true, passwordEnabled: true)
  test('TC-01: Standard Password Change reverifies current password and calls updatePassword without currentPassword', async () => {
    const session = createMockSession();
    const user = createMockUser({ passwordEnabled: true });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
    });

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();

    // Verifies reverification calls
    expect(session.startVerification).toHaveBeenCalledWith({ level: 'first_factor' });
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: 'password',
      password: 'OldPassword123!',
    });

    // Verifies updatePassword was called WITHOUT currentPassword
    const updateParams = user.getRecordedUpdateParams();
    expect(updateParams).toEqual({
      newPassword: 'NewPassword456!',
      signOutOfOtherSessions: false,
    });
    expect(updateParams.currentPassword).toBeUndefined();
  });

  // TC-02: Incorrect currentPassword Rejection
  test('TC-02: Incorrect currentPassword fails during reverification and user.updatePassword is never invoked', async () => {
    const session = createMockSession({
      firstFactorError: {
        errors: [
          {
            code: 'form_password_incorrect',
            message: 'Incorrect current password',
            longMessage: 'The password you entered is incorrect. Please try again.',
          },
        ],
      },
    });
    const user = createMockUser({ passwordEnabled: true });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'WrongPassword!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('The password you entered is incorrect. Please try again.');
    expect(user.updatePassword).not.toHaveBeenCalled();
  });

  // TC-03: Password Complexity / Pwned Password Rejection
  test('TC-03: Pwned or weak password error from updatePassword is extracted correctly', async () => {
    const session = createMockSession();
    const user = createMockUser({
      passwordEnabled: true,
      updatePasswordError: {
        errors: [
          {
            code: 'form_password_pwned',
            message: 'Password pwned',
            longMessage: 'This password has been found in an online data breach and cannot be used.',
          },
        ],
      },
    });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'ValidOld123!',
      newPassword: 'PwnedPassword123!',
      isSetPasswordMode: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('This password has been found in an online data breach and cannot be used.');
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledTimes(1);
    expect(user.updatePassword).toHaveBeenCalledTimes(1);
  });

  // TC-04: "Set Password" Mode for Passwordless / Google SSO (passwordEnabled: false)
  test('TC-04: Set Password mode omits currentPassword and calls updatePassword directly', async () => {
    const session = createMockSession();
    const user = createMockUser({ passwordEnabled: false });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      newPassword: 'FreshPassword123!',
      isSetPasswordMode: true,
    });

    expect(result.success).toBe(true);
    expect(session.attemptFirstFactorVerification).not.toHaveBeenCalled();

    const updateParams = user.getRecordedUpdateParams();
    expect(updateParams).toEqual({
      newPassword: 'FreshPassword123!',
      signOutOfOtherSessions: false,
    });
    expect(updateParams.currentPassword).toBeUndefined();
  });

  // TC-05: "Set Password" with session_reverification_required (Email Code Flow)
  test('TC-05: Set Password mode handles session_reverification_required via email code trigger', async () => {
    const session = createMockSession();
    const user = createMockUser({
      passwordEnabled: false,
      updatePasswordError: {
        status: 403,
        errors: [{ code: 'session_reverification_required', message: 'Reverification required' }],
      },
    });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      newPassword: 'FreshPassword123!',
      isSetPasswordMode: true,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Session reverification required. A verification code has been sent to your email.');
    expect(session.startVerification).toHaveBeenCalledWith({ level: 'first_factor' });
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
  });

  // TC-06: Legacy Clerk Fallback (reverification: false)
  test('TC-06: Legacy Clerk environment (reverification: false) passes currentPassword in updatePassword', async () => {
    const session = createMockSession();
    const user = createMockUser({ passwordEnabled: true });
    const clerk = createMockClerkEnvironment(false);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'LegacyOldPassword123!',
      newPassword: 'LegacyNewPassword456!',
      isSetPasswordMode: false,
    });

    expect(result.success).toBe(true);
    expect(session.startVerification).not.toHaveBeenCalled();

    const updateParams = user.getRecordedUpdateParams();
    expect(updateParams).toEqual({
      currentPassword: 'LegacyOldPassword123!',
      newPassword: 'LegacyNewPassword456!',
      signOutOfOtherSessions: false,
    });
  });

  // TC-07: Defensive Retry: Clerk throws form_param_unknown for current_password
  test('TC-07: Defensive retry recovers when legacy path throws form_param_unknown for current_password', async () => {
    let callCount = 0;
    const session = createMockSession();
    const user = createMockUser({
      passwordEnabled: true,
      updatePasswordHandler: async (params: any) => {
        callCount++;
        if (params.currentPassword) {
          throw {
            errors: [
              {
                code: 'form_param_unknown',
                message: 'current_password is not a valid parameter for this request.',
                meta: { param_name: 'current_password' },
              },
            ],
          };
        }
        return { id: 'user_test_123', passwordEnabled: true };
      },
    });
    const clerk = createMockClerkEnvironment(false); // Simulate legacy attempt first

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
    });

    expect(result.success).toBe(true);
    expect(callCount).toBe(2);
    expect(session.startVerification).toHaveBeenCalledWith({ level: 'first_factor' });
    expect(session.attemptFirstFactorVerification).toHaveBeenCalledWith({
      strategy: 'password',
      password: 'OldPassword123!',
    });
    expect(user.getRecordedUpdateParams()).toEqual({
      newPassword: 'NewPassword456!',
      signOutOfOtherSessions: false,
    });
  });

  // TC-08: Multi-Factor (MFA) Reverification (needs_second_factor)
  test('TC-08: MFA reverification triggers attemptSecondFactorVerification with TOTP code', async () => {
    const session = createMockSession({ reverificationStatus: 'needs_second_factor' });
    const user = createMockUser({ passwordEnabled: true });
    const clerk = createMockClerkEnvironment(true);

    const result = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
      secondFactorCode: '123456',
    });

    expect(result.success).toBe(true);
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({
      strategy: 'totp',
      code: '123456',
    });
    expect(user.getRecordedUpdateParams()).toEqual({
      newPassword: 'NewPassword456!',
      signOutOfOtherSessions: false,
    });
  });

  // TC-09: Validation: Empty Fields
  test('TC-09: validatePasswordForm rejects empty required fields in Change and Set modes', () => {
    const changeEmpty = validatePasswordForm({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      isSetPasswordMode: false,
    });
    expect(changeEmpty.isValid).toBe(false);
    expect(changeEmpty.errors.currentPassword).toBe('Current password is required');
    expect(changeEmpty.errors.newPassword).toBe('New password is required');
    expect(changeEmpty.errors.confirmPassword).toBe('Please confirm your new password');

    const setEmpty = validatePasswordForm({
      newPassword: '',
      confirmPassword: '',
      isSetPasswordMode: true,
    });
    expect(setEmpty.isValid).toBe(false);
    expect(setEmpty.errors.currentPassword).toBeUndefined();
    expect(setEmpty.errors.newPassword).toBe('New password is required');
    expect(setEmpty.errors.confirmPassword).toBe('Please confirm your new password');
  });

  // TC-10: Validation: Minimum Length (< 8 chars)
  test('TC-10: validatePasswordForm enforces minimum length of 8 characters', () => {
    const shortRes = validatePasswordForm({
      currentPassword: 'ValidOld123!',
      newPassword: 'short',
      confirmPassword: 'short',
      isSetPasswordMode: false,
    });
    expect(shortRes.isValid).toBe(false);
    expect(shortRes.errors.newPassword).toBe('Password must be at least 8 characters');
  });

  // TC-11: Validation: Confirmation Mismatch
  test('TC-11: validatePasswordForm rejects mismatched confirmation password', () => {
    const mismatchRes = validatePasswordForm({
      currentPassword: 'ValidOld123!',
      newPassword: 'SecurePassword123!',
      confirmPassword: 'DifferentPassword456!',
      isSetPasswordMode: false,
    });
    expect(mismatchRes.isValid).toBe(false);
    expect(mismatchRes.errors.confirmPassword).toBe('Passwords do not match');
  });

  // TC-12: Validation: Identical Current and New Password
  test('TC-12: validatePasswordForm rejects identical new and current password in Change mode', () => {
    const sameRes = validatePasswordForm({
      currentPassword: 'SamePassword123!',
      newPassword: 'SamePassword123!',
      confirmPassword: 'SamePassword123!',
      isSetPasswordMode: false,
    });
    expect(sameRes.isValid).toBe(false);
    expect(sameRes.errors.newPassword).toBe('New password must be different from current password');

    // In Set Password mode, this check should not apply
    const setRes = validatePasswordForm({
      newPassword: 'SamePassword123!',
      confirmPassword: 'SamePassword123!',
      isSetPasswordMode: true,
    });
    expect(setRes.isValid).toBe(true);
  });

  // TC-13: Error Extraction Utility Resilience
  test('TC-13: extractClerkPasswordError handles various error shapes cleanly', () => {
    expect(extractClerkPasswordError(null)).toBe('An unexpected error occurred. Please try again.');
    expect(extractClerkPasswordError(undefined)).toBe('An unexpected error occurred. Please try again.');
    expect(extractClerkPasswordError('Direct string error message')).toBe('Direct string error message');

    const withLongMsg = {
      errors: [{ longMessage: 'Detailed clerk explanation.', message: 'Short msg' }],
    };
    expect(extractClerkPasswordError(withLongMsg)).toBe('Detailed clerk explanation.');

    const withShortMsg = {
      errors: [{ message: 'Short clerk explanation.' }],
    };
    expect(extractClerkPasswordError(withShortMsg)).toBe('Short clerk explanation.');

    const standardError = new Error('Standard JS error');
    expect(extractClerkPasswordError(standardError)).toBe('Standard JS error');

    const emptyObj = {};
    expect(extractClerkPasswordError(emptyObj, false)).toBe('Failed to change password. Please check your current password and try again.');
    expect(extractClerkPasswordError(emptyObj, true)).toBe('Failed to set password. Please try again.');
  });

  // TC-14: Network Disconnection / Offline Resilience
  test('TC-14: extractClerkPasswordError maps fetch/network failures to user-friendly network message', () => {
    const typeError = new TypeError('Failed to fetch');
    expect(extractClerkPasswordError(typeError)).toBe('Network connection error. Please check your internet connection and try again.');

    const fetchErrorObj = { name: 'TypeError', message: 'Network request failed: fetch error' };
    expect(extractClerkPasswordError(fetchErrorObj)).toBe('Network connection error. Please check your internet connection and try again.');
  });

  // Auxiliary Tests: isPasswordReverificationEnabled & Missing User
  test('isPasswordReverificationEnabled returns true by default and false if reverification is disabled', () => {
    const sessionWithStart = { startVerification: () => {} };
    expect(isPasswordReverificationEnabled(sessionWithStart)).toBe(true);
    expect(isPasswordReverificationEnabled(null)).toBe(false);
    expect(isPasswordReverificationEnabled({})).toBe(false);

    const clerkDisabled = { environment: { authConfig: { reverification: false } } };
    expect(isPasswordReverificationEnabled(sessionWithStart, clerkDisabled)).toBe(false);

    const clerkEnabled = { environment: { authConfig: { reverification: true } } };
    expect(isPasswordReverificationEnabled(sessionWithStart, clerkEnabled)).toBe(true);

    // Clerk v6 runtime property (__internal_environment)
    const clerkV6Disabled = { __internal_environment: { authConfig: { reverification: false } } };
    expect(isPasswordReverificationEnabled(sessionWithStart, clerkV6Disabled)).toBe(false);

    const clerkV6Enabled = { __internal_environment: { authConfig: { reverification: true } } };
    expect(isPasswordReverificationEnabled(sessionWithStart, clerkV6Enabled)).toBe(true);
  });

  test('TC-15: Set Password email_code reverification passes emailAddressId and completes on code submission', async () => {
    let reverified = false;
    const session = {
      startVerification: mock(async () => ({
        status: 'needs_first_factor',
        supportedFirstFactors: [{ strategy: 'email_code', emailAddressId: 'idn_email_999' }],
      })),
      prepareFirstFactorVerification: mock(async () => ({ status: 'needs_first_factor' })),
      attemptFirstFactorVerification: mock(async ({ strategy, code }: any) => {
        expect(strategy).toBe('email_code');
        expect(code).toBe('654321');
        reverified = true;
        return { status: 'complete' };
      }),
    };

    const user = createMockUser({
      passwordEnabled: false,
      updatePasswordHandler: async () => {
        if (!reverified) {
          throw {
            status: 403,
            errors: [{ code: 'session_reverification_required', message: 'Reverification required' }],
          };
        }
        return { id: 'user_sso_999', passwordEnabled: true };
      },
    });

    // Step 1: Initial submit triggers email_code preparation with emailAddressId
    const step1 = await executeChangeOrSetPassword({
      user,
      session,
      newPassword: 'FreshPassword123!',
      isSetPasswordMode: true,
    });
    expect(step1.success).toBe(false);
    expect(step1.requiresVerificationCode).toBe('email_code');
    expect(session.prepareFirstFactorVerification).toHaveBeenCalledWith({
      strategy: 'email_code',
      emailAddressId: 'idn_email_999',
    });

    // Step 2: Resubmitting with emailVerificationCode completes reverification and sets password
    const step2 = await executeChangeOrSetPassword({
      user,
      session,
      newPassword: 'FreshPassword123!',
      isSetPasswordMode: true,
      emailVerificationCode: '654321',
    });
    expect(step2.success).toBe(true);
    expect(user.getRecordedUpdateParams()).toEqual({
      newPassword: 'FreshPassword123!',
      signOutOfOtherSessions: false,
    });
  });

  test('TC-16: MFA needs_second_factor prompts for authenticator code before calling updatePassword', async () => {
    const session = createMockSession({ reverificationStatus: 'needs_second_factor' });
    const user = createMockUser({ passwordEnabled: true });
    const clerk = createMockClerkEnvironment(true);

    // Step 1: No secondFactorCode yet -> prompts for second_factor without calling updatePassword
    const step1 = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
    });

    expect(step1.success).toBe(false);
    expect(step1.requiresVerificationCode).toBe('second_factor');
    expect(user.updatePassword).not.toHaveBeenCalled();

    // Step 2: Submitting with secondFactorCode completes TOTP and calls updatePassword
    const step2 = await executeChangeOrSetPassword({
      user,
      session,
      clerk,
      currentPassword: 'OldPassword123!',
      newPassword: 'NewPassword456!',
      isSetPasswordMode: false,
      secondFactorCode: '778899',
    });

    expect(step2.success).toBe(true);
    expect(session.attemptSecondFactorVerification).toHaveBeenCalledWith({
      strategy: 'totp',
      code: '778899',
    });
    expect(user.updatePassword).toHaveBeenCalledTimes(1);
  });

  test('executeChangeOrSetPassword returns error when user object is null or undefined', async () => {
    const res = await executeChangeOrSetPassword({
      user: null,
      session: null,
      newPassword: 'Password123!',
      isSetPasswordMode: true,
    });
    expect(res.success).toBe(false);
    expect(res.error).toBe('User session not available. Please sign in again.');
  });
});
