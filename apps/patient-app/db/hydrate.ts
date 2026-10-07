/**
 * db/hydrate.ts
 *
 * Server-to-local hydration helpers.
 *
 * These functions write data that originates from the backend directly into
 * local SQLite using `originalDb` — the raw Drizzle instance that bypasses the
 * write-interceptor proxy.  This avoids creating sync-queue entries for rows
 * that were just fetched from the server and would otherwise be immediately
 * "pending" for re-upload.
 */

import { originalDb, flushDatabaseSnapshot, ensureDatabaseReady } from './index';
import {
  patients,
  patientGovernmentIds,
  patientAddresses,
  emergencyContacts,
  patientHealthcareProviders,
  patientAllergies,
  patientMedications,
  patientSurgicalHistory,
  patientPastIllnesses,
  patientChronicConditions,
  patientDisabilities,
  patientImmunizationsSelf,
  patientSocialHistory,
  patientFamilyHistory,
  patientOccupation,
  patientTravelHistory,
  patientObstetricProfile,
  patientPregnancies,
  patientContraceptiveHistory,
  patientMaleReproductive,
  patientDentalVision,
  patientMentalHealthProfile,
  patientNcdQuestionnaire,
  syncQueue,
} from './schema/index';
import {
  fromBackendBloodType,
  type PatientFullRecord,
  type PatientSummary,
  type PatientNcdQuestionnaireDto,
} from '../services/api/patientApi';

// ── helpers ───────────────────────────────────────────────────────────────────

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function now(): Date {
  return new Date();
}

// ── public API ────────────────────────────────────────────────────────────────

/**
 * Upserts just the demographics/contact row for a patient.
 * Called immediately after login to populate the patients table from the
 * `PatientSummary` returned by `getPatientByClerkId()`.
 */
export async function upsertPatientSummary(
  summary: PatientSummary,
  clerkUserId?: string | null,
): Promise<void> {
  await ensureDatabaseReady();
  const ts = now();
  const row: typeof patients.$inferInsert = {
    id: summary.id,
    ...(clerkUserId ? { clerkUserId } : {}),
    firstName: summary.firstName,
    middleName: summary.middleName ?? null,
    lastName: summary.lastName,
    suffix: summary.suffix ?? null,
    sex: (summary.sex as any) ?? null,
    dob: summary.dateOfBirth ?? null,
    bloodType: fromBackendBloodType(summary.bloodType) === 'Unknown' ? null : ((fromBackendBloodType(summary.bloodType) as any) ?? null),
    civilStatus: (summary.civilStatus as any) ?? null,
    nationality: summary.nationality ?? null,
    ethnicity: summary.ethnicity ?? null,
    religion: summary.religion ?? null,
    primaryLanguage: summary.primaryLanguage ?? null,
    educationLevel: (summary.educationLevel as any) ?? null,
    avatarUrl: summary.avatarUrl ?? null,
    mobile: summary.mobile ?? null,
    altPhone: summary.altPhone ?? null,
    email: summary.email ?? null,
    messengerHandle: summary.messengerHandle ?? null,
    consentToShareInfo: summary.consentToShareInfo ?? false,
    createdAt: ts,
    updatedAt: ts,
    syncedAt: ts,
  };

  await originalDb
    .insert(patients)
    .values(row)
    .onConflictDoUpdate({ target: patients.id, set: row });
  // Web: hydration bypasses the sync interceptor; make sure it is written to IndexedDB now.
  await flushDatabaseSnapshot();
}

/**
 * Hydrates all 22 ISyncable entity categories from a full-record API response
 * into local SQLite.  Existing rows are upserted; items not present in the
 * server response are left untouched (they may be locally queued additions).
 */
export async function hydrateFullRecord(record: PatientFullRecord): Promise<void> {
  await ensureDatabaseReady();
  const ts = now();
  const patientId = record.demographics.id;

  const pendingQueue = await originalDb.select({ entityId: syncQueue.entityId }).from(syncQueue);
  const pendingEntityIds = new Set(pendingQueue.map((q) => q.entityId));

  // 1. demographics
  if (!pendingEntityIds.has(patientId)) {
    await upsertPatientSummary(record.demographics);
  }

  // 2. government IDs: map the list of typed ID items into the singleton row
  if (!pendingEntityIds.has(patientId)) {
    const govIds = record.governmentIds || [];
    const findItem = (type: string) =>
      govIds.find((g) => g.idType?.toLowerCase() === type.toLowerCase());

    const philhealth = findItem('philhealth');
    const sss = findItem('sss');
    const gsis = findItem('gsis');
    const pagibig = findItem('pagibig');
    const tin = findItem('tin');
    const senior = findItem('seniorcitizen');
    const pwd = findItem('pwd');
    const hmo = findItem('hmo');

    const idMap: Record<string, { id: string; clientId: string }> = {};
    for (const g of govIds) {
      if (g.idType) {
        idMap[g.idType] = { id: g.id, clientId: g.clientId };
        idMap[g.idType.toLowerCase()] = { id: g.id, clientId: g.clientId };
      }
    }

    const existingGov = await originalDb.query.patientGovernmentIds.findFirst({
      where: (t: any, { eq }: any) => eq(t.patientId, patientId),
    });

    const govRow: typeof patientGovernmentIds.$inferInsert = {
      id: existingGov?.id || patientId,
      patientId,
      philhealthId: philhealth?.idNumber ?? existingGov?.philhealthId ?? null,
      philhealthCategory: existingGov?.philhealthCategory ?? null,
      sponsorPin: existingGov?.sponsorPin ?? null,
      sponsorLastName: existingGov?.sponsorLastName ?? null,
      sponsorFirstName: existingGov?.sponsorFirstName ?? null,
      sponsorMiddleName: existingGov?.sponsorMiddleName ?? null,
      sponsorSuffix: existingGov?.sponsorSuffix ?? null,
      sponsorDob: existingGov?.sponsorDob ?? null,
      sponsorRelationship: existingGov?.sponsorRelationship ?? null,
      sssNumber: sss?.idNumber ?? existingGov?.sssNumber ?? null,
      gsisNumber: gsis?.idNumber ?? existingGov?.gsisNumber ?? null,
      pagibigId: pagibig?.idNumber ?? existingGov?.pagibigId ?? null,
      tin: tin?.idNumber ?? existingGov?.tin ?? null,
      seniorCitizenId: senior?.idNumber ?? existingGov?.seniorCitizenId ?? null,
      isPwd: Boolean(pwd?.idNumber) || (existingGov?.isPwd ?? false),
      pwdIdNumber: pwd?.idNumber ?? existingGov?.pwdIdNumber ?? null,
      disabilityType: existingGov?.disabilityType ?? null,
      hmoProvider: existingGov?.hmoProvider ?? null,
      hmoPolicyNumber: hmo?.idNumber ?? existingGov?.hmoPolicyNumber ?? null,
      hmoPlanType: existingGov?.hmoPlanType ?? null,
      hmoCoverageStart: existingGov?.hmoCoverageStart ?? null,
      hmoCoverageEnd: existingGov?.hmoCoverageEnd ?? null,
      createdAt: existingGov?.createdAt ?? ts,
      updatedAt: ts,
      syncedAt: ts,
      serverId: JSON.stringify(idMap),
    };

    await originalDb
      .insert(patientGovernmentIds)
      .values(govRow)
      .onConflictDoUpdate({ target: patientGovernmentIds.patientId, set: govRow });
  }

  // 3. addresses
  for (const addr of record.addresses) {
    if (pendingEntityIds.has(addr.id)) continue;
    const row = {
      id: addr.id,
      patientId,
      type: (['primary', 'secondary'].includes(addr.type) ? addr.type : 'primary') as 'primary' | 'secondary',
      houseStreet: addr.street ?? null,
      barangay: addr.barangay ?? null,
      cityMunicipality: addr.city ?? null,
      province: addr.province ?? null,
      region: null,
      zipCode: addr.zipCode ?? null,
      country: addr.country ?? 'Philippines',
      createdAt: ts,
      updatedAt: toDate(addr.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientAddresses)
      .values(row)
      .onConflictDoUpdate({ target: patientAddresses.id, set: row });
  }

  // 4. emergency contacts
  for (let i = 0; i < record.emergencyContacts.length; i++) {
    const ec = record.emergencyContacts[i];
    if (pendingEntityIds.has(ec.id)) continue;
    const row = {
      id: ec.id,
      patientId,
      sortOrder: ec.isPrimary ? 1 : i + 2,
      name: ec.fullName,
      relationship: ec.relationship ?? null,
      phone: ec.mobile ?? '',
      altPhone: ec.altPhone ?? null,
      email: null as string | null,
      address: null as string | null,
      createdAt: ts,
      updatedAt: toDate(ec.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(emergencyContacts)
      .values(row)
      .onConflictDoUpdate({ target: emergencyContacts.id, set: row });
  }

  // 5. healthcare providers
  //    Local schema has providerType enum: 'primary_care' | 'specialist_1' | 'specialist_2'
  const providerTypeMap: Record<string, string> = {
    PrimaryCare: 'primary_care',
    Specialist: 'specialist_1',
  };
  for (let i = 0; i < record.healthcareProviders.length; i++) {
    const hp = record.healthcareProviders[i];
    if (pendingEntityIds.has(hp.id)) continue;
    const typeKey = i === 0 ? 'primary_care' : i === 1 ? 'specialist_1' : 'specialist_2';
    const row = {
      id: hp.id,
      patientId,
      providerType: (providerTypeMap[hp.providerType] ?? typeKey) as 'primary_care' | 'specialist_1' | 'specialist_2',
      name: hp.name ?? null,
      specialty: hp.specialty ?? null,
      clinicHospital: hp.clinicHospital ?? null,
      phone: hp.phone ?? null,
      createdAt: ts,
      updatedAt: toDate(hp.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientHealthcareProviders)
      .values(row)
      .onConflictDoUpdate({ target: patientHealthcareProviders.id, set: row });
  }

  // 6. allergies
  for (const al of record.allergies) {
    if (pendingEntityIds.has(al.id)) continue;
    const row = {
      id: al.id,
      patientId,
      allergen: al.allergenName,
      reactionType: al.reaction ?? null,
      severity: (al.severity as any) ?? null,
      management: al.notes ?? null,
      isActive: true,
      createdAt: ts,
      updatedAt: toDate(al.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientAllergies)
      .values(row)
      .onConflictDoUpdate({ target: patientAllergies.id, set: row });
  }

  // 7. medications  (local: drugName, dosage, dosageForm, frequency, prescribingPhysician, startDate, indication, isActive)
  for (const med of record.medications) {
    if (pendingEntityIds.has(med.id)) continue;
    const row = {
      id: med.id,
      patientId,
      drugName: med.medicationName,
      dosage: med.dosage ?? null,
      dosageForm: null as string | null,
      frequency: med.frequency ?? null,
      prescribingPhysician: med.prescribedBy ?? null,
      startDate: med.startDate ?? null,
      indication: med.purpose ?? null,
      isActive: med.isCurrentlyTaking,
      createdAt: ts,
      updatedAt: toDate(med.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientMedications)
      .values(row)
      .onConflictDoUpdate({ target: patientMedications.id, set: row });
  }

  // 8. surgical history  (local: procedure, surgeon, facility, date, anesthesiaType, complications)
  for (const sh of record.surgicalHistories) {
    if (pendingEntityIds.has(sh.id)) continue;
    const row = {
      id: sh.id,
      patientId,
      procedure: sh.procedureName,
      surgeon: sh.surgeonName ?? null,
      facility: sh.hospital ?? null,
      date: sh.surgeryDate ?? null,
      anesthesiaType: sh.anesthesiaType ?? null,
      complications: sh.complications ?? null,
      createdAt: ts,
      updatedAt: toDate(sh.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientSurgicalHistory)
      .values(row)
      .onConflictDoUpdate({ target: patientSurgicalHistory.id, set: row });
  }

  // 9. past illnesses  (local: diagnosis, duration, complications)
  for (const pi of record.pastIllnesses) {
    if (pendingEntityIds.has(pi.id)) continue;
    const row = {
      id: pi.id,
      patientId,
      diagnosis: pi.illnessName,
      duration: pi.diagnosedAt && pi.resolvedAt ? `${pi.diagnosedAt} – ${pi.resolvedAt}` : pi.diagnosedAt ?? null,
      complications: pi.notes ?? null,
      createdAt: ts,
      updatedAt: toDate(pi.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientPastIllnesses)
      .values(row)
      .onConflictDoUpdate({ target: patientPastIllnesses.id, set: row });
  }

  // 10. chronic conditions  (local: diagnosis, controlStatus, monitoringFrequency)
  for (const cc of record.chronicConditions) {
    if (pendingEntityIds.has(cc.id)) continue;
    const row = {
      id: cc.id,
      patientId,
      diagnosis: cc.conditionName,
      controlStatus: cc.isControlled ? 'Controlled' : 'Uncontrolled',
      monitoringFrequency: cc.treatmentNotes ?? null,
      createdAt: ts,
      updatedAt: toDate(cc.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientChronicConditions)
      .values(row)
      .onConflictDoUpdate({ target: patientChronicConditions.id, set: row });
  }

  // 11. disabilities  (local: bodyPart, classification, isPwdCertified)
  for (const dis of record.disabilities) {
    if (pendingEntityIds.has(dis.id)) continue;
    const row = {
      id: dis.id,
      patientId,
      bodyPart: dis.bodyPart ?? null,
      classification: dis.classification ?? null,
      isPwdCertified: dis.isPwdCertified,
      createdAt: ts,
      updatedAt: toDate(dis.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientDisabilities)
      .values(row)
      .onConflictDoUpdate({ target: patientDisabilities.id, set: row });
  }

  // 12. immunizations self  (local: immunizationCategory, vaccineName, doseNumber, lotNumber, date, administeredBy)
  for (const imm of record.immunizationsSelf) {
    if (pendingEntityIds.has(imm.id)) continue;
    const row = {
      id: imm.id,
      patientId,
      immunizationCategory: (imm.immunizationCategory as any) ?? null,
      vaccineName: imm.vaccineName,
      doseNumber: imm.doseNumber ?? null,
      lotNumber: imm.lotNumber ?? null,
      date: imm.date ?? null,
      administeredBy: imm.administeredBy ?? null,
      createdAt: ts,
      updatedAt: toDate(imm.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientImmunizationsSelf)
      .values(row)
      .onConflictDoUpdate({ target: patientImmunizationsSelf.id, set: row });
  }

  // 13. social history (singleton)
  //     Local schema differs significantly — map best-effort
  if (record.socialHistory && !pendingEntityIds.has(patientId)) {
    const sh = record.socialHistory;
    const row = {
      id: sh.id,
      patientId,
      tobaccoStatus: (sh.smokingStatus as any) ?? null,
      cigsPerDay: sh.cigsPerDay ?? null,
      packYears: sh.packYears ?? null,
      quitDate: sh.quitDate ?? null,
      otherTobaccoProducts: sh.otherTobaccoProducts ?? null,
      alcoholUseLevel: sh.alcoholUse ?? null,
      alcoholType: sh.alcoholType ?? null,
      alcoholFrequencyDaysPerWeek: sh.alcoholFrequencyDaysPerWeek ?? null,
      alcoholQuantityPerOccasion: sh.alcoholQuantityPerOccasion ?? null,
      substanceUse: sh.usesSubstances,
      substanceName: sh.substanceName ?? null,
      substanceRoute: sh.substanceRoute ?? null,
      substanceFrequency: sh.substanceFrequency ?? null,
      activityLevel: sh.activityLevel ?? null,
      exerciseType: sh.exerciseType ?? null,
      exerciseFrequencyDaysPerWeek: sh.exerciseFrequencyDaysPerWeek ?? null,
      dietPattern: sh.dietPattern ?? null,
      foodRestrictions: sh.foodRestrictions ?? null,
      sleepAvgHours: sh.sleepAvgHours ?? null,
      sleepQuality: (sh.sleepQuality as any) ?? null,
      isSexuallyActive: sh.isSexuallyActive ?? null,
      waterIntake: sh.waterIntake ?? null,
      caffeineUse: null as string | null,
      dailyScreenTime: null as string | null,
      createdAt: ts,
      updatedAt: toDate(sh.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientSocialHistory)
      .values(row)
      .onConflictDoUpdate({ target: patientSocialHistory.patientId, set: row });
  }

  // 14. family history  (local: condition, affectedRelative, side, ageOfOnset, isDeceased, ageAtDeath, causeOfDeath, notes)
  for (const fh of record.familyHistories) {
    if (pendingEntityIds.has(fh.id)) continue;
    const row = {
      id: fh.id,
      patientId,
      condition: fh.conditionName,
      affectedRelative: fh.relation ?? null,
      side: null as ('Paternal' | 'Maternal' | 'Both' | 'Unknown' | null),
      ageOfOnset: fh.ageOfOnset ?? null,
      isDeceased: fh.isDeceased,
      ageAtDeath: null as number | null,
      causeOfDeath: null as string | null,
      notes: fh.notes ?? null,
      createdAt: ts,
      updatedAt: toDate(fh.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientFamilyHistory)
      .values(row)
      .onConflictDoUpdate({ target: patientFamilyHistory.id, set: row });
  }

  // 15. occupation (singleton)  (local: occupation, employer, industry, workEnvironment, yearsInOccupation, hazardExposure)
  if (record.occupation && !pendingEntityIds.has(patientId)) {
    const occ = record.occupation;
    const row = {
      id: occ.id,
      patientId,
      occupation: occ.occupation ?? null,
      employer: occ.employer ?? null,
      industry: occ.industry ?? null,
      workEnvironment: (occ.workEnvironment as any) ?? null,
      yearsInOccupation: occ.yearsInOccupation ?? null,
      hazardExposure: occ.hazardExposure ?? null,
      createdAt: ts,
      updatedAt: toDate(occ.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientOccupation)
      .values(row)
      .onConflictDoUpdate({ target: patientOccupation.patientId, set: row });
  }

  // 16. travel history  (local: destination, cityProvince, departureDate, returnDate, purpose, illnessDuringAfterTravel)
  for (const th of record.travelHistories) {
    if (pendingEntityIds.has(th.id)) continue;
    const row = {
      id: th.id,
      patientId,
      destination: th.destination,
      cityProvince: th.cityProvince ?? null,
      departureDate: th.departureDate ?? null,
      returnDate: th.returnDate ?? null,
      purpose: (th.purpose as any) ?? null,
      illnessDuringAfterTravel: th.illnessDuringAfterTravel ?? null,
      createdAt: ts,
      updatedAt: toDate(th.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientTravelHistory)
      .values(row)
      .onConflictDoUpdate({ target: patientTravelHistory.id, set: row });
  }

  // 17. obstetric profile (singleton)
  //     Local schema uses: gravida, para, abortion, livingChildren, lmp, cycleLength, etc.
  if (record.obstetricProfile && !pendingEntityIds.has(patientId)) {
    const op = record.obstetricProfile;
    const row = {
      id: op.id,
      patientId,
      gravida: op.gravida ?? null,
      para: op.para ?? null,
      abortion: op.abortusCount ?? null,
      livingChildren: op.livingChildren ?? null,
      lmp: op.lastMenstrualPeriod ?? null,
      ageAtMenarche: null as number | null,
      cycleLength: op.menstrualCycleLengthDays ?? null,
      cycleDuration: null as number | null,
      regularity: null as ('Regular' | 'Irregular' | null),
      dysmenorrheaSeverity: op.hasDysmenorrhea ? 'Mild' as const : 'None' as const,
      menopausalStatus: null as ('PreMenopausal' | 'Peri' | 'PostMenopausal' | 'NA' | null),
      ageAtMenopause: null as number | null,
      padsPerDay: null as number | null,
      ageAtOnsetSexualActivity: null as number | null,
      currentContraceptiveMethod: null as string | null,
      menstruationApplicable: true,
      deliveryCnt: null as number | null,
      deliveryType: null as string | null,
      fullTermDeliveries: null as number | null,
      prematureDeliveries: null as number | null,
      pregnancyInducedHypertension: null as boolean | null,
      onFamilyPlanning: null as boolean | null,
      pregnancyApplicable: true,
      createdAt: ts,
      updatedAt: toDate(op.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientObstetricProfile)
      .values(row)
      .onConflictDoUpdate({ target: patientObstetricProfile.patientId, set: row });
  }

  // 18. pregnancies  (local: year, outcome, gestationalAgeWeeks, deliveryType, birthWeightKg, complications, facility)
  for (const preg of record.pregnancies) {
    if (pendingEntityIds.has(preg.id)) continue;
    const row = {
      id: preg.id,
      patientId,
      year: preg.year ?? null,
      outcome: preg.outcome ?? null,
      gestationalAgeWeeks: preg.gestationalAgeWeeks ?? null,
      deliveryType: preg.deliveryType ?? null,
      birthWeightKg: preg.birthWeightKg ?? null,
      complications: preg.complications ?? null,
      facility: preg.facility ?? null,
      createdAt: ts,
      updatedAt: toDate(preg.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientPregnancies)
      .values(row)
      .onConflictDoUpdate({ target: patientPregnancies.id, set: row });
  }

  // 19. contraceptive history  (local: method, isCurrent, dateStarted, reasonForStopping)
  for (const ch of record.contraceptiveHistories) {
    if (pendingEntityIds.has(ch.id)) continue;
    const row = {
      id: ch.id,
      patientId,
      method: ch.method,
      isCurrent: ch.isCurrent,
      dateStarted: ch.dateStarted ?? null,
      reasonForStopping: ch.reasonForStopping ?? null,
      createdAt: ts,
      updatedAt: toDate(ch.updatedAt) ?? ts,
      syncedAt: ts,
      deletedAt: null,
    };
    await originalDb
      .insert(patientContraceptiveHistory)
      .values(row)
      .onConflictDoUpdate({ target: patientContraceptiveHistory.id, set: row });
  }

  // 20. male reproductive (singleton)  (local: hasVasectomy, vasectomyDate, conditions)
  if (record.maleReproductive && !pendingEntityIds.has(patientId)) {
    const mr = record.maleReproductive;
    const row = {
      id: mr.id,
      patientId,
      hasVasectomy: mr.hasVasectomy,
      vasectomyDate: mr.vasectomyDate ?? null,
      conditions: mr.conditions ?? null,
      createdAt: ts,
      updatedAt: toDate(mr.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientMaleReproductive)
      .values(row)
      .onConflictDoUpdate({ target: patientMaleReproductive.patientId, set: row });
  }

  // 21. dental & vision (singleton)  (local: dentistName, dentistClinic, orthodonticDevice, eyeDoctorName, correctiveLenses)
  if (record.dentalVision && !pendingEntityIds.has(patientId)) {
    const dv = record.dentalVision;
    const row = {
      id: dv.id,
      patientId,
      dentistName: dv.dentistName ?? null,
      dentistClinic: dv.dentistClinic ?? null,
      orthodonticDevice: dv.orthodonticDevice ?? null,
      eyeDoctorName: dv.eyeDoctorName ?? null,
      correctiveLenses: (dv.correctiveLenses as any) ?? null,
      createdAt: ts,
      updatedAt: toDate(dv.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientDentalVision)
      .values(row)
      .onConflictDoUpdate({ target: patientDentalVision.patientId, set: row });
  }

  // 22. mental health profile (singleton)
  //     Local schema: hasPriorDiagnosis, providerName, providerSpecialty, providerClinic, psychotherapyStatus
  //     API DTO has more fields — map best-effort
  if (record.mentalHealthProfile && !pendingEntityIds.has(patientId)) {
    const mh = record.mentalHealthProfile;
    const row = {
      id: mh.id,
      patientId,
      hasPriorDiagnosis: mh.hasDiagnosis,
      providerName: mh.therapistName ?? null,
      providerSpecialty: mh.therapyType ?? null,
      providerClinic: null as string | null,
      psychotherapyStatus: mh.therapistName ? 'Active' as const : 'None' as const,
      createdAt: ts,
      updatedAt: toDate(mh.updatedAt) ?? ts,
      syncedAt: ts,
    };
    await originalDb
      .insert(patientMentalHealthProfile)
      .values(row)
      .onConflictDoUpdate({ target: patientMentalHealthProfile.patientId, set: row });
  }

  // Web: persist the whole hydrated record before returning so a reload keeps it.
  await flushDatabaseSnapshot();
}

/**
 * Hydrates patient's 24-item PhilHealth NCD Risk Questionnaire from the Yakap API.
 */
export async function hydrateNcdQuestionnaire(
  patientId: string,
  ncd: PatientNcdQuestionnaireDto
): Promise<void> {
  await ensureDatabaseReady();
  const ts = now();
  const existingNcd = await originalDb.query.patientNcdQuestionnaire.findFirst({
    where: (t: any, { eq }: any) => eq(t.patientId, patientId),
  });

  const row: typeof patientNcdQuestionnaire.$inferInsert = {
    id: existingNcd?.id || patientId,
    patientId,
    qid1Yn: ncd.qid1Yn ?? null,
    qid2Yn: ncd.qid2Yn ?? null,
    qid3Yn: ncd.qid3Yn ?? null,
    qid4Yn: ncd.qid4Yn ?? null,
    qid5Ynx: ncd.qid5Ynx ?? null,
    qid6Yn: ncd.qid6Yn ?? null,
    qid7Yn: ncd.qid7Yn ?? null,
    qid8Yn: ncd.qid8Yn ?? null,
    qid9Yn: ncd.qid9Yn ?? null,
    qid10Yn: ncd.qid10Yn ?? null,
    qid11Yn: ncd.qid11Yn ?? null,
    qid12Yn: ncd.qid12Yn ?? null,
    qid13Yn: ncd.qid13Yn ?? null,
    qid14Yn: ncd.qid14Yn ?? null,
    qid15Yn: ncd.qid15Yn ?? null,
    qid16Yn: ncd.qid16Yn ?? null,
    qid17Abcde: ncd.qid17Abcde ?? null,
    qid18Yn: ncd.qid18Yn ?? null,
    qid19Yn: ncd.qid19Yn ?? null,
    qid19FbsMgdl: ncd.qid19FbsMgdl ? Number(ncd.qid19FbsMgdl) : null,
    qid19FbsMmol: ncd.qid19FbsMmol ? Number(ncd.qid19FbsMmol) : null,
    qid19FbsDate: ncd.qid19FbsDate ?? null,
    qid20Yn: ncd.qid20Yn ?? null,
    qid20CholeVal: ncd.qid20CholeVal ? Number(ncd.qid20CholeVal) : null,
    qid20CholeDate: ncd.qid20CholeDate ?? null,
    qid21Yn: ncd.qid21Yn ?? null,
    qid21KetonVal: ncd.qid21KetonVal ? Number(ncd.qid21KetonVal) : null,
    qid21KetonDate: ncd.qid21KetonDate ?? null,
    qid22Yn: ncd.qid22Yn ?? null,
    qid22ProteinVal: ncd.qid22ProteinVal ? Number(ncd.qid22ProteinVal) : null,
    qid22ProteinDate: ncd.qid22ProteinDate ?? null,
    qid23Yn: ncd.qid23Yn ?? null,
    qid24Yn: ncd.qid24Yn ?? null,
    createdAt: existingNcd?.createdAt ?? ts,
    updatedAt: ts,
    syncedAt: ts,
  };

  await originalDb
    .insert(patientNcdQuestionnaire)
    .values(row)
    .onConflictDoUpdate({ target: patientNcdQuestionnaire.patientId, set: row });
  await flushDatabaseSnapshot();
}
