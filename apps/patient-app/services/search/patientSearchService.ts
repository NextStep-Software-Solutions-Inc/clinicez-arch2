import { and, eq, isNull } from 'drizzle-orm';
import { ensureDatabaseReady, originalDb } from '../../db/index';
import { clinics, patientHealthcareProviders } from '../../db/schema/index';
import {
  searchPatientCatalog,
  type PatientSearchClinicDto,
  type PatientSearchDoctorDto,
  type PatientSearchResponseDto,
  type PatientSearchServiceDto,
  type SearchCategoryFilter,
  type SearchPatientCatalogParams,
} from '../api/homeApi';

export function filterOfflineSearchCatalog(params: {
  query: string;
  category: SearchCategoryFilter;
  doctors: PatientSearchDoctorDto[];
  clinics: PatientSearchClinicDto[];
  services: PatientSearchServiceDto[];
  openNowOnly?: boolean;
  availableTodayOnly?: boolean;
}): PatientSearchResponseDto {
  const q = params.query.trim().toLowerCase();

  const matchedDoctors = params.doctors.filter((d) => {
    if (params.availableTodayOnly && !d.clinicSupportsAppointments) return false;
    if (!q) return true;
    return (
      d.name.toLowerCase().includes(q) ||
      d.specialty.toLowerCase().includes(q) ||
      d.clinicName.toLowerCase().includes(q) ||
      (d.clinicAddress ?? '').toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q))
    );
  });

  const matchedClinics = params.clinics.filter((c) => {
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
  });

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

async function searchOfflineSqliteCatalog(
  patientId: string | null | undefined,
  params: SearchPatientCatalogParams,
): Promise<PatientSearchResponseDto> {
  await ensureDatabaseReady();
  const category = params.category ?? 'all';
  const query = params.q ?? '';

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

  const mappedClinics: PatientSearchClinicDto[] = clinicRows.map((c) => {
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
    if (supportsAppointments) tags.push('Online Booking');
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
      openStatusLabel: supportsAppointments ? 'Open Today' : 'By Inquiry',
      isOpenNow: supportsAppointments,
      supportsAppointments,
      isPublic: Boolean(c.isPublic),
      isGated,
      isUnlocked: !isGated,
      activeMemberCount: c.activeMemberCount ?? 0,
      nextAvailableAt: null,
      nextAvailableLabel: supportsAppointments ? 'Schedule online' : null,
      tags,
    };
  });

  const defaultClinicId = mappedClinics[0]?.id ?? '';
  const mappedDoctors: PatientSearchDoctorDto[] = providerRows
    .filter((p) => Boolean(p.name))
    .map((p) => ({
      id: p.id,
      clinicId: defaultClinicId,
      name: p.name!,
      specialty: p.specialty ?? p.providerType ?? 'General Practitioner',
      avatarUrl: null,
      professionalLicenseNo: null,
      isVerified: true,
      clinicName: p.clinicHospital ?? 'Care Team Provider',
      clinicAddress: null,
      clinicSupportsAppointments: Boolean(defaultClinicId),
      nextAvailableAt: null,
      nextAvailableLabel: 'Check availability',
      tags: ['Saved Care Team', p.providerType || 'Specialist'],
    }));

  return filterOfflineSearchCatalog({
    query,
    category,
    doctors: mappedDoctors,
    clinics: mappedClinics,
    services: [],
    openNowOnly: params.openNowOnly,
    availableTodayOnly: params.availableTodayOnly,
  });
}

export async function queryPatientSearchCatalog(
  getToken: () => Promise<string | null>,
  patientId: string | null | undefined,
  params: SearchPatientCatalogParams = {},
): Promise<{ data: PatientSearchResponseDto; fromServer: boolean }> {
  if (!patientId) {
    return {
      data: await searchOfflineSqliteCatalog(null, params),
      fromServer: false,
    };
  }

  try {
    const remote = await searchPatientCatalog(getToken, patientId, params);
    return { data: remote, fromServer: true };
  } catch {
    const local = await searchOfflineSqliteCatalog(patientId, params);
    return { data: local, fromServer: false };
  }
}
