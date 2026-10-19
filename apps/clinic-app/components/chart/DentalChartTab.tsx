import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
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
import type {
  ClinicPatient,
  PatientChart,
  DentalToothRecord,
  ClinicalProcedureRecord,
} from '../../services/clinicService';
import {
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
  ToothStatus,
  sortToothSurfaces,
} from '../consultation/InlineDentalChartCard';

export interface DentalChartTabProps {
  patient?: ClinicPatient | null;
  patientId?: string;
  chart?: PatientChart | null;
  focusToothNumber?: number;
  onOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onRefreshChart?: () => void;
  testID?: string;
}

type DentitionMode = 'Adult' | 'Child';

const DENTITION_OPTIONS = [
  { value: 'Adult' as DentitionMode, label: 'Adult (11–48)' },
  { value: 'Child' as DentitionMode, label: 'Child (51–85)' },
];

export function getPlainEnglishToothName(toothNumber: number): string {
  const toothNames: Record<number, string> = {
    // Adult Upper Right (Quadrant 1)
    18: 'Upper Right Third Molar (Wisdom)',
    17: 'Upper Right Second Molar',
    16: 'Upper Right First Molar',
    15: 'Upper Right Second Premolar',
    14: 'Upper Right First Premolar',
    13: 'Upper Right Canine (Cuspid)',
    12: 'Upper Right Lateral Incisor',
    11: 'Upper Right Central Incisor',
    // Adult Upper Left (Quadrant 2)
    21: 'Upper Left Central Incisor',
    22: 'Upper Left Lateral Incisor',
    23: 'Upper Left Canine (Cuspid)',
    24: 'Upper Left First Premolar',
    25: 'Upper Left Second Premolar',
    26: 'Upper Left First Molar',
    27: 'Upper Left Second Molar',
    28: 'Upper Left Third Molar (Wisdom)',
    // Adult Lower Left (Quadrant 3)
    31: 'Lower Left Central Incisor',
    32: 'Lower Left Lateral Incisor',
    33: 'Lower Left Canine (Cuspid)',
    34: 'Lower Left First Premolar',
    35: 'Lower Left Second Premolar',
    36: 'Lower Left First Molar',
    37: 'Lower Left Second Molar',
    38: 'Lower Left Third Molar (Wisdom)',
    // Adult Lower Right (Quadrant 4)
    41: 'Lower Right Central Incisor',
    42: 'Lower Right Lateral Incisor',
    43: 'Lower Right Canine (Cuspid)',
    44: 'Lower Right First Premolar',
    45: 'Lower Right Second Premolar',
    46: 'Lower Right First Molar',
    47: 'Lower Right Second Molar',
    48: 'Lower Right Third Molar (Wisdom)',
    // Deciduous Upper Right (Quadrant 5)
    55: 'Upper Right Primary Second Molar',
    54: 'Upper Right Primary First Molar',
    53: 'Upper Right Primary Canine',
    52: 'Upper Right Primary Lateral Incisor',
    51: 'Upper Right Primary Central Incisor',
    // Deciduous Upper Left (Quadrant 6)
    61: 'Upper Left Primary Central Incisor',
    62: 'Upper Left Primary Lateral Incisor',
    63: 'Upper Left Primary Canine',
    64: 'Upper Left Primary First Molar',
    65: 'Upper Left Primary Second Molar',
    // Deciduous Lower Left (Quadrant 7)
    71: 'Lower Left Primary Central Incisor',
    72: 'Lower Left Primary Lateral Incisor',
    73: 'Lower Left Primary Canine',
    74: 'Lower Left Primary First Molar',
    75: 'Lower Left Primary Second Molar',
    // Deciduous Lower Right (Quadrant 8)
    81: 'Lower Right Primary Central Incisor',
    82: 'Lower Right Primary Lateral Incisor',
    83: 'Lower Right Primary Canine',
    84: 'Lower Right Primary First Molar',
    85: 'Lower Right Primary Second Molar',
  };
  return toothNames[toothNumber] || `Tooth #${toothNumber}`;
}

export function getStatusBadgeVariant(
  status?: ToothStatus | string
): 'success' | 'emergency' | 'info' | 'neutral' | 'warning' {
  switch (status) {
    case 'Healthy':
      return 'success';
    case 'Decay':
      return 'emergency';
    case 'Filled':
      return 'info';
    case 'Missing':
      return 'neutral';
    case 'Crown':
      return 'warning';
    case 'Extraction':
      return 'emergency';
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
    case 'Decay':
      return {
        bg: theme.colors.emergencyBg,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
      };
    case 'Filled':
      return {
        bg: theme.colors.infoBg,
        border: theme.colors.infoBorder,
        text: theme.colors.infoText,
      };
    case 'Missing':
      return {
        bg: theme.colors.surfaceSubtle,
        border: theme.colors.borderDark,
        text: theme.colors.textMuted,
      };
    case 'Crown':
      return {
        bg: theme.colors.warningBg,
        border: theme.colors.warningBorder,
        text: theme.colors.warningText,
      };
    case 'Extraction':
      return {
        bg: theme.colors.emergencySubtle,
        border: theme.colors.emergency,
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

export default function DentalChartTab({
  patient,
  patientId,
  chart,
  focusToothNumber,
  onOrderProcedure,
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

  // Aggregate tooth records from chart
  const teethMap = useMemo<Record<number, DentalToothRecord>>(() => {
    const map: Record<number, DentalToothRecord> = {};
    const teethList: DentalToothRecord[] =
      chart?.dentalTeeth || chart?.dentalChart?.teeth || [];
    for (const t of teethList) {
      map[t.toothNumber] = t;
    }
    return map;
  }, [chart?.dentalTeeth, chart?.dentalChart?.teeth]);

  // Compute DMFT metrics
  const summary = useMemo(() => {
    let decayedCount = 0;
    let missingCount = 0;
    let filledCount = 0;
    let crownCount = 0;
    let extractionCount = 0;
    let healthyCount = 0;

    for (const record of Object.values(teethMap)) {
      switch (record.status) {
        case 'Decay':
          decayedCount++;
          break;
        case 'Missing':
          missingCount++;
          break;
        case 'Filled':
          filledCount++;
          break;
        case 'Crown':
          crownCount++;
          break;
        case 'Extraction':
          extractionCount++;
          break;
        case 'Healthy':
          healthyCount++;
          break;
      }
    }

    const totalCharted = Object.keys(teethMap).length;
    const dmftScore = decayedCount + missingCount + filledCount;

    return {
      totalCharted,
      decayedCount,
      missingCount,
      filledCount,
      crownCount,
      extractionCount,
      healthyCount,
      dmftScore,
    };
  }, [teethMap]);

  // Selected tooth details
  const selectedToothRecord = useMemo<DentalToothRecord | null>(() => {
    if (!selectedToothNumber) return null;
    return (
      teethMap[selectedToothNumber] || {
        toothNumber: selectedToothNumber,
        status: 'Healthy',
        surface: '',
        notes: '',
      }
    );
  }, [teethMap, selectedToothNumber]);

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
    const record = teethMap[toothNum];
    const status = record?.status || 'Healthy';
    const isSelected = selectedToothNumber === toothNum;
    const colors = getToothStatusColor(status);

    return (
      <Pressable
        key={toothNum}
        testID={`tooth-cell-${toothNum}`}
        accessibilityRole="button"
        accessibilityLabel={`Tooth ${toothNum}, status ${status}`}
        onPress={() => setSelectedToothNumber(toothNum)}
        style={[
          styles.toothCell,
          { backgroundColor: colors.bg, borderColor: isSelected ? theme.colors.primaryDark : colors.border },
          isSelected && styles.toothCellSelected,
        ]}
      >
        <ThemedText
          variant="captionBold"
          color={isSelected ? theme.colors.primaryDark : colors.text}
        >
          {toothNum}
        </ThemedText>
        {record?.surface ? (
          <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.surfaceLabel}>
            {sortToothSurfaces(record.surface)}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

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

        {/* Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>Healthy</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.emergencyBg, borderColor: theme.colors.emergencyBorder }]} />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>Decay</ThemedText>
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
            <View style={[styles.legendDot, { backgroundColor: theme.colors.warningBg, borderColor: theme.colors.warningBorder }]} />
            <ThemedText variant="caption" color={theme.colors.warningText}>Crown</ThemedText>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.colors.emergencySubtle, borderColor: theme.colors.emergency }]} />
            <ThemedText variant="caption" color={theme.colors.emergencyText}>Extraction</ThemedText>
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
                  label={selectedToothRecord?.status || 'Healthy'}
                  variant={getStatusBadgeVariant(selectedToothRecord?.status)}
                />
                {onOrderProcedure ? (
                  <Button
                    title="+ Order Procedure"
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
            {/* Tooth Findings & Surfaces */}
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
  quadrantGrid: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.md,
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
    width: '100%',
  },
  quadrantCol: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  quadrantLabel: {
    letterSpacing: 0.2,
  },
  teethRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  midline: {
    width: 2,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.borderDark,
    marginHorizontal: theme.spacing.sm,
  },
  occlusalPlane: {
    height: 2,
    backgroundColor: theme.colors.borderDark,
    marginVertical: theme.spacing.xs,
  },
  toothCell: {
    width: 38,
    height: 48,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xs,
  },
  toothCellSelected: {
    borderWidth: 2,
    backgroundColor: theme.colors.primarySubtle,
  },
  surfaceLabel: {
    letterSpacing: 0.2,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    justifyContent: 'center',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: theme.radii.full,
    borderWidth: 1,
  },
  inspectorCard: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  inspectorHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  inspectorContent: {
    gap: theme.spacing.lg,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailCol: {
    flex: 1,
    minWidth: 200,
    gap: theme.spacing.xs,
  },
  procedureTimelineSection: {
    gap: theme.spacing.sm,
  },
  timelineTitle: {
    letterSpacing: 0.5,
  },
  emptyTimelineBox: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
  },
  timelineList: {
    gap: theme.spacing.sm,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: theme.spacing.md,
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
    marginTop: 4,
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
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.xs,
  },
  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  procNotes: {
    fontStyle: 'italic',
  },
});
