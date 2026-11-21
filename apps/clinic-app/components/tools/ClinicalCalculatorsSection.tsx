import React, { useCallback, useMemo, useState } from 'react';
import { Platform, View, StyleSheet, Pressable, type PressableStateCallbackType } from 'react-native';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Icon,
  Input,
  ProgressBar,
  SegmentedControl,
  SkeletonList,
  StatCard,
  ThemedText,
  ValidatedDateInput,
  type BadgeVariant,
} from '@ui';
import { theme } from '@constants/theme';
import { useBreakpoint } from '@utils/useBreakpoint';
import { calculatePhilPenRisk, type RiskBandType } from '@utils/philpenCalculator';
import {
  calculateBmiAndBsa,
  calculateObEddAndAog,
  calculatePediatricDose,
  calculateRenalFunction,
  ftInToCm,
  getTodayIsoDate,
  lbToKg,
  PEDIATRIC_DOSE_PRESETS,
  type BiologicalSex,
  type CreatinineUnit,
  type PediatricDoseMode,
} from '@utils/clinicalCalculators';
import { clinicService, type PediatricZScoreResult } from '../../services/clinicService';
import type { CalculatorSubTool } from './toolsCatalog';
import { CalculatorWorkbench, LabeledControl, PreviewCard } from './ToolsUiHelpers';

export interface ClinicalCalculatorsSectionProps {
  activeTool: CalculatorSubTool;
  onSelectTool: (tool: CalculatorSubTool) => void;
  canAccessPediatricZScore: boolean;
}

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const CALCULATOR_OPTIONS: Array<{
  value: CalculatorSubTool;
  label: string;
  icon: 'scale' | 'heartPulse' | 'baby' | 'calendar' | 'syringe';
}> = [
  { value: 'bmi-bsa', label: 'BMI & Body Size', icon: 'scale' },
  { value: 'philpen', label: 'Heart Risk (PHILPEN)', icon: 'heartPulse' },
  { value: 'pediatric-zscore', label: 'Child Growth', icon: 'baby' },
  { value: 'ob-edd', label: 'Due Date (EDD)', icon: 'calendar' },
  { value: 'dosing-egfr', label: 'Dosing & Kidney', icon: 'syringe' },
];

const PRESET_DISPLAY_META: Record<string, { name: string; schedule: string }> = {
  paracetamol: { name: 'Paracetamol', schedule: '15 mg/kg/dose · every 6h' },
  ibuprofen: { name: 'Ibuprofen', schedule: '10 mg/kg/dose · every 8h' },
  amoxicillin: { name: 'Amoxicillin', schedule: '45 mg/kg/day · twice daily' },
  cefalexin: { name: 'Cefalexin', schedule: '50 mg/kg/day · 3x daily' },
};

function parsePositiveFloat(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function parseNonNegativeFloat(raw: string): number | undefined {
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function riskBandMeta(band: RiskBandType): { label: string; range: string; variant: BadgeVariant } {
  switch (band) {
    case 'BandE':
      return { label: 'Band E · Critical Risk', range: '40% or higher', variant: 'emergency' };
    case 'BandD':
      return { label: 'Band D · Very High Risk', range: '30% to under 40%', variant: 'urgent' };
    case 'BandC':
      return { label: 'Band C · High Risk', range: '20% to under 30%', variant: 'warning' };
    case 'BandB':
      return { label: 'Band B · Moderate Risk', range: '10% to under 20%', variant: 'info' };
    case 'BandA':
    default:
      return { label: 'Band A · Low Risk', range: 'Under 10%', variant: 'routine' };
  }
}

function zScoreTone(z?: number): BadgeVariant {
  if (z === undefined || !Number.isFinite(z)) return 'neutral';
  if (z < -3 || z > 3) return 'emergency';
  if (z < -2 || z > 2) return 'warning';
  return 'success';
}

interface ToggleChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  danger?: boolean;
}

function ToggleChip({ label, active, onPress, danger = false }: ToggleChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: active }}
      style={[
        styles.toggleChip,
        active && (danger ? styles.toggleChipDanger : styles.toggleChipActive),
      ]}
    >
      <Icon
        name={active ? 'checkCircle' : 'dot'}
        size={theme.sizes.iconSm}
        color={
          active
            ? danger
              ? theme.colors.emergencyText
              : theme.colors.primaryDark
            : theme.colors.textMuted
        }
      />
      <ThemedText
        variant={active ? 'smallBold' : 'small'}
        color={
          active
            ? danger
              ? theme.colors.emergencyText
              : theme.colors.primaryDark
            : theme.colors.textSecondary
        }
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export default function ClinicalCalculatorsSection({
  activeTool,
  onSelectTool,
  canAccessPediatricZScore,
}: ClinicalCalculatorsSectionProps) {
  const { isCompact, width } = useBreakpoint();
  const twoColWorkbench = !isCompact && width >= 860;
  const inputGroupStyle = isCompact ? styles.inputCol : styles.inputWrapRow;
  const inputCellStyle = isCompact ? styles.fullWidth : styles.inputCell;

  // ── 1. BMI & BSA State ────────────────────────────────────────────────────
  const [bmiUnit, setBmiUnit] = useState<'metric' | 'imperial'>('metric');
  const [bmiSex, setBmiSex] = useState<'unspecified' | BiologicalSex>('unspecified');
  const [weightInput, setWeightInput] = useState('');
  const [heightCmInput, setHeightCmInput] = useState('');
  const [heightFtInput, setHeightFtInput] = useState('');
  const [heightInInput, setHeightInInput] = useState('');

  const bmiResult = useMemo(() => {
    const rawWeight = parsePositiveFloat(weightInput);
    if (!rawWeight) return null;
    const weightKg = bmiUnit === 'metric' ? rawWeight : lbToKg(rawWeight);

    let heightCm: number | undefined;
    if (bmiUnit === 'metric') {
      heightCm = parsePositiveFloat(heightCmInput);
    } else {
      const ft = parseNonNegativeFloat(heightFtInput) ?? 0;
      const inch = parseNonNegativeFloat(heightInInput) ?? 0;
      const converted = ftInToCm(ft, inch);
      heightCm = converted > 0 ? converted : undefined;
    }
    if (!heightCm) return null;

    return calculateBmiAndBsa({
      weightKg,
      heightCm,
      sex: bmiSex === 'unspecified' ? undefined : bmiSex,
    });
  }, [bmiUnit, bmiSex, weightInput, heightCmInput, heightFtInput, heightInInput]);

  // ── 2. PHILPEN CVD Risk State ─────────────────────────────────────────────
  const [cvdAge, setCvdAge] = useState('');
  const [cvdSex, setCvdSex] = useState<'Male' | 'Female'>('Male');
  const [cvdSmoker, setCvdSmoker] = useState(false);
  const [cvdDiabetes, setCvdDiabetes] = useState(false);
  const [cvdSbp, setCvdSbp] = useState('');
  const [cvdDbp, setCvdDbp] = useState('');
  const [cvdFbs, setCvdFbs] = useState('');
  const [cvdCholesterol, setCvdCholesterol] = useState('');
  const [cvdBmi, setCvdBmi] = useState('');
  const [cvdPriorAnginaMi, setCvdPriorAnginaMi] = useState(false);
  const [cvdPriorStrokeTia, setCvdPriorStrokeTia] = useState(false);
  const [cvdSevereChestPain, setCvdSevereChestPain] = useState(false);
  const [cvdTransientNeuro, setCvdTransientNeuro] = useState(false);

  const hasCvdInputs = Boolean(
    parsePositiveFloat(cvdAge) ||
      parsePositiveFloat(cvdSbp) ||
      parsePositiveFloat(cvdDbp) ||
      cvdPriorAnginaMi ||
      cvdPriorStrokeTia ||
      cvdSevereChestPain ||
      cvdTransientNeuro ||
      cvdSmoker ||
      cvdDiabetes,
  );

  const philpenResult = useMemo(() => {
    if (!hasCvdInputs) return null;
    return calculatePhilPenRisk({
      ageYears: parsePositiveFloat(cvdAge),
      sex: cvdSex,
      isSmoker: cvdSmoker,
      systolicBp: parsePositiveFloat(cvdSbp),
      diastolicBp: parsePositiveFloat(cvdDbp),
      diagnosedDiabetes: cvdDiabetes,
      fastingBloodSugarMgDl: parsePositiveFloat(cvdFbs),
      totalCholesterolMgDl: parsePositiveFloat(cvdCholesterol),
      bodyMassIndex: parsePositiveFloat(cvdBmi),
      hasAnginaOrHeartAttack: cvdPriorAnginaMi,
      hasStrokeOrTia: cvdPriorStrokeTia,
      severeChestPainOver30Mins: cvdSevereChestPain,
      transientNeurologicalDeficits: cvdTransientNeuro,
    });
  }, [
    hasCvdInputs,
    cvdAge,
    cvdSex,
    cvdSmoker,
    cvdSbp,
    cvdDbp,
    cvdDiabetes,
    cvdFbs,
    cvdCholesterol,
    cvdBmi,
    cvdPriorAnginaMi,
    cvdPriorStrokeTia,
    cvdSevereChestPain,
    cvdTransientNeuro,
  ]);

  // ── 3. Pediatric Growth Z-Score State ─────────────────────────────────────
  const [zDob, setZDob] = useState('');
  const [zSex, setZSex] = useState<'Male' | 'Female'>('Male');
  const [zWeight, setZWeight] = useState('');
  const [zLength, setZLength] = useState('');
  const [zPosture, setZPosture] = useState<'recumbent' | 'standing'>('recumbent');
  const [zLoading, setZLoading] = useState(false);
  const [zError, setZError] = useState<string | null>(null);
  const [zResult, setZResult] = useState<PediatricZScoreResult | null>(null);

  const handleCalculateZScore = useCallback(async () => {
    const w = parsePositiveFloat(zWeight);
    const len = parsePositiveFloat(zLength);
    if (!zDob.trim() || !w || !len) {
      setZError('Enter a valid date of birth, weight (kg), and length/height (cm).');
      return;
    }
    setZLoading(true);
    setZError(null);
    const [res, err] = await clinicService.calculatePediatricZScore({
      dateOfBirth: zDob.trim(),
      sex: zSex,
      weightKg: w,
      lengthOrHeightCm: len,
      isMeasuredRecumbent: zPosture === 'recumbent',
    });
    if (err || !res) {
      setZResult(null);
      setZError(err?.message || 'Unable to compute WHO Z-scores. Ensure the child is under 5 years (0–60 months).');
    } else {
      setZResult(res);
    }
    setZLoading(false);
  }, [zDob, zSex, zWeight, zLength, zPosture]);

  // ── 4. OB EDD / AOG State ─────────────────────────────────────────────────
  const [lmpDate, setLmpDate] = useState('');
  const [cycleLength, setCycleLength] = useState('28');
  const [refDate, setRefDate] = useState(getTodayIsoDate());

  const obResult = useMemo(() => {
    if (!lmpDate.trim()) return null;
    const parsedCycle = parsePositiveFloat(cycleLength);
    return calculateObEddAndAog({
      lmpDateStr: lmpDate,
      cycleLengthDays: parsedCycle ?? 28,
      referenceDateStr: refDate,
    });
  }, [lmpDate, cycleLength, refDate]);

  // ── 5. Dosing & eGFR State ────────────────────────────────────────────────
  const [dosingSubMode, setDosingSubMode] = useState<'pediatric' | 'egfr'>('pediatric');

  // Pediatric Dosing
  const [doseWeight, setDoseWeight] = useState('');
  const [doseMgPerKg, setDoseMgPerKg] = useState('');
  const [doseMode, setDoseMode] = useState<PediatricDoseMode>('perDay');
  const [dosesPerDay, setDosesPerDay] = useState<'1' | '2' | '3' | '4'>('3');
  const [concMg, setConcMg] = useState('250');
  const [concMl, setConcMl] = useState('5');
  const [maxDailyMg, setMaxDailyMg] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const [activePresetNote, setActivePresetNote] = useState<string | null>(null);

  const pediatricDoseResult = useMemo(() => {
    const w = parsePositiveFloat(doseWeight);
    const mgKg = parsePositiveFloat(doseMgPerKg);
    if (!w || !mgKg) return null;
    return calculatePediatricDose({
      weightKg: w,
      doseMgPerKg: mgKg,
      mode: doseMode,
      dosesPerDay: Number(dosesPerDay),
      concentrationMg: parsePositiveFloat(concMg),
      concentrationMl: parsePositiveFloat(concMl),
      maxDailyDoseMg: parsePositiveFloat(maxDailyMg),
    });
  }, [doseWeight, doseMgPerKg, doseMode, dosesPerDay, concMg, concMl, maxDailyMg]);

  // Renal eGFR
  const [scrValue, setScrValue] = useState('');
  const [scrUnit, setScrUnit] = useState<CreatinineUnit>('mg/dL');
  const [renalAge, setRenalAge] = useState('');
  const [renalSex, setRenalSex] = useState<BiologicalSex>('male');
  const [renalWeight, setRenalWeight] = useState('');

  const renalResult = useMemo(() => {
    const scr = parsePositiveFloat(scrValue);
    const age = parsePositiveFloat(renalAge);
    if (!scr || !age) return null;
    return calculateRenalFunction({
      creatinineValue: scr,
      creatinineUnit: scrUnit,
      ageYears: age,
      sex: renalSex,
      weightKg: parsePositiveFloat(renalWeight),
    });
  }, [scrValue, scrUnit, renalAge, renalSex, renalWeight]);

  // ── Renderers ─────────────────────────────────────────────────────────────

  const renderBmiBsa = () => (
    <Card>
      <CardHeader
        title="BMI & Body Size (BSA)"
        subtitle="Calculates BMI (Global & Asia-Pacific ranges), Body Surface Area, and ideal body weight."
        icon="scale"
        rightAction={
          weightInput || heightCmInput || heightFtInput || heightInInput ? (
            <Button
              title="Reset"
              size="sm"
              variant="ghost"
              onPress={() => {
                setWeightInput('');
                setHeightCmInput('');
                setHeightFtInput('');
                setHeightInInput('');
              }}
            />
          ) : undefined
        }
      />

      <CalculatorWorkbench
        twoColumn={twoColWorkbench}
        inputs={
          <View style={styles.inputsStack}>
            <View style={styles.controlsRow}>
              <LabeledControl label="Units">
                <SegmentedControl
                  options={[
                    { value: 'metric', label: 'Metric (kg / cm)' },
                    { value: 'imperial', label: 'Imperial (lb / ft)' },
                  ]}
                  value={bmiUnit}
                  onChange={(v) => setBmiUnit(v)}
                />
              </LabeledControl>
              <LabeledControl label="Sex (for ideal weight)">
                <SegmentedControl
                  options={[
                    { value: 'unspecified', label: 'Any' },
                    { value: 'male', label: 'Male' },
                    { value: 'female', label: 'Female' },
                  ]}
                  value={bmiSex}
                  onChange={(v) => setBmiSex(v)}
                />
              </LabeledControl>
            </View>

            <View style={inputGroupStyle}>
              <View style={inputCellStyle}>
                <Input
                  label={bmiUnit === 'metric' ? 'Weight (kg)' : 'Weight (lb)'}
                  placeholder={bmiUnit === 'metric' ? 'e.g. 65' : 'e.g. 143'}
                  value={weightInput}
                  onChangeText={setWeightInput}
                  keyboardType="numeric"
                />
              </View>
              {bmiUnit === 'metric' ? (
                <View style={inputCellStyle}>
                  <Input
                    label="Height (cm)"
                    placeholder="e.g. 165"
                    value={heightCmInput}
                    onChangeText={setHeightCmInput}
                    keyboardType="numeric"
                  />
                </View>
              ) : (
                <>
                  <View style={inputCellStyle}>
                    <Input
                      label="Height (ft)"
                      placeholder="e.g. 5"
                      value={heightFtInput}
                      onChangeText={setHeightFtInput}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={inputCellStyle}>
                    <Input
                      label="Inches (in)"
                      placeholder="e.g. 5"
                      value={heightInInput}
                      onChangeText={setHeightInInput}
                      keyboardType="numeric"
                    />
                  </View>
                </>
              )}
            </View>
          </View>
        }
        results={
          bmiResult ? (
            <View style={styles.resultStack}>
              <View style={styles.statsRow}>
                <StatCard
                  label="Body Mass Index (BMI)"
                  value={`${bmiResult.bmi.toFixed(1)}`}
                  subtext="kg/m²"
                  icon="scale"
                  style={styles.statCardCompact}
                />
                <StatCard
                  label="Body Surface Area (BSA)"
                  value={`${bmiResult.bsaMosteller.toFixed(2)} m²`}
                  subtext={`Alt. (Du Bois): ${bmiResult.bsaDuBois.toFixed(2)} m²`}
                  icon="ruler"
                  style={styles.statCardCompact}
                />
                {bmiResult.idealBodyWeightKg !== null ? (
                  <StatCard
                    label="Ideal Body Weight"
                    value={`${bmiResult.idealBodyWeightKg.toFixed(1)} kg`}
                    subtext={bmiSex === 'male' ? 'Adult Male (Devine)' : 'Adult Female (Devine)'}
                    icon="patient"
                    style={styles.statCardCompact}
                  />
                ) : null}
              </View>

              <View style={styles.classificationBox}>
                <View style={styles.spreadRow}>
                  <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                    Asia-Pacific Range (Philippines)
                  </ThemedText>
                  <Badge label={bmiResult.asiaPacific.label} variant={bmiResult.asiaPacific.tone} />
                </View>
                <View style={styles.spreadRow}>
                  <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                    WHO Global Range
                  </ThemedText>
                  <Badge label={bmiResult.whoGlobal.label} variant={bmiResult.whoGlobal.tone} />
                </View>
              </View>
            </View>
          ) : (
            <PreviewCard
              icon="scale"
              title="BMI & Body Size Results"
              subtitle="Updates automatically as soon as weight and height are entered."
              bullets={[
                'Body Mass Index with Asia-Pacific & WHO Global categories',
                'Body Surface Area using Mosteller & Du Bois formulas',
                'Ideal adult weight when sex is chosen',
              ]}
            />
          )
        }
      />
    </Card>
  );

  const renderPhilPen = () => {
    const bandInfo = philpenResult ? riskBandMeta(philpenResult.riskBand) : null;

    return (
      <Card>
        <CardHeader
          title="Heart & Stroke Risk (PHILPEN)"
          subtitle="DOH PHILPEN 10-year heart and stroke risk check (Bands A–E)."
          icon="heartPulse"
          rightAction={
            hasCvdInputs ? (
              <Button
                title="Reset"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setCvdAge('');
                  setCvdSbp('');
                  setCvdDbp('');
                  setCvdFbs('');
                  setCvdCholesterol('');
                  setCvdBmi('');
                  setCvdSmoker(false);
                  setCvdDiabetes(false);
                  setCvdPriorAnginaMi(false);
                  setCvdPriorStrokeTia(false);
                  setCvdSevereChestPain(false);
                  setCvdTransientNeuro(false);
                }}
              />
            ) : undefined
          }
        />

        <CalculatorWorkbench
          twoColumn={twoColWorkbench}
          inputs={
            <View style={styles.inputsStack}>
              <View style={inputGroupStyle}>
                <View style={inputCellStyle}>
                  <Input
                    label="Age (years)"
                    placeholder="e.g. 56"
                    value={cvdAge}
                    onChangeText={setCvdAge}
                    keyboardType="numeric"
                  />
                </View>
                <View style={inputCellStyle}>
                  <LabeledControl label="Sex">
                    <SegmentedControl
                      options={[
                        { value: 'Male', label: 'Male' },
                        { value: 'Female', label: 'Female' },
                      ]}
                      value={cvdSex}
                      onChange={setCvdSex}
                    />
                  </LabeledControl>
                </View>
              </View>

              <View style={inputGroupStyle}>
                <View style={inputCellStyle}>
                  <Input
                    label="Systolic BP (mmHg)"
                    placeholder="e.g. 140"
                    value={cvdSbp}
                    onChangeText={setCvdSbp}
                    keyboardType="numeric"
                  />
                </View>
                <View style={inputCellStyle}>
                  <Input
                    label="Diastolic BP (mmHg)"
                    placeholder="e.g. 90"
                    value={cvdDbp}
                    onChangeText={setCvdDbp}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={inputGroupStyle}>
                <View style={inputCellStyle}>
                  <Input
                    label="Total Cholesterol (mg/dL)"
                    placeholder="Optional (uses BMI)"
                    value={cvdCholesterol}
                    onChangeText={setCvdCholesterol}
                    keyboardType="numeric"
                  />
                </View>
                <View style={inputCellStyle}>
                  <Input
                    label="BMI (kg/m²)"
                    placeholder="Used if cholesterol blank"
                    value={cvdBmi}
                    onChangeText={setCvdBmi}
                    keyboardType="numeric"
                  />
                </View>
                <View style={inputCellStyle}>
                  <Input
                    label="Fasting Blood Sugar (mg/dL)"
                    placeholder="Optional (126+ = high)"
                    value={cvdFbs}
                    onChangeText={setCvdFbs}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Risk Factors & History
                </ThemedText>
                <View style={styles.chipRow}>
                  <ToggleChip label="Current smoker" active={cvdSmoker} onPress={() => setCvdSmoker((v) => !v)} />
                  <ToggleChip label="Diagnosed diabetes" active={cvdDiabetes} onPress={() => setCvdDiabetes((v) => !v)} />
                  <ToggleChip
                    label="Prior angina / heart attack"
                    active={cvdPriorAnginaMi}
                    danger
                    onPress={() => setCvdPriorAnginaMi((v) => !v)}
                  />
                  <ToggleChip
                    label="Prior stroke / TIA"
                    active={cvdPriorStrokeTia}
                    danger
                    onPress={() => setCvdPriorStrokeTia((v) => !v)}
                  />
                </View>
              </View>

              <View style={styles.redFlagBox}>
                <View style={styles.redFlagHeader}>
                  <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                  <ThemedText variant="captionBold" color={theme.colors.emergencyText}>
                    Urgent Warning Symptoms (Immediate Elevation)
                  </ThemedText>
                </View>
                <View style={styles.chipRow}>
                  <ToggleChip
                    label="Severe chest pain > 30 min"
                    active={cvdSevereChestPain}
                    danger
                    onPress={() => setCvdSevereChestPain((v) => !v)}
                  />
                  <ToggleChip
                    label="Sudden weakness, numbness, or speech trouble"
                    active={cvdTransientNeuro}
                    danger
                    onPress={() => setCvdTransientNeuro((v) => !v)}
                  />
                </View>
              </View>
            </View>
          }
          results={
            philpenResult && bandInfo ? (
              <View
                style={[
                  styles.resultBox,
                  philpenResult.riskBand === 'BandE'
                    ? styles.resultBoxEmergency
                    : philpenResult.riskBand === 'BandD' || philpenResult.riskBand === 'BandC'
                      ? styles.resultBoxWarning
                      : styles.resultBoxValid,
                ]}
              >
                <View style={styles.spreadRow}>
                  <Badge label={bandInfo.label} variant={bandInfo.variant} />
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Score: {philpenResult.totalPoints} pts
                  </ThemedText>
                </View>

                <View style={styles.statsRow}>
                  <StatCard
                    label="10-Year Risk Estimate"
                    value={`${philpenResult.calculatedScorePercent.toFixed(1)}%`}
                    subtext={`Range: ${bandInfo.range}`}
                    icon="heartPulse"
                    style={styles.statCardCompact}
                  />
                </View>

                {philpenResult.crisisOverrideApplied && philpenResult.overrideReason ? (
                  <ThemedText variant="smallBold" color={theme.colors.emergencyText}>
                    {philpenResult.overrideReason}
                  </ThemedText>
                ) : null}

                <View style={styles.recommendationBlock}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Recommended Next Steps
                  </ThemedText>
                  <ThemedText variant="small">{philpenResult.managementRecommendation}</ThemedText>
                </View>

                {philpenResult.usedBmiFallback ? (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Estimated using BMI because total cholesterol was not entered.
                  </ThemedText>
                ) : null}
              </View>
            ) : (
              <PreviewCard
                icon="heartPulse"
                title="10-Year Risk Band (A–E)"
                subtitle="Enter patient age, blood pressure, or heart history on the left."
                bullets={[
                  'Scores 10-year heart attack and stroke risk from Band A (< 10%) to Band E (40%+)',
                  'Automatically flags hypertensive crises and urgent warning symptoms',
                  'Provides clear clinical follow-up guidance',
                ]}
              />
            )
          }
        />
      </Card>
    );
  };

  const renderPediatricZScore = () => {
    if (!canAccessPediatricZScore) {
      return (
        <Card>
          <EmptyState
            icon="lock"
            title="Access restricted"
            description="Ask a clinic administrator to enable patient record access for your account."
          />
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="Child Growth Check (WHO 0–59 Months)"
          subtitle="WHO weight and height growth check for children aged 0–59 months."
          icon="baby"
          rightAction={
            zResult || zDob || zWeight || zLength ? (
              <Button
                title="Reset"
                size="sm"
                variant="ghost"
                onPress={() => {
                  setZDob('');
                  setZWeight('');
                  setZLength('');
                  setZResult(null);
                  setZError(null);
                }}
              />
            ) : undefined
          }
        />

        <CalculatorWorkbench
          twoColumn={twoColWorkbench}
          inputs={
            <View style={styles.inputsStack}>
              <View style={inputGroupStyle}>
                <View style={inputCellStyle}>
                  <ValidatedDateInput
                    label="Date of birth"
                    placeholder="YYYY-MM-DD"
                    value={zDob}
                    onChangeText={(val) => {
                      setZDob(val);
                      setZError(null);
                    }}
                    boundaryMode="pastOrToday"
                  />
                </View>
                <View style={inputCellStyle}>
                  <LabeledControl label="Sex">
                    <SegmentedControl
                      options={[
                        { value: 'Male', label: 'Male' },
                        { value: 'Female', label: 'Female' },
                      ]}
                      value={zSex}
                      onChange={setZSex}
                    />
                  </LabeledControl>
                </View>
              </View>

              <View style={inputGroupStyle}>
                <View style={inputCellStyle}>
                  <Input
                    label="Weight (kg)"
                    placeholder="e.g. 10.4"
                    value={zWeight}
                    onChangeText={setZWeight}
                    keyboardType="numeric"
                  />
                </View>
                <View style={inputCellStyle}>
                  <Input
                    label="Length / Height (cm)"
                    placeholder="e.g. 79.5"
                    value={zLength}
                    onChangeText={setZLength}
                    keyboardType="numeric"
                  />
                </View>
              </View>

              <LabeledControl label="Measurement Position">
                <SegmentedControl
                  options={[
                    { value: 'recumbent', label: 'Lying down (< 2 yrs)' },
                    { value: 'standing', label: 'Standing (2+ yrs)' },
                  ]}
                  value={zPosture}
                  onChange={setZPosture}
                />
              </LabeledControl>

              <View style={styles.actionsRow}>
                <Button
                  title="Check Child Growth"
                  icon="calculator"
                  variant="primary"
                  loading={zLoading}
                  onPress={handleCalculateZScore}
                />
              </View>
            </View>
          }
          results={
            zLoading ? (
              <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
            ) : zError ? (
              <ErrorState
                compact
                title="Unable to check child growth"
                message={zError}
                onRetry={handleCalculateZScore}
              />
            ) : zResult ? (
              <View style={styles.resultStack}>
                <View style={styles.statsRow}>
                  <StatCard
                    label="Child Age"
                    value={`${zResult.ageInMonths} mo`}
                    subtext={`Adjusted length/height: ${zResult.adjustedLengthHeightCm.toFixed(1)} cm`}
                    icon="baby"
                    style={styles.statCardCompact}
                  />
                  {zResult.weightForAgeZScore !== undefined ? (
                    <StatCard
                      label="Weight-for-Age"
                      value={zResult.weightForAgeZScore.toFixed(2)}
                      subtext="Z-score (SD)"
                      icon="scale"
                      style={styles.statCardCompact}
                    />
                  ) : null}
                  {zResult.heightForAgeZScore !== undefined ? (
                    <StatCard
                      label="Length/Height-for-Age"
                      value={zResult.heightForAgeZScore.toFixed(2)}
                      subtext="Z-score (SD)"
                      icon="ruler"
                      style={styles.statCardCompact}
                    />
                  ) : null}
                  {zResult.weightForHeightZScore !== undefined ? (
                    <StatCard
                      label="Weight-for-Length/Height"
                      value={zResult.weightForHeightZScore.toFixed(2)}
                      subtext="Z-score (SD)"
                      icon="activity"
                      style={styles.statCardCompact}
                    />
                  ) : null}
                </View>

                <View style={styles.classificationBox}>
                  <View style={styles.spreadRow}>
                    <ThemedText variant="bodyBold">Growth Classification</ThemedText>
                    {zResult.philHealthZScoreCategory ? (
                      <Badge
                        label={
                          zResult.philHealthZScoreCode
                            ? `${zResult.philHealthZScoreCategory} (${zResult.philHealthZScoreCode})`
                            : zResult.philHealthZScoreCategory
                        }
                        variant={zScoreTone(zResult.weightForHeightZScore ?? zResult.weightForAgeZScore)}
                      />
                    ) : null}
                  </View>
                  {zResult.interpretation ? (
                    <ThemedText variant="small" color={theme.colors.textSecondary}>
                      {zResult.interpretation}
                    </ThemedText>
                  ) : null}
                </View>
              </View>
            ) : (
              <PreviewCard
                icon="baby"
                title="WHO Growth Assessment"
                subtitle="Enter date of birth, weight, and height, then tap Check Child Growth."
                bullets={[
                  'Weight-for-Age, Height-for-Age, and Weight-for-Height percentiles',
                  'Automatic length adjustment based on lying or standing posture',
                  'Official WHO & PhilHealth growth classification',
                ]}
              />
            )
          }
        />
      </Card>
    );
  };

  const renderObEdd = () => (
    <Card>
      <CardHeader
        title="Pregnancy Due Date & Weeks (EDD / AOG)"
        subtitle="Estimates due date, weeks pregnant, trimester, and checkup milestones based on last period."
        icon="calendar"
        rightAction={
          lmpDate ? (
            <Button
              title="Reset"
              size="sm"
              variant="ghost"
              onPress={() => {
                setLmpDate('');
                setCycleLength('28');
                setRefDate(getTodayIsoDate());
              }}
            />
          ) : undefined
        }
      />

      <CalculatorWorkbench
        twoColumn={twoColWorkbench}
        inputs={
          <View style={styles.inputsStack}>
            <ValidatedDateInput
              label="Last Menstrual Period (LMP)"
              placeholder="YYYY-MM-DD"
              value={lmpDate}
              onChangeText={setLmpDate}
              boundaryMode="pastOrToday"
            />
            <View style={inputGroupStyle}>
              <View style={inputCellStyle}>
                <Input
                  label="Cycle length (days)"
                  placeholder="28"
                  value={cycleLength}
                  onChangeText={setCycleLength}
                  keyboardType="numeric"
                />
              </View>
              <View style={inputCellStyle}>
                <ValidatedDateInput
                  label="Reference date"
                  placeholder="YYYY-MM-DD"
                  value={refDate}
                  onChangeText={setRefDate}
                  boundaryMode="any"
                />
              </View>
            </View>
          </View>
        }
        results={
          obResult ? (
            <View style={styles.resultStack}>
              <View style={styles.statsRow}>
                <StatCard
                  label="Estimated Due Date (EDD)"
                  value={obResult.eddDateStr}
                  subtext={
                    obResult.daysRemaining >= 0
                      ? `${obResult.daysRemaining} days remaining`
                      : `${Math.abs(obResult.daysRemaining)} days past due date`
                  }
                  icon="calendar"
                  style={styles.statCardCompact}
                />
                <StatCard
                  label="Weeks Pregnant (AOG)"
                  value={obResult.aogFormatted}
                  subtext={`${obResult.aogTotalDays} total days`}
                  icon="clock"
                  style={styles.statCardCompact}
                />
                <StatCard
                  label="Estimated Conception"
                  value={obResult.conceptionDateStr}
                  subtext={`${obResult.cycleLengthDays}-day cycle`}
                  icon="heartPulse"
                  style={styles.statCardCompact}
                />
              </View>

              <View style={styles.classificationBox}>
                <View style={styles.spreadRow}>
                  <ThemedText variant="bodyBold">Pregnancy Progress ({obResult.progressPercent}%)</ThemedText>
                  <Badge label={obResult.trimesterLabel} variant={obResult.trimesterTone} />
                </View>
                <ProgressBar progress={obResult.progressPercent} color={theme.colors.primary} />
              </View>

              <View style={styles.fieldGroup}>
                <ThemedText variant="bodyBold">Prenatal Milestones</ThemedText>
                {obResult.milestones.map((m) => (
                  <View key={m.weeks} style={styles.listRow}>
                    <View style={styles.flexFill}>
                      <ThemedText variant="smallBold">
                        Week {m.weeks} · {m.label}
                      </ThemedText>
                    </View>
                    <View style={styles.milestoneEnd}>
                      <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                        {m.dateStr}
                      </ThemedText>
                      <Badge
                        label={m.reached ? 'Reached' : 'Upcoming'}
                        variant={m.reached ? 'success' : 'neutral'}
                        size="xs"
                      />
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <PreviewCard
              icon="calendar"
              title="Due Date & Prenatal Timeline"
              subtitle="Enter the Last Menstrual Period (LMP) date to calculate."
              bullets={[
                'Estimated due date adjusted for cycle length',
                'Current gestational age in weeks and days plus trimester badge',
                'Key prenatal checkup and ultrasound scan dates',
              ]}
            />
          )
        }
      />
    </Card>
  );

  const renderDosingAndEgfr = () => {
    const hasPediatricInputs = Boolean(doseWeight || doseMgPerKg || maxDailyMg);
    const hasRenalInputs = Boolean(scrValue || renalAge || renalWeight);

    const handleResetDosing = () => {
      if (dosingSubMode === 'pediatric') {
        setDoseWeight('');
        setDoseMgPerKg('');
        setMaxDailyMg('');
        setSelectedPresetId(null);
        setActivePresetNote(null);
      } else {
        setScrValue('');
        setRenalAge('');
        setRenalWeight('');
      }
    };

    const showReset = dosingSubMode === 'pediatric' ? hasPediatricInputs : hasRenalInputs;

    return (
      <Card>
        <CardHeader
          title={
            dosingSubMode === 'pediatric'
              ? 'Child Weight-Based Dosing'
              : 'Adult Kidney Function (eGFR & CrCl)'
          }
          subtitle={
            dosingSubMode === 'pediatric'
              ? 'Calculate single dose and daily total in mg and liquid mL, with daily safety limit checks.'
              : 'Estimates kidney filtration (eGFR) and drug-dosing clearance (ages 18+).'
          }
          icon={dosingSubMode === 'pediatric' ? 'syringe' : 'droplet'}
          rightAction={
            <View style={styles.headerToolbarActions}>
              <SegmentedControl
                options={[
                  { value: 'pediatric', label: 'Child Dosing', icon: 'syringe' },
                  { value: 'egfr', label: 'Adult Kidney', icon: 'droplet' },
                ]}
                value={dosingSubMode}
                onChange={setDosingSubMode}
              />
              {showReset ? (
                <Button title="Reset" size="sm" variant="ghost" onPress={handleResetDosing} />
              ) : null}
            </View>
          }
        />

        {dosingSubMode === 'pediatric' ? (
          <CalculatorWorkbench
            twoColumn={twoColWorkbench}
            inputs={
              <View style={styles.inputsStack}>
                <View style={styles.fieldGroup}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Common Medicine Presets (Confirm before prescribing)
                  </ThemedText>
                  <View style={styles.presetGrid}>
                    {PEDIATRIC_DOSE_PRESETS.map((preset) => {
                      const display = PRESET_DISPLAY_META[preset.id];
                      const isSelected = selectedPresetId === preset.id;
                      return (
                        <Pressable
                          key={preset.id}
                          onPress={() => {
                            setDoseMgPerKg(String(preset.doseMgPerKg));
                            setDoseMode(preset.mode);
                            setDosesPerDay(String(preset.dosesPerDay) as '1' | '2' | '3' | '4');
                            setConcMg(String(preset.concentrationMg));
                            setConcMl(String(preset.concentrationMl));
                            setMaxDailyMg(String(preset.maxDailyDoseMg));
                            setSelectedPresetId(preset.id);
                            setActivePresetNote(preset.note);
                          }}
                          accessibilityRole="button"
                          style={(state: HoverState) => [
                            styles.presetChip,
                            isSelected && styles.presetChipActive,
                            !isSelected && state.hovered && styles.presetChipHover,
                            state.pressed && styles.presetChipPressed,
                          ]}
                        >
                          <ThemedText
                            variant="smallBold"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                          >
                            {display?.name ?? preset.label}
                          </ThemedText>
                          <ThemedText
                            variant="caption"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.textMuted}
                          >
                            {display?.schedule ?? ''}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {activePresetNote ? (
                    <View style={styles.presetNoteBox}>
                      <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.primary} />
                      <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flexFill}>
                        {activePresetNote}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={inputGroupStyle}>
                  <View style={inputCellStyle}>
                    <Input
                      label="Child weight (kg)"
                      placeholder="e.g. 14"
                      value={doseWeight}
                      onChangeText={setDoseWeight}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={inputCellStyle}>
                    <Input
                      label={doseMode === 'perDay' ? 'Target dose (mg/kg/day)' : 'Target dose (mg/kg/dose)'}
                      placeholder="e.g. 45"
                      value={doseMgPerKg}
                      onChangeText={(val) => {
                        setDoseMgPerKg(val);
                        setSelectedPresetId(null);
                      }}
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={styles.controlsRow}>
                  <LabeledControl label="Dose Type">
                    <SegmentedControl
                      options={[
                        { value: 'perDay', label: 'mg/kg/day (daily total)' },
                        { value: 'perDose', label: 'mg/kg/dose (each)' },
                      ]}
                      value={doseMode}
                      onChange={setDoseMode}
                    />
                  </LabeledControl>
                  <LabeledControl label="Schedule">
                    <SegmentedControl
                      options={[
                        { value: '1', label: 'Once daily (24h)' },
                        { value: '2', label: 'Twice daily (12h)' },
                        { value: '3', label: '3x daily (8h)' },
                        { value: '4', label: '4x daily (6h)' },
                      ]}
                      value={dosesPerDay}
                      onChange={(val) => {
                        setDosesPerDay(val);
                        setSelectedPresetId(null);
                      }}
                    />
                  </LabeledControl>
                </View>

                <View style={inputGroupStyle}>
                  <View style={styles.concentrationGroup}>
                    <View style={styles.concentrationInput}>
                      <Input
                        label="Medicine strength (mg)"
                        placeholder="e.g. 250"
                        value={concMg}
                        onChangeText={setConcMg}
                        keyboardType="numeric"
                      />
                    </View>
                    <View style={styles.slashDivider}>
                      <ThemedText variant="h3" color={theme.colors.textMuted}>
                        /
                      </ThemedText>
                    </View>
                    <View style={styles.concentrationInput}>
                      <Input
                        label="Liquid volume (mL)"
                        placeholder="e.g. 5"
                        value={concMl}
                        onChangeText={setConcMl}
                        keyboardType="numeric"
                      />
                    </View>
                  </View>
                  <View style={inputCellStyle}>
                    <Input
                      label="Daily safety limit (mg/day)"
                      placeholder="Optional daily max"
                      value={maxDailyMg}
                      onChangeText={setMaxDailyMg}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            }
            results={
              pediatricDoseResult ? (
                <View style={styles.resultStack}>
                  {pediatricDoseResult.exceedsMaxDaily ? (
                    <View style={[styles.resultBox, styles.resultBoxEmergency]}>
                      <View style={styles.resultHeader}>
                        <Badge label="Exceeds Daily Safety Limit" variant="emergency" icon="alertCircle" />
                      </View>
                      <ThemedText variant="small" color={theme.colors.emergencyText}>
                        Calculated daily total ({pediatricDoseResult.dailyTotalMg} mg/day) exceeds the limit (
                        {pediatricDoseResult.cappedDailyTotalMg} mg/day). Capped single dose:{' '}
                        {pediatricDoseResult.cappedSingleDoseMg} mg
                        {pediatricDoseResult.cappedSingleDoseMl !== null
                          ? ` (${pediatricDoseResult.cappedSingleDoseMl} mL)`
                          : ''}{' '}
                        every {pediatricDoseResult.intervalHours}h.
                      </ThemedText>
                    </View>
                  ) : null}

                  <View style={styles.statsRow}>
                    <StatCard
                      label={`Single Dose (every ${pediatricDoseResult.intervalHours}h)`}
                      value={`${pediatricDoseResult.singleDoseMg} mg`}
                      subtext={
                        pediatricDoseResult.singleDoseMl !== null
                          ? `${pediatricDoseResult.singleDoseMl} mL per dose`
                          : `${pediatricDoseResult.dosesPerDay}x daily`
                      }
                      icon="syringe"
                      style={styles.statCardCompact}
                    />
                    <StatCard
                      label="Total Daily Dose"
                      value={`${pediatricDoseResult.dailyTotalMg} mg/day`}
                      subtext={
                        pediatricDoseResult.dailyTotalMl !== null
                          ? `${pediatricDoseResult.dailyTotalMl} mL / day`
                          : `${pediatricDoseResult.dosesPerDay} doses / day`
                      }
                      icon="pill"
                      style={styles.statCardCompact}
                    />
                  </View>
                </View>
              ) : (
                <PreviewCard
                  icon="syringe"
                  title="Weight-Based Dose Results"
                  subtitle="Pick a medicine preset or enter target dose and child weight."
                  bullets={[
                    'Exact single dose in mg and liquid volume in mL',
                    'Total daily medicine amount matched to your schedule',
                    'Automatic safety alert if daily max dose is exceeded',
                  ]}
                />
              )
            }
          />
        ) : (
          <CalculatorWorkbench
            twoColumn={twoColWorkbench}
            inputs={
              <View style={styles.inputsStack}>
                <View style={styles.controlsRow}>
                  <LabeledControl label="Creatinine Unit">
                    <SegmentedControl
                      options={[
                        { value: 'mg/dL', label: 'mg/dL' },
                        { value: 'umol/L', label: 'µmol/L' },
                      ]}
                      value={scrUnit}
                      onChange={setScrUnit}
                    />
                  </LabeledControl>
                  <LabeledControl label="Sex">
                    <SegmentedControl
                      options={[
                        { value: 'male', label: 'Male' },
                        { value: 'female', label: 'Female' },
                      ]}
                      value={renalSex}
                      onChange={setRenalSex}
                    />
                  </LabeledControl>
                </View>

                <View style={inputGroupStyle}>
                  <View style={inputCellStyle}>
                    <Input
                      label={`Serum Creatinine (${scrUnit})`}
                      placeholder={scrUnit === 'mg/dL' ? 'e.g. 1.1' : 'e.g. 97'}
                      value={scrValue}
                      onChangeText={setScrValue}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={inputCellStyle}>
                    <Input
                      label="Age (years, 18+)"
                      placeholder="e.g. 54"
                      value={renalAge}
                      onChangeText={setRenalAge}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={inputCellStyle}>
                    <Input
                      label="Weight (kg, optional)"
                      placeholder="For CrCl dosing"
                      value={renalWeight}
                      onChangeText={setRenalWeight}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
              </View>
            }
            results={
              renalResult ? (
                <View style={styles.resultStack}>
                  <View style={styles.statsRow}>
                    <StatCard
                      label="Kidney Filtration (eGFR)"
                      value={`${renalResult.egfrCkdEpi2021}`}
                      subtext="mL/min/1.73 m²"
                      icon="droplet"
                      style={styles.statCardCompact}
                    />
                    {renalResult.cockcroftGaultCrCl !== null ? (
                      <StatCard
                        label="Creatinine Clearance (CrCl)"
                        value={`${renalResult.cockcroftGaultCrCl}`}
                        subtext="mL/min (for drug dosing)"
                        icon="activity"
                        style={styles.statCardCompact}
                      />
                    ) : null}
                  </View>

                  <View style={styles.classificationBox}>
                    <View style={styles.spreadRow}>
                      <ThemedText variant="bodyBold">Kidney Stage (KDIGO)</ThemedText>
                      <Badge
                        label={`${renalResult.kdigoStage} · ${renalResult.kdigoLabel}`}
                        variant={renalResult.kdigoTone}
                      />
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      CKD-EPI 2021 & Cockcroft-Gault · Converted creatinine: {renalResult.creatinineMgDl.toFixed(2)}{' '}
                      mg/dL. Repeat tests after 3+ months and check urine protein before confirming long-term kidney stage.
                    </ThemedText>
                  </View>
                </View>
              ) : (
                <PreviewCard
                  icon="droplet"
                  title="Adult Kidney Results"
                  subtitle="Enter serum creatinine and adult age (18+) to calculate."
                  bullets={[
                    'Estimated kidney filtration rate (eGFR)',
                    'Kidney stage classification (G1 to G5)',
                    'Drug-dosing creatinine clearance (CrCl) when weight is added',
                  ]}
                />
              )
            }
          />
        )}
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <SegmentedControl
        options={CALCULATOR_OPTIONS}
        value={activeTool}
        onChange={onSelectTool}
      />

      {activeTool === 'bmi-bsa' ? renderBmiBsa() : null}
      {activeTool === 'philpen' ? renderPhilPen() : null}
      {activeTool === 'pediatric-zscore' ? renderPediatricZScore() : null}
      {activeTool === 'ob-edd' ? renderObEdd() : null}
      {activeTool === 'dosing-egfr' ? renderDosingAndEgfr() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  flexFill: {
    flex: 1,
  },
  fullWidth: {
    width: '100%',
  },
  inputsStack: {
    gap: theme.spacing.md,
  },
  headerToolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    alignItems: 'flex-start',
  },
  inputWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    alignItems: 'flex-end',
  },
  inputCell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 190,
    minWidth: 185,
  },
  inputCol: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  concentrationGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: theme.spacing.xs,
    flexGrow: 1.4,
    flexShrink: 1,
    minWidth: 220,
  },
  concentrationInput: {
    flex: 1,
    minWidth: 90,
  },
  slashDivider: {
    height: theme.sizes.controlMd,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  redFlagBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
    backgroundColor: theme.colors.emergencySubtle,
    gap: theme.spacing.sm,
  },
  redFlagHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  presetChip: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    gap: theme.spacing.xs / 2,
    flexGrow: 1,
    flexBasis: 165,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 140ms ease, border-color 140ms ease',
      } as any,
    }),
  },
  presetChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  presetChipHover: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.primaryBorder,
  },
  presetChipPressed: {
    opacity: 0.88,
  },
  presetNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
  },
  toggleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs + 2,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  toggleChipActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  toggleChipDanger: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  resultStack: {
    gap: theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statCardCompact: {
    flex: 1,
    minWidth: 145,
  },
  classificationBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.sm,
  },
  recommendationBlock: {
    gap: theme.spacing.xs,
  },
  resultBox: {
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
  },
  resultBoxValid: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  resultBoxWarning: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
  },
  resultBoxEmergency: {
    backgroundColor: theme.colors.emergencySubtle,
    borderColor: theme.colors.emergencyBorder,
  },
  resultHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  spreadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  milestoneEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
