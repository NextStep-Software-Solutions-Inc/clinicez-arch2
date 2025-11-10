import type { PatientWithBasicInfo } from "../actions/patient.action";
import type { PatientSummary } from "../types/patient";

/**
 * Calculate age from date of birth string
 * @param dateOfBirth - Date string in YYYY-MM-DD format
 * @returns Age in years
 */
function calculateAge(dateOfBirth: string | null): number {
  if (!dateOfBirth) return 0;

  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Format gender from database enum to display format
 */
function formatGender(gender: "MALE" | "FEMALE" | null): string {
  if (!gender) return "Unknown";
  return gender.toLowerCase();
}

/**
 * Transform database patient record to PatientSummary format
 * 
 * @param dbPatient - Patient data from database
 * @returns PatientSummary object for UI display
 */
export function transformToPatientSummary(dbPatient: PatientWithBasicInfo): PatientSummary {
  const fullName = [
    dbPatient.firstName,
    dbPatient.middleName,
    dbPatient.lastName,
    dbPatient.suffix,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: parseInt(dbPatient.id.slice(0, 8), 16), // Convert UUID prefix to number for compatibility
    name: fullName,
    profile: null,
    age: calculateAge(dbPatient.dateOfBirth),
    gender: formatGender(dbPatient.gender),
    hp: null, // TODO: Join with healthcare provider when available
    diagnosis: null, // TODO: Join with diagnosis when available
    lastVisit: dbPatient.createdAt || new Date().toISOString().split("T")[0],
    nextAppointment: null, // TODO: Join with appointments when available
  };
}

/**
 * Transform array of database patients to PatientSummary array
 * 
 * @param dbPatients - Array of patient data from database
 * @returns Array of PatientSummary objects
 */
export function transformPatientsToSummaries(
  dbPatients: PatientWithBasicInfo[]
): PatientSummary[] {
  return dbPatients.map(transformToPatientSummary);
}
