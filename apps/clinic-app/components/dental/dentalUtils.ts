import { theme } from '../../constants/theme';

export type ToothStatus = 'Healthy' | 'Decay' | 'Filled' | 'Missing' | 'Crown' | 'Extraction';

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

export interface DentalToothRecord {
  id: string;
  tenantId?: string;
  clinicId?: string;
  patientId?: string;
  consultationId?: string | null;
  toothNumber: number;
  status: ToothStatus;
  surface?: string | null;
  activeSurface?: string | null;
  isCurrent?: boolean;
  supersededAt?: string | null;
  supersededByRecordId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  recordedBy?: string | null;
}

export function sortToothSurfaces(surfaces: string | string[]): string {
  const set = new Set((Array.isArray(surfaces) ? surfaces.join('') : surfaces).toUpperCase().split(''));
  return CANONICAL_SURFACES.filter((s) => set.has(s)).join('');
}

export function subtractToothSurfaces(
  sourceSurface: string | null | undefined,
  subtractedSurface: string | null | undefined
): string {
  if (!sourceSurface) return '';
  if (!subtractedSurface) return sortToothSurfaces(sourceSurface);
  const subSet = new Set(subtractedSurface.toUpperCase().split(''));
  const remaining = sourceSurface
    .toUpperCase()
    .split('')
    .filter((c) => !subSet.has(c))
    .join('');
  return sortToothSurfaces(remaining);
}

export function getToothDescription(toothNumber: number): string {
  const isAdult =
    (toothNumber >= 11 && toothNumber <= 18) ||
    (toothNumber >= 21 && toothNumber <= 28) ||
    (toothNumber >= 31 && toothNumber <= 38) ||
    (toothNumber >= 41 && toothNumber <= 48);
  const isChild =
    (toothNumber >= 51 && toothNumber <= 55) ||
    (toothNumber >= 61 && toothNumber <= 65) ||
    (toothNumber >= 71 && toothNumber <= 75) ||
    (toothNumber >= 81 && toothNumber <= 85);

  if (!isAdult && !isChild) {
    return `Tooth #${toothNumber}`;
  }

  const q = Math.floor(toothNumber / 10);
  const pos = toothNumber % 10;
  const arch = q === 1 || q === 2 || q === 5 || q === 6 ? 'Upper' : 'Lower';
  const side = q === 1 || q === 4 || q === 5 || q === 8 ? 'Right' : 'Left';

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
    return `${arch} ${side} Primary ${toothType}`;
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
    return `${arch} ${side} ${toothType}`;
  }
}

export function isRightQuadrant(toothNumber: number): boolean {
  const q = Math.floor(toothNumber / 10);
  return q === 1 || q === 4 || q === 5 || q === 8;
}

export function getSurfacesForQuadrant(toothNumber: number): {
  top: 'B';
  bottom: 'L';
  center: 'O';
  left: 'M' | 'D';
  right: 'M' | 'D';
} {
  const isRight = isRightQuadrant(toothNumber);
  return {
    top: 'B',
    bottom: 'L',
    center: 'O',
    left: isRight ? 'D' : 'M',
    right: isRight ? 'M' : 'D',
  };
}

export function normalizeTeethToMultiRecord(
  raw: Record<number, any> | any[] | undefined
): Record<number, DentalToothRecord[]> {
  const map: Record<number, DentalToothRecord[]> = {};
  if (!raw) return map;

  const items: any[] = Array.isArray(raw) ? raw : Object.values(raw).flat();
  for (const item of items) {
    if (!item || typeof item.toothNumber !== 'number') continue;
    const num = item.toothNumber;
    if (!map[num]) map[num] = [];

    const status: ToothStatus = item.status || 'Healthy';
    const sortedSurface = item.surface ? sortToothSurfaces(item.surface) : '';
    const hasExplicitActive = item.activeSurface !== undefined && item.activeSurface !== null;
    const rec: DentalToothRecord = {
      id: item.id || `temp-${num}-${status}-${map[num].length}`,
      tenantId: item.tenantId,
      clinicId: item.clinicId,
      patientId: item.patientId,
      consultationId: item.consultationId || null,
      toothNumber: num,
      status,
      surface: sortedSurface,
      activeSurface: hasExplicitActive ? sortToothSurfaces(item.activeSurface) : sortedSurface,
      isCurrent: item.isCurrent !== undefined ? Boolean(item.isCurrent) : true,
      supersededAt: item.supersededAt || null,
      supersededByRecordId: item.supersededByRecordId || null,
      notes: item.notes || '',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || null,
      recordedBy: item.recordedBy || item.createdBy || 'Attending Clinician',
    };

    map[num].push(rec);
  }

  // Filter out placeholder 'Healthy' records if any abnormal condition exists on that tooth
  for (const numStr of Object.keys(map)) {
    const num = Number(numStr);
    const records = map[num];
    const hasAbnormal = records.some((r) => r.status !== 'Healthy');
    if (hasAbnormal) {
      map[num] = records.filter((r) => r.status !== 'Healthy');
    }
  }

  return map;
}

export interface EffectiveToothState {
  surfaceStatus: Record<ToothSurfaceCode, ToothStatus>;
  isMissing: boolean;
  hasExtraction: boolean;
  dominantStatus: ToothStatus;
  currentRecords: DentalToothRecord[];
  historicalRecords: DentalToothRecord[];
  allRecords: DentalToothRecord[];
}

export function resolveToothEffectiveState(records: DentalToothRecord[]): EffectiveToothState {
  const surfaceStatus: Record<ToothSurfaceCode, ToothStatus> = {
    M: 'Healthy',
    O: 'Healthy',
    D: 'Healthy',
    B: 'Healthy',
    L: 'Healthy',
  };

  if (!records || records.length === 0) {
    return {
      surfaceStatus,
      isMissing: false,
      hasExtraction: false,
      dominantStatus: 'Healthy',
      currentRecords: [],
      historicalRecords: [],
      allRecords: [],
    };
  }

  // Clone and sort chronologically (oldest -> newest) so later surface treatments supersede earlier surfaces
  const indexed = records.map((r, idx) => ({
    rec: {
      ...r,
      surface: r.surface ? sortToothSurfaces(r.surface) : '',
      activeSurface:
        r.activeSurface !== undefined && r.activeSurface !== null
          ? sortToothSurfaces(r.activeSurface)
          : r.surface
            ? sortToothSurfaces(r.surface)
            : '',
      isCurrent: r.isCurrent !== undefined ? r.isCurrent : true,
    },
    idx,
    time: Number.isNaN(Date.parse(r.createdAt)) ? 0 : Date.parse(r.createdAt),
  }));

  indexed.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.idx - b.idx));

  const resolved: DentalToothRecord[] = [];
  for (const item of indexed) {
    const current = item.rec;
    if (current.isCurrent === false) {
      resolved.push(current);
      continue;
    }

    if (current.status === 'Missing') {
      // Missing supersedes all prior active records on this tooth
      for (const prior of resolved) {
        if (prior.isCurrent !== false) {
          prior.isCurrent = false;
          prior.activeSurface = '';
          prior.supersededAt = prior.supersededAt || current.createdAt;
          prior.supersededByRecordId = prior.supersededByRecordId || current.id;
        }
      }
      current.activeSurface = '';
      current.isCurrent = true;
      resolved.push(current);
      continue;
    }

    const incomingSurfaces = current.activeSurface || current.surface || '';
    if (
      incomingSurfaces.length > 0 &&
      (current.status === 'Filled' || current.status === 'Decay' || current.status === 'Crown')
    ) {
      for (const prior of resolved) {
        if (prior.isCurrent === false) continue;
        if (prior.status !== 'Decay' && prior.status !== 'Filled' && prior.status !== 'Crown') {
          continue;
        }
        const priorSurf = prior.activeSurface ?? prior.surface ?? '';
        if (!priorSurf) continue;
        const remaining = subtractToothSurfaces(priorSurf, incomingSurfaces);
        if (remaining !== priorSurf) {
          prior.activeSurface = remaining;
          if (remaining.length === 0) {
            prior.isCurrent = false;
            prior.supersededAt = prior.supersededAt || current.createdAt;
            prior.supersededByRecordId = prior.supersededByRecordId || current.id;
          }
        }
      }
    }

    resolved.push(current);
  }

  // Restore original order of records while keeping resolved activeSurface / isCurrent
  const byIdOrIdx = new Map<number, DentalToothRecord>();
  indexed.forEach((item, sortedPos) => {
    byIdOrIdx.set(item.idx, resolved[sortedPos]);
  });
  const allRecords = records.map((_, idx) => byIdOrIdx.get(idx)!);
  const currentRecords = allRecords.filter((r) => r.isCurrent !== false && r.status !== 'Healthy');
  const historicalRecords = allRecords.filter((r) => r.isCurrent === false && r.status !== 'Healthy');

  const isMissing = currentRecords.some((r) => r.status === 'Missing');
  const hasExtraction = currentRecords.some((r) => r.status === 'Extraction');

  if (isMissing) {
    for (const s of CANONICAL_SURFACES) {
      surfaceStatus[s] = 'Missing';
    }
  } else {
    for (const s of CANONICAL_SURFACES) {
      const colorInfo = getSurfaceZoneColor(s, currentRecords, false);
      surfaceStatus[s] = colorInfo.status || 'Healthy';
    }
  }

  return {
    surfaceStatus,
    isMissing,
    hasExtraction,
    dominantStatus: getDominantToothStatus(currentRecords.length > 0 ? currentRecords : allRecords),
    currentRecords,
    historicalRecords,
    allRecords,
  };
}

export function canApplyConditionToTooth(
  existingRecords: DentalToothRecord[],
  targetStatus: ToothStatus
): { allowed: boolean; reason?: string } {
  const activeRecords = (existingRecords || []).filter((r) => r.isCurrent !== false);
  const isCurrentlyMissing = activeRecords.some((r) => r.status === 'Missing');
  if (isCurrentlyMissing && targetStatus !== 'Healthy' && targetStatus !== 'Missing') {
    return {
      allowed: false,
      reason: 'Cannot record conditions on a missing tooth. Reset to Healthy first.',
    };
  }
  return { allowed: true };
}

export function applyStagedConditionToTooth(
  existingRecords: DentalToothRecord[],
  staged: {
    id?: string;
    toothNumber: number;
    status: ToothStatus;
    surface?: string | null;
    notes?: string | null;
    recordedBy?: string | null;
    consultationId?: string | null;
    createdAt?: string;
  }
): DentalToothRecord[] {
  if (staged.status === 'Healthy') {
    return [];
  }

  const check = canApplyConditionToTooth(existingRecords, staged.status);
  if (!check.allowed) {
    return existingRecords;
  }

  const nowIso = staged.createdAt || new Date().toISOString();
  const normalizedSurface =
    staged.status === 'Missing' || staged.status === 'Extraction'
      ? ''
      : staged.status === 'Crown'
        ? sortToothSurfaces(staged.surface || 'MODBL')
        : sortToothSurfaces(staged.surface || 'O');

  const working = (existingRecords || [])
    .filter((r) => r.status !== 'Healthy')
    .map((r) => ({
      ...r,
      surface: r.surface ? sortToothSurfaces(r.surface) : '',
      activeSurface:
        r.activeSurface !== undefined && r.activeSurface !== null
          ? sortToothSurfaces(r.activeSurface)
          : r.surface
            ? sortToothSurfaces(r.surface)
            : '',
      isCurrent: r.isCurrent !== undefined ? r.isCurrent : true,
    }));

  const newRecordId =
    staged.id || `cond-${staged.toothNumber}-${staged.status.toLowerCase()}-${Date.now()}`;

  if (staged.status === 'Missing') {
    for (const prior of working) {
      if (prior.isCurrent !== false) {
        prior.isCurrent = false;
        prior.activeSurface = '';
        prior.supersededAt = nowIso;
        prior.supersededByRecordId = newRecordId;
      }
    }
    const existingMissing = working.find((r) => r.status === 'Missing' && r.id === newRecordId);
    if (existingMissing) {
      existingMissing.isCurrent = true;
      existingMissing.notes = staged.notes ?? existingMissing.notes;
      existingMissing.updatedAt = nowIso;
      return working;
    }
    working.push({
      id: newRecordId,
      toothNumber: staged.toothNumber,
      status: 'Missing',
      surface: '',
      activeSurface: '',
      isCurrent: true,
      notes: staged.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
      recordedBy: staged.recordedBy || 'Attending Clinician',
      consultationId: staged.consultationId || null,
    });
    return working;
  }

  if (staged.status === 'Extraction') {
    const existingExt = working.find((r) => r.status === 'Extraction' && r.isCurrent !== false);
    if (existingExt) {
      existingExt.notes = staged.notes ?? existingExt.notes;
      existingExt.updatedAt = nowIso;
      existingExt.recordedBy = staged.recordedBy || existingExt.recordedBy;
      return working;
    }
    working.push({
      id: newRecordId,
      toothNumber: staged.toothNumber,
      status: 'Extraction',
      surface: '',
      activeSurface: '',
      isCurrent: true,
      notes: staged.notes || '',
      createdAt: nowIso,
      updatedAt: nowIso,
      recordedBy: staged.recordedBy || 'Attending Clinician',
      consultationId: staged.consultationId || null,
    });
    return working;
  }

  // Surface-bearing statuses: Decay, Filled, Crown
  for (const prior of working) {
    if (prior.isCurrent === false) continue;
    if (prior.status === staged.status) continue;
    if (prior.status !== 'Decay' && prior.status !== 'Filled' && prior.status !== 'Crown') {
      continue;
    }
    const priorActive =
      prior.activeSurface !== undefined && prior.activeSurface !== null
        ? prior.activeSurface
        : prior.surface || (prior.status === 'Crown' ? 'MODBL' : '');
    const remaining = subtractToothSurfaces(priorActive, normalizedSurface);
    if (remaining !== priorActive) {
      prior.activeSurface = remaining;
      prior.updatedAt = nowIso;
      if (remaining.length === 0) {
        prior.isCurrent = false;
        prior.supersededAt = nowIso;
        prior.supersededByRecordId = newRecordId;
      }
    }
  }

  const sameStatusActive = working.find(
    (r) => r.status === staged.status && r.isCurrent !== false
  );
  if (sameStatusActive) {
    const mergedActive = sortToothSurfaces(
      `${sameStatusActive.activeSurface ?? sameStatusActive.surface ?? ''}${normalizedSurface}`
    );
    const mergedHistorical = sortToothSurfaces(
      `${sameStatusActive.surface ?? ''}${normalizedSurface}`
    );
    sameStatusActive.surface = mergedHistorical;
    sameStatusActive.activeSurface = mergedActive;
    sameStatusActive.notes = staged.notes ?? sameStatusActive.notes;
    sameStatusActive.updatedAt = nowIso;
    sameStatusActive.recordedBy = staged.recordedBy || sameStatusActive.recordedBy;
    return working;
  }

  working.push({
    id: newRecordId,
    toothNumber: staged.toothNumber,
    status: staged.status,
    surface: normalizedSurface,
    activeSurface: normalizedSurface,
    isCurrent: true,
    notes: staged.notes || '',
    createdAt: nowIso,
    updatedAt: nowIso,
    recordedBy: staged.recordedBy || 'Attending Clinician',
    consultationId: staged.consultationId || null,
  });

  return working;
}

export function getDominantToothStatus(records: DentalToothRecord[]): ToothStatus {
  if (!records || records.length === 0) return 'Healthy';
  const active = records.filter((r) => r.isCurrent !== false);
  const target = active.length > 0 ? active : records;
  const statuses = new Set(target.map((r) => r.status));
  if (statuses.has('Missing')) return 'Missing';
  if (statuses.has('Decay')) return 'Decay';
  if (statuses.has('Extraction')) return 'Extraction';
  if (statuses.has('Crown')) return 'Crown';
  if (statuses.has('Filled')) return 'Filled';
  return 'Healthy';
}

export function getConditionDotColor(status: ToothStatus): string {
  switch (status) {
    case 'Decay':
      return theme.colors.emergency;
    case 'Filled':
      return theme.colors.info;
    case 'Crown':
      return theme.colors.purple;
    case 'Missing':
      return theme.colors.textMuted;
    case 'Extraction':
      return theme.colors.emergencyText;
    case 'Healthy':
    default:
      return theme.colors.success;
  }
}

export function getSurfaceZoneColor(
  surface: ToothSurfaceCode,
  conditions?: Array<{
    status: ToothStatus;
    surface?: string | null;
    activeSurface?: string | null;
    isCurrent?: boolean;
  }>,
  isSelected: boolean = false,
  stagedStatus?: ToothStatus
): { bg: string; border: string; text: string; status?: ToothStatus } {
  if (isSelected) {
    if (stagedStatus === 'Decay') {
      return {
        bg: theme.colors.emergencyBg,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
        status: 'Decay',
      };
    }
    if (stagedStatus === 'Filled') {
      return {
        bg: theme.colors.infoBg,
        border: theme.colors.infoBorder,
        text: theme.colors.infoText,
        status: 'Filled',
      };
    }
    if (stagedStatus === 'Crown') {
      return {
        bg: theme.colors.purpleBg,
        border: theme.colors.purpleBorder,
        text: theme.colors.purpleText,
        status: 'Crown',
      };
    }
    return {
      bg: theme.colors.primaryLight,
      border: theme.colors.focusRing,
      text: theme.colors.primaryDark,
    };
  }

  const activeConditions = (conditions || []).filter((c) => c.isCurrent !== false);
  if (activeConditions.length === 0) {
    return {
      bg: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.textSecondary,
    };
  }

  // Check specific active surface match first (preferring latest/highest-priority match)
  const specificMatch = activeConditions.find((c) => {
    const effSurface =
      c.activeSurface !== undefined && c.activeSurface !== null ? c.activeSurface : c.surface;
    const s = (effSurface || '').toUpperCase();
    return s.includes(surface);
  });

  // If no surface-specific match, check whole-tooth condition (empty surface, and not superseded)
  const condition =
    specificMatch ||
    activeConditions.find((c) => {
      const effSurface =
        c.activeSurface !== undefined && c.activeSurface !== null ? c.activeSurface : c.surface;
      return (!effSurface || effSurface.trim() === '') && (!c.surface || c.surface.trim() === '');
    });

  if (!condition) {
    return {
      bg: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.textSecondary,
    };
  }

  switch (condition.status) {
    case 'Decay':
      return {
        bg: theme.colors.emergencyBg,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
        status: 'Decay',
      };
    case 'Filled':
      return {
        bg: theme.colors.infoBg,
        border: theme.colors.infoBorder,
        text: theme.colors.infoText,
        status: 'Filled',
      };
    case 'Crown':
      return {
        bg: theme.colors.purpleBg,
        border: theme.colors.purpleBorder,
        text: theme.colors.purpleText,
        status: 'Crown',
      };
    case 'Missing':
      return {
        bg: theme.colors.surfaceSubtle,
        border: theme.colors.borderDark,
        text: theme.colors.textMuted,
        status: 'Missing',
      };
    case 'Extraction':
      return {
        bg: theme.colors.emergencySubtle,
        border: theme.colors.emergencyBorder,
        text: theme.colors.emergencyText,
        status: 'Extraction',
      };
    case 'Healthy':
    default:
      return {
        bg: theme.colors.surface,
        border: theme.colors.border,
        text: theme.colors.textSecondary,
        status: 'Healthy',
      };
  }
}

export interface DmftCalculationResult {
  totalCharted: number;
  decayedCount: number;
  missingCount: number;
  filledCount: number;
  crownCount: number;
  extractionCount: number;
  healthyCount: number;
  dmftScore: number;
}

export function calculateDmftMetrics(
  data: DentalToothRecord[] | Record<number, DentalToothRecord[]>
): DmftCalculationResult {
  const map: Record<number, DentalToothRecord[]> = Array.isArray(data)
    ? normalizeTeethToMultiRecord(data)
    : data;

  const decayedTeeth = new Set<number>();
  const missingTeeth = new Set<number>();
  const filledTeeth = new Set<number>();
  const crownTeeth = new Set<number>();
  const extractionTeeth = new Set<number>();
  const healthyTeeth = new Set<number>();
  const dmftTeeth = new Set<number>();

  for (const [numStr, records] of Object.entries(map)) {
    const num = Number(numStr);
    const activeRecords = records.filter((r) => r.isCurrent !== false);
    if (activeRecords.length === 0) continue;
    const statuses = new Set(activeRecords.map((r) => r.status));

    if (statuses.has('Decay')) decayedTeeth.add(num);
    if (statuses.has('Missing')) missingTeeth.add(num);
    if (statuses.has('Filled')) filledTeeth.add(num);
    if (statuses.has('Crown')) crownTeeth.add(num);
    if (statuses.has('Extraction')) extractionTeeth.add(num);

    // DMFT standard: distinct teeth with Decay, Missing, or Filled
    if (statuses.has('Decay') || statuses.has('Missing') || statuses.has('Filled')) {
      dmftTeeth.add(num);
    }

    if (statuses.size === 1 && statuses.has('Healthy')) {
      healthyTeeth.add(num);
    }
  }

  const activeToothCount = Object.values(map).filter((recs) =>
    recs.some((r) => r.isCurrent !== false)
  ).length;

  return {
    totalCharted: activeToothCount,
    decayedCount: decayedTeeth.size,
    missingCount: missingTeeth.size,
    filledCount: filledTeeth.size,
    crownCount: crownTeeth.size,
    extractionCount: extractionTeeth.size,
    healthyCount: healthyTeeth.size,
    dmftScore: dmftTeeth.size,
  };
}
