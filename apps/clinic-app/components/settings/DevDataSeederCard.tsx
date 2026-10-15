import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify, Alert } from '../../utils/feedback';
import { useClinic } from '../../context/ClinicContext';
import {
  clinicService,
  PatientSeedResult,
  SeedStatusResult,
} from '../../services/clinicService';

const PRESET_COUNTS = [500, 1000, 2500, 5000];

export interface DevDataSeederCardProps {
  onNavigatePatients?: () => void;
}

export default function DevDataSeederCard({ onNavigatePatients }: DevDataSeederCardProps = {}) {
  const { facilityName, settings } = useClinic();

  const activeClinicId = settings?.clinicId;
  const activeTenantId = settings?.tenantId;
  const activeClinicName = facilityName || settings?.clinicName || 'Active Clinic';

  const [selectedCount, setSelectedCount] = useState<number>(1000);
  const [clearExisting, setClearExisting] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);
  const [status, setStatus] = useState<SeedStatusResult | null>(null);
  const [seeding, setSeeding] = useState<boolean>(false);
  const [clearing, setClearing] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<PatientSeedResult | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!activeClinicId) return;
    setLoadingStatus(true);
    const [data, err] = await clinicService.getClinicSeedStatus(activeClinicId);
    setLoadingStatus(false);
    if (!err && data) {
      setStatus(data);
    }
  }, [activeClinicId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSeed = async () => {
    if (!activeClinicId) {
      notify.error('No active clinic detected to seed data into.');
      return;
    }

    setSeeding(true);
    setLastResult(null);

    const [result, err] = await clinicService.seedClinicData({
      count: selectedCount,
      clearExisting,
      clinicId: activeClinicId,
      tenantId: activeTenantId,
    });

    setSeeding(false);

    if (err) {
      notify.error(err.message || 'Failed to seed clinic records.');
      return;
    }

    if (result) {
      setLastResult(result);
      notify.success(
        `Seeded ${result.patientsCreated.toLocaleString()} patients exclusive to ${activeClinicName}!`
      );
      fetchStatus();
    }
  };

  const handleClear = () => {
    if (!activeClinicId) return;

    Alert.alert(
      'Purge Clinic Test Data',
      `Are you sure you want to delete all test patient records generated for "${activeClinicName}"? Non-test patients and settings will be preserved.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Purge Test Data',
          style: 'destructive',
          onPress: async () => {
            setClearing(true);
            const [res, err] = await clinicService.clearClinicSeedData(activeClinicId);
            setClearing(false);
            if (err) {
              notify.error(err.message || 'Failed to purge clinic test records.');
              return;
            }
            notify.success(
              `Purged ${res?.clearedCount ?? 0} test patient records for this clinic.`
            );
            setLastResult(null);
            fetchStatus();
          },
        },
      ]
    );
  };

  const handleNavigateToPatients = () => {
    if (onNavigatePatients) {
      onNavigatePatients();
    }
  };

  const totalHistories = status
    ? (status.medicalHistories?.pastMedicalHistories ?? 0) +
      (status.medicalHistories?.familyHistories ?? 0) +
      (status.medicalHistories?.socialHistories ?? 0) +
      (status.medicalHistories?.surgicalHistories ?? 0) +
      (status.medicalHistories?.reproductiveHistories ?? 0) +
      (status.medicalHistories?.allergies ?? 0) +
      (status.medicalHistories?.problems ?? 0) +
      (status.medicalHistories?.immunizations ?? 0)
    : 0;

  return (
    <Card>
      <CardHeader
        title="Development Data Seeder & Scalability Engine"
        subtitle="Generate realistic patient records, consultation encounters (SOAP), prescriptions, and certificates exclusive to this clinic."
        rightAction={
          <Badge label="Clinic-Exclusive Test Scope" variant="primary" />
        }
      />
      <CardContent>
        <View style={styles.container}>
          {/* Target Clinic Scope Banner */}
          <View style={styles.scopeBanner}>
            <View style={styles.scopeInfo}>
              <View style={styles.scopeHeaderRow}>
                <Icon name="check" size={18} color={theme.colors.primary} />
                <ThemedText variant="bodyBold" color={theme.colors.primary}>
                  {activeClinicName}
                </ThemedText>
                <Badge label="Active Workspace Target" variant="neutral" />
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Clinic ID: {activeClinicId ?? 'Resolving...'} • Tenant: {activeTenantId ?? 'default'}
              </ThemedText>
              <ThemedText variant="small" color={theme.colors.textSecondary}>
                All seeded patient demographics, encounters, prescriptions, and official certificates will be tagged with this clinic ID. Other clinics and tenants in the system will not see or share this test dataset.
              </ThemedText>
            </View>
          </View>

          {/* Current Clinic Record Metrics */}
          <View style={styles.metricsSection}>
            <View style={styles.metricsHeader}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Current Records for this Clinic
              </ThemedText>
              <Button
                title={loadingStatus ? 'Refreshing...' : 'Refresh Counts'}
                variant="ghost"
                icon="refresh"
                disabled={loadingStatus || seeding || clearing}
                onPress={fetchStatus}
              />
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Total Patients
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.text}>
                  {status ? status.totalPatients.toLocaleString() : '—'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.primary}>
                  {status ? `${status.seededPatients.toLocaleString()} seeded` : ''}
                </ThemedText>
              </View>

              <View style={styles.statBox}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Consultations (SOAP)
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.text}>
                  {status ? status.totalEncounters.toLocaleString() : '—'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Full notes & diagnoses
                </ThemedText>
              </View>

              <View style={styles.statBox}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Prescriptions (Rx)
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.text}>
                  {status ? status.totalPrescriptions.toLocaleString() : '—'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Linked medications
                </ThemedText>
              </View>

              <View style={styles.statBox}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Medical Certificates
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.text}>
                  {status ? status.totalMedCerts.toLocaleString() : '—'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Official signed certs
                </ThemedText>
              </View>

              <View style={styles.statBox}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Medical Histories
                </ThemedText>
                <ThemedText variant="h3" color={theme.colors.text}>
                  {status ? totalHistories.toLocaleString() : '—'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Allergies, vaccines & past
                </ThemedText>
              </View>
            </View>
          </View>

          {/* Record Count Selector */}
          <View style={styles.configSection}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Number of Patient Records to Seed:
            </ThemedText>
            <View style={styles.presetRow}>
              {PRESET_COUNTS.map((cnt) => (
                <Pressable
                  key={cnt}
                  style={[
                    styles.countPill,
                    selectedCount === cnt && styles.countPillActive,
                  ]}
                  onPress={() => setSelectedCount(cnt)}
                  disabled={seeding || clearing}
                >
                  <ThemedText
                    variant="bodyBold"
                    color={
                      selectedCount === cnt
                        ? theme.colors.textInverted
                        : theme.colors.text
                    }
                  >
                    {cnt.toLocaleString()} Records
                  </ThemedText>
                  <ThemedText
                    variant="caption"
                    color={
                      selectedCount === cnt
                        ? theme.colors.textInverted
                        : theme.colors.textMuted
                    }
                  >
                    {cnt === 500
                      ? 'Quick smoke test'
                      : cnt === 1000
                      ? 'Browser scalability goal'
                      : cnt === 2500
                      ? 'Heavy UI stress test'
                      : 'High-volume load test'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Options: Clear existing toggle */}
          <Pressable
            style={styles.optionRow}
            onPress={() => setClearExisting(!clearExisting)}
            disabled={seeding || clearing}
          >
            <View
              style={[
                styles.checkbox,
                clearExisting && styles.checkboxChecked,
              ]}
            >
              {clearExisting ? (
                <Icon name="check" size={14} color={theme.colors.textInverted} />
              ) : null}
            </View>
            <View style={styles.optionTextWrap}>
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Purge previous test records before seeding
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Removes previously generated test patients for this clinic to keep the database clean and prevent duplicate test codes.
              </ThemedText>
            </View>
          </Pressable>

          {/* Action Trigger Buttons */}
          <View style={styles.actionsRow}>
            <Button
              title={
                seeding
                  ? `Seeding ${selectedCount.toLocaleString()} Patients for ${activeClinicName}...`
                  : `Seed ${selectedCount.toLocaleString()} Records for this Clinic`
              }
              variant="primary"
              icon="plus"
              loading={seeding}
              disabled={seeding || clearing || !activeClinicId}
              onPress={handleSeed}
            />

            <Button
              title={clearing ? 'Purging Test Data...' : 'Purge Clinic Test Data'}
              variant="outline"
              icon="trash"
              loading={clearing}
              disabled={seeding || clearing || !activeClinicId || !status?.seededPatients}
              onPress={handleClear}
            />

            <Button
              title="Open Patient Registry"
              variant="secondary"
              icon="patients"
              disabled={seeding || clearing}
              onPress={handleNavigateToPatients}
            />
          </View>

          {/* Seeding in progress indicator */}
          {seeding && (
            <View style={styles.progressBox}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <View style={styles.progressTextWrap}>
                <ThemedText variant="bodyBold" color={theme.colors.primary}>
                  Generating high-volume dataset for {activeClinicName}...
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Synthesizing realistic Filipino demographics, multi-condition medical histories, SOAP notes, prescriptions, and official medical certificates in memory-optimized database batches.
                </ThemedText>
              </View>
            </View>
          )}

          {/* Last Generation Result Summary */}
          {lastResult && !seeding && (
            <View style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <Icon name="check" size={20} color={theme.colors.success} />
                <ThemedText variant="bodyBold" color={theme.colors.successText}>
                  Seeding Completed in {lastResult.elapsed}
                </ThemedText>
              </View>

              <View style={styles.resultDetailsGrid}>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Patients Created: <ThemedText variant="smallBold">{lastResult.patientsCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Consultations (SOAP): <ThemedText variant="smallBold">{lastResult.encountersCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Prescriptions (Rx): <ThemedText variant="smallBold">{lastResult.prescriptionsCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Medical Certificates: <ThemedText variant="smallBold">{lastResult.medicalCertificatesCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Past Medical Histories: <ThemedText variant="smallBold">{lastResult.pastMedicalHistoriesCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Allergies Documented: <ThemedText variant="smallBold">{lastResult.allergiesCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Problem Lists: <ThemedText variant="smallBold">{lastResult.problemsCreated.toLocaleString()}</ThemedText>
                </ThemedText>
                <ThemedText variant="small" color={theme.colors.textSecondary}>
                  • Immunizations: <ThemedText variant="smallBold">{lastResult.immunizationsCreated.toLocaleString()}</ThemedText>
                </ThemedText>
              </View>

              <View style={styles.resultFooter}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Attending Clinician: {lastResult.doctorName} • Clinic ID: {lastResult.clinicId}
                </ThemedText>
                {lastResult.samplePatientCodes?.length > 0 && (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Sample Codes: {lastResult.samplePatientCodes.slice(0, 5).join(', ')}...
                  </ThemedText>
                )}
                <View style={styles.resultActions}>
                  <Button
                    title="View Patients in Registry"
                    variant="primary"
                    icon="patients"
                    onPress={handleNavigateToPatients}
                  />
                </View>
              </View>
            </View>
          )}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  scopeBanner: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
  },
  scopeInfo: {
    gap: theme.spacing.xs,
  },
  scopeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  metricsSection: {
    gap: theme.spacing.sm,
  },
  metricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  statBox: {
    flex: 1,
    minWidth: 140,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    gap: 4,
  },
  configSection: {
    gap: theme.spacing.sm,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  countPill: {
    flex: 1,
    minWidth: 150,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 2,
  },
  countPillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: theme.radii.xs,
    borderWidth: 1.5,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  optionTextWrap: {
    flex: 1,
    gap: 2,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1,
    borderColor: theme.colors.primaryBorder,
  },
  progressTextWrap: {
    flex: 1,
    gap: 2,
  },
  resultCard: {
    backgroundColor: theme.colors.successBg,
    borderWidth: 1,
    borderColor: theme.colors.successBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  resultDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  resultFooter: {
    marginTop: theme.spacing.xs,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.successBorder,
    gap: theme.spacing.xs,
  },
  resultActions: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
  },
});
