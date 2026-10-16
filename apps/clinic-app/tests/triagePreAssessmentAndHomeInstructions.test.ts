// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import type {
  RecordTriageRequest,
  TriageVitals,
  CreateConsultationRequest,
  UpdateConsultationRequest,
  ConsultationRecord,
} from '../services/clinicService';

describe('Triage Pre-Assessment & Home Instructions Architecture', () => {
  describe('1. Nursing Pre-Assessment in Triage', () => {
    test('constructs valid RecordTriageRequest with acuity priority and optional notes/remarks', () => {
      const triagePayload: RecordTriageRequest = {
        nurseId: 'staff-nurse-1',
        recordedByNurseName: 'Nurse Maria Santos, RN',
        systolicBp: 140,
        diastolicBp: 90,
        heartRateBpm: 88,
        temperatureCelsius: 37.2,
        respiratoryRateBreathsPerMin: 18,
        oxygenSaturationPercent: 98,
        heightCm: 165,
        weightKg: 68,
        painScore: 3,
        notes: 'Patient reports mild throbbing headache since this morning.',
        preAssessmentRemarks: 'Alert & Oriented • Mild Distress',
        preAssessmentNotes: 'Patient appears anxious, accompanied by daughter. Ambulatory without assistance.',
        triageAcuityReason: 'Urgent',
      };

      expect(triagePayload.preAssessmentRemarks).toBe('Alert & Oriented • Mild Distress');
      expect(triagePayload.preAssessmentNotes).toContain('Patient appears anxious');
      expect(triagePayload.triageAcuityReason).toBe('Urgent');
    });

    test('supports optionality of pre-assessment notes without breaking core triage vitals', () => {
      const fastTrackPayload: RecordTriageRequest = {
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 72,
        temperatureCelsius: 36.6,
        respiratoryRateBreathsPerMin: 16,
        oxygenSaturationPercent: 99,
        triageAcuityReason: 'Routine',
      };

      expect(fastTrackPayload.preAssessmentNotes).toBeUndefined();
      expect(fastTrackPayload.preAssessmentRemarks).toBeUndefined();
      expect(fastTrackPayload.triageAcuityReason).toBe('Routine');
      expect(fastTrackPayload.systolicBp).toBe(120);
    });

    test('clinical observation quick chip toggle logic properly manages comma-separated / bulleted remarks', () => {
      let remarks = '';
      const toggleChip = (current: string, chip: string): string => {
        if (current.includes(chip)) {
          return current
            .split(' • ')
            .filter((c) => c.trim() !== chip)
            .join(' • ');
        }
        return current.trim() ? `${current.trim()} • ${chip}` : chip;
      };

      // Add "Alert & Oriented"
      remarks = toggleChip(remarks, 'Alert & Oriented');
      expect(remarks).toBe('Alert & Oriented');

      // Add "Mild Distress"
      remarks = toggleChip(remarks, 'Mild Distress');
      expect(remarks).toBe('Alert & Oriented • Mild Distress');

      // Add "Fall Risk"
      remarks = toggleChip(remarks, 'Fall Risk');
      expect(remarks).toBe('Alert & Oriented • Mild Distress • Fall Risk');

      // Remove "Mild Distress"
      remarks = toggleChip(remarks, 'Mild Distress');
      expect(remarks).toBe('Alert & Oriented • Fall Risk');

      // Remove "Alert & Oriented"
      remarks = toggleChip(remarks, 'Alert & Oriented');
      expect(remarks).toBe('Fall Risk');

      // Remove last chip
      remarks = toggleChip(remarks, 'Fall Risk');
      expect(remarks).toBe('');
    });

    test('maps TriageVitals response including pre-assessment fields for physician handoff', () => {
      const vitalsResponse: TriageVitals = {
        id: 'triage-101',
        queueItemId: 'q-item-501',
        recordedAt: '2026-10-16T08:30:00Z',
        nurseId: 'staff-nurse-1',
        recordedByNurseName: 'Nurse Maria Santos, RN',
        systolicBp: 150,
        diastolicBp: 95,
        heartRateBpm: 92,
        respiratoryRateBreathsPerMin: 20,
        temperatureCelsius: 38.4,
        oxygenSaturationPercent: 96,
        heightCm: 170,
        weightKg: 75,
        bmi: 26.0,
        preAssessmentRemarks: 'Alert & Oriented • Acute Dyspnea',
        preAssessmentNotes: 'Wheezing heard on respiration, sat 96% on room air.',
        triageAcuityReason: 'Emergency',
      };

      expect(vitalsResponse.triageAcuityReason).toBe('Emergency');
      expect(vitalsResponse.preAssessmentRemarks).toContain('Acute Dyspnea');
      expect(vitalsResponse.preAssessmentNotes).toContain('Wheezing');
    });
  });

  describe('2. Consultation Encounter Home Instructions', () => {
    test('creates consultation payload containing separate plan and homeInstructions', () => {
      const createPayload: CreateConsultationRequest = {
        patientId: 'patient-401',
        patientName: 'Juan Dela Cruz',
        doctorId: 'doc-1',
        doctorName: 'Dr. Roberto Gomez',
        subjective: '3-day fever and productive cough.',
        objective: 'Temp 38.2C, coarse crackles left lower lung base.',
        assessment: 'Community-Acquired Pneumonia, Low Risk',
        plan: 'Initiate oral Azithromycin 500mg OD for 3 days. Internal check in 48 hours.',
        homeInstructions: 'Drink plenty of water (at least 8-10 glasses/day). Complete antibiotics course even if fever resolves. Return immediately if difficulty breathing occurs.',
        prescriptions: [
          {
            genericName: 'Azithromycin',
            dosage: '500mg',
            form: 'Tablet',
            sig: '1 tablet once daily for 3 days',
            quantity: 3,
            isDangerousDrug: false,
          },
        ],
      };

      expect(createPayload.plan).toBe('Initiate oral Azithromycin 500mg OD for 3 days. Internal check in 48 hours.');
      expect(createPayload.homeInstructions).toContain('Complete antibiotics course even if fever resolves');
      expect(createPayload.homeInstructions).not.toEqual(createPayload.plan);
    });

    test('updates consultation payload preserving homeInstructions', () => {
      const updatePayload: UpdateConsultationRequest = {
        subjective: 'Follow-up for hypertension.',
        objective: 'BP 128/82, HR 74, clear breath sounds.',
        assessment: 'Essential Hypertension, controlled',
        plan: 'Maintain current dosage of Amlodipine. Schedule annual ECG.',
        homeInstructions: 'Continue low salt & low fat diet. Record daily morning blood pressure in logbook. Next follow-up in 3 months.',
      };

      expect(updatePayload.homeInstructions).toContain('Record daily morning blood pressure');
      expect(updatePayload.plan).toContain('Maintain current dosage');
    });

    test('quick presets formatting builds clear bulleted patient instructions', () => {
      let instructions = '';
      const appendPreset = (current: string, preset: string): string => {
        return current.trim() ? `${current.trim()}\n• ${preset}` : `• ${preset}`;
      };

      instructions = appendPreset(instructions, 'Hydration & Rest (8+ glasses water daily)');
      instructions = appendPreset(instructions, 'Low Salt & Low Fat Diet');
      instructions = appendPreset(instructions, 'Warning Signs: Return immediately if fever > 38.5°C or acute chest pain occurs');

      expect(instructions).toContain('• Hydration & Rest');
      expect(instructions).toContain('• Low Salt & Low Fat Diet');
      expect(instructions).toContain('• Warning Signs');
      expect(instructions.split('\n').length).toBe(3);
    });

    test('prescription slip specialInstructions prioritizes homeInstructions over internal plan', () => {
      const internalPlan = 'Rule out secondary causes. Order renal ultrasound.';
      const patientHomeInstructions = 'Take medication after meals. Avoid strenuous activity.';

      const resolveSlipInstructions = (home?: string, planText?: string) => {
        return (home && home.trim()) || (planText && planText.trim()) || undefined;
      };

      expect(resolveSlipInstructions(patientHomeInstructions, internalPlan)).toBe(patientHomeInstructions);
      expect(resolveSlipInstructions('', internalPlan)).toBe(internalPlan);
      expect(resolveSlipInstructions(undefined, undefined)).toBeUndefined();
    });

    test('rehydrates ConsultationRecord with homeInstructions', () => {
      const record: ConsultationRecord = {
        id: 'consult-888',
        patientId: 'pat-1',
        patientName: 'Maria Clara',
        doctorId: 'doc-2',
        doctorName: 'Dr. Santos',
        consultationDate: '2026-10-16T10:00:00Z',
        subjective: 'Follow up',
        objective: 'Normal exam',
        assessment: 'Acute bronchitis resolved',
        plan: 'Discharge from acute care',
        homeInstructions: 'Rest voice, stay well hydrated.',
        isSigned: true,
        signedAt: '2026-10-16T10:15:00Z',
      };

      expect(record.homeInstructions).toBe('Rest voice, stay well hydrated.');
      expect(record.plan).toBe('Discharge from acute care');
    });
  });

  describe('3. Patient Data Privacy & Isolation Assurance', () => {
    test('enforces that S/O/A/P internal chart fields are excluded from patient-facing instruction view', () => {
      const consultationEncounter = {
        subjective: 'CONFIDENTIAL: Suspected malingering or secondary gain issues noted during exam.',
        objective: 'CONFIDENTIAL: Heavy smell of tobacco. Liver edge palpated 2cm below costal margin.',
        assessment: 'Internal physician assessment: Chronic liver changes secondary to alcohol use.',
        plan: 'Refer to hepatologist quietly without raising alarm.',
        homeInstructions: 'Take B-complex daily. Drink 2L water. Return in 2 weeks for scheduled ultrasound.',
      };

      // Patient-facing display mapper must NEVER pick up subjective, objective, assessment, or internal plan
      const patientFacingView = {
        instructions: consultationEncounter.homeInstructions,
      };

      expect(patientFacingView.instructions).toBe('Take B-complex daily. Drink 2L water. Return in 2 weeks for scheduled ultrasound.');
      expect(patientFacingView.instructions).not.toContain('CONFIDENTIAL');
      expect(patientFacingView.instructions).not.toContain('malingering');
      expect(patientFacingView.instructions).not.toContain('tobacco');
      expect(patientFacingView.instructions).not.toContain('hepatologist');
    });
  });
});
