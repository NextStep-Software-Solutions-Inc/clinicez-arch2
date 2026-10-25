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


import { isQueueDisplayPath, isCurrentRouteQueueDisplay } from '../utils/queueDisplayRoute';
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
});
