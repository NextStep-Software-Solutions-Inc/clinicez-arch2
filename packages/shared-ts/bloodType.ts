import type { EhrOptionDescriptor } from './options';

export type StandardBloodType =
  | 'A+'
  | 'A-'
  | 'B+'
  | 'B-'
  | 'AB+'
  | 'AB-'
  | 'O+'
  | 'O-'
  | 'Unknown'
  | string;

export interface BloodTypeMeta {
  value: string;
  label: string;
  antigen: string;
  rhFactor: string;
}

/**
 * Validates whether a string is a standard ABO/Rh blood type or Unknown.
 * Replaces static array lookup with pure regular expression validation.
 */
export function isStandardBloodType(val: unknown): val is StandardBloodType {
  if (typeof val !== 'string') return false;
  return /^(A|B|AB|O)[+-]$/.test(val) || val === 'Unknown';
}

/**
 * Generates blood type metadata dynamically from canonical label without static dictionaries.
 */
export function getBloodTypeMeta(val: string): BloodTypeMeta {
  const trimmed = val.trim();
  if (trimmed === 'Unknown' || !trimmed) {
    return { value: 'Unknown', label: 'Unknown / Untested', antigen: 'Unknown', rhFactor: 'Unknown' };
  }
  const isPositive = trimmed.endsWith('+');
  const antigen = trimmed.replace(/[+-]/g, '');
  return {
    value: trimmed,
    label: `${antigen} ${isPositive ? 'Positive' : 'Negative'} (${trimmed})`,
    antigen,
    rhFactor: isPositive ? 'Positive' : 'Negative',
  };
}

/**
 * Converts dynamic EhrOptionDescriptor or string into canonical blood type string.
 */
export function normalizeBloodTypeOption(option: EhrOptionDescriptor | string | null | undefined): string {
  if (!option) return 'Unknown';
  if (typeof option === 'string') return formatBloodTypeLabel(option) ?? option;
  return option.code || option.label || 'Unknown';
}

const BLOOD_TYPE_NORMALIZE_MAP: Record<string, string> = {
  APOSITIVE: 'A+',
  A_POSITIVE: 'A+',
  ANEGATIVE: 'A-',
  A_NEGATIVE: 'A-',
  BPOSITIVE: 'B+',
  B_POSITIVE: 'B+',
  BNEGATIVE: 'B-',
  B_NEGATIVE: 'B-',
  ABPOSITIVE: 'AB+',
  AB_POSITIVE: 'AB+',
  ABNEGATIVE: 'AB-',
  AB_NEGATIVE: 'AB-',
  OPOSITIVE: 'O+',
  O_POSITIVE: 'O+',
  ONEGATIVE: 'O-',
  O_NEGATIVE: 'O-',
  UNKNOWN: 'Unknown',
};

/**
 * Formats any raw blood type representation (C# enum name, static option code, or standard label)
 * into its canonical clinical display label (e.g., "AB-", "A+", "Unknown").
 */
export function formatBloodTypeLabel(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase();
  if (BLOOD_TYPE_NORMALIZE_MAP[upper]) {
    return BLOOD_TYPE_NORMALIZE_MAP[upper];
  }
  const condensed = upper.replace(/[\s_-]+/g, '');
  if (BLOOD_TYPE_NORMALIZE_MAP[condensed]) {
    return BLOOD_TYPE_NORMALIZE_MAP[condensed];
  }
  if (isStandardBloodType(trimmed)) {
    return trimmed;
  }
  return trimmed;
}

/**
 * Converts blood type metadata into an EhrOptionDescriptor.
 */
export function toBloodTypeOptionDescriptor(meta: BloodTypeMeta): EhrOptionDescriptor {
  return {
    code: meta.value,
    label: meta.label,
    philHealthCode: meta.value === 'Unknown' ? null : meta.value,
  };
}
