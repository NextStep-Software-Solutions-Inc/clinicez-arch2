/**
 * Healthcare Provider Type Definitions
 * 
 * Comprehensive type definitions for healthcare provider data structures.
 * These types ensure type safety across the application when working with
 * healthcare provider information.
 */

/**
 * Role types for healthcare providers
 */
export type HealthcareProviderRole =
  | "doctor"
  | "nurse"
  | "physician_assistant"
  | "medical_technologist"
  | "therapist"
  | "administrative_staff";

/**
 * Field of study/specialization types
 */
export type FieldOfStudy =
  | "general_medicine"
  | "pediatrics"
  | "internal_medicine"
  | "surgery"
  | "nursing"
  | "physical_therapy"
  | "radiology"
  | "pharmacy";

/**
 * Gender types
 */
export type Gender = "male" | "female" | "other";

/**
 * Civil status types
 */
export type CivilStatus = "single" | "married" | "divorced" | "widowed" | "separated";

/**
 * Blood type options
 */
export type BloodType =
  | "a_positive"
  | "a_negative"
  | "b_positive"
  | "b_negative"
  | "o_positive"
  | "o_negative"
  | "ab_positive"
  | "ab_negative";

/**
 * Religion types
 */
export type Religion =
  | "christianity"
  | "islam"
  | "hinduism"
  | "buddhism"
  | "judaism"
  | "other"
  | "prefer_not_to_say";

/**
 * Basic information about a healthcare provider
 */
export type HealthcareProviderBasicInfo = {
  firstName: string;
  lastName: string;
  fullName?: string;
  suffix?: string;
  nickname?: string;
  countryCode: string;
  mobile: string;
};

/**
 * Personal details of a healthcare provider
 */
export type HealthcareProviderPersonalDetails = {
  gender: Gender;
  civilStatus: CivilStatus;
  religion: Religion;
  nationality: string;
  dateOfBirth: Date;
  bloodType: BloodType;
};

/**
 * Professional credentials and clinic information
 */
export type HealthcareProviderCredentials = {
  clinic: string;
  role: HealthcareProviderRole;
  licenseNumber: string;
  issuedDate: Date;
  expiryDate: Date;
  ptrNumber: string;
  tinNumber: string;
  fieldOfStudy?: FieldOfStudy;
};

/**
 * Complete healthcare provider profile
 */
export type HealthcareProviderProfile = {
  id: string;
  basicInfo: HealthcareProviderBasicInfo;
  personalDetails: HealthcareProviderPersonalDetails;
  credentials: HealthcareProviderCredentials;
  email: string;
  imageUrl?: string | null;
  isVerified?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

/**
 * Healthcare provider statistics
 */
export type HealthcareProviderStats = {
  yearsOfExperience: number;
  totalPatients: number;
  appointmentsToday?: number;
  pendingAppointments?: number;
};

/**
 * Display-friendly labels for enums
 */
export const HealthcareProviderRoleLabels: Record<HealthcareProviderRole, string> = {
  doctor: "Doctor",
  nurse: "Nurse",
  physician_assistant: "Physician Assistant",
  medical_technologist: "Medical Technologist",
  therapist: "Therapist",
  administrative_staff: "Administrative Staff",
};

export const FieldOfStudyLabels: Record<FieldOfStudy, string> = {
  general_medicine: "General Medicine",
  pediatrics: "Pediatrics",
  internal_medicine: "Internal Medicine",
  surgery: "Surgery",
  nursing: "Nursing",
  physical_therapy: "Physical Therapy",
  radiology: "Radiology",
  pharmacy: "Pharmacy",
};

export const BloodTypeLabels: Record<BloodType, string> = {
  a_positive: "A+",
  a_negative: "A-",
  b_positive: "B+",
  b_negative: "B-",
  o_positive: "O+",
  o_negative: "O-",
  ab_positive: "AB+",
  ab_negative: "AB-",
};

export const GenderLabels: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const CivilStatusLabels: Record<CivilStatus, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Separated",
};

export const ReligionLabels: Record<Religion, string> = {
  christianity: "Christianity",
  islam: "Islam",
  hinduism: "Hinduism",
  buddhism: "Buddhism",
  judaism: "Judaism",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};
