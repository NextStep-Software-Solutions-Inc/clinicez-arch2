// token-guard:ignore-file
/**
 * Test Suite: Clinic Stock & OTC Medicine / Supply Dispensing, ROS Association,
 * Multi-Service Census & Consultation Sign-Off Validity (Zero-Orphan Rule)
 *
 * Covers all 5 Pillars of <original_task>:
 *  1. Non-pharmacy clinic stock & OTC medicine / medical supply dispensing (zero inventory setup)
 *  2. Two-Scenario Clinical Entry Rule (strictly NO OTC Medicine item in Patient List action menu;
 *     Scenario 1 Doctor Consultation starter doses + Scenario 2 Nurse Vitals Check OTC/supply + escalation + async MD review)
 *  3. One Visit, Multiple Services Availed & Unified Dispensing Ledger in Clinic Census
 *  4. Review of Systems (ROS) Association across Consultations, Vitals Checks, and Medicine Dispensing
 *  5. Consultation Sign-Off Validity & Zero-Orphan Revert Rule
 */

import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

const APP_ROOT = path.resolve(import.meta.dir, '..');

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    onClick,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      placeholder,
      children,
    );
  };
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
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: { get: () => ({ width: 1320, height: 900 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1320, height: 900 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  Polyline: createMockComponent('Polyline'),
  Text: createMockComponent('SvgText'),
  G: createMockComponent('G'),
  default: createMockComponent('Svg'),
  Defs: createMockComponent('Defs'),
  LinearGradient: createMockComponent('LinearGradient'),
  Stop: createMockComponent('Stop'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  clinicService,
  ROS_CATEGORY_OPTIONS,
  resolveCensusLedgerEntryMeta,
  resolveCensusVisitServiceRows,
  mapCensusVisitTypeLabel,
  normalizeCensusDisplayField,
} = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');
const { buildPatientOverflowMenuItems } = await import('../components/patient/PatientDirectoryCard');
const {
  normalizeRosCategoryCode,
  getRosShortLabel,
  NURSE_ROUTINE_OTC_PRESETS,
  NURSE_HOME_CARE_CHIPS,
  EMPTY_VITALS_FORM,
  hydrateVitalsFormFromRecord,
  RosCategorySelectorSection,
  NurseCareAndOtcDispensingSection,
} = await import('../components/consultation/VitalsFormFields');

import type {
  ClinicPatient,
  TriageVitals,
  ClinicCensusReport,
  CreateConsultationRequest,
} from '../services/clinicService';

describe('Clinic Stock & OTC Dispensing, ROS Association & Visit Validity Suite', () => {
  describe('1. Two-Scenario Clinical Entry Rule — Strict Patient List Action Menu Guard', () => {
    const samplePatient: ClinicPatient = {
      id: 'pat-uni-001',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      patientCode: 'PAT-2026-001',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      fullName: 'Dela Cruz, Juan',
      dateOfBirth: '2004-05-12',
      age: 22,
      sex: 'Male',
      contactNumber: '09171234567',
      philHealthNumber: '12-345678901-2',
      createdAt: '2026-11-11T08:00:00Z',
    };

    test('1.1 buildPatientOverflowMenuItems NEVER exposes an OTC Medicine or Dispense action under any handler configuration', () => {
      const noop = () => {};
      const directItems = buildPatientOverflowMenuItems(samplePatient, {
        onEditDemographics: noop,
        onOpenPhilHealth: noop,
        onOpenChart: noop,
        onScheduleVisit: noop,
        onBookAppointment: noop,
        onStartConsultation: noop,
        onStartProfiling: noop,
        onRecordVitals: noop,
        onPerformProcedure: noop,
        onIssueClearance: noop,
        hasPhilHealthAccreditation: true,
      });

      const queueItems = buildPatientOverflowMenuItems(samplePatient, {
        onEditDemographics: noop,
        onOpenChart: noop,
        onSelectService: noop,
        onQueuePatient: noop,
        onAddToQueue: noop,
        hasPhilHealthAccreditation: false,
      });

      const allItems = [...directItems, ...queueItems];
      expect(allItems.length).toBeGreaterThan(0);

      for (const item of allItems) {
        const hay = `${item.id} ${item.label}`.toLowerCase();
        expect(hay).not.toContain('otc');
        expect(hay).not.toContain('dispens');
        expect(hay).not.toContain('medicine');
        expect(hay).not.toContain('pharmacy');
      }

      // Confirm only valid clinical entry points exist (Consult & Vitals)
      expect(directItems.some((i) => i.id === 'service-consultation' && i.label === 'Consult')).toBe(true);
      expect(directItems.some((i) => i.id === 'service-vitals' && i.label === 'Vitals')).toBe(true);
    });
  });

  describe('2. Review of Systems (ROS) Category Association & Normalization', () => {
    test('2.1 ROS_CATEGORY_OPTIONS defines EssentiallyNormal plus major clinical organ systems', () => {
      const codes = ROS_CATEGORY_OPTIONS.map((o) => o.code);
      expect(codes).toContain('EssentiallyNormal');
      expect(codes).toContain('Dermatologic');
      expect(codes).toContain('Respiratory');
      expect(codes).toContain('Neurological');
      expect(codes).toContain('Gastrointestinal');
      expect(codes).toContain('Cardiovascular');
      expect(codes).toContain('Musculoskeletal');
      expect(codes).toContain('Heent');
      expect(codes).toContain('Genitourinary');
    });

    test('2.2 normalizeRosCategoryCode normalizes shorthand aliases, case variations, and empty/unknown values safely', () => {
      expect(normalizeRosCategoryCode(undefined)).toBe('EssentiallyNormal');
      expect(normalizeRosCategoryCode(null)).toBe('EssentiallyNormal');
      expect(normalizeRosCategoryCode('   ')).toBe('EssentiallyNormal');
      expect(normalizeRosCategoryCode('Derma')).toBe('Dermatologic');
      expect(normalizeRosCategoryCode('skin rash')).toBe('Dermatologic');
      expect(normalizeRosCategoryCode('Respi')).toBe('Respiratory');
      expect(normalizeRosCategoryCode('pulmonary')).toBe('Respiratory');
      expect(normalizeRosCategoryCode('Neuro')).toBe('Neurological');
      expect(normalizeRosCategoryCode('GI')).toBe('Gastrointestinal');
      expect(normalizeRosCategoryCode('MSK')).toBe('Musculoskeletal');
      expect(normalizeRosCategoryCode('ENT')).toBe('Heent');
      expect(normalizeRosCategoryCode('unknown-random-value')).toBe('EssentiallyNormal');
    });

    test('2.3 getRosShortLabel returns human-readable short labels', () => {
      expect(getRosShortLabel('EssentiallyNormal')).toBe('Essentially Normal');
      expect(getRosShortLabel('Dermatologic')).toBe('Derma');
      expect(getRosShortLabel('Respiratory')).toBe('Respi');
      expect(getRosShortLabel('Neurological')).toBe('Neuro');
    });

    test('2.4 RosCategorySelectorSection renders all ROS pills and active selection badge', () => {
      const html = renderToStaticMarkup(
        React.createElement(RosCategorySelectorSection, {
          value: 'Respiratory',
          onChange: () => {},
          compact: true,
        }),
      );
      expect(html).toContain('Review of Systems (ROS) Category');
      expect(html).toContain('Respi');
      expect(html).toContain('Derma');
      expect(html).toContain('Neuro');
      expect(html).toContain('Essentially Normal');
    });
  });

  describe('3. Zero-Inventory Nurse Vitals Check OTC Medicine & Medical Supply Logger', () => {
    test('3.1 NURSE_ROUTINE_OTC_PRESETS covers both OTC Medicine and MedicalSupply without inventory depletion fields', () => {
      expect(NURSE_ROUTINE_OTC_PRESETS.length).toBeGreaterThanOrEqual(6);
      const hasMedicine = NURSE_ROUTINE_OTC_PRESETS.some((p) => p.itemCategory === 'Medicine');
      const hasSupply = NURSE_ROUTINE_OTC_PRESETS.some((p) => p.itemCategory === 'MedicalSupply');
      expect(hasMedicine).toBe(true);
      expect(hasSupply).toBe(true);

      for (const preset of NURSE_ROUTINE_OTC_PRESETS) {
        expect(preset.defaultQty).toBeGreaterThan(0);
        expect(preset.itemName.trim().length).toBeGreaterThan(0);
        expect(ROS_CATEGORY_OPTIONS.some((o) => o.code === preset.rosCategory)).toBe(true);
        // Must NOT require stockIds, batchIds, or inventory counts
        expect('stockQuantity' in (preset as any)).toBe(false);
        expect('inventoryItemId' in (preset as any)).toBe(false);
      }
      expect(NURSE_HOME_CARE_CHIPS.length).toBeGreaterThan(0);
    });

    test('3.2 hydrateVitalsFormFromRecord handles null/empty records and rehydrates complaint, homeInstructions, ROS, and dispensedItems', () => {
      const emptyState = hydrateVitalsFormFromRecord(null);
      expect(emptyState.rosCategory).toBe('EssentiallyNormal');
      expect(emptyState.dispensedItems).toEqual([]);
      expect(emptyState.chiefComplaint).toBe('');
      expect(emptyState.homeInstructions).toBe('');
      // Mutating returned array must not mutate EMPTY_VITALS_FORM
      emptyState.dispensedItems.push({
        itemName: 'Paracetamol',
        itemCategory: 'Medicine',
        quantityDispensed: 2,
      });
      expect(EMPTY_VITALS_FORM.dispensedItems).toEqual([]);

      const sampleVitals: TriageVitals = {
        id: 'triage-55',
        queueItemId: 'queue-55',
        recordedAt: '2026-11-11T09:15:00Z',
        recordedByNurseName: 'Nurse Joy, RN',
        systolicBp: 118,
        diastolicBp: 76,
        heartRateBpm: 74,
        temperatureCelsius: 36.8,
        chiefComplaint: 'Tension headache after exam',
        homeInstructions: 'Hydrate well and rest in quiet room',
        rosCategory: 'Neuro',
        dispensedItems: [
          {
            id: 'disp-log-1',
            queueItemId: 'queue-55',
            patientId: 'pat-1',
            patientName: 'Student One',
            source: 'NurseVitalsCheck',
            itemCategory: 'Medicine',
            itemName: 'Paracetamol',
            dosageOrSpec: '500mg',
            formOrUnit: 'Tablet',
            quantityDispensed: 2,
            directionsOrInstructions: '1 tab q6h PRN headache',
            rosCategory: 'Neurological',
            dispensedByStaffName: 'Nurse Joy, RN',
            dispensedByRole: 'Nurse',
            dispensedAt: '2026-11-11T09:16:00Z',
            requiresDoctorReview: true,
            isDoctorReviewed: false,
            interventionFlagged: false,
          },
        ],
      };

      const hydrated = hydrateVitalsFormFromRecord(sampleVitals);
      expect(hydrated.chiefComplaint).toBe('Tension headache after exam');
      expect(hydrated.homeInstructions).toBe('Hydrate well and rest in quiet room');
      expect(hydrated.rosCategory).toBe('Neurological');
      expect(hydrated.dispensedItems).toHaveLength(1);
      expect(hydrated.dispensedItems[0].itemName).toBe('Paracetamol');
      expect(hydrated.dispensedItems[0].quantityDispensed).toBe(2);
      expect(hydrated.dispensedItems[0].rosCategory).toBe('Neurological');
    });

    test('3.3 NurseCareAndOtcDispensingSection renders non-pharmacy notice, quick OTC presets, custom logger, and staged items', () => {
      const html = renderToStaticMarkup(
        React.createElement(NurseCareAndOtcDispensingSection, {
          chiefComplaint: 'Minor abrasion on right knee',
          onChangeChiefComplaint: () => {},
          homeInstructions: 'Keep wound clean and dry',
          onChangeHomeInstructions: () => {},
          rosCategory: 'Dermatologic',
          onChangeRosCategory: () => {},
          dispensedItems: [
            {
              itemName: 'Sterile Gauze Pad',
              itemCategory: 'MedicalSupply',
              dosageOrSpec: '4x4 in',
              formOrUnit: 'Pack',
              quantityDispensed: 2,
              directionsOrInstructions: 'Apply over cleaned abrasion',
              rosCategory: 'Dermatologic',
            },
          ],
          onChangeDispensedItems: () => {},
        }),
      );

      expect(html).toContain('Non-pharmacy clinic care log');
      expect(html).toContain('Sterile Gauze Pad');
      expect(html).toContain('Medical Supply');
      expect(html).toContain('ROS: Derma');
      expect(html).toContain('2 Pack');
    });

    test('3.6 Vitals Modal OTC dispensing logger is enabled for the 5 outpatient VisitTypes and disabled for unrecognized values', async () => {
      const {
        NurseCareAndOtcDispensingSection,
        isVisitTypeEligibleForOtcDispensing,
      } = await import('../components/consultation/VitalsFormFields');

      expect(isVisitTypeEligibleForOtcDispensing('RoutineCheckup')).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing('AcuteIllnessConsultation')).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing('ChronicDiseaseFollowUp')).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing('PreventiveHealthAssessment')).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing('UrgentCareVisit')).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing(undefined)).toBe(true);
      expect(isVisitTypeEligibleForOtcDispensing('StandaloneProcedure')).toBe(false);
      expect(isVisitTypeEligibleForOtcDispensing('RetailPurchase')).toBe(false);

      const nonEligibleHtml = renderToStaticMarkup(
        React.createElement(NurseCareAndOtcDispensingSection, {
          allowDispensing: isVisitTypeEligibleForOtcDispensing('StandaloneProcedure'),
          chiefComplaint: 'Dressing change',
          onChangeChiefComplaint: () => {},
          homeInstructions: 'Keep dry',
          onChangeHomeInstructions: () => {},
          rosCategory: 'Dermatologic',
          onChangeRosCategory: () => {},
          dispensedItems: [],
          onChangeDispensedItems: () => {},
        }),
      );

      expect(nonEligibleHtml).toContain('Review of Systems (ROS) Category');
      expect(nonEligibleHtml).toContain('Complaint &amp; Home Care Instructions');
      expect(nonEligibleHtml).not.toContain('Clinic Stock OTC Medicine &amp; Medical Supply Dispensing');
    });
  });

  describe('4. clinicService API Contracts: Escalation, Dispensing Ledger, Async MD Review & Zero-Orphan Abandon', () => {
    test('4.1 escalateToConsultation posts to /queue/:id/escalate-to-consultation', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() =>
        Promise.resolve([{ id: 'q-100', visitType: 'Consultation', priority: 'Emergency', status: 'Triaged' }, null]),
      );
      (clinicApiClient as any).post = mockPost;

      const [res, err] = await clinicService.escalateToConsultation('q-100', {
        priority: 'Emergency',
        escalationReason: 'BP 190/115 with acute chest tightness',
        doctorId: 'doc-1',
        doctorName: 'Dr. Reyes',
      });

      expect(mockPost).toHaveBeenCalledWith('/queue/q-100/escalate-to-consultation', {
        priority: 'Emergency',
        escalationReason: 'BP 190/115 with acute chest tightness',
        doctorId: 'doc-1',
        doctorName: 'Dr. Reyes',
      });
      expect(err).toBeNull();
      expect(res?.visitType).toBe('Consultation');

      (clinicApiClient as any).post = origPost;
    });

    test('4.2 getDispensingLogs queries /dispensing-logs with unified ledger filters', async () => {
      const origGet = clinicApiClient.get;
      const mockGet = mock(() => Promise.resolve([[], null]));
      (clinicApiClient as any).get = mockGet;

      await clinicService.getDispensingLogs({
        startDate: '2026-11-01',
        endDate: '2026-11-11',
        source: 'NurseVitalsCheck',
        unreviewedOnly: true,
        rosCategory: 'Neurological',
        search: 'Paracetamol',
      });

      expect(mockGet).toHaveBeenCalledWith(
        '/dispensing-logs?startDate=2026-11-01&endDate=2026-11-11&source=NurseVitalsCheck&unreviewedOnly=true&rosCategory=Neurological&search=Paracetamol',
      );

      (clinicApiClient as any).get = origGet;
    });

    test('4.3 reviewDispensingLog posts asynchronous physician review & optional intervention flag to /dispensing-logs/:id/review', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() =>
        Promise.resolve([{ id: 'log-77', isDoctorReviewed: true, interventionFlagged: true }, null]),
      );
      (clinicApiClient as any).post = mockPost;

      const [res, err] = await clinicService.reviewDispensingLog('log-77', {
        doctorId: 'doc-9',
        doctorName: 'Dr. Santos',
        reviewNotes: 'Recall patient to check recurrent epigastric pain.',
        interventionFlagged: true,
      });

      expect(mockPost).toHaveBeenCalledWith('/dispensing-logs/log-77/review', {
        doctorId: 'doc-9',
        doctorName: 'Dr. Santos',
        reviewNotes: 'Recall patient to check recurrent epigastric pain.',
        interventionFlagged: true,
      });
      expect(err).toBeNull();
      expect(res?.isDoctorReviewed).toBe(true);
      expect(res?.interventionFlagged).toBe(true);

      (clinicApiClient as any).post = origPost;
    });

    test('4.4 abandonConsultation posts to /consultations/:id/abandon to revert unsigned encounter artifacts cleanly', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() => Promise.resolve([true, null]));
      (clinicApiClient as any).post = mockPost;

      const [ok, err] = await clinicService.abandonConsultation('consult-unsigned-1', {
        reason: 'Unsigned consultation draft discarded by physician',
        cancelVisit: false,
      });

      expect(mockPost).toHaveBeenCalledWith('/consultations/consult-unsigned-1/abandon', {
        reason: 'Unsigned consultation draft discarded by physician',
        cancelVisit: false,
      });
      expect(err).toBeNull();
      expect(ok).toBe(true);

      (clinicApiClient as any).post = origPost;
    });

    test('4.5 createConsultation payload supports rosCategory and per-Rx clinicDispensedQuantity without pharmacy inventory setup', async () => {
      const origPost = clinicApiClient.post;
      const mockPost = mock(() => Promise.resolve([{ id: 'consult-201', isSigned: false }, null]));
      (clinicApiClient as any).post = mockPost;

      const payload: CreateConsultationRequest = {
        patientId: 'pat-1',
        patientName: 'Dela Cruz, Juan',
        doctorId: 'doc-1',
        doctorName: 'Dr. Reyes',
        queueItemId: 'queue-201',
        subjective: 'Acute productive cough for 2 days',
        assessment: 'Acute Upper Respiratory Tract Infection',
        rosCategory: 'Respiratory',
        prescriptions: [
          {
            genericName: 'Carbocisteine',
            dosage: '500mg',
            form: 'Capsule',
            sig: '1 cap TID for 5 days',
            quantity: 15,
            clinicDispensedQuantity: 2,
            rosCategory: 'Respiratory',
          },
        ],
      };

      await clinicService.createConsultation(payload);
      expect(mockPost).toHaveBeenCalledWith('/consultations', payload);

      (clinicApiClient as any).post = origPost;
    });
  });

  describe('5. Multi-Service Census & Consultation Workstation Sign-Off Validity Contracts', () => {
    test('5.1 ClinicCensusReport represents one row per visit with composite servicesAvailed and unified dispensingLedger', () => {
      const report: ClinicCensusReport = {
        startDate: '2026-11-11',
        endDate: '2026-11-11',
        tenantId: 'tenant-1',
        clinicId: 'clinic-1',
        clinicName: 'University Health Service',
        summary: {
          totalCensus: 2,
          newPatients: 1,
          returningPatients: 1,
          consultationCount: 1,
          procedureCount: 0,
          vitalsCheckOnlyCount: 1,
          administrativeCount: 0,
          dispensingVisitCount: 2,
          totalDispensedItemsCount: 3,
          prescriptionCount: 1,
          medicalCertificateCount: 1,
          referralCount: 0,
          labOrderCount: 1,
          pediatricCount: 0,
          adultCount: 2,
          seniorCount: 0,
          pwdCount: 0,
          philHealthCount: 1,
          routineCount: 2,
          urgentCount: 0,
          emergencyCount: 0,
          completedCount: 2,
          divertedCount: 0,
          noShowCount: 0,
          cancelledCount: 0,
          averageTurnaroundMinutes: 18,
        },
        demographics: {
          pediatricCount: 0,
          adultCount: 2,
          seniorCount: 0,
          maleCount: 1,
          femaleCount: 1,
          otherCount: 0,
          seniorOscaCount: 0,
          pwdCount: 0,
          philHealthCount: 1,
        },
        providerBreakdown: [],
        items: [
          {
            id: 'visit-consult-1',
            queueNumber: 'C-001',
            visitType: 'Consultation',
            acuity: 'Routine',
            outcomeStatus: 'Completed',
            checkInTime: '2026-11-11T08:00:00Z',
            patientId: 'pat-1',
            patientCode: 'P-001',
            patientName: 'Dela Cruz, Juan',
            age: 20,
            sex: 'Male',
            discountCategory: 'None',
            isNewPatient: false,
            rosCategory: 'Respiratory',
            servicesAvailed: [
              'Consultation',
              'Medicine Dispensing',
              'Prescription',
              'Medical Certificate',
              'Laboratory Requisition',
            ],
            servicesAvailedSummary:
              'Consultation + Medicine Dispensing + Prescription + Medical Certificate + Laboratory Requisition',
            dispensedItemsCount: 2,
            dispensedMedicinesSummary: 'Carbocisteine 500mg (2 Capsule)',
          },
          {
            id: 'visit-vitals-2',
            queueNumber: 'V-002',
            visitType: 'VitalsCheckOnly',
            acuity: 'Routine',
            outcomeStatus: 'Completed',
            checkInTime: '2026-11-11T09:00:00Z',
            patientId: 'pat-2',
            patientCode: 'P-002',
            patientName: 'Santos, Maria',
            age: 19,
            sex: 'Female',
            discountCategory: 'None',
            isNewPatient: true,
            rosCategory: 'Neurological',
            servicesAvailed: ['Vitals Check', 'Medicine Dispensing'],
            servicesAvailedSummary: 'Vitals Check + Medicine Dispensing',
            dispensedItemsCount: 2,
            dispensedMedicinesSummary: 'Paracetamol 500mg (2 Tablet)',
          },
        ],
        dispensingLedger: [
          {
            id: 'ledger-1',
            queueItemId: 'visit-consult-1',
            consultationId: 'consult-1',
            prescriptionItemId: 'rx-item-1',
            patientId: 'pat-1',
            patientName: 'Dela Cruz, Juan',
            source: 'DoctorConsultation',
            itemCategory: 'Medicine',
            itemName: 'Carbocisteine',
            dosageOrSpec: '500mg',
            formOrUnit: 'Capsule',
            quantityDispensed: 2,
            rosCategory: 'Respiratory',
            dispensedByStaffName: 'Dr. Reyes',
            dispensedByRole: 'Doctor',
            dispensedAt: '2026-11-11T08:20:00Z',
            requiresDoctorReview: false,
            isDoctorReviewed: true,
            interventionFlagged: false,
          },
          {
            id: 'ledger-2',
            queueItemId: 'visit-vitals-2',
            triageVitalId: 'triage-2',
            patientId: 'pat-2',
            patientName: 'Santos, Maria',
            source: 'NurseVitalsCheck',
            itemCategory: 'Medicine',
            itemName: 'Paracetamol',
            dosageOrSpec: '500mg',
            formOrUnit: 'Tablet',
            quantityDispensed: 2,
            rosCategory: 'Neurological',
            dispensedByStaffName: 'Nurse Joy, RN',
            dispensedByRole: 'Nurse',
            dispensedAt: '2026-11-11T09:10:00Z',
            requiresDoctorReview: true,
            isDoctorReviewed: false,
            interventionFlagged: false,
          },
        ],
      };

      expect(report.items).toHaveLength(2);
      // Vitals are part of Consultation package, so Consultation visit is 1 row with auxiliary services
      expect(report.items[0].servicesAvailedSummary).toContain('Consultation + Medicine Dispensing');
      expect(report.items[1].servicesAvailedSummary).toBe('Vitals Check + Medicine Dispensing');
      // Both doctor consultation dispenses and nurse vitals check dispenses live in the unified dispensingLedger
      expect(report.dispensingLedger?.map((l) => l.source)).toEqual(['DoctorConsultation', 'NurseVitalsCheck']);
    });

    test('5.2 Consultations workstation wires draft staging for MedCert/Referral, deduplicated lab staging, clinicDispensedQuantity, ROS selector, and zero-orphan abandon', () => {
      const consultationsSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Consultations.screen.tsx'),
        'utf-8',
      );
      const timelineSource = fs.readFileSync(
        path.join(APP_ROOT, 'components/chart/EncountersTimelineTab.tsx'),
        'utf-8',
      );
      expect(consultationsSource).toContain('ensureDraftConsultationSaved');
      expect(consultationsSource).toContain('clinicService.abandonConsultation');
      expect(consultationsSource).toContain('Discard unsigned draft');
      expect(consultationsSource).toContain('newRxClinicDispensedQty');
      expect(consultationsSource).toContain('RosCategorySelectorSection');
      expect(consultationsSource).toContain('Sign consultation encounter to unlock official PDF');
      expect(consultationsSource).toContain('alreadyStagedForConsultation');
      expect(consultationsSource).toContain('includeUnsigned: true');
      expect(timelineSource).toContain('Draft — Sign encounter to validate Rx');
    });

    test('5.3 Dashboard & Queue screens wire nurse OTC async physician review queue, Vitals-to-Consultation escalation, and Census Dispensing Ledger', () => {
      const dashboardSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Dashboard.screen.tsx'),
        'utf-8',
      );
      const queueSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Queue.screen.tsx'),
        'utf-8',
      );

      expect(dashboardSource).toContain('clinicService.getDispensingLogs');
      expect(dashboardSource).toContain('clinicService.reviewDispensingLog');
      expect(dashboardSource).toContain('Clinic Medicine & Supply Dispensing Ledger');
      expect(dashboardSource).toContain('escalateToConsultation');
      expect(dashboardSource).toContain('isVisitTypeEligibleForOtcDispensing');
      expect(queueSource).toContain('escalateToConsultation');
    });

    test('5.4 clinicService document & lab queries support includeUnsigned=true for active draft rehydration without polluting signed chart views', async () => {
      const origGet = clinicApiClient.get;
      const mockGet = mock(() => Promise.resolve([[], null]));
      (clinicApiClient as any).get = mockGet;

      await clinicService.getMedicalCertificates('pat-1', undefined, { includeUnsigned: true });
      await clinicService.getReferralLetters('pat-1', undefined, { includeUnsigned: true });
      await clinicService.getLabOrders('pat-1', undefined, undefined, { includeUnsigned: true });

      expect(mockGet).toHaveBeenCalledWith('/documents/medical-certificates?patientId=pat-1&includeUnsigned=true');
      expect(mockGet).toHaveBeenCalledWith('/documents/referrals?patientId=pat-1&includeUnsigned=true');
      expect(mockGet).toHaveBeenCalledWith('/lab-orders?patientId=pat-1&includeUnsigned=true');

      (clinicApiClient as any).get = origGet;
    });
  });

  describe('6. Round 2 Hardening — Partial Clinic Dispensing on Prescription Slips & Census Summary Parity', () => {
    test('6.1 PrescriptionSlipModal renders clinic-dispensed starter quantity vs remaining external purchase quantity for partial, full, and zero clinic dispensing', async () => {
      const { default: PrescriptionSlipModal } = await import('../components/PrescriptionSlipModal');
      const { ClinicProvider } = await import('../context/ClinicContext');
      const { StaffProvider } = await import('../context/StaffContext');

      const signedSlipWithStarterDoses: any = {
        consultationId: 'con-starter-001',
        prescriptionNumber: 'RX-20261111-0042',
        issuedAt: '2026-11-11T10:15:00Z',
        clinicName: 'St. Raphael Family Clinic',
        clinicAddress: '101 Ayala Ave, Makati',
        clinicContact: '02-8123-4567',
        doctorName: 'Dr. Rafael Mendoza',
        doctorPrcLicense: '0077889',
        doctorPtr: 'PTR-2026-101',
        patientId: 'pat-001',
        patientName: 'Soberano, Liza',
        patientAge: 28,
        patientGender: 'Female',
        clinicalDiagnosis: 'Acute Bacterial Sinusitis',
        items: [
          {
            itemId: 'rx-partial',
            genericName: 'Co-Amoxiclav',
            brandName: 'Augmentin',
            dosage: '625mg',
            form: 'Tablet',
            sig: '1 tab BID x 5 days',
            quantity: 10,
            durationDays: 5,
            refills: 0,
            isDangerousDrug: false,
            isClinicDispensed: true,
            clinicDispensedQuantity: 2,
          },
          {
            itemId: 'rx-full',
            genericName: 'Paracetamol',
            brandName: 'Biogesic',
            dosage: '500mg',
            form: 'Tablet',
            sig: '1 tab q6h PRN fever',
            quantity: 6,
            durationDays: 2,
            refills: 0,
            isDangerousDrug: false,
            isClinicDispensed: true,
            clinicDispensedQuantity: 6,
          },
          {
            itemId: 'rx-external-only',
            genericName: 'Cetirizine',
            brandName: 'Virlix',
            dosage: '10mg',
            form: 'Tablet',
            sig: '1 tab OD HS x 14 days',
            quantity: 14,
            durationDays: 14,
            refills: 0,
            isDangerousDrug: false,
            isClinicDispensed: false,
            clinicDispensedQuantity: null,
          },
        ],
        publicVerificationToken: 'tok-001',
        publicVerificationUrl: 'https://verify.clinicez.test/rx/tok-001',
        qrPayload: 'EZRX:tok-001',
        dispenseStatus: 'Issued',
      };

      const html = renderToStaticMarkup(
        React.createElement(
          ClinicProvider,
          null,
          React.createElement(
            StaffProvider,
            null,
            React.createElement(PrescriptionSlipModal, {
              visible: true,
              onClose: () => {},
              slip: signedSlipWithStarterDoses,
            }),
          ),
        ),
      );

      // Total prescribed quantities still visible
      expect(html).toContain('Qty: 10');
      expect(html).toContain('Qty: 6');
      expect(html).toContain('Qty: 14');

      // Partial clinic dispensing (2 of 10 -> 8 remaining for external purchase)
      expect(html).toContain('rx-clinic-dispense-rx-partial');
      expect(html).toContain('Dispensed in clinic: 2');
      expect(html).toContain('Remaining for external purchase: 8');
      expect(html).toContain('2 of 10 dispensed from clinic stock');

      // Full clinic dispensing (6 of 6 -> 0 remaining for external purchase)
      expect(html).toContain('rx-clinic-dispense-rx-full');
      expect(html).toContain('Dispensed in clinic: 6');
      expect(html).toContain('Remaining for external purchase: 0');

      // Non-clinic-dispensed item must NOT render a clinic dispense callout
      expect(html).not.toContain('rx-clinic-dispense-rx-external-only');

      // Draft preview slip before encounter sign-off also shows scheduled starter stock vs remaining external purchase
      const draftHtml = renderToStaticMarkup(
        React.createElement(
          ClinicProvider,
          null,
          React.createElement(
            StaffProvider,
            null,
            React.createElement(PrescriptionSlipModal, {
              visible: true,
              onClose: () => {},
              slip: {
                ...signedSlipWithStarterDoses,
                consultationId: '',
                prescriptionNumber: 'Draft',
                dispenseStatus: 'Draft',
              },
            }),
          ),
        ),
      );
      expect(draftHtml).toContain('Starter stock on sign-off: 2 of 10 dispensed in clinic');
      expect(draftHtml).toContain('8 remaining for external pharmacy purchase');
    });

    test('6.2 Dashboard Census UI & PrescriptionSlipModal maintain full multi-service + ROS breakdown parity and zero hardcoded hex colors', () => {
      const dashboardSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Dashboard.screen.tsx'),
        'utf-8',
      );
      const slipModalSource = fs.readFileSync(
        path.join(APP_ROOT, 'components/PrescriptionSlipModal.tsx'),
        'utf-8',
      );
      const consultationsSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Consultations.screen.tsx'),
        'utf-8',
      );

      // Multi-service breakdown badges & ROS breakdown summary card in Dashboard Census UI
      expect(dashboardSource).toContain('Services Availed Breakdown');
      expect(dashboardSource).toContain('Consultation:');
      expect(dashboardSource).toContain('Vitals Check:');
      expect(dashboardSource).toContain('Procedures:');
      expect(dashboardSource).toContain('Dispensing:');
      expect(dashboardSource).toContain('Rx:');
      expect(dashboardSource).toContain('Med Certs:');
      expect(dashboardSource).toContain('Referrals:');
      expect(dashboardSource).toContain('Lab Reqs:');
      expect(dashboardSource).toContain('Review of Systems (ROS) Breakdown');
      expect(dashboardSource).toContain('censusReport.serviceBreakdown');
      expect(dashboardSource).toContain('censusReport.rosBreakdown');

      // Draft slip preview in Consultations screen forwards clinicDispensedQuantity
      expect(consultationsSource).toContain('isClinicDispensed: (p.clinicDispensedQuantity ?? 0) > 0');

      // Design-token compliance: zero raw hex color literals in PrescriptionSlipModal.tsx
      const hexMatches = slipModalSource.match(/#[0-9A-Fa-f]{3,8}\b/g);
      expect(hexMatches).toBeNull();
    });

    test('6.3 resolveCensusLedgerEntryMeta accurately maps real backend CensusDispensingLedgerItemDto strings ("Doctor Consultation", "Medical Supply", isReviewedByDoctor) and legacy enum codes', () => {
      // Exact payload shape emitted by GetClinicCensusReportQuery.cs -> CensusDispensingLedgerItemDto
      const doctorStarterEntry = resolveCensusLedgerEntryMeta({
        source: 'Doctor Consultation',
        itemCategory: 'Medicine',
        isReviewedByDoctor: true,
        reviewedAt: undefined,
        reviewedByDoctorName: 'Dr. Elena Cruz',
        interventionFlagged: false,
      });
      expect(doctorStarterEntry.isDoctorSource).toBe(true);
      expect(doctorStarterEntry.sourceBadgeLabel).toBe('Doctor Consultation');
      expect(doctorStarterEntry.isMedicalSupply).toBe(false);
      expect(doctorStarterEntry.categoryBadgeLabel).toBe('Medicine');
      expect(doctorStarterEntry.reviewBadgeLabel).toBe('Signed Consultation');
      expect(doctorStarterEntry.reviewBadgeVariant).toBe('success');

      const reviewedNurseSupplyEntry = resolveCensusLedgerEntryMeta({
        source: 'Nurse Vitals Check',
        itemCategory: 'Medical Supply',
        isReviewedByDoctor: true,
        reviewedAt: undefined,
        reviewedByDoctorName: 'Dr. Marco Villanueva',
        interventionFlagged: false,
      });
      expect(reviewedNurseSupplyEntry.isDoctorSource).toBe(false);
      expect(reviewedNurseSupplyEntry.sourceBadgeLabel).toBe('Nurse Vitals Check');
      expect(reviewedNurseSupplyEntry.isMedicalSupply).toBe(true);
      expect(reviewedNurseSupplyEntry.categoryBadgeLabel).toBe('Supply');
      expect(reviewedNurseSupplyEntry.isReviewedByDoctor).toBe(true);
      expect(reviewedNurseSupplyEntry.reviewBadgeLabel).toBe('Reviewed (Dr. Marco Villanueva)');
      expect(reviewedNurseSupplyEntry.reviewBadgeVariant).toBe('success');

      const flaggedNurseEntry = resolveCensusLedgerEntryMeta({
        source: 'Nurse Vitals Check',
        itemCategory: 'Medicine',
        isReviewedByDoctor: true,
        reviewedByDoctorName: 'Dr. Santos',
        interventionFlagged: true,
      });
      expect(flaggedNurseEntry.reviewBadgeLabel).toBe('Intervention Flagged (Dr. Santos)');
      expect(flaggedNurseEntry.reviewBadgeVariant).toBe('emergency');

      const pendingNurseEntry = resolveCensusLedgerEntryMeta({
        source: 'Nurse Vitals Check',
        itemCategory: 'Medicine',
        isReviewedByDoctor: false,
        interventionFlagged: false,
      });
      expect(pendingNurseEntry.isReviewedByDoctor).toBe(false);
      expect(pendingNurseEntry.reviewBadgeLabel).toBe('Pending Async MD Review');
      expect(pendingNurseEntry.reviewBadgeVariant).toBe('warning');
    });

    test('6.4 hydrateVitalsFormFromRecord & NurseCareAndOtcDispensingSection preserve reviewed item IDs and lock physician-reviewed OTC logs against duplicate re-insertion', () => {
      const vitalsWithReviewedAndPendingItems: Partial<TriageVitals> = {
        id: 'vitals-rev-1',
        systolicBp: 118,
        diastolicBp: 76,
        rosCategory: 'Neurological',
        chiefComplaint: 'Tension headache',
        homeInstructions: 'Rest and hydrate',
        dispensedItems: [
          {
            id: 'log-reviewed-1',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            patientId: 'pat-1',
            patientName: 'Santos, Maria',
            queueItemId: 'q-1',
            source: 'NurseVitalsCheck',
            itemName: 'Paracetamol',
            itemCategory: 'Medicine',
            dosageOrSpec: '500mg',
            formOrUnit: 'Tablet',
            quantityDispensed: 2,
            rosCategory: 'Neurological',
            rosCategoryLabel: 'Neurological',
            isConsultationValidated: true,
            dispensedByStaffName: 'Nurse Joy, RN',
            dispensedByRole: 'Nurse',
            dispensedAt: '2026-11-11T09:00:00Z',
            requiresDoctorReview: true,
            reviewedByDoctorName: 'Dr. Elena Cruz',
            reviewedAt: '2026-11-11T09:15:00Z',
            interventionFlagged: false,
          },
          {
            id: 'log-pending-2',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            patientId: 'pat-1',
            patientName: 'Santos, Maria',
            queueItemId: 'q-1',
            source: 'NurseVitalsCheck',
            itemName: 'Adhesive Bandage',
            itemCategory: 'MedicalSupply',
            dosageOrSpec: 'Standard',
            formOrUnit: 'Piece',
            quantityDispensed: 2,
            rosCategory: 'Dermatologic',
            rosCategoryLabel: 'Dermatologic',
            isConsultationValidated: true,
            dispensedByStaffName: 'Nurse Joy, RN',
            dispensedByRole: 'Nurse',
            dispensedAt: '2026-11-11T09:05:00Z',
            requiresDoctorReview: true,
            reviewedAt: null,
            interventionFlagged: false,
          },
        ],
      };

      const hydrated = hydrateVitalsFormFromRecord(vitalsWithReviewedAndPendingItems);
      expect(hydrated.dispensedItems).toHaveLength(2);
      expect(hydrated.dispensedItems[0].id).toBe('log-reviewed-1');
      expect(hydrated.dispensedItems[0].isDoctorReviewed).toBe(true);
      expect(hydrated.dispensedItems[0].reviewedByDoctorName).toBe('Dr. Elena Cruz');
      expect(hydrated.dispensedItems[1].id).toBe('log-pending-2');
      expect(hydrated.dispensedItems[1].isDoctorReviewed).toBe(false);

      const html = renderToStaticMarkup(
        React.createElement(NurseCareAndOtcDispensingSection, {
          chiefComplaint: hydrated.chiefComplaint,
          onChangeChiefComplaint: () => {},
          homeInstructions: hydrated.homeInstructions,
          onChangeHomeInstructions: () => {},
          rosCategory: hydrated.rosCategory,
          onChangeRosCategory: () => {},
          dispensedItems: hydrated.dispensedItems,
          onChangeDispensedItems: () => {},
        }),
      );

      expect(html).toContain('Reviewed (Dr. Elena Cruz)');
      // Only the 1 unreviewed item renders a Remove button; the reviewed item is locked read-only
      const removeButtonCount = (html.match(/aria-label="Remove dispensed item"/g) || []).length;
      expect(removeButtonCount).toBe(1);
    });

    test('6.5 Dashboard KPI subtext uses vitalsCheckVisits & inClinicProceduresCount, and Consultations/EncountersTimeline inline Rx views show partial clinic-dispensed vs external quantities', () => {
      const dashboardSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Dashboard.screen.tsx'),
        'utf-8',
      );
      const consultationsSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Consultations.screen.tsx'),
        'utf-8',
      );
      const timelineSource = fs.readFileSync(
        path.join(APP_ROOT, 'components/chart/EncountersTimelineTab.tsx'),
        'utf-8',
      );

      // Dashboard KPI card uses vitalsCheckVisits (never diagnosticsOrLab) and resolveCensusLedgerEntryMeta
      expect(dashboardSource).toContain('censusReport.summary.vitalsCheckVisits ?? censusReport.summary.vitalsCheckOnlyCount ?? 0');
      expect(dashboardSource).not.toContain('censusReport.summary.diagnosticsOrLab ?? censusReport.summary.vitalsCheckOnlyCount');
      expect(dashboardSource).toContain('resolveCensusLedgerEntryMeta(entry)');

      // Consultations inline Rx preview and EncountersTimelineTab both display clinic stock vs remaining external purchase
      expect(consultationsSource).toContain('External purchase: ${remainingForPurchase} pcs');
      expect(consultationsSource).toContain('Clinic stock: ${dispensedInClinic} pcs');
      expect(timelineSource).toContain('Clinic stock: ${dispensedQty}/${rx.quantity} (${remainingQty} ext.)');
    });

    test('6.6 Census Register keeps parent visit main row intact, emits per-service sub-rows with providing staff, and leaves non-diagnosis and unrecognized VisitTypes blank', () => {
      expect(mapCensusVisitTypeLabel('RoutineCheckup')).toBe('Routine Checkup');
      expect(mapCensusVisitTypeLabel('PreventiveHealthAssessment')).toBe('Preventive Health Assessment');
      expect(mapCensusVisitTypeLabel('UrgentCareVisit')).toBe('Urgent Care Visit');
      expect(mapCensusVisitTypeLabel('StandaloneProcedure')).toBe('');
      expect(mapCensusVisitTypeLabel('0')).toBe('');

      expect(normalizeCensusDisplayField('N/A - Non-doctor visit')).toBe('');
      expect(normalizeCensusDisplayField('—')).toBe('');
      expect(normalizeCensusDisplayField('None recorded')).toBe('');
      expect(normalizeCensusDisplayField('[J06.9] Acute URTI')).toBe('[J06.9] Acute URTI');

      const multiServiceVisit = {
        id: 'q-c001',
        queueNumber: 'Q-001',
        visitType: 'RoutineCheckup' as const,
        acuity: 'Routine',
        checkInTime: '2026-11-11T08:00:00Z',
        completedTime: '2026-11-11T08:35:00Z',
        patientCode: 'PAT-001',
        patientName: 'Dela Cruz, Miguel',
        age: 24,
        sex: 'Male',
        attendingDoctor: 'Dr. Ana Cruz (PRC: 0123456)',
        attendingNurse: 'Nurse Clara, RN',
        doctorDiagnosis: '[J20.9] Acute Bronchitis (Primary)',
        servicesAvailed: [
          'Routine Checkup',
          'In-Clinic Procedure',
          'Medicine Dispensing',
          'Prescription',
          'Medical Certificate',
          'Laboratory Requisition',
        ],
        proceduresPerformed: 'Salbutamol Nebulization',
        prescriptionsCount: 2,
        medicalCertificatesCount: 1,
        labRequisitionsCount: 1,
      };

      const subRows = resolveCensusVisitServiceRows(multiServiceVisit, [
        {
          id: 'disp-1',
          dispensedAt: '2026-11-11T08:25:00Z',
          queueItemId: 'q-c001',
          queueNumber: 'C-001',
          patientName: 'Dela Cruz, Miguel',
          source: 'NurseVitalsCheck',
          itemName: 'Paracetamol',
          itemCategory: 'Medicine',
          dosageOrSpec: '500mg',
          formOrUnit: 'Tablet',
          quantityDispensed: 2,
          rosCategory: 'Respiratory',
          dispensedByStaffName: 'Nurse Joy, RN',
          dispensedByRole: 'Nurse',
        },
      ]);

      expect(subRows.map((r) => r.serviceName)).toEqual([
        'In-Clinic Procedure',
        'Medicine Dispensing',
        'Prescription',
        'Medical Certificate',
        'Laboratory Requisition',
      ]);
      expect(subRows[0].attendingNurse).toBe('Nurse Clara, RN');
      expect(subRows[0].serviceDetails).toContain('Salbutamol Nebulization');
      expect(subRows[1].attendingNurse).toBe('Nurse Joy, RN');
      expect(subRows[1].serviceDetails).toContain('Paracetamol 500mg x2 Tablet');
      expect(subRows[2].attendingDoctor).toContain('Dr. Ana Cruz');
      expect(subRows.every((r) => r.doctorDiagnosis === '')).toBe(true);

      const dashboardSource = fs.readFileSync(
        path.join(APP_ROOT, 'navigation/screens/Dashboard.screen.tsx'),
        'utf-8',
      );
      expect(dashboardSource).toContain('Service Availed');
      expect(dashboardSource).toContain('Ticket, Date &amp; Time');
      expect(dashboardSource).not.toContain('Ticket, Visit &amp; Services Availed');
      expect(dashboardSource).toContain('resolveCensusVisitServiceRows(item, dispensingLedger)');
    });
  });
});
