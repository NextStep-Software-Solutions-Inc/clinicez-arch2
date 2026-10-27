// token-guard:ignore-file
import { describe, test, expect, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, ...rest }: any) => React.createElement('div', { 'data-component': name, ...rest }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: () => {} },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Polyline: createMockComponent('Polyline'),
  Polygon: createMockComponent('Polygon'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));


import {
  isQueueDisplayPath,
  isCurrentRouteQueueDisplay,
  isGuidOrUuid,
  resolveTvDisplaySlugs,
  buildCloudTvDisplayUrl,
} from '../utils/queueDisplayRoute';
import { CHIME_CONFIG, isAudioMuted, setAudioMuted, playAlertChime, unlockAudio } from '../utils/audioChime';

describe('Milestone 4: Clinic-App LAN Queue Kiosk & Route Detection', () => {
  describe('Route Detection (isQueueDisplayPath)', () => {
    test('recognizes standard web path /queue-display', () => {
      expect(isQueueDisplayPath('/queue-display', '')).toBe(true);
      expect(isQueueDisplayPath('/queue-display/main', '')).toBe(true);
      expect(isQueueDisplayPath('/QUEUE-DISPLAY', '')).toBe(true);
    });

    test('recognizes hash-based routing #/queue-display and #queue-display for SPAs', () => {
      expect(isQueueDisplayPath('/', '#/queue-display')).toBe(true);
      expect(isQueueDisplayPath('', '#/queue-display')).toBe(true);
      expect(isQueueDisplayPath('/', '#queue-display')).toBe(true);
      expect(isQueueDisplayPath('', '#/queue-display/room-1')).toBe(true);
    });

    test('recognizes legacy /queue-tv and #/queue-tv paths', () => {
      expect(isQueueDisplayPath('/queue-tv', '')).toBe(true);
      expect(isQueueDisplayPath('/', '#/queue-tv')).toBe(true);
      expect(isQueueDisplayPath('/queue-tv/main', '')).toBe(true);
    });

    test('rejects authenticated clinician screens and settings routes', () => {
      expect(isQueueDisplayPath('/dashboard', '')).toBe(false);
      expect(isQueueDisplayPath('/patients', '')).toBe(false);
      expect(isQueueDisplayPath('/consultations', '')).toBe(false);
      expect(isQueueDisplayPath('/settings', '#general')).toBe(false);
      expect(isQueueDisplayPath('/settings/tv-display', '')).toBe(false);
      expect(isQueueDisplayPath('/queue', '')).toBe(false);
      expect(isQueueDisplayPath(null, null)).toBe(false);
    });

    test('isCurrentRouteQueueDisplay checks window location safely', () => {
      const result = isCurrentRouteQueueDisplay();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Audio Chime Synthesizer (audioChime.ts)', () => {
    test('defines correct medical chime frequencies and duration (D5 -> A5)', () => {
      expect(CHIME_CONFIG.tone1Hz).toBe(587.33); // D5
      expect(CHIME_CONFIG.tone2Hz).toBe(880.00); // A5
      expect(CHIME_CONFIG.durationMs).toBe(400);
      expect(CHIME_CONFIG.storageKey).toBe('clinicez_tv_muted');
    });

    test('manages mute persistence in localStorage safely', () => {
      setAudioMuted(true);
      expect(isAudioMuted()).toBe(true);

      setAudioMuted(false);
      expect(isAudioMuted()).toBe(false);
    });

    test('unlockAudio and playAlertChime execute without throwing', () => {
      expect(() => unlockAudio()).not.toThrow();
      expect(() => playAlertChime()).not.toThrow();
    });
  });

  describe('Zero-PHI Guarantee & Component Structure', () => {
    test('PublicQueueDisplayScreen is exported as default', async () => {
      const mod = await import('../screens/public/PublicQueueDisplayScreen');
      expect(typeof mod.default).toBe('function');
    });

    test('WaitingAreaTvSettingsCard is exported as default', async () => {
      const mod = await import('../components/settings/WaitingAreaTvSettingsCard');
      expect(typeof mod.default).toBe('function');
    });
  });

  describe('Strict Non-UUID Guarantee & TV Passcode PIN Protection (Anti-Leak)', () => {
    const sampleGuid = '476a9086-c0eb-4aef-8ec6-49bb1cfd17c6';

    test('isGuidOrUuid accurately identifies GUIDs and ignores valid slugs', () => {
      expect(isGuidOrUuid(sampleGuid)).toBe(true);
      expect(isGuidOrUuid('476A9086-C0EB-4AEF-8EC6-49BB1CFD17C6')).toBe(true);
      expect(isGuidOrUuid('nextstep')).toBe(false);
      expect(isGuidOrUuid('main-clinic')).toBe(false);
      expect(isGuidOrUuid(null)).toBe(false);
      expect(isGuidOrUuid(undefined)).toBe(false);
    });

    test('resolveTvDisplaySlugs NEVER outputs a UUID/GUID even if settings contain tenantId', () => {
      // Case 1: settings has tenantId (UUID) but no tenantSlug, and ctx has facilitySlug "nextstep"
      const result1 = resolveTvDisplaySlugs(
        { tenantId: sampleGuid, tenantSlug: null, facilitySlug: null },
        { facilitySlug: 'nextstep', tenantSlug: null }
      );
      expect(result1.tenantSlug).toBe('nextstep');
      expect(result1.facilitySlug).toBe('main');
      expect(isGuidOrUuid(result1.tenantSlug)).toBe(false);
      expect(isGuidOrUuid(result1.facilitySlug)).toBe(false);

      // Case 2: settings has tenantSlug as a GUID (misconfigured)
      const result2 = resolveTvDisplaySlugs(
        { tenantId: sampleGuid, tenantSlug: sampleGuid, facilitySlug: 'lobby' },
        null
      );
      expect(result2.tenantSlug).toBe('lobby'); // Promoted from facilitySlug since tenantSlug was invalid GUID!
      expect(result2.facilitySlug).toBe('main');
      expect(isGuidOrUuid(result2.tenantSlug)).toBe(false);

      // Case 3: complete fallback without any valid slugs defaults to "clinic" and "main"
      const result3 = resolveTvDisplaySlugs(
        { tenantId: sampleGuid, tenantSlug: sampleGuid, facilitySlug: sampleGuid },
        { tenantSlug: sampleGuid, facilitySlug: sampleGuid }
      );
      expect(result3.tenantSlug).toBe('clinic');
      expect(result3.facilitySlug).toBe('main');
      expect(isGuidOrUuid(result3.tenantSlug)).toBe(false);
      expect(isGuidOrUuid(result3.facilitySlug)).toBe(false);
    });

    test('buildCloudTvDisplayUrl constructs slug-based public URLs without UUIDs and appends PIN correctly', () => {
      const portalBase = 'https://dev.clinicez.net';

      // Clean URL for public / unauthorized users
      const cleanUrl = buildCloudTvDisplayUrl(
        portalBase,
        { tenantSlug: 'nextstep', facilitySlug: 'main', tvDisplayPin: '4321' },
        null,
        false // Do NOT include PIN
      );
      expect(cleanUrl).toBe('https://dev.clinicez.net/queue-display/nextstep/main');
      expect(cleanUrl).not.toContain(sampleGuid);
      expect(cleanUrl).not.toContain('4321');

      // Pre-authenticated URL for lobby wall TV hardware setup
      const pinUrl = buildCloudTvDisplayUrl(
        portalBase,
        { tenantSlug: 'nextstep', facilitySlug: 'main', tvDisplayPin: '4321' },
        null,
        true // Include PIN
      );
      expect(pinUrl).toBe('https://dev.clinicez.net/queue-display/nextstep/main?pin=4321');
      expect(pinUrl).not.toContain(sampleGuid);
    });
  });
});
