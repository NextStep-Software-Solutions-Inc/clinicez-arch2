import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
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

export interface ClinicalCalculatorsSectionProps {
  activeTool: CalculatorSubTool;
  onSelectTool: (tool: CalculatorSubTool) => void;
  canAccessPediatricZScore: boolean;
}

const CALCULATOR_OPTIONS: Array<{
  value: CalculatorSubTool;
  label: string;
  icon: 'scale' | 'heartPulse' | 'baby' | 'calendar' | 'syringe';
}> = [
  { value: 'bmi-bsa', label: 'BMI & BSA', icon: 'scale' },
  { value: 'philpen', label: 'PHILPEN CVD', icon: 'heartPulse' },
  { value: 'pediatric-zscore', label: 'Pediatric Z-Score', icon: 'baby' },
  { value: 'ob-edd', label: 'OB EDD / AOG', icon: 'calendar' },
  { value: 'dosing-egfr', label: 'Dosing & eGFR', icon: 'syringe' },
];

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
      return { label: 'Band E · Critical Risk', range: '≥ 40%', variant: 'emergency' };
    case 'BandD':
      return { label: 'Band D · Very High Risk', range: '30% to < 40%', variant: 'urgent' };
    case 'BandC':
      return { label: 'Band C · High Risk', range: '20% to < 30%', variant: 'warning' };
    case 'BandB':
      return { label: 'Band B · Moderate Risk', range: '10% to < 20%', variant: 'info' };
    case 'BandA':
    default:
      return { label: 'Band A · Low Risk', range: '< 10%', variant: 'routine' };
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
  const { isCompact } = useBreakpoint();
  const rowStyle = isCompact ? styles.inputCol : styles.inputRow;

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
      cvdPriorStrokeTia,
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
        title="BMI & Body Surface Area (BSA)"
        subtitle="Computes WHO Global and Asia-Pacific BMI cutoffs, Mosteller & Du Bois BSA, and Devine Ideal Body Weight."
        icon="scale"
        rightAction={
          weightInput || heightCmInput || heightFtInput ? (
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

      <View style={styles.controlsRow}>
        <SegmentedControl
          options={[
            { value: 'metric', label: 'Metric (kg / cm)' },
            { value: 'imperial', label: 'Imperial (lb / ft)' },
          ]}
          value={bmiUnit}
          onChange={(v) => setBmiUnit(v)}
        />
        <SegmentedControl
          options={[
            { value: 'unspecified', label: 'Sex: Any' },
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
          ]}
          value={bmiSex}
          onChange={(v) => setBmiSex(v)}
        />
      </View>

      <View style={rowStyle}>
        <View style={styles.flexFill}>
          <Input
            label={bmiUnit === 'metric' ? 'Weight (kg)' : 'Weight (lb)'}
            placeholder={bmiUnit === 'metric' ? 'e.g. 65' : 'e.g. 143'}
            value={weightInput}
            onChangeText={setWeightInput}
            keyboardType="numeric"
          />
        </View>
        {bmiUnit === 'metric' ? (
          <View style={styles.flexFill}>
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
            <View style={styles.flexFill}>
              <Input
                label="Height (ft)"
                placeholder="e.g. 5"
                value={heightFtInput}
                onChangeText={setHeightFtInput}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
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

      {bmiResult ? (
        <View style={styles.resultStack}>
          <View style={styles.statsRow}>
            <StatCard
              label="Body Mass Index (BMI)"
              value={`${bmiResult.bmi.toFixed(1)}`}
              subtext="kg/m²"
              icon="scale"
              style={styles.statCard}
            />
            <StatCard
              label="BSA (Mosteller)"
              value={`${bmiResult.bsaMosteller.toFixed(2)} m²`}
              subtext={`Du Bois: ${bmiResult.bsaDuBois.toFixed(2)} m²`}
              icon="ruler"
              style={styles.statCard}
            />
            {bmiResult.idealBodyWeightKg !== null ? (
              <StatCard
                label="Ideal Body Weight (Devine)"
                value={`${bmiResult.idealBodyWeightKg.toFixed(1)} kg`}
                subtext={bmiSex === 'male' ? 'Adult Male' : 'Adult Female'}
                icon="patient"
                style={styles.statCard}
              />
            ) : null}
          </View>

          <View style={styles.classificationBox}>
            <View style={styles.spreadRow}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                WHO Asia-Pacific (Philippines)
              </ThemedText>
              <Badge label={bmiResult.asiaPacific.label} variant={bmiResult.asiaPacific.tone} />
            </View>
            <View style={styles.spreadRow}>
              <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                WHO Global Standard
              </ThemedText>
              <Badge label={bmiResult.whoGlobal.label} variant={bmiResult.whoGlobal.tone} />
            </View>
          </View>
        </View>
      ) : (
        <EmptyState
          icon="scale"
          title="Enter weight and height"
          description="Results update automatically with WHO Global, WHO Asia-Pacific, and Mosteller/Du Bois BSA values."
        />
      )}
    </Card>
  );

  const renderPhilPen = () => {
    const bandInfo = philpenResult ? riskBandMeta(philpenResult.riskBand) : null;

    return (
      <Card>
        <CardHeader
          title="PHILPEN 10-Year CVD Risk Calculator"
          subtitle="WHO/ISH & DOH PHILPEN protocol aligned with PhilHealth Yakap (lib_ncdq Q17) risk bands A–E."
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

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Age (years)"
              placeholder="e.g. 56"
              value={cvdAge}
              onChangeText={setCvdAge}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
              Sex
            </ThemedText>
            <SegmentedControl
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
              ]}
              value={cvdSex}
              onChange={setCvdSex}
            />
          </View>
        </View>

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Systolic BP (mmHg)"
              placeholder="e.g. 140"
              value={cvdSbp}
              onChangeText={setCvdSbp}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="Diastolic BP (mmHg)"
              placeholder="e.g. 90"
              value={cvdDbp}
              onChangeText={setCvdDbp}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Total Cholesterol (mg/dL)"
              placeholder="Optional — falls back to BMI"
              value={cvdCholesterol}
              onChangeText={setCvdCholesterol}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="BMI (kg/m²)"
              placeholder="Used if no cholesterol lab"
              value={cvdBmi}
              onChangeText={setCvdBmi}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="Fasting Blood Sugar (mg/dL)"
              placeholder="Optional (≥126 flags DM)"
              value={cvdFbs}
              onChangeText={setCvdFbs}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            Risk Factors & Clinical Overrides
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
            <ToggleChip
              label="Severe chest pain > 30 min"
              active={cvdSevereChestPain}
              danger
              onPress={() => setCvdSevereChestPain((v) => !v)}
            />
            <ToggleChip
              label="Transient neuro deficits"
              active={cvdTransientNeuro}
              danger
              onPress={() => setCvdTransientNeuro((v) => !v)}
            />
          </View>
        </View>

        {philpenResult && bandInfo ? (
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
              <View style={styles.resultHeader}>
                <Badge label={bandInfo.label} variant={bandInfo.variant} />
                <Badge label={`10-yr risk: ${philpenResult.calculatedScorePercent.toFixed(1)}% (${bandInfo.range})`} variant="neutral" size="sm" />
              </View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Score: {philpenResult.totalPoints} pts
              </ThemedText>
            </View>

            {philpenResult.crisisOverrideApplied && philpenResult.overrideReason ? (
              <ThemedText variant="smallBold" color={theme.colors.emergencyText}>
                {philpenResult.overrideReason}
              </ThemedText>
            ) : null}

            <ThemedText variant="small">{philpenResult.managementRecommendation}</ThemedText>

            {philpenResult.usedBmiFallback ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Computed using WHO non-laboratory BMI fallback (no total cholesterol value entered).
              </ThemedText>
            ) : null}
          </View>
        ) : (
          <EmptyState
            icon="heartPulse"
            title="Enter patient age, blood pressure, or CVD history"
            description="Computes the statutory DOH PHILPEN 10-year cardiovascular risk band and management guidance."
          />
        )}
      </Card>
    );
  };

  const renderPediatricZScore = () => {
    if (!canAccessPediatricZScore) {
      return (
        <Card>
          <EmptyState
            icon="lock"
            title="Clinical patient read permission required"
            description="Pediatric Growth Z-Score lookup requires patients:read permission on the clinic server."
          />
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader
          title="Pediatric Growth Z-Score (WHO 0–59 Months)"
          subtitle="Computes WHO Weight-for-Age, Length/Height-for-Age, and Weight-for-Length Z-scores using the clinic server tables."
          icon="baby"
        />

        <View style={rowStyle}>
          <View style={styles.flexFill}>
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
          <View style={styles.flexFill}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
              Sex
            </ThemedText>
            <SegmentedControl
              options={[
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
              ]}
              value={zSex}
              onChange={setZSex}
            />
          </View>
        </View>

        <View style={rowStyle}>
          <View style={styles.flexFill}>
            <Input
              label="Weight (kg)"
              placeholder="e.g. 10.4"
              value={zWeight}
              onChangeText={setZWeight}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <Input
              label="Length / Height (cm)"
              placeholder="e.g. 79.5"
              value={zLength}
              onChangeText={setZLength}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.flexFill}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.fieldLabel}>
              Posture
            </ThemedText>
            <SegmentedControl
              options={[
                { value: 'recumbent', label: 'Recumbent (<2y)' },
                { value: 'standing', label: 'Standing (≥2y)' },
              ]}
              value={zPosture}
              onChange={setZPosture}
            />
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Button
            title="Calculate WHO Z-Score"
            icon="calculator"
            variant="primary"
            loading={zLoading}
            onPress={handleCalculateZScore}
          />
          {zResult || zDob || zWeight || zLength ? (
            <Button
              title="Reset"
              variant="ghost"
              onPress={() => {
                setZDob('');
                setZWeight('');
                setZLength('');
                setZResult(null);
                setZError(null);
              }}
            />
          ) : null}
        </View>

        {zLoading ? (
          <SkeletonList rows={3} rowHeight={theme.sizes.controlMd} />
        ) : zError ? (
          <ErrorState
            compact
            title="Unable to compute Z-Score"
            message={zError}
            onRetry={handleCalculateZScore}
          />
        ) : zResult ? (
          <View style={styles.resultStack}>
            <View style={styles.statsRow}>
              <StatCard
                label="Age"
                value={`${zResult.ageInMonths} mo`}
                subtext={`Adjusted len: ${zResult.adjustedLengthHeightCm.toFixed(1)} cm`}
                icon="baby"
                style={styles.statCard}
              />
              {zResult.weightForAgeZScore !== undefined ? (
                <StatCard
                  label="Weight-for-Age (WAZ)"
                  value={zResult.weightForAgeZScore.toFixed(2)}
                  subtext="SD"
                  icon="scale"
                  style={styles.statCard}
                />
              ) : null}
              {zResult.heightForAgeZScore !== undefined ? (
                <StatCard
                  label="Height-for-Age (HAZ)"
                  value={zResult.heightForAgeZScore.toFixed(2)}
                  subtext="SD"
                  icon="ruler"
                  style={styles.statCard}
                />
              ) : null}
              {zResult.weightForHeightZScore !== undefined ? (
                <StatCard
                  label="Weight-for-Height (WHZ)"
                  value={zResult.weightForHeightZScore.toFixed(2)}
                  subtext="SD"
                  icon="activity"
                  style={styles.statCard}
                />
              ) : null}
            </View>

            <View style={styles.classificationBox}>
              <View style={styles.spreadRow}>
                <ThemedText variant="bodyBold">WHO / PhilHealth Assessment</ThemedText>
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
          <EmptyState
            icon="baby"
            title="Ready to assess child growth"
            description="Enter date of birth, weight, and length/height to calculate WHO Z-scores and PhilHealth classification."
          />
        )}
      </Card>
    );
  };

  const renderObEdd = () => (
    <Card>
      <CardHeader
        title="OB Estimated Due Date (EDD) & Gestational Age (AOG)"
        subtitle="Naegele’s rule with menstrual cycle adjustment, trimester tracking, and key prenatal milestones."
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

      <View style={rowStyle}>
        <View style={styles.flexFill}>
          <ValidatedDateInput
            label="Last Menstrual Period (LMP)"
            placeholder="YYYY-MM-DD"
            value={lmpDate}
            onChangeText={setLmpDate}
            boundaryMode="pastOrToday"
          />
        </View>
        <View style={styles.flexFill}>
          <Input
            label="Cycle length (days)"
            placeholder="28"
            value={cycleLength}
            onChangeText={setCycleLength}
            keyboardType="numeric"
          />
        </View>
        <View style={styles.flexFill}>
          <ValidatedDateInput
            label="Reference date"
            placeholder="YYYY-MM-DD"
            value={refDate}
            onChangeText={setRefDate}
            boundaryMode="any"
          />
        </View>
      </View>

      {obResult ? (
        <View style={styles.resultStack}>
          <View style={styles.statsRow}>
            <StatCard
              label="Estimated Due Date (EDD)"
              value={obResult.eddDateStr}
              subtext={
                obResult.daysRemaining >= 0
                  ? `${obResult.daysRemaining} days remaining`
                  : `${Math.abs(obResult.daysRemaining)} days past EDD`
              }
              icon="calendar"
              style={styles.statCard}
            />
            <StatCard
              label="Gestational Age (AOG)"
              value={obResult.aogFormatted}
              subtext={`${obResult.aogTotalDays} total days`}
              icon="clock"
              style={styles.statCard}
            />
            <StatCard
              label="Estimated Conception"
              value={obResult.conceptionDateStr}
              subtext={`${obResult.cycleLengthDays}-day cycle`}
              icon="heartPulse"
              style={styles.statCard}
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
                  <ThemedText variant="bodyBold">
                    Week {m.weeks} · {m.label}
                  </ThemedText>
                </View>
                <View style={styles.milestoneEnd}>
                  <ThemedText variant="smallBold">{m.dateStr}</ThemedText>
                  <Badge
                    label={m.reached ? 'Reached' : 'Upcoming'}
                    variant={m.reached ? 'success' : 'neutral'}
                    size="sm"
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <EmptyState
          icon="calendar"
          title="Enter Last Menstrual Period (LMP)"
          description="Automatically computes EDD, current AOG in weeks and days, trimester, and target milestone dates."
        />
      )}
    </Card>
  );

  const renderDosingAndEgfr = () => (
    <View style={styles.resultStack}>
      <SegmentedControl
        options={[
          { value: 'pediatric', label: 'Pediatric Weight-Based Dosing', icon: 'syringe' },
          { value: 'egfr', label: 'Renal Function (CKD-EPI 2021 & CrCl)', icon: 'droplet' },
        ]}
        value={dosingSubMode}
        onChange={setDosingSubMode}
      />

      {dosingSubMode === 'pediatric' ? (
        <Card>
          <CardHeader
            title="Pediatric Weight-Based Dosing Calculator"
            subtitle="Compute single dose and daily total in mg and suspension mL with max daily cap checks."
            icon="syringe"
            rightAction={
              doseWeight || doseMgPerKg ? (
                <Button
                  title="Reset"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setDoseWeight('');
                    setDoseMgPerKg('');
                    setMaxDailyMg('');
                    setActivePresetNote(null);
                  }}
                />
              ) : undefined
            }
          />

          <View style={styles.fieldGroup}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Quick Reference Presets (Clinician to Verify Indication)
            </ThemedText>
            <View style={styles.chipRow}>
              {PEDIATRIC_DOSE_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  size="sm"
                  variant="secondary"
                  title={preset.label}
                  onPress={() => {
                    setDoseMgPerKg(String(preset.doseMgPerKg));
                    setDoseMode(preset.mode);
                    setDosesPerDay(String(preset.dosesPerDay) as '1' | '2' | '3' | '4');
                    setConcMg(String(preset.concentrationMg));
                    setConcMl(String(preset.concentrationMl));
                    setMaxDailyMg(String(preset.maxDailyDoseMg));
                    setActivePresetNote(preset.note);
                  }}
                />
              ))}
            </View>
            {activePresetNote ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {activePresetNote}
              </ThemedText>
            ) : null}
          </View>

          <View style={rowStyle}>
            <View style={styles.flexFill}>
              <Input
                label="Child weight (kg)"
                placeholder="e.g. 14"
                value={doseWeight}
                onChangeText={setDoseWeight}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
              <Input
                label={doseMode === 'perDay' ? 'Target dose (mg/kg/day)' : 'Target dose (mg/kg/dose)'}
                placeholder="e.g. 45"
                value={doseMgPerKg}
                onChangeText={setDoseMgPerKg}
                keyboardType="numeric"
              />
            </View>
          </View>

          <View style={styles.controlsRow}>
            <SegmentedControl
              options={[
                { value: 'perDay', label: 'mg/kg/day (divided)' },
                { value: 'perDose', label: 'mg/kg/dose' },
              ]}
              value={doseMode}
              onChange={setDoseMode}
            />
            <SegmentedControl
              options={[
                { value: '1', label: 'OD (q24h)' },
                { value: '2', label: 'BID (q12h)' },
                { value: '3', label: 'TID (q8h)' },
                { value: '4', label: 'QID (q6h)' },
              ]}
              value={dosesPerDay}
              onChange={setDosesPerDay}
            />
          </View>

          <View style={rowStyle}>
            <View style={styles.flexFill}>
              <Input
                label="Suspension strength (mg)"
                placeholder="e.g. 250"
                value={concMg}
                onChangeText={setConcMg}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
              <Input
                label="Per volume (mL)"
                placeholder="e.g. 5"
                value={concMl}
                onChangeText={setConcMl}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
              <Input
                label="Max daily cap (mg/day)"
                placeholder="Optional safety cap"
                value={maxDailyMg}
                onChangeText={setMaxDailyMg}
                keyboardType="numeric"
              />
            </View>
          </View>

          {pediatricDoseResult ? (
            <View style={styles.resultStack}>
              {pediatricDoseResult.exceedsMaxDaily ? (
                <View style={[styles.resultBox, styles.resultBoxEmergency]}>
                  <View style={styles.resultHeader}>
                    <Badge label="Exceeds Max Daily Dose" variant="emergency" icon="alertCircle" />
                  </View>
                  <ThemedText variant="small" color={theme.colors.emergencyText}>
                    Calculated daily total ({pediatricDoseResult.dailyTotalMg} mg/day) exceeds the cap (
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
                  label={`Single Dose (q${pediatricDoseResult.intervalHours}h)`}
                  value={`${pediatricDoseResult.singleDoseMg} mg`}
                  subtext={
                    pediatricDoseResult.singleDoseMl !== null
                      ? `${pediatricDoseResult.singleDoseMl} mL per dose`
                      : `${pediatricDoseResult.dosesPerDay}x daily`
                  }
                  icon="syringe"
                  style={styles.statCard}
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
                  style={styles.statCard}
                />
              </View>
            </View>
          ) : (
            <EmptyState
              icon="syringe"
              title="Enter weight and target mg/kg dose"
              description="Or tap a quick reference preset above, then enter the child’s weight in kg."
            />
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Renal Function: CKD-EPI 2021 eGFR & Cockcroft-Gault CrCl"
            subtitle="Race-free CKD-EPI 2021 equation for adult CKD staging (≥18y) plus Cockcroft-Gault CrCl for drug dosing."
            icon="droplet"
            rightAction={
              scrValue || renalAge || renalWeight ? (
                <Button
                  title="Reset"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setScrValue('');
                    setRenalAge('');
                    setRenalWeight('');
                  }}
                />
              ) : undefined
            }
          />

          <View style={styles.controlsRow}>
            <SegmentedControl
              options={[
                { value: 'mg/dL', label: 'Serum Cr (mg/dL)' },
                { value: 'umol/L', label: 'Serum Cr (µmol/L)' },
              ]}
              value={scrUnit}
              onChange={setScrUnit}
            />
            <SegmentedControl
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
              value={renalSex}
              onChange={setRenalSex}
            />
          </View>

          <View style={rowStyle}>
            <View style={styles.flexFill}>
              <Input
                label={`Serum Creatinine (${scrUnit})`}
                placeholder={scrUnit === 'mg/dL' ? 'e.g. 1.1' : 'e.g. 97'}
                value={scrValue}
                onChangeText={setScrValue}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
              <Input
                label="Age (years, ≥18)"
                placeholder="e.g. 54"
                value={renalAge}
                onChangeText={setRenalAge}
                keyboardType="numeric"
              />
            </View>
            <View style={styles.flexFill}>
              <Input
                label="Weight (kg, optional for CrCl)"
                placeholder="e.g. 68"
                value={renalWeight}
                onChangeText={setRenalWeight}
                keyboardType="numeric"
              />
            </View>
          </View>

          {renalResult ? (
            <View style={styles.resultStack}>
              <View style={styles.statsRow}>
                <StatCard
                  label="eGFR (CKD-EPI 2021)"
                  value={`${renalResult.egfrCkdEpi2021}`}
                  subtext="mL/min/1.73 m²"
                  icon="droplet"
                  style={styles.statCard}
                />
                {renalResult.cockcroftGaultCrCl !== null ? (
                  <StatCard
                    label="Cockcroft-Gault CrCl"
                    value={`${renalResult.cockcroftGaultCrCl}`}
                    subtext="mL/min (for renal dosing)"
                    icon="activity"
                    style={styles.statCard}
                  />
                ) : null}
              </View>

              <View style={styles.classificationBox}>
                <View style={styles.spreadRow}>
                  <ThemedText variant="bodyBold">KDIGO GFR Category</ThemedText>
                  <Badge
                    label={`${renalResult.kdigoStage} · ${renalResult.kdigoLabel}`}
                    variant={renalResult.kdigoTone}
                  />
                </View>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Normalized Serum Creatinine: {renalResult.creatinineMgDl.toFixed(2)} mg/dL. Confirm chronicity
                  (&gt;3 months) and albuminuria for formal CKD staging.
                </ThemedText>
              </View>
            </View>
          ) : (
            <EmptyState
              icon="droplet"
              title="Enter serum creatinine and adult age (≥18)"
              description="Add body weight to simultaneously estimate Cockcroft-Gault creatinine clearance."
            />
          )}
        </Card>
      )}
    </View>
  );

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
  controlsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    alignItems: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    alignItems: 'flex-end',
  },
  inputCol: {
    flexDirection: 'column',
    gap: theme.spacing.md,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    alignItems: 'center',
  },
  fieldLabel: {
    marginBottom: theme.spacing.xs,
  },
  fieldGroup: {
    gap: theme.spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
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
    backgroundColor: theme.colors.surfaceSubtle,
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
  statCard: {
    flex: 1,
    minWidth: theme.sizes.sidebarWidth,
  },
  classificationBox: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.sm,
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
