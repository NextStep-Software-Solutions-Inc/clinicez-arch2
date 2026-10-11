import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { theme } from '@constants/theme';
import { ThemedText, Button, Input, Icon, Badge, ErrorState, SkeletonList } from '@ui';
import { Alert } from '@utils/feedback';
import {
  clinicService,
  ClinicPatient,
  PatientSocialHistory,
  UpdatePatientSocialHistoryPayload,
} from '../../services/clinicService';

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

  // Smoking Fields
  const [isSmoker, setIsSmoker] = useState(false);
  const [packsPerDay, setPacksPerDay] = useState('');
  const [yearsSmoking, setYearsSmoking] = useState('');
  const [smokingStoppedDate, setSmokingStoppedDate] = useState('');

  // Alcohol Fields
  const [isAlcoholDrinker, setIsAlcoholDrinker] = useState(false);
  const [alcoholDrinksPerWeek, setAlcoholDrinksPerWeek] = useState('');
  const [alcoholBottlesPerDay, setAlcoholBottlesPerDay] = useState('');
  const [alcoholFrequency, setAlcoholFrequency] = useState('Occasional');

  // Substance Use
  const [usesIllicitDrugs, setUsesIllicitDrugs] = useState(false);
  const [drugTypes, setDrugTypes] = useState('');
  const [substanceUseHistory, setSubstanceUseHistory] = useState('');

  // Sexual Activity
  const [isSexuallyActive, setIsSexuallyActive] = useState(false);
  const [coitarcheAge, setCoitarcheAge] = useState('');

  // Lifestyle & Diet
  const [physicalActivityFrequency, setPhysicalActivityFrequency] = useState('Moderate (>=150 mins/week)');
  const [dietaryHabits, setDietaryHabits] = useState('Standard Diet');
  const [remarks, setRemarks] = useState('');

  const populateForm = (data: PatientSocialHistory) => {
    setIsSmoker(data.isSmoker);
    setPacksPerDay(data.packsPerDay != null ? String(data.packsPerDay) : '');
    setYearsSmoking(data.yearsSmoking != null ? String(data.yearsSmoking) : '');
    setSmokingStoppedDate(data.smokingStoppedDate ? data.smokingStoppedDate.split('T')[0] : '');

    setIsAlcoholDrinker(data.isAlcoholDrinker);
    setAlcoholDrinksPerWeek(data.alcoholDrinksPerWeek != null ? String(data.alcoholDrinksPerWeek) : '');
    setAlcoholBottlesPerDay(data.alcoholBottlesPerDay != null ? String(data.alcoholBottlesPerDay) : '');
    setAlcoholFrequency(data.alcoholFrequency || 'Occasional');

    setUsesIllicitDrugs(data.usesIllicitDrugs);
    setDrugTypes(data.drugTypes || '');
    setSubstanceUseHistory(data.substanceUseHistory || '');

    setIsSexuallyActive(data.isSexuallyActive);
    setCoitarcheAge(data.coitarcheAge != null ? String(data.coitarcheAge) : '');

    setPhysicalActivityFrequency(data.physicalActivityFrequency || 'Moderate (>=150 mins/week)');
    setDietaryHabits(data.dietaryHabits || 'Standard Diet');
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

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: UpdatePatientSocialHistoryPayload = {
        isSmoker,
        packsPerDay: isSmoker && calcPacks > 0 ? calcPacks : undefined,
        cigarettesPerDay: isSmoker && calcPacks > 0 ? Math.round(calcPacks * 20) : undefined,
        yearsSmoking: isSmoker && calcYears > 0 ? Math.round(calcYears) : undefined,
        smokingPackYears: isSmoker ? parseFloat(packYears) : undefined,
        smokingStoppedDate: isSmoker && smokingStoppedDate.trim() ? smokingStoppedDate.trim() : undefined,

        isAlcoholDrinker,
        alcoholDrinksPerWeek: isAlcoholDrinker && parseFloat(alcoholDrinksPerWeek) ? parseFloat(alcoholDrinksPerWeek) : undefined,
        alcoholBottlesPerDay: isAlcoholDrinker && parseFloat(alcoholBottlesPerDay) ? parseFloat(alcoholBottlesPerDay) : undefined,
        alcoholFrequency: isAlcoholDrinker ? alcoholFrequency : undefined,

        usesIllicitDrugs,
        drugTypes: usesIllicitDrugs && drugTypes.trim() ? drugTypes.trim() : undefined,
        substanceUseHistory: usesIllicitDrugs && substanceUseHistory.trim() ? substanceUseHistory.trim() : undefined,

        isSexuallyActive,
        coitarcheAge: isSexuallyActive && parseInt(coitarcheAge, 10) ? parseInt(coitarcheAge, 10) : undefined,

        physicalActivityFrequency: physicalActivityFrequency.trim() || undefined,
        dietaryHabits: dietaryHabits.trim() || undefined,
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
            label={isSmoker ? 'Smoker' : 'Non-Smoker'}
            variant={isSmoker ? 'warning' : 'outline'}
          />
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Does the patient smoke tobacco / cigarettes?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !isSmoker && styles.toggleBtnActive]}
              onPress={() => setIsSmoker(false)}
            >
              <ThemedText variant="smallBold" color={!isSmoker ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isSmoker && styles.toggleBtnActiveWarning]}
              onPress={() => setIsSmoker(true)}
            >
              <ThemedText variant="smallBold" color={isSmoker ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {isSmoker && (
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

            <Input
              label="Date Stopped (if former smoker)"
              placeholder="YYYY-MM-DD"
              value={smokingStoppedDate}
              onChangeText={setSmokingStoppedDate}
            />
          </View>
        )}
      </View>

      {/* SECTION 2: Alcohol Consumption */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <ThemedText variant="h3">Alcohol Consumption</ThemedText>
          <Badge
            label={isAlcoholDrinker ? 'Drinker' : 'Non-Drinker'}
            variant={isAlcoholDrinker ? 'warning' : 'outline'}
          />
        </View>

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Does the patient consume alcoholic beverages?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !isAlcoholDrinker && styles.toggleBtnActive]}
              onPress={() => setIsAlcoholDrinker(false)}
            >
              <ThemedText variant="smallBold" color={!isAlcoholDrinker ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isAlcoholDrinker && styles.toggleBtnActiveWarning]}
              onPress={() => setIsAlcoholDrinker(true)}
            >
              <ThemedText variant="smallBold" color={isAlcoholDrinker ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Yes
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {isAlcoholDrinker && (
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

            <Input
              label="Drinking Frequency"
              placeholder="e.g. Daily, 2-3x Weekly, Occasional / Social"
              value={alcoholFrequency}
              onChangeText={setAlcoholFrequency}
            />
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

      {/* SECTION 5: Physical Activity & Diet */}
      <View style={styles.sectionCard}>
        <ThemedText variant="h3">Physical Activity & Nutrition</ThemedText>

        <Input
          label="Physical Activity Frequency"
          placeholder="e.g. Sedentary, Moderate (>=150m/wk), Heavy Athletics"
          value={physicalActivityFrequency}
          onChangeText={setPhysicalActivityFrequency}
        />

        <Input
          label="Dietary Habits"
          placeholder="e.g. Standard Filipino diet, High-sodium, Low-carb"
          value={dietaryHabits}
          onChangeText={setDietaryHabits}
        />

        <Input
          label="Clinical Remarks / Notes"
          placeholder="Additional lifestyle annotations"
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
  toggleBtnActiveWarning: {
    backgroundColor: theme.colors.warning,
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
  actionFooter: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
});
