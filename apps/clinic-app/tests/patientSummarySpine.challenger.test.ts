// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
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
    get: () => ({ width: 1024, height: 768 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
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
  Alert: {
    alert: () => {},
  },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
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
  default: PatientSummarySpine,
  evaluateBloodPressure,
  evaluateHeartRate,
  evaluateRespiratoryRate,
  evaluateTemperature,
  evaluateOxygenSat,
  evaluateZScoreCategory,
  formatPhilHealthPin,
  isPregnancyIcd10,
  evaluatePregnancyStatus,
  HIGH_FALL_RISK_REGEX,
  isHighFallRisk,
  isLimbAlert,
  isSeizurePrecautions,
  isCombativeRisk,
  isMobilityAssist,
} = await import('../components/chart/PatientSummarySpine');

import type {
  ClinicPatient,
  PatientChart,
  PatientAllergyRecord,
  PatientProblemRecord,
  TriageVitals,
} from '../services/clinicService';

describe('Challenger M3 Empirical Stress Tests — PatientSummarySpine Evaluation & Alert Engines', () => {

  // =========================================================================
  // 1. evaluateBloodPressure Stress Testing
  // =========================================================================
  describe('1. evaluateBloodPressure Edge & Threshold Testing', () => {
    test('1.1 Normal Blood Pressure boundary (<120 and <80, >=90 and >=60)', () => {
      // Nominal normal
      expect(evaluateBloodPressure(115, 75)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      // Exact normal boundaries
      expect(evaluateBloodPressure(119, 79)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateBloodPressure(90, 60)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('1.2 Elevated Blood Pressure boundary (120-129 and <80)', () => {
      expect(evaluateBloodPressure(120, 79)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
      expect(evaluateBloodPressure(125, 75)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
      expect(evaluateBloodPressure(129, 79)).toEqual({ level: 'warning', label: 'Elevated', isAbnormal: true });
    });

    test('1.3 Stage 1 Hypertension (130-139 or 80-89)', () => {
      // Systolic triggered
      expect(evaluateBloodPressure(130, 70)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(139, 75)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      // Diastolic triggered
      expect(evaluateBloodPressure(115, 80)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(118, 89)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
      // Both triggered
      expect(evaluateBloodPressure(135, 85)).toEqual({ level: 'urgent', label: 'Stage 1 HTN', isAbnormal: true });
    });

    test('1.4 Stage 2 Hypertension (>=140 or >=90)', () => {
      // Systolic triggered
      expect(evaluateBloodPressure(140, 75)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(179, 85)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      // Diastolic triggered
      expect(evaluateBloodPressure(125, 90)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      expect(evaluateBloodPressure(120, 119)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
      // Both
      expect(evaluateBloodPressure(150, 95)).toEqual({ level: 'emergency', label: 'Stage 2 HTN', isAbnormal: true });
    });

    test('1.5 Hypertensive Crisis (>=180 or >=120)', () => {
      expect(evaluateBloodPressure(180, 80)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      expect(evaluateBloodPressure(120, 120)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
      expect(evaluateBloodPressure(200, 130)).toEqual({ level: 'emergency', label: 'Crisis', isAbnormal: true });
    });

    test('1.6 Hypotension (<90 or <60)', () => {
      // Systolic hypotension
      expect(evaluateBloodPressure(89, 70)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
      // Diastolic hypotension
      expect(evaluateBloodPressure(110, 59)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
      // Both
      expect(evaluateBloodPressure(85, 55)).toEqual({ level: 'urgent', label: 'Hypotension', isAbnormal: true });
    });

    test('1.7 Missing, zero, and null/undefined values', () => {
      expect(evaluateBloodPressure(undefined, undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(0, 80)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(120, 0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(0, 0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateBloodPressure(null as any, null as any)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });

    test('1.8 Discordant BP edge conditions (evaluates priority ordering)', () => {
      // Diastolic 55 (<60 hypotension) with Systolic 125 (>=120 elevated)
      // Refined cascade checks hypotension first to prevent masking diastolic hypotension
      const discordant1 = evaluateBloodPressure(125, 55);
      expect(discordant1.level).toBe('urgent');
      expect(discordant1.label).toBe('Hypotension');

      // Systolic 85 (<90 hypotension) with Diastolic 85 (>=80 Stage 1 HTN)
      // Refined cascade checks hypotension first to prevent masking systolic hypotension
      const discordant2 = evaluateBloodPressure(85, 85);
      expect(discordant2.level).toBe('urgent');
      expect(discordant2.label).toBe('Hypotension');

      // Diastolic 55 (<60 hypotension) with Systolic 135 (>=130 Stage 1 HTN)
      const discordant3 = evaluateBloodPressure(135, 55);
      expect(discordant3.level).toBe('urgent');
      expect(discordant3.label).toBe('Hypotension');

      // Systolic 125 with normal Diastolic 75 cleanly evaluates to Elevated
      const elevatedNormal = evaluateBloodPressure(125, 75);
      expect(elevatedNormal.level).toBe('warning');
      expect(elevatedNormal.label).toBe('Elevated');
    });
  });

  // =========================================================================
  // 2. evaluateHeartRate Stress Testing
  // =========================================================================
  describe('2. evaluateHeartRate Edge & Threshold Testing', () => {
    test('2.1 Extreme Bradycardia (<45)', () => {
      expect(evaluateHeartRate(44)).toEqual({ level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(30)).toEqual({ level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(1)).toEqual({ level: 'emergency', label: 'Severe Bradycardia', isAbnormal: true });
    });

    test('2.2 Bradycardia (<60 and >=45)', () => {
      expect(evaluateHeartRate(45)).toEqual({ level: 'urgent', label: 'Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(50)).toEqual({ level: 'urgent', label: 'Bradycardia', isAbnormal: true });
      expect(evaluateHeartRate(59)).toEqual({ level: 'urgent', label: 'Bradycardia', isAbnormal: true });
    });

    test('2.3 Normal Heart Rate (60 to 100 inclusive)', () => {
      expect(evaluateHeartRate(60)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateHeartRate(75)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateHeartRate(100)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('2.4 Tachycardia (>100 and <=130)', () => {
      expect(evaluateHeartRate(101)).toEqual({ level: 'urgent', label: 'Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(120)).toEqual({ level: 'urgent', label: 'Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(130)).toEqual({ level: 'urgent', label: 'Tachycardia', isAbnormal: true });
    });

    test('2.5 Marked Tachycardia (>130)', () => {
      expect(evaluateHeartRate(131)).toEqual({ level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(160)).toEqual({ level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true });
      expect(evaluateHeartRate(220)).toEqual({ level: 'emergency', label: 'Marked Tachycardia', isAbnormal: true });
    });

    test('2.6 Missing and zero heart rate', () => {
      expect(evaluateHeartRate(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateHeartRate(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateHeartRate(null as any)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  // =========================================================================
  // 3. evaluateRespiratoryRate Stress Testing
  // =========================================================================
  describe('3. evaluateRespiratoryRate Edge & Threshold Testing', () => {
    test('3.1 Extreme Bradypnea (<8)', () => {
      expect(evaluateRespiratoryRate(7)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(4)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(1)).toEqual({ level: 'emergency', label: 'Severe Bradypnea', isAbnormal: true });
    });

    test('3.2 Bradypnea (<12 and >=8)', () => {
      expect(evaluateRespiratoryRate(8)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(10)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(11)).toEqual({ level: 'urgent', label: 'Bradypnea', isAbnormal: true });
    });

    test('3.3 Normal Respiratory Rate (12 to 20 inclusive)', () => {
      expect(evaluateRespiratoryRate(12)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(16)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateRespiratoryRate(20)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('3.4 Tachypnea (>20 and <=28)', () => {
      expect(evaluateRespiratoryRate(21)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(25)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(28)).toEqual({ level: 'urgent', label: 'Tachypnea', isAbnormal: true });
    });

    test('3.5 Severe Tachypnea (>28)', () => {
      expect(evaluateRespiratoryRate(29)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(36)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
      expect(evaluateRespiratoryRate(50)).toEqual({ level: 'emergency', label: 'Severe Tachypnea', isAbnormal: true });
    });

    test('3.6 Missing and zero respiratory rate', () => {
      expect(evaluateRespiratoryRate(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateRespiratoryRate(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateRespiratoryRate(null as any)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  // =========================================================================
  // 4. evaluateTemperature Stress Testing
  // =========================================================================
  describe('4. evaluateTemperature Edge & Threshold Testing', () => {
    test('4.1 Hypothermia (<35.5 °C)', () => {
      expect(evaluateTemperature(35.4)).toEqual({ level: 'urgent', label: 'Hypothermia', isAbnormal: true });
      expect(evaluateTemperature(34.0)).toEqual({ level: 'urgent', label: 'Hypothermia', isAbnormal: true });
      expect(evaluateTemperature(30.0)).toEqual({ level: 'urgent', label: 'Hypothermia', isAbnormal: true });
    });

    test('4.2 Normal Temperature (35.5 to 37.5 °C)', () => {
      expect(evaluateTemperature(35.5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateTemperature(36.5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateTemperature(37.5)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('4.3 Pyrexia / Low-grade fever (>=37.6 and <38.5 °C)', () => {
      expect(evaluateTemperature(37.6)).toEqual({ level: 'warning', label: 'Pyrexia', isAbnormal: true });
      expect(evaluateTemperature(38.0)).toEqual({ level: 'warning', label: 'Pyrexia', isAbnormal: true });
      expect(evaluateTemperature(38.4)).toEqual({ level: 'warning', label: 'Pyrexia', isAbnormal: true });
    });

    test('4.4 High Fever (>=38.5 °C)', () => {
      expect(evaluateTemperature(38.5)).toEqual({ level: 'emergency', label: 'High Fever', isAbnormal: true });
      expect(evaluateTemperature(39.2)).toEqual({ level: 'emergency', label: 'High Fever', isAbnormal: true });
      expect(evaluateTemperature(41.0)).toEqual({ level: 'emergency', label: 'High Fever', isAbnormal: true });
    });

    test('4.5 Missing and zero temperature', () => {
      expect(evaluateTemperature(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateTemperature(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateTemperature(null as any)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  // =========================================================================
  // 5. evaluateOxygenSat Stress Testing
  // =========================================================================
  describe('5. evaluateOxygenSat Edge & Threshold Testing', () => {
    test('5.1 Severe Hypoxia (<=90 %)', () => {
      expect(evaluateOxygenSat(90)).toEqual({ level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(88)).toEqual({ level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(70)).toEqual({ level: 'emergency', label: 'Severe Hypoxia', isAbnormal: true });
    });

    test('5.2 Mild Hypoxia (91 to 94 %)', () => {
      expect(evaluateOxygenSat(91)).toEqual({ level: 'warning', label: 'Mild Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(93)).toEqual({ level: 'warning', label: 'Mild Hypoxia', isAbnormal: true });
      expect(evaluateOxygenSat(94)).toEqual({ level: 'warning', label: 'Mild Hypoxia', isAbnormal: true });
    });

    test('5.3 Normal Oxygen Saturation (>94 %)', () => {
      expect(evaluateOxygenSat(95)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateOxygenSat(98)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
      expect(evaluateOxygenSat(100)).toEqual({ level: 'routine', label: 'Normal', isAbnormal: false });
    });

    test('5.4 Missing and zero SpO2', () => {
      expect(evaluateOxygenSat(undefined)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateOxygenSat(0)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
      expect(evaluateOxygenSat(null as any)).toEqual({ level: 'routine', label: '—', isAbnormal: false });
    });
  });

  // =========================================================================
  // 6. evaluateZScoreCategory & Pediatric Anthropometrics
  // =========================================================================
  describe('6. evaluateZScoreCategory & WHO Pediatric Strata', () => {
    test('6.1 Emergency strata (SAM, Severely Wasted, Obese)', () => {
      expect(evaluateZScoreCategory('Severely Wasted (SAM)')).toBe('emergency');
      expect(evaluateZScoreCategory('Severely Wasted')).toBe('emergency');
      expect(evaluateZScoreCategory('Severely Stunted')).toBe('emergency');
      expect(evaluateZScoreCategory('Severely Underweight')).toBe('emergency');
      expect(evaluateZScoreCategory('Obese')).toBe('emergency');
      expect(evaluateZScoreCategory('SAM')).toBe('emergency');
    });

    test('6.2 Urgent strata (MAM, Moderately Wasted, Overweight, Stunted, Wasted)', () => {
      expect(evaluateZScoreCategory('Moderately Wasted (MAM)')).toBe('urgent');
      expect(evaluateZScoreCategory('Moderately Wasted')).toBe('urgent');
      expect(evaluateZScoreCategory('MAM')).toBe('urgent');
      expect(evaluateZScoreCategory('Overweight')).toBe('urgent');
      expect(evaluateZScoreCategory('Stunted')).toBe('urgent');
      expect(evaluateZScoreCategory('Wasted')).toBe('urgent');
    });

    test('6.3 Success strata (Normal)', () => {
      expect(evaluateZScoreCategory('Normal')).toBe('success');
      expect(evaluateZScoreCategory('Essentially Normal')).toBe('success');
    });

    test('6.4 Neutral strata for undefined/null/empty', () => {
      expect(evaluateZScoreCategory(undefined)).toBe('neutral');
      expect(evaluateZScoreCategory('')).toBe('neutral');
      expect(evaluateZScoreCategory(null as any)).toBe('neutral');
    });

    test('6.5 Info fallback for unmatched categories', () => {
      expect(evaluateZScoreCategory('Tall')).toBe('info');
      expect(evaluateZScoreCategory('Other Category')).toBe('info');
    });
  });

  // =========================================================================
  // 7. formatPhilHealthPin Masking and Edge Cases
  // =========================================================================
  describe('7. formatPhilHealthPin Masking & Length Validation', () => {
    test('7.1 Standard unhyphenated 12 digits formats to XX-XXXXXXXXX-X', () => {
      expect(formatPhilHealthPin('123456789018')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('010250000010')).toBe('01-025000001-0');
      expect(formatPhilHealthPin('998877665544')).toBe('99-887766554-4');
    });

    test('7.2 Idempotent formatting of already hyphenated 12-digit PIN', () => {
      expect(formatPhilHealthPin('12-345678901-8')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('01-025000001-0')).toBe('01-025000001-0');
    });

    test('7.3 Non-standard or incomplete lengths return input untouched', () => {
      expect(formatPhilHealthPin('12345')).toBe('12345');
      expect(formatPhilHealthPin('12345678901')).toBe('12345678901'); // 11 digits
      expect(formatPhilHealthPin('1234567890123')).toBe('1234567890123'); // 13 digits
    });

    test('7.4 Null, undefined, and empty string handling', () => {
      expect(formatPhilHealthPin('')).toBe('');
      expect(formatPhilHealthPin(undefined)).toBe('');
      expect(formatPhilHealthPin(null as any)).toBe('');
    });

    test('7.5 Formats 12 digits embedded with whitespace or non-digit delimiters', () => {
      expect(formatPhilHealthPin('12 345678901 8')).toBe('12-345678901-8');
      expect(formatPhilHealthPin('12.345678901.8')).toBe('12-345678901-8');
    });
  });

  // =========================================================================
  // 8. High-Urgency Red Alert Logic Stress
  // =========================================================================
  describe('8. Red Alert Logic: Anaphylaxis, Fall Risk, Pregnancy/OB', () => {
    // Helper to extract red alerts from PatientSummarySpine logic
    function extractRedAlerts(params: {
      allergies?: PatientAllergyRecord[] | null;
      patientAllergiesRaw?: string;
      patientAlerts?: string;
      demoAlerts?: string;
      gender?: string;
      chartReproductiveApplicable?: boolean;
      reproductiveHistory?: {
        isApplicable?: boolean;
        isMenopausal?: boolean;
        menopauseAge?: number;
        remarks?: string;
      } | null;
      problems?: PatientProblemRecord[] | null;
    }) {
      const alerts: { title: string; subtitle?: string; icon: string }[] = [];
      const structured = params.allergies || [];
      const severeAllergies = structured.filter(
        (a) => a.isAnaphylactic || a.severity === 'LifeThreatening' || a.severity === 'Severe'
      );

      if (severeAllergies.length > 0) {
        severeAllergies.forEach((a) => {
          alerts.push({
            title: `STAT ALLERGY: ${a.allergen.toUpperCase()}`,
            subtitle: a.reactionManifestation ? `Reaction: ${a.reactionManifestation} (Anaphylaxis Risk)` : 'High Anaphylaxis Risk',
            icon: 'emergency',
          });
        });
      } else {
        const raw = params.patientAllergiesRaw || '';
        if (raw && /anaphylax|severe|penicillin|latex/i.test(raw)) {
          alerts.push({
            title: `ALLERGY ALERT: ${raw}`,
            subtitle: 'Potential severe drug reaction',
            icon: 'emergency',
          });
        }
      }

      const alertsStr = params.demoAlerts || params.patientAlerts || '';
      if (isHighFallRisk(alertsStr)) {
        alerts.push({
          title: 'HIGH FALL RISK',
          subtitle: 'Fall prevention protocol active',
          icon: 'alert',
        });
      }

      const repHistory =
        params.reproductiveHistory !== undefined
          ? params.reproductiveHistory
          : params.chartReproductiveApplicable !== undefined
          ? { isApplicable: params.chartReproductiveApplicable }
          : undefined;

      const isPregnant = evaluatePregnancyStatus({
        gender: params.gender,
        alerts: alertsStr,
        reproductiveHistory: repHistory,
        problems: params.problems,
      });
      if (isPregnant) {
        alerts.push({
          title: 'PREGNANCY / OB ALERT',
          subtitle: 'Maternal care protocol active • Review teratogenic meds',
          icon: 'alert',
        });
      }

      return alerts;
    }

    test('8.1 Distinguishes anaphylactic/severe allergies from mild/moderate allergies', () => {
      const allergiesList: PatientAllergyRecord[] = [
        {
          id: '1',
          clinicId: 'c1',
          patientId: 'p1',
          category: 'Medication',
          allergen: 'Penicillin',
          severity: 'LifeThreatening',
          isAnaphylactic: true,
          reactionManifestation: 'Laryngeal edema, bronchospasm',
          status: 'Active',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          clinicId: 'c1',
          patientId: 'p1',
          category: 'Food',
          allergen: 'Peanuts',
          severity: 'Severe',
          isAnaphylactic: true,
          reactionManifestation: 'Anaphylactic shock',
          status: 'Active',
          createdAt: new Date().toISOString(),
        },
        {
          id: '3',
          clinicId: 'c1',
          patientId: 'p1',
          category: 'Environmental',
          allergen: 'House Dust Mites',
          severity: 'Mild',
          isAnaphylactic: false,
          reactionManifestation: 'Sneezing',
          status: 'Active',
          createdAt: new Date().toISOString(),
        },
      ];

      const alerts = extractRedAlerts({ allergies: allergiesList });
      expect(alerts.length).toBe(2);
      expect(alerts.some((a) => a.title === 'STAT ALLERGY: PENICILLIN')).toBe(true);
      expect(alerts.some((a) => a.title === 'STAT ALLERGY: PEANUTS')).toBe(true);
      // Mild dust mite allergy does NOT emit an alert banner
      expect(alerts.some((a) => a.title.includes('DUST'))).toBe(false);
    });

    test('8.2 Mild and moderate non-anaphylactic allergies produce zero alert banners', () => {
      const benignAllergies: PatientAllergyRecord[] = [
        {
          id: '1',
          clinicId: 'c1',
          patientId: 'p1',
          category: 'Environmental',
          allergen: 'Pollen',
          severity: 'Mild',
          isAnaphylactic: false,
          status: 'Active',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          clinicId: 'c1',
          patientId: 'p1',
          category: 'Food',
          allergen: 'Chocolate',
          severity: 'Moderate',
          isAnaphylactic: false,
          status: 'Active',
          createdAt: new Date().toISOString(),
        },
      ];

      const alerts = extractRedAlerts({ allergies: benignAllergies });
      expect(alerts.length).toBe(0);
    });

    test('8.3 Triggers HIGH FALL RISK when alert string contains fall risk indicators', () => {
      const alerts = extractRedAlerts({ demoAlerts: 'High Fall Risk Protocol Active (Morse Fall Scale: 65)' });
      expect(alerts.length).toBe(1);
      expect(alerts[0].title).toBe('HIGH FALL RISK');
      expect(alerts[0].icon).toBe('alert');
    });

    test('8.4 Pregnancy alert fires when clinical alerts indicate active gestation', () => {
      const alerts = extractRedAlerts({
        gender: 'Female',
        demoAlerts: 'Active Pregnancy (G2P1 28wks gestation)',
      });
      expect(alerts.some((a) => a.title === 'PREGNANCY / OB ALERT')).toBe(true);
    });

    test('8.5 Identifies reproductive history isApplicable precision behavior', () => {
      // Under refined logic, chart.reproductiveHistory.isApplicable alone does NOT flag pregnancy alert
      const alertsWithReproductive = extractRedAlerts({
        gender: 'Female',
        chartReproductiveApplicable: true,
      });
      expect(alertsWithReproductive.some((a) => a.title === 'PREGNANCY / OB ALERT')).toBe(false);

      const alertsWithoutReproductive = extractRedAlerts({
        gender: 'Female',
        chartReproductiveApplicable: false,
      });
      expect(alertsWithoutReproductive.some((a) => a.title === 'PREGNANCY / OB ALERT')).toBe(false);
    });

    test('8.6 Accurately isolates high fall risk from low/no fall risk', () => {
      // Must trigger:
      expect(isHighFallRisk('High Fall Risk')).toBe(true);
      expect(isHighFallRisk('Fall risk: High')).toBe(true);
      expect(isHighFallRisk('Fall risk - High')).toBe(true);
      expect(isHighFallRisk('Morse Fall Scale: 65 (High Risk)')).toBe(true);
      expect(isHighFallRisk('Moderate-high fall risk')).toBe(true);
      expect(isHighFallRisk('No known allergies; High fall risk')).toBe(true);
      expect(isHighFallRisk('Risk of falls: high')).toBe(true);
      expect(isHighFallRisk('Fall risk (high)')).toBe(true);
      expect(isHighFallRisk('Fall risk level: high')).toBe(true);

      // Must NOT trigger:
      expect(isHighFallRisk('Low fall risk')).toBe(false);
      expect(isHighFallRisk('No fall risk')).toBe(false);
      expect(isHighFallRisk('Morse Fall Risk: Low')).toBe(false);
      expect(isHighFallRisk('Fall risk: None')).toBe(false);
      expect(isHighFallRisk('Fall risk: Negative')).toBe(false);
      expect(isHighFallRisk('Fall risk: Moderate')).toBe(false);
      expect(isHighFallRisk('Patient not at high fall risk')).toBe(false);
      expect(isHighFallRisk('Low fall risk, high blood pressure')).toBe(false);
      expect(isHighFallRisk(null)).toBe(false);
      expect(isHighFallRisk('')).toBe(false);
      expect(isHighFallRisk(undefined as any)).toBe(false);
    });
  });

  // =========================================================================
  // 9. Pregnancy Alert Precision & Clinical Criteria (Finding 1)
  // =========================================================================
  describe('9. Pregnancy Alert Precision & Clinical Criteria (evaluatePregnancyStatus & isPregnancyIcd10)', () => {
    test('9.1 isPregnancyIcd10 correctly identifies obstetric and pregnancy ICD-10 codes', () => {
      // Valid pregnancy / supervision codes
      expect(isPregnancyIcd10('Z33')).toBe(true);
      expect(isPregnancyIcd10('Z33.1')).toBe(true);
      expect(isPregnancyIcd10('Z34')).toBe(true);
      expect(isPregnancyIcd10('Z34.0')).toBe(true);
      expect(isPregnancyIcd10('Z34.8')).toBe(true);
      expect(isPregnancyIcd10('Z34.9')).toBe(true);
      expect(isPregnancyIcd10('Z35')).toBe(true);
      expect(isPregnancyIcd10('Z35.9')).toBe(true);
      expect(isPregnancyIcd10('O00')).toBe(true);
      expect(isPregnancyIcd10('O24.4')).toBe(true);
      expect(isPregnancyIcd10('O9A.1')).toBe(true);
      expect(isPregnancyIcd10('O99.8')).toBe(true);

      // Non-pregnancy codes
      expect(isPregnancyIcd10('I10')).toBe(false);
      expect(isPregnancyIcd10('E11.9')).toBe(false);
      expect(isPregnancyIcd10('J45.0')).toBe(false);
      expect(isPregnancyIcd10('K21.9')).toBe(false);
      expect(isPregnancyIcd10('')).toBe(false);
      expect(isPregnancyIcd10(undefined)).toBe(false);
    });

    test('9.2 Scenario 1: Baseline Post-Menarche Female with isApplicable only evaluates to false', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        reproductiveHistory: { isApplicable: true },
      });
      expect(result).toBe(false);
    });

    test('9.3 Scenario 2: Menopausal Female explicitly excludes active pregnancy', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        reproductiveHistory: { isApplicable: true, isMenopausal: true },
      });
      expect(result).toBe(false);
    });

    test('9.4 Scenario 3: Elderly Menopausal by recorded Menopause Age excludes active pregnancy', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        reproductiveHistory: { menopauseAge: 51 },
      });
      expect(result).toBe(false);
    });

    test('9.5 Scenario 4: Explicitly Negative Pregnancy in Alerts excludes active pregnancy', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        alerts: 'Pregnancy test: negative',
      });
      expect(result).toBe(false);
    });

    test('9.6 Scenario 5: Explicitly Negative Pregnancy in Remarks excludes active pregnancy', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        reproductiveHistory: { remarks: 'Patient confirmed not pregnant' },
      });
      expect(result).toBe(false);
    });

    test('9.7 Scenario 6: Male Patient with Misplaced Alert unconditionally excludes active pregnancy', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Male',
        alerts: 'Pregnancy protocol',
      });
      expect(result).toBe(false);
    });

    test('9.8 Scenario 7: Active Pregnancy via Alerts triggers alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        alerts: 'Active Pregnancy (G2P1 28wks gestation)',
      });
      expect(result).toBe(true);
    });

    test('9.9 Scenario 8: Active Pregnancy via Remarks triggers alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        reproductiveHistory: { remarks: 'Confirmed intrauterine pregnancy, EDD Dec 2026' },
      });
      expect(result).toBe(true);
    });

    test('9.10 Scenario 9: Active Pregnancy via ICD-10 Z34.0 triggers alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        problems: [
          {
            id: 'p1',
            clinicId: 'c1',
            patientId: 'pt1',
            icd10Code: 'Z34.0',
            problemTitle: 'Supervision of normal first pregnancy',
            status: 'Active',
            severity: 'Mild',
            isChronicNcd: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      expect(result).toBe(true);
    });

    test('9.11 Scenario 10: Active Pregnancy via ICD-10 Z33.1 triggers alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        problems: [
          {
            id: 'p2',
            clinicId: 'c1',
            patientId: 'pt1',
            icd10Code: 'Z33.1',
            problemTitle: 'Pregnant state, incidental',
            status: 'Active',
            severity: 'Mild',
            isChronicNcd: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      expect(result).toBe(true);
    });

    test('9.12 Scenario 11: Active Pregnancy via ICD-10 O24.4 triggers alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        problems: [
          {
            id: 'p3',
            clinicId: 'c1',
            patientId: 'pt1',
            icd10Code: 'O24.4',
            problemTitle: 'Gestational diabetes mellitus',
            status: 'Active',
            severity: 'Moderate',
            isChronicNcd: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      expect(result).toBe(true);
    });

    test('9.13 Scenario 12: Resolved Pregnancy Problem does NOT trigger alert', () => {
      const result = evaluatePregnancyStatus({
        gender: 'Female',
        problems: [
          {
            id: 'p4',
            clinicId: 'c1',
            patientId: 'pt1',
            icd10Code: 'O24.4',
            problemTitle: 'Gestational diabetes mellitus in prior pregnancy',
            status: 'Resolved',
            severity: 'Moderate',
            isChronicNcd: false,
            createdAt: new Date().toISOString(),
          },
        ],
      });
      expect(result).toBe(false);
    });
  });

  // =========================================================================
  // 10. Clinical Safety Alert Engines (Limb, Seizure, Combative, Mobility)
  // =========================================================================
  describe('10. Clinical Safety Alert Evaluators', () => {
    test('10.1 isLimbAlert detects Left Arm, Right Arm, Limb Alert, and No BP/IV', () => {
      expect(isLimbAlert(null)).toBe(false);
      expect(isLimbAlert('')).toBe(false);
      expect(isLimbAlert('High Fall Risk')).toBe(false);
      expect(isLimbAlert('Left Arm Alert (No BP/IV)')).toBe(true);
      expect(isLimbAlert('Right Arm Alert (No BP/IV)')).toBe(true);
      expect(isLimbAlert('Patient has limb alert on left side')).toBe(true);
      expect(isLimbAlert('Strict no BP or IV on right arm')).toBe(true);
      expect(isLimbAlert('No BP/IV left arm')).toBe(true);
    });

    test('10.2 isSeizurePrecautions detects seizure precautions', () => {
      expect(isSeizurePrecautions(null)).toBe(false);
      expect(isSeizurePrecautions('')).toBe(false);
      expect(isSeizurePrecautions('High Fall Risk')).toBe(false);
      expect(isSeizurePrecautions('Seizure Precautions')).toBe(true);
      expect(isSeizurePrecautions('seizure precaution in effect')).toBe(true);
    });

    test('10.3 isCombativeRisk detects combative or aggressive behavior risk', () => {
      expect(isCombativeRisk(null)).toBe(false);
      expect(isCombativeRisk('')).toBe(false);
      expect(isCombativeRisk('High Fall Risk')).toBe(false);
      expect(isCombativeRisk('Combative Risk')).toBe(true);
      expect(isCombativeRisk('Combative / Aggressive Risk')).toBe(true);
      expect(isCombativeRisk('Patient has aggressive risk when agitated')).toBe(true);
    });

    test('10.4 isMobilityAssist detects wheelchair and mobility assist', () => {
      expect(isMobilityAssist(null)).toBe(false);
      expect(isMobilityAssist('')).toBe(false);
      expect(isMobilityAssist('High Fall Risk')).toBe(false);
      expect(isMobilityAssist('Wheelchair / Mobility Assist')).toBe(true);
      expect(isMobilityAssist('Requires wheelchair')).toBe(true);
      expect(isMobilityAssist('Mobility assistance needed')).toBe(true);
    });
  });

  describe('11. Vitals Action Button Deduplication & Refresh Icon Spin Behavior', () => {
    test('11.1 PatientSummarySpine renders strictly 1 "Record Vitals" button when no vitals exist', () => {
      const basePatient = {
        id: 'p-1',
        clinicId: 'c-1',
        tenantId: 't-1',
        patientCode: 'CE-2026-0001',
        fullName: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        age: 35,
        contactNumber: '09171234567',
        dateOfBirth: '1991-01-01',
        gender: 'Male',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: basePatient,
          chart: null,
          vitals: null,
          loading: false,
          onPressRecordVitals: () => {},
          onPressRefresh: () => {},
        })
      );

      // Exactly 1 Pressable button with accessibilitylabel="Record Vitals"
      const buttonMatches = spineMarkup.match(/accessibilitylabel="Record Vitals"/gi) || [];
      expect(buttonMatches.length).toBe(1);
      // Visible string appears once as accessibilityLabel and once as text inside the single button
      const recordVitalsMatches = spineMarkup.match(/Record Vitals/g) || [];
      expect(recordVitalsMatches.length).toBe(2);
      expect(spineMarkup).toContain('No triage vitals recorded for today.');
    });

    test('11.2 PatientSummarySpine renders strictly 1 "Update Vitals" button when vitals exist', () => {
      const basePatient = {
        id: 'p-1',
        clinicId: 'c-1',
        tenantId: 't-1',
        patientCode: 'CE-2026-0001',
        fullName: 'Juan Dela Cruz',
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        age: 35,
        contactNumber: '09171234567',
        dateOfBirth: '1991-01-01',
        gender: 'Male',
        createdAt: '2026-01-01T00:00:00Z',
      };

      const spineMarkup = renderToStaticMarkup(
        React.createElement(PatientSummarySpine, {
          variant: 'workstation',
          patient: basePatient,
          chart: null,
          vitals: {
            id: 'v-1',
            queueItemId: 'q-1',
            systolicBp: 120,
            diastolicBp: 80,
            recordedAt: '2026-10-26T08:00:00Z',
          } as any,
          loading: false,
          onPressRecordVitals: () => {},
          onPressRefresh: () => {},
        })
      );

      const buttonMatches = spineMarkup.match(/accessibilitylabel="Update Vitals"/gi) || [];
      expect(buttonMatches.length).toBe(1);
      const updateVitalsMatches = spineMarkup.match(/Update Vitals/g) || [];
      expect(updateVitalsMatches.length).toBe(2);
      const recordVitalsMatches = spineMarkup.match(/Record Vitals/g) || [];
      expect(recordVitalsMatches.length).toBe(0);
    });
  });
});
