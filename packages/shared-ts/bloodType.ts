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
  if (typeof option === 'string') return option;
  return option.code || option.label || 'Unknown';
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
