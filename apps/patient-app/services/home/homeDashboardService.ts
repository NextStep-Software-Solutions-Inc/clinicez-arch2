import * as Crypto from 'expo-crypto';
import { format, parseISO, subMinutes } from 'date-fns';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ensureDatabaseReady, flushDatabaseSnapshot, originalDb } from '../../db/index';
import {
  appointments,
  clinicMemberships,
  consultations,
  emergencyContacts,
  notifications,
  patientAllergies,
  patientGovernmentIds,
  patientHealthcareProviders,
  patientHomeCache,
  patientMedicationLogs,
  patientMedications,
  patientVitalTelemetry,
  patients,
  vitalSigns,
  type Appointment,
  type PatientMedication,
  type PatientMedicationLog,
  type PatientVitalTelemetry,
  type VitalSign,
} from '../../db/schema/index';
import {
  getPatientHomeDashboard,
  postAppointmentCheckIn,
  postMedicationIntakeLog,
  postPatientVitals,
  postWelcomeStepVisited,
  type AppointmentCarouselState,
  type AppointmentCheckInResponseDto,
  type DailyMindfulMomentDto,
  type HomeAppointmentCardDto,
  type HomeAppointmentsSectionDto,
  type HomeRecentVitalsDto,
  type LogMedicationIntakeRequestDto,
  type LogPatientVitalsRequestDto,
  type PatientHomeDashboardDto,
  type TodayMedicationScheduleDto,
  type TodayMedicationScheduleItemDto,
  type VitalSignsEntryDto,
  type VitalSparklinePointDto,
  type WelcomeChecklistDto,
  type WelcomeStepKey,
} from '../api/homeApi';

export const HEADER_REVEAL_SCROLL_START = 20;
export const HEADER_REVEAL_SCROLL_END = 76;

export function extractInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'PT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const WELCOME_STEP_KEYS: readonly WelcomeStepKey[] = [
  'health_profile',
  'link_insurance',
  'primary_clinic',
] as const;

const CLINICAL_WELLNESS_TIPS: readonly DailyMindfulMomentDto[] = [
  {
    id: 'hydration-check',
    category: 'DAILY MINDFUL MOMENT',
    title: 'Hydration check',
    body: 'Hydration check: drinking 500ml water after lunch helps stabilize afternoon focus and resting heart rate.',
  },
  {
    id: 'paced-breathing',
    category: 'DAILY MINDFUL MOMENT',
    title: 'Paced breathing',
    body: 'Paced breathing: four slow 4-second inhales and 6-second exhales before blood pressure checks improve reading accuracy.',
  },
  {
    id: 'post-meal-walk',
    category: 'DAILY MINDFUL MOMENT',
    title: 'Post-meal movement',
    body: 'Gentle movement: a 10-minute walk within 30 minutes after meals supports steady post-meal blood glucose.',
  },
  {
    id: 'sleep-wind-down',
    category: 'DAILY MINDFUL MOMENT',
    title: 'Consistent sleep window',
    body: 'Restorative sleep: dimming bright screens 30 minutes before bed supports deeper slow-wave recovery.',
  },
];

export interface VitalTelemetrySample {
  id: string;
  measuredAt?: string;
  recordedAt?: string;
  heartRateBpm?: number | null;
  bpSystolic?: number | null;
  bpDiastolic?: number | null;
  fastingBloodGlucose?: number | null;
  sleepDurationMinutes?: number | null;
  deepSleepMinutes?: number | null;
  source?: string | null;
  facility?: string | null;
}

export function deriveClinicEzId(patientId: string): string {
  const clean = patientId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (clean.length >= 6) {
    let numericHash = 0;
    for (let i = 0; i < clean.length; i++) {
      numericHash = (numericHash * 31 + clean.charCodeAt(i)) % 1_000_000;
    }
    const padded = String(numericHash).padStart(6, '0');
    return `PC-${padded.slice(0, 4)}-${padded.slice(4, 6)}`;
  }
  return 'PC-0000-01';
}

export function formatBloodGroupDisplay(bloodType: string | null | undefined): string | null {
  if (!bloodType) return null;
  const map: Record<string, string> = {
    APositive: 'A+',
    ANegative: 'A-',
    BPositive: 'B+',
    BNegative: 'B-',
    ABPositive: 'AB+',
    ABNegative: 'AB-',
    OPositive: 'O+',
    ONegative: 'O-',
    'A+': 'A+',
    'A-': 'A-',
    'B+': 'B+',
    'B-': 'B-',
    'AB+': 'AB+',
    'AB-': 'AB-',
    'O+': 'O+',
    'O-': 'O-',
  };
  const trimmed = bloodType.trim();
  if (!trimmed || trimmed.toLowerCase() === 'unknown') return null;
  return map[trimmed] ?? trimmed;
}

export function parseVisitedStepsJson(raw: string | null | undefined): WelcomeStepKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<WelcomeStepKey>();
    for (const entry of parsed) {
      const normalized = String(entry ?? '').trim().toLowerCase() as WelcomeStepKey;
      if ((WELCOME_STEP_KEYS as readonly string[]).includes(normalized)) {
        seen.add(normalized);
      }
    }
    return Array.from(seen);
  } catch {
    return [];
  }
}

export function parseCheckedInAppointmentsJson(
  raw: string | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof val === 'string' && val.trim()) {
        out[key] = val;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function computeWelcomeChecklist(params: {
  visitedSteps: string[];
  hasHealthProfileData: boolean;
  hasInsuranceLinked: boolean;
  hasPrimaryClinic: boolean;
}): WelcomeChecklistDto {
  const visitedSet = new Set(
    params.visitedSteps
      .map((s) => s.trim().toLowerCase())
      .filter((s): s is WelcomeStepKey => (WELCOME_STEP_KEYS as readonly string[]).includes(s)),
  );
  const visitedSteps = WELCOME_STEP_KEYS.filter((k) => visitedSet.has(k));
  const completedCount = visitedSteps.length;
  const isHidden = completedCount >= WELCOME_STEP_KEYS.length;
  const currentStepNumber = Math.min(WELCOME_STEP_KEYS.length, completedCount + 1);
  return {
    visitedSteps,
    completedCount,
    currentStepNumber,
    isHidden,
    hasHealthProfileData: params.hasHealthProfileData,
    hasInsuranceLinked: params.hasInsuranceLinked,
    hasPrimaryClinic: params.hasPrimaryClinic,
  };
}

export function computeAppointmentsSection(
  appointmentRows: Appointment[],
  consultationCount: number,
  nowDate: Date = new Date(),
  checkedInByAppointmentId: Record<string, string> = {},
): HomeAppointmentsSectionDto {
  const nowMs = nowDate.getTime();
  const upcoming: HomeAppointmentCardDto[] = [];
  let pastCount = consultationCount;

  for (const row of appointmentRows) {
    let scheduledDate: Date;
    try {
      scheduledDate = parseISO(row.scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) continue;
    } catch {
      continue;
    }

    const statusLower = (row.status ?? '').toLowerCase();
    const isCanceled = statusLower === 'canceled' || statusLower === 'cancelled';
    const isPastStatus =
      statusLower === 'completed' || statusLower === 'no_show' || statusLower === 'noshow';

    if (isCanceled) {
      continue;
    }

    if (isPastStatus || scheduledDate.getTime() < nowMs - 60 * 60 * 1000) {
      pastCount += 1;
      continue;
    }

    let rawCheckedInAt: string | null = null;
    try {
      const parsedRaw = JSON.parse(row.rawJson);
      if (parsedRaw && typeof parsedRaw.checkedInAt === 'string') {
        rawCheckedInAt = parsedRaw.checkedInAt;
      }
    } catch {
      rawCheckedInAt = null;
    }

    const checkedInAt = checkedInByAppointmentId[row.id] ?? rawCheckedInAt ?? null;
    const checkInOpensAt = subMinutes(scheduledDate, 15).toISOString();
    upcoming.push({
      id: row.id,
      clinicId: row.clinicId,
      clinicName: row.clinicName,
      clinicAddress: row.clinicAddress ?? null,
      providerId: row.providerId,
      providerName: row.providerName,
      providerSpecialty: row.providerSpecialty ?? 'General Medicine',
      providerAvatarUrl: row.providerAvatarUrl ?? null,
      scheduledAt: row.scheduledAt,
      checkInOpensAt,
      durationMinutes: row.durationMinutes ?? 30,
      status: row.status,
      serviceType: row.serviceType ?? null,
      checkedInAt,
      isCheckedIn: Boolean(checkedInAt),
    });
  }

  upcoming.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  let carouselState: AppointmentCarouselState;
  if (upcoming.length > 0) {
    carouselState = 'active';
  } else if (pastCount > 0) {
    carouselState = 'returning_empty';
  } else {
    carouselState = 'first_time';
  }

  return {
    carouselState,
    scheduledCount: upcoming.length,
    pastVisitsCount: pastCount,
    upcomingItems: upcoming,
  };
}

export function mergeVitalSamples(
  clinicalVitals: VitalSign[],
  telemetryRows: PatientVitalTelemetry[],
): VitalTelemetrySample[] {
  const byId = new Map<string, VitalTelemetrySample>();

  for (const row of clinicalVitals) {
    const key = row.serverId ?? row.id;
    byId.set(key, {
      id: key,
      measuredAt: row.measuredAt,
      heartRateBpm: row.heartRateBpm,
      bpSystolic: row.bpSystolic,
      bpDiastolic: row.bpDiastolic,
      fastingBloodGlucose: row.fastingBloodGlucose,
      facility: row.facility,
    });
  }

  for (const row of telemetryRows) {
    const key = row.serverId ?? row.id;
    const prev = byId.get(key);
    byId.set(key, {
      id: key,
      measuredAt: row.recordedAt,
      recordedAt: row.recordedAt,
      heartRateBpm: row.heartRateBpm ?? prev?.heartRateBpm ?? null,
      bpSystolic: row.bpSystolic ?? prev?.bpSystolic ?? null,
      bpDiastolic: row.bpDiastolic ?? prev?.bpDiastolic ?? null,
      fastingBloodGlucose: row.fastingBloodGlucose ?? prev?.fastingBloodGlucose ?? null,
      sleepDurationMinutes: row.sleepDurationMinutes ?? null,
      deepSleepMinutes: row.deepSleepMinutes ?? null,
      source: row.source ?? prev?.facility ?? null,
      facility: prev?.facility ?? null,
    });
  }

  return Array.from(byId.values());
}

export function computeRecentVitals(rows: VitalTelemetrySample[]): HomeRecentVitalsDto {
  const getIso = (r: VitalTelemetrySample): string => r.measuredAt ?? r.recordedAt ?? '';
  const sorted = [...rows].sort((a, b) => getIso(b).localeCompare(getIso(a)));
  const chronological = [...sorted].reverse();

  const latestHr = sorted.find((r) => typeof r.heartRateBpm === 'number' && r.heartRateBpm > 0);
  const previousHr = sorted.find(
    (r) => r.id !== latestHr?.id && typeof r.heartRateBpm === 'number' && r.heartRateBpm > 0,
  );
  const latestBp = sorted.find(
    (r) =>
      typeof r.bpSystolic === 'number' &&
      r.bpSystolic > 0 &&
      typeof r.bpDiastolic === 'number' &&
      r.bpDiastolic > 0,
  );
  const latestGlucose = sorted.find(
    (r) => typeof r.fastingBloodGlucose === 'number' && r.fastingBloodGlucose > 0,
  );
  const latestSleep = sorted.find(
    (r) => typeof r.sleepDurationMinutes === 'number' && r.sleepDurationMinutes > 0,
  );
  const previousSleep = sorted.find(
    (r) =>
      r.id !== latestSleep?.id &&
      typeof r.sleepDurationMinutes === 'number' &&
      r.sleepDurationMinutes > 0,
  );

  const hasAnyReadings = Boolean(latestHr || latestBp || latestGlucose || latestSleep);

  const heartRateSeries: VitalSparklinePointDto[] = chronological
    .filter((r) => typeof r.heartRateBpm === 'number' && r.heartRateBpm > 0)
    .slice(-7)
    .map((r) => ({ recordedAt: getIso(r), value: r.heartRateBpm! }));

  const bloodPressureSeries: VitalSparklinePointDto[] = chronological
    .filter((r) => typeof r.bpSystolic === 'number' && r.bpSystolic > 0)
    .slice(-7)
    .map((r) => ({
      recordedAt: getIso(r),
      value: r.bpSystolic!,
      secondaryValue: r.bpDiastolic ?? null,
    }));

  const bloodGlucoseSeries: VitalSparklinePointDto[] = chronological
    .filter((r) => typeof r.fastingBloodGlucose === 'number' && r.fastingBloodGlucose > 0)
    .slice(-7)
    .map((r) => ({ recordedAt: getIso(r), value: Number(r.fastingBloodGlucose!) }));

  const sleepSeries: VitalSparklinePointDto[] = chronological
    .filter((r) => typeof r.sleepDurationMinutes === 'number' && r.sleepDurationMinutes > 0)
    .slice(-5)
    .map((r) => ({
      recordedAt: getIso(r),
      value: r.sleepDurationMinutes!,
      secondaryValue: r.deepSleepMinutes ?? null,
    }));

  let bpStatus: string | null = null;
  if (latestBp?.bpSystolic && latestBp?.bpDiastolic) {
    if (latestBp.bpSystolic < 120 && latestBp.bpDiastolic < 80) bpStatus = 'Optimal';
    else if (latestBp.bpSystolic < 130 && latestBp.bpDiastolic < 85) bpStatus = 'Normal';
    else bpStatus = 'Elevated';
  }

  let glucoseStatus: string | null = null;
  if (typeof latestGlucose?.fastingBloodGlucose === 'number') {
    const g = latestGlucose.fastingBloodGlucose;
    if (g >= 70 && g <= 99) glucoseStatus = 'Normal 70–99';
    else if (g < 70) glucoseStatus = 'Low <70';
    else glucoseStatus = 'Review >99';
  }

  const hrDelta =
    latestHr?.heartRateBpm != null && previousHr?.heartRateBpm != null
      ? latestHr.heartRateBpm - previousHr.heartRateBpm
      : null;

  const sleepDeltaPercent =
    latestSleep?.sleepDurationMinutes != null &&
    previousSleep?.sleepDurationMinutes != null &&
    previousSleep.sleepDurationMinutes > 0
      ? Math.round(
          ((latestSleep.sleepDurationMinutes - previousSleep.sleepDurationMinutes) /
            previousSleep.sleepDurationMinutes) *
            100,
        )
      : null;

  const topRow = sorted[0];

  return {
    hasAnyReadings,
    lastRecordedAt: hasAnyReadings && topRow ? getIso(topRow) || null : null,
    lastSource: hasAnyReadings ? (topRow?.source ?? topRow?.facility ?? 'Manual Log') : null,
    heartRateBpm: latestHr?.heartRateBpm ?? null,
    heartRateDeltaBpm: hrDelta,
    heartRateSeries,
    systolicBp: latestBp?.bpSystolic ?? null,
    diastolicBp: latestBp?.bpDiastolic ?? null,
    bloodPressureStatus: bpStatus,
    bloodPressureSeries,
    fastingBloodGlucoseMgDl:
      latestGlucose?.fastingBloodGlucose != null
        ? Math.round(latestGlucose.fastingBloodGlucose)
        : null,
    bloodGlucoseStatus: glucoseStatus,
    bloodGlucoseSeries,
    sleepDurationMinutes: latestSleep?.sleepDurationMinutes ?? null,
    deepSleepMinutes: latestSleep?.deepSleepMinutes ?? null,
    sleepDeltaPercent,
    sleepSeries,
  };
}

export function inferScheduledTimeLabel(frequency: string | null | undefined, index: number): string {
  const f = (frequency ?? '').toLowerCase();
  if (f.includes('bedtime') || f.includes('night') || f.includes('evening') || f.includes('dinner')) {
    return '7:00 PM';
  }
  if (f.includes('noon') || f.includes('lunch') || f.includes('afternoon')) {
    return '12:30 PM';
  }
  if (f.includes('morning') || f.includes('breakfast')) {
    return '8:00 AM';
  }
  const slots = ['8:00 AM', '1:00 PM', '7:00 PM', '9:00 PM'];
  return slots[index % slots.length];
}

export function computeTodayMedicationSchedule(
  medications: PatientMedication[],
  todayLogs: PatientMedicationLog[],
): TodayMedicationScheduleDto {
  const activeMeds = medications.filter((m) => m.isActive && !m.deletedAt);
  const logsByMedId = new Map<string, PatientMedicationLog>();
  for (const log of todayLogs) {
    logsByMedId.set(log.medicationId, log);
  }

  const items: TodayMedicationScheduleItemDto[] = activeMeds.map((med, idx) => {
    const log = logsByMedId.get(med.id) ?? (med.serverId ? logsByMedId.get(med.serverId) : undefined);
    const scheduledTimeLabel = log?.scheduledTimeLabel ?? inferScheduledTimeLabel(med.frequency, idx);
    const instructionParts = [med.dosageForm, med.frequency, med.indication].filter(Boolean);
    return {
      medicationId: med.serverId ?? med.id,
      medicationName: med.drugName,
      dosage: med.dosage ?? null,
      frequency: med.frequency ?? null,
      route: med.dosageForm ?? null,
      instructions: instructionParts.length > 0 ? instructionParts.join(' • ') : med.frequency ?? null,
      scheduledTimeLabel,
      isTakenToday: Boolean(log),
      takenAt: log?.takenAt ?? null,
      logId: log?.id ?? null,
    };
  });

  return {
    activeCount: items.length,
    items,
  };
}

export function computeDailyMindfulMoment(nowDate: Date = new Date()): DailyMindfulMomentDto {
  const startOfYear = new Date(nowDate.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((nowDate.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  return CLINICAL_WELLNESS_TIPS[Math.abs(dayOfYear) % CLINICAL_WELLNESS_TIPS.length];
}

export interface FallbackAuthUser {
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
}

export async function loadLocalHomeDashboardSnapshot(
  patientId: string | null | undefined,
  fallbackUser?: FallbackAuthUser,
): Promise<PatientHomeDashboardDto> {
  if (!patientId) {
    const first = fallbackUser?.firstName ?? 'Patient';
    const last = fallbackUser?.lastName ?? '';
    const full = fallbackUser?.fullName ?? ([first, last].filter(Boolean).join(' ') || 'Patient');
    return {
      healthPass: {
        patientId: '',
        clinicEzId: 'PC-0000-01',
        fullName: full,
        firstName: first,
        lastName: last,
        bloodType: null,
        bloodGroupDisplay: null,
        avatarUrl: fallbackUser?.imageUrl ?? null,
        unreadNotificationsCount: 0,
      },
      welcomeChecklist: computeWelcomeChecklist({
        visitedSteps: [],
        hasHealthProfileData: false,
        hasInsuranceLinked: false,
        hasPrimaryClinic: false,
      }),
      appointments: {
        carouselState: 'first_time',
        scheduledCount: 0,
        pastVisitsCount: 0,
        upcomingItems: [],
      },
      recentVitals: computeRecentVitals([]),
      todaySchedule: { activeCount: 0, items: [] },
      mindfulMoment: computeDailyMindfulMoment(),
    };
  }

  await ensureDatabaseReady();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const [
    patientRows,
    homeCacheRows,
    appointmentRows,
    consultationRows,
    vitalRows,
    telemetryRows,
    medicationRows,
    todayMedLogs,
    unreadNotifs,
    allergyRows,
    emergencyRows,
    govIdRows,
    clinicMemRows,
    providerRows,
  ] = await Promise.all([
    originalDb.select().from(patients).where(eq(patients.id, patientId)).limit(1),
    originalDb.select().from(patientHomeCache).where(eq(patientHomeCache.patientId, patientId)).limit(1),
    originalDb.select().from(appointments).where(eq(appointments.patientId, patientId)),
    originalDb.select().from(consultations).where(eq(consultations.patientId, patientId)),
    originalDb
      .select()
      .from(vitalSigns)
      .where(eq(vitalSigns.patientId, patientId))
      .orderBy(desc(vitalSigns.measuredAt))
      .limit(14),
    originalDb
      .select()
      .from(patientVitalTelemetry)
      .where(eq(patientVitalTelemetry.patientId, patientId))
      .orderBy(desc(patientVitalTelemetry.recordedAt))
      .limit(14),
    originalDb
      .select()
      .from(patientMedications)
      .where(and(eq(patientMedications.patientId, patientId), isNull(patientMedications.deletedAt))),
    originalDb
      .select()
      .from(patientMedicationLogs)
      .where(
        and(
          eq(patientMedicationLogs.patientId, patientId),
          eq(patientMedicationLogs.logDate, todayStr),
        ),
      ),
    originalDb
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.patientId, patientId),
          eq(notifications.isRead, false),
          isNull(notifications.deletedAt),
        ),
      ),
    originalDb
      .select()
      .from(patientAllergies)
      .where(and(eq(patientAllergies.patientId, patientId), isNull(patientAllergies.deletedAt)))
      .limit(1),
    originalDb
      .select()
      .from(emergencyContacts)
      .where(and(eq(emergencyContacts.patientId, patientId), isNull(emergencyContacts.deletedAt)))
      .limit(1),
    originalDb
      .select()
      .from(patientGovernmentIds)
      .where(eq(patientGovernmentIds.patientId, patientId))
      .limit(1),
    originalDb
      .select()
      .from(clinicMemberships)
      .where(eq(clinicMemberships.patientId, patientId))
      .limit(1),
    originalDb
      .select()
      .from(patientHealthcareProviders)
      .where(
        and(
          eq(patientHealthcareProviders.patientId, patientId),
          isNull(patientHealthcareProviders.deletedAt),
        ),
      )
      .limit(1),
  ]);

  const p = patientRows[0];
  const cacheRow = homeCacheRows[0];
  const firstName = p?.firstName ?? fallbackUser?.firstName ?? 'Patient';
  const lastName = p?.lastName ?? fallbackUser?.lastName ?? '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Patient';
  const bloodGroupDisplay = formatBloodGroupDisplay(p?.bloodType);

  const visitedSteps = parseVisitedStepsJson(cacheRow?.welcomeVisitedStepsJson);
  const checkedInMap = parseCheckedInAppointmentsJson(cacheRow?.checkedInAppointmentsJson);

  const hasHealthProfileData = Boolean(
    bloodGroupDisplay || allergyRows.length > 0 || emergencyRows.length > 0,
  );
  const gov = govIdRows[0];
  const hasInsuranceLinked = Boolean(
    gov?.philhealthId ||
      gov?.hmoPolicyNumber ||
      gov?.hmoProvider ||
      gov?.sssNumber ||
      gov?.gsisNumber,
  );
  const hasPrimaryClinic = Boolean(clinicMemRows.length > 0 || providerRows.length > 0);

  return {
    healthPass: {
      patientId,
      clinicEzId: cacheRow?.clinicEzId ?? deriveClinicEzId(patientId),
      fullName,
      firstName,
      lastName,
      bloodType: p?.bloodType ?? null,
      bloodGroupDisplay,
      avatarUrl: p?.avatarUrl ?? fallbackUser?.imageUrl ?? null,
      unreadNotificationsCount: unreadNotifs.length,
    },
    welcomeChecklist: computeWelcomeChecklist({
      visitedSteps,
      hasHealthProfileData,
      hasInsuranceLinked,
      hasPrimaryClinic,
    }),
    appointments: computeAppointmentsSection(
      appointmentRows,
      consultationRows.length,
      new Date(),
      checkedInMap,
    ),
    recentVitals: computeRecentVitals(mergeVitalSamples(vitalRows, telemetryRows)),
    todaySchedule: computeTodayMedicationSchedule(medicationRows, todayMedLogs),
    mindfulMoment: computeDailyMindfulMoment(),
  };
}

async function cacheServerDashboardToSqlite(
  patientId: string,
  remote: PatientHomeDashboardDto,
): Promise<void> {
  await ensureDatabaseReady();
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  const [existingPatients, existingCache] = await Promise.all([
    originalDb.select().from(patients).where(eq(patients.id, patientId)).limit(1),
    originalDb
      .select()
      .from(patientHomeCache)
      .where(eq(patientHomeCache.patientId, patientId))
      .limit(1),
  ]);

  if (existingPatients.length > 0) {
    const localVisited = parseVisitedStepsJson(existingCache[0]?.welcomeVisitedStepsJson);
    const mergedVisited = Array.from(
      new Set([...localVisited, ...remote.welcomeChecklist.visitedSteps]),
    );
    const localCheckedIn = parseCheckedInAppointmentsJson(
      existingCache[0]?.checkedInAppointmentsJson,
    );
    for (const appt of remote.appointments.upcomingItems) {
      if (appt.checkedInAt) {
        localCheckedIn[appt.id] = appt.checkedInAt;
      }
    }

    await originalDb
      .insert(patientHomeCache)
      .values({
        patientId,
        clinicEzId: remote.healthPass.clinicEzId,
        welcomeVisitedStepsJson: JSON.stringify(mergedVisited),
        checkedInAppointmentsJson: JSON.stringify(localCheckedIn),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: patientHomeCache.patientId,
        set: {
          clinicEzId: remote.healthPass.clinicEzId,
          welcomeVisitedStepsJson: JSON.stringify(mergedVisited),
          checkedInAppointmentsJson: JSON.stringify(localCheckedIn),
          updatedAt: now,
        },
      });

    if (remote.healthPass.bloodGroupDisplay || remote.healthPass.avatarUrl) {
      await originalDb
        .update(patients)
        .set({
          ...(remote.healthPass.bloodGroupDisplay
            ? { bloodType: remote.healthPass.bloodGroupDisplay }
            : {}),
          ...(remote.healthPass.avatarUrl ? { avatarUrl: remote.healthPass.avatarUrl } : {}),
          updatedAt: now,
        })
        .where(eq(patients.id, patientId));
    }

    if (remote.recentVitals.hasAnyReadings && remote.recentVitals.lastRecordedAt) {
      const snapshotId = `${patientId}_latest_${remote.recentVitals.lastRecordedAt}`;
      await originalDb
        .insert(patientVitalTelemetry)
        .values({
          id: snapshotId,
          patientId,
          recordedAt: remote.recentVitals.lastRecordedAt,
          heartRateBpm: remote.recentVitals.heartRateBpm ?? null,
          bpSystolic: remote.recentVitals.systolicBp ?? null,
          bpDiastolic: remote.recentVitals.diastolicBp ?? null,
          fastingBloodGlucose: remote.recentVitals.fastingBloodGlucoseMgDl ?? null,
          sleepDurationMinutes: remote.recentVitals.sleepDurationMinutes ?? null,
          deepSleepMinutes: remote.recentVitals.deepSleepMinutes ?? null,
          source: remote.recentVitals.lastSource ?? null,
          syncedAt: now,
          serverId: snapshotId,
        })
        .onConflictDoUpdate({
          target: patientVitalTelemetry.id,
          set: {
            heartRateBpm: remote.recentVitals.heartRateBpm ?? null,
            bpSystolic: remote.recentVitals.systolicBp ?? null,
            bpDiastolic: remote.recentVitals.diastolicBp ?? null,
            fastingBloodGlucose: remote.recentVitals.fastingBloodGlucoseMgDl ?? null,
            sleepDurationMinutes: remote.recentVitals.sleepDurationMinutes ?? null,
            deepSleepMinutes: remote.recentVitals.deepSleepMinutes ?? null,
            source: remote.recentVitals.lastSource ?? null,
            syncedAt: now,
          },
        });
    }
  }

  for (const item of remote.todaySchedule.items) {
    if (item.isTakenToday && item.takenAt) {
      const logId = item.logId ?? `${patientId}_${item.medicationId}_${todayStr}`;
      try {
        await originalDb
          .insert(patientMedicationLogs)
          .values({
            id: logId,
            patientId,
            medicationId: item.medicationId,
            logDate: todayStr,
            scheduledTimeLabel: item.scheduledTimeLabel,
            takenAt: item.takenAt,
            syncedAt: now,
            serverId: item.logId ?? logId,
          })
          .onConflictDoUpdate({
            target: patientMedicationLogs.id,
            set: {
              takenAt: item.takenAt,
              scheduledTimeLabel: item.scheduledTimeLabel,
              syncedAt: now,
            },
          });
      } catch {
        // Medication row may not yet be synced locally; ignore FK mismatch gracefully
      }
    }
  }

  await flushDatabaseSnapshot();
}

export async function fetchAndCacheHomeDashboard(
  getToken: () => Promise<string | null>,
  patientId: string | null | undefined,
  fallbackUser?: FallbackAuthUser,
): Promise<{ data: PatientHomeDashboardDto; fromServer: boolean }> {
  if (!patientId) {
    return {
      data: await loadLocalHomeDashboardSnapshot(null, fallbackUser),
      fromServer: false,
    };
  }

  try {
    const remote = await getPatientHomeDashboard(getToken, patientId);
    await cacheServerDashboardToSqlite(patientId, remote);
    const localUnread = (await loadLocalHomeDashboardSnapshot(patientId, fallbackUser)).healthPass
      .unreadNotificationsCount;
    const merged: PatientHomeDashboardDto = {
      ...remote,
      healthPass: {
        ...remote.healthPass,
        avatarUrl: remote.healthPass.avatarUrl ?? fallbackUser?.imageUrl ?? null,
        unreadNotificationsCount: Math.max(
          remote.healthPass.unreadNotificationsCount ?? 0,
          localUnread,
        ),
      },
    };
    return { data: merged, fromServer: true };
  } catch {
    const local = await loadLocalHomeDashboardSnapshot(patientId, fallbackUser);
    return { data: local, fromServer: false };
  }
}

export async function markWelcomeStepVisited(
  getToken: () => Promise<string | null>,
  patientId: string,
  stepKey: WelcomeStepKey,
): Promise<WelcomeChecklistDto> {
  await ensureDatabaseReady();
  const now = new Date();
  const [existingPatients, existingCache] = await Promise.all([
    originalDb.select().from(patients).where(eq(patients.id, patientId)).limit(1),
    originalDb
      .select()
      .from(patientHomeCache)
      .where(eq(patientHomeCache.patientId, patientId))
      .limit(1),
  ]);

  const currentSteps = parseVisitedStepsJson(existingCache[0]?.welcomeVisitedStepsJson);
  const nextSteps = Array.from(new Set([...currentSteps, stepKey]));

  if (existingPatients.length > 0) {
    await originalDb
      .insert(patientHomeCache)
      .values({
        patientId,
        clinicEzId: existingCache[0]?.clinicEzId ?? deriveClinicEzId(patientId),
        welcomeVisitedStepsJson: JSON.stringify(nextSteps),
        checkedInAppointmentsJson: existingCache[0]?.checkedInAppointmentsJson ?? '{}',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: patientHomeCache.patientId,
        set: {
          welcomeVisitedStepsJson: JSON.stringify(nextSteps),
          updatedAt: now,
        },
      });
    await flushDatabaseSnapshot();
  }

  try {
    const remoteChecklist = await postWelcomeStepVisited(getToken, patientId, stepKey);
    const mergedSteps = Array.from(new Set([...nextSteps, ...remoteChecklist.visitedSteps]));
    if (existingPatients.length > 0) {
      await originalDb
        .insert(patientHomeCache)
        .values({
          patientId,
          clinicEzId: existingCache[0]?.clinicEzId ?? deriveClinicEzId(patientId),
          welcomeVisitedStepsJson: JSON.stringify(mergedSteps),
          checkedInAppointmentsJson: existingCache[0]?.checkedInAppointmentsJson ?? '{}',
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: patientHomeCache.patientId,
          set: {
            welcomeVisitedStepsJson: JSON.stringify(mergedSteps),
            updatedAt: new Date(),
          },
        });
      await flushDatabaseSnapshot();
    }
    return computeWelcomeChecklist({
      visitedSteps: mergedSteps,
      hasHealthProfileData: remoteChecklist.hasHealthProfileData,
      hasInsuranceLinked: remoteChecklist.hasInsuranceLinked,
      hasPrimaryClinic: remoteChecklist.hasPrimaryClinic,
    });
  } catch {
    return computeWelcomeChecklist({
      visitedSteps: nextSteps,
      hasHealthProfileData: false,
      hasInsuranceLinked: false,
      hasPrimaryClinic: false,
    });
  }
}

export async function logPatientVitals(
  getToken: () => Promise<string | null>,
  patientId: string,
  payload: LogPatientVitalsRequestDto,
): Promise<VitalSignsEntryDto> {
  await ensureDatabaseReady();
  const nowIso = payload.recordedAt ?? new Date().toISOString();
  const source = payload.source ?? 'Manual Log';

  try {
    const created = await postPatientVitals(getToken, patientId, {
      ...payload,
      source,
      recordedAt: nowIso,
    });
    await originalDb
      .insert(patientVitalTelemetry)
      .values({
        id: created.id,
        patientId,
        recordedAt: created.recordedAt,
        heartRateBpm: created.heartRateBpm ?? null,
        bpSystolic: created.systolicBp ?? null,
        bpDiastolic: created.diastolicBp ?? null,
        fastingBloodGlucose: created.fastingBloodGlucoseMgDl ?? null,
        sleepDurationMinutes: created.sleepDurationMinutes ?? null,
        deepSleepMinutes: created.deepSleepMinutes ?? null,
        source: created.source ?? source,
        syncedAt: new Date(),
        serverId: created.id,
      })
      .onConflictDoUpdate({
        target: patientVitalTelemetry.id,
        set: {
          heartRateBpm: created.heartRateBpm ?? null,
          bpSystolic: created.systolicBp ?? null,
          bpDiastolic: created.diastolicBp ?? null,
          fastingBloodGlucose: created.fastingBloodGlucoseMgDl ?? null,
          sleepDurationMinutes: created.sleepDurationMinutes ?? null,
          deepSleepMinutes: created.deepSleepMinutes ?? null,
          source: created.source ?? source,
          syncedAt: new Date(),
        },
      });
    await flushDatabaseSnapshot();
    return created;
  } catch {
    const localId = Crypto.randomUUID();
    await originalDb.insert(patientVitalTelemetry).values({
      id: localId,
      patientId,
      recordedAt: nowIso,
      heartRateBpm: payload.heartRateBpm ?? null,
      bpSystolic: payload.systolicBp ?? null,
      bpDiastolic: payload.diastolicBp ?? null,
      fastingBloodGlucose: payload.fastingBloodGlucoseMgDl ?? null,
      sleepDurationMinutes: payload.sleepDurationMinutes ?? null,
      deepSleepMinutes: payload.deepSleepMinutes ?? null,
      source,
    });
    await flushDatabaseSnapshot();
    return {
      id: localId,
      recordedAt: nowIso,
      heartRateBpm: payload.heartRateBpm ?? null,
      systolicBp: payload.systolicBp ?? null,
      diastolicBp: payload.diastolicBp ?? null,
      fastingBloodGlucoseMgDl: payload.fastingBloodGlucoseMgDl ?? null,
      sleepDurationMinutes: payload.sleepDurationMinutes ?? null,
      deepSleepMinutes: payload.deepSleepMinutes ?? null,
      source,
    };
  }
}

export async function logMedicationDose(
  getToken: () => Promise<string | null>,
  patientId: string,
  medicationId: string,
  payload: LogMedicationIntakeRequestDto = {},
): Promise<TodayMedicationScheduleItemDto | null> {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = payload.takenAt ?? now.toISOString();
  const todayStr = format(now, 'yyyy-MM-dd');
  const scheduledLabel = payload.scheduledTimeLabel ?? '8:00 AM';

  try {
    const remoteItem = await postMedicationIntakeLog(getToken, patientId, medicationId, {
      scheduledTimeLabel: scheduledLabel,
      takenAt: nowIso,
      notes: payload.notes ?? null,
    });
    const logId = remoteItem.logId ?? Crypto.randomUUID();
    await originalDb
      .insert(patientMedicationLogs)
      .values({
        id: logId,
        patientId,
        medicationId,
        logDate: todayStr,
        scheduledTimeLabel: remoteItem.scheduledTimeLabel,
        takenAt: remoteItem.takenAt ?? nowIso,
        notes: payload.notes ?? null,
        syncedAt: now,
        serverId: remoteItem.logId ?? logId,
      })
      .onConflictDoUpdate({
        target: patientMedicationLogs.id,
        set: {
          takenAt: remoteItem.takenAt ?? nowIso,
          syncedAt: now,
        },
      });
    await flushDatabaseSnapshot();
    return remoteItem;
  } catch {
    const localLogId = `${patientId}_${medicationId}_${todayStr}`;
    await originalDb
      .insert(patientMedicationLogs)
      .values({
        id: localLogId,
        patientId,
        medicationId,
        logDate: todayStr,
        scheduledTimeLabel: scheduledLabel,
        takenAt: nowIso,
        notes: payload.notes ?? null,
      })
      .onConflictDoUpdate({
        target: patientMedicationLogs.id,
        set: { takenAt: nowIso },
      });
    await flushDatabaseSnapshot();

    const meds = await originalDb
      .select()
      .from(patientMedications)
      .where(eq(patientMedications.patientId, patientId));
    const med = meds.find((m) => m.id === medicationId || m.serverId === medicationId);
    if (!med) return null;
    return {
      medicationId,
      medicationName: med.drugName,
      dosage: med.dosage ?? null,
      frequency: med.frequency ?? null,
      route: med.dosageForm ?? null,
      instructions: med.frequency ?? null,
      scheduledTimeLabel: scheduledLabel,
      isTakenToday: true,
      takenAt: nowIso,
      logId: localLogId,
    };
  }
}

export async function checkInPatientAppointment(
  getToken: () => Promise<string | null>,
  patientId: string,
  appointmentId: string,
): Promise<AppointmentCheckInResponseDto> {
  await ensureDatabaseReady();
  const now = new Date();
  const nowIso = now.toISOString();

  const persistLocalCheckIn = async (checkedInAtIso: string) => {
    await originalDb
      .update(appointments)
      .set({ status: 'confirmed' })
      .where(eq(appointments.id, appointmentId));

    const [existingPatients, existingCache] = await Promise.all([
      originalDb.select().from(patients).where(eq(patients.id, patientId)).limit(1),
      originalDb
        .select()
        .from(patientHomeCache)
        .where(eq(patientHomeCache.patientId, patientId))
        .limit(1),
    ]);

    if (existingPatients.length > 0) {
      const checkedInMap = parseCheckedInAppointmentsJson(
        existingCache[0]?.checkedInAppointmentsJson,
      );
      checkedInMap[appointmentId] = checkedInAtIso;
      await originalDb
        .insert(patientHomeCache)
        .values({
          patientId,
          clinicEzId: existingCache[0]?.clinicEzId ?? deriveClinicEzId(patientId),
          welcomeVisitedStepsJson: existingCache[0]?.welcomeVisitedStepsJson ?? '[]',
          checkedInAppointmentsJson: JSON.stringify(checkedInMap),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: patientHomeCache.patientId,
          set: {
            checkedInAppointmentsJson: JSON.stringify(checkedInMap),
            updatedAt: now,
          },
        });
    }
    await flushDatabaseSnapshot();
  };

  try {
    const remote = await postAppointmentCheckIn(getToken, patientId, appointmentId);
    await persistLocalCheckIn(remote.checkedInAt);
    return remote;
  } catch {
    const existing = await originalDb
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId))
      .limit(1);
    await persistLocalCheckIn(nowIso);
    return {
      appointmentId,
      checkedInAt: nowIso,
      status: 'confirmed',
      clinicName: existing[0]?.clinicName ?? 'Clinic',
      providerName: existing[0]?.providerName ?? 'Provider',
    };
  }
}
