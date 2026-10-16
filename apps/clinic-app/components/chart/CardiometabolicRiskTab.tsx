import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList, ValidatedDateInput, validateDateString, Modal } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  NcdRiskAssessment,
  SaveNcdRiskAssessmentPayload,
} from '../../services/clinicService';
import { useAuth } from '../../context/AuthContext';
import { useStaff } from '../../context/StaffContext';
import {
  calculatePhilPenRisk,
  percentageToRiskBand,
  RISK_BAND_MIDPOINTS,
  type RiskBandType,
} from '../../utils/philpenCalculator';

const VOID_REASONS = [
  'Duplicate entry',
  'Incorrect lab values or survey data',
  'Entered on wrong patient chart',
  'Test / Training entry',
  'Other',
];

const RISK_BAND_META: Record<RiskBandType, { label: string; desc: string; badgeVariant: 'success' | 'info' | 'warning' | 'urgent' | 'emergency'; color: string; bg: string }> = {
  BandA: { label: 'Band A (<10%)', desc: 'Low 10-Year CVD Risk', badgeVariant: 'success', color: theme.colors.successText, bg: theme.colors.successBg },
  BandB: { label: 'Band B (10-<20%)', desc: 'Moderate 10-Year CVD Risk', badgeVariant: 'info', color: theme.colors.infoText, bg: theme.colors.infoBg },
  BandC: { label: 'Band C (20-<30%)', desc: 'High 10-Year CVD Risk', badgeVariant: 'warning', color: theme.colors.warningText, bg: theme.colors.warningBg },
  BandD: { label: 'Band D (30-<40%)', desc: 'Very High 10-Year CVD Risk', badgeVariant: 'urgent', color: theme.colors.urgentText, bg: theme.colors.urgentBg },
  BandE: { label: 'Band E (>=40%)', desc: 'Critical / Extreme CVD Risk', badgeVariant: 'emergency', color: theme.colors.emergencyText, bg: theme.colors.emergencyBg },
};

export interface CardiometabolicRiskTabProps {
  patient: ClinicPatient;
  initialLatestAssessment?: NcdRiskAssessment;
  onRefreshChart?: () => void;
}

export default function CardiometabolicRiskTab({
  patient,
  initialLatestAssessment,
  onRefreshChart,
}: CardiometabolicRiskTabProps) {
  const { user } = useAuth();
  const { current: currentStaff, currentName } = useStaff();
  const authedClinicianName = currentName || (user?.name ?? '').trim();
  const authedStaffId = currentStaff?.id || user?.id;

  const [assessments, setAssessments] = useState<NcdRiskAssessment[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing & Voiding State
  const [editingAssessmentId, setEditingAssessmentId] = useState<string | null>(null);
  const [showVoided, setShowVoided] = useState(false);
  const [voidModalVisible, setVoidModalVisible] = useState(false);
  const [voidingAssessment, setVoidingAssessment] = useState<NcdRiskAssessment | null>(null);
  const [voidReason, setVoidReason] = useState<string>('Duplicate entry');
  const [customVoidNotes, setCustomVoidNotes] = useState<string>('');
  const [voidingSubmitting, setVoidingSubmitting] = useState(false);

  // Assessment Form State
  const [riskBand, setRiskBand] = useState<RiskBandType>('BandA');
  const [riskScorePercent, setRiskScorePercent] = useState('');
  const [isManuallyOverridden, setIsManuallyOverridden] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [assessedByStaffName, setAssessedByStaffName] = useState(authedClinicianName);
  const [remarks, setRemarks] = useState('');

  // Auto-sync assessedByStaffName with authed user if empty or previously generic 'Clinician'
  useEffect(() => {
    if ((!assessedByStaffName || assessedByStaffName === 'Clinician') && authedClinicianName) {
      setAssessedByStaffName(authedClinicianName);
    }
  }, [authedClinicianName]);

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

  // Extract vitals and smoking status for DOH PHILPEN calculation
  const pAny = patient as any;
  const latestVitals = pAny.vitalsHistory && pAny.vitalsHistory.length > 0 ? pAny.vitalsHistory[0] : null;
  const isSmoker = pAny.socialHistory?.isSmoker ?? false;

  // Real-time calculation using the official DOH PHILPEN statutory scoring engine
  const philpenCalc = useMemo(() => {
    return calculatePhilPenRisk({
      ageYears: patient.age,
      gender: patient.gender,
      isSmoker,
      systolicBp: latestVitals?.systolicBp,
      diastolicBp: latestVitals?.diastolicBp,
      diagnosedDiabetes,
      fastingBloodSugarMgDl: parseFloat(fastingBloodSugarMgDl) || undefined,
      totalCholesterolMgDl: parseFloat(totalCholesterolMgDl) || undefined,
      bodyMassIndex: latestVitals?.bmi,
      hasAnginaOrHeartAttack: hasHistoryAnginaHeartAttack,
      hasStrokeOrTia: hasHistoryStrokeOrTia,
      severeChestPainOver30Mins,
      transientNeurologicalDeficits,
    });
  }, [
    patient.age,
    patient.gender,
    isSmoker,
    latestVitals?.systolicBp,
    latestVitals?.diastolicBp,
    latestVitals?.bmi,
    diagnosedDiabetes,
    fastingBloodSugarMgDl,
    totalCholesterolMgDl,
    hasHistoryAnginaHeartAttack,
    hasHistoryStrokeOrTia,
    severeChestPainOver30Mins,
    transientNeurologicalDeficits,
  ]);

  // Real-time typing sync: typing "15" immediately converts to Band B (10-<20%)
  const handleRiskPercentageChange = (txt: string) => {
    setRiskScorePercent(txt);
    setIsManuallyOverridden(true);
    const parsed = parseFloat(txt);
    if (!isNaN(parsed) && parsed >= 0) {
      const derivedBand = percentageToRiskBand(parsed);
      setRiskBand(derivedBand);
    }
  };

  // Clicking a risk band chip syncs riskBand and representative midpoint percentage
  const handleBandSelect = (bandKey: RiskBandType) => {
    setRiskBand(bandKey);
    setIsManuallyOverridden(true);
    const parsed = parseFloat(riskScorePercent);
    if (isNaN(parsed) || percentageToRiskBand(parsed) !== bandKey) {
      setRiskScorePercent(String(RISK_BAND_MIDPOINTS[bandKey]));
    }
  };

  // One-click apply from PHILPEN statutory survey computation
  const handleApplyCalculatedRisk = () => {
    setIsManuallyOverridden(false);
    setRiskBand(philpenCalc.riskBand);
    setRiskScorePercent(String(philpenCalc.calculatedScorePercent));
  };

  const populateLatest = (data: NcdRiskAssessment) => {
    if (data.riskBand && data.riskBand in RISK_BAND_META) {
      setRiskBand(data.riskBand as RiskBandType);
    }
    setRiskScorePercent(data.calculatedRiskScorePercent != null ? String(data.calculatedRiskScorePercent) : '');
    setIsManuallyOverridden(true);
    if (data.assessedByStaffName && data.assessedByStaffName !== 'Clinician') {
      setAssessedByStaffName(data.assessedByStaffName);
    } else if (authedClinicianName) {
      setAssessedByStaffName(authedClinicianName);
    } else {
      setAssessedByStaffName(data.assessedByStaffName || '');
    }

    const recDate = data.assessmentDate || data.createdAt;
    if (recDate) {
      setAssessmentDate(recDate.split('T')[0]);
    }

    setRemarks(data.remarks || '');

    setEatsProcessedFoodWeekly(!!data.eatsProcessedFoodWeekly);
    setThreeServingsVegetablesDaily(data.threeServingsVegetablesDaily ?? true);
    setTwoToThreeServingsFruitDaily(data.twoToThreeServingsFruitDaily ?? true);
    setPhysicalActivityAtLeast150MinsWeekly(data.physicalActivityAtLeast150MinsWeekly ?? true);

    setDiagnosedDiabetes(data.diagnosedDiabetes === 'Y' || (data.diagnosedDiabetes as any) === true);
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

  const isRecordAuthor = (a: NcdRiskAssessment) => {
    if (authedStaffId && a.assessedByStaffId && a.assessedByStaffId === authedStaffId) return true;
    if (authedStaffId && a.createdBy && a.createdBy === authedStaffId) return true;
    if (
      authedClinicianName &&
      a.assessedByStaffName &&
      a.assessedByStaffName.trim().toLowerCase() === authedClinicianName.trim().toLowerCase()
    ) {
      return true;
    }
    return false;
  };

  const activeAssessments = useMemo(() => assessments.filter((a) => !a.isDeleted), [assessments]);
  const voidedAssessments = useMemo(() => assessments.filter((a) => a.isDeleted), [assessments]);

  const resetToDefaultForm = () => {
    setEditingAssessmentId(null);
    setRiskBand(philpenCalc.riskBand);
    setRiskScorePercent(String(philpenCalc.calculatedScorePercent));
    setIsManuallyOverridden(false);
    setAssessmentDate(new Date().toISOString().split('T')[0]);
    setAssessedByStaffName(authedClinicianName);
    setRemarks('');

    setEatsProcessedFoodWeekly(false);
    setThreeServingsVegetablesDaily(true);
    setTwoToThreeServingsFruitDaily(true);
    setPhysicalActivityAtLeast150MinsWeekly(true);

    setDiagnosedDiabetes(false);
    setHasPolyphagia(false);
    setHasPolydipsia(false);
    setHasPolyuria(false);
    setDiabetesMedicationStatus('N');
    setHasRaisedBloodGlucose(false);
    setFastingBloodSugarMgDl('');
    setFastingBloodSugarDate('');

    setHasChestPain(false);
    setPainInCenterOfChestOrLeftArm(false);
    setPainWhenWalkingUphill(false);
    setSlowsDownWhenPainOccurs(false);
    setPainRelievedWithin10Mins(false);
    setPainRelievedByNitrates(false);
    setSevereChestPainOver30Mins(false);
    setTransientNeurologicalDeficits(false);
    setHasHistoryAnginaHeartAttack(false);
    setHasHistoryStrokeOrTia(false);

    setHasRaisedBloodLipids(false);
    setTotalCholesterolMgDl('');
    setTotalCholesterolDate('');

    setUrineKetonesPresent(false);
    setUrineKetonesValue('Negative');
    setUrineKetonesDate('');
    setUrineProteinPresent(false);
    setUrineProteinValue('Negative');
    setUrineProteinDate('');
  };

  const handleStartEdit = (assessment: NcdRiskAssessment) => {
    setEditingAssessmentId(assessment.id);
    populateLatest(assessment);
  };

  const handleCancelEdit = () => {
    setEditingAssessmentId(null);
    if (activeAssessments.length > 0) {
      populateLatest(activeAssessments[0]);
    } else {
      resetToDefaultForm();
    }
  };

  const handleOpenVoidModal = (assessment: NcdRiskAssessment) => {
    setVoidingAssessment(assessment);
    setVoidReason('Duplicate entry');
    setCustomVoidNotes('');
    setVoidModalVisible(true);
  };

  const handleConfirmVoid = async () => {
    if (!voidingAssessment) return;
    setVoidingSubmitting(true);
    try {
      const fullReason = customVoidNotes.trim()
        ? `${voidReason}: ${customVoidNotes.trim()}`
        : voidReason;

      const [, err] = await clinicService.voidNcdRiskAssessment(
        patient.id,
        voidingAssessment.id,
        fullReason
      );

      if (err) {
        Alert.alert('Unable to void assessment', err.message || 'An error occurred while voiding.');
      } else {
        Alert.alert('Success', 'Assessment has been marked as entered in error.');
        setVoidModalVisible(false);
        if (editingAssessmentId === voidingAssessment.id) {
          setEditingAssessmentId(null);
        }
        await fetchAssessments();
        onRefreshChart?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error voiding assessment.');
    } finally {
      setVoidingSubmitting(false);
    }
  };

  const fetchAssessments = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getNcdRiskAssessments(patient.id, true);
      if (data) {
        setAssessments(data);
        const active = data.filter((a) => !a.isDeleted);
        if (active.length > 0) {
          if (!editingAssessmentId) {
            populateLatest(active[0]);
          }
        } else {
          resetToDefaultForm();
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

  // If no prior assessment is recorded, auto-seed with PhilPEN computation
  useEffect(() => {
    if (activeAssessments.length === 0 && !initialLatestAssessment && !isManuallyOverridden) {
      setRiskBand(philpenCalc.riskBand);
      setRiskScorePercent(String(philpenCalc.calculatedScorePercent));
    }
  }, [activeAssessments.length, initialLatestAssessment, isManuallyOverridden, philpenCalc.riskBand, philpenCalc.calculatedScorePercent]);

  // When a crisis override occurs (established CVD / stroke / hypertensive emergency), auto-elevate to Band E
  useEffect(() => {
    if (philpenCalc.crisisOverrideApplied) {
      setRiskBand('BandE');
      if (!isManuallyOverridden || !riskScorePercent) {
        setRiskScorePercent(String(philpenCalc.calculatedScorePercent));
      }
    }
  }, [philpenCalc.crisisOverrideApplied, philpenCalc.calculatedScorePercent, isManuallyOverridden, riskScorePercent]);

  const handleSaveAssessment = async () => {
    if (assessmentDate && assessmentDate.trim()) {
      const dateCheck = validateDateString(assessmentDate, { boundaryMode: 'pastOrToday' });
      if (!dateCheck.isValid) {
        Alert.alert('Invalid Assessment Date', dateCheck.errorMessage || 'Please enter a valid assessment date not in the future.');
        return;
      }
    }
    if (fastingBloodSugarDate && fastingBloodSugarDate.trim()) {
      const fbsCheck = validateDateString(fastingBloodSugarDate, { boundaryMode: 'pastOrToday' });
      if (!fbsCheck.isValid) {
        Alert.alert('Invalid FBS Test Date', fbsCheck.errorMessage || 'Please enter a valid FBS test date not in the future.');
        return;
      }
    }
    if (totalCholesterolDate && totalCholesterolDate.trim()) {
      const cholCheck = validateDateString(totalCholesterolDate, { boundaryMode: 'pastOrToday' });
      if (!cholCheck.isValid) {
        Alert.alert('Invalid Cholesterol Test Date', cholCheck.errorMessage || 'Please enter a valid cholesterol test date not in the future.');
        return;
      }
    }
    setSaving(true);
    try {
      const clinicianSnapshot = assessedByStaffName.trim() || authedClinicianName || 'Clinician';
      const effectiveAssessmentDate = assessmentDate && assessmentDate.trim()
        ? new Date(assessmentDate).toISOString()
        : new Date().toISOString();

      const payload: SaveNcdRiskAssessmentPayload = {
        riskBand,
        calculatedRiskScorePercent: parseFloat(riskScorePercent) || undefined,
        assessmentDate: effectiveAssessmentDate,
        assessedByStaffId: authedStaffId,
        assessedByStaffName: clinicianSnapshot,
        remarks: remarks.trim() || undefined,

        eatsProcessedFoodWeekly,
        threeServingsVegetablesDaily,
        twoToThreeServingsFruitDaily,
        physicalActivityAtLeast150MinsWeekly,

        diagnosedDiabetes: diagnosedDiabetes ? 'Y' : 'N',
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

      if (editingAssessmentId) {
        const [updated, err] = await clinicService.updateNcdRiskAssessment(
          patient.id,
          editingAssessmentId,
          payload
        );
        if (err) {
          Alert.alert('Error', err.message || 'Failed to update NCD Risk Assessment.');
        } else {
          Alert.alert('Success', 'PhilPEN NCD Risk Assessment updated successfully.');
          setEditingAssessmentId(null);
          await fetchAssessments();
          onRefreshChart?.();
        }
      } else {
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
      {/* Editing Banner */}
      {editingAssessmentId && (
        <View style={styles.editingBanner}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="edit" size={18} color={theme.colors.primaryDark} />
            <View style={{ flex: 1 }}>
              <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                Editing Prior Assessment ({assessmentDate || 'Recorded'})
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                Changes will update this existing record rather than creating a duplicate.
              </ThemedText>
            </View>
          </View>
          <Button
            title="Cancel Editing"
            variant="ghost"
            size="sm"
            onPress={handleCancelEdit}
          />
        </View>
      )}

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
                onPress={() => handleBandSelect(bandKey)}
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

        {/* Crisis Override Alert */}
        {philpenCalc.crisisOverrideApplied && (
          <View style={styles.overrideAlertBanner}>
            <Icon name="alert" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <View style={{ flex: 1 }}>
              <ThemedText variant="captionBold" color={theme.colors.emergency}>
                PHILPEN CLINICAL CRISIS OVERRIDE ACTIVE
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.emergency}>
                {philpenCalc.overrideReason}
              </ThemedText>
            </View>
          </View>
        )}

        {/* Algorithm vs Manual Status Row */}
        <View style={styles.autoCalcRow}>
          <View style={styles.autoCalcInfo}>
            <Icon name="activity" size={14} color={currentMeta.color} />
            <ThemedText variant="caption" color={currentMeta.color}>
              PhilPEN Survey Computed: <ThemedText variant="captionBold" color={currentMeta.color}>
                {philpenCalc.riskBand.replace('Band', 'Band ')} ({philpenCalc.calculatedScorePercent}%)
              </ThemedText>
              {isManuallyOverridden ? ' • (Custom manual input)' : ' • (Live computed)'}
            </ThemedText>
          </View>
          {isManuallyOverridden && (
            <Pressable style={styles.autoSyncBtn} onPress={handleApplyCalculatedRisk}>
              <Icon name="refresh" size={12} color={theme.colors.primary} />
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Auto-Calculate
              </ThemedText>
            </Pressable>
          )}
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
            <ValidatedDateInput
              label="Assessment Date"
              placeholder="YYYY-MM-DD"
              value={assessmentDate}
              onChangeText={setAssessmentDate}
              boundaryMode="pastOrToday"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Specific Risk Percentage (%)"
              placeholder="e.g. 15"
              value={riskScorePercent}
              onChangeText={handleRiskPercentageChange}
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
            <ValidatedDateInput
              label="FBS Test Date"
              placeholder="YYYY-MM-DD"
              value={fastingBloodSugarDate}
              onChangeText={setFastingBloodSugarDate}
              boundaryMode="pastOrToday"
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
            <ValidatedDateInput
              label="Cholesterol Test Date"
              placeholder="YYYY-MM-DD"
              value={totalCholesterolDate}
              onChangeText={setTotalCholesterolDate}
              boundaryMode="pastOrToday"
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

      {/* Save / Update Button */}
      <View style={styles.actionFooter}>
        <View style={styles.actionFooterRow}>
          {editingAssessmentId && (
            <Button
              title="Cancel Editing"
              variant="ghost"
              size="lg"
              disabled={saving}
              onPress={handleCancelEdit}
            />
          )}
          <Button
            title={
              editingAssessmentId
                ? (saving ? 'Updating PhilPEN Assessment…' : 'Update PhilPEN Risk Assessment')
                : (saving ? 'Saving PhilPEN Assessment…' : 'Record PhilPEN Risk Assessment')
            }
            variant="primary"
            size="lg"
            icon="check"
            loading={saving}
            disabled={saving}
            onPress={handleSaveAssessment}
          />
        </View>
      </View>

      {/* Assessment History */}
      {(activeAssessments.length > 0 || voidedAssessments.length > 0) && (
        <View style={styles.sectionCard}>
          <View style={styles.historyHeaderRow}>
            <ThemedText variant="h3">Prior PhilPEN Assessments History</ThemedText>
            {activeAssessments.length > 0 && (
              <Badge
                label={`${activeAssessments.length} Active`}
                variant="routine"
                size="sm"
              />
            )}
          </View>

          {activeAssessments.map((a, idx) => {
            const bMeta = RISK_BAND_META[a.riskBand as RiskBandType] || RISK_BAND_META.BandA;
            const rawDate = a.assessmentDate || a.createdAt;
            const formattedDate = rawDate && !isNaN(new Date(rawDate).getTime())
              ? new Date(rawDate).toLocaleDateString()
              : new Date().toLocaleDateString();
            const isAuthor = isRecordAuthor(a);
            const isEditingThis = editingAssessmentId === a.id;
            const isLatest = idx === 0 && !editingAssessmentId;

            return (
              <View
                key={a.id}
                style={[
                  styles.historyRow,
                  isEditingThis && styles.historyRowEditing,
                ]}
              >
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => handleStartEdit(a)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit assessment from ${formattedDate}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, flexWrap: 'wrap' }}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      {formattedDate} • {a.assessedByStaffName?.trim() || 'Clinician'}
                    </ThemedText>
                    {isLatest && <Badge label="Latest" variant="primary" size="xs" />}
                    {isEditingThis && <Badge label="Editing" variant="warning" size="xs" />}
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    {a.calculatedRiskScorePercent ? `Score: ${a.calculatedRiskScorePercent}% • ` : ''}
                    FBS: {a.fastingBloodSugarMgDl ? `${a.fastingBloodSugarMgDl} mg/dL` : '—'} • Chol: {a.totalCholesterolMgDl ? `${a.totalCholesterolMgDl} mg/dL` : '—'}
                  </ThemedText>
                </Pressable>
                <View style={styles.historyActions}>
                  <Badge label={bMeta.label} variant={bMeta.badgeVariant} />
                  <Button
                    title="Edit"
                    variant="ghost"
                    size="sm"
                    icon="edit"
                    onPress={() => handleStartEdit(a)}
                  />
                  {isAuthor ? (
                    <Button
                      title="Void"
                      variant="ghost"
                      size="sm"
                      icon="trash"
                      textStyle={{ color: theme.colors.emergencyText }}
                      onPress={() => handleOpenVoidModal(a)}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}

          {/* Voided Assessments Section (Collapsible) */}
          {voidedAssessments.length > 0 && (
            <View style={styles.voidedSectionContainer}>
              <Pressable
                style={styles.toggleVoidedBtn}
                onPress={() => setShowVoided((prev) => !prev)}
                accessibilityRole="button"
              >
                <Icon
                  name={showVoided ? 'chevronUp' : 'chevronDown'}
                  size={16}
                  color={theme.colors.textSecondary}
                />
                <ThemedText variant="smallBold" color={theme.colors.textSecondary}>
                  {showVoided
                    ? `Hide ${voidedAssessments.length} retracted / voided ${voidedAssessments.length === 1 ? 'entry' : 'entries'}`
                    : `Show ${voidedAssessments.length} retracted / voided ${voidedAssessments.length === 1 ? 'entry' : 'entries'}`}
                </ThemedText>
              </Pressable>

              {showVoided &&
                voidedAssessments.map((a) => {
                  const rawDate = a.assessmentDate || a.createdAt;
                  const formattedDate = rawDate && !isNaN(new Date(rawDate).getTime())
                    ? new Date(rawDate).toLocaleDateString()
                    : new Date().toLocaleDateString();
                  const voidedDate = a.deletedAt && !isNaN(new Date(a.deletedAt).getTime())
                    ? new Date(a.deletedAt).toLocaleDateString()
                    : formattedDate;

                  return (
                    <View key={a.id} style={[styles.historyRow, styles.historyRowVoided]}>
                      <View style={{ flex: 1 }}>
                        <ThemedText
                          variant="bodyBold"
                          color={theme.colors.textSecondary}
                          style={styles.strikethroughText}
                        >
                          {formattedDate} • {a.assessedByStaffName?.trim() || 'Clinician'}
                        </ThemedText>
                        <ThemedText
                          variant="small"
                          color={theme.colors.textSecondary}
                          style={styles.strikethroughText}
                        >
                          {a.calculatedRiskScorePercent ? `Score: ${a.calculatedRiskScorePercent}% • ` : ''}
                          FBS: {a.fastingBloodSugarMgDl ? `${a.fastingBloodSugarMgDl} mg/dL` : '—'} • Chol: {a.totalCholesterolMgDl ? `${a.totalCholesterolMgDl} mg/dL` : '—'}
                        </ThemedText>
                        <ThemedText
                          variant="small"
                          color={theme.colors.textSecondary}
                          style={{ fontStyle: 'italic', marginTop: 2 }}
                        >
                          Voided on {voidedDate} by {a.deletedBy || 'Clinician'} • {a.voidReason || 'Entered in error'}
                        </ThemedText>
                      </View>
                      <Badge label="Entered in Error" variant="neutral" />
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      )}

      {/* Void / Entered in Error Confirmation Modal */}
      <Modal
        visible={voidModalVisible}
        onClose={() => !voidingSubmitting && setVoidModalVisible(false)}
        title="Mark Assessment as Entered in Error"
        subtitle={
          voidingAssessment
            ? `Assessment dated ${
                voidingAssessment.assessmentDate?.split('T')[0] ||
                voidingAssessment.createdAt?.split('T')[0] ||
                'Selected date'
              } by ${voidingAssessment.assessedByStaffName || 'Clinician'}`
            : undefined
        }
        maxWidth={500}
        footer={
          <View style={styles.modalFooterRow}>
            <Button
              title="Cancel"
              variant="ghost"
              disabled={voidingSubmitting}
              onPress={() => setVoidModalVisible(false)}
            />
            <Button
              title={voidingSubmitting ? 'Voiding…' : 'Confirm Retraction'}
              variant="danger"
              icon="trash"
              loading={voidingSubmitting}
              disabled={voidingSubmitting}
              onPress={handleConfirmVoid}
            />
          </View>
        }
      >
        <View style={styles.modalBody}>
          <ThemedText variant="body" color={theme.colors.textSecondary}>
            Under healthcare compliance, clinical records cannot be permanently destroyed. Marking this assessment as entered in error will retract it from active CVD risk calculations and chart summaries while maintaining the audit trail.
          </ThemedText>

          <ThemedText variant="smallBold" color={theme.colors.text} style={{ marginTop: theme.spacing.sm }}>
            Select Reason for Retraction:
          </ThemedText>

          <View style={styles.reasonPillsContainer}>
            {VOID_REASONS.map((r) => {
              const selected = voidReason === r;
              return (
                <Pressable
                  key={r}
                  style={[styles.reasonPill, selected && styles.reasonPillSelected]}
                  onPress={() => setVoidReason(r)}
                >
                  <ThemedText
                    variant="small"
                    color={selected ? theme.colors.primaryDark : theme.colors.text}
                    style={selected ? { fontWeight: '700' } : undefined}
                  >
                    {r}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          <Input
            label="Additional Notes / Remarks (Optional)"
            placeholder="e.g. Mistyped fasting blood sugar value"
            value={customVoidNotes}
            onChangeText={setCustomVoidNotes}
          />
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
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
  overrideAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.emergencySubtle,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  autoCalcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  autoCalcInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  autoSyncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
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
  actionFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  editingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  historyRowEditing: {
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
  },
  historyRowVoided: {
    opacity: 0.6,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.sm,
  },
  strikethroughText: {
    textDecorationLine: 'line-through',
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  voidedSectionContainer: {
    marginTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  toggleVoidedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
  },
  modalBody: {
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  reasonPillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  reasonPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  reasonPillSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
});

