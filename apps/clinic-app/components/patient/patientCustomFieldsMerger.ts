import type { ClinicPatient, ClinicCustomFieldDefinition } from '../../services/clinicService';
import { sanitizeCustomFieldsPayload, type StaticPatientValues } from '../custom-fields';
import {
  type MemberType,
  type PrincipalRelationship,
  buildPhilHealthProfileData,
} from './memberType';

const LEGACY_FIELD_MAP: Record<string, string> = {
  primary_address_line: 'addressLine',
  primary_barangay: 'barangay',
  primary_city: 'city',
  primary_province: 'province',
  emergency_contact_name: 'emergencyContactName',
  emergency_contact_phone: 'emergencyContactPhone',
  emergency_contact_relationship: 'emergencyContactRelationship',
};

export function hasPreviousValue(patient: Partial<ClinicPatient> | null | undefined, key: string): boolean {
  if (!patient) return false;
  const cf = patient.customFields;
  if (cf && cf[key] !== undefined && cf[key] !== null && cf[key] !== '') {
    return true;
  }
  const legacyProp = LEGACY_FIELD_MAP[key];
  if (legacyProp && (patient as any)[legacyProp] != null && String((patient as any)[legacyProp]).trim() !== '') {
    return true;
  }
  if ((patient as any)[key] != null && String((patient as any)[key]).trim() !== '') {
    return true;
  }
  return false;
}

export interface MergePatientCustomFieldsInput {
  patient: Partial<ClinicPatient> | null | undefined;
  effectiveCustomFields: ClinicCustomFieldDefinition[];
  customFieldValues: Record<string, any>;
  staticValues: StaticPatientValues;
  tenantCustomFieldsCount?: number;
  // Institutional classification fields (for fallback when tenantCustomFields is empty)
  classification?: 'General' | 'Student' | 'Employee';
  studentId?: string;
  college?: string;
  program?: string;
  yearLevel?: string;
  employeeId?: string;
  department?: string;
  // PhilHealth statutory member details
  memberType?: MemberType;
  principalMemberPin?: string;
  principalFullName?: string;
  principalRelationship?: PrincipalRelationship;
  principalDob?: string;
  // PhilHealth profile generator fields
  philHealthNumber?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dateOfBirth?: string;
}

/**
 * Pure helper function to compute the exact customFields dictionary for PUT /patients/{id}.
 * 
 * Rules:
 * 1. For every field in effectiveCustomFields:
 *    - If visible & non-empty: assign trimmed value.
 *    - If cleared/empty or conditionally hidden:
 *      - If previously existed on patient.customFields (or legacy patient property): assign `null`
 *        so backend additive merge clears the DB value.
 *      - Otherwise: `delete` key so untouched optional fields do not pollute payload with nulls.
 * 2. Preserves non-custom system keys: yakap_enlistments, member_type, philhealth_profile, etc.
 */
export function mergePatientCustomFields(input: MergePatientCustomFieldsInput): Record<string, any> {
  const {
    patient,
    effectiveCustomFields,
    customFieldValues,
    staticValues,
    tenantCustomFieldsCount = 0,
    classification = 'General',
    studentId = '',
    college = '',
    program = '',
    yearLevel = '',
    employeeId = '',
    department = '',
    memberType = 'MM',
    principalMemberPin = '',
    principalFullName = '',
    principalRelationship = 'C',
    principalDob = '',
    philHealthNumber = '',
    firstName = '',
    lastName = '',
    middleName = '',
    dateOfBirth = '',
  } = input;

  // 1. Seed with existing custom fields to preserve untouched system metadata
  const merged: Record<string, any> = {
    ...(patient?.customFields || {}),
  };

  // 2. Compute sanitized custom fields (visible & non-empty)
  const cleanCustom = effectiveCustomFields.length > 0
    ? sanitizeCustomFieldsPayload(effectiveCustomFields, customFieldValues, staticValues)
    : {};

  // 3. Process every effective custom field (both tenant custom fields and baseline address/contact)
  for (const field of effectiveCustomFields) {
    const key = field.fieldKey;
    const rawVal = cleanCustom[key];
    const isPresent =
      key in cleanCustom &&
      rawVal !== null &&
      rawVal !== undefined &&
      (typeof rawVal === 'string' ? rawVal.trim() !== '' : true);

    if (isPresent) {
      merged[key] = typeof rawVal === 'string' ? rawVal.trim() : rawVal;
    } else {
      // Field is cleared, whitespace-only, or conditionally hidden
      if (hasPreviousValue(patient, key)) {
        merged[key] = null;
      } else {
        delete merged[key];
      }
    }
  }

  // 4. Preserve / update statutory YAKAP enlistments
  if (customFieldValues['yakap_enlistments'] !== undefined) {
    if (customFieldValues['yakap_enlistments']) {
      merged['yakap_enlistments'] = customFieldValues['yakap_enlistments'];
    }
  } else if (patient?.customFields?.['yakap_enlistments']) {
    merged['yakap_enlistments'] = patient.customFields['yakap_enlistments'];
  }

  // 5. Fallback institutional classification when tenantCustomFields is empty
  if (tenantCustomFieldsCount === 0) {
    merged['classification'] = classification;
    if (classification === 'Student') {
      if (studentId.trim()) merged['student_id'] = studentId.trim();
      else if (hasPreviousValue(patient, 'student_id')) merged['student_id'] = null;
      else delete merged['student_id'];

      if (college.trim()) merged['college'] = college.trim();
      else if (hasPreviousValue(patient, 'college')) merged['college'] = null;
      else delete merged['college'];

      if (program.trim()) merged['program'] = program.trim();
      else if (hasPreviousValue(patient, 'program')) merged['program'] = null;
      else delete merged['program'];

      if (yearLevel.trim()) merged['year_level'] = yearLevel.trim();
      else if (hasPreviousValue(patient, 'year_level')) merged['year_level'] = null;
      else delete merged['year_level'];

      if (hasPreviousValue(patient, 'employee_id')) merged['employee_id'] = null;
      else delete merged['employee_id'];

      if (hasPreviousValue(patient, 'department')) merged['department'] = null;
      else delete merged['department'];
    } else if (classification === 'Employee') {
      if (employeeId.trim()) merged['employee_id'] = employeeId.trim();
      else if (hasPreviousValue(patient, 'employee_id')) merged['employee_id'] = null;
      else delete merged['employee_id'];

      if (department.trim()) merged['department'] = department.trim();
      else if (hasPreviousValue(patient, 'department')) merged['department'] = null;
      else delete merged['department'];

      if (hasPreviousValue(patient, 'student_id')) merged['student_id'] = null;
      else delete merged['student_id'];

      if (hasPreviousValue(patient, 'college')) merged['college'] = null;
      else delete merged['college'];

      if (hasPreviousValue(patient, 'program')) merged['program'] = null;
      else delete merged['program'];

      if (hasPreviousValue(patient, 'year_level')) merged['year_level'] = null;
      else delete merged['year_level'];
    } else {
      // General classification: clear institutional fields if they previously existed
      for (const k of ['student_id', 'college', 'program', 'year_level', 'employee_id', 'department']) {
        if (hasPreviousValue(patient, k)) merged[k] = null;
        else delete merged[k];
      }
    }
  }

  // 6. PhilHealth Dependent / Principal Member details
  merged['member_type'] = memberType;
  if (memberType === 'DD') {
    merged['principal_member_pin'] = principalMemberPin.trim();
    merged['principal_full_name'] = principalFullName.trim();
    merged['principal_relationship'] = principalRelationship;
    if (principalDob.trim()) merged['principal_dob'] = principalDob.trim();
    else if (hasPreviousValue(patient, 'principal_dob')) merged['principal_dob'] = null;
  } else {
    // If transitioning from DD to MM, clear sponsor fields if previously populated
    for (const k of ['principal_member_pin', 'principal_full_name', 'principal_relationship', 'principal_dob']) {
      if (hasPreviousValue(patient, k)) merged[k] = null;
      else delete merged[k];
    }
  }

  // 7. Rebuild philhealth_profile DTO
  merged['philhealth_profile'] = buildPhilHealthProfileData({
    memberType,
    patientPin: philHealthNumber,
    patientFirstName: firstName,
    patientLastName: lastName,
    patientMiddleName: middleName,
    patientDob: dateOfBirth,
    principalPin: principalMemberPin,
    principalFullName,
    principalRelationship,
    principalDob,
  });

  return merged;
}
