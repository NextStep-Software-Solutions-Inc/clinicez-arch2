// Gender options
export const Genders = ["Male", "Female", "Other", "Prefer not to say"] as const;
export type Gender = typeof Genders[number];

// Civil Status options
export const CivilStatuses = ["Single", "Married", "Divorced", "Widowed", "Separated"] as const;
export type CivilStatus = typeof CivilStatuses[number];

export const BloodTypes = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
] as const;
export type BloodType = typeof BloodTypes[number];
