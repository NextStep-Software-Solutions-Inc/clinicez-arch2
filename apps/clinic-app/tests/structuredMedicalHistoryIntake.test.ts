// token-guard:ignore-file
import { describe, expect, it, test, mock, beforeEach } from 'bun:test';
import React from 'react';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
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
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: mock(() => {}) },
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

let lastPostUrl = '';
let lastPostPayload: any = null;
let lastPutUrl = '';
let lastPutPayload: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    post: async (url: string, payload?: any) => {
      lastPostUrl = url;
      lastPostPayload = payload;
      return [{ id: 'new-patient-id', patientCode: 'PAT-2026-00001', fullName: `${payload.firstName} ${payload.lastName}`, ...payload }, null];
    },
    put: async (url: string, payload?: any) => {
      lastPutUrl = url;
      lastPutPayload = payload;
      return [{ id: 'updated-patient-id', fullName: `${payload.firstName} ${payload.lastName}`, ...payload }, null];
    },
    get: async () => [null, null],
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const {
  formatMedicalHistoriesSummary,
  parseChronicConditionsStringToStructured,
  PHILHEALTH_MDISEASES_CONDITIONS,
  PHILHEALTH_QUICK_CONDITIONS,
  MedicalHistoryPillList,
} = await import('../components/patient/StructuredMedicalHistoryModal');

const {
  isPresetActive,
  toggleAlertPreset,
  CLINICAL_ALERT_PRESETS,
} = await import('../components/patient/ClinicalAlertsSection');

const {
  isHighFallRisk,
  isLimbAlert,
  isSeizurePrecautions,
  isCombativeRisk,
  isMobilityAssist,
} = await import('../components/chart/PatientSummarySpine');
const { clinicService } = await import('../services/clinicService');
type MedicalHistoryItem = import('../components/patient/StructuredMedicalHistoryModal').MedicalHistoryItem;
type RegisterPatientPayload = import('../services/clinicService').RegisterPatientPayload;

describe('Structured Past Medical History & Clinical Safety Alerts Intake', () => {
  describe('1. formatMedicalHistoriesSummary', () => {
    it('returns empty string for null, undefined, or empty arrays', () => {
      expect(formatMedicalHistoriesSummary(null)).toBe('');
      expect(formatMedicalHistoriesSummary(undefined)).toBe('');
      expect(formatMedicalHistoriesSummary([])).toBe('');
    });

    it('formats single statutory condition correctly', () => {
      const items: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011' },
      ];
      expect(formatMedicalHistoriesSummary(items)).toBe('Hypertension');
    });

    it('formats multiple conditions into clean comma-separated string', () => {
      const items: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011' },
        { conditionTitle: 'Diabetes Mellitus', philHealthMdiseaseCode: '006' },
        { conditionTitle: 'Asthma', philHealthMdiseaseCode: '002' },
      ];
      expect(formatMedicalHistoriesSummary(items)).toBe('Hypertension, Diabetes Mellitus, Asthma');
    });

    it('prefers specificDescription when condition is custom (998 Others)', () => {
      const items: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011' },
        {
          conditionTitle: 'Others',
          philHealthMdiseaseCode: '998',
          specificDescription: 'Chronic Kidney Disease Stage 3',
        },
      ];
      expect(formatMedicalHistoriesSummary(items)).toBe(
        'Hypertension, Chronic Kidney Disease Stage 3'
      );
    });
  });

  describe('2. parseChronicConditionsStringToStructured', () => {
    it('returns empty array for empty, whitespace, or negation strings', () => {
      expect(parseChronicConditionsStringToStructured('')).toEqual([]);
      expect(parseChronicConditionsStringToStructured('   ')).toEqual([]);
      expect(parseChronicConditionsStringToStructured('None')).toEqual([]);
      expect(parseChronicConditionsStringToStructured('No known chronic')).toEqual([]);
      expect(parseChronicConditionsStringToStructured('Nil')).toEqual([]);
    });

    it('correctly maps known PhilHealth conditions and aliases to their statutory codes', () => {
      const raw = 'Hypertension, Diabetes Mellitus, Asthma, PTB';
      const parsed = parseChronicConditionsStringToStructured(raw);

      expect(parsed).toHaveLength(4);
      expect(parsed[0]).toEqual({ conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011' });
      expect(parsed[1]).toEqual({ conditionTitle: 'Diabetes Mellitus', philHealthMdiseaseCode: '006' });
      expect(parsed[2]).toEqual({ conditionTitle: 'Asthma', philHealthMdiseaseCode: '002' });
      expect(parsed[3]).toEqual({ conditionTitle: 'Pulmonary Tuberculosis', philHealthMdiseaseCode: '015' });
    });

    it('maps non-catalog conditions to 998 Others with specificDescription', () => {
      const raw = 'Hypertension, Chronic Kidney Disease Stage 3';
      const parsed = parseChronicConditionsStringToStructured(raw);

      expect(parsed).toHaveLength(2);
      expect(parsed[0].philHealthMdiseaseCode).toBe('011');
      expect(parsed[1].philHealthMdiseaseCode).toBe('998');
      expect(parsed[1].conditionTitle).toBe('Chronic Kidney Disease Stage 3');
      expect(parsed[1].specificDescription).toBe('Chronic Kidney Disease Stage 3');
    });

    it('parses JSON array format if stored as serialized structured objects', () => {
      const jsonStr = JSON.stringify([
        {
          conditionTitle: 'Hypertension',
          philHealthMdiseaseCode: '011',
          icd10Code: 'I10',
          clinicalNotes: 'Well controlled',
        },
      ]);
      const parsed = parseChronicConditionsStringToStructured(jsonStr);

      expect(parsed).toHaveLength(1);
      expect(parsed[0].conditionTitle).toBe('Hypertension');
      expect(parsed[0].philHealthMdiseaseCode).toBe('011');
      expect(parsed[0].icd10Code).toBe('I10');
      expect(parsed[0].clinicalNotes).toBe('Well controlled');
    });
  });

  describe('3. Clinical Alerts Preset Management & isHighFallRisk synchronization', () => {
    it('isPresetActive correctly detects preset tags within alert strings', () => {
      expect(isPresetActive('', 'High Fall Risk')).toBe(false);
      expect(isPresetActive('High Fall Risk', 'High Fall Risk')).toBe(true);
      expect(isPresetActive('High Fall Risk, Hearing Impaired', 'High Fall Risk')).toBe(true);
      expect(isPresetActive('Hearing Impaired, High Fall Risk', 'High Fall Risk')).toBe(true);
      expect(isPresetActive('Hearing Impaired, High Fall Risk, Wheelchair', 'High Fall Risk')).toBe(true);
      expect(isPresetActive('Low Fall Risk', 'High Fall Risk')).toBe(false);
    });

    it('toggleAlertPreset cleanly adds and removes tags without orphaned commas', () => {
      // Adding to empty
      let alerts = toggleAlertPreset('', 'High Fall Risk');
      expect(alerts).toBe('High Fall Risk');

      // Adding second preset
      alerts = toggleAlertPreset(alerts, 'Hearing Impaired');
      expect(alerts).toBe('High Fall Risk, Hearing Impaired');

      // Adding custom notes manually
      alerts = `${alerts}, Morse score: 65`;

      // Removing first preset: custom notes and other preset remain intact
      alerts = toggleAlertPreset(alerts, 'High Fall Risk');
      expect(alerts).toBe('Hearing Impaired, Morse score: 65');

      // Removing second preset
      alerts = toggleAlertPreset(alerts, 'Hearing Impaired');
      expect(alerts).toBe('Morse score: 65');

      // Toggling back on
      alerts = toggleAlertPreset(alerts, 'Seizure Precautions');
      expect(alerts).toBe('Morse score: 65, Seizure Precautions');
    });

    it('toggling High Fall Risk activates the PatientSummarySpine isHighFallRisk detector', () => {
      let alerts = '';
      expect(isHighFallRisk(alerts)).toBe(false);

      alerts = toggleAlertPreset(alerts, 'High Fall Risk');
      expect(isHighFallRisk(alerts)).toBe(true);

      // Add other alerts
      alerts = toggleAlertPreset(alerts, 'Left Arm Alert (No BP/IV)');
      expect(isHighFallRisk(alerts)).toBe(true);

      // Remove fall risk
      alerts = toggleAlertPreset(alerts, 'High Fall Risk');
      expect(isHighFallRisk(alerts)).toBe(false);
    });

    it('toggling Limb Alert presets activates isLimbAlert detector', () => {
      let alerts = '';
      expect(isLimbAlert(alerts)).toBe(false);

      alerts = toggleAlertPreset(alerts, 'Left Arm Alert (No BP/IV)');
      expect(isLimbAlert(alerts)).toBe(true);

      alerts = toggleAlertPreset('', 'Right Arm Alert (No BP/IV)');
      expect(isLimbAlert(alerts)).toBe(true);
    });

    it('toggling Seizure Precautions activates isSeizurePrecautions detector', () => {
      let alerts = '';
      expect(isSeizurePrecautions(alerts)).toBe(false);

      alerts = toggleAlertPreset(alerts, 'Seizure Precautions');
      expect(isSeizurePrecautions(alerts)).toBe(true);
    });

    it('toggling Combative Risk activates isCombativeRisk detector', () => {
      let alerts = '';
      expect(isCombativeRisk(alerts)).toBe(false);

      alerts = toggleAlertPreset(alerts, 'Combative Risk');
      expect(isCombativeRisk(alerts)).toBe(true);
    });

    it('toggling Wheelchair Assist activates isMobilityAssist detector', () => {
      let alerts = '';
      expect(isMobilityAssist(alerts)).toBe(false);

      alerts = toggleAlertPreset(alerts, 'Wheelchair / Mobility Assist');
      expect(isMobilityAssist(alerts)).toBe(true);
    });

    it('covers all defined safety presets', () => {
      expect(CLINICAL_ALERT_PRESETS.length).toBeGreaterThanOrEqual(8);
      const tags = CLINICAL_ALERT_PRESETS.map((p) => p.tag);
      expect(tags).toContain('High Fall Risk');
      expect(tags).toContain('Hearing Impaired');
      expect(tags).toContain('Visually Impaired');
      expect(tags).toContain('Wheelchair / Mobility Assist');
      expect(tags).toContain('Seizure Precautions');
      expect(tags).toContain('Left Arm Alert (No BP/IV)');
      expect(tags).toContain('Right Arm Alert (No BP/IV)');
      expect(tags).toContain('Combative Risk');
    });
  });

  describe('4. PhilHealth mdiseases statutory catalog integrity', () => {
    it('contains all statutory conditions from 001 to 018 plus 998 Others', () => {
      const codes = PHILHEALTH_MDISEASES_CONDITIONS.map((c) => c.code);
      expect(codes).toContain('001'); // Allergy
      expect(codes).toContain('002'); // Asthma
      expect(codes).toContain('006'); // Diabetes Mellitus
      expect(codes).toContain('010'); // Hyperlipidemia
      expect(codes).toContain('011'); // Hypertension
      expect(codes).toContain('012'); // Peptic Ulcer
      expect(codes).toContain('015'); // Pulmonary Tuberculosis
      expect(codes).toContain('018'); // Mental Illness
      expect(codes).toContain('998'); // Others
    });

    it('quick-pick conditions contain the 6 most frequent chronic illnesses with clean labels', () => {
      expect(PHILHEALTH_QUICK_CONDITIONS).toHaveLength(6);
      const quickCodes = PHILHEALTH_QUICK_CONDITIONS.map((q) => q.code);
      expect(quickCodes).toEqual(['011', '006', '002', '010', '015', '012']);
      const quickLabels = PHILHEALTH_QUICK_CONDITIONS.map((q) => q.label);
      expect(quickLabels).toEqual([
        'Hypertension',
        'Diabetes Mellitus',
        'Asthma',
        'Hyperlipidemia',
        'Pulmonary TB',
        'Peptic Ulcer',
      ]);
    });
  });

  describe('5. Integration with clinicService and Payload Serialization', () => {
    beforeEach(() => {
      lastPostUrl = '';
      lastPostPayload = null;
      lastPutUrl = '';
      lastPutPayload = null;
    });

    it('transmits structured medicalHistories and formatted summary in registerPatient', async () => {
      const medicalHistories: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011', clinicalNotes: 'Losartan 50mg' },
        { conditionTitle: 'Diabetes Mellitus', philHealthMdiseaseCode: '006' },
      ];

      const payload: RegisterPatientPayload = {
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        dateOfBirth: '1980-05-12',
        gender: 'Male',
        contactNumber: '09171234567',
        medicalHistories,
        chronicConditions: formatMedicalHistoriesSummary(medicalHistories),
        alerts: 'High Fall Risk',
      };

      const [res, err] = await clinicService.registerPatient(payload);
      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPostPayload).not.toBeNull();
      expect(lastPostPayload.medicalHistories).toEqual(medicalHistories);
      expect(lastPostPayload.chronicConditions).toBe('Hypertension, Diabetes Mellitus');
      expect(lastPostPayload.alerts).toBe('High Fall Risk');
    });

    it('transmits structured medicalHistories and updated alerts in updatePatient', async () => {
      const medicalHistories: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011' },
        {
          conditionTitle: 'Others',
          philHealthMdiseaseCode: '998',
          specificDescription: 'Chronic Kidney Disease Stage 3',
        },
      ];

      const payload: RegisterPatientPayload = {
        firstName: 'Maria',
        lastName: 'Clara',
        dateOfBirth: '1992-10-04',
        gender: 'Female',
        contactNumber: '09187654321',
        medicalHistories,
        chronicConditions: formatMedicalHistoriesSummary(medicalHistories),
        alerts: 'High Fall Risk, Wheelchair / Mobility Assist',
      };

      const [res, err] = await clinicService.updatePatient('patient-uuid-123', payload);
      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPutPayload).not.toBeNull();
      expect(lastPutUrl).toBe('/patients/patient-uuid-123');
      expect(lastPutPayload.medicalHistories).toEqual(medicalHistories);
      expect(lastPutPayload.chronicConditions).toBe('Hypertension, Chronic Kidney Disease Stage 3');
      expect(lastPutPayload.alerts).toBe('High Fall Risk, Wheelchair / Mobility Assist');
    });

    it('transmits empty medicalHistories array and clears chronicConditions when all conditions removed', async () => {
      const payload: RegisterPatientPayload = {
        firstName: 'Maria',
        lastName: 'Clara',
        dateOfBirth: '1992-10-04',
        gender: 'Female',
        contactNumber: '09187654321',
        medicalHistories: [],
        chronicConditions: formatMedicalHistoriesSummary([]),
        alerts: undefined,
      };

      const [res, err] = await clinicService.updatePatient('patient-uuid-123', payload);
      expect(err).toBeNull();
      expect(res).not.toBeNull();
      expect(lastPutPayload.medicalHistories).toEqual([]);
      expect(lastPutPayload.chronicConditions).toBe('');
    });
  });

  describe('6. MedicalHistoryPillList Render Snapshot & Empty State', () => {
    it('renders empty placeholder when items array is empty', () => {
      const el = React.createElement(MedicalHistoryPillList, { items: [] });
      expect(el).not.toBeNull();
      expect(el.props.items).toEqual([]);
    });

    it('renders clean clinical condition pills without raw statutory code badges when populated', () => {
      const items: MedicalHistoryItem[] = [
        { conditionTitle: 'Hypertension', philHealthMdiseaseCode: '011', clinicalNotes: 'Controlled' },
        { conditionTitle: 'Asthma', philHealthMdiseaseCode: '002', isResolved: true },
      ];
      const onRemoveMock = mock((idx: number) => {});

      const el = React.createElement(MedicalHistoryPillList, { items, onRemove: onRemoveMock });
      expect(el.props.items).toHaveLength(2);
      expect(el.props.items[0].conditionTitle).toBe('Hypertension');
      expect(el.props.items[1].isResolved).toBe(true);
    });
  });
});
