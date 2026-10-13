export type MemberType = 'MM' | 'DD';
export type PrincipalRelationship = 'C' | 'S' | 'P' | 'D';

export interface PhilHealthRelationshipOption {
  label: string;
  code: PrincipalRelationship;
  description: string;
}

export const PHILHEALTH_RELATIONSHIPS: PhilHealthRelationshipOption[] = [
  {
    label: 'Child (C)',
    code: 'C',
    description: 'Unmarried and unemployed dependent child under 21 years old',
  },
  {
    label: 'Spouse (S)',
    code: 'S',
    description: 'Legitimate spouse who is not currently an active contributing member',
  },
  {
    label: 'Parent (P)',
    code: 'P',
    description: 'Parent 60+ years old or permanently disabled dependent upon member',
  },
  {
    label: 'Disabled Dependent (D)',
    code: 'D',
    description: 'Child 21+ years old with physical/mental disability dependent upon member',
  },
];

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
  const profile = customFields?.['philhealth_profile'] || {};
  const memberTypeRaw = customFields?.['member_type'] || profile.memberType;
  const memberType: MemberType = memberTypeRaw === 'DD' ? 'DD' : 'MM';

  const isDependent = memberType === 'DD';

  const principalPin =
    customFields?.['principal_member_pin'] ||
    profile.memberPin ||
    '';

  const combinedName = profile.memberFirstName && profile.memberLastName
    ? `${profile.memberFirstName} ${profile.memberLastName}`.trim()
    : '';

  const principalFullName =
    customFields?.['principal_full_name'] ||
    combinedName ||
    '';

  const principalRelationship: PrincipalRelationship =
    customFields?.['principal_relationship'] ||
    profile.dependentRelationship ||
    'C';

  const principalDob =
    customFields?.['principal_dob'] ||
    profile.memberBirthDate ||
    '';

  return {
    memberType,
    principalPin,
    principalFullName,
    principalRelationship,
    principalDob,
  };
}
