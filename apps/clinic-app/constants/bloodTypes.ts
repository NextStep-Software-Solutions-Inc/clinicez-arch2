export {
  STANDARD_BLOOD_TYPES,
  type StandardBloodType,
  type BloodTypeMeta,
  BLOOD_TYPE_METADATA,
  isStandardBloodType,
} from '@shared/safe';

import {
  STANDARD_BLOOD_TYPES,
  StandardBloodType,
  BLOOD_TYPE_METADATA,
} from '@shared/safe';

export interface BloodTypeOption {
  value: StandardBloodType;
  label: string;
  antigen: string;
  rhFactor: string;
}

export const RH_POSITIVE_TYPES: readonly StandardBloodType[] = ['A+', 'B+', 'AB+', 'O+'];
export const RH_NEGATIVE_TYPES: readonly StandardBloodType[] = ['A-', 'B-', 'AB-', 'O-'];

export const BLOOD_TYPE_OPTIONS: readonly BloodTypeOption[] = STANDARD_BLOOD_TYPES.map(
  (bt) => ({
    value: bt,
    label: BLOOD_TYPE_METADATA[bt].label,
    antigen: BLOOD_TYPE_METADATA[bt].antigen,
    rhFactor: BLOOD_TYPE_METADATA[bt].rhFactor,
  })
);
