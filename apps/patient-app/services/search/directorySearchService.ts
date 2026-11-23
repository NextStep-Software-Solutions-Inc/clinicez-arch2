import { and, eq, isNull } from 'drizzle-orm';
import { ensureDatabaseReady, originalDb } from '../../db/index';
import { clinics, patientHealthcareProviders } from '../../db/schema/index';
import {
  searchDirectoryCatalog,
  type DirectoryAvailabilityWindowDto,
  type DirectoryClinicDto,
  type DirectoryDoctorAffiliationDto,
  type DirectoryDoctorDto,
  type DirectorySearchResponseDto,
  type DirectoryServiceDto,
  type PractitionerProfileDto,
  type SearchCategoryFilter,
  type SearchDirectoryCatalogParams,
} from '../api/homeApi';
import {
  getCachedNetworkDirectory,
  saveNetworkDirectorySnapshot,
  sortDirectoryClinics,
  sortDirectoryDoctors,
} from './networkDirectory';

const DAY_OF_WEEK_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
};

const SHORT_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function parseDayOfWeekIndex(dayOfWeek: string | number): number | null {
  const key = String(dayOfWeek).trim().toLowerCase();
  const idx = DAY_OF_WEEK_INDEX[key];
  return typeof idx === 'number' ? idx : null;
}

function formatDayShort(dayOfWeek: string | number): string {
  const idx = parseDayOfWeekIndex(dayOfWeek);
  return idx !== null ? SHORT_DAY_LABELS[idx] : String(dayOfWeek).slice(0, 3);
}

export function resolveAvailableDaysOfWeek(
  availabilities: DirectoryAvailabilityWindowDto[] | null | undefined,
): Set<number> {
  const days = new Set<number>();
  if (!availabilities || availabilities.length === 0) return days;
  for (const win of availabilities) {
    const idx = parseDayOfWeekIndex(win.dayOfWeek);
    if (idx !== null) {
      days.add(idx);
    }
  }
  return days;
}

export function hasDateStripAvailability(params: {
  day: Date;
  isSelected: boolean;
  isBookingPaused: boolean;
  isLoadingSlots: boolean;
  openSlotsCount: number;
  availableDaysOfWeek: ReadonlySet<number>;
}): boolean {
  if (params.isBookingPaused) return false;
  if (params.isSelected && !params.isLoadingSlots) {
    return params.openSlotsCount > 0;
  }
  return params.availableDaysOfWeek.has(params.day.getDay());
}

export function formatAvailabilityWindow(win: DirectoryAvailabilityWindowDto): string {
  const day = formatDayShort(win.dayOfWeek);
  return `${day} ${win.startTime}–${win.endTime}`;
}

export function formatAvailabilitySummary(
  availabilities: DirectoryAvailabilityWindowDto[] | null | undefined,
  maxItems = 3,
): string {
  if (!availabilities || availabilities.length === 0) return '';
  const items = availabilities.slice(0, maxItems).map(formatAvailabilityWindow);
  const extra = availabilities.length - items.length;
  return extra > 0 ? `${items.join(' • ')} +${extra}` : items.join(' • ');
}

export function resolveDoctorAffiliations(
  doctor: DirectoryDoctorDto,
): DirectoryDoctorAffiliationDto[] {
  if (doctor.affiliations && doctor.affiliations.length > 0) {
    return doctor.affiliations;
  }
  if (!doctor.clinicId && !doctor.clinicName) {
    return [];
  }
  return [
    {
      clinicId: doctor.clinicId,
      clinicName: doctor.clinicName,
      clinicAddress: doctor.clinicAddress,
      supportsAppointments: doctor.clinicSupportsAppointments,
      localSpecialty: doctor.specialty,
      nextAvailableAt: doctor.nextAvailableAt,
      nextAvailableLabel: doctor.nextAvailableLabel,
      availabilities: [],
      providerId: doctor.id,
    },
  ];
}

export function resolveDefaultAffiliation(
  doctor: DirectoryDoctorDto,
  preferredClinicId?: string | null,
): DirectoryDoctorAffiliationDto | null {
  const affiliations = resolveDoctorAffiliations(doctor);
  if (affiliations.length === 0) return null;
  if (preferredClinicId) {
    const exact = affiliations.find((a) => a.clinicId === preferredClinicId);
    if (exact) return exact;
  }
  return (
    affiliations.find((a) => a.supportsAppointments) ??
    affiliations.find((a) => a.clinicId === doctor.clinicId) ??
    affiliations[0] ??
    null
  );
}

export function applyDoctorAffiliation(
  doctor: DirectoryDoctorDto,
  affiliation: DirectoryDoctorAffiliationDto | null | undefined,
): DirectoryDoctorDto {
  if (!affiliation) return doctor;
  return {
    ...doctor,
    id: affiliation.providerId || doctor.id,
    clinicId: affiliation.clinicId,
    clinicName: affiliation.clinicName,
    clinicAddress: affiliation.clinicAddress,
    clinicSupportsAppointments: affiliation.supportsAppointments,
    specialty: affiliation.localSpecialty || doctor.specialty,
    nextAvailableAt: affiliation.nextAvailableAt,
    nextAvailableLabel: affiliation.nextAvailableLabel,
  };
}

export function practitionerProfileToDoctorDto(
  profile: PractitionerProfileDto,
  preferredClinicId?: string,
): DirectoryDoctorDto | null {
  if (!profile.affiliations || profile.affiliations.length === 0) return null;
  const primaryAff =
    (preferredClinicId
      ? profile.affiliations.find((a) => a.clinicId === preferredClinicId)
      : undefined) ??
    profile.affiliations.find((a) => a.supportsAppointments) ??
    profile.affiliations[0];
  return {
    id: primaryAff.providerId || profile.id,
    practitionerId: profile.practitionerId ?? profile.id,
    clinicId: primaryAff.clinicId,
    name: profile.name,
    specialty: primaryAff.localSpecialty || profile.primarySpecialty,
    role: profile.role,
    avatarUrl: profile.avatarUrl,
    professionalLicenseNo: profile.displayPrcLicenseNo,
    isVerified: profile.isVerified,
    clinicName: primaryAff.clinicName,
    clinicAddress: primaryAff.clinicAddress,
    clinicSupportsAppointments: primaryAff.supportsAppointments,
    nextAvailableAt: primaryAff.nextAvailableAt,
    nextAvailableLabel: primaryAff.nextAvailableLabel,
    tags: primaryAff.supportsAppointments ? ['Online Booking'] : ['Booking Paused'],
    bio: profile.bio,
    affiliations: profile.affiliations,
  };
}

export function isDirectoryBookingPaused(
  doctor: DirectoryDoctorDto | null | undefined,
  clinic?: DirectoryClinicDto | null,
): boolean {
  if (!doctor || !doctor.clinicId || !doctor.clinicSupportsAppointments) {
    return true;
  }
  return Boolean(clinic && !clinic.supportsAppointments);
}

export function filterOfflineSearchCatalog(params: {
  query: string;
  category: SearchCategoryFilter;
  doctors: DirectoryDoctorDto[];
  clinics: DirectoryClinicDto[];
  services: DirectoryServiceDto[];
  openNowOnly?: boolean;
  availableTodayOnly?: boolean;
}): DirectorySearchResponseDto {
  const q = params.query.trim().toLowerCase();

  const matchedDoctors = sortDirectoryDoctors(
    params.doctors.filter((d) => {
      const hasBookable =
        d.clinicSupportsAppointments ||
        Boolean(d.affiliations?.some((a) => a.supportsAppointments));
      if (params.availableTodayOnly && !hasBookable) return false;
      if (!q) return true;
      const matchesAffiliation = Boolean(
        d.affiliations?.some(
          (a) =>
            a.clinicName.toLowerCase().includes(q) ||
            (a.clinicAddress ?? '').toLowerCase().includes(q) ||
            a.localSpecialty.toLowerCase().includes(q),
        ),
      );
      return (
        d.name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q) ||
        d.clinicName.toLowerCase().includes(q) ||
        (d.clinicAddress ?? '').toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)) ||
        matchesAffiliation
      );
    }),
  );

  const matchedClinics = sortDirectoryClinics(
    params.clinics.filter((c) => {
      if (params.openNowOnly && !c.isOpenNow) return false;
      if (params.availableTodayOnly && !c.supportsAppointments) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.primarySpecialty ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q))
      );
    }),
  );

  const matchedServices = params.services.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.subtitle ?? '').toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      s.clinicName.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const counts = {
    all: matchedDoctors.length + matchedClinics.length + matchedServices.length,
    doctors: matchedDoctors.length,
    clinics: matchedClinics.length,
    services: matchedServices.length,
  };

  return {
    query: params.query.trim(),
    category: params.category,
    counts,
    doctors: params.category === 'all' || params.category === 'doctors' ? matchedDoctors : [],
    clinics: params.category === 'all' || params.category === 'clinics' ? matchedClinics : [],
    services: params.category === 'all' || params.category === 'services' ? matchedServices : [],
  };
}

export const filterDirectorySearchCatalog = filterOfflineSearchCatalog;

export function mapSqliteClinicToDirectoryClinic(
  c: typeof clinics.$inferSelect,
): DirectoryClinicDto {
  const supportsAppointments = Boolean(c.supportsAppointments);
  let parsedSpecialties: string[] = [];
  try {
    const parsed = JSON.parse(c.specialtiesJson || '[]');
    if (Array.isArray(parsed)) {
      parsedSpecialties = parsed.map((s) => String(s)).filter(Boolean);
    }
  } catch {
    parsedSpecialties = [];
  }
  const tags: string[] = [];
  tags.push(supportsAppointments ? 'Online Booking' : 'Booking Paused');
  if (c.isPublic) tags.push('Open Network');
  for (const spec of parsedSpecialties.slice(0, 2)) {
    if (!tags.includes(spec)) tags.push(spec);
  }
  const isGated = !c.isPublic && Boolean(c.inviteCode);
  return {
    id: c.id,
    name: c.name,
    primarySpecialty: parsedSpecialties[0] ?? 'Outpatient Care Center',
    description: c.description ?? null,
    address: c.address ?? null,
    logoUrl: c.logoUrl ?? null,
    coverImageUrl: c.coverImageUrl ?? null,
    operatingHours: null,
    openStatusLabel: supportsAppointments ? 'Open Today' : 'Booking Paused',
    isOpenNow: supportsAppointments,
    supportsAppointments,
    isPublic: Boolean(c.isPublic),
    isGated,
    isUnlocked: !isGated,
    activeMemberCount: c.activeMemberCount ?? 0,
    nextAvailableAt: null,
    nextAvailableLabel: supportsAppointments ? 'Schedule online' : 'Booking Paused',
    tags,
    isPlatformVerified: false,
  };
}

export function mapSqliteProviderToDirectoryDoctor(
  p: typeof patientHealthcareProviders.$inferSelect,
  mergedClinics: DirectoryClinicDto[],
): DirectoryDoctorDto {
  const matchedClinic = p.clinicHospital
    ? mergedClinics.find(
        (c) => c.name.trim().toLowerCase() === p.clinicHospital!.trim().toLowerCase(),
      )
    : undefined;
  const supportsAppointments = Boolean(matchedClinic?.supportsAppointments);
  const clinicName = p.clinicHospital ?? 'Care Team Contact';

  return {
    id: p.id,
    practitionerId: null,
    clinicId: matchedClinic?.id ?? '',
    name: p.name ?? 'Care Team Contact',
    specialty: p.specialty ?? p.providerType ?? 'General Practitioner',
    role: 'Doctor',
    avatarUrl: null,
    professionalLicenseNo: null,
    isVerified: false,
    clinicName,
    clinicAddress: matchedClinic?.address ?? null,
    clinicSupportsAppointments: supportsAppointments,
    nextAvailableAt: null,
    nextAvailableLabel: supportsAppointments ? 'Check availability' : 'Personal Care Contact',
    tags: ['Saved Care Team', p.providerType || 'Specialist'],
    bio: null,
    affiliations: matchedClinic
      ? [
          {
            clinicId: matchedClinic.id,
            clinicName: matchedClinic.name,
            clinicAddress: matchedClinic.address,
            supportsAppointments: matchedClinic.supportsAppointments,
            localSpecialty: p.specialty ?? 'General Practitioner',
            nextAvailableAt: null,
            nextAvailableLabel: matchedClinic.supportsAppointments
              ? 'Check availability'
              : 'Booking Paused',
            availabilities: [],
            providerId: p.id,
          },
        ]
      : [],
  };
}

async function searchOfflineDirectoryCatalog(
  patientId: string | null | undefined,
  params: SearchDirectoryCatalogParams,
): Promise<DirectorySearchResponseDto> {
  const category = params.category ?? 'all';
  const query = params.q ?? '';

  const [cachedNetwork, sqliteRows] = await Promise.all([
    getCachedNetworkDirectory(patientId),
    (async () => {
      try {
        await ensureDatabaseReady();
        const [clinicRows, providerRows] = await Promise.all([
          originalDb.select().from(clinics),
          patientId
            ? originalDb
                .select()
                .from(patientHealthcareProviders)
                .where(
                  and(
                    eq(patientHealthcareProviders.patientId, patientId),
                    isNull(patientHealthcareProviders.deletedAt),
                  ),
                )
            : Promise.resolve([]),
        ]);
        return { clinicRows, providerRows };
      } catch {
        return { clinicRows: [], providerRows: [] };
      }
    })(),
  ]);

  const cachedClinicIds = new Set(cachedNetwork.clinics.map((c) => c.id));
  const localClinics: DirectoryClinicDto[] = sqliteRows.clinicRows
    .filter((c) => !cachedClinicIds.has(c.id))
    .map(mapSqliteClinicToDirectoryClinic);

  const mergedClinics = sortDirectoryClinics([...cachedNetwork.clinics, ...localClinics]);

  const personalSqliteDoctors: DirectoryDoctorDto[] = sqliteRows.providerRows
    .filter((p) => Boolean(p.name))
    .map((p) => mapSqliteProviderToDirectoryDoctor(p, mergedClinics));

  const mergedDoctors = sortDirectoryDoctors([
    ...cachedNetwork.doctors,
    ...personalSqliteDoctors,
  ]);

  return filterOfflineSearchCatalog({
    query,
    category,
    doctors: mergedDoctors,
    clinics: mergedClinics,
    services: cachedNetwork.services,
    openNowOnly: params.openNowOnly,
    availableTodayOnly: params.availableTodayOnly,
  });
}

export async function queryDirectorySearchCatalog(
  getToken: () => Promise<string | null>,
  patientId: string | null | undefined,
  params: SearchDirectoryCatalogParams = {},
): Promise<{ data: DirectorySearchResponseDto; fromServer: boolean }> {
  try {
    const remote = await searchDirectoryCatalog(getToken, {
      ...params,
      forPatientId: params.forPatientId ?? patientId,
    });
    const isFullDirectoryFetch =
      !params.q?.trim() &&
      (!params.category || params.category === 'all') &&
      !params.openNowOnly &&
      !params.availableTodayOnly;

    if (isFullDirectoryFetch) {
      await saveNetworkDirectorySnapshot({
        patientId: patientId ?? null,
        doctors: remote.doctors,
        clinics: remote.clinics,
        services: remote.services,
      }).catch(() => {});
    }

    return {
      data: {
        ...remote,
        doctors: sortDirectoryDoctors(remote.doctors),
        clinics: sortDirectoryClinics(remote.clinics),
      },
      fromServer: true,
    };
  } catch {
    const local = await searchOfflineDirectoryCatalog(patientId, params);
    return { data: local, fromServer: false };
  }
}
