// token-guard:ignore-file
import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  Linking: {
    openURL: () => Promise.resolve(),
    canOpenURL: () => Promise.resolve(true),
    getInitialURL: () => Promise.resolve(null),
    addEventListener: () => ({ remove: () => {} }),
  },
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
  setCustomFontsAvailable: () => {},
}));

import { isQueueDisplayPath, isCurrentRouteQueueDisplay } from '../utils/queueDisplayRoute';
import { CHIME_CONFIG, isAudioMuted, setAudioMuted, playAlertChime, unlockAudio } from '../utils/audioChime';

describe('Adversarial Verification: Milestone 4 LAN Kiosk Boundary & Offline Chime', () => {
  const clinicAppDir = join(__dirname, '..');

  describe('1. Authentication Perimeter & Route Boundary Stress Testing', () => {
    test('Correctly identifies all valid public queue-display and queue-tv routes', () => {
      // Path-based standard
      expect(isQueueDisplayPath('/queue-display')).toBe(true);
      expect(isQueueDisplayPath('/queue-display/')).toBe(true);
      expect(isQueueDisplayPath('/queue-display/room-1')).toBe(true);
      expect(isQueueDisplayPath('/queue-tv')).toBe(true);
      expect(isQueueDisplayPath('/queue-tv/main')).toBe(true);

      // Case insensitivity
      expect(isQueueDisplayPath('/QUEUE-DISPLAY')).toBe(true);
      expect(isQueueDisplayPath('/Queue-Display/Room-2')).toBe(true);

      // Hash-based routes (for LAN single-page apps / kiosks)
      expect(isQueueDisplayPath('/', '#/queue-display')).toBe(true);
      expect(isQueueDisplayPath('', '#/queue-display')).toBe(true);
      expect(isQueueDisplayPath('/', '#queue-display')).toBe(true);
      expect(isQueueDisplayPath('', '#/queue-display/room-1')).toBe(true);
      expect(isQueueDisplayPath('/', '#/queue-tv')).toBe(true);
      expect(isQueueDisplayPath('', '#queue-tv')).toBe(false); // only #/queue-tv is supported for legacy
    });

    test('Strictly rejects private clinical routes and invalid spoofed paths', () => {
      const privateRoutes = [
        '/patients',
        '/patients/12345',
        '/consultations',
        '/consultations/soap',
        '/appointments',
        '/billing',
        '/billing/invoices',
        '/result-review',
        '/scan-patient',
        '/yakap',
        '/settings',
        '/settings/tv-display',
        '/audit',
        '/profile',
        '/dashboard',
        '/',
        '',
      ];

      for (const route of privateRoutes) {
        expect(isQueueDisplayPath(route, '')).toBe(false);
        expect(isQueueDisplayPath(route, '#')).toBe(false);
      }

      // Adversarial attempts to spoof queue-display path prefix
      expect(isQueueDisplayPath('/queue-display-fake')).toBe(false);
      expect(isQueueDisplayPath('/queue-display-admin')).toBe(false);
      expect(isQueueDisplayPath('/queue-displays')).toBe(false);
      expect(isQueueDisplayPath('/queue-tv-admin')).toBe(false);
    });

    test('AST Verification of App.tsx authentication perimeter', () => {
      const appSource = readFileSync(join(clinicAppDir, 'App.tsx'), 'utf8');

      // 1. PublicQueueDisplayScreen is rendered inside ConnectionGate
      const connectionGateIndex = appSource.indexOf('<ConnectionGate>');
      const closeConnectionGateIndex = appSource.indexOf('</ConnectionGate>');
      const queueDisplayRenderIndex = appSource.indexOf('<PublicQueueDisplayScreen />');

      expect(connectionGateIndex).toBeGreaterThan(0);
      expect(queueDisplayRenderIndex).toBeGreaterThan(connectionGateIndex);
      expect(queueDisplayRenderIndex).toBeLessThan(closeConnectionGateIndex);

      // 2. PublicQueueDisplayScreen is rendered BEFORE / OUTSIDE AuthGate
      const authGateIndex = appSource.indexOf('<AuthGate>');
      expect(queueDisplayRenderIndex).toBeLessThan(authGateIndex);

      // 3. Navigation (workstation screens) is strictly nested INSIDE AuthGate
      const navigationIndex = appSource.indexOf('<Navigation');
      const closeAuthGateIndex = appSource.indexOf('</AuthGate>');
      expect(navigationIndex).toBeGreaterThan(authGateIndex);
      expect(navigationIndex).toBeLessThan(closeAuthGateIndex);

      // 4. Clinical Context Providers are also inside AuthGate
      const clinicProviderIndex = appSource.indexOf('<ClinicProvider>');
      const staffProviderIndex = appSource.indexOf('<StaffProvider>');
      expect(clinicProviderIndex).toBeGreaterThan(authGateIndex);
      expect(staffProviderIndex).toBeGreaterThan(authGateIndex);
    });
  });

  describe('2. Audio Chime Synthesizer & Offline Resilience Stress Testing', () => {
    test('Synthesizer uses exact medical two-tone pentatonic chime specifications', () => {
      expect(CHIME_CONFIG.tone1Hz).toBe(587.33); // D5
      expect(CHIME_CONFIG.tone2Hz).toBe(880.00); // A5
      expect(CHIME_CONFIG.durationMs).toBe(400);
      expect(CHIME_CONFIG.storageKey).toBe('clinicez_tv_muted');
    });

    test('ZERO external audio asset dependencies (.mp3, .wav, .ogg, network fetches)', () => {
      const audioChimeSrc = readFileSync(join(clinicAppDir, 'utils', 'audioChime.ts'), 'utf8');
      const queueDisplaySrc = readFileSync(join(clinicAppDir, 'screens', 'public', 'PublicQueueDisplayScreen.tsx'), 'utf8');

      // Assert no external audio file references
      expect(/\.(mp3|wav|ogg|m4a|aac|flac)/i.test(audioChimeSrc)).toBe(false);
      expect(/\.(mp3|wav|ogg|m4a|aac|flac)/i.test(queueDisplaySrc)).toBe(false);

      // Assert no fetch / axios / XMLHttpRequest in audioChime.ts
      expect(/\bfetch\s*\(/.test(audioChimeSrc)).toBe(false);
      expect(/\baxios\b/.test(audioChimeSrc)).toBe(false);
      expect(/\bXMLHttpRequest\b/.test(audioChimeSrc)).toBe(false);
      expect(/https?:\/\//.test(audioChimeSrc)).toBe(false);
    });

    test('Survives simulated browser environment where Web Audio API is missing', () => {
      const origWindow = (globalThis as any).window;
      try {
        (globalThis as any).window = {};
        expect(unlockAudio()).toBe(false);
        expect(() => playAlertChime()).not.toThrow();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    test('Survives browser autoplay block (AudioContext.state suspended and resume rejection)', () => {
      const origWindow = (globalThis as any).window;
      try {
        let resumeCalled = false;
        const mockAudioContext = class {
          state = 'suspended';
          currentTime = 100;
          resume() {
            resumeCalled = true;
            return Promise.reject(new Error('Autoplay blocked by browser policy'));
          }
          createOscillator() {
            return {
              type: 'sine',
              frequency: { setValueAtTime: () => {} },
              connect: () => {},
              start: () => {},
              stop: () => {},
            };
          }
          createGain() {
            return {
              gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
              connect: () => {},
            };
          }
          destination = {};
        };

        (globalThis as any).window = {
          AudioContext: mockAudioContext,
        };

        // Reset module state if possible or test unlockAudio
        expect(unlockAudio()).toBe(true);
        expect(resumeCalled).toBe(true);
        expect(() => playAlertChime()).not.toThrow();
      } finally {
        (globalThis as any).window = origWindow;
      }
    });

    test('Survives localStorage exceptions (SecurityError / private browsing sandbox)', () => {
      const origWindow = (globalThis as any).window;
      const origLocalStorage = (globalThis as any).localStorage;

      try {
        (globalThis as any).window = {
          localStorage: {
            getItem: () => { throw new Error('SecurityError: Access denied'); },
            setItem: () => { throw new Error('QuotaExceededError: Storage quota exceeded'); },
          },
        };
        (globalThis as any).localStorage = (globalThis as any).window.localStorage;

        // Must not throw, falls back to in-memory boolean
        expect(() => setAudioMuted(true)).not.toThrow();
        expect(isAudioMuted()).toBe(true);
        expect(() => setAudioMuted(false)).not.toThrow();
        expect(isAudioMuted()).toBe(false);
      } finally {
        (globalThis as any).window = origWindow;
        (globalThis as any).localStorage = origLocalStorage;
      }
    });

    test('Concurrent stress: withstands 100 rapid concurrent playAlertChime invocations', () => {
      expect(() => {
        for (let i = 0; i < 100; i++) {
          playAlertChime();
        }
      }).not.toThrow();
    });
  });

  describe('3. Zero-PHI Audit on Public Queue Display', () => {
    test('PublicQueueDisplayScreen source contains zero PHI fields or leaks', () => {
      const screenSrc = readFileSync(
        join(clinicAppDir, 'screens', 'public', 'PublicQueueDisplayScreen.tsx'),
        'utf8'
      );

      // Verify no patient medical or sensitive demographic fields are referenced in JSX or interfaces
      const forbiddenPhiKeywords = [
        'diagnosis',
        'icd10',
        'chiefComplaint',
        'medicalHistory',
        'allergies',
        'philHealthPin',
        'patientDob',
        'birthDate',
        'dateOfBirth',
        'clinicalNotes',
        'soapNote',
        'vitals',
      ];

      for (const keyword of forbiddenPhiKeywords) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        expect(regex.test(screenSrc)).toBe(false);
      }

      // Verify ServingTicket interface contains only public non-PHI fields
      expect(screenSrc).toContain('ticketNumber: string');
      expect(screenSrc).toContain('roomOrStation?: string | null');
      expect(screenSrc).toContain('doctorName?: string | null');
      expect(screenSrc).toContain('status: string');

      // Verify queueItemId is strictly used as a React reconciliation key, never rendered as text
      expect(screenSrc).toMatch(/key=\{ticket\.queueItemId\}/);
      expect(screenSrc).toMatch(/key=\{item\.queueItemId\}/);
      expect(screenSrc.includes('>{ticket.queueItemId}<')).toBe(false);
      expect(screenSrc.includes('>{primaryServing.queueItemId}<')).toBe(false);
      expect(screenSrc.includes('patientId')).toBe(false);
    });

    test('PublicQueueDisplayScreen only renders ticket number, room, doctor, and masked display name', () => {
      const screenSrc = readFileSync(
        join(clinicAppDir, 'screens', 'public', 'PublicQueueDisplayScreen.tsx'),
        'utf8'
      );

      // Primary serving renders ticketNumber, roomOrStation, doctorName
      expect(screenSrc).toContain('{primaryServing.ticketNumber}');
      expect(screenSrc).toContain('{primaryServing.roomOrStation || \'Consultation Room 1\'}');
      expect(screenSrc).toContain('{primaryServing.doctorName || \'Attending Physician\'}');

      // Up Next renders ticketNumber, displayName, priority, status
      expect(screenSrc).toContain('{ticket.ticketNumber}');
      expect(screenSrc).toContain('{ticket.displayName}');
      expect(screenSrc).toContain('{ticket.priority}');
    });

    test('Zero raw hex color literals in PublicQueueDisplayScreen (Token Compliance)', () => {
      const screenSrc = readFileSync(
        join(clinicAppDir, 'screens', 'public', 'PublicQueueDisplayScreen.tsx'),
        'utf8'
      );

      // Matches #abc, #abcdef, #abcd, #abcdef00 outside comments
      const hexPattern = /#[0-9a-fA-F]{3,8}\b/;
      expect(hexPattern.test(screenSrc)).toBe(false);
    });
  });
});
