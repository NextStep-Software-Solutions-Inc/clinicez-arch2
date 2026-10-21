import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  SELECTABLE_TOOTH_STATUS_OPTIONS,
  TOOTH_STATUS_OPTIONS,
  getToothStatusLabel,
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
  resolveToothEffectiveState,
  isWholeToothStatus,
  getCurrentEncounterLockedState,
  canApplyConditionToTooth,
  applyStagedConditionToTooth,
  removeCurrentEncounterConditionFromTooth,
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
  SELECTABLE_TOOTH_STATUS_OPTIONS,
  TOOTH_STATUS_OPTIONS,
  getToothStatusLabel,
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
  consultationId?: string | null;
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

function getActiveClinicianName(): string {
  const ctx = (globalThis as any).__mockClinicContext;
  if (ctx?.staffMember?.fullName) return ctx.staffMember.fullName;
  if (ctx?.user?.fullName) return ctx.user.fullName;
  return 'Attending Clinician';
}

function getStatusBadgeVariant(
  status: ToothStatus
): 'success' | 'warning' | 'info' | 'neutral' | 'purple' | 'emergency' {
  switch (status) {
    case 'Healthy':
    case 'Sealant':
      return 'success';
    case 'Decayed':
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
    case 'ForExtraction':
    default:
      return 'emergency';
  }
}

export function InlineDentalChartCard({
  teeth,
  chart,
  consultationId = null,
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

  const [localTeethOverride, setLocalTeethOverride] = useState<Record<number, DentalToothRecord[]> | null>(null);

  useEffect(() => {
    setLocalTeethOverride(null);
  }, [effectiveTeeth]);

  // Normalize all input teeth into multi-condition records: Record<number, DentalToothRecord[]>
  const multiTeethMap = useMemo<Record<number, DentalToothRecord[]>>(() => {
    if (localTeethOverride) return localTeethOverride;
    return normalizeTeethToMultiRecord(effectiveTeeth as any);
  }, [effectiveTeeth, localTeethOverride]);

  const multiTeethRef = useRef<Record<number, DentalToothRecord[]>>(multiTeethMap);
  multiTeethRef.current = multiTeethMap;

  // Backward-compatible single-state mapping for legacy consumers (only current active records)
  const normalizedTeeth = useMemo<Record<number, DentalToothState>>(() => {
    const map: Record<number, DentalToothState> = {};
    for (const [numStr, recs] of Object.entries(multiTeethMap)) {
      const num = Number(numStr);
      const activeRecs = recs.filter((r) => r.isCurrent !== false);
      const dominant = getDominantToothStatus(activeRecs);
      const surfaces = sortToothSurfaces(
        activeRecs.map((r) => r.activeSurface ?? r.surface ?? '').join('')
      );
      const notes = activeRecs.map((r) => r.notes).filter(Boolean).join('; ');
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

  // Staging form state for adding/updating conditions (only committed on explicit Save Condition click)
  const [stagedStatusState, setStagedStatusState] = useState<ToothStatus | null>(null);
  const [stagedSurfacesState, setStagedSurfacesState] = useState<string | null>(null);
  const [stagedNotesState, setStagedNotesState] = useState<string | null>(null);

  const stagedRef = useRef<{
    status: ToothStatus | null;
    surfaces: string | null;
    notes: string | null;
  }>({
    status: null,
    surfaces: null,
    notes: null,
  });

  const activeRecord = useMemo(() => {
    if (selectedToothRecords.length === 0) return null;
    const currentNonHealthy = selectedToothRecords.filter(
      (r) => !r.isVoided && r.status !== 'Healthy' && r.isCurrent !== false
    );
    if (currentNonHealthy.length > 0) {
      return currentNonHealthy[currentNonHealthy.length - 1];
    }
    return null;
  }, [selectedToothRecords]);

  const lockState = useMemo(
    () => getCurrentEncounterLockedState(selectedToothRecords, consultationId),
    [selectedToothRecords, consultationId]
  );

  // Default staged status to the tooth's most recent status (or 'Decayed' if Healthy)
  // while keeping stagedSurfaces empty until the clinician explicitly toggles surfaces for the current encounter.
  const stagedStatus: ToothStatus =
    stagedStatusState ??
    (lockState.hasAnyCurrentEncounterRecord ? 'Decayed' : activeRecord?.status ?? 'Decayed');
  const isWholeToothStaged = isWholeToothStatus(stagedStatus);
  const stagedSurfaces: string = isWholeToothStaged ? '' : stagedSurfacesState ?? '';
  const stagedNotes: string = stagedNotesState ?? '';

  const saveCheck = useMemo(
    () =>
      canApplyConditionToTooth(
        selectedToothRecords,
        stagedStatus,
        isWholeToothStaged ? '' : stagedSurfaces,
        consultationId
      ),
    [selectedToothRecords, stagedStatus, isWholeToothStaged, stagedSurfaces, consultationId]
  );

  const abnormalCount = useMemo(() => {
    let count = 0;
    for (const recs of Object.values(multiTeethMap)) {
      if (recs.some((r) => r.status !== 'Healthy' && r.isCurrent !== false)) {
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
    stagedRef.current = { status: null, surfaces: null, notes: null };
  };

  const notifyChange = (updatedTooth: DentalToothState, updatedMulti: Record<number, DentalToothRecord[]>) => {
    onChangeTooth?.(updatedTooth);
    if (onChange) {
      onChange(updatedMulti);
    }
  };

  // Selecting tooth condition status ONLY stages locally — Save Condition must be explicitly clicked
  const handleUpdateStatus = (status: ToothStatus) => {
    if (disabled || !selectedToothNumber) return;
    const currentRecs = multiTeethRef.current[selectedToothNumber] || [];
    const check = canApplyConditionToTooth(currentRecs, status, undefined, consultationId);
    if (!check.allowed) return;

    setStagedStatusState(status);
    stagedRef.current.status = status;

    if (isWholeToothStatus(status)) {
      setStagedSurfacesState('');
      stagedRef.current.surfaces = '';
    }
  };

  // Toggling tooth surfaces ONLY stages locally — Save Condition must be explicitly clicked
  const handleToggleSurface = (surfaceCode: ToothSurfaceCode) => {
    if (disabled || !selectedToothNumber) return;
    const curStatus = stagedRef.current.status ?? stagedStatus;
    if (isWholeToothStatus(curStatus)) return;

    const currentRecs = multiTeethRef.current[selectedToothNumber] || [];
    const curLock = getCurrentEncounterLockedState(currentRecs, consultationId);
    if (curLock.lockedSurfaces.has(surfaceCode)) return;

    const baseSurfaces = stagedRef.current.surfaces ?? stagedSurfaces;
    const chars = baseSurfaces.split('').filter(Boolean);
    let nextChars: string[];
    if (chars.includes(surfaceCode)) {
      nextChars = chars.filter((c) => c !== surfaceCode);
    } else {
      nextChars = [...chars, surfaceCode];
    }
    const sorted = sortToothSurfaces(nextChars);
    setStagedSurfacesState(sorted);
    stagedRef.current.surfaces = sorted;
  };

  // Editing notes ONLY stages locally — Save Condition must be explicitly clicked
  const handleNotesChange = (text: string) => {
    if (disabled || !selectedToothNumber) return;
    setStagedNotesState(text);
    stagedRef.current.notes = text;
  };

  const handleRemoveCondition = (toothNumber: number, conditionIdOrStatus: string) => {
    if (disabled) return;

    const currentRecs = multiTeethRef.current[toothNumber] || [];
    const nextRecs = removeCurrentEncounterConditionFromTooth(
      currentRecs,
      conditionIdOrStatus,
      consultationId
    );

    const nextMulti = {
      ...multiTeethRef.current,
      [toothNumber]: nextRecs,
    };

    multiTeethRef.current = nextMulti;
    setLocalTeethOverride(nextMulti);
    onRemoveCondition?.(toothNumber, conditionIdOrStatus);

    const activeRecs = nextRecs.filter((r) => !r.isVoided && r.isCurrent !== false);
    const updatedToothState: DentalToothState = {
      toothNumber,
      status: getDominantToothStatus(activeRecs),
      surface: sortToothSurfaces(
        activeRecs.map((r) => r.activeSurface ?? r.surface ?? '').join('')
      ),
      notes: activeRecs[activeRecs.length - 1]?.notes || '',
    };

    notifyChange(updatedToothState, nextMulti);
  };

  const handleResetToHealthy = () => {
    if (disabled || !selectedToothNumber) return;
    const toothNum = selectedToothNumber;
    const currentRecs = multiTeethRef.current[toothNum] || [];
    const clinician = getActiveClinicianName();

    const nextRecs = applyStagedConditionToTooth(currentRecs, {
      toothNumber: toothNum,
      status: 'Healthy',
      surface: '',
      notes: '',
      recordedBy: clinician,
      consultationId,
      isCurrentEncounter: true,
    });

    const nextMulti = {
      ...multiTeethRef.current,
      [toothNum]: nextRecs,
    };

    multiTeethRef.current = nextMulti;
    setLocalTeethOverride(nextMulti);
    setStagedStatusState(null);
    setStagedSurfacesState('');
    setStagedNotesState('');
    stagedRef.current = { status: null, surfaces: '', notes: '' };

    notifyChange(
      {
        toothNumber: toothNum,
        status: 'Healthy',
        surface: '',
        notes: '',
      },
      nextMulti
    );
  };

  const handleAddCondition = () => {
    if (disabled || !selectedToothNumber) return;
    const toothNum = selectedToothNumber;
    const currentRecs = multiTeethRef.current[toothNum] || [];

    const curStatus = stagedRef.current.status ?? stagedStatus;
    const curSurfaces = isWholeToothStatus(curStatus)
      ? ''
      : stagedRef.current.surfaces ?? stagedSurfaces;
    const curNotes = stagedRef.current.notes ?? stagedNotes;

    const check = canApplyConditionToTooth(
      currentRecs,
      curStatus,
      curSurfaces,
      consultationId
    );
    if (!check.allowed) return;

    const clinician = getActiveClinicianName();
    const effectiveSurfaceForPayload = isWholeToothStatus(curStatus)
      ? ''
      : curStatus === 'Crowned'
        ? sortToothSurfaces(curSurfaces || 'MODBL')
        : sortToothSurfaces(curSurfaces || 'O');

    const newRecordPayload = {
      toothNumber: toothNum,
      status: curStatus,
      surface: effectiveSurfaceForPayload,
      notes: curNotes,
      recordedBy: clinician,
      consultationId,
      isCurrentEncounter: true,
    };

    onAddCondition?.(newRecordPayload);

    const nextRecs = applyStagedConditionToTooth(currentRecs, {
      toothNumber: toothNum,
      status: curStatus,
      surface: curSurfaces,
      notes: curNotes,
      recordedBy: clinician,
      consultationId,
      isCurrentEncounter: true,
    });

    const nextMulti = {
      ...multiTeethRef.current,
      [toothNum]: nextRecs,
    };

    multiTeethRef.current = nextMulti;
    setLocalTeethOverride(nextMulti);
    setStagedSurfacesState('');
    setStagedNotesState('');
    stagedRef.current.surfaces = '';
    stagedRef.current.notes = '';

    const activeRecs = nextRecs.filter((r) => r.isCurrent !== false);
    const updatedToothState: DentalToothState = {
      toothNumber: toothNum,
      status: getDominantToothStatus(activeRecs),
      surface: sortToothSurfaces(
        activeRecs.map((r) => r.activeSurface ?? r.surface ?? '').join('')
      ),
      notes: curNotes,
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
    const activeRecords = records.filter((r) => !r.isVoided && r.isCurrent !== false);
    const status = getDominantToothStatus(activeRecords);
    const combinedSurface = sortToothSurfaces(
      activeRecords.map((r) => r.activeSurface ?? r.surface ?? '').join('')
    );
    const isSelected = selectedToothNumber === toothNumber;

    // Distinct active non-healthy condition statuses for the dots row
    const nonHealthyStatuses = Array.from(
      new Set(activeRecords.filter((r) => r.status !== 'Healthy').map((r) => r.status))
    );

    return (
      <Pressable
        key={toothNumber}
        onPress={() => handleSelectTooth(toothNumber)}
        style={({ pressed }) => [
          styles.toothCell,
          status === 'Healthy' && styles.toothHealthy,
          (status === 'Decayed' || status === 'Fractured') && styles.toothDecayed,
          (status === 'Filled' || status === 'Sealant' || status === 'Implant') && styles.toothFilled,
          status === 'Missing' && styles.toothMissing,
          (status === 'Crowned' || status === 'RootCanal') && styles.toothCrowned,
          (status === 'ForExtraction' || status === 'Impacted') && styles.toothForExtraction,
          isSelected && styles.toothCellSelected,
          pressed && styles.toothCellPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Tooth #${toothNumber}, status ${getToothStatusLabel(status)}${combinedSurface ? `, surfaces ${combinedSurface}` : ''}`}
        accessibilityState={{ selected: isSelected }}
        testID={`tooth-cell-${toothNumber}`}
      >
        <ThemedText
          variant="captionBold"
          color={
            isSelected
              ? theme.colors.primaryDark
              : status === 'Healthy'
              ? theme.colors.text
              : status === 'Decayed' || status === 'ForExtraction' || status === 'Fractured'
              ? theme.colors.emergencyText
              : status === 'Filled' || status === 'Sealant' || status === 'Implant'
              ? theme.colors.infoText
              : status === 'Missing'
              ? theme.colors.textMuted
              : status === 'Crowned' || status === 'RootCanal'
              ? theme.colors.purpleText
              : theme.colors.warningText
          }
        >
          {toothNumber}
        </ThemedText>

        {/* 5-Surface Trapezoid Diagram on Tooth Cell */}
        <ToothSurfaceDiagram
          toothNumber={toothNumber}
          conditions={activeRecords}
          size={28}
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
      </Pressable>
    );
  };

  const upperRightTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_RIGHT : CHILD_UPPER_RIGHT;
  const upperLeftTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_LEFT : CHILD_UPPER_LEFT;
  const lowerRightTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_RIGHT : CHILD_LOWER_RIGHT;
  const lowerLeftTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_LEFT : CHILD_LOWER_LEFT;

  // Active conditions for the Right Screen inspector list: ONLY current active non-healthy records (no historical or voided records)
  const activeConditions = selectedToothRecords.filter(
    (r) => !r.isVoided && r.status !== 'Healthy' && r.isCurrent !== false
  );

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
                  label={getToothStatusLabel(selectedToothState.status)}
                  variant={getStatusBadgeVariant(selectedToothState.status)}
                  size="sm"
                />
              ) : null}
            </View>

            {/* Side-by-Side /generative_ui Inspector Body: Left 5-Surface Trapezoid SVG, Right Controls */}
            <View style={styles.inspectorMainGrid}>
              {/* Left Column: Interactive 5-Surface Trapezoid Diagram */}
              <View style={styles.diagramColumn}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                  5-Surface Schematic:
                </ThemedText>
                <View style={styles.diagramWrapper}>
                  <ToothSurfaceDiagram
                    toothNumber={selectedToothNumber}
                    conditions={activeConditions}
                    interactive={!disabled && !isWholeToothStaged && !lockState.isWholeToothLocked}
                    selectedSurfaces={isWholeToothStaged ? '' : stagedSurfaces}
                    stagedStatus={stagedStatus}
                    onToggleSurface={handleToggleSurface}
                    size={96}
                    testID="inspector-tooth-surface-diagram"
                  />
                  <ThemedText variant="caption" color={theme.colors.textMuted} style={styles.diagramHint}>
                    {isWholeToothStaged
                      ? `Whole tooth status (${getToothStatusLabel(stagedStatus)}) — surfaces disabled`
                      : 'Tap trapezoid zones or chips to toggle surfaces'}
                  </ThemedText>
                </View>
              </View>

              {/* Right Column: Condition Status, Surface Chips, Clinical Notes & Actions */}
              <View style={styles.controlsColumn}>
                {/* Status Pills Selector (excludes Healthy — Healthy is the implicit default when 0 conditions exist) */}
                <View style={styles.sectionBlock}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Condition Status:
                  </ThemedText>
                  <View style={styles.pillsRow}>
                    {SELECTABLE_TOOTH_STATUS_OPTIONS.map((status) => {
                      const isStatusSelected = stagedStatus === status;
                      const check = canApplyConditionToTooth(
                        selectedToothRecords,
                        status,
                        undefined,
                        consultationId
                      );
                      const isStatusDisabled = disabled || !check.allowed;
                      return (
                        <Pressable
                          key={status}
                          disabled={isStatusDisabled}
                          onPress={() => handleUpdateStatus(status)}
                          style={({ pressed }) => [
                            styles.statusPill,
                            isStatusSelected && styles.statusPillSelected,
                            isStatusSelected && (status === 'Decayed' || status === 'Fractured') && styles.statusPillDecayed,
                            isStatusSelected && (status === 'Filled' || status === 'Sealant' || status === 'Implant') && styles.statusPillFilled,
                            isStatusSelected && status === 'Missing' && styles.statusPillMissing,
                            isStatusSelected && (status === 'Crowned' || status === 'RootCanal') && styles.statusPillCrowned,
                            isStatusSelected && (status === 'ForExtraction' || status === 'Impacted') && styles.statusPillForExtraction,
                            pressed && styles.statusPillPressed,
                            isStatusDisabled && styles.disabledElement,
                          ]}
                          accessibilityRole="radio"
                          accessibilityLabel={`${getToothStatusLabel(status)} status`}
                          accessibilityState={{ selected: isStatusSelected, disabled: isStatusDisabled }}
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
                            {getToothStatusLabel(status)}
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
                    {isWholeToothStaged ? (
                      <ThemedText variant="captionBold" color={theme.colors.textMuted}>
                        Whole Tooth (Surfaces Disabled)
                      </ThemedText>
                    ) : stagedSurfaces ? (
                      <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                        Selected: {stagedSurfaces}
                      </ThemedText>
                    ) : null}
                  </View>
                  <View style={styles.chipsRow}>
                    {CANONICAL_SURFACES.map((code) => {
                      const isSelected = !isWholeToothStaged && stagedSurfaces.includes(code);
                      const isSurfaceLockedInEncounter = lockState.lockedSurfaces.has(code);
                      const isChipDisabled =
                        disabled || isWholeToothStaged || isSurfaceLockedInEncounter;
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
                          disabled={isChipDisabled}
                          onPress={() => handleToggleSurface(code)}
                          style={({ pressed }) => [
                            styles.surfaceChip,
                            isSelected && styles.surfaceChipSelected,
                            pressed && styles.surfaceChipPressed,
                            isChipDisabled && styles.disabledElement,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Surface ${code}`}
                          accessibilityState={{ selected: isSelected, disabled: isChipDisabled }}
                          testID={`surface-chip-${code.toLowerCase()}`}
                        >
                          <ThemedText
                            variant="captionBold"
                            color={
                              isChipDisabled
                                ? theme.colors.textMuted
                                : isSelected
                                  ? theme.colors.primaryDark
                                  : theme.colors.text
                            }
                          >
                            {labelMap[code]}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  {!disabled && !lockState.isWholeToothLocked && !saveCheck.allowed && saveCheck.reason ? (
                    <ThemedText
                      variant="caption"
                      color={theme.colors.warningText}
                      testID="same-encounter-lock-notice"
                    >
                      {saveCheck.reason}
                    </ThemedText>
                  ) : null}
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

                {/* Action Buttons Row */}
                <View style={styles.actionButtonsRow}>
                  {!disabled ? (
                    <Pressable
                      style={styles.addConditionRow}
                      onPress={handleAddCondition}
                      disabled={!saveCheck.allowed}
                      testID={`${testID}-save-condition-trigger`}
                    >
                      <Button
                        title="Save Condition"
                        variant="outline"
                        size="sm"
                        icon="plus"
                        disabled={!saveCheck.allowed}
                        onPress={handleAddCondition}
                        testID={`${testID}-save-condition-btn`}
                      />
                    </Pressable>
                  ) : null}

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
              </View>
            </View>

            {/* Recorded Conditions on Tooth #XX (Right Screen: Latest/Current Status Only; Prior Visit Records Untouchable) */}
            <View style={styles.sectionBlock} testID="recorded-conditions-section">
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Recorded Conditions on Tooth #{selectedToothNumber}:
              </ThemedText>
              {activeConditions.length === 0 ? (
                <View style={styles.healthyConditionBox}>
                  <ThemedText variant="small" color={theme.colors.textSecondary}>
                    Healthy — No abnormal conditions or restorations recorded
                  </ThemedText>
                </View>
              ) : (
                <View style={styles.conditionsList}>
                  {activeConditions.map((cond, idx) => {
                    const origSurf = cond.surface ? sortToothSurfaces(cond.surface) : '';
                    const actSurf =
                      cond.activeSurface !== undefined && cond.activeSurface !== null
                        ? sortToothSurfaces(cond.activeSurface)
                        : origSurf;
                    const isCurrentEncounterRecord =
                      cond.isCurrentEncounter === true ||
                      Boolean(
                        consultationId &&
                          cond.consultationId &&
                          cond.consultationId === consultationId
                      );

                    return (
                      <View
                        key={cond.id || `${cond.status}-${cond.surface}-${idx}`}
                        style={styles.conditionCard}
                        testID={`condition-item-${cond.id || cond.status.toLowerCase()}`}
                      >
                        <View style={styles.conditionHeader}>
                          <View style={styles.conditionBadgeRow}>
                            <Badge
                              label={getToothStatusLabel(cond.status)}
                              variant={getStatusBadgeVariant(cond.status)}
                              size="sm"
                            />
                            <Badge
                              label={isCurrentEncounterRecord ? 'Current Visit' : 'Prior Visit'}
                              variant={isCurrentEncounterRecord ? 'success' : 'neutral'}
                              size="sm"
                            />
                            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                              {actSurf ? `Surfaces: ${actSurf}` : 'Full Tooth / Intact'}
                            </ThemedText>
                          </View>

                          {!disabled && isCurrentEncounterRecord ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`Remove ${getToothStatusLabel(cond.status)} from Tooth #${selectedToothNumber}`}
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
                    );
                  })}
                </View>
              )}
            </View>
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  toothDecayed: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.emergencyBorder,
  },
  toothFilled: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.infoBorder,
  },
  toothMissing: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderDark,
  },
  toothCrowned: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.purpleBorder,
  },
  toothForExtraction: {
    backgroundColor: theme.colors.surface,
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
  inspectorMainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.lg,
    alignItems: 'flex-start',
  },
  diagramColumn: {
    width: 148,
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
  },
  controlsColumn: {
    flex: 1,
    minWidth: 240,
    gap: theme.spacing.sm,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
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
  conditionCardHistorical: {
    opacity: 0.72,
    backgroundColor: theme.colors.surfaceSubtle,
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
  statusPillDecayed: {
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
  statusPillCrowned: {
    backgroundColor: theme.colors.purpleBg,
    borderColor: theme.colors.purple,
  },
  statusPillForExtraction: {
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

export default InlineDentalChartCard;
