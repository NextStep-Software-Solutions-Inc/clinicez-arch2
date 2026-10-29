export type MemberType = 'MM' | 'DD';
export type PrincipalRelationship = 'C' | 'S' | 'P' | 'D';

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
