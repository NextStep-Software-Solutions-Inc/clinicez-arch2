import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList, ValidatedDateInput, validateDateString } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  PatientReproductiveHistory,
  UpdatePatientReproductiveHistoryPayload,
} from '../../services/clinicService';

interface ReproductiveHealthTabProps {
  patient: ClinicPatient;
  initialReproductiveHistory?: PatientReproductiveHistory;
  onRefreshChart?: () => void;
}

export default function ReproductiveHealthTab({
  patient,
  initialReproductiveHistory,
  onRefreshChart,
}: ReproductiveHealthTabProps) {
  const isFemale = patient.gender?.toLowerCase().startsWith('f') ?? false;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Menstrual History Fields
  const [isApplicable, setIsApplicable] = useState(isFemale);
  const [menarcheAge, setMenarcheAge] = useState('');
  const [lastMenstrualPeriod, setLastMenstrualPeriod] = useState('');
  const [periodDurationDays, setPeriodDurationDays] = useState('');
  const [cycleIntervalDays, setCycleIntervalDays] = useState('');
  const [padsPerDay, setPadsPerDay] = useState('');
  const [isMenopausal, setIsMenopausal] = useState(false);
  const [menopauseAge, setMenopauseAge] = useState('');

  // Family Planning & Contraception
  const [contraceptiveMethod, setContraceptiveMethod] = useState('None');
  const [receivedFamilyPlanningCounseling, setReceivedFamilyPlanningCounseling] = useState(false);

  // Obstetric History (GPAL)
  const [gravidity, setGravidity] = useState('0');
  const [parity, setParity] = useState('0');
  const [termBirths, setTermBirths] = useState('0');
  const [pretermBirths, setPretermBirths] = useState('0');
  const [abortions, setAbortions] = useState('0');
  const [livingChildren, setLivingChildren] = useState('0');
  const [deliveryType, setDeliveryType] = useState('Normal Spontaneous Vaginal');
  const [hadPreEclampsiaHypertension, setHadPreEclampsiaHypertension] = useState(false);
  const [remarks, setRemarks] = useState('');

  const populateForm = (data: PatientReproductiveHistory) => {
    setIsApplicable(data.isApplicable);
    setMenarcheAge(data.menarcheAge != null ? String(data.menarcheAge) : '');
    setLastMenstrualPeriod(data.lastMenstrualPeriod ? data.lastMenstrualPeriod.split('T')[0] : '');
    setPeriodDurationDays(data.periodDurationDays != null ? String(data.periodDurationDays) : '');
    setCycleIntervalDays(data.cycleIntervalDays != null ? String(data.cycleIntervalDays) : '');
    setPadsPerDay(data.padsPerDay != null ? String(data.padsPerDay) : '');
    setIsMenopausal(data.isMenopausal);
    setMenopauseAge(data.menopauseAge != null ? String(data.menopauseAge) : '');

    setContraceptiveMethod(data.contraceptiveMethod || 'None');
    setReceivedFamilyPlanningCounseling(data.receivedFamilyPlanningCounseling);

    setGravidity(data.gravidity != null ? String(data.gravidity) : '0');
    setParity(data.parity != null ? String(data.parity) : '0');
    setTermBirths(data.termBirths != null ? String(data.termBirths) : '0');
    setPretermBirths(data.pretermBirths != null ? String(data.pretermBirths) : '0');
    setAbortions(data.abortions != null ? String(data.abortions) : '0');
    setLivingChildren(data.livingChildren != null ? String(data.livingChildren) : '0');
    setDeliveryType(data.deliveryType || 'Normal Spontaneous Vaginal');
    setHadPreEclampsiaHypertension(data.hadPreEclampsiaHypertension);
    setRemarks(data.remarks || '');
  };

  const fetchReproductiveHistory = async () => {
    if (!isFemale) return;
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getReproductiveHistory(patient.id);
      if (data) {
        populateForm(data);
      } else if (err) {
        setError(err.message || 'Unable to load reproductive health profile.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load reproductive history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isFemale) {
      if (initialReproductiveHistory) {
        populateForm(initialReproductiveHistory);
      } else {
        fetchReproductiveHistory();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, isFemale]);

  // If patient is male, display strict clinical guard banner
  if (!isFemale) {
    return (
      <View style={styles.container}>
        <View style={styles.maleGuardCard}>
          <Icon name="shield" size={theme.sizes.iconLg} color={theme.colors.infoText} />
          <ThemedText variant="h3" color={theme.colors.infoText} style={{ textAlign: 'center' }}>
            Reproductive Health Profiling Not Applicable
          </ThemedText>
          <ThemedText variant="body" color={theme.colors.textSecondary} style={{ textAlign: 'center' }}>
            Patient gender is recorded as <ThemedText variant="bodyBold" color={theme.colors.text}>{patient.gender}</ThemedText>.
            Women&apos;s reproductive health and obstetric indicators (menstrual cycles, gravidity/parity, contraception)
            are restricted to female patients per PhilHealth Yakap statutory schemas.
          </ThemedText>
        </View>
      </View>
    );
  }

  const handleSave = async () => {
    if (isApplicable && lastMenstrualPeriod && lastMenstrualPeriod.trim()) {
      const lmpValidation = validateDateString(lastMenstrualPeriod, { boundaryMode: 'pastOrToday' });
      if (!lmpValidation.isValid) {
        Alert.alert('Invalid LMP Date', lmpValidation.errorMessage || 'Please enter a valid Last Menstrual Period date not in the future.');
        return;
      }
    }
    setSaving(true);
    try {
      const payload: UpdatePatientReproductiveHistoryPayload = {
        isApplicable,
        menarcheAge: isApplicable && parseInt(menarcheAge, 10) ? parseInt(menarcheAge, 10) : undefined,
        lastMenstrualPeriod: isApplicable && lastMenstrualPeriod.trim() ? lastMenstrualPeriod.trim() : undefined,
        periodDurationDays: isApplicable && parseInt(periodDurationDays, 10) ? parseInt(periodDurationDays, 10) : undefined,
        cycleIntervalDays: isApplicable && parseInt(cycleIntervalDays, 10) ? parseInt(cycleIntervalDays, 10) : undefined,
        padsPerDay: isApplicable && parseInt(padsPerDay, 10) ? parseInt(padsPerDay, 10) : undefined,
        isMenopausal: isApplicable ? isMenopausal : false,
        menopauseAge: isApplicable && isMenopausal && parseInt(menopauseAge, 10) ? parseInt(menopauseAge, 10) : undefined,

        contraceptiveMethod: contraceptiveMethod.trim() || undefined,
        receivedFamilyPlanningCounseling,

        gravidity: parseInt(gravidity, 10) || 0,
        parity: parseInt(parity, 10) || 0,
        termBirths: parseInt(termBirths, 10) || 0,
        pretermBirths: parseInt(pretermBirths, 10) || 0,
        abortions: parseInt(abortions, 10) || 0,
        livingChildren: parseInt(livingChildren, 10) || 0,
        deliveryType: deliveryType.trim() || undefined,
        hadPreEclampsiaHypertension,
        remarks: remarks.trim() || undefined,
      };

      const [updated, err] = await clinicService.updateReproductiveHistory(patient.id, payload);
      if (err) {
        Alert.alert('Error', err.message || 'Failed to update reproductive health profile.');
      } else {
        Alert.alert('Success', "Women's & Reproductive health profile saved successfully.");
        if (updated) {
          populateForm(updated);
        }
        onRefreshChart?.();
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unexpected error while saving.');
    } finally {
      setSaving(false);
    }
  };

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
          title="Could not load reproductive history"
          message={error}
          onRetry={fetchReproductiveHistory}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* SECTION 1: Menstrual History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Menstrual History</ThemedText>
          <Badge
            label={isMenopausal ? 'Menopausal' : isApplicable ? 'Active Cycles' : 'Not Applicable'}
            variant={isMenopausal ? 'outline' : 'primary'}
          />
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Are menstrual cycles applicable?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !isApplicable && styles.toggleBtnActive]}
              onPress={() => setIsApplicable(false)}
            >
              <ThemedText variant="smallBold" color={!isApplicable ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isApplicable && styles.toggleBtnActivePrimary]}
              onPress={() => setIsApplicable(true)}
            >
              <ThemedText variant="smallBold" color={isApplicable ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {isApplicable && (
          <View style={styles.conditionalForm}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Menarche Age"
                  placeholder="e.g. 12"
                  value={menarcheAge}
                  onChangeText={setMenarcheAge}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="LMP (Last Menstrual Period)"
                  placeholder="YYYY-MM-DD"
                  value={lastMenstrualPeriod}
                  onChangeText={setLastMenstrualPeriod}
                  boundaryMode="pastOrToday"
                />
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Duration (Days)"
                  placeholder="e.g. 5"
                  value={periodDurationDays}
                  onChangeText={setPeriodDurationDays}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Cycle Interval (Days)"
                  placeholder="e.g. 28"
                  value={cycleIntervalDays}
                  onChangeText={setCycleIntervalDays}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Pads per Day"
                  placeholder="e.g. 3"
                  value={padsPerDay}
                  onChangeText={setPadsPerDay}
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Menopause Toggle */}
            <View style={[styles.switchRow, { marginTop: theme.spacing.xs }]}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Is the patient in menopause?
              </ThemedText>
              <View style={styles.toggleRow}>
                <Pressable
                  style={[styles.toggleBtn, !isMenopausal && styles.toggleBtnActive]}
                  onPress={() => setIsMenopausal(false)}
                >
                  <ThemedText variant="smallBold" color={!isMenopausal ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    No
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, isMenopausal && styles.toggleBtnActivePrimary]}
                  onPress={() => setIsMenopausal(true)}
                >
                  <ThemedText variant="smallBold" color={isMenopausal ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    Yes
                  </ThemedText>
                </Pressable>
              </View>
            </View>

            {isMenopausal && (
              <Input
                label="Age at Menopause"
                placeholder="e.g. 50"
                value={menopauseAge}
                onChangeText={setMenopauseAge}
                keyboardType="numeric"
              />
            )}
          </View>
        )}
      </View>

      {/* SECTION 2: Obstetric History (GPAL Score) */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Obstetric Score (GPAL)</ThemedText>
          <Badge
            label={`G${gravidity || 0} P${parity || 0} (T${termBirths || 0} P${pretermBirths || 0} A${abortions || 0} L${livingChildren || 0})`}
            variant="primary"
          />
        </View>

        <ThemedText variant="small" color={theme.colors.textSecondary}>
          Gravida (total pregnancies) and Parity (viable births) with TPAL breakdown.
        </ThemedText>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Gravidity (G)"
              placeholder="0"
              value={gravidity}
              onChangeText={setGravidity}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Parity (P)"
              placeholder="0"
              value={parity}
              onChangeText={setParity}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Living (L)"
              placeholder="0"
              value={livingChildren}
              onChangeText={setLivingChildren}
              keyboardType="numeric"
            />
          </View>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Term Births (T)"
              placeholder="0"
              value={termBirths}
              onChangeText={setTermBirths}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Preterm Births (P)"
              placeholder="0"
              value={pretermBirths}
              onChangeText={setPretermBirths}
              keyboardType="numeric"
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Abortions (A)"
              placeholder="0"
              value={abortions}
              onChangeText={setAbortions}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Input
          label="Most Recent Delivery Type"
          placeholder="e.g. Normal Spontaneous Vaginal, Low Transverse Cesarean"
          value={deliveryType}
          onChangeText={setDeliveryType}
        />

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            History of Pre-eclampsia or Gestational Hypertension?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hadPreEclampsiaHypertension && styles.toggleBtnActive]}
              onPress={() => setHadPreEclampsiaHypertension(false)}
            >
              <ThemedText variant="smallBold" color={!hadPreEclampsiaHypertension ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hadPreEclampsiaHypertension && styles.toggleBtnActiveEmergency]}
              onPress={() => setHadPreEclampsiaHypertension(true)}
            >
              <ThemedText variant="smallBold" color={hadPreEclampsiaHypertension ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>

      {/* SECTION 3: Contraception & Family Planning */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Contraception & Family Planning</ThemedText>

        <Input
          label="Contraceptive Method in Use"
          placeholder="e.g. None, Oral Contraceptives, IUD, Injectable Depo, Barrier"
          value={contraceptiveMethod}
          onChangeText={setContraceptiveMethod}
        />

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Received Family Planning Counseling?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !receivedFamilyPlanningCounseling && styles.toggleBtnActive]}
              onPress={() => setReceivedFamilyPlanningCounseling(false)}
            >
              <ThemedText variant="smallBold" color={!receivedFamilyPlanningCounseling ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, receivedFamilyPlanningCounseling && styles.toggleBtnActivePrimary]}
              onPress={() => setReceivedFamilyPlanningCounseling(true)}
            >
              <ThemedText variant="smallBold" color={receivedFamilyPlanningCounseling ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        <Input
          label="Clinical Remarks / Notes"
          placeholder="Additional obstetric or gynecological remarks"
          value={remarks}
          onChangeText={setRemarks}
        />
      </View>

      <View style={styles.actionFooter}>
        <Button
          title={saving ? 'Saving Changes…' : 'Save Women\'s Health Profile'}
          variant="primary"
          size="lg"
          icon="check"
          loading={saving}
          disabled={saving}
          onPress={handleSave}
        />
      </View>
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
  maleGuardCard: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    margin: theme.spacing.md,
  },
  sectionCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
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
  toggleBtnActivePrimary: {
    backgroundColor: theme.colors.primary,
  },
  toggleBtnActiveEmergency: {
    backgroundColor: theme.colors.emergency,
  },
  conditionalForm: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
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
});
