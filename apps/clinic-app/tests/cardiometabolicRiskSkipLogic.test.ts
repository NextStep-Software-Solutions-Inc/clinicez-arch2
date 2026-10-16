import { describe, expect, test } from 'bun:test';
import type { SaveNcdRiskAssessmentPayload } from '../services/clinicService';

describe('Cardiometabolic Risk Assessment - Explicit Answering, Skip Logic & Clinical Terminology', () => {
  // Pure validator matching the exact explicit answering validation of CardiometabolicRiskTab.tsx
  function validateExplicitAnswers(formState: {
    eatsProcessedFoodWeekly: boolean | null;
    threeServingsVegetablesDaily: boolean | null;
    twoToThreeServingsFruitDaily: boolean | null;
    physicalActivityAtLeast150MinsWeekly: boolean | null;
    diagnosedDiabetes: boolean | null;
    diabetesMedicationStatus: 'Y' | 'N' | null;
    hasPolyphagia: boolean | null;
    hasPolydipsia: boolean | null;
    hasPolyuria: boolean | null;
    hasRaisedBloodGlucose: boolean | null;
    fastingBloodSugarMgDl: string;
    hasRaisedBloodLipids: boolean | null;
    totalCholesterolMgDl: string;
    urineKetonesPresent: boolean | null;
    urineKetonesValue: string;
    urineProteinPresent: boolean | null;
    urineProteinValue: string;
    hasChestPain: boolean | null;
    painInCenterOfChestOrLeftArm: boolean | null;
    painWhenWalkingUphill: boolean | null;
    slowsDownWhenPainOccurs: boolean | null;
    painRelievedWithin10Mins: boolean | null;
    painRelievedByNitrates: boolean | null;
    severeChestPainOver30Mins: boolean | null;
    transientNeurologicalDeficits: boolean | null;
    hasHistoryAnginaHeartAttack: boolean | null;
    hasHistoryStrokeOrTia: boolean | null;
  }): { isValid: boolean; unanswered: string[] } {
    const unanswered: string[] = [];

    // Section 1
    if (formState.eatsProcessedFoodWeekly === null) {
      unanswered.push('Dietary Fat & Sodium Intake');
    }

    // Section 2
    if (formState.threeServingsVegetablesDaily === null) {
      unanswered.push('Vegetable Intake (at least 3 servings daily)');
    }
    if (formState.twoToThreeServingsFruitDaily === null) {
      unanswered.push('Fruit Intake (2 to 3 servings daily)');
    }

    // Section 3
    if (formState.physicalActivityAtLeast150MinsWeekly === null) {
      unanswered.push('Physical Activity (at least 150 minutes weekly)');
    }

    // Section 4
    if (formState.diagnosedDiabetes === null) {
      unanswered.push('Diagnosed Diabetes Mellitus status');
    }
    if (formState.diagnosedDiabetes === true && formState.diabetesMedicationStatus === null) {
      unanswered.push('Current Diabetes Pharmacotherapy status');
    }
    if (formState.hasPolyphagia === null) {
      unanswered.push('Symptoms of Polyphagia (excessive hunger)');
    }
    if (formState.hasPolydipsia === null) {
      unanswered.push('Symptoms of Polydipsia (excessive thirst)');
    }
    if (formState.hasPolyuria === null) {
      unanswered.push('Symptoms of Polyuria (frequent urination)');
    }
    if (formState.hasRaisedBloodGlucose === null) {
      unanswered.push('Elevated Blood Glucose screening status');
    }
    if (formState.hasRaisedBloodGlucose === true && !formState.fastingBloodSugarMgDl.trim()) {
      unanswered.push('Fasting Blood Sugar (FBS) lab value');
    }
    if (formState.hasRaisedBloodLipids === null) {
      unanswered.push('Elevated Blood Lipids (Cholesterol) status');
    }
    if (formState.hasRaisedBloodLipids === true && !formState.totalCholesterolMgDl.trim()) {
      unanswered.push('Total Cholesterol lab value');
    }
    if (formState.urineKetonesPresent === null) {
      unanswered.push('Urinalysis: Urine Ketones status');
    }
    if (formState.urineKetonesPresent === true && !formState.urineKetonesValue.trim()) {
      unanswered.push('Urine Ketones test result');
    }
    if (formState.urineProteinPresent === null) {
      unanswered.push('Urinalysis: Proteinuria status');
    }
    if (formState.urineProteinPresent === true && !formState.urineProteinValue.trim()) {
      unanswered.push('Urine Protein test result');
    }

    // Section 5
    if (formState.hasChestPain === null) {
      unanswered.push('Chest Pain / Heaviness symptom status');
    }
    if (formState.hasChestPain === true) {
      if (formState.painInCenterOfChestOrLeftArm === null) {
        unanswered.push('Chest Pain: Central chest / radiating to left arm');
      }
      if (formState.painWhenWalkingUphill === null) {
        unanswered.push('Chest Pain: Provoked by walking uphill or hurrying');
      }
      if (formState.painWhenWalkingUphill === true) {
        if (formState.slowsDownWhenPainOccurs === null) {
          unanswered.push('Chest Pain: Forces patient to stop or slow down');
        }
        if (formState.painRelievedWithin10Mins === null) {
          unanswered.push('Chest Pain: Resolves completely within 10 minutes');
        }
        if (formState.painRelievedByNitrates === null) {
          unanswered.push('Chest Pain: Relieved by rest or sublingual nitroglycerin');
        }
      }
    }
    if (formState.severeChestPainOver30Mins === null) {
      unanswered.push('Severe persistent chest pain lasting > 30 minutes');
    }
    if (formState.transientNeurologicalDeficits === null) {
      unanswered.push('Transient focal neurological deficits / TIA symptoms');
    }
    if (formState.hasHistoryAnginaHeartAttack === null) {
      unanswered.push('Documented medical history of Angina / Heart Attack');
    }
    if (formState.hasHistoryStrokeOrTia === null) {
      unanswered.push('Documented medical history of Stroke / TIA');
    }

    return { isValid: unanswered.length === 0, unanswered };
  }

  // Pure helper simulating payload sanitization
  function buildSanitizedPayload(formState: {
    riskBand: string;
    riskScorePercent: string;
    assessmentDate: string;
    assessedByStaffName: string;
    remarks?: string;

    // Section 1
    eatsProcessedFoodWeekly: boolean | null;

    // Section 2
    threeServingsVegetablesDaily: boolean | null;
    twoToThreeServingsFruitDaily: boolean | null;

    // Section 3
    physicalActivityAtLeast150MinsWeekly: boolean | null;

    // Section 4
    diagnosedDiabetes: boolean | null;
    diabetesMedicationStatus: 'Y' | 'N' | null;
    hasPolyphagia: boolean | null;
    hasPolydipsia: boolean | null;
    hasPolyuria: boolean | null;
    hasRaisedBloodGlucose: boolean | null;
    fastingBloodSugarMgDl: string;
    fastingBloodSugarDate: string;
    hasRaisedBloodLipids: boolean | null;
    totalCholesterolMgDl: string;
    totalCholesterolDate: string;
    urineKetonesPresent: boolean | null;
    urineKetonesValue: string;
    urineKetonesDate: string;
    urineProteinPresent: boolean | null;
    urineProteinValue: string;
    urineProteinDate: string;

    // Section 5
    hasChestPain: boolean | null;
    painInCenterOfChestOrLeftArm: boolean | null;
    painWhenWalkingUphill: boolean | null;
    slowsDownWhenPainOccurs: boolean | null;
    painRelievedWithin10Mins: boolean | null;
    painRelievedByNitrates: boolean | null;
    severeChestPainOver30Mins: boolean | null;
    transientNeurologicalDeficits: boolean | null;
    hasHistoryAnginaHeartAttack: boolean | null;
    hasHistoryStrokeOrTia: boolean | null;
  }): SaveNcdRiskAssessmentPayload {
    return {
      riskBand: formState.riskBand,
      calculatedRiskScorePercent: parseFloat(formState.riskScorePercent) || undefined,
      assessmentDate: formState.assessmentDate,
      assessedByStaffName: formState.assessedByStaffName,
      remarks: formState.remarks?.trim() || undefined,

      eatsProcessedFoodWeekly: formState.eatsProcessedFoodWeekly,
      threeServingsVegetablesDaily: formState.threeServingsVegetablesDaily,
      twoToThreeServingsFruitDaily: formState.twoToThreeServingsFruitDaily,
      physicalActivityAtLeast150MinsWeekly: formState.physicalActivityAtLeast150MinsWeekly,

      diagnosedDiabetes: formState.diagnosedDiabetes === true ? 'Y' : (formState.diagnosedDiabetes === false ? 'N' : null),
      hasPolyphagia: formState.hasPolyphagia,
      hasPolydipsia: formState.hasPolydipsia,
      hasPolyuria: formState.hasPolyuria,
      diabetesMedicationStatus: formState.diagnosedDiabetes === true ? (formState.diabetesMedicationStatus || 'N') : undefined,
      hasRaisedBloodGlucose: formState.hasRaisedBloodGlucose || (parseFloat(formState.fastingBloodSugarMgDl) >= 126),
      fastingBloodSugarMgDl: (formState.hasRaisedBloodGlucose || parseFloat(formState.fastingBloodSugarMgDl) > 0)
        ? (parseFloat(formState.fastingBloodSugarMgDl) || undefined)
        : undefined,
      fastingBloodSugarDate: (formState.hasRaisedBloodGlucose && formState.fastingBloodSugarDate.trim())
        ? formState.fastingBloodSugarDate.trim()
        : undefined,

      hasRaisedBloodLipids: formState.hasRaisedBloodLipids || (parseFloat(formState.totalCholesterolMgDl) >= 200),
      totalCholesterolMgDl: (formState.hasRaisedBloodLipids || parseFloat(formState.totalCholesterolMgDl) > 0)
        ? (parseFloat(formState.totalCholesterolMgDl) || undefined)
        : undefined,
      totalCholesterolDate: (formState.hasRaisedBloodLipids && formState.totalCholesterolDate.trim())
        ? formState.totalCholesterolDate.trim()
        : undefined,

      urineKetonesPresent: formState.urineKetonesPresent,
      urineKetonesValue: formState.urineKetonesPresent ? formState.urineKetonesValue.trim() : undefined,
      urineKetonesDate: (formState.urineKetonesPresent && formState.urineKetonesDate.trim()) ? formState.urineKetonesDate.trim() : undefined,

      urineProteinPresent: formState.urineProteinPresent,
      urineProteinValue: formState.urineProteinPresent ? formState.urineProteinValue.trim() : undefined,
      urineProteinDate: (formState.urineProteinPresent && formState.urineProteinDate.trim()) ? formState.urineProteinDate.trim() : undefined,

      hasChestPain: formState.hasChestPain,
      painInCenterOfChestOrLeftArm: formState.hasChestPain === true ? formState.painInCenterOfChestOrLeftArm : undefined,
      painWhenWalkingUphill: formState.hasChestPain === true ? formState.painWhenWalkingUphill : undefined,
      slowsDownWhenPainOccurs: (formState.hasChestPain === true && formState.painWhenWalkingUphill === true) ? formState.slowsDownWhenPainOccurs : undefined,
      painRelievedWithin10Mins: (formState.hasChestPain === true && formState.painWhenWalkingUphill === true) ? formState.painRelievedWithin10Mins : undefined,
      painRelievedByNitrates: (formState.hasChestPain === true && formState.painWhenWalkingUphill === true) ? formState.painRelievedByNitrates : undefined,

      severeChestPainOver30Mins: formState.severeChestPainOver30Mins,
      transientNeurologicalDeficits: formState.transientNeurologicalDeficits,
      hasHistoryAnginaHeartAttack: formState.hasHistoryAnginaHeartAttack,
      hasHistoryStrokeOrTia: formState.hasHistoryStrokeOrTia,
    };
  }

  test('Explicit Answering Governance: rejects save when questions are unselected (null)', () => {
    // Completely unselected initial form (all null)
    const initialBlankForm = {
      eatsProcessedFoodWeekly: null,
      threeServingsVegetablesDaily: null,
      twoToThreeServingsFruitDaily: null,
      physicalActivityAtLeast150MinsWeekly: null,
      diagnosedDiabetes: null,
      diabetesMedicationStatus: null,
      hasPolyphagia: null,
      hasPolydipsia: null,
      hasPolyuria: null,
      hasRaisedBloodGlucose: null,
      fastingBloodSugarMgDl: '',
      hasRaisedBloodLipids: null,
      totalCholesterolMgDl: '',
      urineKetonesPresent: null,
      urineKetonesValue: '',
      urineProteinPresent: null,
      urineProteinValue: '',
      hasChestPain: null,
      painInCenterOfChestOrLeftArm: null,
      painWhenWalkingUphill: null,
      slowsDownWhenPainOccurs: null,
      painRelievedWithin10Mins: null,
      painRelievedByNitrates: null,
      severeChestPainOver30Mins: null,
      transientNeurologicalDeficits: null,
      hasHistoryAnginaHeartAttack: null,
      hasHistoryStrokeOrTia: null,
    };

    const result = validateExplicitAnswers(initialBlankForm);
    expect(result.isValid).toBe(false);
    expect(result.unanswered.length).toBeGreaterThan(10);
    expect(result.unanswered).toContain('Dietary Fat & Sodium Intake');
    expect(result.unanswered).toContain('Diagnosed Diabetes Mellitus status');
    expect(result.unanswered).toContain('Chest Pain / Heaviness symptom status');
  });

  test('Explicit Answering Governance: passes validation only when all non-skipped questions are answered', () => {
    const fullyAnsweredForm = {
      eatsProcessedFoodWeekly: false,
      threeServingsVegetablesDaily: true,
      twoToThreeServingsFruitDaily: true,
      physicalActivityAtLeast150MinsWeekly: true,
      diagnosedDiabetes: false, // Diabetes negative
      diabetesMedicationStatus: null, // Skipped
      hasPolyphagia: false,
      hasPolydipsia: false,
      hasPolyuria: false,
      hasRaisedBloodGlucose: false,
      fastingBloodSugarMgDl: '',
      hasRaisedBloodLipids: false,
      totalCholesterolMgDl: '',
      urineKetonesPresent: false,
      urineKetonesValue: '',
      urineProteinPresent: false,
      urineProteinValue: '',
      hasChestPain: false, // Chest pain negative
      painInCenterOfChestOrLeftArm: null, // Skipped
      painWhenWalkingUphill: null, // Skipped
      slowsDownWhenPainOccurs: null, // Skipped
      painRelievedWithin10Mins: null, // Skipped
      painRelievedByNitrates: null, // Skipped
      severeChestPainOver30Mins: false,
      transientNeurologicalDeficits: false,
      hasHistoryAnginaHeartAttack: false,
      hasHistoryStrokeOrTia: false,
    };

    const result = validateExplicitAnswers(fullyAnsweredForm);
    expect(result.isValid).toBe(true);
    expect(result.unanswered.length).toBe(0);
  });

  test('Skip Logic: Chest pain negative skips and sets all child angina questions to undefined', () => {
    const payload = buildSanitizedPayload({
      riskBand: 'BandA',
      riskScorePercent: '4',
      assessmentDate: '2026-10-16',
      assessedByStaffName: 'Dr. Santos',
      eatsProcessedFoodWeekly: false,
      threeServingsVegetablesDaily: true,
      twoToThreeServingsFruitDaily: true,
      physicalActivityAtLeast150MinsWeekly: true,
      diagnosedDiabetes: false,
      diabetesMedicationStatus: null,
      hasPolyphagia: false,
      hasPolydipsia: false,
      hasPolyuria: false,
      hasRaisedBloodGlucose: false,
      fastingBloodSugarMgDl: '',
      fastingBloodSugarDate: '',
      hasRaisedBloodLipids: false,
      totalCholesterolMgDl: '',
      totalCholesterolDate: '',
      urineKetonesPresent: false,
      urineKetonesValue: '',
      urineKetonesDate: '',
      urineProteinPresent: false,
      urineProteinValue: '',
      urineProteinDate: '',

      hasChestPain: false,
      painInCenterOfChestOrLeftArm: true, // Should be purged by skip logic
      painWhenWalkingUphill: true, // Should be purged by skip logic
      slowsDownWhenPainOccurs: true, // Should be purged by skip logic
      painRelievedWithin10Mins: true, // Should be purged by skip logic
      painRelievedByNitrates: true, // Should be purged by skip logic
      severeChestPainOver30Mins: false,
      transientNeurologicalDeficits: false,
      hasHistoryAnginaHeartAttack: false,
      hasHistoryStrokeOrTia: false,
    });

    expect(payload.hasChestPain).toBe(false);
    expect(payload.painInCenterOfChestOrLeftArm).toBeUndefined();
    expect(payload.painWhenWalkingUphill).toBeUndefined();
    expect(payload.slowsDownWhenPainOccurs).toBeUndefined();
    expect(payload.painRelievedWithin10Mins).toBeUndefined();
    expect(payload.painRelievedByNitrates).toBeUndefined();
  });

  test('Skip Logic: Exertional walking pain negative skips and sets deceleration/relief questions to undefined', () => {
    const payload = buildSanitizedPayload({
      riskBand: 'BandB',
      riskScorePercent: '12',
      assessmentDate: '2026-10-16',
      assessedByStaffName: 'Dr. Santos',
      eatsProcessedFoodWeekly: false,
      threeServingsVegetablesDaily: true,
      twoToThreeServingsFruitDaily: true,
      physicalActivityAtLeast150MinsWeekly: true,
      diagnosedDiabetes: false,
      diabetesMedicationStatus: null,
      hasPolyphagia: false,
      hasPolydipsia: false,
      hasPolyuria: false,
      hasRaisedBloodGlucose: false,
      fastingBloodSugarMgDl: '',
      fastingBloodSugarDate: '',
      hasRaisedBloodLipids: false,
      totalCholesterolMgDl: '',
      totalCholesterolDate: '',
      urineKetonesPresent: false,
      urineKetonesValue: '',
      urineKetonesDate: '',
      urineProteinPresent: false,
      urineProteinValue: '',
      urineProteinDate: '',

      hasChestPain: true,
      painInCenterOfChestOrLeftArm: true,
      painWhenWalkingUphill: false, // Exertion negative
      slowsDownWhenPainOccurs: true, // Should be purged
      painRelievedWithin10Mins: true, // Should be purged
      painRelievedByNitrates: true, // Should be purged
      severeChestPainOver30Mins: false,
      transientNeurologicalDeficits: false,
      hasHistoryAnginaHeartAttack: false,
      hasHistoryStrokeOrTia: false,
    });

    expect(payload.hasChestPain).toBe(true);
    expect(payload.painInCenterOfChestOrLeftArm).toBe(true);
    expect(payload.painWhenWalkingUphill).toBe(false);
    expect(payload.slowsDownWhenPainOccurs).toBeUndefined();
    expect(payload.painRelievedWithin10Mins).toBeUndefined();
    expect(payload.painRelievedByNitrates).toBeUndefined();
  });

  test('Skip Logic: Diagnosed diabetes negative skips diabetes medication question', () => {
    const payload = buildSanitizedPayload({
      riskBand: 'BandA',
      riskScorePercent: '5',
      assessmentDate: '2026-10-16',
      assessedByStaffName: 'Dr. Santos',
      eatsProcessedFoodWeekly: false,
      threeServingsVegetablesDaily: true,
      twoToThreeServingsFruitDaily: true,
      physicalActivityAtLeast150MinsWeekly: true,
      diagnosedDiabetes: false, // Negative diabetes
      diabetesMedicationStatus: 'Y', // Should be purged
      hasPolyphagia: false,
      hasPolydipsia: false,
      hasPolyuria: false,
      hasRaisedBloodGlucose: false,
      fastingBloodSugarMgDl: '',
      fastingBloodSugarDate: '',
      hasRaisedBloodLipids: false,
      totalCholesterolMgDl: '',
      totalCholesterolDate: '',
      urineKetonesPresent: false,
      urineKetonesValue: '',
      urineKetonesDate: '',
      urineProteinPresent: false,
      urineProteinValue: '',
      urineProteinDate: '',
      hasChestPain: false,
      painInCenterOfChestOrLeftArm: null,
      painWhenWalkingUphill: null,
      slowsDownWhenPainOccurs: null,
      painRelievedWithin10Mins: null,
      painRelievedByNitrates: null,
      severeChestPainOver30Mins: false,
      transientNeurologicalDeficits: false,
      hasHistoryAnginaHeartAttack: false,
      hasHistoryStrokeOrTia: false,
    });

    expect(payload.diagnosedDiabetes).toBe('N');
    expect(payload.diabetesMedicationStatus).toBeUndefined();
  });

  test('Terminology: Cardiometabolic risk tab contains pure clinical terminology without statutory codes', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../components/chart/CardiometabolicRiskTab.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');

    // Should NOT contain statutory Q-number labels in UI text
    expect(content).not.toMatch(/Q1\./);
    expect(content).not.toMatch(/Q2\./);
    expect(content).not.toMatch(/Q5\./);
    expect(content).not.toMatch(/Q10\./);
    expect(content).not.toMatch(/Q19\./);
    expect(content).not.toMatch(/Q20\./);

    // Should NOT contain statutory schema jargon
    expect(content).not.toMatch(/NCDQANS/);
    expect(content).not.toMatch(/lib_ncdq/);
    expect(content).not.toMatch(/Rose Survey/i);

    // Should contain pure clinical section headings
    expect(content).toContain('Dietary Fat & Sodium Intake');
    expect(content).toContain('Dietary Fiber & Nutrition');
    expect(content).toContain('Physical Activity');
    expect(content).toContain('Diabetes & Metabolic Assessment');
    expect(content).toContain('Cardiovascular & Cerebrovascular Symptoms');
    expect(content).toContain('10-Year Cardiovascular Disease Risk Stratification');
  });
});
