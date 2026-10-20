import React, { useState, useMemo, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import {
  Card,
  CardHeader,
  CardContent,
  ThemedText,
  Badge,
  Button,
  Icon,
  Input,
  SegmentedControl,
  SkeletonList,
  ErrorState,
} from '../ui';
import {
  ToothSurfaceDiagram,
  DentalToothRecord,
  ToothStatus,
  ToothSurfaceCode,
  CANONICAL_SURFACES,
  TOOTH_STATUS_OPTIONS,
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
  sortToothSurfaces,
  getToothDescription,
  normalizeTeethToMultiRecord,
  getDominantToothStatus,
  getConditionDotColor,
} from '../dental';

export type { ToothStatus, ToothSurfaceCode, DentalToothRecord };
export {
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
  CANONICAL_SURFACES,
  TOOTH_STATUS_OPTIONS,
  sortToothSurfaces,
  getToothDescription,
};

export interface DentalToothState {
  toothNumber: number;
  status: ToothStatus;
  surface?: string;
  notes?: string;
}

export interface InlineDentalChartCardProps {
  teeth?: Record<number, any> | any[];
  chart?: Record<number, any> | any[];
  onChangeTooth?: (tooth: DentalToothState | DentalToothRecord) => void;
  onChange?: (chart: any) => void;
  onOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onQuickOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onRemoveCondition?: (toothNumber: number, conditionIdOrStatus: string) => void;
  onAddCondition?: (record: Omit<DentalToothRecord, 'id' | 'createdAt'>) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  initialToothNumber?: number;
  testID?: string;
}

type DentitionMode = 'Adult' | 'Child';

const DENTITION_OPTIONS: Array<{ value: DentitionMode; label: string }> = [
  { value: 'Adult', label: 'Adult (11–48)' },
  { value: 'Child', label: 'Child (51–85)' },
];

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

export function InlineDentalChartCard({
  teeth,
  chart,
  onChangeTooth,
  onChange,
  onOrderProcedure,
  onQuickOrderProcedure,
  onRemoveCondition,
  onAddCondition,
  disabled = false,
  loading = false,
  error = null,
  onRetry,
  initialToothNumber,
  testID = 'inline-dental-chart-card',
}: InlineDentalChartCardProps) {
  const effectiveTeeth = chart || teeth;
  const effectiveOrderProcedure = onQuickOrderProcedure || onOrderProcedure;

  const [dentitionMode, setDentitionMode] = useState<DentitionMode>(() => {
    if (initialToothNumber && initialToothNumber >= 51 && initialToothNumber <= 85) {
      return 'Child';
    }
    return 'Adult';
  });

  const [selectedToothNumber, setSelectedToothNumber] = useState<number | null>(
    initialToothNumber ?? null
  );

  // Normalize all input teeth into multi-condition records: Record<number, DentalToothRecord[]>
  const multiTeethMap = useMemo<Record<number, DentalToothRecord[]>>(() => {
    return normalizeTeethToMultiRecord(effectiveTeeth as any);
  }, [effectiveTeeth]);

  // Backward-compatible single-state mapping for legacy consumers
  const normalizedTeeth = useMemo<Record<number, DentalToothState>>(() => {
    const map: Record<number, DentalToothState> = {};
    for (const [numStr, recs] of Object.entries(multiTeethMap)) {
      const num = Number(numStr);
      const dominant = getDominantToothStatus(recs);
      const surfaces = sortToothSurfaces(recs.map((r) => r.surface || '').join(''));
      const notes = recs.map((r) => r.notes).filter(Boolean).join('; ');
      map[num] = {
        toothNumber: num,
        status: dominant,
        surface: surfaces,
        notes,
      };
    }
    return map;
  }, [multiTeethMap]);

  const selectedToothRecords = useMemo<DentalToothRecord[]>(() => {
    if (!selectedToothNumber) return [];
    return multiTeethMap[selectedToothNumber] || [];
  }, [multiTeethMap, selectedToothNumber]);

  const selectedToothState = useMemo<DentalToothState | null>(() => {
    if (!selectedToothNumber) return null;
    return (
      normalizedTeeth[selectedToothNumber] || {
        toothNumber: selectedToothNumber,
        status: 'Healthy',
        surface: '',
        notes: '',
      }
    );
  }, [normalizedTeeth, selectedToothNumber]);

  // Staging form state for adding/updating conditions
  const [stagedStatusState, setStagedStatusState] = useState<ToothStatus | null>(null);
  const [stagedSurfacesState, setStagedSurfacesState] = useState<string | null>(null);
  const [stagedNotesState, setStagedNotesState] = useState<string | null>(null);

  const activeRecord = useMemo(() => {
    if (selectedToothRecords.length === 0) return null;
    const nonHealthy = selectedToothRecords.filter((r) => r.status !== 'Healthy');
    return nonHealthy.length > 0 ? nonHealthy[0] : selectedToothRecords[0];
  }, [selectedToothRecords]);

  const stagedStatus: ToothStatus = stagedStatusState ?? activeRecord?.status ?? 'Healthy';
  const stagedSurfaces: string = stagedSurfacesState ?? (activeRecord?.surface ? sortToothSurfaces(activeRecord.surface) : '');
  const stagedNotes: string = stagedNotesState ?? activeRecord?.notes ?? '';

  const abnormalCount = useMemo(() => {
    let count = 0;
    for (const recs of Object.values(multiTeethMap)) {
      if (recs.some((r) => r.status !== 'Healthy')) {
        count++;
      }
    }
    return count;
  }, [multiTeethMap]);

  const handleSelectTooth = (toothNumber: number) => {
    setSelectedToothNumber(toothNumber);
    setStagedStatusState(null);
    setStagedSurfacesState(null);
    setStagedNotesState(null);
  };

  const notifyChange = (updatedTooth: DentalToothState, updatedMulti: Record<number, DentalToothRecord[]>) => {
    onChangeTooth?.(updatedTooth);
    if (onChange) {
      onChange(updatedMulti);
    }
  };

  const handleUpdateStatus = (status: ToothStatus) => {
    if (disabled || !selectedToothNumber) return;
    setStagedStatusState(status);

    const toothNum = selectedToothNumber;
    const currentRecs = multiTeethMap[toothNum] || [];

    let nextRecs: DentalToothRecord[];
    if (status === 'Healthy') {
      nextRecs = [
        {
          id: `rec-${toothNum}-healthy-${Date.now()}`,
          toothNumber: toothNum,
          status: 'Healthy',
          surface: '',
          notes: '',
          createdAt: new Date().toISOString(),
          recordedBy: 'Attending Clinician',
        },
      ];
      setStagedSurfacesState('');
    } else {
      const remaining = currentRecs.filter((r) => r.status !== 'Healthy' && r.status !== status);
      const newRec: DentalToothRecord = {
        id: `rec-${toothNum}-${status.toLowerCase()}-${Date.now()}`,
        toothNumber: toothNum,
        status,
        surface: stagedSurfaces,
        notes: stagedNotes,
        createdAt: new Date().toISOString(),
        recordedBy: 'Attending Clinician',
      };
      nextRecs = [...remaining, newRec];
    }

    const nextMulti = {
      ...multiTeethMap,
      [toothNum]: nextRecs,
    };

    const updatedToothState: DentalToothState = {
      toothNumber: toothNum,
      status: getDominantToothStatus(nextRecs),
      surface: sortToothSurfaces(nextRecs.map((r) => r.surface || '').join('')),
      notes: stagedNotes,
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleToggleSurface = (surfaceCode: ToothSurfaceCode) => {
    if (disabled || !selectedToothNumber) return;

    const chars = stagedSurfaces.split('').filter(Boolean);
    let nextChars: string[];
    if (chars.includes(surfaceCode)) {
      nextChars = chars.filter((c) => c !== surfaceCode);
    } else {
      nextChars = [...chars, surfaceCode];
    }
    const sorted = sortToothSurfaces(nextChars);
    setStagedSurfacesState(sorted);

    const toothNum = selectedToothNumber;
    const currentRecs = multiTeethMap[toothNum] || [];
    const activeStatus = stagedStatus === 'Healthy' ? 'Decay' : stagedStatus;
    if (stagedStatus === 'Healthy') {
      setStagedStatusState('Decay');
    }

    const nonMatching = currentRecs.filter((r) => r.status !== activeStatus && r.status !== 'Healthy');
    const existingActive = currentRecs.find((r) => r.status === activeStatus);

    const updatedActive: DentalToothRecord = {
      id: existingActive?.id || `rec-${toothNum}-${activeStatus.toLowerCase()}-${Date.now()}`,
      toothNumber: toothNum,
      status: activeStatus,
      surface: sorted,
      notes: stagedNotes || existingActive?.notes || '',
      createdAt: existingActive?.createdAt || new Date().toISOString(),
      recordedBy: existingActive?.recordedBy || 'Attending Clinician',
    };

    const nextRecs = [...nonMatching, updatedActive];
    const nextMulti = {
      ...multiTeethMap,
      [toothNum]: nextRecs,
    };

    const updatedToothState: DentalToothState = {
      toothNumber: toothNum,
      status: getDominantToothStatus(nextRecs),
      surface: sortToothSurfaces(nextRecs.map((r) => r.surface || '').join('')),
      notes: stagedNotes,
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleNotesChange = (text: string) => {
    if (disabled || !selectedToothNumber) return;
    setStagedNotesState(text);

    const toothNum = selectedToothNumber;
    const currentRecs = multiTeethMap[toothNum] || [];
    const activeStatus = stagedStatus;

    const updatedRecs = currentRecs.map((r) => {
      if (r.status === activeStatus) {
        return { ...r, notes: text };
      }
      return r;
    });

    if (!updatedRecs.some((r) => r.status === activeStatus)) {
      updatedRecs.push({
        id: `rec-${toothNum}-${activeStatus.toLowerCase()}-${Date.now()}`,
        toothNumber: toothNum,
        status: activeStatus,
        surface: stagedSurfaces,
        notes: text,
        createdAt: new Date().toISOString(),
        recordedBy: 'Attending Clinician',
      });
    }

    const nextMulti = {
      ...multiTeethMap,
      [toothNum]: updatedRecs,
    };

    const updatedToothState: DentalToothState = {
      toothNumber: toothNum,
      status: getDominantToothStatus(updatedRecs),
      surface: stagedSurfaces,
      notes: text,
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleRemoveCondition = (toothNumber: number, conditionIdOrStatus: string) => {
    if (disabled) return;

    const currentRecs = multiTeethMap[toothNumber] || [];
    const filtered = currentRecs.filter(
      (r) => r.id !== conditionIdOrStatus && r.status.toLowerCase() !== conditionIdOrStatus.toLowerCase()
    );

    const nextRecs = filtered.length > 0
      ? filtered
      : [
          {
            id: `rec-${toothNumber}-healthy-${Date.now()}`,
            toothNumber,
            status: 'Healthy' as ToothStatus,
            surface: '',
            notes: '',
            createdAt: new Date().toISOString(),
            recordedBy: 'Attending Clinician',
          },
        ];

    const nextMulti = {
      ...multiTeethMap,
      [toothNumber]: nextRecs,
    };

    onRemoveCondition?.(toothNumber, conditionIdOrStatus);

    const updatedToothState: DentalToothState = {
      toothNumber,
      status: getDominantToothStatus(nextRecs),
      surface: sortToothSurfaces(nextRecs.map((r) => r.surface || '').join('')),
      notes: nextRecs[0]?.notes || '',
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleAddCondition = () => {
    if (disabled || !selectedToothNumber) return;
    const toothNum = selectedToothNumber;

    const newRecordPayload = {
      toothNumber: toothNum,
      status: stagedStatus,
      surface: stagedSurfaces,
      notes: stagedNotes,
      recordedBy: 'Attending Clinician',
    };

    onAddCondition?.(newRecordPayload);

    const currentRecs = multiTeethMap[toothNum] || [];
    const remaining = currentRecs.filter((r) => r.status !== 'Healthy' && r.status !== stagedStatus);

    const newRecord: DentalToothRecord = {
      id: `rec-${toothNum}-${stagedStatus.toLowerCase()}-${Date.now()}`,
      ...newRecordPayload,
      createdAt: new Date().toISOString(),
    };

    const nextRecs = [...remaining, newRecord];
    const nextMulti = {
      ...multiTeethMap,
      [toothNum]: nextRecs,
    };

    const updatedToothState: DentalToothState = {
      toothNumber: toothNum,
      status: getDominantToothStatus(nextRecs),
      surface: sortToothSurfaces(nextRecs.map((r) => r.surface || '').join('')),
      notes: stagedNotes,
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleOrderProcedure = () => {
    if (!selectedToothNumber) return;
    const canonicalSurface = selectedToothState?.surface
      ? sortToothSurfaces(selectedToothState.surface)
      : undefined;
    effectiveOrderProcedure?.(selectedToothNumber, canonicalSurface);
  };

  if (loading) {
    return (
      <Card style={styles.card} testID={`${testID}-loading`}>
        <CardHeader
          title="Dental Chart"
          subtitle="Loading patient odontogram and tooth records..."
        />
        <CardContent>
          <SkeletonList rows={4} />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card style={styles.card} testID={`${testID}-error`}>
        <CardContent>
          <ErrorState
            title="Unable to load dental chart"
            message={error}
            onRetry={onRetry}
          />
        </CardContent>
      </Card>
    );
  }

  const renderToothButton = (toothNumber: number) => {
    const records = multiTeethMap[toothNumber] || [];
    const status = getDominantToothStatus(records);
    const combinedSurface = sortToothSurfaces(records.map((r) => r.surface || '').join(''));
    const isSelected = selectedToothNumber === toothNumber;

    // Distinct non-healthy condition statuses for the dots row
    const nonHealthyStatuses = Array.from(
      new Set(records.filter((r) => r.status !== 'Healthy').map((r) => r.status))
    );

    return (
      <Pressable
        key={toothNumber}
        onPress={() => handleSelectTooth(toothNumber)}
        style={({ pressed }) => [
          styles.toothCell,
          isSelected && styles.toothCellSelected,
          status === 'Healthy' && styles.toothHealthy,
          status === 'Decay' && styles.toothDecay,
          status === 'Filled' && styles.toothFilled,
          status === 'Missing' && styles.toothMissing,
          status === 'Crown' && styles.toothCrown,
          status === 'Extraction' && styles.toothExtraction,
          pressed && styles.toothCellPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Tooth #${toothNumber}, status ${status}${combinedSurface ? `, surfaces ${combinedSurface}` : ''}`}
        accessibilityState={{ selected: isSelected }}
        testID={`tooth-cell-${toothNumber}`}
      >
        <ThemedText
          variant="captionBold"
          color={
            status === 'Healthy'
              ? theme.colors.successText
              : status === 'Decay'
              ? theme.colors.urgentText
              : status === 'Filled'
              ? theme.colors.routineText
              : status === 'Missing'
              ? theme.colors.textMuted
              : status === 'Crown'
              ? theme.colors.purpleText
              : theme.colors.emergencyText
          }
        >
          {toothNumber}
        </ThemedText>

        {/* 5-Surface Diagram on Tooth Cell */}
        <ToothSurfaceDiagram
          toothNumber={toothNumber}
          conditions={records}
          size={22}
          showLabels={false}
          testID={`cell-diagram-${toothNumber}`}
        />

        {/* Multi-Condition Colored Dots */}
        {nonHealthyStatuses.length > 0 ? (
          <View style={styles.multiConditionDots} testID={`multi-dots-${toothNumber}`}>
            {nonHealthyStatuses.map((st) => (
              <View
                key={st}
                style={[styles.conditionDot, { backgroundColor: getConditionDotColor(st) }]}
                testID={`dot-${st.toLowerCase()}-${toothNumber}`}
              />
            ))}
          </View>
        ) : null}

        {combinedSurface ? (
          <ThemedText
            variant="caption"
            color={theme.colors.textSecondary}
            numberOfLines={1}
            style={styles.surfaceText}
          >
            {combinedSurface}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

  const upperRightTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_RIGHT : CHILD_UPPER_RIGHT;
  const upperLeftTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_LEFT : CHILD_UPPER_LEFT;
  const lowerRightTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_RIGHT : CHILD_LOWER_RIGHT;
  const lowerLeftTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_LEFT : CHILD_LOWER_LEFT;

  // Active conditions for the inspector list (non-healthy records)
  const activeConditions = selectedToothRecords.filter((r) => r.status !== 'Healthy');

  return (
    <Card style={styles.card} testID={testID}>
      <CardHeader
        title="Dental Chart"
        subtitle="Interactive odontogram and tooth condition examination"
        rightAction={
          <View style={styles.headerActions}>
            {abnormalCount > 0 ? (
              <Badge
                label={`${abnormalCount} Finding${abnormalCount === 1 ? '' : 's'}`}
                variant="warning"
              />
            ) : (
              <Badge label="All Teeth Healthy" variant="success" />
            )}
            <SegmentedControl<DentitionMode>
              options={DENTITION_OPTIONS}
              value={dentitionMode}
              onChange={setDentitionMode}
            />
          </View>
        }
      />
      <CardContent style={styles.content}>
        <ThemedText variant="small" color={theme.colors.textMuted} style={styles.hint}>
          Select a tooth to document condition, surfaces, and clinical notes, or to order a dental procedure.
        </ThemedText>

        {/* Odontogram Grid Viewport */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gridScroll}>
          <View style={styles.odontogramContainer}>
            {/* Maxillary Upper Arch */}
            <View style={styles.archLabelRow}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                UPPER ARCH (MAXILLA)
              </ThemedText>
            </View>
            <View style={styles.archRow}>
              {/* Quadrant Upper Right (Screen Left) */}
              <View style={styles.quadrant}>
                {upperRightTeeth.map((num) => renderToothButton(num))}
              </View>

              {/* Vertical Dental Midline */}
              <View style={styles.midline} />

              {/* Quadrant Upper Left (Screen Right) */}
              <View style={styles.quadrant}>
                {upperLeftTeeth.map((num) => renderToothButton(num))}
              </View>
            </View>

            {/* Horizontal Arch Divider */}
            <View style={styles.archDivider} />

            {/* Mandibular Lower Arch */}
            <View style={styles.archRow}>
              {/* Quadrant Lower Right (Screen Left) */}
              <View style={styles.quadrant}>
                {lowerRightTeeth.map((num) => renderToothButton(num))}
              </View>

              {/* Vertical Dental Midline */}
              <View style={styles.midline} />

              {/* Quadrant Lower Left (Screen Right) */}
              <View style={styles.quadrant}>
                {lowerLeftTeeth.map((num) => renderToothButton(num))}
              </View>
            </View>
            <View style={styles.archLabelRow}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                LOWER ARCH (MANDIBLE)
              </ThemedText>
            </View>
          </View>
        </ScrollView>

        {/* Tooth Detail Inspector Card */}
        {selectedToothNumber ? (
          <View style={styles.inspector} testID={`${testID}-inspector`}>
            <View style={styles.inspectorHeader}>
              <View style={styles.inspectorTitleGroup}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  Tooth #{selectedToothNumber}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {getToothDescription(selectedToothNumber)}
                </ThemedText>
              </View>
              {selectedToothState?.status ? (
                <Badge
                  label={selectedToothState.status}
                  variant={
                    selectedToothState.status === 'Healthy'
                      ? 'success'
                      : selectedToothState.status === 'Decay'
                      ? 'warning'
                      : selectedToothState.status === 'Filled'
                      ? 'info'
                      : selectedToothState.status === 'Missing'
                      ? 'neutral'
                      : selectedToothState.status === 'Crown'
                      ? 'purple'
                      : 'emergency'
                  }
                  size="sm"
                />
              ) : null}
            </View>

            {/* Recorded Conditions on Tooth #XX */}
            <View style={styles.sectionBlock} testID="recorded-conditions-section">
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Recorded Conditions on Tooth #{selectedToothNumber}:
              </ThemedText>
              {activeConditions.length === 0 ? (
                <View style={styles.healthyConditionBox}>
                  <ThemedText variant="small" color={theme.colors.successText}>
                    Healthy — No abnormal conditions or restorations recorded
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.conditionsList}>
                  {activeConditions.map((cond, idx) => (
                    <View
                      key={cond.id || `${cond.status}-${cond.surface}-${idx}`}
                      style={styles.conditionCard}
                      testID={`condition-item-${cond.id || cond.status.toLowerCase()}`}
                    >
                      <View style={styles.conditionHeader}>
                        <View style={styles.conditionBadgeRow}>
                          <Badge
                            label={cond.status}
                            variant={
                              cond.status === 'Decay'
                                ? 'warning'
                                : cond.status === 'Filled'
                                ? 'info'
                                : cond.status === 'Crown'
                                ? 'purple'
                                : cond.status === 'Missing'
                                ? 'neutral'
                                : cond.status === 'Extraction'
                                ? 'emergency'
                                : 'success'
                            }
                            size="sm"
                          />
                          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                            {cond.surface ? `Surfaces: ${sortToothSurfaces(cond.surface)}` : 'Full Tooth / Intact'}
                          </ThemedText>
                        </View>

                        {!disabled ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${cond.status} from Tooth #${selectedToothNumber}`}
                            onPress={() => handleRemoveCondition(selectedToothNumber, cond.id || cond.status)}
                            testID={`remove-condition-${cond.id || cond.status.toLowerCase()}`}
                            style={styles.removeConditionBtn}
                          >
                            <Icon name="trash" size={14} color={theme.colors.emergency} />
                            <ThemedText variant="captionBold" color={theme.colors.emergency}>
                              Remove
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
                  ))}
                </View>
              )}
            </View>

            {/* Interactive 5-Surface Diagram alongside Condition Form */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                5-Surface Schematic & Interactive Staging:
              </ThemedText>
              <View style={styles.diagramWrapper}>
                <ToothSurfaceDiagram
                  toothNumber={selectedToothNumber}
                  conditions={selectedToothRecords}
                  interactive={!disabled}
                  selectedSurfaces={stagedSurfaces}
                  onToggleSurface={handleToggleSurface}
                  size={80}
                  testID="inspector-tooth-surface-diagram"
                />
                <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.diagramHint}>
                  Click any surface zone above (or chips below) to toggle surfaces
                </ThemedText>
              </View>
            </View>

            {/* Status Pills Selector */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Condition Status:
              </ThemedText>
              <View style={styles.pillsRow}>
                {TOOTH_STATUS_OPTIONS.map((status) => {
                  const isStatusSelected = stagedStatus === status;
                  return (
                    <Pressable
                      key={status}
                      disabled={disabled}
                      onPress={() => handleUpdateStatus(status)}
                      style={({ pressed }) => [
                        styles.statusPill,
                        isStatusSelected && styles.statusPillSelected,
                        isStatusSelected && status === 'Healthy' && styles.statusPillHealthy,
                        isStatusSelected && status === 'Decay' && styles.statusPillDecay,
                        isStatusSelected && status === 'Filled' && styles.statusPillFilled,
                        isStatusSelected && status === 'Missing' && styles.statusPillMissing,
                        isStatusSelected && status === 'Crown' && styles.statusPillCrown,
                        isStatusSelected && status === 'Extraction' && styles.statusPillExtraction,
                        pressed && styles.statusPillPressed,
                        disabled && styles.disabledElement,
                      ]}
                      accessibilityRole="radio"
                      accessibilityLabel={`${status} status`}
                      accessibilityState={{ selected: isStatusSelected }}
                      testID={`status-pill-${status.toLowerCase()}`}
                    >
                      <ThemedText
                        variant="captionBold"
                        color={
                          isStatusSelected
                            ? theme.colors.primaryDark
                            : theme.colors.textSecondary
                        }
                      >
                        {status}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Tooth Surface Chips */}
            <View style={styles.sectionBlock}>
              <View style={styles.surfaceHeader}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  Surfaces (Canonical MODBL):
                </ThemedText>
                {stagedSurfaces ? (
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    Selected: {stagedSurfaces}
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.chipsRow}>
                {CANONICAL_SURFACES.map((code) => {
                  const isSelected = stagedSurfaces.includes(code);
                  const labelMap: Record<ToothSurfaceCode, string> = {
                    M: 'M (Mesial)',
                    O: 'O (Occlusal)',
                    D: 'D (Distal)',
                    B: 'B (Buccal)',
                    L: 'L (Lingual)',
                  };
                  return (
                    <Pressable
                      key={code}
                      disabled={disabled}
                      onPress={() => handleToggleSurface(code)}
                      style={({ pressed }) => [
                        styles.surfaceChip,
                        isSelected && styles.surfaceChipSelected,
                        pressed && styles.surfaceChipPressed,
                        disabled && styles.disabledElement,
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Surface ${code}`}
                      accessibilityState={{ selected: isSelected }}
                      testID={`surface-chip-${code.toLowerCase()}`}
                    >
                      <ThemedText
                        variant="captionBold"
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                      >
                        {labelMap[code]}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Clinical Notes */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Clinical Findings & Remarks:
              </ThemedText>
              <Input
                placeholder="Enter clinical observations, caries depth, or treatment plan..."
                value={stagedNotes}
                onChangeText={handleNotesChange}
                editable={!disabled}
                multiline
                numberOfLines={2}
                containerStyle={styles.notesInputContainer}
                testID={`${testID}-notes-input`}
              />
            </View>

            {/* Add Condition Action Button */}
            {!disabled ? (
              <View style={styles.addConditionRow}>
                <Button
                  title="Save Condition"
                  variant="outline"
                  size="sm"
                  icon="plus"
                  onPress={handleAddCondition}
                  testID={`${testID}-save-condition-btn`}
                />
              </View>
            ) : null}

            {/* Quick Action: Order Dental Procedure */}
            {!disabled && effectiveOrderProcedure ? (
              <View style={styles.actionsRow}>
                <Button
                  title={`Order Procedure for Tooth #${selectedToothNumber}${
                    selectedToothState?.surface ? ` (${selectedToothState.surface})` : ''
                  }`}
                  variant="primary"
                  size="sm"
                  icon="plus"
                  onPress={handleOrderProcedure}
                  testID={`${testID}-order-proc-btn`}
                />
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyInspector}>
            <Icon name="consultations" size={theme.sizes.iconMd} color={theme.colors.textMuted} />
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Click any tooth in the odontogram above to view details and record findings.
            </ThemedText>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
  },
  content: {
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  hint: {
    marginBottom: theme.spacing.xs,
  },
  gridScroll: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xs,
  },
  odontogramContainer: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  archLabelRow: {
    paddingVertical: 2,
    alignItems: 'center',
  },
  archRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  quadrant: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  midline: {
    width: 2,
    height: 60,
    backgroundColor: theme.colors.primary,
    marginHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.full,
  },
  archDivider: {
    width: '100%',
    height: 1,
    backgroundColor: theme.colors.borderLight,
    marginVertical: theme.spacing.xs,
  },
  toothCell: {
    width: 44,
    minHeight: 64,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
    gap: 2,
  },
  toothCellSelected: {
    borderColor: theme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: theme.colors.primaryLight,
  },
  toothCellPressed: {
    opacity: 0.8,
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
  surfaceText: {
    letterSpacing: 0.2,
  },
  toothHealthy: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
  },
  toothDecay: {
    backgroundColor: theme.colors.urgentBg,
    borderColor: theme.colors.urgentBorder,
  },
  toothFilled: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routineBorder,
  },
  toothMissing: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderDark,
  },
  toothCrown: {
    backgroundColor: theme.colors.purpleBg,
    borderColor: theme.colors.purpleBorder,
  },
  toothExtraction: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
  },
  inspector: {
    backgroundColor: theme.colors.surfaceHighlight,
    borderColor: theme.colors.borderLight,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  inspectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  inspectorTitleGroup: {
    flexDirection: 'column',
    gap: 2,
  },
  sectionBlock: {
    gap: theme.spacing.xs,
  },
  healthyConditionBox: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.successBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
  },
  conditionsList: {
    gap: theme.spacing.xs,
  },
  conditionCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
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
  diagramWrapper: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  diagramHint: {
    textAlign: 'center',
  },
  pillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  statusPill: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  statusPillSelected: {
    borderWidth: 1.5,
  },
  statusPillHealthy: {
    backgroundColor: theme.colors.successBg,
    borderColor: theme.colors.success,
  },
  statusPillDecay: {
    backgroundColor: theme.colors.urgentBg,
    borderColor: theme.colors.urgent,
  },
  statusPillFilled: {
    backgroundColor: theme.colors.routineBg,
    borderColor: theme.colors.routine,
  },
  statusPillMissing: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderDark,
  },
  statusPillCrown: {
    backgroundColor: theme.colors.purpleBg,
    borderColor: theme.colors.purple,
  },
  statusPillExtraction: {
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergency,
  },
  statusPillPressed: {
    opacity: 0.7,
  },
  surfaceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  surfaceChip: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  surfaceChipSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  surfaceChipPressed: {
    opacity: 0.7,
  },
  notesInputContainer: {
    marginTop: 2,
  },
  addConditionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.xs,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.xs,
  },
  emptyInspector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  disabledElement: {
    opacity: 0.6,
  },
});
