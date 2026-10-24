export interface PasswordValidationResult {
  isValid: boolean;
  errors: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };
}

/**
 * Validates the password form values for either Change Password or Set Password mode.
 */
export function validatePasswordForm(values: {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  isSetPasswordMode: boolean;
}): PasswordValidationResult {
  const errors: PasswordValidationResult['errors'] = {};

  if (!values.isSetPasswordMode && !values.currentPassword?.trim()) {
    errors.currentPassword = 'Current password is required';
  }

  if (!values.newPassword?.trim()) {
    errors.newPassword = 'New password is required';
  } else if (values.newPassword.length < 8) {
    errors.newPassword = 'Password must be at least 8 characters';
  } else if (!values.isSetPasswordMode && values.currentPassword && values.newPassword === values.currentPassword) {
    errors.newPassword = 'New password must be different from current password';
  }

  if (!values.confirmPassword?.trim()) {
    errors.confirmPassword = 'Please confirm your new password';
  } else if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Extracts a human-friendly error message from Clerk API errors, standard Error objects, or network failures.
 */
export function extractClerkPasswordError(err: any, isSetPasswordMode?: boolean): string {
  if (!err) {
    return 'An unexpected error occurred. Please try again.';
  }

  if (typeof err === 'string') {
    return err;
  }

  if ((err.name === 'TypeError' || err instanceof TypeError) && typeof err.message === 'string' && err.message.toLowerCase().includes('fetch')) {
    return 'Network connection error. Please check your internet connection and try again.';
  }

  const firstError = err?.errors?.[0];
  if (firstError?.longMessage) {
    return firstError.longMessage;
  }
  if (firstError?.message) {
    return firstError.message;
  }

  if (err.message && typeof err.message === 'string') {
    return err.message;
  }

  return isSetPasswordMode
    ? 'Failed to set password. Please try again.'
    : 'Failed to change password. Please check your current password and try again.';
}

/**
 * Checks whether Clerk session reverification is supported and enabled.
 */
export function isPasswordReverificationEnabled(session: any, clerk?: any): boolean {
  if (!session || typeof session.startVerification !== 'function') {
    return false;
  }

  // Check Clerk v6 internal environment first, then public/mock environment
  const clerkReverificationConfig =
    clerk?.__internal_environment?.authConfig?.reverification ??
    clerk?.environment?.authConfig?.reverification;
  if (clerkReverificationConfig !== undefined && clerkReverificationConfig === false) {
    return false;
  }

  return true;
}

export type ReverificationCodeKind = 'email_code' | 'second_factor';

export interface ExecutePasswordParams {
  user: any;
  session: any;
  clerk?: any;
  currentPassword?: string;
  newPassword: string;
  isSetPasswordMode: boolean;
  emailVerificationCode?: string;
  secondFactorCode?: string;
}

export interface ExecutePasswordResult {
  success: boolean;
  error?: string;
  requiresVerificationCode?: ReverificationCodeKind;
}

/**
 * Executes either a password change (with session reverification when active) or initial password creation.
 * Always passes signOutOfOtherSessions: false to preserve the active session.
 */
export async function executeChangeOrSetPassword(
  params: ExecutePasswordParams,
): Promise<ExecutePasswordResult> {
  const {
    user,
    session,
    clerk,
    currentPassword,
    newPassword,
    isSetPasswordMode,
    emailVerificationCode,
    secondFactorCode,
  } = params;

  if (!user) {
    return { success: false, error: 'User session not available. Please sign in again.' };
  }

  try {
    if (isSetPasswordMode) {
      // ── "Set Password" Mode (e.g. Google SSO or passwordless) ───────────────
      if (emailVerificationCode?.trim() && session?.attemptFirstFactorVerification) {
        const attemptRes = await session.attemptFirstFactorVerification({
          strategy: 'email_code',
          code: emailVerificationCode.trim(),
        });

        if (attemptRes?.status === 'needs_second_factor') {
          if (secondFactorCode?.trim() && typeof session.attemptSecondFactorVerification === 'function') {
            await session.attemptSecondFactorVerification({
              strategy: 'totp',
              code: secondFactorCode.trim(),
            });
          } else {
            return {
              success: false,
              requiresVerificationCode: 'second_factor',
              error: 'Two-factor authentication required. Please enter your authenticator code.',
            };
          }
        }

        await user.updatePassword({
          newPassword,
          signOutOfOtherSessions: false,
        });
        return { success: true };
      }

      try {
        await user.updatePassword({
          newPassword,
          signOutOfOtherSessions: false,
        });
        return { success: true };
      } catch (err: any) {
        const isReverificationReq =
          err?.errors?.[0]?.code === 'session_reverification_required' ||
          err?.status === 403;

        if (isReverificationReq && session?.startVerification) {
          const verifyRes = await session.startVerification({ level: 'first_factor' });
          if (typeof session.prepareFirstFactorVerification === 'function') {
            const emailFactor = verifyRes?.supportedFirstFactors?.find(
              (f: any) => f?.strategy === 'email_code' && f?.emailAddressId,
            );
            const emailAddressId =
              emailFactor?.emailAddressId ??
              user?.primaryEmailAddressId ??
              user?.emailAddresses?.[0]?.id;

            await session.prepareFirstFactorVerification(
              emailAddressId
                ? { strategy: 'email_code', emailAddressId }
                : { strategy: 'email_code' },
            );
          }
          return {
            success: false,
            requiresVerificationCode: 'email_code',
            error: 'Session reverification required. A verification code has been sent to your email.',
          };
        }
        throw err;
      }
    } else {
      // ── "Change Password" Mode (Existing password) ──────────────────────────
      const reverificationEnabled = isPasswordReverificationEnabled(session, clerk);

      if (reverificationEnabled && currentPassword) {
        // Step 1: Re-verify current password using Clerk session reverification
        const verifyRes = await session.startVerification({ level: 'first_factor' });
        const attemptRes = await session.attemptFirstFactorVerification({
          strategy: 'password',
          password: currentPassword,
        });

        // Check if second factor is required (e.g. TOTP MFA enabled)
        if (attemptRes?.status === 'needs_second_factor' || verifyRes?.status === 'needs_second_factor') {
          if (secondFactorCode?.trim() && typeof session.attemptSecondFactorVerification === 'function') {
            await session.attemptSecondFactorVerification({
              strategy: 'totp',
              code: secondFactorCode.trim(),
            });
          } else {
            return {
              success: false,
              requiresVerificationCode: 'second_factor',
              error: 'Two-factor authentication required. Please enter your authenticator code.',
            };
          }
        }

        // Step 2: Update password WITHOUT currentPassword (prevents HTTP 422 form_param_unknown)
        try {
          await user.updatePassword({
            newPassword,
            signOutOfOtherSessions: false,
          });
          return { success: true };
        } catch (updateErr: any) {
          // Defensive fallback: If Clerk returns form_param_missing for current_password in a legacy setup
          const isMissingCurrent =
            updateErr?.errors?.[0]?.code === 'form_param_missing' &&
            (updateErr?.errors?.[0]?.param_name === 'current_password' ||
             updateErr?.errors?.[0]?.meta?.paramName === 'current_password' ||
             updateErr?.errors?.[0]?.meta?.param_name === 'current_password');

          if (isMissingCurrent) {
            await user.updatePassword({
              currentPassword,
              newPassword,
              signOutOfOtherSessions: false,
            });
            return { success: true };
          }
          throw updateErr;
        }
      } else {
        // Legacy Clerk environments (reverification: false)
        try {
          await user.updatePassword({
            currentPassword,
            newPassword,
            signOutOfOtherSessions: false,
          });
          return { success: true };
        } catch (legacyErr: any) {
          // Defensive 422 self-healing: if legacy attempt failed with form_param_unknown for current_password
          const isParamUnknown =
            legacyErr?.errors?.[0]?.code === 'form_param_unknown' &&
            (legacyErr?.errors?.[0]?.meta?.paramName === 'current_password' ||
             legacyErr?.errors?.[0]?.meta?.param_name === 'current_password' ||
             legacyErr?.errors?.[0]?.param_name === 'current_password');

          if (isParamUnknown && session && typeof session.startVerification === 'function' && currentPassword) {
            await session.startVerification({ level: 'first_factor' });
            await session.attemptFirstFactorVerification({
              strategy: 'password',
              password: currentPassword,
            });
            await user.updatePassword({
              newPassword,
              signOutOfOtherSessions: false,
            });
            return { success: true };
          }
          throw legacyErr;
        }
      }
    }
  } catch (err: any) {
    // Top-level defensive catch: if updatePassword threw form_param_unknown for current_password
    const isParamUnknown =
      err?.errors?.[0]?.code === 'form_param_unknown' &&
      (err?.errors?.[0]?.meta?.paramName === 'current_password' ||
       err?.errors?.[0]?.meta?.param_name === 'current_password' ||
       err?.errors?.[0]?.param_name === 'current_password');

    if (isParamUnknown && session && typeof session.startVerification === 'function' && currentPassword) {
      try {
        await session.startVerification({ level: 'first_factor' });
        await session.attemptFirstFactorVerification({
          strategy: 'password',
          password: currentPassword,
        });
        await user.updatePassword({
          newPassword,
          signOutOfOtherSessions: false,
        });
        return { success: true };
      } catch (retryErr: any) {
        return {
          success: false,
          error: extractClerkPasswordError(retryErr, isSetPasswordMode),
        };
      }
    }

    return {
      success: false,
      error: extractClerkPasswordError(err, isSetPasswordMode),
    };
  }
}
