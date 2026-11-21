// token-guard:ignore-file
import { describe, test, expect, mock } from 'bun:test';
import React from 'react';

// Mock React Native primitives for Bun runtime
mock.module('react-native', () => ({
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
  Touchable: { Mixin: {} },
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  Dimensions: {
    get: () => ({ width: 1920, height: 1080 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1920, height: 1080 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Alert: { alert: () => {} },
  PixelRatio: {
    get: () => 1,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: (size: number) => size,
    roundToNearestPixel: (size: number) => size,
  },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
  processColor: (c: any) => c,
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

const {
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  to1NFFindings,
  from1NFFindings,
} = await import('../components/consultation/InlinePhysicalExamCard');
type PhysicalExamFindings = import('../components/consultation/InlinePhysicalExamCard').PhysicalExamFindings;

describe('Physical Exam 1NF Bidirectional Hydration', () => {
  test('Roundtrip: DEFAULT_PHYSICAL_EXAM_NORMAL to 1NF and back is lossless', () => {
    const findings1NF = to1NFFindings(DEFAULT_PHYSICAL_EXAM_NORMAL);
    const reconstructed = from1NFFindings([{ generalSurveyId: '1', generalSurveyRemarks: '', findings: findings1NF }]);

    expect(reconstructed).not.toBeNull();
    expect(reconstructed?.generalSurvey).toBe('Normal');
    expect(reconstructed?.heent).toBe('Normal');
    expect(reconstructed?.skin).toBe('Normal');
    expect(reconstructed?.chest).toBe('Normal');
    expect(reconstructed?.heart).toBe('Normal');
    expect(reconstructed?.abdomen).toBe('Normal');
    expect(reconstructed?.neuro).toBe('Normal');
    expect(reconstructed?.rectal).toBe('Normal');
    expect(reconstructed?.gu).toBe('Normal');
    expect(reconstructed?.musculoskeletal).toBe('Normal');
  });

  test('Roundtrip: Abnormal findings and remarks are reconstructed exactly', () => {
    const abnormalExam: PhysicalExamFindings = {
      ...DEFAULT_PHYSICAL_EXAM_NORMAL,
      generalSurvey: 'Abnormal',
      generalSurveyId: '2',
      generalSurveyRemarks: 'Acute respiratory distress',
      chest: 'Abnormal',
      chestId: '4',
      chestRemarks: 'Bilateral basal crackles and wheezing',
      skin: 'Abnormal',
      skinId: '9',
      skinRemarks: 'Petechial rashes on lower extremities',
    };

    const findings1NF = to1NFFindings(abnormalExam);
    const reconstructed = from1NFFindings([{
      generalSurveyId: abnormalExam.generalSurveyId,
      generalSurveyRemarks: abnormalExam.generalSurveyRemarks,
      findings: findings1NF,
    }]);

    expect(reconstructed).not.toBeNull();
    expect(reconstructed?.generalSurvey).toBe('Abnormal');
    expect(reconstructed?.generalSurveyId).toBe('2');
    expect(reconstructed?.generalSurveyRemarks).toBe('Acute respiratory distress');
    expect(reconstructed?.chest).toBe('Abnormal');
    expect(reconstructed?.chestId).toBe('4');
    expect(reconstructed?.chestRemarks).toBe('Bilateral basal crackles and wheezing');
    expect(reconstructed?.skin).toBe('Abnormal');
    expect(reconstructed?.skinId).toBe('9');
    expect(reconstructed?.skinRemarks).toBe('Petechial rashes on lower extremities');
    expect(reconstructed?.heart).toBe('Normal');
  });

  test('Degenerate input: null, empty array, or empty findings gracefully returns null for fallback', () => {
    expect(from1NFFindings(null)).toBeNull();
    expect(from1NFFindings([])).toBeNull();
    expect(from1NFFindings([{ findings: [] }])).toBeNull();
  });
});
