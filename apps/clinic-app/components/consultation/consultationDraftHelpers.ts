import {
  formatClinicDate,
  formatClinicTime,
  getManilaTodayStr,
  type ConsultationDraftWorkspaceDto,
  type ConsultationRecord,
  type CreateConsultationRequest,
  type DraftDentalToothDto,
  type DraftDiagnosticOrderDto,
  type DraftProcedureOrderDto,
  type EncounterAdolescentAssessmentDto,
  type EncounterHeadsssDomainAssessmentDto,
  type EncounterObGyneExamDto,
  type EncounterPediatricMilestoneDto,
  type EncounterReviewOfSystemsItemDto,
  type PatientBpMonitoringLogDto,
  type RosCategoryCode,
  type VisitWorkflowMode,
} from '../../services/clinicService';
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import { normalizeTeethToMultiRecord } from '../dental';
import {
  DEFAULT_PHYSICAL_EXAM_NORMAL,
  to1NFFindings,
  type PhysicalExamFindings,
} from './InlinePhysicalExamCard';
import {
  buildPlanManagementPayload,
  hydratePlanManagementFromEncounter,
  type YakapPlanManagementState,
} from './PlanManagementCard';
import {
  formatRosCategoriesSummary,
  normalizeRosCategoryCode,
  normalizeRosCategoryList,
} from './VitalsFormFields';

/**
 * Safely parses boolean route params from React Navigation / Web URL query strings so
 * `?forceSeparateVisit=false` or `?openRegister=false` evaluates to `false` instead of `true`.
 */
export function parseBooleanRouteParam(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}

export interface DraftDiagnosisItem {
  icd10Code: string;
  description: string;
  isPrimary: boolean;
}

export interface DraftPrescriptionItem {
  genericName: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  isDangerousDrug: boolean;
  philHealthDrugCode?: string;
  clinicDispensedQuantity?: number;
  rosCategory?: RosCategoryCode | string;
}

export interface DraftLabOrderItem {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  philHealthCode?: string;
  fulfillmentMode: 'in_house' | 'outside';
  instructions?: string;
}

export interface DraftProcedureOrderItem {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  instructions?: string;
  roomId?: string;
  roomName?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  status?: 'draft' | 'sent_to_room' | string;
  isHandedOff?: boolean;
  toothNumber?: number;
  toothSurface?: string;
}

export function formatDraftSavedTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const timeStr = formatClinicTime(iso, { fallback: '' });
  if (!timeStr) return null;
  const recordedYmd = formatClinicDate(iso, { dateFormat: 'yyyy-MM-dd', fallback: '' });
  if (recordedYmd && recordedYmd !== getManilaTodayStr()) {
    const dateStr = formatClinicDate(iso, { fallback: '' });
    return dateStr ? `${dateStr}, ${timeStr}` : timeStr;
  }
  return timeStr;
}

export function extractStagedDentalTeethForDraft(
  dentalChart: Record<number, any>,
  isDentalEnabled: boolean,
): DraftDentalToothDto[] {
  if (!isDentalEnabled || !dentalChart || Object.keys(dentalChart).length === 0) {
    return [];
  }
  const multiMap = normalizeTeethToMultiRecord(dentalChart as any);
  return Object.values(multiMap)
    .flat()
    .filter((rec) => !rec.isVoided && rec.status !== 'Healthy' && rec.isCurrentEncounter !== false)
    .map((rec) => ({
      toothNumber: rec.toothNumber,
      status: rec.status,
      surface: rec.surface || null,
      notes: rec.notes || null,
    }));
}

export interface BuildConsultationDraftPayloadInput {
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  queueItemId?: string;
  appointmentId?: string;
  hasExistingConsultation?: boolean;
  specialtyMode?: string | null;
  isDentalEnabled: boolean;
  visitWorkflowMode: VisitWorkflowMode;
  isYakapEligible: boolean;
  philHealthAtc: string;
  doctorPrc: string;
  doctorPtr: string;
  doctorS2: string;
  doctorPan: string;
  fallbackPrc?: string;
  fallbackPtr?: string;
  fallbackS2?: string;
  fallbackPan?: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  homeInstructions: string;
  rosCategory: RosCategoryCode | string;
  rosCategories?: ReadonlyArray<RosCategoryCode | string>;
  rosItems: EncounterReviewOfSystemsItemDto[];
  selectedSymptomCodes: string[];
  painSymptomSelected: boolean;
  otherSymptomSelected: boolean;
  symptomPainSite: string;
  symptomOtherDesc: string;
  physicalExamFindings: PhysicalExamFindings;
  obGyneExam: EncounterObGyneExamDto | null;
  pediatricMilestones: EncounterPediatricMilestoneDto[];
  adolescentAssessment: EncounterAdolescentAssessmentDto | null;
  headsssAssessments: EncounterHeadsssDomainAssessmentDto[];
  bpMonitoringLogs: PatientBpMonitoringLogDto[];
  planManagement: YakapPlanManagementState;
  completedLabResultsCount: number;
  hasIssuedReferral: boolean;
  selectedDiagnoses: DraftDiagnosisItem[];
  prescriptions: DraftPrescriptionItem[];
  orderedLabs: DraftLabOrderItem[];
  orderedProcedures: DraftProcedureOrderItem[];
  dentalChart: Record<number, any>;
  cdsOverrideReason: string;
  overrideConfirmed: boolean;
  medCertFitness: string;
  medCertRestDays: string;
  medCertPurpose: string;
  medCertRemarks: string;
  refFacility: string;
  refDepartment: string;
  refUrgency: string;
  refReason: string;
  refSummary: string;
  showAddRx?: boolean;
  newRxGeneric?: string;
  newRxDosage?: string;
  newRxForm?: string;
  newRxSig?: string;
  newRxQuantity?: string;
  newRxClinicDispensedQty?: string;
  newRxDangerous?: boolean;
  newRxDrugCode?: string;
}

export function buildConsultationDraftPayload(
  input: BuildConsultationDraftPayloadInput,
): CreateConsultationRequest {
  const hasNonDefaultPe = Object.keys(DEFAULT_PHYSICAL_EXAM_NORMAL).some(
    (k) =>
      input.physicalExamFindings[k as keyof PhysicalExamFindings] !==
      DEFAULT_PHYSICAL_EXAM_NORMAL[k as keyof PhysicalExamFindings],
  );
  const shouldPersistPe =
    input.specialtyMode !== 'Dental' &&
    (input.isYakapEligible || Boolean(input.hasExistingConsultation) || hasNonDefaultPe);

  const planManagementPayload = buildPlanManagementPayload(input.planManagement, {
    orderedLabsCount: input.orderedLabs.length,
    completedLabResultsCount: input.completedLabResultsCount,
    prescriptionsCount: input.prescriptions.length,
    hasIssuedReferral: input.hasIssuedReferral,
  });

  const resolvedRosItems: EncounterReviewOfSystemsItemDto[] = input.rosItems.length
    ? input.rosItems
    : input.selectedSymptomCodes.length
      ? input.selectedSymptomCodes.map((code) => ({
          optionCode: code,
          symptomName: code,
          isPertinentPositive: true,
        }))
      : [];

  const mergedRosCategories =
    input.rosCategories !== undefined
      ? normalizeRosCategoryList(input.rosCategories, { allowEmpty: true })
      : [];
  const primaryRosCategory: RosCategoryCode | string =
    input.rosCategories !== undefined
      ? mergedRosCategories.find((c) => c !== 'EssentiallyNormal') ??
        mergedRosCategories[0] ??
        'EssentiallyNormal'
      : input.rosCategory;

  const draftDiagnosticOrders: DraftDiagnosticOrderDto[] = input.orderedLabs.map((l) => ({
    serviceItemId: l.serviceItemId,
    code: l.code,
    name: l.name,
    category: l.category || 'Diagnostic',
    standardPrice: l.standardPrice ?? 0,
    philHealthCode: l.philHealthCode,
    fulfillmentMode: l.fulfillmentMode,
    instructions: l.instructions,
  }));

  const draftProcedures: DraftProcedureOrderDto[] = input.orderedProcedures
    .filter((p) => !p.isHandedOff && p.status !== 'sent_to_room')
    .map((p) => ({
      serviceItemId: p.serviceItemId,
      code: p.code,
      name: p.name,
      category: p.category || 'Procedure',
      standardPrice: p.standardPrice ?? 0,
      instructions: p.instructions,
      roomId: p.roomId,
      roomName: p.roomName,
      targetRoomId: p.targetRoomId,
      targetRoomName: p.targetRoomName,
      status: p.status || 'draft',
      isHandedOff: false,
      toothNumber: p.toothNumber,
      toothSurface: p.toothSurface,
    }));

  const draftDentalTeeth = extractStagedDentalTeethForDraft(
    input.dentalChart,
    input.isDentalEnabled,
  );

  const draftWorkspace: ConsultationDraftWorkspaceDto = {
    cdsOverrideReason: input.cdsOverrideReason || null,
    cdsOverrideConfirmed: input.overrideConfirmed,
    planHasMedicationPrescription: input.planManagement.hasMedicationPrescription,
    planHasReferral: input.planManagement.hasReferral,
    planHasCancerScreening: input.planManagement.hasCancerScreening,
    planHasFollowUp: input.planManagement.hasFollowUp,
    planDiagnosticServicesOption: input.planManagement.diagnosticServicesOption,
    medCertFitness: input.medCertFitness || null,
    medCertRestDays: input.medCertRestDays || null,
    medCertPurpose: input.medCertPurpose || null,
    medCertRemarks: input.medCertRemarks || null,
    refFacility: input.refFacility || null,
    refDepartment: input.refDepartment || null,
    refUrgency: input.refUrgency || null,
    refReason: input.refReason || null,
    refSummary: input.refSummary || null,
    ...(input.showAddRx !== undefined ? { rxShowAddForm: Boolean(input.showAddRx) } : {}),
    ...(input.newRxGeneric !== undefined ? { rxDraftGeneric: input.newRxGeneric || null } : {}),
    ...(input.newRxDosage !== undefined ? { rxDraftDosage: input.newRxDosage || null } : {}),
    ...(input.newRxForm !== undefined ? { rxDraftForm: input.newRxForm || null } : {}),
    ...(input.newRxSig !== undefined ? { rxDraftSig: input.newRxSig || null } : {}),
    ...(input.newRxQuantity !== undefined ? { rxDraftQuantity: input.newRxQuantity || null } : {}),
    ...(input.newRxClinicDispensedQty !== undefined
      ? { rxDraftClinicDispensedQty: input.newRxClinicDispensedQty || null }
      : {}),
    ...(input.newRxDangerous !== undefined ? { rxDraftDangerous: Boolean(input.newRxDangerous) } : {}),
    ...(input.newRxDrugCode !== undefined ? { rxDraftDrugCode: input.newRxDrugCode || null } : {}),
    ...(input.rosCategories !== undefined ? { rosCategories: mergedRosCategories } : {}),
  };

  const resolvedGeneralSurveyId =
    input.physicalExamFindings.generalSurveyId ||
    (input.physicalExamFindings.generalSurvey === 'Normal' ? '1' : '2');

  return {
    patientId: input.patientId,
    patientName: input.patientName,
    doctorId: input.doctorId,
    doctorName: input.doctorName,
    queueItemId: input.queueItemId,
    appointmentId: input.appointmentId,
    subjective: input.subjective,
    objective: input.objective,
    assessment: input.assessment,
    plan: input.plan,
    homeInstructions: input.homeInstructions,
    rosCategory: primaryRosCategory,
    visitWorkflowMode: input.visitWorkflowMode,
    isYakapEligible: input.isYakapEligible,
    doctorPrcLicense: input.doctorPrc.trim() || input.fallbackPrc || '',
    doctorPtr: input.doctorPtr.trim() || input.fallbackPtr || '',
    doctorS2License: input.doctorS2.trim() || input.fallbackS2 || '',
    doctorPhilHealthPan: input.doctorPan.trim() || input.fallbackPan || '',
    philHealthAtc: input.isYakapEligible
      ? input.philHealthAtc.trim() || 'WALKEDIN'
      : input.philHealthAtc.trim(),
    philHealthSignSympCode: input.selectedSymptomCodes.join(','),
    reviewOfSystemsItems: resolvedRosItems,
    philHealthOtherComplaint: input.otherSymptomSelected
      ? input.symptomOtherDesc || input.subjective
      : input.symptomOtherDesc,
    philHealthPainSite: input.painSymptomSelected
      ? input.symptomPainSite
      : input.symptomPainSite,
    generalSurveyId: shouldPersistPe ? resolvedGeneralSurveyId : undefined,
    generalSurveyRemarks: shouldPersistPe
      ? input.physicalExamFindings.generalSurveyRemarks ?? ''
      : undefined,
    physicalExamFindingsJson: shouldPersistPe
      ? JSON.stringify(input.physicalExamFindings)
      : undefined,
    physicalExams: shouldPersistPe
      ? [
          {
            generalSurveyId: resolvedGeneralSurveyId,
            generalSurveyRemarks: input.physicalExamFindings.generalSurveyRemarks ?? '',
            findings: to1NFFindings(input.physicalExamFindings),
          },
        ]
      : undefined,
    obGyneExam: (input.obGyneExam ?? {}) as EncounterObGyneExamDto,
    pediatricMilestones: input.pediatricMilestones,
    adolescentAssessment: (input.adolescentAssessment ?? {}) as EncounterAdolescentAssessmentDto,
    headsssAssessments: input.headsssAssessments,
    bpMonitoringLogs: input.bpMonitoringLogs,
    ...planManagementPayload,
    diagnoses: input.selectedDiagnoses.map((d) => ({
      icd10Code: d.icd10Code,
      description: d.description,
      isPrimary: d.isPrimary,
    })),
    prescriptions: input.prescriptions.map((p) => ({
      genericName: p.genericName,
      dosage: p.dosage,
      form: p.form,
      sig: p.sig,
      quantity: p.quantity,
      durationDays: p.durationDays,
      isDangerousDrug: p.isDangerousDrug,
      philHealthDrugCode: p.philHealthDrugCode,
      clinicDispensedQuantity: p.clinicDispensedQuantity,
      rosCategory: p.rosCategory || primaryRosCategory,
    })),
    draftDiagnosticOrders,
    draftProcedures,
    draftDentalTeeth,
    draftWorkspace,
  };
}

export function rehydrateEncounterPlanManagementWithWorkspace(
  encounter: ConsultationRecord,
): YakapPlanManagementState {
  const base = hydratePlanManagementFromEncounter(encounter);
  if (encounter.isSigned || !encounter.draftWorkspace) {
    return base;
  }
  const ws = encounter.draftWorkspace;
  return {
    ...base,
    ...(ws.planHasMedicationPrescription !== undefined
      ? { hasMedicationPrescription: ws.planHasMedicationPrescription }
      : {}),
    ...(ws.planHasReferral !== undefined
      ? { hasReferral: ws.planHasReferral }
      : {}),
    ...(ws.planHasCancerScreening !== undefined && ws.planHasCancerScreening !== null
      ? { hasCancerScreening: ws.planHasCancerScreening }
      : {}),
    ...(ws.planHasFollowUp !== undefined && ws.planHasFollowUp !== null
      ? { hasFollowUp: ws.planHasFollowUp }
      : {}),
    ...(ws.planDiagnosticServicesOption !== undefined
      ? { diagnosticServicesOption: ws.planDiagnosticServicesOption }
      : {}),
  };
}

/**
 * Validates the optional starter clinic-stock pieces count against the prescribed quantity.
 * Returns a concise inline error label when invalid, or `null` when valid / blank.
 */
export function validateRxClinicDispensedQuantity(
  prescribedQtyRaw: string,
  clinicDispensedRaw: string,
): string | null {
  const trimmedDispense = clinicDispensedRaw.trim();
  if (!trimmedDispense) {
    return null;
  }
  const parsedDispense = Number(trimmedDispense);
  if (!Number.isInteger(parsedDispense) || parsedDispense < 0) {
    return 'Whole pcs >= 0';
  }
  const trimmedQty = prescribedQtyRaw.trim();
  const effectiveQty = trimmedQty === '' ? 30 : Number(trimmedQty);
  if (!Number.isInteger(effectiveQty) || effectiveQty <= 0) {
    return parsedDispense > 0 ? 'Exceeds quantity' : null;
  }
  if (parsedDispense > effectiveQty) {
    return `Max ${effectiveQty} pcs`;
  }
  return null;
}

export interface LocalConsultationDraftEntry {
  version: 1;
  savedAt: string;
  clinicId?: string | null;
  visitId: string;
  patientId: string;
  consultationId?: string | null;
  fingerprint?: string;
  payload: CreateConsultationRequest;
}

export interface LocalConsultationDraftLookup {
  clinicId?: string | null;
  visitId?: string | null;
  patientId?: string | null;
  consultationId?: string | null;
}

const LOCAL_DRAFT_PREFIX = 'clinicez:consultation-draft:v1';

function resolveClinicScope(clinicId?: string | null): string {
  const clean = (clinicId || '').trim();
  return clean || 'default';
}

function buildVisitDraftKey(clinicId: string | null | undefined, visitId: string): string {
  return `${LOCAL_DRAFT_PREFIX}:visit:${resolveClinicScope(clinicId)}:${visitId}`;
}

function buildConsultationDraftKey(clinicId: string | null | undefined, consultationId: string): string {
  return `${LOCAL_DRAFT_PREFIX}:enc:${resolveClinicScope(clinicId)}:${consultationId}`;
}

function buildPatientTodayDraftKey(clinicId: string | null | undefined, patientId: string): string {
  return `${LOCAL_DRAFT_PREFIX}:patient:${resolveClinicScope(clinicId)}:${patientId}:${getManilaTodayStr()}`;
}

function parseStoredDraftEntry(raw: string | null, expectedPatientId?: string | null): LocalConsultationDraftEntry | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LocalConsultationDraftEntry;
    if (!parsed || parsed.version !== 1 || !parsed.payload || !parsed.patientId || !parsed.savedAt) {
      return null;
    }
    if (expectedPatientId && parsed.patientId !== expectedPatientId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Persists an unsigned consultation draft immediately to device storage (`localStorage` on web,
 * SQLite on native) so browser refreshes preserve 100% of clinical edits even before a backend
 * schema rollout or while a network save is still in flight.
 */
export function saveLocalConsultationDraft(entry: LocalConsultationDraftEntry): void {
  if (!entry.visitId || !entry.patientId) return;
  const serialized = JSON.stringify(entry);
  setDeviceItem(buildVisitDraftKey(entry.clinicId, entry.visitId), serialized);
  if (entry.consultationId) {
    setDeviceItem(buildConsultationDraftKey(entry.clinicId, entry.consultationId), serialized);
  }
  setDeviceItem(buildPatientTodayDraftKey(entry.clinicId, entry.patientId), serialized);
}

export function readLocalConsultationDraft(
  lookup: LocalConsultationDraftLookup,
): LocalConsultationDraftEntry | null {
  if (lookup.consultationId) {
    const byEnc = parseStoredDraftEntry(
      getDeviceItem(buildConsultationDraftKey(lookup.clinicId, lookup.consultationId)),
      lookup.patientId,
    );
    if (byEnc) return byEnc;
  }
  if (lookup.visitId) {
    const byVisit = parseStoredDraftEntry(
      getDeviceItem(buildVisitDraftKey(lookup.clinicId, lookup.visitId)),
      lookup.patientId,
    );
    if (byVisit) return byVisit;
  }
  if (lookup.patientId && (!lookup.visitId || lookup.visitId.startsWith('ephemeral-'))) {
    const byPatient = parseStoredDraftEntry(
      getDeviceItem(buildPatientTodayDraftKey(lookup.clinicId, lookup.patientId)),
      lookup.patientId,
    );
    if (byPatient) return byPatient;
  }
  return null;
}

export function clearLocalConsultationDraft(lookup: LocalConsultationDraftLookup): void {
  if (lookup.visitId) {
    setDeviceItem(buildVisitDraftKey(lookup.clinicId, lookup.visitId), null);
  }
  if (lookup.consultationId) {
    setDeviceItem(buildConsultationDraftKey(lookup.clinicId, lookup.consultationId), null);
  }
  if (lookup.patientId) {
    const patientKey = buildPatientTodayDraftKey(lookup.clinicId, lookup.patientId);
    const existing = parseStoredDraftEntry(getDeviceItem(patientKey), lookup.patientId);
    if (
      !existing ||
      !lookup.visitId ||
      existing.visitId === lookup.visitId ||
      existing.visitId.startsWith('ephemeral-') ||
      (lookup.consultationId && existing.consultationId === lookup.consultationId)
    ) {
      setDeviceItem(patientKey, null);
    }
  }
}

/**
 * Determines whether a device-stored draft should overlay the server encounter response:
 * - Always `false` for signed encounters.
 * - `true` when no server encounter exists yet (e.g., refreshed inside the 500ms debounce or offline).
 * - `true` when the server response comes from an older API deployment that lacks `draftDiagnosticOrders`,
 *   `draftProcedures`, or `rosCategory` fields on `ConsultationEncounterDto`.
 * - `true` when the local draft timestamp is strictly newer than the server `updatedAt` timestamp.
 */
export function shouldOverlayLocalConsultationDraft(
  existingEncounter: ConsultationRecord | null | undefined,
  localDraft: LocalConsultationDraftEntry | null,
): boolean {
  if (!localDraft) return false;
  if (existingEncounter?.isSigned) return false;
  if (
    existingEncounter?.id &&
    localDraft.consultationId &&
    existingEncounter.id !== localDraft.consultationId
  ) {
    return false;
  }
  if (!existingEncounter) {
    return true;
  }
  if (
    !Array.isArray(existingEncounter.draftDiagnosticOrders) ||
    !Array.isArray(existingEncounter.draftProcedures) ||
    existingEncounter.rosCategory === undefined ||
    (Array.isArray(localDraft.payload.draftWorkspace?.rosCategories) &&
      !Array.isArray(existingEncounter.rosCategories) &&
      !Array.isArray(existingEncounter.draftWorkspace?.rosCategories))
  ) {
    return true;
  }
  const localMs = Date.parse(localDraft.savedAt);
  const serverMs = Date.parse(
    existingEncounter.updatedAt || existingEncounter.createdAt || existingEncounter.encounterDate || '',
  );
  if (!Number.isNaN(localMs) && (Number.isNaN(serverMs) || localMs > serverMs + 250)) {
    return true;
  }
  if (
    Array.isArray(localDraft.payload.draftWorkspace?.rosCategories) &&
    !Number.isNaN(localMs) &&
    (Number.isNaN(serverMs) || localMs >= serverMs - 2000)
  ) {
    const serverRosList =
      existingEncounter.draftWorkspace?.rosCategories ?? existingEncounter.rosCategories ?? null;
    if (
      JSON.stringify(localDraft.payload.draftWorkspace.rosCategories) !==
      JSON.stringify(serverRosList)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Overlays a `LocalConsultationDraftEntry` onto a server `ConsultationRecord` (or synthesizes an
 * unsigned `ConsultationRecord` when the server has not yet materialized one) so `loadPatientContext`
 * can rehydrate all Regular, YAKAP, ROS, diagnostic order, procedure, dental, and Rx fields uniformly.
 */
export function mergeConsultationRecordWithLocalDraft(
  existingEncounter: ConsultationRecord | undefined,
  localDraft: LocalConsultationDraftEntry,
): ConsultationRecord {
  const payload = localDraft.payload;
  const localWorkspaceRosCategories = payload.draftWorkspace?.rosCategories;
  const resolvedId =
    existingEncounter?.id ||
    localDraft.consultationId ||
    `local-draft-${localDraft.visitId}`;
  const resolvedQueueId =
    existingEncounter?.queueItemId ||
    payload.queueItemId ||
    (localDraft.visitId.startsWith('ephemeral-') ? undefined : localDraft.visitId);

  return {
    id: resolvedId,
    tenantId: existingEncounter?.tenantId || '',
    clinicId: existingEncounter?.clinicId || localDraft.clinicId || '',
    queueItemId: resolvedQueueId,
    appointmentId: payload.appointmentId ?? existingEncounter?.appointmentId,
    patientId: payload.patientId || existingEncounter?.patientId || localDraft.patientId,
    patientName: payload.patientName || existingEncounter?.patientName || '',
    doctorId: payload.doctorId || existingEncounter?.doctorId || '',
    doctorName: payload.doctorName || existingEncounter?.doctorName || '',
    encounterDate: existingEncounter?.encounterDate || localDraft.savedAt,
    createdAt: existingEncounter?.createdAt || localDraft.savedAt,
    updatedAt: localDraft.savedAt,
    isSigned: false,
    signedAt: undefined,
    visitWorkflowMode: payload.visitWorkflowMode ?? existingEncounter?.visitWorkflowMode ?? 'Regular',
    isYakapEligible: payload.isYakapEligible ?? existingEncounter?.isYakapEligible ?? false,
    subjective: payload.subjective ?? existingEncounter?.subjective ?? '',
    objective: payload.objective ?? existingEncounter?.objective ?? '',
    assessment: payload.assessment ?? existingEncounter?.assessment ?? '',
    plan: payload.plan ?? existingEncounter?.plan ?? '',
    homeInstructions: payload.homeInstructions ?? existingEncounter?.homeInstructions,
    rosCategory: payload.rosCategory ?? existingEncounter?.rosCategory ?? 'EssentiallyNormal',
    rosCategories: Array.isArray(localWorkspaceRosCategories)
      ? localWorkspaceRosCategories
      : existingEncounter?.rosCategories ??
        existingEncounter?.draftWorkspace?.rosCategories ??
        null,
    rosCategoryLabel: Array.isArray(localWorkspaceRosCategories)
      ? localWorkspaceRosCategories.length > 0
        ? formatRosCategoriesSummary(localWorkspaceRosCategories)
        : undefined
      : existingEncounter?.rosCategoryLabel,
    doctorPrcLicense: payload.doctorPrcLicense ?? existingEncounter?.doctorPrcLicense,
    doctorPtr: payload.doctorPtr ?? existingEncounter?.doctorPtr,
    doctorS2License: payload.doctorS2License ?? existingEncounter?.doctorS2License,
    doctorPhilHealthPan: payload.doctorPhilHealthPan ?? existingEncounter?.doctorPhilHealthPan,
    philHealthAtc: payload.philHealthAtc ?? existingEncounter?.philHealthAtc,
    hciCaseNo: existingEncounter?.hciCaseNo,
    hciTransNo: existingEncounter?.hciTransNo,
    soapTransNo: existingEncounter?.soapTransNo,
    philHealthCaseNo: existingEncounter?.philHealthCaseNo,
    philHealthSoapTransNo: existingEncounter?.philHealthSoapTransNo,
    philHealthSignSympCode: payload.philHealthSignSympCode ?? existingEncounter?.philHealthSignSympCode,
    philHealthOtherComplaint: payload.philHealthOtherComplaint ?? existingEncounter?.philHealthOtherComplaint,
    philHealthPainSite: payload.philHealthPainSite ?? existingEncounter?.philHealthPainSite,
    generalSurveyId: payload.generalSurveyId ?? existingEncounter?.generalSurveyId,
    generalSurveyRemarks: payload.generalSurveyRemarks ?? existingEncounter?.generalSurveyRemarks,
    physicalExamFindingsJson: payload.physicalExamFindingsJson ?? existingEncounter?.physicalExamFindingsJson,
    physicalExams: payload.physicalExams ?? existingEncounter?.physicalExams,
    reviewOfSystemsItems: payload.reviewOfSystemsItems ?? existingEncounter?.reviewOfSystemsItems,
    obGyneExam: payload.obGyneExam ?? existingEncounter?.obGyneExam ?? null,
    pediatricMilestones: payload.pediatricMilestones ?? existingEncounter?.pediatricMilestones ?? [],
    adolescentAssessment: payload.adolescentAssessment ?? existingEncounter?.adolescentAssessment ?? null,
    headsssAssessments: payload.headsssAssessments ?? existingEncounter?.headsssAssessments ?? [],
    bpMonitoringLogs: payload.bpMonitoringLogs ?? existingEncounter?.bpMonitoringLogs ?? [],
    counselingCodes: payload.counselingCodes ?? existingEncounter?.counselingCodes ?? null,
    routineVaccineName: payload.routineVaccineName ?? existingEncounter?.routineVaccineName ?? null,
    routineVaccineDate: payload.routineVaccineDate ?? existingEncounter?.routineVaccineDate ?? null,
    adultsRoutineScreeningCode: payload.adultsRoutineScreeningCode ?? existingEncounter?.adultsRoutineScreeningCode ?? null,
    pediatricRoutineScreeningCode: payload.pediatricRoutineScreeningCode ?? existingEncounter?.pediatricRoutineScreeningCode ?? null,
    prenatalScreeningServicesCode: payload.prenatalScreeningServicesCode ?? existingEncounter?.prenatalScreeningServicesCode ?? null,
    cancerScreeningCodes: payload.cancerScreeningCodes ?? existingEncounter?.cancerScreeningCodes ?? null,
    diagnosticServicesOption: payload.diagnosticServicesOption ?? existingEncounter?.diagnosticServicesOption ?? null,
    hasMedicationPrescription: payload.hasMedicationPrescription ?? existingEncounter?.hasMedicationPrescription ?? false,
    hasReferral: payload.hasReferral ?? existingEncounter?.hasReferral ?? false,
    otherMedicalAdviceSpec: payload.otherMedicalAdviceSpec ?? existingEncounter?.otherMedicalAdviceSpec ?? null,
    hasFollowUp: payload.hasFollowUp ?? existingEncounter?.hasFollowUp ?? false,
    followUpDate: payload.followUpDate ?? existingEncounter?.followUpDate ?? null,
    followUpScheduleText: payload.followUpScheduleText ?? existingEncounter?.followUpScheduleText ?? null,
    followUpReason: payload.followUpReason ?? existingEncounter?.followUpReason ?? null,
    followUpVaccineName: payload.followUpVaccineName ?? existingEncounter?.followUpVaccineName ?? null,
    followUpVaccineNextDate: payload.followUpVaccineNextDate ?? existingEncounter?.followUpVaccineNextDate ?? null,
    diagnoses: (payload.diagnoses || []).map((d, idx) => ({
      id: existingEncounter?.diagnoses?.[idx]?.id || `local-diag-${idx}`,
      icd10Code: d.icd10Code,
      description: d.description,
      isPrimary: Boolean(d.isPrimary),
    })),
    prescriptions: (payload.prescriptions || []).map((p, idx) => ({
      id: existingEncounter?.prescriptions?.[idx]?.id || `local-rx-${idx}`,
      genericName: p.genericName,
      dosage: p.dosage,
      form: p.form,
      sig: p.sig,
      quantity: p.quantity,
      durationDays: p.durationDays,
      refills: existingEncounter?.prescriptions?.[idx]?.refills ?? 0,
      isDangerousDrug: Boolean(p.isDangerousDrug),
      philHealthDrugCode: p.philHealthDrugCode,
      clinicDispensedQuantity: p.clinicDispensedQuantity,
      rosCategory: p.rosCategory,
    })),
    draftDiagnosticOrders: payload.draftDiagnosticOrders ?? [],
    draftProcedures: payload.draftProcedures ?? [],
    draftDentalTeeth: payload.draftDentalTeeth ?? [],
    draftWorkspace: payload.draftWorkspace ?? null,
  };
}
