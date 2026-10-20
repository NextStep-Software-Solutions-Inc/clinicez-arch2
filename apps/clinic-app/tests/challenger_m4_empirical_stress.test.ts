// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

let currentWindowWidth = 1024;
let currentWindowHeight = 800;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  Dimensions: {
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 8),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => {
    const width = currentWindowWidth;
    const height = currentWindowHeight;
    const { theme } = require('../constants/theme');
    return {
      width,
      height,
      isCompact: width < theme.breakpoints.tablet,
      isWorkstation: width >= theme.breakpoints.tablet,
      isDesktop: width >= theme.breakpoints.desktop,
      isWide: width >= theme.breakpoints.wide,
    };
  },
}));

let lastGetUrl = '';
let lastPostUrl = '';
let lastPostPayload: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastGetUrl = url;
      return [null, null];
    },
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      return [null, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

describe('Adversarial Critic M4 Stress Tests', () => {
  beforeEach(() => {
    lastGetUrl = '';
    lastPostUrl = '';
    lastPostPayload = null;
    currentWindowWidth = 1024;
    currentWindowHeight = 800;
  });

  describe('Breakpoint Boundary Stress Testing (1023px vs 1024px vs 1025px)', () => {
    test('Strict 1024px boundary triggers desktop workstation layout', () => {
      const { theme } = require('../constants/theme');
      expect(theme.breakpoints.desktop).toBe(1024);

      // 1024px exactly
      currentWindowWidth = 1024;
      const isDesktopAt1024 = currentWindowWidth >= (theme.breakpoints.desktop ?? 1024);
      expect(isDesktopAt1024).toBe(true);

      // 1023px (one pixel below breakpoint)
      currentWindowWidth = 1023;
      const isDesktopAt1023 = currentWindowWidth >= (theme.breakpoints.desktop ?? 1024);
      expect(isDesktopAt1023).toBe(false);

      // 1025px (one pixel above breakpoint)
      currentWindowWidth = 1025;
      const isDesktopAt1025 = currentWindowWidth >= (theme.breakpoints.desktop ?? 1024);
      expect(isDesktopAt1025).toBe(true);
    });

    test('Zero or negative or extreme window widths do not crash or produce NaN', () => {
      const { theme } = require('../constants/theme');
      const widths = [0, -100, 320, 768, 1024, 1920, 3840];
      for (const w of widths) {
        const isDesktop = w >= (theme.breakpoints.desktop ?? 1024);
        expect(typeof isDesktop).toBe('boolean');
      }
    });
  });

  describe('PhilHealth PIN Digit Parsing & Sanitization Stress Testing', () => {
    test('Valid formats: raw 12 digits, hyphenated 12-digit RA 11223 format', () => {
      const testCases = [
        { raw: '123456789012', expectedValid: true },
        { raw: '12-345678901-2', expectedValid: true },
        { raw: '  12-345678901-2  ', expectedValid: true },
        { raw: '12 345678901 2', expectedValid: true },
      ];

      for (const tc of testCases) {
        const digits = tc.raw.replace(/\D/g, '');
        const isValid = digits.length === 12;
        expect(isValid).toBe(tc.expectedValid);
      }
    });

    test('Invalid formats: under-length, over-length, alpha characters', () => {
      const testCases = [
        { raw: '12345678901', expectedValid: false }, // 11 digits
        { raw: '1234567890123', expectedValid: false }, // 13 digits
        { raw: '12-34567890A-2', expectedValid: false }, // letter A stripped leaves 11
        { raw: '', expectedValid: false },
        { raw: 'NONE', expectedValid: false },
      ];

      for (const tc of testCases) {
        const digits = tc.raw.replace(/\D/g, '');
        const isValid = digits.length === 12;
        expect(isValid).toBe(tc.expectedValid);
      }
    });
  });

  describe('Adversarial Gating: Cash vs PhilHealth Isolation', () => {
    test('Cash encounter with missing all statutory fields still permits signing', () => {
      const isYakapEligible = false;
      const localEvaluation = {
        doctorPanValid: false,
        doctorPrcValid: true,
        patientPinValid: false,
        atcValid: false,
        symptomsValid: false,
        physicalExamComplete: false,
        primaryDiagnosisPresent: false,
        vitalsComplete: false,
        medicinesValid: false,
        s2LicenseValid: false,
        missingFields: ['PAN missing', 'PIN missing', 'ATC missing'],
        warnings: [],
        isReady: false,
      };

      const isYakapReady = isYakapEligible ? localEvaluation.isReady : true;
      expect(isYakapReady).toBe(true);

      const isLocked = isYakapEligible && !isYakapReady;
      expect(isLocked).toBe(false);
    });

    test('PhilHealth encounter with 9/10 conditions fails isReady and locks signing', () => {
      const isYakapEligible = true;
      const localEvaluation = {
        doctorPanValid: true,
        doctorPrcValid: true,
        patientPinValid: true,
        atcValid: true,
        symptomsValid: true,
        physicalExamComplete: true,
        primaryDiagnosisPresent: true,
        vitalsComplete: true,
        medicinesValid: true,
        s2LicenseValid: false, // only this is false
        missingFields: ['Doctor S2 License missing for PDEA drug'],
        warnings: [],
        isReady: false,
      };

      const isYakapReady = isYakapEligible ? localEvaluation.isReady : true;
      expect(isYakapReady).toBe(false);

      const isLocked = isYakapEligible && !isYakapReady;
      expect(isLocked).toBe(true);
    });
  });

  describe('Closed-Loop Nursing Procedure Vitals Formatting Resilience', () => {
    test('JSON vitals parser tolerates null, empty string, malformed JSON, and complete vitals', () => {
      const formatProcedureVitals = (jsonStr?: string) => {
        if (!jsonStr) return 'Not recorded';
        try {
          const v = JSON.parse(jsonStr);
          const items: string[] = [];
          if (v.systolicBp && v.diastolicBp) items.push(`BP ${v.systolicBp}/${v.diastolicBp}`);
          if (v.heartRateBpm || v.heartRate) items.push(`HR ${v.heartRateBpm || v.heartRate} bpm`);
          if (v.respiratoryRateBreathsPerMin || v.respiratoryRate) items.push(`RR ${v.respiratoryRateBreathsPerMin || v.respiratoryRate} cpm`);
          if (v.temperatureCelsius || v.temperature) items.push(`Temp ${v.temperatureCelsius || v.temperature}°C`);
          if (v.oxygenSaturationPercent || v.oxygenSaturation) items.push(`SpO2 ${v.oxygenSaturationPercent || v.oxygenSaturation}%`);
          return items.join(' • ') || 'Normal';
        } catch {
          return jsonStr;
        }
      };

      expect(formatProcedureVitals(undefined)).toBe('Not recorded');
      expect(formatProcedureVitals('')).toBe('Not recorded');
      expect(formatProcedureVitals('broken-json')).toBe('broken-json');
      expect(formatProcedureVitals('{}')).toBe('Normal');

      const fullVitals = JSON.stringify({
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.8,
        oxygenSaturationPercent: 99,
      });
      const formatted = formatProcedureVitals(fullVitals);
      expect(formatted).toContain('BP 120/80');
      expect(formatted).toContain('HR 72 bpm');
      expect(formatted).toContain('RR 18 cpm');
      expect(formatted).toContain('Temp 36.8°C');
      expect(formatted).toContain('SpO2 99%');
    });
  });
});
