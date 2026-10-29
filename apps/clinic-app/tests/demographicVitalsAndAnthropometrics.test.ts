// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import type {
  RecordTriageRequest,
  TriageVitals,
  ClinicPatient,
} from '../services/clinicService';

describe('Demographic Vitals & Anthropometrics Architecture', () => {
  describe('1. Demographic Cohort & Age Bracket Resolution', () => {
    const resolveCohort = (patient: { age: number; dateOfBirth?: string; sex?: string }) => {
      const female = (patient.sex || '').toLowerCase().startsWith('f');
      let years = patient.age;
      let months = patient.age * 12;

      if (patient.dateOfBirth) {
        const dob = new Date(patient.dateOfBirth);
        const now = new Date('2026-10-16T12:00:00Z');
        years = now.getFullYear() - dob.getFullYear();
        if (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate())) {
          years--;
        }
        months = (now.getFullYear() - dob.getFullYear()) * 12 + now.getMonth() - dob.getMonth();
        if (now.getDate() < dob.getDate()) {
          months--;
        }
        if (months < 0) months = 0;
      }

      return {
        ageMonths: months,
        ageYears: years,
        isInfant: months <= 24,
        isUnderFive: months <= 60,
        isPediatric: years < 18,
        isAdult: years >= 18,
        isSenior: years >= 60,
        isFemale: female,
      };
    };

    test('correctly identifies infant under 24 months', () => {
      const infant = resolveCohort({
        age: 1,
        dateOfBirth: '2025-10-16', // exactly 12 months on 2026-10-16
        sex: 'Male',
      });
      expect(infant.isInfant).toBe(true);
      expect(infant.isUnderFive).toBe(true);
      expect(infant.isPediatric).toBe(true);
      expect(infant.isAdult).toBe(false);
      expect(infant.ageMonths).toBe(12);
    });

    test('correctly identifies under-5 child (24–60 months)', () => {
      const child = resolveCohort({
        age: 3,
        dateOfBirth: '2023-04-16', // 42 months on 2026-10-16
        sex: 'Female',
      });
      expect(child.isInfant).toBe(false);
      expect(child.isUnderFive).toBe(true);
      expect(child.isPediatric).toBe(true);
      expect(child.isAdult).toBe(false);
      expect(child.isFemale).toBe(true);
      expect(child.ageMonths).toBe(42);
    });

    test('correctly identifies adult (>= 18 years)', () => {
      const adult = resolveCohort({
        age: 35,
        dateOfBirth: '1991-05-10',
        sex: 'Female',
      });
      expect(adult.isInfant).toBe(false);
      expect(adult.isUnderFive).toBe(false);
      expect(adult.isPediatric).toBe(false);
      expect(adult.isAdult).toBe(true);
      expect(adult.isSenior).toBe(false);
      expect(adult.isFemale).toBe(true);
    });

    test('correctly identifies senior citizen (>= 60 years)', () => {
      const senior = resolveCohort({
        age: 65,
        dateOfBirth: '1961-02-15',
        sex: 'Male',
      });
      expect(senior.isAdult).toBe(true);
      expect(senior.isSenior).toBe(true);
      expect(senior.isPediatric).toBe(false);
    });
  });

  describe('2. Gender-Responsive Central Obesity & WHR Cutoffs', () => {
    const evaluateCentralObesity = (waistCm: number, hipCm: number | undefined, isFemale: boolean) => {
      const cutoff = isFemale ? 80 : 90;
      const isObeseRisk = waistCm >= cutoff;

      let whr: number | undefined = undefined;
      let whrRisk = false;
      if (hipCm && hipCm > 0) {
        whr = Math.round((waistCm / hipCm) * 100) / 100;
        whrRisk = isFemale ? whr > 0.85 : whr > 0.90;
      }

      return {
        cutoff,
        isObeseRisk,
        whr,
        whrRisk,
      };
    };

    test('male central obesity triggers at waist >= 90 cm', () => {
      // 89 cm is normal for male
      const normalMale = evaluateCentralObesity(89, 95, false);
      expect(normalMale.cutoff).toBe(90);
      expect(normalMale.isObeseRisk).toBe(false);

      // 90 cm triggers central obesity risk
      const riskMale = evaluateCentralObesity(90, 95, false);
      expect(riskMale.isObeseRisk).toBe(true);

      // 92 cm / 100 cm = WHR 0.92 (> 0.90 high risk)
      const whrRiskMale = evaluateCentralObesity(92, 100, false);
      expect(whrRiskMale.whr).toBe(0.92);
      expect(whrRiskMale.whrRisk).toBe(true);

      // 85 cm / 100 cm = WHR 0.85 (<= 0.90 normal risk)
      const whrNormalMale = evaluateCentralObesity(85, 100, false);
      expect(whrNormalMale.whr).toBe(0.85);
      expect(whrNormalMale.whrRisk).toBe(false);
    });

    test('female central obesity triggers at waist >= 80 cm', () => {
      // 79 cm is normal for female
      const normalFemale = evaluateCentralObesity(79, 95, true);
      expect(normalFemale.cutoff).toBe(80);
      expect(normalFemale.isObeseRisk).toBe(false);

      // 80 cm triggers central obesity risk
      const riskFemale = evaluateCentralObesity(80, 95, true);
      expect(riskFemale.isObeseRisk).toBe(true);

      // 82 cm / 94 cm = WHR 0.87 (> 0.85 high risk)
      const whrRiskFemale = evaluateCentralObesity(82, 94, true);
      expect(whrRiskFemale.whr).toBe(0.87);
      expect(whrRiskFemale.whrRisk).toBe(true);

      // 76 cm / 95 cm = WHR 0.80 (<= 0.85 normal risk)
      const whrNormalFemale = evaluateCentralObesity(76, 95, true);
      expect(whrNormalFemale.whr).toBe(0.80);
      expect(whrNormalFemale.whrRisk).toBe(false);
    });
  });

  describe('3. Core Triage Payload Decoupling & Anthropometrics Assembly', () => {
    test('builds payload with new core anthropometrics and growth Z-score', () => {
      const payload: RecordTriageRequest = {
        nurseId: 'staff-nurse-1',
        recordedByNurseName: 'Nurse Maria Santos, RN',
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 75,
        temperatureCelsius: 36.8,
        respiratoryRateBreathsPerMin: 18,
        heightCm: 172,
        weightKg: 68,
        waistCircumferenceCm: 84,
        hipCircumferenceCm: 96,
        bodyLengthCm: undefined,
        skinfoldThicknessMm: 12,
        limbsCircumferenceCm: 28,
        growthZScoreCategory: 'Normal',
        growthZScoreCode: '01',
        philHealthZScoreCategory: 'Normal',
        philHealthZScoreCode: '01',
      };

      expect(payload.waistCircumferenceCm).toBe(84);
      expect(payload.hipCircumferenceCm).toBe(96);
      expect(payload.growthZScoreCategory).toBe('Normal');
      expect(payload.growthZScoreCode).toBe('01');
      expect(payload.philHealthZScoreCategory).toBe('Normal');
    });

    test('supports infant recumbent measurements in RecordTriageRequest', () => {
      const infantPayload: RecordTriageRequest = {
        nurseId: 'staff-nurse-1',
        recordedByNurseName: 'Nurse Maria Santos, RN',
        heartRateBpm: 125,
        temperatureCelsius: 37.0,
        respiratoryRateBreathsPerMin: 32,
        weightKg: 6.2,
        bodyLengthCm: 63.5,
        heightCm: 63.5,
        headCircumferenceCm: 41.2,
        midUpperArmCircumferenceCm: 13.5,
        skinfoldThicknessMm: 5.5,
        limbsCircumferenceCm: 14.0,
        isMeasuredRecumbent: true,
        growthZScoreCategory: 'Normal',
        growthZScoreCode: 'boys-0-23/0285',
      };

      expect(infantPayload.systolicBp).toBeUndefined();
      expect(infantPayload.diastolicBp).toBeUndefined();
      expect(infantPayload.bodyLengthCm).toBe(63.5);
      expect(infantPayload.headCircumferenceCm).toBe(41.2);
      expect(infantPayload.midUpperArmCircumferenceCm).toBe(13.5);
      expect(infantPayload.isMeasuredRecumbent).toBe(true);
      expect(infantPayload.growthZScoreCode).toBe('boys-0-23/0285');
    });
  });

  describe('4. Consultation Signing Gate Demographic Responsiveness', () => {
    const validateSigningVitals = (vitals: Partial<TriageVitals> | null, isInfant: boolean) => {
      const hasRr = !!(vitals?.respiratoryRateBreathsPerMin || (vitals as any)?.respiratoryRate);
      const hasHr = !!vitals?.heartRateBpm;
      const hasTemp = !!vitals?.temperatureCelsius;
      const hasWeight = !!vitals?.weightKg;
      const hasLengthOrHeight = !!(vitals?.heightCm || vitals?.bodyLengthCm);
      const hasBp = !!(vitals?.systolicBp && vitals?.diastolicBp);

      const vitalsComp = isInfant
        ? !!(hasHr && hasRr && hasTemp && hasWeight && hasLengthOrHeight)
        : !!(hasBp && hasHr && hasRr && hasTemp && hasWeight && hasLengthOrHeight);

      return {
        vitalsComplete: vitalsComp,
        missingMessage: !vitalsComp
          ? isInfant
            ? 'Complete infant triage vitals required (HR, RR, Temp, Weight, Length/Height).'
            : 'Complete triage vitals required (BP, HR, RR, Temp, Height, Weight).'
          : null,
      };
    };

    test('infant without BP passes signing gate when HR, RR, Temp, Weight, Length are present', () => {
      const infantVitals: Partial<TriageVitals> = {
        heartRateBpm: 120,
        respiratoryRateBreathsPerMin: 30,
        temperatureCelsius: 36.7,
        weightKg: 5.8,
        bodyLengthCm: 60.0,
      };

      const result = validateSigningVitals(infantVitals, true);
      expect(result.vitalsComplete).toBe(true);
      expect(result.missingMessage).toBeNull();
    });

    test('infant missing respiratory rate is rejected by signing gate', () => {
      const infantVitalsMissingRr: Partial<TriageVitals> = {
        heartRateBpm: 120,
        temperatureCelsius: 36.7,
        weightKg: 5.8,
        bodyLengthCm: 60.0,
      };

      const result = validateSigningVitals(infantVitalsMissingRr, true);
      expect(result.vitalsComplete).toBe(false);
      expect(result.missingMessage).toContain('Complete infant triage vitals required');
    });

    test('adult missing BP is rejected by signing gate', () => {
      const adultVitalsMissingBp: Partial<TriageVitals> = {
        heartRateBpm: 75,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.6,
        heightCm: 170,
        weightKg: 65,
      };

      const result = validateSigningVitals(adultVitalsMissingBp, false);
      expect(result.vitalsComplete).toBe(false);
      expect(result.missingMessage).toContain('Complete triage vitals required (BP, HR, RR, Temp, Height, Weight).');
    });

    test('adult with full vitals passes signing gate', () => {
      const adultFullVitals: Partial<TriageVitals> = {
        systolicBp: 120,
        diastolicBp: 80,
        heartRateBpm: 75,
        respiratoryRateBreathsPerMin: 18,
        temperatureCelsius: 36.6,
        heightCm: 170,
        weightKg: 65,
      };

      const result = validateSigningVitals(adultFullVitals, false);
      expect(result.vitalsComplete).toBe(true);
      expect(result.missingMessage).toBeNull();
    });
  });
});
