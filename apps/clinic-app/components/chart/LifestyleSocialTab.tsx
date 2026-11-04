import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { theme } from '@constants/theme';
import {
  ThemedText,
  Button,
  Input,
  Icon,
  Badge,
  ErrorState,
  SkeletonList,
  ValidatedDateInput,
  validateDateString,
} from '@ui';
import { useClinic } from '../../context/ClinicContext';
import { useAuth, usePermission } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  clinicService,
  formatClinicDateTime,
  ClinicPatient,
  PatientSocialHistory,
  UpdatePatientSocialHistoryPayload,
} from '../../services/clinicService';
import { useEhrOptions } from '../../hooks/useEhrOptions';

interface LifestyleSocialTabProps {
  patient: ClinicPatient;
  initialSocialHistory?: PatientSocialHistory;
  onRefreshChart?: () => void;
  readOnly?: boolean;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export function isPhysicalActivityOptionSelected(currentVal: string, optLabel: string): boolean {
  const cleanCur = currentVal.trim().toLowerCase();
  const cleanOpt = optLabel.trim().toLowerCase();
  if (!cleanCur || !cleanOpt) return false;
  if (cleanCur === cleanOpt) return true;
  const optFirstWord = cleanOpt.split(/[\s(/]+/)[0];
  return cleanOpt.includes(cleanCur) || (optFirstWord.length >= 4 && cleanCur.startsWith(optFirstWord));
}

export default function LifestyleSocialTab({
  patient,
  initialSocialHistory,
  onRefreshChart,
  readOnly,
}: LifestyleSocialTabProps) {
  const { dateFormat, timeFormat, timeZoneId } = useClinic();
  const { user, state, permissions } = useAuth();
  const hasPatientsWrite = usePermission(PERMISSIONS.patientsWrite);
  const isUnmountedTestHarness = state === 'booting' && !user && permissions.length === 0;
  const canWritePatients = readOnly !== undefined ? !readOnly : isUnmountedTestHarness ? true : hasPatientsWrite;

  const isPediatric = (patient.age ?? 0) < 18;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    () => initialSocialHistory?.updatedAt ?? initialSocialHistory?.createdAt ?? null
  );
  const [userEditVersion, setUserEditVersion] = useState(0);

  const lastEditKindRef = useRef<'discrete' | 'text'>('discrete');
  const inFlightSaveRef = useRef(false);
  const pendingResaveRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userEditVersionRef = useRef(0);
  userEditVersionRef.current = userEditVersion;
  const lastSavedEditVersionRef = useRef(0);
  const lastSavedPayloadJsonRef = useRef<string | null>(null);
  const onRefreshChartRef = useRef(onRefreshChart);
  onRefreshChartRef.current = onRefreshChart;

  const { options: dynamicActivityOptions, loading: activityOptionsLoading } =
    useEhrOptions('physical_activity');
  const { options: dynamicDietaryOptions } = useEhrOptions('dietary_intake');
  const { options: dynamicAlcoholOptions } = useEhrOptions('alcohol_type');

  const activityOptions = dynamicActivityOptions.map((o) => o.label);
  const dietaryOptions = dynamicDietaryOptions.map((o) => o.label);
  const alcoholFrequencyOptions = dynamicAlcoholOptions.map((o) => o.label);

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
  const [physicalActivityFrequency, setPhysicalActivityFrequency] = useState('');
  const [selectedDietaryHabits, setSelectedDietaryHabits] = useState<string[]>([]);
  const [remarks, setRemarks] = useState('');

  // Dynamic Pack-Years calculation: packsPerDay * yearsSmoking
  const calcPacks = parseFloat(packsPerDay) || 0;
  const calcYears = parseFloat(yearsSmoking) || 0;
  const packYears = calcPacks > 0 && calcYears > 0 ? (calcPacks * calcYears).toFixed(1) : '0';

  const formSnapshotRef = useRef({
    smokingStatus,
    packsPerDay,
    yearsSmoking,
    smokingStoppedDate,
    alcoholStatus,
    alcoholDrinksPerWeek,
    alcoholBottlesPerDay,
    alcoholFrequency,
    usesIllicitDrugs,
    drugTypes,
    substanceUseHistory,
    isSexuallyActive,
    coitarcheAge,
    physicalActivityFrequency,
    selectedDietaryHabits,
    remarks,
  });
  formSnapshotRef.current = {
    smokingStatus,
    packsPerDay,
    yearsSmoking,
    smokingStoppedDate,
    alcoholStatus,
    alcoholDrinksPerWeek,
    alcoholBottlesPerDay,
    alcoholFrequency,
    usesIllicitDrugs,
    drugTypes,
    substanceUseHistory,
    isSexuallyActive,
    coitarcheAge,
    physicalActivityFrequency,
    selectedDietaryHabits,
    remarks,
  };

  const markUserEdited = useCallback(
    (kind: 'discrete' | 'text') => {
      if (!canWritePatients) return;
      lastEditKindRef.current = kind;
      setAutoSaveStatus('saving');
      setAutoSaveError(null);
      setUserEditVersion((v) => v + 1);
    },
    [canWritePatients]
  );

  const populateForm = (data: PatientSocialHistory) => {
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
    setAlcoholFrequency(
      data.alcoholFrequency && data.alcoholFrequency.toLowerCase() !== 'quit'
        ? data.alcoholFrequency
        : 'Occasional / Social'
    );

    setUsesIllicitDrugs(data.usesIllicitDrugs);
    setDrugTypes(data.drugTypes || '');
    setSubstanceUseHistory(data.substanceUseHistory || '');

    setIsSexuallyActive(data.isSexuallyActive);
    setCoitarcheAge(data.coitarcheAge != null ? String(data.coitarcheAge) : '');

    if (data.physicalActivityFrequency && data.physicalActivityFrequency.trim()) {
      const match = activityOptions.find((opt) =>
        isPhysicalActivityOptionSelected(data.physicalActivityFrequency!, opt)
      );
      setPhysicalActivityFrequency(match || data.physicalActivityFrequency);
    } else {
      setPhysicalActivityFrequency('');
    }

    if (data.dietaryHabits && data.dietaryHabits.trim()) {
      const habits = data.dietaryHabits
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const matched: string[] = [];
      habits.forEach((h) => {
        const found = dietaryOptions.find(
          (opt) => opt.toLowerCase().includes(h.toLowerCase()) || h.toLowerCase().includes(opt.toLowerCase())
        );
        if (found && !matched.includes(found)) {
          matched.push(found);
        } else if (!matched.includes(h)) {
          matched.push(h);
        }
      });
      setSelectedDietaryHabits(matched.length > 0 ? matched : []);
    } else {
      setSelectedDietaryHabits([]);
    }

    setRemarks(data.remarks || '');

    const savedTimestamp = data.updatedAt || data.createdAt || null;
    if (savedTimestamp) {
      setLastSavedAt(savedTimestamp);
    }
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
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    pendingResaveRef.current = false;
    userEditVersionRef.current = 0;
    lastSavedEditVersionRef.current = 0;
    lastSavedPayloadJsonRef.current = null;
    setUserEditVersion(0);
    setAutoSaveStatus('idle');
    setAutoSaveError(null);
    setLastSavedAt(initialSocialHistory?.updatedAt ?? initialSocialHistory?.createdAt ?? null);
    if (initialSocialHistory) {
      populateForm(initialSocialHistory);
    } else {
      fetchSocialHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id]);

  const toggleDietaryHabit = (habit: string) => {
    if (!canWritePatients) return;
    if (selectedDietaryHabits.includes(habit)) {
      setSelectedDietaryHabits(selectedDietaryHabits.filter((h) => h !== habit));
    } else {
      setSelectedDietaryHabits([...selectedDietaryHabits, habit]);
    }
    markUserEdited('discrete');
  };

  const performAutoSave = useCallback(async () => {
    if (!canWritePatients) return;

    const snap = formSnapshotRef.current;
    const trimmedStopDate = snap.smokingStoppedDate.trim();

    if (snap.smokingStatus === 'quit' && trimmedStopDate.length > 0) {
      if (trimmedStopDate.length < 10) {
        setAutoSaveStatus('idle');
        return;
      }
      const stopDateValidation = validateDateString(trimmedStopDate, { boundaryMode: 'pastOrToday' });
      if (!stopDateValidation.isValid) {
        setAutoSaveStatus('error');
        setAutoSaveError(
          stopDateValidation.errorMessage || 'Please enter a valid smoking cessation date not in the future.'
        );
        return;
      }
    }

    const snapPacks = parseFloat(snap.packsPerDay) || 0;
    const snapYears = parseFloat(snap.yearsSmoking) || 0;
    const snapPackYears = snapPacks > 0 && snapYears > 0 ? parseFloat((snapPacks * snapYears).toFixed(1)) : 0;
    const isSmoker = snap.smokingStatus === 'current';
    const isAlcoholDrinker = snap.alcoholStatus === 'current';

    const payload: UpdatePatientSocialHistoryPayload = {
      isSmoker,
      smokingStatus: snap.smokingStatus,
      packsPerDay:
        (snap.smokingStatus === 'current' || snap.smokingStatus === 'quit') && snapPacks > 0
          ? snapPacks
          : undefined,
      cigarettesPerDay:
        (snap.smokingStatus === 'current' || snap.smokingStatus === 'quit') && snapPacks > 0
          ? Math.round(snapPacks * 20)
          : undefined,
      yearsSmoking:
        (snap.smokingStatus === 'current' || snap.smokingStatus === 'quit') && snapYears > 0
          ? Math.round(snapYears)
          : undefined,
      smokingPackYears:
        (snap.smokingStatus === 'current' || snap.smokingStatus === 'quit') && snapPackYears > 0
          ? snapPackYears
          : undefined,
      smokingStoppedDate:
        snap.smokingStatus === 'quit' && trimmedStopDate ? trimmedStopDate : undefined,

      isAlcoholDrinker,
      alcoholStatus: snap.alcoholStatus,
      alcoholDrinksPerWeek:
        isAlcoholDrinker && parseFloat(snap.alcoholDrinksPerWeek)
          ? parseFloat(snap.alcoholDrinksPerWeek)
          : undefined,
      alcoholBottlesPerDay:
        isAlcoholDrinker && parseFloat(snap.alcoholBottlesPerDay)
          ? parseFloat(snap.alcoholBottlesPerDay)
          : undefined,
      alcoholFrequency:
        snap.alcoholStatus === 'quit'
          ? 'Quit'
          : isAlcoholDrinker
            ? snap.alcoholFrequency
            : undefined,

      usesIllicitDrugs: snap.usesIllicitDrugs,
      drugTypes: snap.usesIllicitDrugs && snap.drugTypes.trim() ? snap.drugTypes.trim() : undefined,
      substanceUseHistory:
        snap.usesIllicitDrugs && snap.substanceUseHistory.trim()
          ? snap.substanceUseHistory.trim()
          : undefined,

      isSexuallyActive: snap.isSexuallyActive,
      coitarcheAge:
        snap.isSexuallyActive && parseInt(snap.coitarcheAge, 10)
          ? parseInt(snap.coitarcheAge, 10)
          : undefined,

      physicalActivityFrequency: snap.physicalActivityFrequency.trim() || undefined,
      dietaryHabits: snap.selectedDietaryHabits.join(', ') || undefined,
      remarks: snap.remarks.trim() || undefined,
    };

    const savingEditVersion = userEditVersionRef.current;
    const payloadKey = JSON.stringify(payload);
    if (payloadKey === lastSavedPayloadJsonRef.current) {
      lastSavedEditVersionRef.current = Math.max(
        lastSavedEditVersionRef.current,
        savingEditVersion
      );
      setAutoSaveStatus('saved');
      setAutoSaveError(null);
      return;
    }

    if (inFlightSaveRef.current) {
      pendingResaveRef.current = true;
      return;
    }

    inFlightSaveRef.current = true;
    setAutoSaveStatus('saving');
    setAutoSaveError(null);

    try {
      const [updated, err] = await clinicService.updateSocialHistory(patient.id, payload);
      if (err) {
        setAutoSaveStatus('error');
        setAutoSaveError(err.message || 'Failed to auto-save lifestyle and social profile.');
      } else {
        lastSavedPayloadJsonRef.current = payloadKey;
        lastSavedEditVersionRef.current = Math.max(
          lastSavedEditVersionRef.current,
          savingEditVersion
        );
        const savedIso = updated?.updatedAt || new Date().toISOString();
        setLastSavedAt(savedIso);
        setAutoSaveStatus('saved');
        onRefreshChartRef.current?.();
      }
    } catch (e: any) {
      setAutoSaveStatus('error');
      setAutoSaveError(e?.message || 'Unexpected error while saving lifestyle profile.');
    } finally {
      inFlightSaveRef.current = false;
      const shouldResave =
        pendingResaveRef.current && userEditVersionRef.current > savingEditVersion;
      pendingResaveRef.current = false;
      if (shouldResave) {
        void performAutoSaveRef.current();
      }
    }
  }, [canWritePatients, patient.id]);

  const performAutoSaveRef = useRef(performAutoSave);
  performAutoSaveRef.current = performAutoSave;

  useEffect(() => {
    if (
      userEditVersion === 0 ||
      userEditVersion <= lastSavedEditVersionRef.current ||
      !canWritePatients
    ) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const delayMs = lastEditKindRef.current === 'discrete' ? 300 : 650;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      void performAutoSaveRef.current();
    }, delayMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
    // Trigger auto-save strictly when userEditVersion increments from an explicit user edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEditVersion]);

  const formatLastSavedBadge = useCallback(
    (iso?: string | null): string | null => {
      if (!iso) return null;
      const formatted = formatClinicDateTime(iso, {
        dateFormat,
        timeFormat,
        timeZoneId,
        fallback: '',
      });
      return formatted ? `Last saved ${formatted}` : null;
    },
    [dateFormat, timeFormat, timeZoneId]
  );

  const lastSavedBadgeLabel = formatLastSavedBadge(lastSavedAt);

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
      {!canWritePatients ? (
        <View style={styles.readOnlyBanner} accessibilityRole="alert">
          <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
          <ThemedText variant="small" color={theme.colors.warningText} style={{ flex: 1 }}>
            Read-only mode: &apos;patients:write&apos; permission is required to save lifestyle changes.
          </ThemedText>
        </View>
      ) : null}

      {(canWritePatients || lastSavedBadgeLabel) ? (
        <View style={styles.autoSaveBar}>
          <View style={styles.autoSaveLeftRow}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
            <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              {canWritePatients
                ? 'Changes to lifestyle and social history are saved automatically.'
                : 'Lifestyle and social history record'}
            </ThemedText>
          </View>
          <View style={styles.autoSaveRightRow}>
            {canWritePatients && autoSaveStatus === 'saving' ? (
              <Badge label="Saving changes…" variant="warning" size="sm" icon="clock" />
            ) : canWritePatients && autoSaveStatus === 'error' ? (
              <Pressable
                onPress={() => void performAutoSave()}
                accessibilityRole="button"
                accessibilityLabel="Retry saving lifestyle changes"
              >
                <Badge label="Autosave failed • Retry" variant="emergency" size="sm" icon="alertCircle" />
              </Pressable>
            ) : lastSavedBadgeLabel ? (
              <Badge
                label={lastSavedBadgeLabel}
                variant={autoSaveStatus === 'saved' ? 'success' : 'routine'}
                size="sm"
                icon={autoSaveStatus === 'saved' ? 'checkCircle' : 'check'}
              />
            ) : canWritePatients ? (
              <Badge label="Auto-save active" variant="routine" size="sm" icon="check" />
            ) : null}
          </View>
        </View>
      ) : null}

      {autoSaveStatus === 'error' && autoSaveError ? (
        <View style={styles.autoSaveErrorBanner} accessibilityRole="alert">
          <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
          <ThemedText variant="small" color={theme.colors.emergencyText} style={{ flex: 1 }}>
            {autoSaveError}
          </ThemedText>
          <Button
            title="Retry"
            variant="outline"
            size="sm"
            onPress={() => void performAutoSave()}
          />
        </View>
      ) : null}

      {isPediatric && (
        <View style={styles.pediatricBanner}>
          <Icon name="info" size={theme.sizes.iconMd} color={theme.colors.infoText} />
          <View style={{ flex: 1 }}>
            <ThemedText variant="bodyBold" color={theme.colors.infoText}>
              Pediatric Patient Protocol ({patient.age} years)
            </ThemedText>
            <ThemedText variant="small" color={theme.colors.infoText}>
              Under-18 patient: behavioral factors (smoking, alcohol, illicit substance use) default to non-user per PhilHealth YAKAP guidelines.
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
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setSmokingStatus('never');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={smokingStatus === 'never' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Non-Smoker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, smokingStatus === 'current' && styles.segmentBtnActiveWarning]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setSmokingStatus('current');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={smokingStatus === 'current' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Current Smoker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, smokingStatus === 'quit' && styles.segmentBtnActiveQuit]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setSmokingStatus('quit');
                markUserEdited('discrete');
              }}
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
                  onChangeText={(val) => {
                    setPacksPerDay(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Years Smoking"
                  placeholder="e.g. 10"
                  value={yearsSmoking}
                  onChangeText={(val) => {
                    setYearsSmoking(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
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
              onChangeText={(val) => {
                setSmokingStoppedDate(val);
                markUserEdited('text');
              }}
              boundaryMode="pastOrToday"
              disabled={!canWritePatients}
              editable={canWritePatients}
            />
            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Prior Packs per Day (optional)"
                  placeholder="e.g. 1"
                  value={packsPerDay}
                  onChangeText={(val) => {
                    setPacksPerDay(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Prior Years Smoking (optional)"
                  placeholder="e.g. 5"
                  value={yearsSmoking}
                  onChangeText={(val) => {
                    setYearsSmoking(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
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
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setAlcoholStatus('never');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={alcoholStatus === 'never' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Non-Drinker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, alcoholStatus === 'current' && styles.segmentBtnActiveWarning]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setAlcoholStatus('current');
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={alcoholStatus === 'current' ? theme.colors.onPrimary : theme.colors.textSecondary}>
                Current Drinker
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.segmentBtn, alcoholStatus === 'quit' && styles.segmentBtnActiveQuit]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setAlcoholStatus('quit');
                markUserEdited('discrete');
              }}
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
                  onChangeText={(val) => {
                    setAlcoholDrinksPerWeek(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Bottles per Day"
                  placeholder="e.g. 1"
                  value={alcoholBottlesPerDay}
                  onChangeText={(val) => {
                    setAlcoholBottlesPerDay(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
            </View>

            <View style={styles.fieldBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Drinking Frequency / Beverage Type
              </ThemedText>
              <View style={styles.chipsWrap}>
                {alcoholFrequencyOptions.map((freq) => {
                  const active = alcoholFrequency === freq;
                  return (
                    <Pressable
                      key={freq}
                      style={[styles.chip, active && styles.chipActive]}
                      disabled={!canWritePatients}
                      onPress={() => {
                        if (!canWritePatients) return;
                        setAlcoholFrequency(freq);
                        markUserEdited('discrete');
                      }}
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
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setUsesIllicitDrugs(false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={!usesIllicitDrugs ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, usesIllicitDrugs && styles.toggleBtnActiveEmergency]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setUsesIllicitDrugs(true);
                markUserEdited('discrete');
              }}
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
              onChangeText={(val) => {
                setDrugTypes(val);
                markUserEdited('text');
              }}
              editable={canWritePatients}
            />
            <Input
              label="Substance Use History / Treatment"
              placeholder="e.g. Past user, completed rehabilitation 2020"
              value={substanceUseHistory}
              onChangeText={(val) => {
                setSubstanceUseHistory(val);
                markUserEdited('text');
              }}
              editable={canWritePatients}
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
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setIsSexuallyActive(false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={!isSexuallyActive ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isSexuallyActive && styles.toggleBtnActivePrimary]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setIsSexuallyActive(true);
                markUserEdited('discrete');
              }}
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
              onChangeText={(val) => {
                setCoitarcheAge(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
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
          {activityOptions.length > 0 ? (
            <View style={styles.chipsWrap}>
              {activityOptions.map((opt) => {
                const active = isPhysicalActivityOptionSelected(physicalActivityFrequency, opt);
                return (
                  <Pressable
                    key={opt}
                    style={[styles.chip, active && styles.chipActive]}
                    disabled={!canWritePatients}
                    onPress={() => {
                      if (!canWritePatients) return;
                      setPhysicalActivityFrequency(active ? '' : opt);
                      markUserEdited('discrete');
                    }}
                  >
                    <Icon
                      name={active ? 'check' : 'plus'}
                      size={theme.sizes.iconSm}
                      color={active ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant={active ? 'smallBold' : 'small'}
                      color={active ? theme.colors.primary : theme.colors.textSecondary}
                    >
                      {opt}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          ) : activityOptionsLoading ? (
            <ThemedText variant="small" color={theme.colors.textMuted} style={styles.inlineLoadingNote}>
              Loading physical activity options…
            </ThemedText>
          ) : (
            <Input
              placeholder="e.g. Sedentary (<30 mins/week), Light, Moderate (≥150 mins/week), or Vigorous"
              value={physicalActivityFrequency}
              onChangeText={(val) => {
                setPhysicalActivityFrequency(val);
                markUserEdited('text');
              }}
              editable={canWritePatients}
            />
          )}
        </View>

        <View style={styles.fieldBlock}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Dietary Habits & Nutrition
          </ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Select all applicable nutrition profiles (multi-select)
          </ThemedText>
          <View style={styles.chipsWrap}>
            {dietaryOptions.map((opt) => {
              const active = selectedDietaryHabits.includes(opt);
              return (
                <Pressable
                  key={opt}
                  style={[styles.chip, active && styles.chipActive]}
                  disabled={!canWritePatients}
                  onPress={() => toggleDietaryHabit(opt)}
                >
                  <Icon
                    name={active ? 'check' : 'plus'}
                    size={theme.sizes.iconSm}
                    color={active ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <ThemedText
                    variant={active ? 'smallBold' : 'small'}
                    color={active ? theme.colors.primary : theme.colors.textSecondary}
                  >
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
          onChangeText={(val) => {
            setRemarks(val);
            markUserEdited('text');
          }}
          editable={canWritePatients}
        />
      </View>
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
  readOnlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  autoSaveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  autoSaveLeftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    flex: 1,
  },
  autoSaveRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  autoSaveErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
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
  inlineLoadingNote: {
    marginTop: theme.spacing.xs,
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
});
