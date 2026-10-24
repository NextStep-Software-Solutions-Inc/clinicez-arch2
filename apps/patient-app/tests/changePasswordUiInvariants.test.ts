import { describe, expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = join(import.meta.dir, '..');
const readSource = (relPath: string): string =>
  readFileSync(join(APP_ROOT, relPath), 'utf8').replace(/\r\n/g, '\n');

describe('ChangePassword & Settings UI/UX Invariants (UI-01 through UI-08)', () => {
  const changePasswordPath = 'navigation/screens/settings/ChangePassword.screen.tsx';
  const settingsNativePath = 'navigation/screens/settings/Settings.screen.tsx';
  const settingsWebPath = 'navigation/screens/settings/Settings.screen.web.tsx';
  const passwordHelpersPath = 'utils/passwordHelpers.ts';

  test('Target files exist in patient-app source tree', () => {
    expect(existsSync(join(APP_ROOT, changePasswordPath))).toBe(true);
    expect(existsSync(join(APP_ROOT, settingsNativePath))).toBe(true);
    expect(existsSync(join(APP_ROOT, settingsWebPath))).toBe(true);
    expect(existsSync(join(APP_ROOT, passwordHelpersPath))).toBe(true);
  });

  // UI-01: ChangePassword.screen.tsx imports useUser and useSession from @clerk/expo
  test('UI-01: ChangePasswordScreen consumes useUser and useSession from @clerk/expo', () => {
    const src = readSource(changePasswordPath);
    expect(src).toContain("from '@clerk/expo'");
    expect(src).toMatch(/useUser/);
    expect(src).toMatch(/useSession/);
    expect(src).toMatch(/useClerk/);
  });

  // UI-02: ChangePassword.screen.tsx renders loading skeleton when !isLoaded
  test('UI-02: ChangePasswordScreen renders loading skeleton state before Clerk auth hydrates', () => {
    const src = readSource(changePasswordPath);
    expect(src).toContain('isLoaded');
    expect(src).toMatch(/if\s*\(!isLoaded\)/);
    expect(src).toContain('<Skeleton');
    expect(src).toContain('@ui/Skeleton');
  });

  // UI-03: ChangePassword.screen.tsx conditionally hides Current Password input when in Set Password mode
  test('UI-03: ChangePasswordScreen conditionally omits Current Password field in Set Password mode', () => {
    const src = readSource(changePasswordPath);
    expect(src).toMatch(/isSetPasswordMode/);
    expect(src).toContain('!isSetPasswordMode');
    expect(src).toMatch(/name="currentPassword"/);
  });

  // UI-04: Dynamic screen title, description, and button text between "Change Password" and "Set Password"
  test('UI-04: ChangePasswordScreen dynamically sets navigation title, description, and submit button', () => {
    const src = readSource(changePasswordPath);
    expect(src).toContain("navigation.setOptions");
    expect(src).toContain("isSetPasswordMode ? 'Set Password' : 'Change Password'");
    expect(src).toContain('label={isSetPasswordMode ? \'Set Password\' : \'Change Password\'}');
  });

  // UI-05: ChangePassword.screen.tsx uses dialog.alert for modals; zero Alert.alert
  test('UI-05: ChangePasswordScreen uses dialog.alert and contains zero forbidden Alert.alert calls', () => {
    const src = readSource(changePasswordPath);
    expect(src).toContain('dialog.alert(');
    expect(src).not.toContain('Alert.alert(');
  });

  // UI-06: Preserves keyboard avoidance invariants verbatim
  test('UI-06: ChangePasswordScreen preserves all keyboard avoidance invariants', () => {
    const src = readSource(changePasswordPath);
    expect(src).toContain('KeyboardAvoidingView');
    expect(src).toContain('useSafeHeaderHeight');
    expect(src).toContain('keyboardVerticalOffset');
    expect(src).toContain('automaticallyAdjustKeyboardInsets');
    expect(src).toContain('keyboardShouldPersistTaps="handled"');
    expect(src).toContain('keyboardDismissMode="on-drag"');
  });

  // UI-07: Settings.screen.tsx and Settings.screen.web.tsx dynamically adapt row and PinModal
  test('UI-07: Settings native and web screens import useUser and dynamically render row and PinModal', () => {
    const nativeSrc = readSource(settingsNativePath);
    const webSrc = readSource(settingsWebPath);

    for (const [name, src] of [['Settings.screen.tsx', nativeSrc], ['Settings.screen.web.tsx', webSrc]]) {
      expect(src).toContain("from '@clerk/expo'");
      expect(src).toContain('useUser');
      expect(src).toContain('isPasswordEnabled');
      expect(src).toContain("title={isPasswordEnabled ? 'Change Password' : 'Set Password'}");
      expect(src).toContain("subtitle={isPasswordEnabled ? 'Update your account password' : 'Add a password to your account'}");
      expect(src).toContain("isPasswordEnabled\n            ? 'Enter your PIN before changing your password.'\n            : 'Enter your PIN before setting your password.'");
    }
  });

  // UI-08: Token Compliance Guard - zero forbidden raw hex colors
  test('UI-08: All modified settings screens contain ZERO forbidden raw hex colors', () => {
    const hexPattern = /#([0-9a-fA-F]{3,8})\b/;

    for (const relPath of [changePasswordPath, settingsNativePath, settingsWebPath]) {
      const src = readSource(relPath);
      const match = src.match(hexPattern);
      expect(match).toBeNull();
    }
  });
});
