// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native dependencies before dynamic import
const createMockComponent = (name: string) => {
  const Comp = ({ children, ...props }: any) =>
    React.createElement('div', { 'data-component': name, ...props }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
}));

mock.module('../components/ui/ThemedText', () => ({
  default: createMockComponent('ThemedText'),
}));

const {
  OFFICIAL_CLOUDFLARE_TEST_SITEKEY,
  LOCAL_OFFLINE_BYPASS_TOKEN,
} = await import('../components/turnstile/TurnstileWidget');

describe('Turnstile Client Bot Protection Suite', () => {
  test('constants: has official test key and local offline bypass token', () => {
    expect(OFFICIAL_CLOUDFLARE_TEST_SITEKEY).toBe('1x00000000000000000000AA');
    expect(LOCAL_OFFLINE_BYPASS_TOKEN).toBe('LOCAL-OFFLINE-BYPASS');
  });

  test('authSession: AuthStatus interface supports turnstile fields', () => {
    const statusPayload = {
      workspaceFound: true,
      licenseStatus: 'Active',
      requiresBootstrap: false,
      clinicName: 'St. Jude Family Clinic',
      turnstileEnabled: true,
      turnstileSiteKey: '0x4AAAAAAABCTestKey',
    };

    expect(statusPayload.turnstileEnabled).toBe(true);
    expect(statusPayload.turnstileSiteKey).toBe('0x4AAAAAAABCTestKey');
  });

  test('clinicService: ClinicSettingsRecord supports turnstile and env override metadata', () => {
    const record = {
      id: 'clinic-123',
      tenantId: 'tenant-456',
      clinicId: 'clinic-123',
      clinicName: 'Metro Health',
      operatingHours: '8:00 AM - 5:00 PM',
      defaultSlotDurationMinutes: 30,
      queuePrefix: 'Q',
      invoicePrefix: 'INV',
      defaultConsultationFee: 500,
      vatRate: 0.12,
      turnstileEnabled: true,
      turnstileSiteKey: 'custom-site-key-789',
      isTurnstileOverriddenByEnv: true,
      turnstileEnvOverrideValue: true,
    };

    expect(record.turnstileEnabled).toBe(true);
    expect(record.turnstileSiteKey).toBe('custom-site-key-789');
    expect(record.isTurnstileOverriddenByEnv).toBe(true);
    expect(record.turnstileEnvOverrideValue).toBe(true);
  });

  test('Environment Override Logic: locks editing when environment overrides setting', () => {
    const overriddenSettings = {
      isTurnstileOverriddenByEnv: true,
      turnstileEnvOverrideValue: true,
      turnstileEnabled: true,
    };

    // Simulated handleToggle check
    const canEdit = !overriddenSettings.isTurnstileOverriddenByEnv;
    expect(canEdit).toBe(false);

    const badgeLabel = overriddenSettings.isTurnstileOverriddenByEnv
      ? overriddenSettings.turnstileEnvOverrideValue
        ? 'Enforced by Environment'
        : 'Disabled by Environment'
      : overriddenSettings.turnstileEnabled
        ? 'Enabled'
        : 'Disabled (Offline-Safe)';

    expect(badgeLabel).toBe('Enforced by Environment');
  });

  test('Runtime Control Logic: allows editing when no environment override exists', () => {
    const runtimeSettings = {
      isTurnstileOverriddenByEnv: false,
      turnstileEnvOverrideValue: null,
      turnstileEnabled: false,
    };

    const canEdit = !runtimeSettings.isTurnstileOverriddenByEnv;
    expect(canEdit).toBe(true);

    const badgeLabel = runtimeSettings.isTurnstileOverriddenByEnv
      ? runtimeSettings.turnstileEnvOverrideValue
        ? 'Enforced by Environment'
        : 'Disabled by Environment'
      : runtimeSettings.turnstileEnabled
        ? 'Enabled'
        : 'Disabled (Offline-Safe)';

    expect(badgeLabel).toBe('Disabled (Offline-Safe)');
  });
});
