import type { PatientWithBasicInfo } from "../actions/patient.action";
import type { PatientSummary, PatientProfile } from "../types/patient";
import type { BloodType } from "../types/personal-details";
import { calculateAge } from "../utils/date-helpers";

export function transformToPatientSummary(dbPatient: PatientWithBasicInfo): PatientSummary {
  const age = dbPatient.dateOfBirth ? calculateAge(new Date(dbPatient.dateOfBirth)) : 0;

  return {
    id: dbPatient.id,
    name: `${dbPatient.firstName} ${dbPatient.lastName}`,
    age,
    gender: dbPatient.gender?.toLowerCase() || "Unknown",
    lastVisit: dbPatient.updatedAt || dbPatient.createdAt || new Date().toISOString(),
    nextAppointment: null,
  };
}

export function transformPatientsToSummaries(dbPatients: PatientWithBasicInfo[]): PatientSummary[] {
  return dbPatients.map(transformToPatientSummary);
}

export function transformPatientToProfile(dbPatient: PatientWithBasicInfo): PatientProfile {
  const bloodTypeMap: Record<string, BloodType> = {
    "A+": "a_positive", "A-": "a_negative",
    "B+": "b_positive", "B-": "b_negative",
    "O+": "o_positive", "O-": "o_negative",
    "AB+": "ab_positive", "AB-": "ab_negative",
  };

  return {
    id: parseInt(dbPatient.id.slice(0, 8), 16),
    userUid: dbPatient.id,
    firstName: dbPatient.firstName,
    middleName: dbPatient.middleName ?? undefined,
    lastName: dbPatient.lastName,
    suffix: dbPatient.suffix ?? undefined,
    imageUrl: undefined,
    profile: { imageUrl: undefined },
    name: {
      firstName: dbPatient.firstName,
      middleName: dbPatient.middleName ?? undefined,
      lastName: dbPatient.lastName,
      suffix: dbPatient.suffix ?? undefined,
    },
    gender: (dbPatient.gender?.toLowerCase() || "other") as "male" | "female" | "other",
    civilStatus: (dbPatient.civilStatus?.toLowerCase() || "single") as "single" | "married" | "divorced" | "widowed" | "separated",
    dateOfBirth: dbPatient.dateOfBirth || "",
    nationality: dbPatient.nationality || "",
    religion: dbPatient.religion || "",
    bloodType: (dbPatient.bloodType && bloodTypeMap[dbPatient.bloodType]) || "o_positive",
    contactInfo: {
      email: dbPatient.email || "",
      mobile: dbPatient.phoneNumber || "",
    },
    allergy: [],
    medication: [],
    vitalSigns: [],
    consultationHistory: [],
    diagnosisHistory: [],
    vaccinationRecords: [],
    labImagingRequests: [],
    disabilities: [],
    prescriptionHistory: [],
    familyHistory: [],
    billingHistory: [],
    emergencyContacts: [],
  };
}
