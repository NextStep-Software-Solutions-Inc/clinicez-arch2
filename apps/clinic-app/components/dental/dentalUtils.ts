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
  notes?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  recordedBy?: string | null;
}

export function sortToothSurfaces(surfaces: string | string[]): string {
  const set = new Set((Array.isArray(surfaces) ? surfaces.join('') : surfaces).toUpperCase().split(''));
  return CANONICAL_SURFACES.filter((s) => set.has(s)).join('');
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
    const rec: DentalToothRecord = {
      id: item.id || `temp-${num}-${status}-${map[num].length}`,
      tenantId: item.tenantId,
      clinicId: item.clinicId,
      patientId: item.patientId,
      consultationId: item.consultationId || null,
      toothNumber: num,
      status,
      surface: item.surface ? sortToothSurfaces(item.surface) : '',
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

export function getDominantToothStatus(records: DentalToothRecord[]): ToothStatus {
  if (!records || records.length === 0) return 'Healthy';
  const statuses = new Set(records.map((r) => r.status));
  if (statuses.has('Decay')) return 'Decay';
  if (statuses.has('Extraction')) return 'Extraction';
  if (statuses.has('Crown')) return 'Crown';
  if (statuses.has('Filled')) return 'Filled';
  if (statuses.has('Missing')) return 'Missing';
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
  conditions?: Array<{ status: ToothStatus; surface?: string | null }>,
  isSelected: boolean = false
): { bg: string; border: string; text: string; status?: ToothStatus } {
  if (isSelected) {
    return {
      bg: theme.colors.primaryLight,
      border: theme.colors.focusRing,
      text: theme.colors.primaryDark,
    };
  }

  if (!conditions || conditions.length === 0) {
    return {
      bg: theme.colors.surface,
      border: theme.colors.border,
      text: theme.colors.textSecondary,
    };
  }

  // Check specific surface match first
  const specificMatch = conditions.find((c) => {
    const s = (c.surface || '').toUpperCase();
    return s.includes(surface);
  });

  // If no surface-specific match, check whole-tooth condition (empty surface)
  const condition = specificMatch || conditions.find((c) => !c.surface || c.surface.trim() === '');

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
    const statuses = new Set(records.map((r) => r.status));

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

  return {
    totalCharted: Object.keys(map).length,
    decayedCount: decayedTeeth.size,
    missingCount: missingTeeth.size,
    filledCount: filledTeeth.size,
    crownCount: crownTeeth.size,
    extractionCount: extractionTeeth.size,
    healthyCount: healthyTeeth.size,
    dmftScore: dmftTeeth.size,
  };
}
