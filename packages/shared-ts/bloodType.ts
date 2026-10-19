export const STANDARD_BLOOD_TYPES = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Unknown',
] as const;

export type StandardBloodType = (typeof STANDARD_BLOOD_TYPES)[number];

export interface BloodTypeMeta {
  value: StandardBloodType;
  label: string;
  antigen: 'A' | 'B' | 'AB' | 'O' | 'Unknown';
  rhFactor: 'Positive' | 'Negative' | 'Unknown';
}

export const BLOOD_TYPE_METADATA: Record<StandardBloodType, BloodTypeMeta> = {
  'A+': { value: 'A+', label: 'A Positive (A+)', antigen: 'A', rhFactor: 'Positive' },
  'A-': { value: 'A-', label: 'A Negative (A-)', antigen: 'A', rhFactor: 'Negative' },
  'B+': { value: 'B+', label: 'B Positive (B+)', antigen: 'B', rhFactor: 'Positive' },
  'B-': { value: 'B-', label: 'B Negative (B-)', antigen: 'B', rhFactor: 'Negative' },
  'AB+': { value: 'AB+', label: 'AB Positive (AB+)', antigen: 'AB', rhFactor: 'Positive' },
  'AB-': { value: 'AB-', label: 'AB Negative (AB-)', antigen: 'AB', rhFactor: 'Negative' },
  'O+': { value: 'O+', label: 'O Positive (O+)', antigen: 'O', rhFactor: 'Positive' },
  'O-': { value: 'O-', label: 'O Negative (O-)', antigen: 'O', rhFactor: 'Negative' },
  'Unknown': { value: 'Unknown', label: 'Unknown / Untested', antigen: 'Unknown', rhFactor: 'Unknown' },
};

/**
 * Checks if a string value is a canonical StandardBloodType.
 */
export function isStandardBloodType(val: unknown): val is StandardBloodType {
  return typeof val === 'string' && (STANDARD_BLOOD_TYPES as readonly string[]).includes(val);
}
