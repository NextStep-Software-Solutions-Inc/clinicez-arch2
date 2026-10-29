export type RiskBandType = 'BandA' | 'BandB' | 'BandC' | 'BandD' | 'BandE';

export interface PhilPenInput {
  ageYears?: number;
  sex?: string;
  isSmoker?: boolean;
  systolicBp?: number;
  diastolicBp?: number;
  diagnosedDiabetes?: boolean;
  fastingBloodSugarMgDl?: number;
  totalCholesterolMgDl?: number;
  bodyMassIndex?: number;
  hasAnginaOrHeartAttack?: boolean;
  hasStrokeOrTia?: boolean;
  severeChestPainOver30Mins?: boolean;
  transientNeurologicalDeficits?: boolean;
}

export interface PhilPenComputationResult {
  riskBand: RiskBandType;
  calculatedScorePercent: number;
  usedBmiFallback: boolean;
  crisisOverrideApplied: boolean;
  overrideReason?: string;
  managementRecommendation: string;
  totalPoints: number;
}

/**
 * Converts a continuous risk score percentage into the statutory PhilHealth Yakap (lib_ncdq Q17 / pQid17_Abcde) Risk Band.
 * Band A: <10% (Low Risk)
 * Band B: 10% to <20% (Moderate Risk)
 * Band C: 20% to <30% (High Risk)
 * Band D: 30% to <40% (Very High Risk)
 * Band E: >=40% (Critical / Extreme Risk)
 */
export function percentageToRiskBand(percent: number): RiskBandType {
  if (percent >= 40) return 'BandE';
  if (percent >= 30) return 'BandD';
  if (percent >= 20) return 'BandC';
  if (percent >= 10) return 'BandB';
  return 'BandA';
}

/**
 * Default representative percentage midpoints for each PhilHealth risk band
 */
export const RISK_BAND_MIDPOINTS: Record<RiskBandType, number> = {
  BandA: 5,
  BandB: 15,
  BandC: 25,
  BandD: 35,
  BandE: 45,
};

/**
 * Calculates 10-year cardiometabolic CVD risk score aligned with DOH PHILPEN Protocol
 * and PhilHealth YAKAP 2.0 (PCAPI) statutory requirements.
 */
export function calculatePhilPenRisk(input: PhilPenInput): PhilPenComputationResult {
  // 1. Crisis & Clinical Override Rules
  // Rule A: Hypertensive crisis (SBP >= 180 or DBP >= 110)
  if ((input.systolicBp && input.systolicBp >= 180) || (input.diastolicBp && input.diastolicBp >= 110)) {
    return {
      riskBand: 'BandE',
      calculatedScorePercent: 45.0,
      usedBmiFallback: false,
      crisisOverrideApplied: true,
      overrideReason: 'Hypertensive Emergency: Blood pressure ≥ 180/110 mmHg warrants immediate Band E classification.',
      managementRecommendation:
        'EMERGENCY: Hypertensive crisis. Immediate specialist referral and aggressive antihypertensive intervention required.',
      totalPoints: 15,
    };
  }

  // Rule B: Established CVD (prior Angina, Heart Attack, Stroke, or TIA)
  if (input.hasAnginaOrHeartAttack || input.hasStrokeOrTia) {
    return {
      riskBand: 'BandE',
      calculatedScorePercent: 40.0,
      usedBmiFallback: false,
      crisisOverrideApplied: true,
      overrideReason:
        'Established CVD: History of documented Angina, Heart Attack, Stroke, or TIA elevates patient immediately to Band E (≥40%).',
      managementRecommendation:
        'Very High Risk: Established cardiovascular or cerebrovascular disease. Intensive secondary prevention, high-intensity statin, and cardiology follow-up.',
      totalPoints: 15,
    };
  }

  // 2. WHO/ISH Point Scoring Framework
  let points = 0;
  const age = input.ageYears ?? 0;
  if (age >= 70) points += 6;
  else if (age >= 60) points += 5;
  else if (age >= 50) points += 3;
  else if (age >= 40) points += 2;

  // Sex & Smoking
  const isMale = (input.sex?.toLowerCase() || '').startsWith('m');
  if (isMale) points += 1;
  if (input.isSmoker) points += 3;

  // Diabetes / Glycemia (Q5 or FBS >= 126 mg/dL)
  const hasHighFbs = input.fastingBloodSugarMgDl != null && input.fastingBloodSugarMgDl >= 126;
  if (input.diagnosedDiabetes || hasHighFbs) {
    points += 4;
  }

  // Systolic Blood Pressure
  const sbp = input.systolicBp ?? 0;
  if (sbp >= 160) points += 5;
  else if (sbp >= 140) points += 3;
  else if (sbp >= 130) points += 1;

  // Cholesterol or BMI Fallback
  let usedBmiFallback = false;
  if (input.totalCholesterolMgDl != null && input.totalCholesterolMgDl > 0) {
    if (input.totalCholesterolMgDl >= 280) points += 5;
    else if (input.totalCholesterolMgDl >= 240) points += 4;
    else if (input.totalCholesterolMgDl >= 200) points += 2;
  } else if (input.bodyMassIndex != null && input.bodyMassIndex > 0) {
    usedBmiFallback = true;
    if (input.bodyMassIndex >= 30) points += 3;
    else if (input.bodyMassIndex >= 25) points += 1;
  }

  // 3. Map Points to Risk Bands
  let riskBand: RiskBandType = 'BandA';
  let percent = 6.5;
  let rec = 'Low CVD risk: Routine primary care follow-up every 12 months.';

  if (points >= 14) {
    riskBand = 'BandE';
    percent = 41.0;
    rec = 'Intensive pharmacotherapy, strict glycemic/BP control, and cardiology review.';
  } else if (points >= 11) {
    riskBand = 'BandD';
    percent = 34.0;
    rec = 'Combination pharmacotherapy (antihypertensive + statin) and close 1-month monitoring.';
  } else if (points >= 8) {
    riskBand = 'BandC';
    percent = 24.5;
    rec = 'Active drug therapy indicated; dietary and physical lifestyle modification.';
  } else if (points >= 5) {
    riskBand = 'BandB';
    percent = 14.0;
    rec = 'Lifestyle coaching, lipid monitoring, and follow-up in 3-6 months.';
  }

  // Urgent symptomatic elevation rule (severe chest pain >30 min or transient neuro)
  if (
    (input.severeChestPainOver30Mins || input.transientNeurologicalDeficits) &&
    (riskBand === 'BandA' || riskBand === 'BandB' || riskBand === 'BandC')
  ) {
    riskBand = 'BandD';
    percent = Math.max(percent, 30.0);
    rec =
      'Urgent symptomatic risk: Severe prolonged chest pain or neurological deficits warrant expedited clinical assessment.';
  }

  return {
    riskBand,
    calculatedScorePercent: percent,
    usedBmiFallback,
    crisisOverrideApplied: false,
    managementRecommendation: rec,
    totalPoints: points,
  };
}
