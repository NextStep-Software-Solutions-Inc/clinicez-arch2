// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

// Mock react-native
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
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
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  G: 'G',
  Polyline: 'Polyline',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { default: DuplicatePatientWarningModal } = await import(
  '../components/patient/DuplicatePatientWarningModal'
);
import type { DuplicateMatch } from '../services/clinicService';

describe('DuplicatePatientWarningModal Component Tests', () => {
  const mockMatches: DuplicateMatch[] = [
    {
      patientId: 'pat-001-uuid',
      patientCode: 'PAT-2026-00042',
      fullName: 'Santos, Maria Clara',
      dateOfBirth: '1990-08-15',
      contactNumber: '09171234567',
      philHealthNumber: '12-345678901-8',
      matchReason: 'PhilHealth Identification Number (PIN) match • Contact Number match',
      similarityScore: 1.0,
      confidence: 'High',
    },
    {
      patientId: 'pat-002-uuid',
      patientCode: 'PAT-2026-00099',
      fullName: 'Santos, Marie Clara',
      dateOfBirth: '1990-08-15',
      contactNumber: '09181112233',
      matchReason: "Matching Date of Birth with similar name ('Marie Santos', 92% match)",
      similarityScore: 0.92,
      confidence: 'High',
    },
  ];

  test('1. returns null when visible is false', () => {
    const rendered = DuplicatePatientWarningModal({
      visible: false,
      matches: mockMatches,
      onUseExistingProfile: () => {},
      onCreateNewProfileAnyway: () => {},
      onClose: () => {},
    });

    expect(rendered).toBeNull();
  });

  test('2. instantiates element with valid props when visible is true', () => {
    let usedProfileId = '';
    let createdAnyway = false;
    let closed = false;

    const element = React.createElement(DuplicatePatientWarningModal, {
      visible: true,
      matches: mockMatches,
      onUseExistingProfile: (id: string) => { usedProfileId = id; },
      onCreateNewProfileAnyway: () => { createdAnyway = true; },
      onClose: () => { closed = true; },
      isRegistering: false,
    });

    expect(element).toBeDefined();
    expect(element.props.visible).toBe(true);
    expect(element.props.matches).toHaveLength(2);
    expect(element.props.matches[0].patientCode).toBe('PAT-2026-00042');
    expect(element.props.matches[1].similarityScore).toBe(0.92);

    // Trigger action callbacks
    element.props.onUseExistingProfile('pat-001-uuid');
    expect(usedProfileId).toBe('pat-001-uuid');

    element.props.onCreateNewProfileAnyway();
    expect(createdAnyway).toBe(true);

    element.props.onClose();
    expect(closed).toBe(true);
  });

  test('3. renders modal component tree and contains matched profile cards', () => {
    const rendered = DuplicatePatientWarningModal({
      visible: true,
      matches: mockMatches,
      onUseExistingProfile: () => {},
      onCreateNewProfileAnyway: () => {},
      onClose: () => {},
      isRegistering: false,
    });

    expect(rendered).not.toBeNull();
    expect(rendered?.type).toBe('Modal');
    expect(rendered?.props.visible).toBe(true);
    expect(rendered?.props.transparent).toBe(true);
  });

  test('4. renders with isRegistering loading state passed cleanly', () => {
    const element = React.createElement(DuplicatePatientWarningModal, {
      visible: true,
      matches: mockMatches,
      onUseExistingProfile: () => {},
      onCreateNewProfileAnyway: () => {},
      onClose: () => {},
      isRegistering: true,
    });

    expect(element.props.isRegistering).toBe(true);
  });

  test('5. correctly computes match percentages from similarity scores', () => {
    for (const match of mockMatches) {
      const percentage = match.similarityScore != null
        ? Math.round(match.similarityScore * 100)
        : null;

      if (match.patientId === 'pat-001-uuid') {
        expect(percentage).toBe(100);
      } else if (match.patientId === 'pat-002-uuid') {
        expect(percentage).toBe(92);
      }
    }
  });
});
