export type {
  StandardBloodType,
  BloodTypeMeta,
} from '@shared/safe';
export {
  isStandardBloodType,
  getBloodTypeMeta,
  normalizeBloodTypeOption,
  toBloodTypeOptionDescriptor,
} from '@shared/safe';

export interface BloodTypeOption {
  value: string;
  label: string;
  antigen: string;
  rhFactor: string;
}

/**
 * Dynamically partitions EhrOptionDescriptor items into positive and negative Rh groups.
 * Replaces hardcoded RH_POSITIVE_TYPES, RH_NEGATIVE_TYPES, and BLOOD_TYPE_OPTIONS.
 */
export function partitionBloodTypeOptions(options: Array<{ code: string; label: string }>) {
  const rhPositive = options.filter(
    (o) => o.code !== 'UNKNOWN' && (o.label.includes('+') || o.code.includes('POSITIVE'))
  );
  const rhNegative = options.filter(
    (o) => o.code !== 'UNKNOWN' && (o.label.includes('-') || o.code.includes('NEGATIVE'))
  );
  return { rhPositive, rhNegative };
}
