import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput } from 'react-native';
import { theme } from '../../constants/theme';
import {
  ThemedText,
  Badge,
  Icon,
  EmptyState,
  Button,
  Card,
  CardHeader,
  SegmentedControl,
} from '../ui';
import {
  clinicService,
  type ClinicPatient,
  type PatientChart,
  type ClinicalProcedureRecord,
} from '../../services/clinicService';
import {
  ToothSurfaceDiagram,
  DentalToothRecord,
  ToothStatus,
  ToothSurfaceCode,
  getToothStatusLabel,
  sortToothSurfaces,
  getToothDescription,
  normalizeTeethToMultiRecord,
  resolveToothEffectiveState,
  voidConditionOnTooth,
  getDominantToothStatus,
  getConditionDotColor,
  calculateDmftMetrics,
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
} from '../dental';

export interface DentalChartTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  chart?: PatientChart | null;
  focusToothNumber?: number;
  onOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onVoidCondition?: (toothNumber: number, recordId: string, reason?: string) => void | Promise<void>;
  onRemoveCondition?: (toothNumber: number, conditionIdOrStatus: string) => void;
  onRefreshChart?: () => void;
  testID?: string;
}

type DentitionMode = 'Adult' | 'Child';

const DENTITION_OPTIONS = [
  { value: 'Adult' as DentitionMode, label: 'Adult (11–48)' },
  { value: 'Child' as DentitionMode, label: 'Child (51–85)' },
];

export function getPlainEnglishToothName(toothNumber: number): string {
  return getToothDescription(toothNumber);
}

export function getStatusBadgeVariant(
  status?: ToothStatus | string
): 'success' | 'emergency' | 'info' | 'neutral' | 'warning' | 'purple' {
  switch (status) {
    case 'Healthy':
    case 'Sealant':
      return 'success';
    case 'Decayed':
    case 'ForExtraction':
      return 'emergency';
    case 'Fractured':
    case 'Impacted':
      return 'warning';
    case 'Filled':
    case 'Implant':
      return 'info';
    case 'Missing':
      return 'neutral';
    case 'Crowned':
    case 'RootCanal':
      return 'purple';
    default:
      return 'neutral';
  }
}

export function getToothStatusColor(status?: ToothStatus | string): {
  bg: string;
  border: string;
  text: string;
} {
  switch (status) {
    case 'Decayed':
      return {
        bg: theme.colors.emergencyBg,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
      };
    case 'Fractured':
      return {
        bg: theme.colors.urgentBg,
        border: theme.colors.urgentBorder,
        text: theme.colors.urgentText,
      };
    case 'Filled':
      return {
        bg: theme.colors.infoBg,
        border: theme.colors.infoBorder,
        text: theme.colors.infoText,
      };
    case 'Sealant':
      return {
        bg: theme.colors.routineBg,
        border: theme.colors.routineBorder,
        text: theme.colors.routineText,
      };
    case 'Implant':
      return {
        bg: theme.colors.primaryLight,
        border: theme.colors.primaryBorder,
        text: theme.colors.primaryDark,
      };
    case 'Impacted':
      return {
        bg: theme.colors.warningBg,
        border: theme.colors.warningBorder,
        text: theme.colors.warningText,
      };
    case 'Missing':
      return {
        bg: theme.colors.surfaceSubtle,
        border: theme.colors.borderDark,
        text: theme.colors.textMuted,
      };
    case 'Crowned':
    case 'RootCanal':
      return {
        bg: theme.colors.purpleBg,
        border: theme.colors.purpleBorder,
        text: theme.colors.purpleText,
      };
    case 'ForExtraction':
      return {
        bg: theme.colors.emergencySubtle,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
      };
    case 'Healthy':
    default:
      return {
        bg: theme.colors.surface,
        border: theme.colors.border,
        text: theme.colors.text,
      };
  }
}

function formatRecordedDate(dateStr?: string | null): string {
  if (!dateStr) return 'Just now';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default function DentalChartTab({
  patient,
  patientId,
  chart,
  focusToothNumber,
  onOrderProcedure,
  onVoidCondition,
  onRemoveCondition,
  onRefreshChart,
  testID = 'dental-chart-tab',
}: DentalChartTabProps) {
  const [dentitionMode, setDentitionMode] = useState<DentitionMode>(() => {
    if (focusToothNumber && focusToothNumber >= 51 && focusToothNumber <= 85) {
      return 'Child';
    }
    return 'Adult';
  });

  const [selectedToothNumber, setSelectedToothNumber] = useState<number | null>(
    focusToothNumber ?? null
  );
  const [localTeethOverride, setLocalTeethOverride] = useState<Record<number, DentalToothRecord[]> | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState<string>('');

  // Auto-switch dentition and select tooth if focusToothNumber changes
  useEffect(() => {
    if (focusToothNumber) {
      if (focusToothNumber >= 51 && focusToothNumber <= 85) {
        setDentitionMode('Child');
      } else {
        setDentitionMode('Adult');
      }
      setSelectedToothNumber(focusToothNumber);
    }
  }, [focusToothNumber]);

  const propMultiTeethMap = useMemo<Record<number, DentalToothRecord[]>>(() => {
    const teethList: DentalToothRecord[] =
      chart?.dentalTeeth || chart?.dentalChart?.teeth || [];
    const normalized = normalizeTeethToMultiRecord(teethList);
    for (const numStr of Object.keys(normalized)) {
      const num = Number(numStr);
      normalized[num] = resolveToothEffectiveState(normalized[num]).allRecords;
    }
    return normalized;
  }, [chart?.dentalTeeth, chart?.dentalChart?.teeth]);

  useEffect(() => {
    setLocalTeethOverride(null);
  }, [propMultiTeethMap]);

  // Aggregate tooth records from chart into multi-condition records
  const multiTeethMap = localTeethOverride ?? propMultiTeethMap;

  // Backward-compatible single-record map for primary record access
  const teethMap = useMemo<Record<number, DentalToothRecord>>(() => {
    const map: Record<number, DentalToothRecord> = {};
    for (const [numStr, recs] of Object.entries(multiTeethMap)) {
      const num = Number(numStr);
      const activeNonVoided = recs.filter((r) => !r.isVoided && r.isCurrent !== false);
      map[num] = activeNonVoided[activeNonVoided.length - 1] || recs[recs.length - 1] || {
        id: `rec-${num}`,
        toothNumber: num,
        status: 'Healthy',
        surface: '',
        notes: '',
        createdAt: new Date().toISOString(),
      };
    }
    return map;
  }, [multiTeethMap]);

  // Compute DMFT metrics counting distinct teeth
  const summary = useMemo(() => {
    return calculateDmftMetrics(multiTeethMap);
  }, [multiTeethMap]);

  // Selected tooth details
  const selectedToothRecords = useMemo<DentalToothRecord[]>(() => {
    if (!selectedToothNumber) return [];
    return multiTeethMap[selectedToothNumber] || [];
  }, [multiTeethMap, selectedToothNumber]);

  const selectedToothRecord = useMemo<DentalToothRecord | null>(() => {
    if (!selectedToothNumber) return null;
    const currentNonHealthy = selectedToothRecords.filter(
      (r) => !r.isVoided && r.status !== 'Healthy' && r.isCurrent !== false
    );
    if (currentNonHealthy.length > 0) return currentNonHealthy[currentNonHealthy.length - 1];
    const currentAny = selectedToothRecords.filter((r) => !r.isVoided && r.isCurrent !== false);
    if (currentAny.length > 0) return currentAny[currentAny.length - 1];
    return {
      id: `rec-${selectedToothNumber}`,
      toothNumber: selectedToothNumber,
      status: 'Healthy',
      surface: '',
      notes: '',
      createdAt: new Date().toISOString(),
    };
  }, [selectedToothRecords, selectedToothNumber]);

  const handleVoidCondition = async (toothNumber: number, recordIdOrStatus: string) => {
    const currentRecs = multiTeethMap[toothNumber] || [];
    const reason = voidReasonInput.trim() || 'Voided in patient dental chart';
    const nextRecs = voidConditionOnTooth(currentRecs, recordIdOrStatus, {
      voidReason: reason,
    });
    setLocalTeethOverride({
      ...multiTeethMap,
      [toothNumber]: nextRecs,
    });
    setVoidReasonInput('');

    if (onVoidCondition) {
      await onVoidCondition(toothNumber, recordIdOrStatus, reason);
    } else if (onRemoveCondition) {
      onRemoveCondition(toothNumber, recordIdOrStatus);
    } else {
      const resolvedPatientId = patientId || patient?.id || chart?.patientId;
      if (resolvedPatientId) {
        await clinicService.voidDentalToothRecord(resolvedPatientId, recordIdOrStatus, reason);
        onRefreshChart?.();
      }
    }
  };

  // Procedures history for the selected tooth
  const toothProcedures = useMemo<ClinicalProcedureRecord[]>(() => {
    if (!selectedToothNumber) return [];
    const rawProcs: ClinicalProcedureRecord[] = [
      ...(chart?.dentalProcedures || []),
      ...(chart?.proceduresHistory || []),
    ];
    const seen = new Set<string>();
    const unique: ClinicalProcedureRecord[] = [];
    for (const p of rawProcs) {
      if (p.toothNumber !== selectedToothNumber) continue;
      const key = p.id || `${p.procedureName}-${p.scheduledAt || ''}-${p.performedAt || ''}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(p);
      }
    }
    return unique;
  }, [chart?.proceduresHistory, chart?.dentalProcedures, selectedToothNumber]);

  const upperRight = dentitionMode === 'Adult' ? ADULT_UPPER_RIGHT : CHILD_UPPER_RIGHT;
  const upperLeft = dentitionMode === 'Adult' ? ADULT_UPPER_LEFT : CHILD_UPPER_LEFT;
  const lowerRight = dentitionMode === 'Adult' ? ADULT_LOWER_RIGHT : CHILD_LOWER_RIGHT;
  const lowerLeft = dentitionMode === 'Adult' ? ADULT_LOWER_LEFT : CHILD_LOWER_LEFT;

  const renderToothCell = (toothNum: number) => {
    const records = multiTeethMap[toothNum] || [];
    const activeRecords = records.filter((r) => !r.isVoided && r.isCurrent !== false);
    const status = getDominantToothStatus(activeRecords);
    const isSelected = selectedToothNumber === toothNum;
    const colors = getToothStatusColor(status);

    const nonHealthyStatuses = Array.from(
      new Set(activeRecords.filter((r) => r.status !== 'Healthy').map((r) => r.status))
    );

    return (
      <Pressable
        key={toothNum}
        testID={`tooth-cell-${toothNum}`}
        accessibilityRole="button"
        accessibilityLabel={`Tooth ${toothNum}, status ${status}`}
        onPress={() => setSelectedToothNumber(toothNum)}
        style={[
          styles.toothCell,
          {
            backgroundColor: status === 'Missing' ? theme.colors.surfaceSubtle : theme.colors.surface,
            borderColor: isSelected ? theme.colors.primaryDark : colors.border,
          },
          isSelected && styles.toothCellSelected,
        ]}
      >
        <ThemedText
          variant="captionBold"
          color={isSelected ? theme.colors.primaryDark : colors.text}
        >
          {toothNum}
        </ThemedText>

        {/* 5-Surface Trapezoid Diagram on Tooth Cell */}
        <ToothSurfaceDiagram
          toothNumber={toothNum}
          conditions={activeRecords}
          size={28}
          showLabels={false}
          testID={`cell-diagram-${toothNum}`}
        />

        {/* Multi-Condition Colored Dots */}
        {nonHealthyStatuses.length > 0 ? (
          <View style={styles.multiConditionDots} testID={`multi-dots-${toothNum}`}>
            {nonHealthyStatuses.map((st) => (
              <View
                key={st}
                style={[styles.conditionDot, { backgroundColor: getConditionDotColor(st) }]}
                testID={`dot-${st.toLowerCase()}-${toothNum}`}
              />
            ))}
          </View>
        ) : null}
      </Pressable>
    );
  };

  const activeConditions = selectedToothRecords.filter(
    (r) => !r.isVoided && r.status !== 'Healthy' && r.isCurrent !== false
  );
  const historicalConditions = selectedToothRecords.filter(
    (r) => !r.isVoided && r.status !== 'Healthy' && r.isCurrent === false
  );
  const voidedConditions = selectedToothRecords.filter(
    (r) => r.isVoided === true && r.status !== 'Healthy'
  );
  const canVoidRecords = Boolean(
    onVoidCondition || onRemoveCondition || patientId || patient?.id || chart?.patientId
  );

  return (
    <ScrollView
      testID={testID}
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      {/* ========================================================================= */}
      {/* 1. SUMMARY METRIC CARDS (DMFT / DMFS CLINICAL EPIDEMIOLOGY)              */}
      {/* ========================================================================= */}
      <View style={styles.metricsRow} testID="dmft-metric-cards">
        <View style={styles.metricCard}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            TOTAL CHARTED
          </ThemedText>
          <ThemedText variant="h1" color={theme.colors.primary}>
            {summary.totalCharted}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Active teeth recorded
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText variant="captionBold" color={theme.colors.emergency}>
            DECAYED (D)
          </ThemedText>
          <ThemedText variant="h1" color={theme.colors.emergency}>
            {summary.decayedCount}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Carious lesions
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            MISSING (M)
          </ThemedText>
          <ThemedText variant="h1" color={theme.colors.textSecondary}>
            {summary.missingCount}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Extracted or absent
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText variant="captionBold" color={theme.colors.info}>
            FILLED (F)
          </ThemedText>
          <ThemedText variant="h1" color={theme.colors.info}>
            {summary.filledCount}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            Restorations
          </ThemedText>
        </View>

        <View style={styles.metricCard}>
          <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
            DMFT INDEX
          </ThemedText>
          <ThemedText variant="h1" color={theme.colors.primaryDark}>
            {summary.dmftScore}
          </ThemedText>
          <ThemedText variant="caption" color={theme.colors.textMuted}>
            D + M + F total
          </ThemedText>
        </View>
      </View>

      {/* ========================================================================= */}
      {/* 2. ODONTOGRAM VISUALIZER CARD                                             */}
      {/* ========================================================================= */}
      <Card style={styles.odontogramCard} testID="odontogram-visualizer-card">
        <CardHeader
          title="Odontogram Visualizer"
          subtitle="Interactive FDI two-digit notation chart"
          rightAction={
            <View style={styles.dentitionSwitcher} testID="dentition-switcher">
              <SegmentedControl
                options={DENTITION_OPTIONS}
                value={dentitionMode}
                onChange={setDentitionMode}
              />
            </View>
          }
        />

        {/* Odontogram Grid */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gridScrollContent}
        >
          <View style={styles.quadrantGrid} testID="odontogram-grid">
            {/* Maxillary Arch (Upper) */}
            <View style={styles.archContainer}>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.archTitle}>
                MAXILLARY ARCH (UPPER)
              </ThemedText>
              <View style={styles.archRow}>
                {/* Upper Right Quadrant */}
                <View style={styles.quadrantCol}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.quadrantLabel}>
                    {dentitionMode === 'Adult' ? 'Q1 • Upper Right' : 'Q5 • Upper Right'}
                  </ThemedText>
                  <View style={styles.teethRow}>
                    {upperRight.map((t) => renderToothCell(t))}
                  </View>
                </View>

                {/* Arch Midline Divider */}
                <View style={styles.midline} />

                {/* Upper Left Quadrant */}
                <View style={styles.quadrantCol}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.quadrantLabel}>
                    {dentitionMode === 'Adult' ? 'Q2 • Upper Left' : 'Q6 • Upper Left'}
                  </ThemedText>
                  <View style={styles.teethRow}>
                    {upperLeft.map((t) => renderToothCell(t))}
                  </View>
                </View>
              </View>
            </View>

            {/* Horizontal Occlusal Plane Separator */}
            <View style={styles.occlusalPlane} />

            {/* Mandibular Arch (Lower) */}
            <View style={styles.archContainer}>
              <View style={styles.archRow}>
                {/* Lower Right Quadrant */}
                <View style={styles.quadrantCol}>
                  <View style={styles.teethRow}>
                    {lowerRight.map((t) => renderToothCell(t))}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.quadrantLabel}>
                    {dentitionMode === 'Adult' ? 'Q4 • Lower Right' : 'Q8 • Lower Right'}
                  </ThemedText>
                </View>

                {/* Arch Midline Divider */}
                <View style={styles.midline} />

                {/* Lower Left Quadrant */}
                <View style={styles.quadrantCol}>
                  <View style={styles.teethRow}>
                    {lowerLeft.map((t) => renderToothCell(t))}
                  </View>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.quadrantLabel}>
                    {dentitionMode === 'Adult' ? 'Q3 • Lower Left' : 'Q7 • Lower Left'}
                  </ThemedText>
                </View>
              </View>
              <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.archTitle}>
                MANDIBULAR ARCH (LOWER)
              </ThemedText>
            </View>
          </View>
        </ScrollView>

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>Healthy</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.emergencyBg, borderColor: theme.colors.emergencyBorder }]} />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>Decayed</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.infoBg, borderColor: theme.colors.infoBorder }]} />
            <ThemedText variant="caption" color={theme.colors.infoText}>Filled</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.borderDark }]} />
            <ThemedText variant="caption" color={theme.colors.textMuted}>Missing</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.purpleBg, borderColor: theme.colors.purpleBorder }]} />
            <ThemedText variant="caption" color={theme.colors.purpleText}>Crowned</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.emergencySubtle, borderColor: theme.colors.emergency }]} />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>For Extraction</ThemedText>
          </View>
        </View>
      </Card>

      {/* ========================================================================= */}
      {/* 3. TOOTH INSPECTOR & PROCEDURE HISTORY PANE                               */}
      {/* ========================================================================= */}
      {selectedToothNumber ? (
        <Card style={styles.inspectorCard} testID="tooth-inspector-pane">
          <CardHeader
            title={`Tooth #${selectedToothNumber}`}
            subtitle={getPlainEnglishToothName(selectedToothNumber)}
            rightAction={
              <View style={styles.inspectorHeaderActions}>
                <Badge
                  label={getToothStatusLabel(selectedToothRecord?.status || 'Healthy')}
                  variant={getStatusBadgeVariant(selectedToothRecord?.status)}
                />
                {onOrderProcedure ? (
                  <Button
                    title="Order Procedure"
                    variant="primary"
                    size="sm"
                    icon="plus"
                    onPress={() =>
                      onOrderProcedure(
                        selectedToothNumber,
                        selectedToothRecord?.surface || undefined
                      )
                    }
                  />
                ) : null}
              </View>
            }
          />

          <View style={styles.inspectorContent}>
            {/* Visual 5-Surface Diagram */}
            <View style={styles.inspectorDiagramWrapper}>
              <ToothSurfaceDiagram
                toothNumber={selectedToothNumber}
                conditions={activeConditions}
                size={80}
                showLabels={true}
                testID="tab-inspector-surface-diagram"
              />
            </View>

            {/* Recorded Conditions on Tooth #XX List (Current Active Status) */}
            <View style={styles.conditionsSection} testID="tab-recorded-conditions-list">
              <View style={styles.conditionsSectionHeader}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  RECORDED CONDITIONS ON TOOTH #{selectedToothNumber} ({activeConditions.length})
                </ThemedText>
                {canVoidRecords && (activeConditions.length > 0 || historicalConditions.length > 0) ? (
                  <TextInput
                    value={voidReasonInput}
                    onChangeText={setVoidReasonInput}
                    placeholder="Optional void reason..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.voidReasonInput}
                    testID="tab-void-reason-input"
                  />
                ) : null}
              </View>
              {activeConditions.length === 0 ? (
                <View style={styles.healthyBox}>
                  <ThemedText variant="small" color={theme.colors.successText}>
                    Healthy — No abnormal conditions or restorations recorded.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.conditionsList}>
                  {[...activeConditions].reverse().map((cond, idx) => {
                    const origSurf = cond.surface ? sortToothSurfaces(cond.surface) : '';
                    const actSurf =
                      cond.activeSurface !== undefined && cond.activeSurface !== null
                        ? sortToothSurfaces(cond.activeSurface)
                        : origSurf;
                    const hasPartialDiff = Boolean(origSurf && actSurf && origSurf !== actSurf);
                    const recKey = cond.id || cond.status.toLowerCase();

                    return (
                      <View
                        key={cond.id || `${cond.status}-${idx}`}
                        style={styles.conditionCard}
                        testID={`tab-condition-${recKey}`}
                      >
                        <View style={styles.conditionHeader}>
                          <View style={styles.conditionBadgeRow}>
                            <Badge
                              label={getToothStatusLabel(cond.status)}
                              variant={getStatusBadgeVariant(cond.status)}
                              size="sm"
                            />
                            <Badge
                              label="Current"
                              variant="success"
                              size="sm"
                            />
                            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                              {actSurf ? `Surfaces: ${actSurf}` : 'Full Tooth / Intact'}
                            </ThemedText>
                            {hasPartialDiff ? (
                              <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                                {`• Originally: ${origSurf}`}
                              </ThemedText>
                            ) : null}
                          </View>
                          {canVoidRecords ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Void ${cond.status} on Tooth #${selectedToothNumber}`}
                              onPress={() => handleVoidCondition(selectedToothNumber, cond.id || cond.status)}
                              testID={`tab-void-condition-${recKey}`}
                              style={styles.removeConditionBtn}
                            >
                              <Icon name="closeCircle" size={14} color={theme.colors.warningText} />
                              <ThemedText variant="captionBold" color={theme.colors.warningText}>
                                Void
                              </ThemedText>
                            </Pressable>
                          ) : null}
                        </View>

                        {cond.notes ? (
                          <ThemedText variant="small" color={theme.colors.text} style={styles.conditionNotes}>
                            {cond.notes}
                          </ThemedText>
                        ) : null}

                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          Recorded: {formatRecordedDate(cond.createdAt)} • By: {cond.recordedBy || 'Attending Clinician'}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Historical Conditions (Previous Encounters) — Left Screen Longitudinal Stack */}
            <View style={styles.conditionsSection} testID="tab-historical-conditions-list">
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                HISTORICAL CONDITIONS (PREVIOUS ENCOUNTERS) ({historicalConditions.length})
              </ThemedText>
              {historicalConditions.length === 0 ? (
                <View style={styles.emptyTimelineBox}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    No previous encounter history for this tooth.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.conditionsList}>
                  {[...historicalConditions].reverse().map((cond, idx) => {
                    const origSurf = cond.surface ? sortToothSurfaces(cond.surface) : '';
                    const recKey = cond.id || cond.status.toLowerCase();
                    return (
                      <View
                        key={cond.id || `hist-${cond.status}-${idx}`}
                        style={[styles.conditionCard, styles.conditionCardHistorical]}
                        testID={`tab-historical-condition-${recKey}`}
                      >
                        <View style={styles.conditionHeader}>
                          <View style={styles.conditionBadgeRow}>
                            <Badge
                              label={getToothStatusLabel(cond.status)}
                              variant={getStatusBadgeVariant(cond.status)}
                              size="sm"
                            />
                            <Badge
                              label="Historical"
                              variant="neutral"
                              size="sm"
                            />
                            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                              {origSurf ? `Surfaces: ${origSurf}` : 'Full Tooth / Intact'}
                            </ThemedText>
                          </View>
                          {canVoidRecords ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Void historical ${cond.status} on Tooth #${selectedToothNumber}`}
                              onPress={() => handleVoidCondition(selectedToothNumber, cond.id || cond.status)}
                              testID={`tab-void-condition-${recKey}`}
                              style={styles.removeConditionBtn}
                            >
                              <Icon name="closeCircle" size={14} color={theme.colors.warningText} />
                              <ThemedText variant="captionBold" color={theme.colors.warningText}>
                                Void
                              </ThemedText>
                            </Pressable>
                          ) : null}
                        </View>

                        {cond.notes ? (
                          <ThemedText variant="small" color={theme.colors.text} style={styles.conditionNotes}>
                            {cond.notes}
                          </ThemedText>
                        ) : null}

                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          Recorded: {formatRecordedDate(cond.createdAt)} • By: {cond.recordedBy || 'Attending Clinician'}
                          {cond.supersededAt ? ` • Superseded: ${formatRecordedDate(cond.supersededAt)}` : ''}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Voided Conditions Audit Trail */}
            {voidedConditions.length > 0 ? (
              <View style={styles.conditionsSection} testID="tab-voided-conditions-list">
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  VOIDED ENTRIES (AUDIT TRAIL) ({voidedConditions.length})
                </ThemedText>
                <View style={styles.conditionsList}>
                  {[...voidedConditions].reverse().map((cond, idx) => {
                    const origSurf = cond.surface ? sortToothSurfaces(cond.surface) : '';
                    const recKey = cond.id || cond.status.toLowerCase();
                    return (
                      <View
                        key={cond.id || `void-${cond.status}-${idx}`}
                        style={[styles.conditionCard, styles.conditionCardVoided]}
                        testID={`tab-voided-condition-${recKey}`}
                      >
                        <View style={styles.conditionHeader}>
                          <View style={styles.conditionBadgeRow}>
                            <Badge
                              label={getToothStatusLabel(cond.status)}
                              variant="neutral"
                              size="sm"
                            />
                            <Badge
                              label="Voided"
                              variant="emergency"
                              size="sm"
                            />
                            <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                              {origSurf ? `Surfaces: ${origSurf}` : 'Full Tooth / Intact'}
                            </ThemedText>
                          </View>
                        </View>

                        {cond.notes ? (
                          <ThemedText variant="small" color={theme.colors.textMuted} style={styles.conditionNotes}>
                            {cond.notes}
                          </ThemedText>
                        ) : null}

                        <ThemedText variant="caption" color={theme.colors.textMuted}>
                          Recorded: {formatRecordedDate(cond.createdAt)} • Voided: {formatRecordedDate(cond.voidedAt)} • By: {cond.voidedBy || 'Attending Clinician'}
                          {cond.voidReason ? ` • Reason: ${cond.voidReason}` : ''}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Tooth Findings & Surfaces Details (Preserved for tests) */}
            <View style={styles.detailRow}>
              <View style={styles.detailCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  AFFECTED SURFACES
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.text}>
                  {selectedToothRecord?.surface
                    ? sortToothSurfaces(selectedToothRecord.surface)
                    : 'None / Intact'}
                </ThemedText>
              </View>

              <View style={styles.detailCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  CLINICAL NOTES
                </ThemedText>
                <ThemedText variant="body" color={theme.colors.text}>
                  {selectedToothRecord?.notes || 'No remarks recorded.'}
                </ThemedText>
              </View>
            </View>

            {/* Tooth Procedure History Timeline */}
            <View style={styles.procedureTimelineSection}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.timelineTitle}>
                PROCEDURE HISTORY FOR TOOTH #{selectedToothNumber} ({toothProcedures.length})
              </ThemedText>

              {toothProcedures.length === 0 ? (
                <View style={styles.emptyTimelineBox}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    No clinical procedures on record for this tooth.
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.timelineList}>
                  {toothProcedures.map((proc, index) => (
                    <View key={proc.id || index} style={styles.timelineItem}>
                      <View style={styles.timelineLeftBar}>
                        <View style={styles.timelineDot} />
                        {index < toothProcedures.length - 1 && <View style={styles.timelineLine} />}
                      </View>
                      <View style={styles.timelineBody}>
                        <View style={styles.timelineHeader}>
                          <ThemedText variant="bodyBold" color={theme.colors.text}>
                            {proc.procedureName}
                          </ThemedText>
                          <Badge
                            label={proc.status || 'Completed'}
                            variant={proc.status === 'Completed' ? 'success' : 'neutral'}
                            size="sm"
                          />
                        </View>
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          {proc.performedAt || proc.scheduledAt
                            ? new Date(proc.performedAt || proc.scheduledAt).toLocaleDateString([], {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })
                            : 'Date recorded'}
                          {proc.orderedByDoctorName ? ` • Provider: ${proc.orderedByDoctorName}` : ''}
                        </ThemedText>
                        {proc.clinicalNotes ? (
                          <ThemedText variant="caption" color={theme.colors.text} style={styles.procNotes}>
                            {proc.clinicalNotes}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </Card>
      ) : (
        <Card style={styles.inspectorCard} testID="tooth-inspector-prompt">
          <EmptyState
            icon="medical"
            title="Select a Tooth"
            description="Tap any tooth on the odontogram above to view its clinical findings, surfaces, and historical procedures."
          />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  metricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  metricCard: {
    flex: 1,
    minWidth: 160,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  odontogramCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  dentitionSwitcher: {
    width: 220,
  },
  gridScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quadrantGrid: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
    minWidth: '100%',
  },
  archContainer: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  archTitle: {
    letterSpacing: 0.8,
  },
  archRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.md,
  },
  quadrantCol: {
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  quadrantLabel: {
    letterSpacing: 0.5,
  },
  teethRow: {
    flexDirection: 'row',
    gap: 4,
  },
  midline: {
    width: 2,
    height: 70,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
  },
  occlusalPlane: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.xs,
  },
  toothCell: {
    width: 44,
    minHeight: 64,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    gap: 2,
  },
  toothCellSelected: {
    borderWidth: 2,
  },
  multiConditionDots: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  conditionDot: {
    width: 5,
    height: 5,
    borderRadius: theme.radii.full,
  },
  surfaceLabel: {
    letterSpacing: 0.5,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.xs,
    borderWidth: 1,
  },
  inspectorCard: {
    padding: theme.spacing.lg,
  },
  inspectorHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  inspectorContent: {
    gap: theme.spacing.md,
  },
  inspectorDiagramWrapper: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  conditionsSection: {
    gap: theme.spacing.xs,
  },
  conditionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  voidReasonInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    ...theme.typography.caption,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minWidth: 180,
  },
  healthyBox: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
  },
  conditionsList: {
    gap: theme.spacing.xs,
  },
  conditionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  conditionCardHistorical: {
    opacity: 0.72,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  conditionCardVoided: {
    opacity: 0.56,
    backgroundColor: theme.colors.surfaceSubtle,
    borderStyle: 'dashed',
  },
  conditionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  conditionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  removeConditionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.xs,
  },
  conditionNotes: {
    fontStyle: 'italic',
  },
  detailRow: {
    flexDirection: 'row',
    gap: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  detailCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  procedureTimelineSection: {
    gap: theme.spacing.sm,
  },
  timelineTitle: {
    letterSpacing: 0.5,
  },
  emptyTimelineBox: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  timelineList: {
    gap: theme.spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  timelineLeftBar: {
    alignItems: 'center',
    width: 16,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primary,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 2,
  },
  timelineBody: {
    flex: 1,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: 2,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  procNotes: {
    marginTop: 2,
  },
});
