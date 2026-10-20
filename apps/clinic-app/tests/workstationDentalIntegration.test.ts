// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
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
    get: () => ({ width: 1440, height: 900 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1440, height: 900 }),
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
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    spring: () => ({ start: (cb?: any) => cb?.() }),
    sequence: () => ({ start: (cb?: any) => cb?.() }),
    parallel: () => ({ start: (cb?: any) => cb?.() }),
    decay: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Alert: { alert: () => {} },
  PixelRatio: {
    get: () => 1,
    getFontScale: () => 1,
    getPixelSizeForLayoutSize: (size: number) => size,
    roundToNearestPixel: (size: number) => size,
  },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polygon: 'Polygon',
  G: 'G',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    goBack: () => {},
    setOptions: () => {},
    addListener: () => () => {},
  }),
  useRoute: () => ({ params: {} }),
  useIsFocused: () => true,
}));

mock.module('../hooks/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isCompact: false,
    isMedium: false,
    isExpanded: true,
    breakpoint: 'desktop',
  }),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1440,
    height: 900,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: true,
  }),
}));

const defaultMockClinicContext = {
  facilityName: 'ClinicEZ Test Center',
  accreditationNumber: 'ACC-12345',
  taxIdentificationNumber: '123-456-789',
  planTier: 'Enterprise',
  preferredChartLayout: 'modal',
  settings: {
    enableDentalModule: true,
    specialtyMode: 'Dental',
  },
  rooms: [
    { id: 'room-1', name: 'Dental Chair 1', type: 'Treatment', isActive: true },
    { id: 'room-2', name: 'Dental Chair 2', type: 'Treatment', isActive: true },
  ],
};

mock.module('../context/StaffContext', () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      current: { id: 'staff-1', name: 'Dr. Jane Dela Cruz', role: 'Doctor' },
      staff: [],
      reload: () => {},
    },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim() || 'Staff',
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));

const { default: CenteredModalChartLayout } = await import('../components/chart/layouts/CenteredModalChartLayout');
const { default: SlideOverDrawerChartLayout } = await import('../components/chart/layouts/SlideOverDrawerChartLayout');
const { default: SplitPaneChartLayout } = await import('../components/chart/layouts/SplitPaneChartLayout');
const { default: EncountersTimelineTab } = await import('../components/chart/EncountersTimelineTab');
const {
  normalizeTeethToMultiRecord,
  calculateDmftMetrics,
} = await import('../components/dental');
import type { DentalToothRecord } from '../components/dental';
import type { ClinicPatient, PatientChart, ConsultationRecord } from '../services/clinicService';

const mockPatient: ClinicPatient = {
  id: 'pat-integration-1',
  clinicId: 'clinic-1',
  patientCode: 'PAT-DENT-001',
  fullName: 'Jose Rizal',
  firstName: 'Jose',
  lastName: 'Rizal',
  gender: 'Male',
  dateOfBirth: '1990-06-19',
  bloodType: 'O+',
  isVerified: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockChart: PatientChart = {
  patientId: 'pat-integration-1',
  patientName: 'Jose Rizal',
  totalVisits: 3,
  allergies: [],
  vitalsHistory: [],
  consultations: [],
  dentalTeeth: [
    {
      id: 'dt-1',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      patientId: 'pat-integration-1',
      toothNumber: 16,
      status: 'Decay' as any,
      surface: 'MD',
      notes: 'Mesial decay',
      createdAt: '2026-10-20T00:00:00Z',
    },
  ],
};

describe('Milestone 4: Workstation Layout & Longitudinal Dental Sync Integration Suite', () => {
  beforeEach(() => {
    (globalThis as any).__mockClinicContext = defaultMockClinicContext;
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
  // =========================================================================
  // 1. Full-Width Responsive Workstation Layout (R4)
  // =========================================================================
  describe('1. Full-Width Responsive Workstation Layout (R4)', () => {
    test('1.1 Consultations.screen.tsx content style has no maxWidth or alignSelf constraints', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Find content style block
      const contentBlockMatch = content.match(/content:\s*\{[\s\S]*?\n\s*\},/);
      expect(contentBlockMatch).toBeTruthy();
      const contentBlock = contentBlockMatch![0];

      expect(contentBlock).toContain("width: '100%'");
      expect(contentBlock).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
      expect(contentBlock).not.toContain("alignSelf: 'center'");
    });

    test('1.2 Patients.screen.tsx content style has no maxWidth or alignSelf constraints', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      const contentBlockMatch = content.match(/content:\s*\{[\s\S]*?\n\s*\},/);
      expect(contentBlockMatch).toBeTruthy();
      const contentBlock = contentBlockMatch![0];

      expect(contentBlock).toContain("width: '100%'");
      expect(contentBlock).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
      expect(contentBlock).not.toContain("alignSelf: 'center'");
    });

    test('1.3 Dashboard.screen.tsx content style has no maxWidth or alignSelf constraints', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      const contentBlockMatch = content.match(/content:\s*\{[\s\S]*?\n\s*\},/);
      expect(contentBlockMatch).toBeTruthy();
      const contentBlock = contentBlockMatch![0];

      expect(contentBlock).toContain("width: '100%'");
      expect(contentBlock).not.toContain('maxWidth: theme.sizes.contentMaxWidth');
      expect(contentBlock).not.toContain("alignSelf: 'center'");
    });
  });

  // =========================================================================
  // 2. Generic "Patient Chart" Labeling (R1)
  // =========================================================================
  describe('2. Generic "Patient Chart" Labeling (R1)', () => {
    test('2.1 CenteredModalChartLayout renders "Patient Chart" as visible title', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CenteredModalChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'modal',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });

    test('2.2 SlideOverDrawerChartLayout renders "Patient Chart" as visible title', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SlideOverDrawerChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'drawer',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });

    test('2.3 SplitPaneChartLayout renders "Patient Chart" in workstation header canvas', () => {
      const markup = renderToStaticMarkup(
        React.createElement(SplitPaneChartLayout, {
          patient: mockPatient,
          patientChart: mockChart,
          activeTab: 'summary',
          currentLayout: 'split',
          onTabChange: () => {},
          onClose: () => {},
          onSwitchLayout: () => {},
        })
      );

      expect(markup).toContain('Patient Chart');
      expect(markup).not.toContain('>Medical chart<');
      expect(markup).not.toContain('>Medical Chart<');
    });

    test('2.4 Consultations.screen.tsx CardHeader and mobile view switcher use "Patient Chart"', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('title="Patient Chart"');
      expect(content).not.toContain('title="Patient Medical Chart"');
      expect(content).toContain("label: 'Patient Chart'");
      expect(content).not.toContain("label: 'Patient Medical Chart (7 Tabs)'");
    });
  });

  // =========================================================================
  // 3. Consultation Left-Pane Dental Tab (R1)
  // =========================================================================
  describe('3. Consultation Left-Pane Dental Tab (R1)', () => {
    test('3.1 ChartReviewTab type and CHART_TAB_DESCRIPTIONS include "dental"', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify ChartReviewTab contains 'dental'
      expect(content).toMatch(/type\s+ChartReviewTab\s*=[\s\S]*?'dental'/);

      // Verify description exists
      expect(content).toContain(
        "dental: 'Odontogram findings, tooth condition, surfaces, and dental procedures'"
      );
    });

    test('3.2 renderLongitudinalChartContent conditionally includes Dental tab and dispatches read-only DentalChartTab', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // Verify conditional tab inclusion
      expect(content).toContain("...(isDentalEnabled ? [{ id: 'dental', label: 'Dental', icon: 'medical' }] : [])");

      // Verify DentalChartTab is rendered read-only when activeChartTab === 'dental'
      expect(content).toContain("activeChartTab === 'dental'");
      expect(content).toContain('<DentalChartTab');
      const dentalTabBlockMatch = content.match(/activeChartTab === 'dental' && \([\s\S]*?\/>/);
      expect(dentalTabBlockMatch).toBeTruthy();
      expect(dentalTabBlockMatch![0]).not.toContain('onOrderProcedure=');
      expect(dentalTabBlockMatch![0]).not.toContain('onRemoveCondition=');
    });
  });

  // =========================================================================
  // 4. Read-Only Left-Pane History Until Encounter Signing Sync (R1)
  // =========================================================================
  describe('4. Read-Only Left-Pane History Until Encounter Signing Sync (R1)', () => {
    test('4.1 Consultations.screen.tsx keeps left-pane patientChart.dentalTeeth read-only during unsigned encounter and syncs on encounter signing', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      // 1. Verify code structure in Consultations.screen.tsx
      expect(content).toContain('normalizeTeethToMultiRecord');
      expect(content).toContain('handleDentalChartChange');
      expect(content).toContain('syncedTeeth: DentalToothRecord[]');
      expect(content).toContain('dentalTeeth: syncedTeeth');
      expect(content).toContain('onChange={handleDentalChartChange}');
      expect(content).toContain('refreshPatientChart(selectedPatient.patientId)');

      // Verify handleDentalChartChange only updates right-side dentalChart state while unsigned
      const handlerMatch = content.match(/const handleDentalChartChange = useCallback\([\s\S]*?\n  \}, \[\]\);/);
      expect(handlerMatch).toBeTruthy();
      expect(handlerMatch![0]).toContain('setDentalChart(nextChart as any)');
      expect(handlerMatch![0]).not.toContain('setPatientChart');

      // 2. Functional execution: Left-pane patientChart.dentalTeeth stays historical while unsigned, then updates on sign
      const historicalTeeth: DentalToothRecord[] = [
        {
          id: 'rec-16-filled',
          tenantId: 'tenant-1',
          clinicId: 'clinic-1',
          patientId: 'pat-integration-1',
          toothNumber: 16,
          status: 'Filled',
          surface: 'O',
          notes: 'Existing composite',
          createdAt: '2026-10-18T10:00:00Z',
          recordedBy: 'Dr. Jane Dela Cruz',
        },
      ];

      const emittedMultiFromInlineDentalChart: Record<number, DentalToothRecord[]> = {
        16: [
          {
            id: 'rec-16-filled',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            patientId: 'pat-integration-1',
            toothNumber: 16,
            status: 'Filled',
            surface: 'O',
            notes: 'Existing composite',
            createdAt: '2026-10-18T10:00:00Z',
            recordedBy: 'Dr. Jane Dela Cruz',
          },
          {
            id: 'rec-16-decay',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            patientId: 'pat-integration-1',
            toothNumber: 16,
            status: 'Decay',
            surface: 'MD',
            notes: 'Recurrent marginal caries',
            createdAt: '2026-10-20T10:00:00Z',
            recordedBy: 'Dr. Jane Dela Cruz',
          },
        ],
        18: [
          {
            id: 'rec-18-decay',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            patientId: 'pat-integration-1',
            toothNumber: 18,
            status: 'Decay',
            surface: 'O',
            notes: 'Deep occlusal pit decay',
            createdAt: '2026-10-20T10:00:00Z',
            recordedBy: 'Dr. Jane Dela Cruz',
          },
        ],
      };

      let patientChartState: any = {
        patientId: 'pat-integration-1',
        dentalTeeth: [...historicalTeeth],
      };
      let dentalChartState: any = {};

      const selectedPatient = { patientId: 'pat-integration-1' };
      const patientRecord = { id: 'pat-integration-1', tenantId: 'tenant-1', clinicId: 'clinic-1' };
      const settings = { tenantId: 'tenant-1', clinicId: 'clinic-1' };

      // Step A: Unsigned encounter edits only update right-side dentalChartState
      const handleDentalChartChange = (nextChart: Record<number, any>) => {
        dentalChartState = nextChart;
      };

      handleDentalChartChange(emittedMultiFromInlineDentalChart);

      // Left-side patientChartState.dentalTeeth MUST remain the historical read-only snapshot before signing!
      expect(patientChartState.dentalTeeth.length).toBe(1);
      expect(patientChartState.dentalTeeth[0].id).toBe('rec-16-filled');

      // Step B: Doctor signs the encounter -> synchronizes patientChartState.dentalTeeth
      const syncOnEncounterSign = () => {
        const targetPatientId = selectedPatient?.patientId || patientRecord?.id || '';
        const multiMap = normalizeTeethToMultiRecord(dentalChartState as any);
        const syncedTeeth: DentalToothRecord[] = Object.values(multiMap).flat().map((rec) => ({
          ...rec,
          tenantId: rec.tenantId || settings?.tenantId || (patientRecord as any)?.tenantId || '',
          clinicId: rec.clinicId || settings?.clinicId || (patientRecord as any)?.clinicId || '',
          patientId: targetPatientId,
          notes: rec.notes || null,
          surface: rec.surface || null,
        }));
        patientChartState = {
          ...patientChartState,
          dentalTeeth: syncedTeeth,
        };
      };

      syncOnEncounterSign();

      // Verify that after signing, patientChartState.dentalTeeth has all 3 records with valid statuses
      expect(patientChartState.dentalTeeth.length).toBe(3);
      expect(patientChartState.dentalTeeth.every((t: any) => t.status !== undefined)).toBe(true);
      expect(patientChartState.dentalTeeth.every((t: any) => t.patientId === 'pat-integration-1')).toBe(true);

      // Verify tooth 16 preserves BOTH conditions
      const tooth16 = patientChartState.dentalTeeth.filter((t: any) => t.toothNumber === 16);
      expect(tooth16.length).toBe(2);
      expect(tooth16.map((r: any) => r.status).sort()).toEqual(['Decay', 'Filled']);
      expect(tooth16.find((r: any) => r.status === 'Decay').surface).toBe('MD');
      expect(tooth16.find((r: any) => r.status === 'Decay').notes).toBe('Recurrent marginal caries');
      expect(tooth16.find((r: any) => r.status === 'Filled').surface).toBe('O');

      // Verify tooth 18
      const tooth18 = patientChartState.dentalTeeth.find((t: any) => t.toothNumber === 18);
      expect(tooth18.status).toBe('Decay');
      expect(tooth18.surface).toBe('O');
      expect(tooth18.notes).toBe('Deep occlusal pit decay');

      // Verify downstream DentalChartTab normalization does NOT revert to Healthy
      const normalizedForChartTab = normalizeTeethToMultiRecord(patientChartState.dentalTeeth);
      expect(normalizedForChartTab[18][0].status).toBe('Decay');
      expect(normalizedForChartTab[16].length).toBe(2);

      // Verify DMFT calculation metrics
      const dmft = calculateDmftMetrics(normalizedForChartTab);
      expect(dmft.decayedCount).toBe(2);
      expect(dmft.filledCount).toBe(1);
      expect(dmft.dmftScore).toBe(2);

      // Verify encounter signing teethPayload generation
      const teethPayload = Object.values(normalizeTeethToMultiRecord(dentalChartState as any)).flat().map((rec) => ({
        toothNumber: rec.toothNumber,
        status: rec.status,
        surface: rec.surface || undefined,
        notes: rec.notes || undefined,
      }));
      expect(teethPayload.length).toBe(3);
      expect(teethPayload.every((p) => p.status !== undefined)).toBe(true);
      expect(teethPayload.find((p) => p.toothNumber === 18)?.status).toBe('Decay');
    });

    test('4.2 Consultations.screen.tsx refreshPatientChart populates dentalTeeth with dentalChart fallback', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('clinicService.getPatientDentalChart');
      expect(content).toContain('chartData.dentalTeeth = dentalData.teeth');
    });

    test('4.3 Patients.screen.tsx handleOpenChart ensures dentalTeeth fallback populated', () => {
      const filePath = path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).toContain('if (!chartData.dentalTeeth || chartData.dentalTeeth.length === 0)');
      expect(content).toContain('const [dentalData] = await clinicService.getPatientDentalChart(patient.id)');
      expect(content).toContain('chartData.dentalTeeth = dentalData.teeth');
    });
  });

  // =========================================================================
  // 5. Encounters Timeline Dental Summary (R1)
  // =========================================================================
  describe('5. Encounters Timeline Dental Summary (R1)', () => {
    test('5.1 EncountersTimelineTab renders Dental Findings & Procedures summary when dental findings are present', () => {
      const mockEncounterWithDental: ConsultationRecord = {
        id: 'enc-dental-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: 'pat-integration-1',
        patientName: 'Jose Rizal',
        doctorId: 'doc-1',
        doctorName: 'Dr. Maria Santos',
        encounterDate: '2026-10-20T10:00:00Z',
        subjective: 'Toothache on upper right molar',
        objective: 'Deep decay on tooth 16 mesial-distal',
        assessment: 'Dental caries',
        plan: 'Class II Composite Restoration',
        isSigned: true,
        signedAt: '2026-10-20T10:30:00Z',
        diagnoses: [
          {
            id: 'diag-1',
            consultationId: 'enc-dental-1',
            icd10Code: 'K02.1',
            description: 'Caries of dentine',
            isPrimary: true,
          },
        ],
        prescriptions: [],
      };

      // Attach dentalFindings and procedures
      (mockEncounterWithDental as any).dentalFindings = [
        {
          id: 'df-1',
          toothNumber: 16,
          status: 'Decay',
          surface: 'MD',
          notes: 'Cavitated lesion into dentin',
          recordedBy: 'Dr. Maria Santos',
        },
      ];
      (mockEncounterWithDental as any).procedures = [
        {
          id: 'proc-1',
          toothNumber: 16,
          toothSurface: 'MD',
          procedureName: 'Composite Filling (MOD/MD)',
          status: 'Completed',
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          consultations: [mockEncounterWithDental],
        })
      );

      // Section Header
      expect(markup).toContain('DENTAL FINDINGS &amp; PROCEDURES');
      // Tooth badge
      expect(markup).toContain('Tooth #16 (MD) - Decay');
      // Notes
      expect(markup).toContain('Cavitated lesion into dentin');
      // Clinician
      expect(markup).toContain('Dr. Maria Santos');
      // Dental procedure
      expect(markup).toContain('Tooth #16 (MD)');
      expect(markup).toContain('Composite Filling (MOD/MD)');
    });

    test('5.2 EncountersTimelineTab does NOT render Dental Findings section when none exist', () => {
      const mockEncounterClean: ConsultationRecord = {
        id: 'enc-clean-1',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        patientId: 'pat-integration-1',
        patientName: 'Jose Rizal',
        doctorId: 'doc-1',
        doctorName: 'Dr. General MD',
        encounterDate: '2026-10-19T09:00:00Z',
        subjective: 'Routine general medical checkup',
        objective: 'Vitals stable',
        assessment: 'Normal healthy exam',
        plan: 'Follow up in 1 year',
        isSigned: true,
        diagnoses: [],
        prescriptions: [],
      };

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: mockPatient,
          patientId: mockPatient.id,
          consultations: [mockEncounterClean],
        })
      );

      expect(markup).not.toContain('DENTAL FINDINGS &amp; PROCEDURES');
      expect(markup).not.toContain('DENTAL FINDINGS & PROCEDURES');
    });
  });
});
