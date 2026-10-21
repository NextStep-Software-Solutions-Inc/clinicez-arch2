import { type CustomFieldDefinition } from "@/lib/join";

export type { CustomFieldDefinition };

export interface PatientJoinAllergyItem {
  allergen: string;
  category: "Medication" | "Food" | "Environmental" | "Biologic" | "Other";
  severity: "Mild" | "Moderate" | "Severe" | "LifeThreatening";
  isAnaphylactic: boolean;
  allergenDrugCode?: string;
  reactionManifestation?: string;
  onsetDate?: string;
  notes?: string;
}

export interface PatientJoinAttachmentItem {
  id?: string;
  title?: string;
  fileName: string;
  fileType?: string;
  contentType?: string;
  storageKey?: string;
  storageUri?: string;
  category?: string;
  recordType?: string;
  fileSizeBytes: number;
  documentDate?: string;
  notes?: string;
}

export interface PatientJoinRequestedPayload {
  joinRequestId?: string;
  tenantSlug: string;
  facilitySlug: string;
  joinCode: string;

  // Demographics
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: "Male" | "Female" | "Other";
  civilStatus?: string;
  contactNumber: string;
  email?: string;
  address?: string;

  // Statutory PhilHealth & Welfare Identifiers
  philHealthPin?: string;
  memberType?: "MM" | "DD";
  principalMemberPin?: string;
  principalRelationship?: "C" | "S" | "P" | "D";
  principalFullName?: string;
  principalDateOfBirth?: string;
  seniorCitizenId?: string;
  pwdId?: string;

  // Clinical Context
  reasonForVisit?: string;

  // Dynamic Custom Metadata
  customFields?: Record<string, any>;

  // Structured Clinical Lists & External Attachments
  allergies?: PatientJoinAllergyItem[];
  attachments?: PatientJoinAttachmentItem[];

  // Bot Challenge Verification
  turnstileToken?: string;
}

export interface DigitalRegistrationPass {
  trackingId: string;
  registrationPassId: string;
  queueToken: string;
  patientCode: string;
  fullName: string;
  facilityName: string;
  facilitySlug: string;
  tenantSlug: string;
  estimatedWaitMinutes: number;
  issuedAt: string;
  qrDataString: string;
}

export interface SubmissionResponse {
  success: boolean;
  message?: string;
  trackingId?: string;
  data?: DigitalRegistrationPass;
}
