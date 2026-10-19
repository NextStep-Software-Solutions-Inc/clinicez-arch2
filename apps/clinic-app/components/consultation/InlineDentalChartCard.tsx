import React, { useState, useMemo } from 'react';
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

export type ToothStatus = 'Healthy' | 'Decay' | 'Filled' | 'Missing' | 'Crown' | 'Extraction';

export interface DentalToothState {
  toothNumber: number;
  status: ToothStatus;
  surface?: string;
  notes?: string;
}

export interface InlineDentalChartCardProps {
  teeth?: Record<number, DentalToothState> | DentalToothState[];
  chart?: Record<number, DentalToothState> | DentalToothState[];
  onChangeTooth?: (tooth: DentalToothState) => void;
  onChange?: (chart: Record<number, DentalToothState>) => void;
  onOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  onQuickOrderProcedure?: (toothNumber: number, toothSurface?: string) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  initialToothNumber?: number;
  testID?: string;
}

export const ADULT_UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11] as const;
export const ADULT_UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28] as const;
export const ADULT_LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41] as const;
export const ADULT_LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38] as const;

export const CHILD_UPPER_RIGHT = [55, 54, 53, 52, 51] as const;
export const CHILD_UPPER_LEFT = [61, 62, 63, 64, 65] as const;
export const CHILD_LOWER_RIGHT = [85, 84, 83, 82, 81] as const;
export const CHILD_LOWER_LEFT = [71, 72, 73, 74, 75] as const;

export const CANONICAL_SURFACES = ['M', 'O', 'D', 'B', 'L'] as const;
export type ToothSurfaceCode = (typeof CANONICAL_SURFACES)[number];

export const TOOTH_STATUS_OPTIONS: readonly ToothStatus[] = [
  'Healthy',
  'Decay',
  'Filled',
  'Missing',
  'Crown',
  'Extraction',
] as const;

export function sortToothSurfaces(surfaces: string | string[]): string {
  const set = new Set((Array.isArray(surfaces) ? surfaces.join('') : surfaces).toUpperCase().split(''));
  return CANONICAL_SURFACES.filter((s) => set.has(s)).join('');
}

export function getToothDescription(toothNumber: number): string {
  const q = Math.floor(toothNumber / 10);
  const pos = toothNumber % 10;
  const arch = q === 1 || q === 2 || q === 5 || q === 6 ? 'Upper' : 'Lower';
  const side = q === 1 || q === 4 || q === 5 || q === 8 ? 'Right' : 'Left';
  const isChild = q >= 5;

  let toothType = '';
  if (isChild) {
    switch (pos) {
      case 1: toothType = 'Central Incisor'; break;
      case 2: toothType = 'Lateral Incisor'; break;
      case 3: toothType = 'Canine'; break;
      case 4: toothType = 'First Molar'; break;
      case 5: toothType = 'Second Molar'; break;
      default: toothType = 'Tooth';
    }
  } else {
    switch (pos) {
      case 1: toothType = 'Central Incisor'; break;
      case 2: toothType = 'Lateral Incisor'; break;
      case 3: toothType = 'Canine'; break;
      case 4: toothType = 'First Premolar'; break;
      case 5: toothType = 'Second Premolar'; break;
      case 6: toothType = 'First Molar'; break;
      case 7: toothType = 'Second Molar'; break;
      case 8: toothType = 'Third Molar'; break;
      default: toothType = 'Tooth';
    }
  }
  return `${arch} ${side} ${toothType}`;
}

type DentitionMode = 'Adult' | 'Child';

const DENTITION_OPTIONS: Array<{ value: DentitionMode; label: string }> = [
  { value: 'Adult', label: 'Adult (11–48)' },
  { value: 'Child', label: 'Child (51–85)' },
];

export function InlineDentalChartCard({
  teeth,
  chart,
  onChangeTooth,
  onChange,
  onOrderProcedure,
  onQuickOrderProcedure,
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

  const normalizedTeeth = useMemo<Record<number, DentalToothState>>(() => {
    if (Array.isArray(effectiveTeeth)) {
      const map: Record<number, DentalToothState> = {};
      for (const t of effectiveTeeth) {
        map[t.toothNumber] = t;
      }
      return map;
    }
    return effectiveTeeth || {};
  }, [effectiveTeeth]);

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

  const abnormalCount = useMemo(() => {
    return Object.values(normalizedTeeth).filter(
      (t) => t.status && t.status !== 'Healthy'
    ).length;
  }, [normalizedTeeth]);

  const handleSelectTooth = (toothNumber: number) => {
    setSelectedToothNumber(toothNumber);
  };

  const notifyChange = (updated: DentalToothState) => {
    onChangeTooth?.(updated);
    if (onChange) {
      onChange({
        ...normalizedTeeth,
        [updated.toothNumber]: updated,
      });
    }
  };

  const handleUpdateStatus = (status: ToothStatus) => {
    if (disabled || !selectedToothNumber) return;
    const current = selectedToothState || {
      toothNumber: selectedToothNumber,
      status: 'Healthy',
      surface: '',
      notes: '',
    };
    const updated: DentalToothState = {
      ...current,
      status,
    };
    notifyChange(updated);
  };

  const handleToggleSurface = (surfaceCode: ToothSurfaceCode) => {
    if (disabled || !selectedToothNumber) return;
    const current = selectedToothState || {
      toothNumber: selectedToothNumber,
      status: 'Healthy',
      surface: '',
      notes: '',
    };
    const currentSurfaces = (current.surface || '').toUpperCase().split('');
    let nextSurfaces: string[];
    if (currentSurfaces.includes(surfaceCode)) {
      nextSurfaces = currentSurfaces.filter((s) => s !== surfaceCode);
    } else {
      nextSurfaces = [...currentSurfaces, surfaceCode];
    }
    const sorted = sortToothSurfaces(nextSurfaces);
    const updated: DentalToothState = {
      ...current,
      surface: sorted,
    };
    notifyChange(updated);
  };

  const handleNotesChange = (text: string) => {
    if (disabled || !selectedToothNumber) return;
    const current = selectedToothState || {
      toothNumber: selectedToothNumber,
      status: 'Healthy',
      surface: '',
      notes: '',
    };
    const updated: DentalToothState = {
      ...current,
      notes: text,
    };
    notifyChange(updated);
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
    const record = normalizedTeeth[toothNumber];
    const status = record?.status || 'Healthy';
    const surface = record?.surface || '';
    const isSelected = selectedToothNumber === toothNumber;

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
        accessibilityLabel={`Tooth #${toothNumber}, status ${status}${surface ? `, surfaces ${surface}` : ''}`}
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
        {surface ? (
          <ThemedText
            variant="caption"
            color={theme.colors.textSecondary}
            numberOfLines={1}
            style={styles.surfaceText}
          >
            {surface}
          </ThemedText>
        ) : null}
      </Pressable>
    );
  };

  const upperRightTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_RIGHT : CHILD_UPPER_RIGHT;
  const upperLeftTeeth = dentitionMode === 'Adult' ? ADULT_UPPER_LEFT : CHILD_UPPER_LEFT;
  const lowerRightTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_RIGHT : CHILD_LOWER_RIGHT;
  const lowerLeftTeeth = dentitionMode === 'Adult' ? ADULT_LOWER_LEFT : CHILD_LOWER_LEFT;

  const currentSurfaces = selectedToothState?.surface
    ? selectedToothState.surface.toUpperCase().split('')
    : [];

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
                      ? 'neutral'
                      : 'emergency'
                  }
                  size="sm"
                />
              ) : null}
            </View>

            {/* Status Pills Selector */}
            <View style={styles.sectionBlock}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Condition Status:
              </ThemedText>
              <View style={styles.pillsRow}>
                {TOOTH_STATUS_OPTIONS.map((status) => {
                  const isStatusSelected = selectedToothState?.status === status;
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
                {selectedToothState?.surface ? (
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    Selected: {selectedToothState.surface}
                  </ThemedText>
                ) : null}
              </View>
              <View style={styles.chipsRow}>
                {CANONICAL_SURFACES.map((code) => {
                  const isSelected = currentSurfaces.includes(code);
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
                value={selectedToothState?.notes || ''}
                onChangeText={handleNotesChange}
                editable={!disabled}
                multiline
                numberOfLines={2}
                containerStyle={styles.notesInputContainer}
                testID={`${testID}-notes-input`}
              />
            </View>

            {/* Quick Action: Order Dental Procedure */}
            {!disabled && effectiveOrderProcedure ? (
              <View style={styles.actionsRow}>
                <Button
                  title={`+ Order Procedure for Tooth #${selectedToothNumber}${
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
    height: 48,
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
    width: 38,
    height: 46,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 2,
  },
  toothCellSelected: {
    borderColor: theme.colors.focusRing,
    borderWidth: 2,
    backgroundColor: theme.colors.primaryLight,
  },
  toothCellPressed: {
    opacity: 0.8,
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
