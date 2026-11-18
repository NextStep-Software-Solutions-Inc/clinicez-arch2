import { blobStorage } from '../storage';
import {
  searchDirectoryCatalog,
  type DirectoryClinicDto,
  type DirectoryDoctorAffiliationDto,
  type DirectoryDoctorDto,
  type DirectoryServiceDto,
  type PractitionerProfileDto,
} from '../api/homeApi';

const NETWORK_DIRECTORY_BLOB_KEY = 'directory/network_directory_v1.json';

export interface NetworkDirectorySnapshot {
  updatedAt: string;
  patientId: string | null;
  doctors: DirectoryDoctorDto[];
  clinics: DirectoryClinicDto[];
  services: DirectoryServiceDto[];
  practitioners: Record<string, PractitionerProfileDto>;
}

const EMPTY_SNAPSHOT: NetworkDirectorySnapshot = {
  updatedAt: '',
  patientId: null,
  doctors: [],
  clinics: [],
  services: [],
  practitioners: {},
};

let inMemorySnapshot: NetworkDirectorySnapshot | null = null;

function encodeUtf8(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  const encoded = unescape(encodeURIComponent(text));
  const bytes = new Uint8Array(encoded.length);
  for (let i = 0; i < encoded.length; i += 1) {
    bytes[i] = encoded.charCodeAt(i);
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  let raw = '';
  for (let i = 0; i < bytes.length; i += 1) {
    raw += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(raw));
}

function hasBookableAffiliation(doctor: DirectoryDoctorDto): boolean {
  if (doctor.clinicSupportsAppointments) return true;
  return Boolean(doctor.affiliations?.some((aff) => aff.supportsAppointments));
}

function parseTimestampMs(iso: string | null | undefined): number {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Ranks verified, bookable clinicians ahead of booking-paused or unverified entries.
 */
export function sortDirectoryDoctors(doctors: DirectoryDoctorDto[]): DirectoryDoctorDto[] {
  return [...doctors].sort((a, b) => {
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;

    const aBookable = hasBookableAffiliation(a);
    const bBookable = hasBookableAffiliation(b);
    if (aBookable !== bBookable) return aBookable ? -1 : 1;

    const aHasSlot = Boolean(a.nextAvailableAt);
    const bHasSlot = Boolean(b.nextAvailableAt);
    if (aHasSlot !== bHasSlot) return aHasSlot ? -1 : 1;

    const aTime = parseTimestampMs(a.nextAvailableAt);
    const bTime = parseTimestampMs(b.nextAvailableAt);
    if (aTime !== bTime) return aTime - bTime;

    return a.name.localeCompare(b.name);
  });
}

/**
 * Ranks verified, bookable clinics ahead of booking-paused or unverified facilities.
 */
export function sortDirectoryClinics(clinics: DirectoryClinicDto[]): DirectoryClinicDto[] {
  return [...clinics].sort((a, b) => {
    const aVerified = a.isPlatformVerified === true;
    const bVerified = b.isPlatformVerified === true;
    if (aVerified !== bVerified) return aVerified ? -1 : 1;

    if (a.supportsAppointments !== b.supportsAppointments) {
      return a.supportsAppointments ? -1 : 1;
    }

    if (a.isOpenNow !== b.isOpenNow) return a.isOpenNow ? -1 : 1;

    return a.name.localeCompare(b.name);
  });
}

function buildSyntheticAffiliations(doctor: DirectoryDoctorDto): DirectoryDoctorAffiliationDto[] {
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

function doctorToPractitionerProfile(doctor: DirectoryDoctorDto): PractitionerProfileDto {
  const cleanName = doctor.name.replace(/^Dr\.\s*/i, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? doctor.name;
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  return {
    id: doctor.practitionerId ?? doctor.id,
    practitionerId: doctor.practitionerId ?? null,
    name: doctor.name,
    firstName,
    lastName,
    role: doctor.role ?? 'Doctor',
    primarySpecialty: doctor.specialty,
    bio: doctor.bio ?? null,
    avatarUrl: doctor.avatarUrl,
    displayPrcLicenseNo: doctor.professionalLicenseNo,
    prcExpiryDate: null,
    verificationLevel: doctor.isVerified ? 'Verified' : 'Unverified',
    isVerified: doctor.isVerified,
    verifiedAtUtc: null,
    affiliations: buildSyntheticAffiliations(doctor),
  };
}

function indexPractitionerProfiles(
  doctors: DirectoryDoctorDto[],
  existing: Record<string, PractitionerProfileDto>,
): Record<string, PractitionerProfileDto> {
  const next: Record<string, PractitionerProfileDto> = { ...existing };
  for (const doctor of doctors) {
    if (!doctor.isVerified) continue;
    const synthesized = doctorToPractitionerProfile(doctor);
    next[doctor.id] = synthesized;
    if (doctor.practitionerId) {
      next[doctor.practitionerId] = synthesized;
    }
    for (const aff of synthesized.affiliations) {
      if (aff.providerId) {
        next[aff.providerId] = synthesized;
      }
    }
  }
  return next;
}

async function persistSnapshot(snapshot: NetworkDirectorySnapshot): Promise<void> {
  inMemorySnapshot = snapshot;
  try {
    const serialized = JSON.stringify(snapshot);
    await blobStorage.saveBlob(
      NETWORK_DIRECTORY_BLOB_KEY,
      encodeUtf8(serialized),
      'application/json',
    );
  } catch {
    // Keep in-memory cache intact if disk/IDB persistence is unavailable
  }
}

export async function saveNetworkDirectorySnapshot(input: {
  patientId?: string | null;
  doctors: DirectoryDoctorDto[];
  clinics: DirectoryClinicDto[];
  services: DirectoryServiceDto[];
  practitioners?: Record<string, PractitionerProfileDto>;
}): Promise<NetworkDirectorySnapshot> {
  const verifiedDoctors = sortDirectoryDoctors(
    input.doctors.filter((d) => Boolean(d.isVerified)),
  );
  const verifiedClinics = sortDirectoryClinics(
    input.clinics
      .filter((c) => c.isPlatformVerified === true || Boolean(c.isPublic))
      .map((c) => ({ ...c, isPlatformVerified: c.isPlatformVerified ?? Boolean(c.isPublic) })),
  );

  const existing = inMemorySnapshot?.practitioners ?? {};
  const practitioners = indexPractitionerProfiles(
    verifiedDoctors,
    input.practitioners ?? existing,
  );

  const snapshot: NetworkDirectorySnapshot = {
    updatedAt: new Date().toISOString(),
    patientId: input.patientId ?? null,
    doctors: verifiedDoctors,
    clinics: verifiedClinics,
    services: [...input.services],
    practitioners,
  };

  await persistSnapshot(snapshot);
  return snapshot;
}

export async function getCachedNetworkDirectory(
  patientId?: string | null,
): Promise<NetworkDirectorySnapshot> {
  const isCompatibleOwner = (ownerId: string | null): boolean =>
    !ownerId || !patientId || ownerId === patientId;

  if (inMemorySnapshot && isCompatibleOwner(inMemorySnapshot.patientId)) {
    return inMemorySnapshot;
  }

  try {
    const bytes = await blobStorage.getBlobBytes(NETWORK_DIRECTORY_BLOB_KEY);
    if (!bytes || bytes.byteLength === 0) {
      return { ...EMPTY_SNAPSHOT, patientId: patientId ?? null };
    }
    const parsed = JSON.parse(decodeUtf8(bytes)) as Partial<NetworkDirectorySnapshot>;
    const ownerId = parsed.patientId ?? null;
    if (!isCompatibleOwner(ownerId)) {
      return { ...EMPTY_SNAPSHOT, patientId: patientId ?? null };
    }
    const hydrated: NetworkDirectorySnapshot = {
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      patientId: ownerId,
      doctors: Array.isArray(parsed.doctors) ? sortDirectoryDoctors(parsed.doctors) : [],
      clinics: Array.isArray(parsed.clinics) ? sortDirectoryClinics(parsed.clinics) : [],
      services: Array.isArray(parsed.services) ? parsed.services : [],
      practitioners:
        parsed.practitioners && typeof parsed.practitioners === 'object'
          ? parsed.practitioners
          : {},
    };
    inMemorySnapshot = hydrated;
    return hydrated;
  } catch {
    return { ...EMPTY_SNAPSHOT, patientId: patientId ?? null };
  }
}

export async function refreshNetworkDirectory(
  getToken: () => Promise<string | null>,
  patientId?: string | null,
): Promise<NetworkDirectorySnapshot | null> {
  try {
    const remote = await searchDirectoryCatalog(getToken, {
      q: '',
      category: 'all',
      take: 50,
      forPatientId: patientId,
    });
    return await saveNetworkDirectorySnapshot({
      patientId: patientId ?? null,
      doctors: remote.doctors,
      clinics: remote.clinics,
      services: remote.services,
    });
  } catch {
    return null;
  }
}

export async function cachePractitionerProfile(
  profile: PractitionerProfileDto,
  patientId?: string | null,
): Promise<void> {
  const current = await getCachedNetworkDirectory(patientId);
  const nextPractitioners: Record<string, PractitionerProfileDto> = {
    ...current.practitioners,
    [profile.id]: profile,
  };
  if (profile.practitionerId) {
    nextPractitioners[profile.practitionerId] = profile;
  }
  for (const aff of profile.affiliations) {
    if (aff.providerId) {
      nextPractitioners[aff.providerId] = profile;
    }
  }
  await persistSnapshot({
    ...current,
    updatedAt: current.updatedAt || new Date().toISOString(),
    patientId: current.patientId ?? patientId ?? null,
    practitioners: nextPractitioners,
  });
}

export async function getCachedPractitionerProfile(
  id: string,
  patientId?: string | null,
): Promise<PractitionerProfileDto | null> {
  const trimmed = id.trim();
  if (!trimmed) return null;

  const current = await getCachedNetworkDirectory(patientId);
  if (current.practitioners[trimmed]) {
    return current.practitioners[trimmed];
  }

  const matchedDoctor = current.doctors.find(
    (d) =>
      d.id === trimmed ||
      d.practitionerId === trimmed ||
      Boolean(d.affiliations?.some((a) => a.providerId === trimmed)),
  );
  if (matchedDoctor) {
    return doctorToPractitionerProfile(matchedDoctor);
  }

  return null;
}

export async function clearNetworkDirectoryCache(): Promise<void> {
  inMemorySnapshot = null;
  try {
    await blobStorage.deleteBlob(NETWORK_DIRECTORY_BLOB_KEY);
  } catch {
    // Ignore cleanup errors
  }
}
