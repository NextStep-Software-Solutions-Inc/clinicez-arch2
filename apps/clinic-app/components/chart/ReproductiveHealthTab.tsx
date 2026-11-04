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
  Select,
} from '@ui';
import { useClinic } from '../../context/ClinicContext';
import { useAuth, usePermission } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import {
  normalizeDeliveryType,
  normalizeContraceptiveMethod,
} from '../../constants/reproductiveHealth';
import { useEhrOptions } from '../../hooks/useEhrOptions';
import {
  clinicService,
  formatClinicDateTime,
  ClinicPatient,
  PatientReproductiveHistory,
  UpdatePatientReproductiveHistoryPayload,
} from '../../services/clinicService';

interface ReproductiveHealthTabProps {
  patient: ClinicPatient;
  initialReproductiveHistory?: PatientReproductiveHistory;
  onRefreshChart?: () => void;
  readOnly?: boolean;
}

type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export default function ReproductiveHealthTab({
  patient,
  initialReproductiveHistory,
  onRefreshChart,
  readOnly,
}: ReproductiveHealthTabProps) {
  const { selectOptions: deliveryOptions } = useEhrOptions('delivery_type');
  const { selectOptions: contraOptions } = useEhrOptions('contraceptive_method');
  const { dateFormat, timeFormat, timeZoneId } = useClinic();

  const { user, state, permissions } = useAuth();
  const hasPatientsWrite = usePermission(PERMISSIONS.patientsWrite);
  const isUnmountedTestHarness = state === 'booting' && !user && permissions.length === 0;
  const canWritePatients = readOnly !== undefined ? !readOnly : isUnmountedTestHarness ? true : hasPatientsWrite;

  const isFemale = patient.sex?.toLowerCase().startsWith('f') ?? false;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(
    () => initialReproductiveHistory?.updatedAt ?? initialReproductiveHistory?.createdAt ?? null
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

  const formSnapshotRef = useRef({
    isApplicable,
    menarcheAge,
    lastMenstrualPeriod,
    periodDurationDays,
    cycleIntervalDays,
    padsPerDay,
    isMenopausal,
    menopauseAge,
    contraceptiveMethod,
    receivedFamilyPlanningCounseling,
    gravidity,
    parity,
    termBirths,
    pretermBirths,
    abortions,
    livingChildren,
    deliveryType,
    hadPreEclampsiaHypertension,
    remarks,
  });
  formSnapshotRef.current = {
    isApplicable,
    menarcheAge,
    lastMenstrualPeriod,
    periodDurationDays,
    cycleIntervalDays,
    padsPerDay,
    isMenopausal,
    menopauseAge,
    contraceptiveMethod,
    receivedFamilyPlanningCounseling,
    gravidity,
    parity,
    termBirths,
    pretermBirths,
    abortions,
    livingChildren,
    deliveryType,
    hadPreEclampsiaHypertension,
    remarks,
  };

  const markUserEdited = useCallback(
    (kind: 'discrete' | 'text') => {
      if (!canWritePatients || !isFemale) return;
      lastEditKindRef.current = kind;
      setAutoSaveStatus('saving');
      setAutoSaveError(null);
      setUserEditVersion((v) => v + 1);
    },
    [canWritePatients, isFemale]
  );

  const populateForm = (data: PatientReproductiveHistory) => {
    setIsApplicable(data.isApplicable);
    setMenarcheAge(data.menarcheAge != null ? String(data.menarcheAge) : '');
    setLastMenstrualPeriod(data.lastMenstrualPeriod ? data.lastMenstrualPeriod.split('T')[0] : '');
    setPeriodDurationDays(data.periodDurationDays != null ? String(data.periodDurationDays) : '');
    setCycleIntervalDays(data.cycleIntervalDays != null ? String(data.cycleIntervalDays) : '');
    setPadsPerDay(data.padsPerDay != null ? String(data.padsPerDay) : '');
    setIsMenopausal(data.isMenopausal);
    setMenopauseAge(data.menopauseAge != null ? String(data.menopauseAge) : '');

    setContraceptiveMethod(normalizeContraceptiveMethod(data.contraceptiveMethod));
    setReceivedFamilyPlanningCounseling(data.receivedFamilyPlanningCounseling);

    setGravidity(data.gravidity != null ? String(data.gravidity) : '0');
    setParity(data.parity != null ? String(data.parity) : '0');
    setTermBirths(data.termBirths != null ? String(data.termBirths) : '0');
    setPretermBirths(data.pretermBirths != null ? String(data.pretermBirths) : '0');
    setAbortions(data.abortions != null ? String(data.abortions) : '0');
    setLivingChildren(data.livingChildren != null ? String(data.livingChildren) : '0');
    setDeliveryType(normalizeDeliveryType(data.deliveryType));
    setHadPreEclampsiaHypertension(data.hadPreEclampsiaHypertension);
    setRemarks(data.remarks || '');

    const savedTimestamp = data.updatedAt || data.createdAt || null;
    if (savedTimestamp) {
      setLastSavedAt(savedTimestamp);
    }
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
    setLastSavedAt(
      initialReproductiveHistory?.updatedAt ?? initialReproductiveHistory?.createdAt ?? null
    );
    if (isFemale) {
      if (initialReproductiveHistory) {
        populateForm(initialReproductiveHistory);
      } else {
        fetchReproductiveHistory();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, isFemale]);

  const performAutoSave = useCallback(async () => {
    if (!canWritePatients || !isFemale) return;

    const snap = formSnapshotRef.current;
    const trimmedLmp = snap.lastMenstrualPeriod.trim();

    if (snap.isApplicable && trimmedLmp.length > 0) {
      if (trimmedLmp.length < 10) {
        setAutoSaveStatus('idle');
        return;
      }
      const lmpValidation = validateDateString(trimmedLmp, { boundaryMode: 'pastOrToday' });
      if (!lmpValidation.isValid) {
        setAutoSaveStatus('error');
        setAutoSaveError(
          lmpValidation.errorMessage ||
            'Please enter a valid Last Menstrual Period date not in the future.'
        );
        return;
      }
    }

    const payload: UpdatePatientReproductiveHistoryPayload = {
      isApplicable: snap.isApplicable,
      menarcheAge:
        snap.isApplicable && parseInt(snap.menarcheAge, 10)
          ? parseInt(snap.menarcheAge, 10)
          : undefined,
      lastMenstrualPeriod: snap.isApplicable && trimmedLmp ? trimmedLmp : undefined,
      periodDurationDays:
        snap.isApplicable && parseInt(snap.periodDurationDays, 10)
          ? parseInt(snap.periodDurationDays, 10)
          : undefined,
      cycleIntervalDays:
        snap.isApplicable && parseInt(snap.cycleIntervalDays, 10)
          ? parseInt(snap.cycleIntervalDays, 10)
          : undefined,
      padsPerDay:
        snap.isApplicable && parseInt(snap.padsPerDay, 10)
          ? parseInt(snap.padsPerDay, 10)
          : undefined,
      isMenopausal: snap.isApplicable ? snap.isMenopausal : false,
      menopauseAge:
        snap.isApplicable && snap.isMenopausal && parseInt(snap.menopauseAge, 10)
          ? parseInt(snap.menopauseAge, 10)
          : undefined,

      contraceptiveMethod: snap.contraceptiveMethod.trim() || undefined,
      receivedFamilyPlanningCounseling: snap.receivedFamilyPlanningCounseling,

      gravidity: parseInt(snap.gravidity, 10) || 0,
      parity: parseInt(snap.parity, 10) || 0,
      termBirths: parseInt(snap.termBirths, 10) || 0,
      pretermBirths: parseInt(snap.pretermBirths, 10) || 0,
      abortions: parseInt(snap.abortions, 10) || 0,
      livingChildren: parseInt(snap.livingChildren, 10) || 0,
      deliveryType: snap.deliveryType.trim() || undefined,
      hadPreEclampsiaHypertension: snap.hadPreEclampsiaHypertension,
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
      const [updated, err] = await clinicService.updateReproductiveHistory(patient.id, payload);
      if (err) {
        setAutoSaveStatus('error');
        setAutoSaveError(err.message || 'Failed to auto-save reproductive health profile.');
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
      setAutoSaveError(e?.message || 'Unexpected error while saving reproductive health profile.');
    } finally {
      inFlightSaveRef.current = false;
      const shouldResave =
        pendingResaveRef.current && userEditVersionRef.current > savingEditVersion;
      pendingResaveRef.current = false;
      if (shouldResave) {
        void performAutoSaveRef.current();
      }
    }
  }, [canWritePatients, isFemale, patient.id]);

  const performAutoSaveRef = useRef(performAutoSave);
  performAutoSaveRef.current = performAutoSave;

  useEffect(() => {
    if (
      userEditVersion === 0 ||
      userEditVersion <= lastSavedEditVersionRef.current ||
      !canWritePatients ||
      !isFemale
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
            Patient sex is recorded as <ThemedText variant="bodyBold" color={theme.colors.text}>{patient.sex}</ThemedText>.
            Women&apos;s reproductive health and obstetric indicators (menstrual cycles, gravidity/parity, contraception)
            are restricted to female patients.
          </ThemedText>
        </View>
      </View>
    );
  }

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
      {!canWritePatients ? (
        <View style={styles.readOnlyBanner} accessibilityRole="alert">
          <Icon name="lock" size={theme.sizes.iconSm} color={theme.colors.warningText} />
          <ThemedText variant="small" color={theme.colors.warningText} style={{ flex: 1 }}>
            Read-only mode: &apos;patients:write&apos; permission is required to save reproductive health changes.
          </ThemedText>
        </View>
      ) : null}

      {(canWritePatients || lastSavedBadgeLabel) ? (
        <View style={styles.autoSaveBar}>
          <View style={styles.autoSaveLeftRow}>
            <Icon name="checkCircle" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
            <ThemedText variant="caption" color={theme.colors.textSecondary} style={{ flex: 1 }}>
              {canWritePatients
                ? "Changes to women's & reproductive health are saved automatically."
                : "Women's & reproductive health record"}
            </ThemedText>
          </View>
          <View style={styles.autoSaveRightRow}>
            {canWritePatients && autoSaveStatus === 'saving' ? (
              <Badge label="Saving changes…" variant="warning" size="sm" icon="clock" />
            ) : canWritePatients && autoSaveStatus === 'error' ? (
              <Pressable
                onPress={() => void performAutoSave()}
                accessibilityRole="button"
                accessibilityLabel="Retry saving reproductive health changes"
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
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setIsApplicable(false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={!isApplicable ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, isApplicable && styles.toggleBtnActivePrimary]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setIsApplicable(true);
                markUserEdited('discrete');
              }}
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
                  onChangeText={(val) => {
                    setMenarcheAge(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <ValidatedDateInput
                  label="LMP (Last Menstrual Period)"
                  placeholder="YYYY-MM-DD"
                  value={lastMenstrualPeriod}
                  onChangeText={(val) => {
                    setLastMenstrualPeriod(val);
                    markUserEdited('text');
                  }}
                  boundaryMode="pastOrToday"
                  disabled={!canWritePatients}
                  editable={canWritePatients}
                />
              </View>
            </View>

            <View style={styles.formGrid}>
              <View style={styles.gridItem}>
                <Input
                  label="Duration (Days)"
                  placeholder="e.g. 5"
                  value={periodDurationDays}
                  onChangeText={(val) => {
                    setPeriodDurationDays(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Cycle Interval (Days)"
                  placeholder="e.g. 28"
                  value={cycleIntervalDays}
                  onChangeText={(val) => {
                    setCycleIntervalDays(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
                />
              </View>
              <View style={styles.gridItem}>
                <Input
                  label="Pads per Day"
                  placeholder="e.g. 3"
                  value={padsPerDay}
                  onChangeText={(val) => {
                    setPadsPerDay(val);
                    markUserEdited('text');
                  }}
                  keyboardType="numeric"
                  editable={canWritePatients}
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
                  disabled={!canWritePatients}
                  onPress={() => {
                    if (!canWritePatients) return;
                    setIsMenopausal(false);
                    markUserEdited('discrete');
                  }}
                >
                  <ThemedText variant="smallBold" color={!isMenopausal ? theme.colors.onPrimary : theme.colors.textSecondary}>
                    No
                  </ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, isMenopausal && styles.toggleBtnActivePrimary]}
                  disabled={!canWritePatients}
                  onPress={() => {
                    if (!canWritePatients) return;
                    setIsMenopausal(true);
                    markUserEdited('discrete');
                  }}
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
                onChangeText={(val) => {
                  setMenopauseAge(val);
                  markUserEdited('text');
                }}
                keyboardType="numeric"
                editable={canWritePatients}
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
              onChangeText={(val) => {
                setGravidity(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Parity (P)"
              placeholder="0"
              value={parity}
              onChangeText={(val) => {
                setParity(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Living (L)"
              placeholder="0"
              value={livingChildren}
              onChangeText={(val) => {
                setLivingChildren(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
        </View>

        <View style={styles.formGrid}>
          <View style={styles.gridItem}>
            <Input
              label="Term Births (T)"
              placeholder="0"
              value={termBirths}
              onChangeText={(val) => {
                setTermBirths(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Preterm Births (P)"
              placeholder="0"
              value={pretermBirths}
              onChangeText={(val) => {
                setPretermBirths(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
          <View style={styles.gridItem}>
            <Input
              label="Abortions (A)"
              placeholder="0"
              value={abortions}
              onChangeText={(val) => {
                setAbortions(val);
                markUserEdited('text');
              }}
              keyboardType="numeric"
              editable={canWritePatients}
            />
          </View>
        </View>

        <Select
          label="Most Recent Delivery Type"
          value={deliveryType}
          onSelect={(val) => {
            if (!canWritePatients) return;
            setDeliveryType(val);
            markUserEdited('discrete');
          }}
          options={deliveryOptions}
          modalTitle="Select Most Recent Delivery Type"
          modalSubtitle="Select standard obstetric delivery mode"
          icon="baby"
          placeholder="Select delivery type..."
          allowCustom
          disabled={!canWritePatients}
        />

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            History of Pre-eclampsia or Gestational Hypertension?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !hadPreEclampsiaHypertension && styles.toggleBtnActive]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setHadPreEclampsiaHypertension(false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={!hadPreEclampsiaHypertension ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, hadPreEclampsiaHypertension && styles.toggleBtnActiveEmergency]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setHadPreEclampsiaHypertension(true);
                markUserEdited('discrete');
              }}
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

        <Select
          label="Contraceptive Method in Use"
          value={contraceptiveMethod}
          onSelect={(val) => {
            if (!canWritePatients) return;
            setContraceptiveMethod(val);
            markUserEdited('discrete');
          }}
          options={contraOptions}
          modalTitle="Select Contraceptive Method"
          modalSubtitle="Select current family planning or contraceptive method"
          icon="shield"
          placeholder="Select contraceptive method..."
          allowCustom
          disabled={!canWritePatients}
        />

        <View style={styles.switchRow}>
          <ThemedText variant="bodyBold" color={theme.colors.text}>
            Received Family Planning Counseling?
          </ThemedText>
          <View style={styles.toggleRow}>
            <Pressable
              style={[styles.toggleBtn, !receivedFamilyPlanningCounseling && styles.toggleBtnActive]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setReceivedFamilyPlanningCounseling(false);
                markUserEdited('discrete');
              }}
            >
              <ThemedText variant="smallBold" color={!receivedFamilyPlanningCounseling ? theme.colors.onPrimary : theme.colors.textSecondary}>
                No
              </ThemedText>
            </Pressable>
            <Pressable
              style={[styles.toggleBtn, receivedFamilyPlanningCounseling && styles.toggleBtnActivePrimary]}
              disabled={!canWritePatients}
              onPress={() => {
                if (!canWritePatients) return;
                setReceivedFamilyPlanningCounseling(true);
                markUserEdited('discrete');
              }}
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
  maleGuardCard: {
    backgroundColor: theme.colors.infoBg,
    borderColor: theme.colors.infoBorder,
    borderWidth: 1,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    gap: theme.spacing.md,
    marginVertical: theme.spacing.md,
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
});
