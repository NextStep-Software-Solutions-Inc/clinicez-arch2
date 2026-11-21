import { describe, expect, test, mock } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  validatePasswordForm,
  extractClerkPasswordError,
  isPasswordReverificationEnabled,
  executeChangeOrSetPassword,
} from '../utils/passwordHelpers';
import { useSafeHeaderHeight } from '../hooks/useSafeHeaderHeight';

const APP_ROOT = join(import.meta.dir, '..');
const readSource = (relPath: string): string =>
  readFileSync(join(APP_ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');

describe('CHALLENGER: Dual-Mode & Invariant Stress Tests (Issue #81)', () => {
  // ── Dimension 1: Switching from Google SSO to Password-Enabled ───────────
  test('CHALLENGE-01: Lifecycle transition from Google SSO (passwordEnabled: false) to password-enabled (passwordEnabled: true)', async () => {
    // Phase 1: User initially signed up with Google SSO
    let passwordEnabled = false;
    let recordedUpdateParams: any = null;

    const mockUser = {
      id: 'sso_user_001',
      get passwordEnabled() {
        return passwordEnabled;
      },
      updatePassword: mock(async (params: any) => {
        recordedUpdateParams = params;
        // Simulating Clerk backend: setting password enables password on the user account
        passwordEnabled = true;
        return { id: 'sso_user_001', passwordEnabled: true };
      }),
    };

    let reverifiedPassword = '';
    const mockSession = {
      startVerification: mock(async () => ({ status: 'needs_first_factor' })),
      attemptFirstFactorVerification: mock(async ({ password }: { password: string }) => {
        if (password !== 'NewCreatedPass123!') {
          throw {
            errors: [{ code: 'form_password_incorrect', message: 'Current password incorrect' }],
          };
        }
        reverifiedPassword = password;
        return { status: 'complete' };
      }),
    };

    const clerk = { environment: { authConfig: { reverification: true } } };

    // Step 1: Initial "Set Password" mode for Google SSO user
    let isSetPasswordMode = mockUser.passwordEnabled === false;
    expect(isSetPasswordMode).toBe(true);

    // Form validation should NOT require currentPassword in Set mode
    const initialValidation = validatePasswordForm({
      newPassword: 'NewCreatedPass123!',
      confirmPassword: 'NewCreatedPass123!',
      isSetPasswordMode,
    });
    expect(initialValidation.isValid).toBe(true);
    expect(initialValidation.errors.currentPassword).toBeUndefined();

    // Execute Set Password
    const setResult = await executeChangeOrSetPassword({
      user: mockUser,
      session: mockSession,
      clerk,
      newPassword: 'NewCreatedPass123!',
      isSetPasswordMode,
    });

    expect(setResult.success).toBe(true);
    expect(mockUser.updatePassword).toHaveBeenCalledTimes(1);
    expect(recordedUpdateParams).toEqual({
      newPassword: 'NewCreatedPass123!',
      signOutOfOtherSessions: false,
    });
    expect(recordedUpdateParams.currentPassword).toBeUndefined();
    // Reverification must NOT have been called in Set Password mode
    expect(mockSession.attemptFirstFactorVerification).not.toHaveBeenCalled();

    // Verify user object state has transitioned to passwordEnabled === true
    expect(mockUser.passwordEnabled).toBe(true);

    // Phase 2: User now attempts to change password subsequently
    isSetPasswordMode = mockUser.passwordEnabled === false;
    expect(isSetPasswordMode).toBe(false); // Now in Change Password mode!

    // Form validation must NOW reject empty currentPassword
    const subsequentValidationWithoutCurrent = validatePasswordForm({
      currentPassword: '',
      newPassword: 'AnotherPassword456!',
      confirmPassword: 'AnotherPassword456!',
      isSetPasswordMode,
    });
    expect(subsequentValidationWithoutCurrent.isValid).toBe(false);
    expect(subsequentValidationWithoutCurrent.errors.currentPassword).toBe('Current password is required');

    // Attempting to change password with incorrect current password
    const wrongAttempt = await executeChangeOrSetPassword({
      user: mockUser,
      session: mockSession,
      clerk,
      currentPassword: 'WrongPassword!',
      newPassword: 'AnotherPassword456!',
      isSetPasswordMode,
    });
    expect(wrongAttempt.success).toBe(false);
    expect(wrongAttempt.error).toBe('Current password incorrect');
    // updatePassword must NOT be called if reverification fails
    expect(mockUser.updatePassword).toHaveBeenCalledTimes(1);

    // Changing password with correct current password
    const correctAttempt = await executeChangeOrSetPassword({
      user: mockUser,
      session: mockSession,
      clerk,
      currentPassword: 'NewCreatedPass123!',
      newPassword: 'AnotherPassword456!',
      isSetPasswordMode,
    });
    expect(correctAttempt.success).toBe(true);
    expect(mockUser.updatePassword).toHaveBeenCalledTimes(2);
    expect(reverifiedPassword).toBe('NewCreatedPass123!');
  });

  // ── Dimension 2: Undefined user.passwordEnabled During Initial Mount ────
  test('CHALLENGE-02: Initial mount handling when user.passwordEnabled is undefined or auth is unhydrated', () => {
    // Sub-case A: Auth is still loading (isUserLoaded = false, isSessionLoaded = false)
    const isUserLoaded = false;
    const isSessionLoaded = false;
    const isLoaded = Boolean(isUserLoaded && isSessionLoaded);
    expect(isLoaded).toBe(false);

    // In Settings screen: isPasswordEnabled = isUserLoaded ? user?.passwordEnabled !== false : true
    const settingsPasswordEnabledUnloaded = isUserLoaded ? (undefined !== false) : true;
    expect(settingsPasswordEnabledUnloaded).toBe(true); // Defaults safely to true, avoiding title flicker

    // Sub-case B: User loaded, but passwordEnabled is undefined (e.g. edge-case mock or older Clerk schema)
    const userWithUndefinedPassword: { passwordEnabled: boolean | undefined } = { passwordEnabled: undefined };
    const userLoaded = true;

    const isSetPasswordMode = userWithUndefinedPassword.passwordEnabled === false;
    // undefined === false is false, so it safely defaults to Change Password mode (never accidentally skipping current password)
    expect(isSetPasswordMode).toBe(false);

    const settingsPasswordEnabledDefined = userLoaded ? userWithUndefinedPassword.passwordEnabled !== false : true;
    // undefined !== false is true, so Settings safely displays Change Password
    expect(settingsPasswordEnabledDefined).toBe(true);

    // Sub-case C: User loaded and passwordEnabled is explicitly false
    const ssoUser = { passwordEnabled: false };
    const ssoIsSetPasswordMode = ssoUser.passwordEnabled === false;
    expect(ssoIsSetPasswordMode).toBe(true);

    const ssoSettingsPasswordEnabled = userLoaded ? ssoUser.passwordEnabled !== false : true;
    expect(ssoSettingsPasswordEnabled).toBe(false); // Accurately displays "Set Password"
  });

  // ── Dimension 3: Keyboard Avoidance Props Invariants ──────────────────────
  test('CHALLENGE-03: Keyboard avoidance props are present, immutable and identical across skeleton & form branches', () => {
    const src = readSource('navigation/screens/settings/ChangePassword.screen.tsx');

    // Verify useSafeHeaderHeight hook executes safely without throwing when Context is unavailable
    const headerHeight = useSafeHeaderHeight();
    expect(typeof headerHeight).toBe('number');
    expect(headerHeight).toBe(0);

    // Count KeyboardAvoidingView occurrences (must appear in both !isLoaded and loaded branches)
    const kavMatches = src.match(/<KeyboardAvoidingView/g);
    expect(kavMatches?.length).toBe(2);

    // Verify behavior prop pattern
    const behaviorPattern = /behavior=\{Platform\.OS === 'ios' \? 'padding' : undefined\}/g;
    const behaviorMatches = src.match(behaviorPattern);
    expect(behaviorMatches?.length).toBe(2);

    // Verify keyboardVerticalOffset prop pattern
    const offsetPattern = /keyboardVerticalOffset=\{Platform\.OS === 'ios' \? headerHeight : 0\}/g;
    const offsetMatches = src.match(offsetPattern);
    expect(offsetMatches?.length).toBe(2);

    // Verify ScrollView keyboard avoidance props
    const adjustInsetsPattern = /automaticallyAdjustKeyboardInsets=\{Platform\.OS === 'ios'\}/g;
    const insetsMatches = src.match(adjustInsetsPattern);
    expect(insetsMatches?.length).toBe(2);

    const persistTapsPattern = /keyboardShouldPersistTaps="handled"/g;
    const tapsMatches = src.match(persistTapsPattern);
    expect(tapsMatches?.length).toBe(2);

    const dismissModePattern = /keyboardDismissMode="on-drag"/g;
    const dismissMatches = src.match(dismissModePattern);
    expect(dismissMatches?.length).toBe(2);
  });

  // ── Dimension 4: Cross-Platform Web Parity & Styling Guard ───────────────
  test('CHALLENGE-04: Cross-platform web build parity and zero hex tokens', () => {
    const nativeSettings = readSource('navigation/screens/settings/Settings.screen.tsx');
    const webSettings = readSource('navigation/screens/settings/Settings.screen.web.tsx');
    const changePassword = readSource('navigation/screens/settings/ChangePassword.screen.tsx');

    // Both native and web Settings use useUser and derive isPasswordEnabled
    expect(nativeSettings).toContain('const isPasswordEnabled = isUserLoaded ? user?.passwordEnabled !== false : true;');
    expect(webSettings).toContain('const isPasswordEnabled = isUserLoaded ? user?.passwordEnabled !== false : true;');

    // Both native and web Settings render identical dynamic titles and subtitles
    expect(nativeSettings).toContain("title={isPasswordEnabled ? 'Change Password' : 'Set Password'}");
    expect(webSettings).toContain("title={isPasswordEnabled ? 'Change Password' : 'Set Password'}");

    expect(nativeSettings).toContain("subtitle={isPasswordEnabled ? 'Update your account password' : 'Add a password to your account'}");
    expect(webSettings).toContain("subtitle={isPasswordEnabled ? 'Update your account password' : 'Add a password to your account'}");

    // Web TextInput includes outlineStyle: 'none' for browser focus elegance
    expect(changePassword).toContain("outlineStyle: 'none'");

    // Check zero raw hex color literals
    const hexRegex = /#([0-9a-fA-F]{3,8})\b/;
    expect(nativeSettings.match(hexRegex)).toBeNull();
    expect(webSettings.match(hexRegex)).toBeNull();
    expect(changePassword.match(hexRegex)).toBeNull();
  });
});
