import type { PatientGuardianDto } from '../../services/clinicService';

export type MemberType = 'MM' | 'DD';
export type PrincipalRelationship = 'C' | 'S' | 'P' | 'D';

export interface GuardianSponsorPrefill {
  fullName: string;
  shortName: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  relationship: PrincipalRelationship;
  rawPin: string;
  formattedPin: string;
  birthDate: string;
  buttonLabel: string;
}

function maskPhilHealthPinPure(input?: string | null): { rawPin: string; formattedPin: string } {
  const digits = (input || '').replace(/\D/g, '').slice(0, 12);
  if (!digits) {
    return { rawPin: '', formattedPin: '' };
  }
  if (digits.length <= 2) {
    return { rawPin: digits, formattedPin: digits };
  }
  if (digits.length <= 11) {
    return { rawPin: digits, formattedPin: `${digits.slice(0, 2)}-${digits.slice(2)}` };
  }
  return {
    rawPin: digits,
    formattedPin: `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11, 12)}`,
  };
}

export function canUseGuardianAsSponsor(guardian?: PatientGuardianDto | null): boolean {
  if (!guardian) return false;
  return Boolean(
    guardian.firstName?.trim() ||
      guardian.lastName?.trim() ||
      guardian.philHealthPin?.replace(/\D/g, '').trim()
  );
}

export function mapGuardianRelationshipToDependent(
  relationshipCode?: string | null,
  options?: { patientDob?: string | null; pwdId?: string | null }
): PrincipalRelationship {
  const code = (relationshipCode || '').trim().toUpperCase();
  if (code === 'SPOUSE' || code === 'S') {
    return 'S';
  }
  if (code === 'CHILD' || code === 'SON' || code === 'DAUGHTER' || code === 'P') {
    return 'P';
  }

  let patientAge: number | null = null;
  const dob = options?.patientDob?.trim() || '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (match) {
    const now = new Date();
    let age = now.getFullYear() - Number(match[1]);
    const mDiff = now.getMonth() + 1 - Number(match[2]);
    if (mDiff < 0 || (mDiff === 0 && now.getDate() < Number(match[3]))) {
      age -= 1;
    }
    if (age >= 0) {
      patientAge = age;
    }
  }

  if (options?.pwdId?.trim() && patientAge !== null && patientAge >= 21) {
    return 'D';
  }

  if (
    patientAge !== null &&
    patientAge >= 60 &&
    code !== '' &&
    code !== 'MOTHER' &&
    code !== 'FATHER' &&
    code !== 'GRANDPARENT'
  ) {
    return 'P';
  }

  return 'C';
}

export function buildPrincipalSponsorFromGuardian(
  guardian?: PatientGuardianDto | null,
  options?: { patientDob?: string | null; pwdId?: string | null }
): GuardianSponsorPrefill | null {
  if (!guardian || !canUseGuardianAsSponsor(guardian)) {
    return null;
  }

  const firstName = (guardian.firstName || '').trim();
  const middleName = (guardian.middleName || '').trim();
  const lastName = (guardian.lastName || '').trim();
  const suffix = (guardian.suffix || '').trim();
  const fullName = [firstName, middleName, lastName, suffix].filter(Boolean).join(' ');
  const shortName = [firstName, lastName].filter(Boolean).join(' ');
  const { rawPin, formattedPin } = maskPhilHealthPinPure(guardian.philHealthPin);
  const birthDate = (guardian.birthDate || '').trim();
  const relationship = mapGuardianRelationshipToDependent(guardian.relationshipCode, options);

  return {
    fullName,
    shortName,
    firstName,
    middleName,
    lastName,
    suffix,
    relationship,
    rawPin,
    formattedPin,
    birthDate,
    buttonLabel: shortName ? `Use Guardian (${shortName})` : 'Use Legal Guardian',
  };
}

export interface PhilHealthRelationshipOption {
  label: string;
  code: PrincipalRelationship;
  description: string;
}

/**
 * Initial empty array for principal relationship options.
 * Production components hydrate dynamically from optionsService.getOptionSet('dependent_relationship')
 * or useEhrOptions('dependent_relationship' | 'guardian_relationship').
 */
export const PHILHEALTH_RELATIONSHIPS: PhilHealthRelationshipOption[] = [];

export function splitFullName(fullName?: string): [string, string] {
  if (!fullName || !fullName.trim()) return ['', ''];
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return [parts[0], ''];
  const lastName = parts.pop() || '';
  const firstName = parts.join(' ');
  return [firstName, lastName];
}

export interface PhilHealthProfilePayload {
  pin?: string;
  memberPin?: string;
  memberType: MemberType;
  memberLastName?: string;
  memberFirstName?: string;
  memberMiddleName?: string;
  memberSuffix?: string;
  memberBirthDate?: string;
  dependentRelationship?: PrincipalRelationship;
  atc?: string;
  isWalkedIn?: string;
}

export function buildPhilHealthProfileData(params: {
  memberType: MemberType;
  patientPin?: string;
  patientFirstName: string;
  patientLastName: string;
  patientMiddleName?: string;
  patientDob?: string;
  principalPin?: string;
  principalFullName?: string;
  principalRelationship?: PrincipalRelationship;
  principalDob?: string;
}): PhilHealthProfilePayload {
  const isDependent = params.memberType === 'DD';
  const [pFirst, pLast] = splitFullName(params.principalFullName);

  return {
    pin: params.patientPin?.trim() || undefined,
    memberPin: isDependent
      ? (params.principalPin?.trim() || undefined)
      : (params.patientPin?.trim() || undefined),
    memberType: params.memberType,
    memberLastName: isDependent ? (pLast || undefined) : params.patientLastName.trim(),
    memberFirstName: isDependent ? (pFirst || undefined) : params.patientFirstName.trim(),
    memberMiddleName: isDependent ? undefined : (params.patientMiddleName?.trim() || undefined),
    memberBirthDate: isDependent
      ? (params.principalDob?.trim() || undefined)
      : (params.patientDob?.trim() || undefined),
    dependentRelationship: isDependent ? params.principalRelationship : undefined,
    atc: 'A',
    isWalkedIn: 'Y',
  };
}

export function extractPhilHealthProfileData(
  customFields?: Record<string, any> | null,
  patient?: any
): {
  memberType: MemberType;
  principalPin: string;
  principalFullName: string;
  principalRelationship: PrincipalRelationship;
  principalDob: string;
} {
  // Pure 1NF resolution: prioritize relational PatientPhilHealthMembership, then top-level customFields
  const membership = patient?.philHealthMembership;

  const memberTypeRaw =
    membership?.memberType ||
    customFields?.['member_type'];
  const memberType: MemberType = memberTypeRaw === 'DD' ? 'DD' : 'MM';

  const principalPin =
    membership?.principalMemberPin ||
    customFields?.['principal_member_pin'] ||
    '';

  const membershipFullName =
    membership?.principalFirstName && membership?.principalLastName
      ? `${membership.principalFirstName} ${membership.principalLastName}`.trim()
      : (membership?.principalLastName || membership?.principalFirstName || '');

  const principalFullName =
    membershipFullName ||
    customFields?.['principal_full_name'] ||
    '';

  const principalRelationship: PrincipalRelationship =
    (membership?.dependentRelationship as PrincipalRelationship) ||
    customFields?.['principal_relationship'] ||
    'C';

  const principalDob =
    (membership?.principalDateOfBirth ? String(membership.principalDateOfBirth) : '') ||
    customFields?.['principal_dob'] ||
    '';

  return {
    memberType,
    principalPin,
    principalFullName,
    principalRelationship,
    principalDob,
  };
}
