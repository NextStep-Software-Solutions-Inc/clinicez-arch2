import { api, ApiError } from './apiClient';

// ── Base types mirroring PatientApp.Application.Common.DTOs.PatientDtos ──────

export interface PatientSummary {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    sex: string | null;
    dateOfBirth: string | null;           // YYYY-MM-DD
    placeOfBirth: string | null;
    bloodType: string | null;
    civilStatus: string | null;
    nationality: string | null;
    ethnicity: string | null;
    religion: string | null;
    primaryLanguage: string | null;
    educationLevel: string | null;
    mobile: string | null;
    altPhone: string | null;
    email: string | null;
    messengerHandle: string | null;
    avatarUrl: string | null;
    consentToShareInfo: boolean;
}

// ── Sub-entity types ──────────────────────────────────────────────────────────

export interface GovernmentIdItem { id: string; clientId: string; idType: string; idNumber: string; issuedAt: string | null; expiresAt: string | null; updatedAt: string | null }
export interface AddressItem { id: string; clientId: string; type: string; street: string | null; barangay: string | null; city: string | null; province: string | null; zipCode: string | null; country: string | null; isPrimary: boolean; updatedAt: string | null }
export interface EmergencyContactItem { id: string; clientId: string; fullName: string; relationship: string | null; mobile: string | null; altPhone: string | null; isPrimary: boolean; updatedAt: string | null }
export interface HealthcareProviderItem { id: string; clientId: string; providerType: string; name: string | null; specialty: string | null; clinicHospital: string | null; phone: string | null; updatedAt: string | null }
export interface AllergyItem { id: string; clientId: string; allergenName: string; allergyType: string; severity: string; reaction: string | null; onsetDate: string | null; notes: string | null; updatedAt: string | null }
export interface MedicationItem { id: string; clientId: string; medicationName: string; genericName: string | null; dosage: string | null; frequency: string | null; route: string | null; startDate: string | null; endDate: string | null; isCurrentlyTaking: boolean; prescribedBy: string | null; purpose: string | null; notes: string | null; updatedAt: string | null }
export interface SurgicalHistoryItem { id: string; clientId: string; procedureName: string; surgeonName: string | null; hospital: string | null; surgeryDate: string | null; anesthesiaType: string | null; complications: string | null; notes: string | null; updatedAt: string | null }
export interface PastIllnessItem { id: string; clientId: string; illnessName: string; diagnosedAt: string | null; resolvedAt: string | null; treatmentReceived: string | null; notes: string | null; updatedAt: string | null }
export interface ChronicConditionItem { id: string; clientId: string; conditionName: string; diagnosedAt: string | null; isControlled: boolean; treatmentNotes: string | null; currentMedications: string | null; updatedAt: string | null }
export interface FamilyHistoryItem { id: string; clientId: string; relation: string; conditionName: string; ageOfOnset: number | null; isDeceased: boolean; notes: string | null; updatedAt: string | null }
export interface ImmunizationSelfItem { id: string; clientId: string; immunizationCategory: string | null; vaccineName: string; doseNumber: string | null; lotNumber: string | null; date: string | null; administeredBy: string | null; updatedAt: string | null }
export interface DisabilityItem { id: string; clientId: string; bodyPart: string | null; classification: string | null; isPwdCertified: boolean; updatedAt: string | null }
export interface TravelHistoryItem { id: string; clientId: string; destination: string; cityProvince: string | null; departureDate: string | null; returnDate: string | null; purpose: string | null; illnessDuringAfterTravel: string | null; updatedAt: string | null }
export interface ContraceptiveHistoryItem { id: string; clientId: string; method: string; isCurrent: boolean; dateStarted: string | null; reasonForStopping: string | null; updatedAt: string | null }
export interface PregnancyItem { id: string; clientId: string; year: number | null; outcome: string | null; gestationalAgeWeeks: number | null; deliveryType: string | null; birthWeightKg: number | null; complications: string | null; facility: string | null; updatedAt: string | null }
export interface SocialHistoryItem { id: string; clientId: string; smokingStatus: string | null; cigsPerDay: number | null; packYears: number | null; quitDate: string | null; otherTobaccoProducts: string | null; alcoholUse: string | null; alcoholType: string | null; alcoholFrequencyDaysPerWeek: number | null; alcoholQuantityPerOccasion: number | null; usesSubstances: boolean; substanceName: string | null; substanceRoute: string | null; substanceFrequency: string | null; activityLevel: string | null; exerciseType: string | null; exerciseFrequencyDaysPerWeek: number | null; dietPattern: string | null; foodRestrictions: string | null; sleepAvgHours: number | null; sleepQuality: string | null; isSexuallyActive: boolean | null; waterIntake: string | null; occupationalHazards: string | null; updatedAt: string | null }
export interface OccupationItem { id: string; clientId: string; occupation: string | null; employer: string | null; industry: string | null; workEnvironment: string | null; yearsInOccupation: number | null; hazardExposure: string | null; updatedAt: string | null }
export interface ObstetricProfileItem { id: string; clientId: string; gravida: number | null; para: number | null; abortusCount: number | null; livingChildren: number | null; lastMenstrualPeriod: string | null; menarche: string | null; isPregnant: boolean; menstrualCycleLengthDays: number | null; hasDysmenorrhea: boolean; notes: string | null; updatedAt: string | null }
export interface MaleReproductiveItem { id: string; clientId: string; hasVasectomy: boolean; vasectomyDate: string | null; conditions: string | null; updatedAt: string | null }
export interface DentalVisionItem { id: string; clientId: string; dentistName: string | null; dentistClinic: string | null; orthodonticDevice: string | null; eyeDoctorName: string | null; correctiveLenses: string | null; updatedAt: string | null }
export interface MentalHealthProfileItem { id: string; clientId: string; hasDiagnosis: boolean; diagnosisName: string | null; isOnMedication: boolean; medicationName: string | null; therapistName: string | null; therapyType: string | null; sessionFrequency: string | null; notes: string | null; updatedAt: string | null }

// ── Full record (all 22 ISyncable categories) ─────────────────────────────────

export interface PatientFullRecord {
    demographics: PatientSummary;
    governmentIds: GovernmentIdItem[];
    addresses: AddressItem[];
    emergencyContacts: EmergencyContactItem[];
    healthcareProviders: HealthcareProviderItem[];
    allergies: AllergyItem[];
    medications: MedicationItem[];
    surgicalHistories: SurgicalHistoryItem[];
    pastIllnesses: PastIllnessItem[];
    chronicConditions: ChronicConditionItem[];
    familyHistories: FamilyHistoryItem[];
    immunizationsSelf: ImmunizationSelfItem[];
    disabilities: DisabilityItem[];
    travelHistories: TravelHistoryItem[];
    contraceptiveHistories: ContraceptiveHistoryItem[];
    pregnancies: PregnancyItem[];
    socialHistory: SocialHistoryItem | null;
    occupation: OccupationItem | null;
    obstetricProfile: ObstetricProfileItem | null;
    maleReproductive: MaleReproductiveItem | null;
    dentalVision: DentalVisionItem | null;
    mentalHealthProfile: MentalHealthProfileItem | null;
}

// ── Sync types ────────────────────────────────────────────────────────────────

export interface SyncItemRequest {
    /** Unique ID for this sync transmission — used for server-side idempotency. */
    idempotencyKey: string;
    entityType: string;
    /** "create" | "update" | "delete" */
    operation: string;
    /** ISO-8601 UTC */
    clientTimestamp: string;
    payloadJson: string | null;
    entityId?: string;
}

export interface PushSyncAck {
    accepted: number;
    alreadyProcessed: number;
    acknowledgedAt: string;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Looks up a patient profile by Clerk user ID.
 * Returns null on 404 — used to detect first sign-in.
 */
export async function getPatientByClerkId(
    getToken: () => Promise<string | null>,
    clerkUserId: string,
): Promise<PatientSummary | null> {
    try {
        return await api.get<PatientSummary>(getToken, `/patients/by-clerk/${clerkUserId}`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

/**
 * Creates a new patient profile on first sign-in.
 * Returns the server-assigned patient UUID.
 */
export async function createPatient(
    getToken: () => Promise<string | null>,
    payload: {
        clerkUserId: string;
        firstName: string;
        middleName?: string | null;
        lastName: string;
        suffix?: string | null;
        sex?: string | null;
        dateOfBirth?: string | null;
        nationality?: string | null;
    },
): Promise<string> {
    return api.post<string>(getToken, '/patients', payload);
}

/**
 * Pushes queued offline changes to the backend.
 * The backend is idempotent — duplicate idempotencyKeys are counted as alreadyProcessed.
 */
export async function pushSyncPayload(
    getToken: () => Promise<string | null>,
    patientId: string,
    items: SyncItemRequest[],
): Promise<PushSyncAck> {
    return api.post<PushSyncAck>(getToken, `/patients/${patientId}/sync`, { items });
}

/**
 * Returns the backend sync log summary for a patient.
 * Useful for debugging stuck sync items.
 */
export async function getSyncStatus(
    getToken: () => Promise<string | null>,
    patientId: string,
    take = 50,
): Promise<unknown> {
    return api.get(getToken, `/patients/${patientId}/sync/status?take=${take}`);
}

/**
 * Returns the complete patient record across all 22 ISyncable entity categories.
 *
 * Use this on first install (or re-install) to hydrate the local SQLite database
 * from the server state. After the initial hydration, use the sync queue for
 * incremental updates.
 */
export async function getPatientFullRecord(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<PatientFullRecord> {
    return api.get<PatientFullRecord>(getToken, `/patients/${patientId}/full-record`);
}

export interface PatientProfile {
    demographics: PatientSummary;
    addresses: AddressItem[];
    emergencyContacts: EmergencyContactItem[];
}

/**
 * Returns a slim demographic profile summary including the patient ID,
 * basic contact details, addresses, and emergency contacts.
 */
export async function getPatientProfile(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<PatientProfile> {
    return api.get<PatientProfile>(getToken, `/patients/${patientId}`);
}

export interface UpdatePatientDemographicsPayload {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
    sex?: string | null;
    dateOfBirth?: string | null; // YYYY-MM-DD
    placeOfBirth?: string | null;
    civilStatus?: string | null;
    bloodType?: string | null;
    nationality?: string | null;
    ethnicity?: string | null;
    religion?: string | null;
    primaryLanguage?: string | null;
    educationLevel?: string | null;
    mobile?: string | null;
    altPhone?: string | null;
    email?: string | null;
    messengerHandle?: string | null;
    consentToShareInfo?: boolean;
}

/**
 * Direct update to patient demographics (PUT /patients/{id}/demographics).
 * Updates synchronous backend state immediately.
 */
export async function updatePatientDemographics(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: UpdatePatientDemographicsPayload,
): Promise<void> {
    return api.put<void>(getToken, `/patients/${patientId}/demographics`, payload);
}
