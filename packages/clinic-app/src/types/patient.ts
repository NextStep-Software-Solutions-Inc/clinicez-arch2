import type { PersonalDetails } from "./personal-details";

export type Diagnosis = {
  id: number;
  code?: string | null; // ICD-10 code
  name: string;
  description?: string | null;
};

export type PatientSummary = {
  id: number;
  name: string;
  profile?: {
    uri: string;
    alt?: string;
  } | null;
  age: number;
  gender: string;
  hp?: {
    name: string;
    specialization?: string;
  } | null;
  diagnosis?: Diagnosis | null
  lastVisit: string;
  nextAppointment?: string | null;
};

export type VitalRecord = {
  createdAt: string;
  temperature: number;
  bloodPressure: string;
  heartRate: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  height: number;
  weight: number;
  bmi: number;
};

export type Medications = {
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate?: string | null;
  prescribingDoctor?: string | null;
};

export type ConsultationHistory = {
  id: number;
  diagnosis: Diagnosis;
  // Healthcare Provider or Doctor
  hp: {
    prefix?: string | null;
    name: string;
    specialization?: string;
  };
  chiefComplaint: string;
  createdAt: string;
}

export type DiagnosisHistory = {
  id: number;
  diagnosis: Diagnosis;
  // Healthcare Provider or Doctor
  hp: {
    prefix?: string | null;
    name: string;
    // no need for specialization
  };
  createdAt: string;
}

export type VaccinationRecord = {
  id: number;
  vaccineName: string;
  dateAdministered: string;
  // Is this the 1st dose, 2nd dose, booster, etc.
  doseNumber?: string | null;
  administeredBy?: string | null;
};

export type LaboratoryRequest = {
  id: number;
  testName: string;
  requestedAt: string;
  // Healthcare Provider or Doctor
  requestedBy: {
    prefix?: string | null;
    name: string;
    postfix?: string | null;
  };
};

export type ImagingRequest = {
  id: number;
  imagingType: string;
  requestedAt: string;
  // Healthcare Provider or Doctor
  requestedBy: {
    prefix?: string | null;
    name: string;
    postfix?: string | null;
  };
};

export type Disability = {
  id: number;
  type: string;
  description?: string | null;
};

export type PrescriptionHistory = {
  id: number;
  medicationName: string;
  dosage: string;
  frequency: string;
  createdAt: string;
  // Healthcare Provider or Doctor
  hp: {
    prefix?: string | null;
    name: string;
    postfix?: string | null;
  };
};

export type FamilyHistory = {
  id: number;
  relation: string; // e.g., Father, Mother, Sibling
  condition: string; // e.g., Diabetes, Hypertension
  notes?: string | null;
};

export type PatientBilling = {
  id: number;
  service: string;
  amount: number;
  currency: string; // e.g., "PHP", "USD"
  createdAt: string;
  // Healthcare Provider or Doctor who provided the service
  hp: {
    prefix?: string | null;
    name: string;
    postfix?: string | null;
  };
  status?: "paid" | "pending" | "overdue" | null;
};

export type EmergencyContact = {
  id: number;
  name: string;
  relation: string;
  phone: string;
  email?: string | null;
  address?: string | null;
};

// In the collapsible, the laboratory and imaging request should be in one section
// called "Lab & Imaging Requests"
export type LabImagingRequest = LaboratoryRequest | ImagingRequest;
export type PatientProfile = PersonalDetails & {
  allergy?: {
    id: number;
    name: string;
  }[];
  medication?: Medications[];
  vitalSigns?: VitalRecord[];
  consultationHistory?: ConsultationHistory[];
  diagnosisHistory?: DiagnosisHistory[];
  vaccinationRecords?: VaccinationRecord[];
  labImagingRequests?: LabImagingRequest[];
  disabilities?: Disability[];
  prescriptionHistory?: PrescriptionHistory[];
  familyHistory?: FamilyHistory[];
  billingHistory?: PatientBilling[];
  emergencyContacts?: EmergencyContact[];
};
