import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { resolveActiveSection } from '../navigation/webSections';

describe('Privacy & Communications Settings Suite', () => {
  const privacyScreenPath = path.resolve(__dirname, '../navigation/screens/settings/PrivacySettings.screen.tsx');
  const webSettingsPath = path.resolve(__dirname, '../navigation/screens/settings/Settings.screen.web.tsx');
  const mobileSettingsPath = path.resolve(__dirname, '../navigation/screens/settings/Settings.screen.tsx');
  const mainStackWebPath = path.resolve(__dirname, '../navigation/navigators/MainStack.web.tsx');
  const privacyContextPath = path.resolve(__dirname, '../contexts/PrivacyContext.tsx');

  it('mobile Settings screen includes Privacy & Communications link', () => {
    const src = fs.readFileSync(mobileSettingsPath, 'utf8');
    expect(src).toContain('Privacy & Communications');
    expect(src).toContain('PrivacySettingsScreen');
  });

  it('web Settings screen includes Privacy & Communications link matching mobile', () => {
    const src = fs.readFileSync(webSettingsPath, 'utf8');
    expect(src).toContain('Privacy & Communications');
    expect(src).toContain('PrivacySettingsScreen');
  });

  it('web MainStack registers PrivacySettingsScreen', () => {
    const src = fs.readFileSync(mainStackWebPath, 'utf8');
    expect(src).toContain("['PrivacySettingsScreen', PrivacySettingsScreen, 'Privacy & Communications']");
  });

  it('webSections maps PrivacySettingsScreen to SettingsScreen section', () => {
    const state: any = {
      index: 0,
      routes: [{ name: 'PrivacySettingsScreen' }],
    };
    expect(resolveActiveSection(state)).toBe('SettingsScreen');
  });

  it('PrivacySettingsScreen uses unified SettingsSection and SettingsRow without duplicate header', () => {
    const src = fs.readFileSync(privacyScreenPath, 'utf8');
    expect(src).toContain('SettingsSection');
    expect(src).toContain('SettingsRow');
    expect(src).toContain('Privacy Blur Mode');
    expect(src).toContain('Show Hidden Conversations');
    expect(src).toContain('DATA PRIVACY ACT OF 2012 (RA 10173)');
    // No duplicate inline back button or duplicate title
    expect(src).not.toContain('hitSize={44}');
    expect(src).not.toContain('accessibilityLabel="Back to Settings"');
  });

  it('PrivacyContext exposes clearAllHiddenConversations', () => {
    const src = fs.readFileSync(privacyContextPath, 'utf8');
    expect(src).toContain('clearAllHiddenConversations: () => Promise<boolean>');
    expect(src).toContain('const clearAllHiddenConversations = useCallback');
  });
});
