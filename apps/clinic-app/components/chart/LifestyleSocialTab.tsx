import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList, ValidatedDateInput, validateDateString } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  PatientSocialHistory,
  UpdatePatientSocialHistoryPayload,
} from '../../services/clinicService';

export const PHYSICAL_ACTIVITY_OPTIONS = [
  'Sedentary (<30 mins/week)',
  'Lightly Active (<150 mins/week)',
  'Moderate Activity (≥150 mins/week)',
  'Vigorous / Highly Active',
];

export const DIETARY_HABIT_OPTIONS = [
  'Standard Balanced Diet',
  'High-Sodium / Salty Food',
  'High-Fat / Fried Food',
  'High-Fiber / Fruit & Vegetable Rich',
  'Low-Sodium / DASH Diet',
  'Diabetic / Low-Glycemic Diet',
  'Vegetarian / Plant-Based',
];

export const ALCOHOL_FREQUENCY_OPTIONS = [
  'Occasional / Social',
  '1-2x Weekly',
  '3-5x Weekly',
  'Daily',
];

interface LifestyleSocialTabProps {
  patient: ClinicPatient;
  initialSocialHistory?: PatientSocialHistory;
  onRefreshChart?: () => void;
}

export default function LifestyleSocialTab({
  patient,
  initialSocialHistory,
  onRefreshChart,
}: LifestyleSocialTabProps) {
  const isPediatric = (patient.age ?? 0) < 18;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Smoking Fields (Tri-state: 'never' | 'current' | 'quit')
  const [smokingStatus, setSmokingStatus] = useState<'never' | 'current' | 'quit'>('never');
  const [packsPerDay, setPacksPerDay] = useState('');
  const [yearsSmoking, setYearsSmoking] = useState('');
  const [smokingStoppedDate, setSmokingStoppedDate] = useState('');

  // Alcohol Fields (Tri-state: 'never' | 'current' | 'quit')
  const [alcoholStatus, setAlcoholStatus] = useState<'never' | 'current' | 'quit'>('never');
  const [alcoholDrinksPerWeek, setAlcoholDrinksPerWeek] = useState('');
  const [alcoholBottlesPerDay, setAlcoholBottlesPerDay] = useState('');
  const [alcoholFrequency, setAlcoholFrequency] = useState('Occasional / Social');

  // Substance Use
  const [usesIllicitDrugs, setUsesIllicitDrugs] = useState(false);
  const [drugTypes, setDrugTypes] = useState('');
  const [substanceUseHistory, setSubstanceUseHistory] = useState('');

  // Sexual Activity
  const [isSexuallyActive, setIsSexuallyActive] = useState(false);
  const [coitarcheAge, setCoitarcheAge] = useState('');

  // Standardized Lifestyle & Diet
  const [physicalActivityFrequency, setPhysicalActivityFrequency] = useState(PHYSICAL_ACTIVITY_OPTIONS[2]);
  const [selectedDietaryHabits, setSelectedDietaryHabits] = useState<string[]>([DIETARY_HABIT_OPTIONS[0]]);
  const [remarks, setRemarks] = useState('');

  const populateForm = (data: PatientSocialHistory) => {
    // Smoking Tri-State resolution
    let smk: 'never' | 'current' | 'quit' = 'never';
    const statusVal = data.smokingStatus?.toLowerCase();
    if (statusVal === 'current' || statusVal === 'y') {
      smk = 'current';
    } else if (statusVal === 'quit' || statusVal === 'former' || statusVal === 'x' || data.smokingStoppedDate) {
      smk = 'quit';
    } else if (data.isSmoker) {
      smk = 'current';
    }
    setSmokingStatus(smk);
    setPacksPerDay(data.packsPerDay != null ? String(data.packsPerDay) : '');
    setYearsSmoking(data.yearsSmoking != null ? String(data.yearsSmoking) : '');
    setSmokingStoppedDate(data.smokingStoppedDate ? data.smokingStoppedDate.split('T')[0] : '');

    // Alcohol Tri-State resolution
    let alc: 'never' | 'current' | 'quit' = 'never';
    const alcVal = data.alcoholStatus?.toLowerCase();
    const freqVal = data.alcoholFrequency?.trim().toLowerCase();
    if (alcVal === 'current' || alcVal === 'y') {
      alc = 'current';
    } else if (alcVal === 'quit' || alcVal === 'former' || alcVal === 'x' || freqVal === 'quit') {
      alc = 'quit';
    } else if (data.isAlcoholDrinker) {
      alc = 'current';
    }
    setAlcoholStatus(alc);
    setAlcoholDrinksPerWeek(data.alcoholDrinksPerWeek != null ? String(data.alcoholDrinksPerWeek) : '');
    setAlcoholBottlesPerDay(data.alcoholBottlesPerDay != null ? String(data.alcoholBottlesPerDay) : '');
    setAlcoholFrequency(data.alcoholFrequency && data.alcoholFrequency.toLowerCase() !== 'quit' ? data.alcoholFrequency : 'Occasional / Social');

    setUsesIllicitDrugs(data.usesIllicitDrugs);
    setDrugTypes(data.drugTypes || '');
    setSubstanceUseHistory(data.substanceUseHistory || '');

    setIsSexuallyActive(data.isSexuallyActive);
    setCoitarcheAge(data.coitarcheAge != null ? String(data.coitarcheAge) : '');

    // Standardized Physical Activity resolution
    if (data.physicalActivityFrequency && data.physicalActivityFrequency.trim()) {
      const match = PHYSICAL_ACTIVITY_OPTIONS.find((opt) =>
        opt.toLowerCase().includes(data.physicalActivityFrequency!.trim().toLowerCase()) ||
        data.physicalActivityFrequency!.trim().toLowerCase().includes(opt.split(' ')[0].toLowerCase())
      );
      setPhysicalActivityFrequency(match || data.physicalActivityFrequency);
    } else {
      setPhysicalActivityFrequency(PHYSICAL_ACTIVITY_OPTIONS[2]);
    }

    // Standardized Dietary Habits resolution
    if (data.dietaryHabits && data.dietaryHabits.trim()) {
      const habits = data.dietaryHabits
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const matched: string[] = [];
      habits.forEach((h) => {
        const found = DIETARY_HABIT_OPTIONS.find(
          (opt) => opt.toLowerCase().includes(h.toLowerCase()) || h.toLowerCase().includes(opt.toLowerCase())
        );
        if (found && !matched.includes(found)) {
          matched.push(found);
        } else if (!matched.includes(h)) {
          matched.push(h);
        }
      });
      setSelectedDietaryHabits(matched.length > 0 ? matched : [DIETARY_HABIT_OPTIONS[0]]);
    } else {
      setSelectedDietaryHabits([DIETARY_HABIT_OPTIONS[0]]);
    }

    setRemarks(data.remarks || '');
  };

  const fetchSocialHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, err] = await clinicService.getSocialHistory(patient.id);
      if (data) {
        populateForm(data);
      } else if (err) {
        setError(err.message || 'Unable to load social history.');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load social history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialSocialHistory) {
      populateForm(initialSocialHistory);
    } else {
      fetchSocialHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  // Dynamic Pack-Years calculation: packsPerDay * yearsSmoking
  const calcPacks = parseFloat(packsPerDay) || 0;
  const calcYears = parseFloat(yearsSmoking) || 0;
  const packYears = calcPacks > 0 && calcYears > 0 ? (calcPacks * calcYears).toFixed(1) : '0';

  const toggleDietaryHabit = (habit: string) => {
    if (selectedDietaryHabits.includes(habit)) {
      if (selectedDietaryHabits.length > 1) {
        setSelectedDietaryHabits(selectedDietaryHabits.filter((h) => h !== habit));
      }
    } else {
      setSelectedDietaryHabits([...selectedDietaryHabits, habit]);
    }
  };

  const handleSave = async () => {
    if (smokingStatus === 'quit' && smokingStoppedDate && smokingStoppedDate.trim()) {
      const stopDateValidation = validateDateString(smokingStoppedDate, { boundaryMode: 'pastOrToday' });
      if (!stopDateValidation.isValid) {
        Alert.alert('Invalid Date Stopped', stopDateValidation.errorMessage || 'Please enter a valid smoking cessation date not in the future.');
        return;
      }
    }
    setSaving(true);
    try {
      const isSmoker = smokingStatus === 'current';
      const isAlcoholDrinker = alcoholStatus === 'current';

      const payload: UpdatePatientSocialHistoryPayload = {
        isSmoker,
        smokingStatus,
        packsPerDay: (smokingStatus === 'current' || smokingStatus === 'quit') && calcPacks > 0 ? calcPacks : undefined,
        cigarettesPerDay: (smokingStatus === 'current' || smokingStatus === 'quit') && calcPacks > 0 ? Math.round(calcPacks * 20) : undefined,
        yearsSmoking: (smokingStatus === 'current' || smokingStatus === 'quit') && calcYears > 0 ? Math.round(calcYears) : undefined,
        smokingPackYears: (smokingStatus === 'current' || smokingStatus === 'quit') && parseFloat(packYears) > 0 ? parseFloat(packYears) : undefined,
        smokingStoppedDate: smokingStatus === 'quit' && smokingStoppedDate.trim() ? smokingStoppedDate.trim() : undefined,

        isAlcoholDrinker,
        alcoholStatus,
        alcoholDrinksPerWeek: isAlcoholDrinker && parseFloat(alcoholDrinksPerWeek) ? parseFloat(alcoholDrinksPerWeek) : undefined,
        alcoholBottlesPerDay: isAlcoholDrinker && parseFloat(alcoholBottlesPerDay) ? parseFloat(alcoholBottlesPerDay) : undefined,
        alcoholFrequency: alcoholStatus === 'quit' ? 'Quit' : (isAlcoholDrinker ? alcoholFrequency : undefined),

        usesIllicitDrugs,
        drugTypes: usesIllicitDrugs && drugTypes.trim() ? drugTypes.trim() : undefined,
        substanceUseHistory: usesIllicitDrugs && substanceUseHistory.trim() ? substanceUseHistory.trim() : undefined,

        isSexuallyActive,
        coitarcheAge: isSexuallyActive && parseInt(coitarcheAge, 10) ? parseInt(coitarcheAge, 10) : undefined,

        physicalActivityFrequency: physicalActivityFrequency.trim() || undefined,
        dietaryHabits: selectedDietaryHabits.join(', ') || undefined,
        remarks: remarks.trim() || undefined,
      };

      const [updated, err] = await clinicService.updateSocialHistory(patient.id, payload);
      if (err) {
        Alert.alert('Error', err.message || 'Failed to save lifestyle and social profile.');
      } else {
        Alert.alert('Success', 'Social and lifestyle profile updated successfully.');
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
          title="Could not load social history"
          message={error}
          onRetry={fetchSocialHistory}
        />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isPediatric && (
        <View style={styles.pediatricBanner}>
          <Icon name="info" size={theme.sizes.iconMd} color={theme.colors.infoText} />
          <View style={{ flex: 1 }}>
            <ThemedText variant="bodyBold" color={theme.colors.infoText}>
              Pediatric Patient Protocol ({patient.age} years)
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.infoText}>
              Under-18 patient: behavioral factors (smoking, alcohol, illicit substance use) default to non-user per PhilHealth Konsulta guidelines.
            </ThemedText>
          </View>
        </View>
      )}

      {/* SECTION 1: Tobacco & Smoking */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Tobacco & Smoking History</ThemedText>
          <Badge
            label={smokingStatus === 'current' ? 'Current Smoker' : smokingStatus === 'quit' ? 'Former Smoker (Quit)' : 'Non-Smoker'}
            variant={smokingStatus === 'current' ? 'warning' : 'outline'}
          />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Tobacco Smoking Status
          </ThemedText>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentBtn, smokingStatus === 'never' && styles.segmentBtnActive]}
              onPress={() => setSmokingStatus('never')}
            >
              <ThemedText variant="smallBold" color={smokingStatus === 'never' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Non-Smoker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, smokingStatus === 'current' && styles.segmentBtnActiveWarning]}
              onPress={() => setSmokingStatus('current')}
            >
              <ThemedText variant="smallBold" color={smokingStatus === 'current' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Current Smoker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, smokingStatus === 'quit' && styles.segmentBtnActiveQuit]}
              onPress={() => setSmokingStatus('quit')}
            >
              <ThemedText variant="smallBold" color={smokingStatus === 'quit' ? theme.colors.primaryDark : theme.colors.textSecondary}>
                Former Smoker (Quit)
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {smokingStatus === 'current' && (
          <View style={styles.conditionalForm}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Packs per Day"
                  placeholder="e.g. 0.5 or 1"
                  value={packsPerDay}
                  onChangeText={setPacksPerDay}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Years Smoking"
                  placeholder="e.g. 10"
                  value={yearsSmoking}
                  onChangeText={setYearsSmoking}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.packYearsCallout}>
              <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="smallBold" color={theme.colors.primary}>
                Calculated Smoking Pack-Years: {packYears} pack-years
              </ThemedText>
            </View>
          </View>
        )}

        {smokingStatus === 'quit' && (
          <View style={styles.conditionalForm}>
            <ValidatedDateInput
              label="Date Stopped (Smoking Cessation Date)"
              placeholder="YYYY-MM-DD"
              value={smokingStoppedDate}
              onChangeText={setSmokingStoppedDate}
              boundaryMode="pastOrToday"
            />
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Prior Packs per Day (optional)"
                  placeholder="e.g. 1"
                  value={packsPerDay}
                  onChangeText={setPacksPerDay}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Prior Years Smoking (optional)"
                  placeholder="e.g. 5"
                  value={yearsSmoking}
                  onChangeText={setYearsSmoking}
                  keyboardType="numeric"
                />
              </View>
            </View>
            {calcPacks > 0 && calcYears > 0 && (
              <View style={styles.packYearsCallout}>
                <Icon name="activity" size={theme.sizes.iconSm} color={theme.colors.primary} />
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  Calculated Cumulative Pack-Years: {packYears} pack-years
                </ThemedText>
              </View>
            )}
          </View>
        )}
      </View>

      {/* SECTION 2: Alcohol Consumption */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Alcohol Consumption</ThemedText>
          <Badge
            label={alcoholStatus === 'current' ? 'Current Drinker' : alcoholStatus === 'quit' ? 'Former Drinker (Quit)' : 'Non-Drinker'}
            variant={alcoholStatus === 'current' ? 'warning' : 'outline'}
          />
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Alcohol Intake Status
          </ThemedText>
          <View style={styles.segmentedRow}>
            <Pressable
              style={[styles.segmentBtn, alcoholStatus === 'never' && styles.segmentBtnActive]}
              onPress={() => setAlcoholStatus('never')}
            >
              <ThemedText variant="smallBold" color={alcoholStatus === 'never' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Non-Drinker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, alcoholStatus === 'current' && styles.segmentBtnActiveWarning]}
              onPress={() => setAlcoholStatus('current')}
            >
              <ThemedText variant="smallBold" color={alcoholStatus === 'current' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Current Drinker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, alcoholStatus === 'quit' && styles.segmentBtnActiveQuit]}
              onPress={() => setAlcoholStatus('quit')}
            >
              <ThemedText variant="smallBold" color={alcoholStatus === 'quit' ? theme.colors.primaryDark : theme.colors.textSecondary}>
                Former Drinker (Quit)
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {alcoholStatus === 'current' && (
          <View style={styles.conditionalForm}>
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Drinks per Week"
                  placeholder="e.g. 3"
                  value={alcoholDrinksPerWeek}
                  onChangeText={setAlcoholDrinksPerWeek}
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Bottles per Day"
                  placeholder="e.g. 1"
                  value={alcoholBottlesPerDay}
                  onChangeText={setAlcoholBottlesPerDay}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Drinking Frequency
              </ThemedText>
              <View style={styles.chipsWrap}>
                {ALCOHOL_FREQUENCY_OPTIONS.map((freq) => {
                  const active = alcoholFrequency === freq;
                  return (
                    <Pressable
                      key={freq}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setAlcoholFrequency(freq)}
                    >
                      <ThemedText variant={active ? 'smallBold' : 'small'} color={active ? theme.colors.primary : theme.colors.textSecondary}>
                        {freq}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </View>
        )}

        {alcoholStatus === 'quit' && (
          <View style={styles.conditionalForm}>
            <View style={styles.statusCallout}>
              <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.success} />
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                Patient has ceased alcohol consumption (Former Drinker).
              </ThemedText>
            </View>
          </View>
        )}
      </View>

      {/* SECTION 3: Illicit Substance Use */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Illicit Substance Use</ThemedText>
          <Badge
            label={usesIllicitDrugs ? 'Positive History' : 'Negative'}
            variant={usesIllicitDrugs ? 'emergency' : 'outline'}
          />
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            History of illicit substance or narcotic use?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !usesIllicitDrugs && styles.toggleBtnActive]}
              onPress={() => setUsesIllicitDrugs(false)}
            >
              <ThemedText variant="smallBold" color={!usesIllicitDrugs ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, usesIllicitDrugs && styles.toggleBtnActiveEmergency]}
              onPress={() => setUsesIllicitDrugs(true)}
            >
              <ThemedText variant="smallBold" color={usesIllicitDrugs ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {usesIllicitDrugs && (
          <View style={styles.conditionalForm}>
            <Input
              label="Substance Types"
              placeholder="e.g. Methamphetamine, Cannabis, Opioids"
              value={drugTypes}
              onChangeText={setDrugTypes}
            />
            <Input
              label="Substance Use History / Treatment"
              placeholder="e.g. Past user, completed rehabilitation 2020"
              value={substanceUseHistory}
              onChangeText={setSubstanceUseHistory}
            />
          </View>
        )}
      </View>

      {/* SECTION 4: Sexual Activity & Reproductive Social History */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Sexual Activity</ThemedText>
          <Badge
            label={isSexuallyActive ? 'Sexually Active' : 'Not Active'}
            variant={isSexuallyActive ? 'primary' : 'outline'}
          />
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Is the patient sexually active?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !isSexuallyActive && styles.toggleBtnActive]}
              onPress={() => setIsSexuallyActive(false)}
            >
              <ThemedText variant="smallBold" color={!isSexuallyActive ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isSexuallyActive && styles.toggleBtnActivePrimary]}
              onPress={() => setIsSexuallyActive(true)}
            >
              <ThemedText variant="smallBold" color={isSexuallyActive ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {isSexuallyActive && (
          <View style={styles.conditionalForm}>
            <Input
              label="Age at Coitarche (First Intercourse)"
              placeholder="e.g. 18"
              value={coitarcheAge}
              onChangeText={setCoitarcheAge}
              keyboardType="numeric"
            />
          </View>
        )}
      </View>

      {/* SECTION 5: Standardized Physical Activity & Nutrition */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Physical Activity & Nutrition</ThemedText>

        <View style={styles.fieldBlock}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Physical Activity Level
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Select standard cardiovascular and metabolic activity level
          </ThemedText>
          <View style={styles.chipsWrap}>
            {PHYSICAL_ACTIVITY_OPTIONS.map((opt) => {
              const active = physicalActivityFrequency === opt;
              return (
                <Pressable
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setPhysicalActivityFrequency(opt)}
                >
                  {active && <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.primary} />}
                  <ThemedText variant={active ? 'smallBold' : 'small'} color={active ? theme.colors.primary : theme.colors.textSecondary}>
                    {opt}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Dietary Habits & Nutrition
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Select all applicable nutrition profiles (multi-select)
          </ThemedText>
          <View style={styles.chipsWrap}>
            {DIETARY_HABIT_OPTIONS.map((opt) => {
              const active = selectedDietaryHabits.includes(opt);
              return (
                <Pressable
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => toggleDietaryHabit(opt)}
                >
                  <Icon name={active ? 'check' : 'plus'} size={theme.sizes.iconSm} color={active ? theme.colors.primary : theme.colors.textMuted} />
                  <ThemedText variant={active ? 'smallBold' : 'small'} color={active ? theme.colors.primary : theme.colors.textSecondary}>
                    {opt}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Input
          label="Clinical Remarks / Lifestyle Notes"
          placeholder="Additional dietary restrictions or clinical remarks"
          value={remarks}
          onChangeText={setRemarks}
        />
      </View>

      <View style={styles.actionFooter}>
        <Button
          title={saving ? 'Saving Changes…' : 'Save Lifestyle Profile'}
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
  pediatricBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
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
  fieldBlock: {
    gap: theme.spacing.xs,
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
  segmentedRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  segmentBtnActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentBtnActiveWarning: {
    backgroundColor: theme.colors.warning,
  },
  segmentBtnActiveQuit: {
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
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
  packYearsCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  statusCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  actionFooter: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
});
