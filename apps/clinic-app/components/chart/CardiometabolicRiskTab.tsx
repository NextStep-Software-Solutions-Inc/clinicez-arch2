import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  NcdRiskAssessment,
  SaveNcdRiskAssessmentPayload,
} from '../../services/clinicService';

interface CardiometabolicRiskTabProps {
  patient: ClinicPatient;
  initialLatestAssessment?: NcdRiskAssessment;
  onRefreshChart?: () => void;
}

type RiskBandType = 'BandA' | 'BandB' | 'BandC' | 'BandD' | 'BandE';

const RISK_BAND_META: Record<RiskBandType, { label: string; desc: string; badgeVariant: 'success' | 'info' | 'warning' | 'urgent' | 'emergency'; color: string; bg: string }> = {
  BandA: { label: 'Band A (<10%)', desc: 'Low 10-Year CVD Risk', badgeVariant: 'success', color: theme.colors.successText, bg: theme.colors.successBg },
  BandB: { label: 'Band B (10-<20%)', desc: 'Moderate 10-Year CVD Risk', badgeVariant: 'info', color: theme.colors.infoText, bg: theme.colors.infoBg },
  BandC: { label: 'Band C (20-<30%)', desc: 'High 10-Year CVD Risk', badgeVariant: 'warning', color: theme.colors.warningText, bg: theme.colors.warningBg },
  BandD: { label: 'Band D (30-<40%)', desc: 'Very High 10-Year CVD Risk', badgeVariant: 'urgent', color: theme.colors.urgentText, bg: theme.colors.urgentBg },
  BandE: { label: 'Band E (>=40%)', desc: 'Critical / Extreme CVD Risk', badgeVariant: 'emergency', color: theme.colors.emergencyText, bg: theme.colors.emergencyBg },
};

export default function CardiometabolicRiskTab({
  patient,
  initialLatestAssessment,
  onRefreshChart,
}: CardiometabolicRiskTabProps) {
  const [assessments, setAssessments] = useState<NcdRiskAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Assessment Form State
  const [riskBand, setRiskBand] = useState<RiskBandType>('BandA');
  const [riskScorePercent, setRiskScorePercent] = useState('');
  const [assessedByStaffName, setAssessedByStaffName] = useState('');
  const [remarks, setRemarks] = useState('');

  // Q1 - Q4 Lifestyle / Nutrition
  const [eatsProcessedFoodWeekly, setEatsProcessedFoodWeekly] = useState(false);
  const [threeServingsVegetablesDaily, setThreeServingsVegetablesDaily] = useState(true);
  const [twoToThreeServingsFruitDaily, setTwoToThreeServingsFruitDaily] = useState(true);
  const [physicalActivityAtLeast150MinsWeekly, setPhysicalActivityAtLeast150MinsWeekly] = useState(true);

  // Q5 - Q9 & Q18 - Q19 Diabetes
  const [diagnosedDiabetes, setDiagnosedDiabetes] = useState(false);
  const [hasPolyphagia, setHasPolyphagia] = useState(false);
  const [hasPolydipsia, setHasPolydipsia] = useState(false);
  const [hasPolyuria, setHasPolyuria] = useState(false);
  const [diabetesMedicationStatus, setDiabetesMedicationStatus] = useState('N');
  const [hasRaisedBloodGlucose, setHasRaisedBloodGlucose] = useState(false);
  const [fastingBloodSugarMgDl, setFastingBloodSugarMgDl] = useState('');
  const [fastingBloodSugarDate, setFastingBloodSugarDate] = useState('');

  // Q10 - Q16 & Q23 - Q24 Angina / CVD Rose Survey
  const [hasChestPain, setHasChestPain] = useState(false);
  const [painInCenterOfChestOrLeftArm, setPainInCenterOfChestOrLeftArm] = useState(false);
  const [painWhenWalkingUphill, setPainWhenWalkingUphill] = useState(false);
  const [slowsDownWhenPainOccurs, setSlowsDownWhenPainOccurs] = useState(false);
  const [painRelievedWithin10Mins, setPainRelievedWithin10Mins] = useState(false);
  const [painRelievedByNitrates, setPainRelievedByNitrates] = useState(false);
  const [severeChestPainOver30Mins, setSevereChestPainOver30Mins] = useState(false);
  const [transientNeurologicalDeficits, setTransientNeurologicalDeficits] = useState(false);
  const [hasHistoryAnginaHeartAttack, setHasHistoryAnginaHeartAttack] = useState(false);
  const [hasHistoryStrokeOrTia, setHasHistoryStrokeOrTia] = useState(false);

  // Q20 Lipids
  const [hasRaisedBloodLipids, setHasRaisedBloodLipids] = useState(false);
  const [totalCholesterolMgDl, setTotalCholesterolMgDl] = useState('');
  const [totalCholesterolDate, setTotalCholesterolDate] = useState('');

  // Q21 - Q22 Urinalysis
  const [urineKetonesPresent, setUrineKetonesPresent] = useState(false);
  const [urineKetonesValue, setUrineKetonesValue] = useState('Negative');
  const [urineKetonesDate, setUrineKetonesDate] = useState('');
  const [urineProteinPresent, setUrineProteinPresent] = useState(false);
  const [urineProteinValue, setUrineProteinValue] = useState('Negative');
  const [urineProteinDate, setUrineProteinDate] = useState('');

  const populateLatest = (data: NcdRiskAssessment) => {
    if (data.riskBand && data.riskBand in RISK_BAND_META) {
      setRiskBand(data.riskBand as RiskBandType);
    }
    setRiskScorePercent(data.calculatedRiskScorePercent != null ? String(data.calculatedRiskScorePercent) : '');
    setAssessedByStaffName(data.assessedByStaffName || '');
    setRemarks(data.remarks || '');

    setEatsProcessedFoodWeekly(!!data.eatsProcessedFoodWeekly);
    setThreeServingsVegetablesDaily(data.threeServingsVegetablesDaily ?? true);
    setTwoToThreeServingsFruitDaily(data.twoToThreeServingsFruitDaily ?? true);
    setPhysicalActivityAtLeast150MinsWeekly(data.physicalActivityAtLeast150MinsWeekly ?? true);

    setDiagnosedDiabetes(!!data.diagnosedDiabetes);
    setHasPolyphagia(!!data.hasPolyphagia);
    setHasPolydipsia(!!data.hasPolydipsia);
    setHasPolyuria(!!data.hasPolyuria);
    setDiabetesMedicationStatus(data.diabetesMedicationStatus || 'N');
    setHasRaisedBloodGlucose(!!data.hasRaisedBloodGlucose);
    setFastingBloodSugarMgDl(data.fastingBloodSugarMgDl != null ? String(data.fastingBloodSugarMgDl) : '');
    setFastingBloodSugarDate(data.fastingBloodSugarDate ? data.fastingBloodSugarDate.split('T')[0] : '');

    setHasChestPain(!!data.hasChestPain);
    setPainInCenterOfChestOrLeftArm(!!data.painInCenterOfChestOrLeftArm);
    setPainWhenWalkingUphill(!!data.painWhenWalkingUphill);
    setSlowsDownWhenPainOccurs(!!data.slowsDownWhenPainOccurs);
    setPainRelievedWithin10Mins(!!data.painRelievedWithin10Mins);
    setPainRelievedByNitrates(!!data.painRelievedByNitrates);
    setSevereChestPainOver30Mins(!!data.severeChestPainOver30Mins);
    setTransientNeurologicalDeficits(!!data.transientNeurologicalDeficits);
    setHasHistoryAnginaHeartAttack(!!data.hasHistoryAnginaHeartAttack);
    setHasHistoryStrokeOrTia(!!data.hasHistoryStrokeOrTia);

    setHasRaisedBloodLipids(!!data.hasRaisedBloodLipids);
    setTotalCholesterolMgDl(data.totalCholesterolMgDl != null ? String(data.totalCholesterolMgDl) : '');
    setTotalCholesterolDate(data.totalCholesterolDate ? data.totalCholesterolDate.split('T')[0] : '');

    setUrineKetonesPresent(!!data.urineKetonesPresent);
    setUrineKetonesValue(data.urineKetonesValue || 'Negative');
    setUrineKetonesDate(data.urineKetonesDate ? data.urineKetonesDate.split('T')[0] : '');
    setUrineProteinPresent(!!data.urineProteinPresent);
    setUrineProteinValue(data.urineProteinValue || 'Negative');
    setUrineProteinDate(data.urineProteinDate ? data.urineProteinDate.split('T')[0] : '');
  };

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getNcdRiskAssessments(patient.id);
      if (data) {
        setAssessments(data);
        if (data.length > 0) {
          populateLatest(data[0]);
        }
      } else if (err) {
        setError(err.message || 'Unable to load NCD assessments.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load NCD risk assessments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialLatestAssessment) {
      setAssessments([initialLatestAssessment]);
      populateLatest(initialLatestAssessment);
    } else {
      fetchAssessments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const handleSaveAssessment = async () => {
    setSaving(true);
    try {
      const payload: SaveNcdRiskAssessmentPayload = {
        riskBand,
        calculatedRiskScorePercent: parseFloat(riskScorePercent) || undefined,
        assessedByStaffName: assessedByStaffName.trim() || undefined,
        remarks: remarks.trim() || undefined,

        eatsProcessedFoodWeekly,
        threeServingsVegetablesDaily,
        twoToThreeServingsFruitDaily,
        physicalActivityAtLeast150MinsWeekly,

        diagnosedDiabetes,
        hasPolyphagia,
        hasPolydipsia,
        hasPolyuria,
        diabetesMedicationStatus,
        hasRaisedBloodGlucose: hasRaisedBloodGlucose || (parseFloat(fastingBloodSugarMgDl) >= 126),
        fastingBloodSugarMgDl: parseFloat(fastingBloodSugarMgDl) || undefined,
        fastingBloodSugarDate: fastingBloodSugarDate.trim() || undefined,

        hasChestPain,
        painInCenterOfChestOrLeftArm,
        painWhenWalkingUphill,
        slowsDownWhenPainOccurs,
        painRelievedWithin10Mins,
        painRelievedByNitrates,
        severeChestPainOver30Mins,
        transientNeurologicalDeficits,
        hasHistoryAnginaHeartAttack,
        hasHistoryStrokeOrTia,

        hasRaisedBloodLipids: hasRaisedBloodLipids || (parseFloat(totalCholesterolMgDl) >= 200),
        totalCholesterolMgDl: parseFloat(totalCholesterolMgDl) || undefined,
        totalCholesterolDate: totalCholesterolDate.trim() || undefined,

        urineKetonesPresent,
        urineKetonesValue: urineKetonesPresent ? urineKetonesValue.trim() : 'Negative',
        urineKetonesDate: urineKetonesDate.trim() || undefined,
        urineProteinPresent,
        urineProteinValue: urineProteinPresent ? urineProteinValue.trim() : 'Negative',
        urineProteinDate: urineProteinDate.trim() || undefined,
      };

      const [created, err] = await clinicService.saveNcdRiskAssessment(patient.id, payload);
      if (err) {
        Alert.alert('Error', err.message || 'Failed to record NCD Risk Assessment.');
      } else {
        Alert.alert('Success', 'PhilPEN NCD Risk Assessment saved successfully.');
        if (created) {
          setAssessments((prev) => [created, ...prev]);
          populateLatest(created);
        }
        onRefreshChart?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error saving NCD assessment.');
    } finally {
      setSaving(false);
    }
  };

  const currentMeta = RISK_BAND_META[riskBand];

  if (loading) {
    return (
      <View style={styles.container}>
        <SkeletonList rows={6} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <ErrorState
          title="Could not load NCD risk assessment"
          message={error}
          onRetry={fetchAssessments}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* SECTION 1: Prominent CVD Risk Band Header Card */}
      <View style={[styles.riskBandHeroCard, { backgroundColor: currentMeta.bg }]}>
        <View style={styles.riskBandHeroRow}>
          <View style={{ flex: 1 }}>
            <ThemedText variant="captionBold" color={currentMeta.color}>
              PHILPEN 10-YEAR CARDIOMETABOLIC RISK STRATIFICATION
            </ThemedText>
            <ThemedText variant="display" color={currentMeta.color} style={{ marginVertical: theme.spacing.xs }}>
              {currentMeta.label}
            </ThemedText>
            <ThemedText variant="bodyBold" color={currentMeta.color}>
              {currentMeta.desc}
            </ThemedText>
          </View>
          <View style={[styles.bandScoreChip, { borderColor: currentMeta.color }]}>
            <ThemedText variant="smallBold" color={currentMeta.color}>
              {riskScorePercent ? `${riskScorePercent}%` : 'Risk Band'}
            </ThemedText>
          </View>
        </View>

        {/* Risk Band Selector Chips */}
        <View style={styles.bandSelectorWrap}>
          {(Object.keys(RISK_BAND_META) as RiskBandType[]).map((bandKey) => {
            const meta = RISK_BAND_META[bandKey];
            const isSelected = riskBand === bandKey;
            return (
              <Pressable
                key={bandKey}
                style={[
                  styles.bandChipBtn,
                  isSelected && { backgroundColor: meta.color },
                ]}
                onPress={() => setRiskBand(bandKey)}
              >
                <ThemedText
                  variant="smallBold"
                  color={isSelected ? theme.colors.onPrimary : theme.colors.textSecondary}
                >
                  {bandKey.replace('Band', 'Band ')}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* SECTION 2: Assessment Metadata */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Assessment Details</ThemedText>
        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Assessed By (Staff / Clinician Name)"
              placeholder="e.g. Dr. Santos / Nurse Joy"
              value={assessedByStaffName}
              onChangeText={setAssessedByStaffName}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Specific Risk Percentage (%)"
              placeholder="e.g. 15"
              value={riskScorePercent}
              onChangeText={setRiskScorePercent}
              keyboardType="numeric"
            />
          </View>
        </View>
      </View>

      {/* SECTION 3: Dietary & Lifestyle Screening (Q1 - Q4) */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Dietary & Physical Activity Screening (Q1 - Q4)</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q1. Consumes processed, salty foods or canned meals weekly?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !eatsProcessedFoodWeekly && styles.toggleBtnActive]}
              onPress={() => setEatsProcessedFoodWeekly(false)}
            >
              <ThemedText variant="smallBold" color={!eatsProcessedFoodWeekly ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, eatsProcessedFoodWeekly && styles.toggleBtnActiveWarning]}
              onPress={() => setEatsProcessedFoodWeekly(true)}
            >
              <ThemedText variant="smallBold" color={eatsProcessedFoodWeekly ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q2. Eats at least 3 servings of vegetables daily?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !threeServingsVegetablesDaily && styles.toggleBtnActiveWarning]}
              onPress={() => setThreeServingsVegetablesDaily(false)}
            >
              <ThemedText variant="smallBold" color={!threeServingsVegetablesDaily ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, threeServingsVegetablesDaily && styles.toggleBtnActive]}
              onPress={() => setThreeServingsVegetablesDaily(true)}
            >
              <ThemedText variant="smallBold" color={threeServingsVegetablesDaily ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q3. Eats 2 to 3 servings of fresh fruit daily?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !twoToThreeServingsFruitDaily && styles.toggleBtnActiveWarning]}
              onPress={() => setTwoToThreeServingsFruitDaily(false)}
            >
              <ThemedText variant="smallBold" color={!twoToThreeServingsFruitDaily ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, twoToThreeServingsFruitDaily && styles.toggleBtnActive]}
              onPress={() => setTwoToThreeServingsFruitDaily(true)}
            >
              <ThemedText variant="smallBold" color={twoToThreeServingsFruitDaily ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q4. Engages in at least 150 minutes of moderate activity weekly?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !physicalActivityAtLeast150MinsWeekly && styles.toggleBtnActiveWarning]}
              onPress={() => setPhysicalActivityAtLeast150MinsWeekly(false)}
            >
              <ThemedText variant="smallBold" color={!physicalActivityAtLeast150MinsWeekly ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, physicalActivityAtLeast150MinsWeekly && styles.toggleBtnActive]}
              onPress={() => setPhysicalActivityAtLeast150MinsWeekly(true)}
            >
              <ThemedText variant="smallBold" color={physicalActivityAtLeast150MinsWeekly ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 4: Diabetes Screening & Glycemic Biomarkers (Q5 - Q9, Q18, Q19) */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Diabetes & Glycemic Assessment (Q5 - Q9, Q18 - Q19)</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q5. Previously diagnosed with Diabetes Mellitus?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !diagnosedDiabetes && styles.toggleBtnActive]}
              onPress={() => setDiagnosedDiabetes(false)}
            >
              <ThemedText variant="smallBold" color={!diagnosedDiabetes ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, diagnosedDiabetes && styles.toggleBtnActiveEmergency]}
              onPress={() => setDiagnosedDiabetes(true)}
            >
              <ThemedText variant="smallBold" color={diagnosedDiabetes ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q6. Experiencing excessive hunger (Polyphagia)?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hasPolyphagia && styles.toggleBtnActive]}
              onPress={() => setHasPolyphagia(false)}
            >
              <ThemedText variant="smallBold" color={!hasPolyphagia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hasPolyphagia && styles.toggleBtnActiveWarning]}
              onPress={() => setHasPolyphagia(true)}
            >
              <ThemedText variant="smallBold" color={hasPolyphagia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q7. Experiencing excessive thirst (Polydipsia)?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hasPolydipsia && styles.toggleBtnActive]}
              onPress={() => setHasPolydipsia(false)}
            >
              <ThemedText variant="smallBold" color={!hasPolydipsia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hasPolydipsia && styles.toggleBtnActiveWarning]}
              onPress={() => setHasPolydipsia(true)}
            >
              <ThemedText variant="smallBold" color={hasPolydipsia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q8. Frequent nighttime urination (Polyuria)?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hasPolyuria && styles.toggleBtnActive]}
              onPress={() => setHasPolyuria(false)}
            >
              <ThemedText variant="smallBold" color={!hasPolyuria ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hasPolyuria && styles.toggleBtnActiveWarning]}
              onPress={() => setHasPolyuria(true)}
            >
              <ThemedText variant="smallBold" color={hasPolyuria ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Q19 Fasting Blood Sugar */}
        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Q19. Fasting Blood Sugar (mg/dL)"
              placeholder="e.g. 105"
              value={fastingBloodSugarMgDl}
              onChangeText={setFastingBloodSugarMgDl}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="FBS Test Date"
              placeholder="YYYY-MM-DD"
              value={fastingBloodSugarDate}
              onChangeText={setFastingBloodSugarDate}
            />
          </View>
        </View>
      </View>

      {/* SECTION 5: Angina & Rose CVD Questionnaire (Q10 - Q16, Q23, Q24) */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Angina & Chest Pain Rose Survey (Q10 - Q16)</ThemedText>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q10. Pain or discomfort in center of chest or radiating to left arm?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !painInCenterOfChestOrLeftArm && styles.toggleBtnActive]}
              onPress={() => setPainInCenterOfChestOrLeftArm(false)}
            >
              <ThemedText variant="smallBold" color={!painInCenterOfChestOrLeftArm ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, painInCenterOfChestOrLeftArm && styles.toggleBtnActiveEmergency]}
              onPress={() => setPainInCenterOfChestOrLeftArm(true)}
            >
              <ThemedText variant="smallBold" color={painInCenterOfChestOrLeftArm ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q11. Chest pain occurs when walking uphill or hurrying?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !painWhenWalkingUphill && styles.toggleBtnActive]}
              onPress={() => setPainWhenWalkingUphill(false)}
            >
              <ThemedText variant="smallBold" color={!painWhenWalkingUphill ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, painWhenWalkingUphill && styles.toggleBtnActiveEmergency]}
              onPress={() => setPainWhenWalkingUphill(true)}
            >
              <ThemedText variant="smallBold" color={painWhenWalkingUphill ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q15. Severe chest pain lasting over 30 minutes?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !severeChestPainOver30Mins && styles.toggleBtnActive]}
              onPress={() => setSevereChestPainOver30Mins(false)}
            >
              <ThemedText variant="smallBold" color={!severeChestPainOver30Mins ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, severeChestPainOver30Mins && styles.toggleBtnActiveEmergency]}
              onPress={() => setSevereChestPainOver30Mins(true)}
            >
              <ThemedText variant="smallBold" color={severeChestPainOver30Mins ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q23. History of documented heart attack or angina pectoris?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hasHistoryAnginaHeartAttack && styles.toggleBtnActive]}
              onPress={() => setHasHistoryAnginaHeartAttack(false)}
            >
              <ThemedText variant="smallBold" color={!hasHistoryAnginaHeartAttack ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hasHistoryAnginaHeartAttack && styles.toggleBtnActiveEmergency]}
              onPress={() => setHasHistoryAnginaHeartAttack(true)}
            >
              <ThemedText variant="smallBold" color={hasHistoryAnginaHeartAttack ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="body" color={theme.colors.text} style={styles.questionText}>
            Q24. History of Stroke or Transient Ischemic Attack (TIA)?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hasHistoryStrokeOrTia && styles.toggleBtnActive]}
              onPress={() => setHasHistoryStrokeOrTia(false)}
            >
              <ThemedText variant="smallBold" color={!hasHistoryStrokeOrTia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hasHistoryStrokeOrTia && styles.toggleBtnActiveEmergency]}
              onPress={() => setHasHistoryStrokeOrTia(true)}
            >
              <ThemedText variant="smallBold" color={hasHistoryStrokeOrTia ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 6: Lipids & Urinalysis Biomarkers (Q20 - Q22) */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Lipids & Urinalysis Biomarkers (Q20 - Q22)</ThemedText>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Q20. Total Cholesterol (mg/dL)"
              placeholder="e.g. 195"
              value={totalCholesterolMgDl}
              onChangeText={setTotalCholesterolMgDl}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Cholesterol Test Date"
              placeholder="YYYY-MM-DD"
              value={totalCholesterolDate}
              onChangeText={setTotalCholesterolDate}
            />
          </View>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Q21. Urine Ketones (Result)"
              placeholder="e.g. Negative or 1+"
              value={urineKetonesValue}
              onChangeText={setUrineKetonesValue}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Q22. Urine Protein (Result)"
              placeholder="e.g. Negative or Trace"
              value={urineProteinValue}
              onChangeText={setUrineProteinValue}
            />
          </View>
        </View>
      </View>

      {/* SECTION 7: Remarks */}
      <View style={styles.sectionCard}>
        <Input
          label="Clinical Remarks / Physician Assessment Notes"
          placeholder="Additional cardiometabolic recommendations or referral plans"
          value={remarks}
          onChangeText={setRemarks}
        />
      </View>

      {/* Save Button */}
      <View style={styles.actionFooter}>
        <Button
          title={saving ? 'Saving PhilPEN Assessment…' : 'Record PhilPEN Risk Assessment'}
          variant="primary"
          size="lg"
          icon="check"
          loading={saving}
          disabled={saving}
          onPress={handleSaveAssessment}
        />
      </View>

      {/* Assessment History */}
      {assessments.length > 1 && (
        <View style={styles.sectionCard}>
          <ThemedText variant="h3">Prior PhilPEN Assessments History</ThemedText>
          {assessments.slice(1).map((a) => {
            const bMeta = RISK_BAND_META[a.riskBand as RiskBandType] || RISK_BAND_META.BandA;
            return (
              <View key={a.id} style={styles.historyRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {new Date(a.createdAt).toLocaleDateString()} • {a.assessedByStaffName || 'Clinician'}
                  </ThemedText>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {a.calculatedRiskScorePercent ? `Score: ${a.calculatedRiskScorePercent}% • ` : ''}
                    FBS: {a.fastingBloodSugarMgDl ? `${a.fastingBloodSugarMgDl} mg/dL` : '—'} • Chol: {a.totalCholesterolMgDl ? `${a.totalCholesterolMgDl} mg/dL` : '—'}
                  </ThemedText>
                </View>
                <Badge label={bMeta.label} variant={bMeta.badgeVariant} />
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  riskBandHeroCard: {
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  riskBandHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bandScoreChip: {
    borderWidth: 2,
    borderRadius: theme.radii.full,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
  },
  bandSelectorWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.xs,
  },
  bandChipBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  questionText: {
    flex: 1,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  toggleBtn: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  toggleBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  toggleBtnActiveWarning: {
    backgroundColor: theme.colors.warning,
  },
  toggleBtnActiveEmergency: {
    backgroundColor: theme.colors.emergency,
  },
  formGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  gridItem: {
    flex: 1,
  },
  actionFooter: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
});
