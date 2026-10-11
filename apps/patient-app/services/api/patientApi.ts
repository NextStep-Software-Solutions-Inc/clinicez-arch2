import { api, ApiError } from './apiClient';
import type { SyncWireStatus } from './wireEnums';

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
export interface AddressItem {
    id: string;
    clientId: string;
    type: string;
    street: string | null;
    houseStreet?: string | null;
    barangay: string | null;
    city: string | null;
    cityMunicipality?: string | null;
    province: string | null;
    region?: string | null;
    zipCode: string | null;
    postalCode?: string | null;
    country: string | null;
    isPrimary: boolean;
    updatedAt: string | null;
}
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
    ncdQuestionnaire?: PatientNcdQuestionnaireDto | null;
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

export interface SyncItemResult {
    idempotencyKey: string;
    entityType: string;
    operation: string;
    clientId?: string | null;
    serverId?: string | null;
    status: SyncWireStatus;
    conflictDetail?: string | null;
}

export interface PushSyncAck {
    accepted: number;
    alreadyProcessed: number;
    applied?: number;
    conflicts?: number;
    rejected?: number;
    acknowledgedAt: string;
    items?: SyncItemResult[];
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

export const BLOOD_TYPE_TO_BACKEND: Record<string, string> = {
    'A+': 'APositive',
    'A-': 'ANegative',
    'B+': 'BPositive',
    'B-': 'BNegative',
    'AB+': 'ABPositive',
    'AB-': 'ABNegative',
    'O+': 'OPositive',
    'O-': 'ONegative',
    'Unknown': 'Unknown',
};

export const BACKEND_TO_BLOOD_TYPE: Record<string, string> = {
    APositive: 'A+',
    aPositive: 'A+',
    ANegative: 'A-',
    aNegative: 'A-',
    BPositive: 'B+',
    bPositive: 'B+',
    BNegative: 'B-',
    bNegative: 'B-',
    ABPositive: 'AB+',
    aBPositive: 'AB+',
    abPositive: 'AB+',
    ABNegative: 'AB-',
    aBNegative: 'AB-',
    abNegative: 'AB-',
    OPositive: 'O+',
    oPositive: 'O+',
    ONegative: 'O-',
    oNegative: 'O-',
    Unknown: 'Unknown',
    unknown: 'Unknown',
};

export function toBackendBloodType(val: string | null | undefined): string | null {
    if (!val) return null;
    return BLOOD_TYPE_TO_BACKEND[val] ?? val;
}

export function fromBackendBloodType(val: string | null | undefined): string | null {
    if (!val) return null;
    return BACKEND_TO_BLOOD_TYPE[val] ?? val;
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
    const backendPayload = {
        ...payload,
        bloodType: toBackendBloodType(payload.bloodType),
    };
    return api.put<void>(getToken, `/patients/${patientId}/demographics`, backendPayload);
}

// ── NCD Questionnaire (PhilHealth Yakap) ──────────────────────────────────────

export interface PatientNcdQuestionnaireDto {
    patientId: string;
    qid1Yn?: string | null;
    qid2Yn?: string | null;
    qid3Yn?: string | null;
    qid4Yn?: string | null;
    qid5Ynx?: string | null;
    qid6Yn?: string | null;
    qid7Yn?: string | null;
    qid8Yn?: string | null;
    qid9Yn?: string | null;
    qid10Yn?: string | null;
    qid11Yn?: string | null;
    qid12Yn?: string | null;
    qid13Yn?: string | null;
    qid14Yn?: string | null;
    qid15Yn?: string | null;
    qid16Yn?: string | null;
    qid17Abcde?: string | null;
    qid18Yn?: string | null;
    qid19Yn?: string | null;
    qid19FbsMgdl?: number | null;
    qid19FbsMmol?: number | null;
    qid19FbsDate?: string | null;
    qid20Yn?: string | null;
    qid20CholeVal?: number | null;
    qid20CholeDate?: string | null;
    qid21Yn?: string | null;
    qid21KetonVal?: number | null;
    qid21KetonDate?: string | null;
    qid22Yn?: string | null;
    qid22ProteinVal?: number | null;
    qid22ProteinDate?: string | null;
    qid23Yn?: string | null;
    qid24Yn?: string | null;
    syncedAt?: string | null;
}

export async function getNcdQuestionnaire(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<PatientNcdQuestionnaireDto | null> {
    try {
        return await api.get<PatientNcdQuestionnaireDto>(getToken, `/patients/${patientId}/yakap/ncd`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updateNcdQuestionnaire(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Omit<PatientNcdQuestionnaireDto, 'patientId' | 'syncedAt'>,
): Promise<PatientNcdQuestionnaireDto> {
    return api.put<PatientNcdQuestionnaireDto>(getToken, `/patients/${patientId}/yakap/ncd`, payload);
}

// ── Dedicated REST Profile Section Endpoints ─────────────────────────────────

export interface UpdateGovernmentIdInput {
    id?: string;
    clientId?: string;
    idType: string;
    idNumber: string;
    issuedAt?: string | null;
    expiresAt?: string | null;
}

export async function getPatientGovernmentIds(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<GovernmentIdItem[]> {
    return api.get<GovernmentIdItem[]>(getToken, `/patients/${patientId}/government-ids`);
}

export async function updatePatientGovernmentIds(
    getToken: () => Promise<string | null>,
    patientId: string,
    governmentIds: UpdateGovernmentIdInput[],
): Promise<GovernmentIdItem[]> {
    return api.put<GovernmentIdItem[]>(getToken, `/patients/${patientId}/government-ids`, { governmentIds });
}

export interface AddressInput {
    type?: string;
    houseStreet?: string | null;
    barangay?: string | null;
    cityMunicipality?: string | null;
    province?: string | null;
    region?: string | null;
    zipCode?: string | null;
    country?: string | null;
    isPrimary?: boolean;
}

export async function getPatientAddresses(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<AddressItem[]> {
    return api.get<AddressItem[]>(getToken, `/patients/${patientId}/addresses`);
}

export async function createPatientAddress(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: AddressInput,
): Promise<AddressItem> {
    return api.post<AddressItem>(getToken, `/patients/${patientId}/addresses`, payload);
}

export async function updatePatientAddress(
    getToken: () => Promise<string | null>,
    patientId: string,
    addressId: string,
    payload: AddressInput,
): Promise<AddressItem> {
    return api.put<AddressItem>(getToken, `/patients/${patientId}/addresses/${addressId}`, payload);
}

export async function deletePatientAddress(
    getToken: () => Promise<string | null>,
    patientId: string,
    addressId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/addresses/${addressId}`);
}

export interface EmergencyContactInput {
    fullName: string;
    relationship?: string | null;
    mobile?: string | null;
    altPhone?: string | null;
    isPrimary?: boolean;
}

export async function getPatientEmergencyContacts(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<EmergencyContactItem[]> {
    return api.get<EmergencyContactItem[]>(getToken, `/patients/${patientId}/emergency-contacts`);
}

export async function createPatientEmergencyContact(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: EmergencyContactInput,
): Promise<EmergencyContactItem> {
    return api.post<EmergencyContactItem>(getToken, `/patients/${patientId}/emergency-contacts`, payload);
}

export async function updatePatientEmergencyContact(
    getToken: () => Promise<string | null>,
    patientId: string,
    contactId: string,
    payload: EmergencyContactInput,
): Promise<EmergencyContactItem> {
    return api.put<EmergencyContactItem>(getToken, `/patients/${patientId}/emergency-contacts/${contactId}`, payload);
}

export async function deletePatientEmergencyContact(
    getToken: () => Promise<string | null>,
    patientId: string,
    contactId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/emergency-contacts/${contactId}`);
}

// 1:1 Profiles
export async function getPatientSocialHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<SocialHistoryItem | null> {
    try {
        return await api.get<SocialHistoryItem>(getToken, `/patients/${patientId}/social-history`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientSocialHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<SocialHistoryItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<SocialHistoryItem> {
    return api.put<SocialHistoryItem>(getToken, `/patients/${patientId}/social-history`, payload);
}

export async function getPatientOccupation(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<OccupationItem | null> {
    try {
        return await api.get<OccupationItem>(getToken, `/patients/${patientId}/occupation`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientOccupation(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<OccupationItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<OccupationItem> {
    return api.put<OccupationItem>(getToken, `/patients/${patientId}/occupation`, payload);
}

export async function getPatientObstetricProfile(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<ObstetricProfileItem | null> {
    try {
        return await api.get<ObstetricProfileItem>(getToken, `/patients/${patientId}/obstetric-profile`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientObstetricProfile(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<ObstetricProfileItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<ObstetricProfileItem> {
    return api.put<ObstetricProfileItem>(getToken, `/patients/${patientId}/obstetric-profile`, payload);
}

export async function getPatientMaleReproductive(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<MaleReproductiveItem | null> {
    try {
        return await api.get<MaleReproductiveItem>(getToken, `/patients/${patientId}/male-reproductive`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientMaleReproductive(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<MaleReproductiveItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<MaleReproductiveItem> {
    return api.put<MaleReproductiveItem>(getToken, `/patients/${patientId}/male-reproductive`, payload);
}

export async function getPatientDentalVision(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<DentalVisionItem | null> {
    try {
        return await api.get<DentalVisionItem>(getToken, `/patients/${patientId}/dental-vision`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientDentalVision(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<DentalVisionItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<DentalVisionItem> {
    return api.put<DentalVisionItem>(getToken, `/patients/${patientId}/dental-vision`, payload);
}

export async function getPatientMentalHealthProfile(
    getToken: () => Promise<string | null>,
    patientId: string,
): Promise<MentalHealthProfileItem | null> {
    try {
        return await api.get<MentalHealthProfileItem>(getToken, `/patients/${patientId}/mental-health`);
    } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
    }
}

export async function updatePatientMentalHealthProfile(
    getToken: () => Promise<string | null>,
    patientId: string,
    payload: Partial<Omit<MentalHealthProfileItem, 'id' | 'clientId' | 'updatedAt'>>,
): Promise<MentalHealthProfileItem> {
    return api.put<MentalHealthProfileItem>(getToken, `/patients/${patientId}/mental-health`, payload);
}

// ── Medical History Delete Endpoints ─────────────────────────────────────────

export async function deletePatientAllergy(
    getToken: () => Promise<string | null>,
    patientId: string,
    allergyId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/allergies/${allergyId}`);
}

export async function deletePatientMedication(
    getToken: () => Promise<string | null>,
    patientId: string,
    medicationId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/medications/${medicationId}`);
}

export async function deletePatientSurgicalHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
    surgeryId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/surgical-histories/${surgeryId}`);
}

export async function deletePatientPastIllness(
    getToken: () => Promise<string | null>,
    patientId: string,
    illnessId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/past-illnesses/${illnessId}`);
}

export async function deletePatientChronicCondition(
    getToken: () => Promise<string | null>,
    patientId: string,
    conditionId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/chronic-conditions/${conditionId}`);
}

export async function deletePatientFamilyHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
    familyHistoryId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/family-histories/${familyHistoryId}`);
}

export async function deletePatientImmunization(
    getToken: () => Promise<string | null>,
    patientId: string,
    immunizationId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/immunizations/${immunizationId}`);
}

export async function deletePatientDisability(
    getToken: () => Promise<string | null>,
    patientId: string,
    disabilityId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/disabilities/${disabilityId}`);
}

export async function deletePatientTravelHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
    travelId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/travel-histories/${travelId}`);
}

export async function deletePatientContraceptiveHistory(
    getToken: () => Promise<string | null>,
    patientId: string,
    contraceptiveId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/contraceptive-histories/${contraceptiveId}`);
}

export async function deletePatientPregnancy(
    getToken: () => Promise<string | null>,
    patientId: string,
    pregnancyId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/pregnancies/${pregnancyId}`);
}

export async function deletePatientHealthcareProvider(
    getToken: () => Promise<string | null>,
    patientId: string,
    providerId: string,
): Promise<void> {
    return api.delete<void>(getToken, `/patients/${patientId}/healthcare-providers/${providerId}`);
}


