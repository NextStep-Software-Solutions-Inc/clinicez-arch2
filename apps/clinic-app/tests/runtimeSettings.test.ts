import { describe, expect, test } from 'bun:test';
import { parseRuntimeSettings, pickSetting, SETTING_NAMES } from '../services/runtimeSettings';

describe('parseRuntimeSettings', () => {
  test('keeps only known EXPO_PUBLIC_* names, trimmed', () => {
    const parsed = parseRuntimeSettings({
      EXPO_PUBLIC_CLINIC_API_URL: ' https://clinic.example.org ',
      EXPO_PUBLIC_OFFLINE_GRACE_HOURS: 6,
      EXPO_PUBLIC_BASE_DOMAIN: '',
      SOMETHING_ELSE: 'x',
    });
    expect(parsed).toEqual({
      EXPO_PUBLIC_CLINIC_API_URL: 'https://clinic.example.org',
      EXPO_PUBLIC_OFFLINE_GRACE_HOURS: '6',
    });
  });

  test('tolerates non-object payloads', () => {
    expect(parseRuntimeSettings(null)).toEqual({});
    expect(parseRuntimeSettings('<html>')).toEqual({});
    expect(parseRuntimeSettings([])).toEqual({});
  });

  test('every setting name uses the shared EXPO_PUBLIC_ prefix', () => {
    for (const name of SETTING_NAMES) expect(name.startsWith('EXPO_PUBLIC_')).toBe(true);
  });
});

describe('pickSetting', () => {
  test('runtime beats build-time and blank counts as unset', () => {
    expect(pickSetting({ EXPO_PUBLIC_PORTAL_URL: 'https://a' }, { EXPO_PUBLIC_PORTAL_URL: 'https://b' }, 'EXPO_PUBLIC_PORTAL_URL')).toBe('https://a');
    expect(pickSetting({ EXPO_PUBLIC_PORTAL_URL: '  ' }, { EXPO_PUBLIC_PORTAL_URL: 'https://b' }, 'EXPO_PUBLIC_PORTAL_URL')).toBe('https://b');
    expect(pickSetting({}, {}, 'EXPO_PUBLIC_PORTAL_URL')).toBeUndefined();
  });
});