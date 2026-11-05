import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { ThemedText, TextInput, Input, Icon, Button, Badge, PhilHealthPinInput, ValidatedDateInput, validateDateString, BloodTypeSelect, Modal, SegmentedControl, PsgcAddressSelector, Select, type SelectOption } from '../ui';
import { theme } from '../../constants/theme';
import { clinicService, type ClinicPatient, type RegisterPatientPayload, type ClinicCustomFieldDefinition, type PatientAddressDto, type PatientGuardianDto } from '../../services/clinicService';
import { DynamicCustomFieldsRenderer, validateCustomFields } from '../custom-fields';
import { notify, Alert } from '../../utils/feedback';
import { isSeniorFromDob } from '../../utils/age';
import {
  type MemberType,
  type PrincipalRelationship,
  buildPrincipalSponsorFromGuardian,
  extractPhilHealthProfileData,
} from './memberType';
import {
  mergePatientCustomFields,
  hasPreviousValue,
} from './patientCustomFieldsMerger';
import type { CreateAllergyRequest } from './StructuredAllergyIntakeModal';
import {
  type MedicalHistoryItem,
  formatMedicalHistoriesSummary,
  parseChronicConditionsStringToStructured,
} from './StructuredMedicalHistoryModal';
import GuardianSection, {
  createEmptyGuardianDraft,
  isMinorFromDob,
  normalizeGuardianPayload,
  validateGuardianDraft,
} from './GuardianSection';

export { parseChronicConditionsStringToStructured };

export const LEGACY_PRIMARY_ADDRESS_FIELD_KEYS = new Set([
  'primary_address_line',
  'primary_barangay',
  'primary_city',
  'primary_province',
  'primary_postal_code',
  'secondary_city_province',
]);

export const BASELINE_PATIENT_CUSTOM_FIELDS: ClinicCustomFieldDefinition[] = [
  {
    id: 'default-secondary-address-line',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'secondary_address_line',
    label: 'Secondary Street Address',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 1,
    placeholder: 'Dormitory, Boarding House, Work, or Provincial Street',
    isActive: true,
  },
  {
    id: 'default-secondary-barangay',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'secondary_barangay',
    label: 'Secondary Barangay',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 2,
    placeholder: 'Barangay',
    isActive: true,
  },
  {
    id: 'default-secondary-city',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'secondary_city',
    label: 'Secondary City / Municipality',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 3,
    placeholder: 'City / Municipality',
    isActive: true,
  },
  {
    id: 'default-secondary-province',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'secondary_province',
    label: 'Secondary Province',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 4,
    placeholder: 'Province',
    isActive: true,
  },
  {
    id: 'default-emergency-contact-name',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'emergency_contact_name',
    label: 'Contact Person Name',
    dataType: 'Text',
    category: 'Emergency Contacts',
    isRequired: false,
    displayOrder: 10,
    placeholder: 'Full Name',
    isActive: true,
  },
  {
    id: 'default-emergency-contact-phone',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'emergency_contact_phone',
    label: 'Contact Person Phone',
    dataType: 'Text',
    category: 'Emergency Contacts',
    isRequired: false,
    displayOrder: 11,
    placeholder: '0918-123-4567',
    isActive: true,
  },
  {
    id: 'default-emergency-contact-relationship',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'emergency_contact_relationship',
    label: 'Relationship to Patient',
    dataType: 'Select',
    category: 'Emergency Contacts',
    isRequired: false,
    displayOrder: 12,
    placeholder: 'Select relationship',
    optionsJson: JSON.stringify([
      'Parent',
      'Spouse',
      'Child',
      'Sibling',
      'Guardian',
      'Relative',
      'Friend',
      'Workplace Colleague',
      'Other',
    ]),
    isActive: true,
  },
];

export function parseAllergiesStringToStructured(raw?: string | null): CreateAllergyRequest[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();
  if (/^(none|nkda|no known allergies|none known)$/i.test(trimmed)) return [];

  // Try JSON array format first
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({
            category: (['Medication', 'Food', 'Environmental', 'Biologic', 'Other'].includes(item.category)
              ? item.category
              : 'Other') as CreateAllergyRequest['category'],
            allergen: String(item.allergen || item.name || '').trim(),
            allergenDrugCode: item.allergenDrugCode ? String(item.allergenDrugCode) : null,
            severity: (['Mild', 'Moderate', 'Severe', 'LifeThreatening'].includes(item.severity)
              ? item.severity
              : 'Moderate') as CreateAllergyRequest['severity'],
            reactionManifestation: item.reactionManifestation ? String(item.reactionManifestation) : null,
            isAnaphylactic: Boolean(item.isAnaphylactic),
            onsetDate: item.onsetDate ? String(item.onsetDate) : null,
            notes: item.notes ? String(item.notes) : null,
          }))
          .filter((a) => a.allergen.length > 0);
      }
    } catch {
      // Fall through to text parsing
    }
  }

  // Parse comma-separated summary: "Penicillin (Medication - STAT), Peanuts (Food)" or "Penicillin, Peanuts"
  const segments = trimmed.split(/,\s*(?![^()]*\))/);
  const result: CreateAllergyRequest[] = [];

  for (const seg of segments) {
    const s = seg.trim();
    if (!s) continue;

    const match = s.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      const allergen = match[1].trim();
      const meta = match[2].trim();
      const isAnaphylactic = /stat|anaphylax|life-?threatening/i.test(meta);
      let severity: CreateAllergyRequest['severity'] = isAnaphylactic ? 'LifeThreatening' : 'Moderate';
      if (/mild/i.test(meta)) severity = 'Mild';
      else if (/moderate/i.test(meta)) severity = 'Moderate';
      else if (/severe/i.test(meta) && !/life-?threatening/i.test(meta)) severity = 'Severe';
      else if (/life-?threatening/i.test(meta)) severity = 'LifeThreatening';

      let category: CreateAllergyRequest['category'] = 'Other';
      if (/medication|drug|rx/i.test(meta)) category = 'Medication';
      else if (/food/i.test(meta)) category = 'Food';
      else if (/environmental|airborne|contact/i.test(meta)) category = 'Environmental';
      else if (/biologic|vaccine|blood/i.test(meta)) category = 'Biologic';
      else if (/penicillin|amoxicillin|aspirin|ibuprofen|antibiotic|paracetamol|sulfa/i.test(allergen)) category = 'Medication';
      else if (/peanut|egg|milk|seafood|shellfish|wheat|soy|fish/i.test(allergen)) category = 'Food';
      else if (/latex|pollen|dust|mold/i.test(allergen)) category = 'Environmental';

      result.push({
        category,
        allergen,
        severity,
        isAnaphylactic,
      });
    } else {
      const isAnaphylactic = /anaphylax|severe/i.test(s);
      let category: CreateAllergyRequest['category'] = 'Other';
      if (/penicillin|amoxicillin|aspirin|ibuprofen|antibiotic|paracetamol|sulfa/i.test(s)) category = 'Medication';
      else if (/peanut|egg|milk|seafood|shellfish|wheat|soy|fish/i.test(s)) category = 'Food';
      else if (/latex|pollen|dust|mold/i.test(s)) category = 'Environmental';

      result.push({
        category,
        allergen: s,
        severity: isAnaphylactic ? 'LifeThreatening' : 'Moderate',
        isAnaphylactic,
      });
    }
  }

  return result;
}

export interface EditPatientModalProps {
  patient: ClinicPatient | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (updatedPatient: ClinicPatient) => void;
}

function extractInitialGuardianFromPatient(patient?: ClinicPatient | null): PatientGuardianDto | null {
  const existingGuardian =
    patient?.guardians && patient.guardians.length > 0
      ? patient.guardians.find((g) => g.isPrimaryGuardian) || patient.guardians[0]
      : null;
  if (!existingGuardian) return null;
  return {
    id: existingGuardian.id,
    firstName: existingGuardian.firstName || '',
    lastName: existingGuardian.lastName || '',
    middleName: existingGuardian.middleName || '',
    suffix: existingGuardian.suffix || '',
    birthDate: existingGuardian.birthDate || '',
    sex: existingGuardian.sex || '',
    contactNumber: existingGuardian.contactNumber || '',
    relationshipCode: existingGuardian.relationshipCode || '',
    relationshipOtherSpecify: existingGuardian.relationshipOtherSpecify || '',
    philHealthPin: existingGuardian.philHealthPin || '',
    isPrimaryGuardian: existingGuardian.isPrimaryGuardian ?? true,
    isEmergencyContact: existingGuardian.isEmergencyContact ?? true,
  };
}

export function EditPatientModal({
  patient,
  visible,
  onClose,
  onSaved,
}: EditPatientModalProps) {
  const [firstName, setFirstName] = useState(patient?.firstName || '');
  const [middleName, setMiddleName] = useState(patient?.middleName || '');
  const [lastName, setLastName] = useState(patient?.lastName || '');
  const [suffix, setSuffix] = useState(patient?.suffix || '');
  const [dateOfBirth, setDateOfBirth] = useState(patient?.dateOfBirth || '');
  const [sex, setSex] = useState<string>('Male');
  const [genderIdentity, setGenderIdentity] = useState<string>('');
  const [civilStatus, setCivilStatus] = useState<string>('Single');
  const [sexOptions, setSexOptions] = useState<string[]>([]);
  const [genderIdentityOptions, setGenderIdentityOptions] = useState<SelectOption[]>([]);
  const [civilStatusOptions, setCivilStatusOptions] = useState<string[]>([]);
  const [relationshipOptions, setRelationshipOptions] = useState<
    Array<{ code: string; label: string; description?: string }>
  >([]);
  const [emergencyRelationshipOptions, setEmergencyRelationshipOptions] = useState<string[]>([]);

  useEffect(() => {
    let isMounted = true;
    clinicService.getOptionSet('sex').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setSexOptions(opts.map((o) => o.label));
      }
    });
    clinicService.getOptionSet('gender_identity').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setGenderIdentityOptions(
          opts.map((o) => ({
            value: o.code,
            label: o.label,
            requiresCustom: Boolean(o.requiresSpecifyText),
          }))
        );
      }
    });
    clinicService.getOptionSet('civil_status').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setCivilStatusOptions(opts.map((o) => o.label));
      }
    });
    clinicService.getOptionSet('guardian_relationship').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setEmergencyRelationshipOptions(opts.map((o) => o.label));
      }
    });
    clinicService.getOptionSet('dependent_relationship').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setRelationshipOptions(
          opts.map((o) => ({
            code: o.philHealthCode || o.code,
            label: o.label,
            description: o.label,
          }))
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [philHealthNumber, setPhilHealthNumber] = useState(patient?.philHealthNumber || '');
  const [memberType, setMemberType] = useState<MemberType>(() =>
    patient ? extractPhilHealthProfileData(patient.customFields, patient).memberType : 'MM'
  );
  const [principalMemberPin, setPrincipalMemberPin] = useState('');
  const [principalFullName, setPrincipalFullName] = useState('');
  const [principalRelationship, setPrincipalRelationship] = useState<PrincipalRelationship>('C');
  const [principalDob, setPrincipalDob] = useState('');
  const [isPrincipalPinValid, setIsPrincipalPinValid] = useState<boolean | null>(null);
  const [seniorCitizenId, setSeniorCitizenId] = useState(patient?.seniorCitizenId || '');
  const [pwdId, setPwdId] = useState(patient?.pwdId || '');
  const [bloodType, setBloodType] = useState('');
  const [structuredAllergies, setStructuredAllergies] = useState<CreateAllergyRequest[]>([]);
  const [structuredMedicalHistories, setStructuredMedicalHistories] = useState<MedicalHistoryItem[]>([]);
  const [alerts, setAlerts] = useState('');

  // Institutional classification
  const [classification, setClassification] = useState<'General' | 'Student' | 'Employee'>('General');
  const [studentId, setStudentId] = useState('');
  const [college, setCollege] = useState('');
  const [program, setProgram] = useState('');
  const [yearLevel, setYearLevel] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [department, setDepartment] = useState('');

  // Dynamic Custom Metadata state
  const [tenantCustomFields, setTenantCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string>>({});
  // Address state (PSGC 10-digit cascading address)
  const [permanentAddress, setPermanentAddress] = useState<PatientAddressDto>({
    addressType: 'Permanent',
    isSameAsPermanent: false,
    streetAddress: '',
  });
  const [guardian, setGuardian] = useState<PatientGuardianDto | null>(() =>
    extractInitialGuardianFromPatient(patient)
  );
  const [guardianErrors, setGuardianErrors] = useState<Record<string, string>>({});
  const [isGuardianPinValid, setIsGuardianPinValid] = useState<boolean | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const clearGuardianError = (field: string) => {
    setGuardianErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const guardianSponsor = useMemo(
    () => buildPrincipalSponsorFromGuardian(guardian, { patientDob: dateOfBirth, pwdId }),
    [guardian, dateOfBirth, pwdId]
  );

  const isSenior = useMemo(
    () => isSeniorFromDob(dateOfBirth) || Boolean(seniorCitizenId?.trim()),
    [dateOfBirth, seniorCitizenId]
  );

  const handleApplyGuardianAsSponsor = () => {
    if (!guardianSponsor) {
      if (!guardian) {
        setGuardian(createEmptyGuardianDraft());
      }
      notify.info('Enter Legal Guardian details above, then tap Use Legal Guardian to auto-fill.');
      return;
    }
    if (guardianSponsor.fullName) {
      setPrincipalFullName(guardianSponsor.fullName);
      clearFieldError('principalFullName');
    }
    setPrincipalRelationship(guardianSponsor.relationship);
    if (guardianSponsor.formattedPin) {
      setPrincipalMemberPin(guardianSponsor.formattedPin);
      clearFieldError('principalMemberPin');
    }
    if (guardianSponsor.birthDate) {
      setPrincipalDob(guardianSponsor.birthDate);
    }
    notify.success('Principal member details filled from Legal Guardian.');
  };

  const effectiveCustomFields = useMemo(() => {
    const activeTenantFields = tenantCustomFields.filter(
      (f) => !LEGACY_PRIMARY_ADDRESS_FIELD_KEYS.has(f.fieldKey)
    );
    const existingKeys = new Set(activeTenantFields.map((f) => f.fieldKey));

    const hasAnyAddressData = BASELINE_PATIENT_CUSTOM_FIELDS.some(
      (bf) => bf.category === 'Address' && hasPreviousValue(patient, bf.fieldKey)
    );
    const hasAnyEmergencyData = BASELINE_PATIENT_CUSTOM_FIELDS.some(
      (bf) => bf.category === 'Emergency Contacts' && hasPreviousValue(patient, bf.fieldKey)
    );

    const missingBaseline = BASELINE_PATIENT_CUSTOM_FIELDS.map((bf) => {
      if (bf.fieldKey === 'emergency_contact_relationship' && emergencyRelationshipOptions.length > 0) {
        return { ...bf, options: emergencyRelationshipOptions };
      }
      return bf;
    }).filter((bf) => {
      if (existingKeys.has(bf.fieldKey)) return false;
      if (bf.category === 'Address') return hasAnyAddressData;
      if (bf.category === 'Emergency Contacts') return hasAnyEmergencyData;
      return hasPreviousValue(patient, bf.fieldKey);
    });
    return [...activeTenantFields, ...missingBaseline].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );
  }, [tenantCustomFields, emergencyRelationshipOptions, patient]);

  const addressFields = useMemo(() => {
    return effectiveCustomFields.filter((f) => f.category === 'Address');
  }, [effectiveCustomFields]);

  const emergencyFields = useMemo(() => {
    return effectiveCustomFields.filter((f) => f.category === 'Emergency Contacts');
  }, [effectiveCustomFields]);

  const renderedCustomFields = useMemo(() => {
    return [...addressFields, ...emergencyFields];
  }, [addressFields, emergencyFields]);

  const handleCustomFieldChange = (key: string, val: any) => {
    setCustomFieldValues((prev) => ({ ...prev, [key]: val }));
    setCustomFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const staticValues = useMemo(
    () => ({ sex, civilStatus, dateOfBirth }),
    [sex, civilStatus, dateOfBirth]
  );

  const [saving, setSaving] = useState(false);
  const [hydratingPatient, setHydratingPatient] = useState(false);
  const [hydratedPatient, setHydratedPatient] = useState<ClinicPatient | null>(null);
  const [hasFullClinicalContext, setHasFullClinicalContext] = useState(false);
  const [isPinValid, setIsPinValid] = useState<boolean | null>(null);

  const applyPatientToForm = (source: ClinicPatient) => {
    const isFullRecord =
      Array.isArray(source.pastMedicalHistories) ||
      Array.isArray(source.structuredAllergies) ||
      (source.allergies !== undefined && source.allergies !== null) ||
      (source.chronicConditions !== undefined && source.chronicConditions !== null);

    setHasFullClinicalContext(isFullRecord);
    setFirstName(source.firstName || '');
    setMiddleName(source.middleName || '');
    setLastName(source.lastName || '');
    setSuffix(source.suffix || '');
    setDateOfBirth(source.dateOfBirth || '');
    setSex(source.sex || 'Male');
    setGenderIdentity(source.genderIdentity || '');
    setCivilStatus(source.civilStatus || 'Single');
    setContactNumber(source.contactNumber || '');
    setEmail(source.email || '');
    setPhilHealthNumber(source.philHealthNumber || '');
    const pProfile = extractPhilHealthProfileData(source.customFields, source);
    setMemberType(pProfile.memberType);
    setPrincipalMemberPin(pProfile.principalPin);
    setPrincipalFullName(pProfile.principalFullName);
    setPrincipalRelationship(pProfile.principalRelationship);
    setPrincipalDob(pProfile.principalDob);
    setIsPrincipalPinValid(null);
    setSeniorCitizenId(source.seniorCitizenId || '');
    setPwdId(source.pwdId || '');
    setBloodType(source.bloodType || '');

    const initialAllergies: CreateAllergyRequest[] = Array.isArray(source.structuredAllergies)
      ? source.structuredAllergies.map((item) => ({
          category: (['Medication', 'Food', 'Environmental', 'Biologic', 'Other'].includes(item.category)
            ? item.category
            : 'Other') as CreateAllergyRequest['category'],
          allergen: item.allergen,
          allergenDrugCode: item.allergenDrugCode ?? null,
          severity: (['Mild', 'Moderate', 'Severe', 'LifeThreatening'].includes(item.severity)
            ? item.severity
            : 'Moderate') as CreateAllergyRequest['severity'],
          reactionManifestation: item.reactionManifestation ?? null,
          isAnaphylactic: Boolean(item.isAnaphylactic),
          onsetDate: item.onsetDate ?? null,
          notes: item.notes ?? null,
        }))
      : parseAllergiesStringToStructured(source.allergies);
    setStructuredAllergies(initialAllergies);

    const initialConditions: MedicalHistoryItem[] = Array.isArray(source.pastMedicalHistories)
      ? (source.pastMedicalHistories as MedicalHistoryItem[])
      : parseChronicConditionsStringToStructured(source.chronicConditions);
    setStructuredMedicalHistories(initialConditions);

    const normalizedAlerts =
      !isFullRecord && source.alerts === 'Active Safety Alert'
        ? ''
        : source.alerts || '';
    setAlerts(normalizedAlerts);

    const cf = source.customFields || {};
    const existingPerm = (source.addresses && source.addresses.length > 0)
      ? source.addresses.find((a) => a.addressType === 'Permanent') || source.addresses[0]
      : null;
    setPermanentAddress({
      addressType: 'Permanent',
      isSameAsPermanent: false,
      regionPsgc: existingPerm?.regionPsgc ?? source.regionPsgc ?? null,
      provincePsgc: existingPerm?.provincePsgc ?? source.provincePsgc ?? null,
      cityMunicipalityPsgc: existingPerm?.cityMunicipalityPsgc ?? source.cityMunicipalityPsgc ?? null,
      barangayPsgc: existingPerm?.barangayPsgc ?? source.barangayPsgc ?? null,
      regionName: existingPerm?.regionName ?? null,
      provinceName: existingPerm?.provinceName ?? cf['primary_province'] ?? (source as any).province ?? null,
      cityMunicipalityName: existingPerm?.cityMunicipalityName ?? cf['primary_city'] ?? (source as any).city ?? null,
      barangayName: existingPerm?.barangayName ?? cf['primary_barangay'] ?? (source as any).barangay ?? null,
      streetAddress: existingPerm?.streetAddress ?? (source as any).addressLine ?? cf['primary_address_line'] ?? '',
      zipCode: existingPerm?.zipCode ?? source.zipCode ?? null,
    });
    setGuardian(extractInitialGuardianFromPatient(source));
    setGuardianErrors({});
    setIsGuardianPinValid(null);
    setCustomFieldValues({
      ...cf,
      emergency_contact_name: cf['emergency_contact_name'] ?? (source as any).emergencyContactName ?? '',
      emergency_contact_phone: cf['emergency_contact_phone'] ?? (source as any).emergencyContactPhone ?? '',
      emergency_contact_relationship: cf['emergency_contact_relationship'] ?? (source as any).emergencyContactRelationship ?? '',
    });
    setCustomFieldErrors({});
    setFieldErrors({});
    const cls = cf['classification'] || (cf['affiliation'] === 'Student' ? 'Student' : cf['affiliation'] === 'Employee/Faculty' ? 'Employee' : 'General');
    if (cls === 'Student') {
      setClassification('Student');
      setStudentId(cf['student_id'] || '');
      setCollege(cf['college'] || '');
      setProgram(cf['program'] || '');
      setYearLevel(cf['year_level'] || '');
      setEmployeeId('');
      setDepartment('');
    } else if (cls === 'Employee') {
      setClassification('Employee');
      setEmployeeId(cf['employee_id'] || '');
      setDepartment(cf['department'] || '');
      setStudentId('');
      setCollege('');
      setProgram('');
      setYearLevel('');
    } else {
      setClassification('General');
      setStudentId('');
      setCollege('');
      setProgram('');
      setYearLevel('');
      setEmployeeId('');
      setDepartment('');
    }
  };

  useEffect(() => {
    if (visible) {
      clinicService.getCustomFields('ClinicPatient').then(([fields]) => {
        if (fields && fields.length > 0) {
          setTenantCustomFields(fields);
        }
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!patient) {
      setHydratedPatient(null);
      setHasFullClinicalContext(false);
      return;
    }
    setHydratedPatient(patient);
    applyPatientToForm(patient);
  }, [patient]);

  useEffect(() => {
    if (!visible || !patient?.id || typeof clinicService.getPatientById !== 'function') {
      return;
    }

    let cancelled = false;
    setHydratingPatient(true);
    clinicService.getPatientById(patient.id)
      .then(([fullPatient]) => {
        if (cancelled || !fullPatient) return;
        setHydratedPatient(fullPatient);
        applyPatientToForm(fullPatient);
      })
      .finally(() => {
        if (!cancelled) {
          setHydratingPatient(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, patient?.id]);

  const handleSave = async () => {
    if (!patient) return;

    if (!firstName.trim() || !lastName.trim() || !dateOfBirth.trim() || !contactNumber.trim()) {
      Alert.alert(
        'Missing Required Details',
        'First name, last name, date of birth, and contact phone number are required.'
      );
      return;
    }

    const dobCheck = validateDateString(dateOfBirth, { boundaryMode: 'pastOrToday' });
    if (!dobCheck.isValid) {
      Alert.alert(
        'Invalid Date of Birth',
        dobCheck.errorMessage || 'Please enter a valid date of birth not in the future.'
      );
      return;
    }

    if (philHealthNumber.trim() && isPinValid === false) {
      Alert.alert(
        'Invalid PhilHealth PIN',
        'Please provide a valid 12-digit PhilHealth Identification Number (Mod-11 check passed) or leave it blank.'
      );
      return;
    }

    const guardianCheck = validateGuardianDraft(
      guardian,
      isMinorFromDob(dateOfBirth),
      isGuardianPinValid
    );
    if (!guardianCheck.isValid) {
      setGuardianErrors(guardianCheck.errors);
      Alert.alert('Invalid Legal Guardian Details', guardianCheck.summary);
      return;
    }

    // Defensive validation for rendered demographic custom fields
    if (renderedCustomFields.length > 0) {
      const { isValid, errors } = validateCustomFields(renderedCustomFields, customFieldValues, staticValues);
      if (!isValid) {
        setCustomFieldErrors(errors);
        const errorMessages = Object.values(errors);
        const hasFormatOrBoundaryError = errorMessages.some((msg) => !msg.endsWith('is required.'));
        Alert.alert(
          hasFormatOrBoundaryError ? 'Invalid Custom Fields' : 'Missing Required Custom Fields',
          errorMessages.join('\n')
        );
        return;
      }
    }

    if (memberType === 'DD') {
      if (!principalFullName.trim()) {
        Alert.alert('Missing Details', 'Principal member full name is required for dependents.');
        return;
      }
      if (!principalRelationship) {
        Alert.alert('Missing Details', 'Relationship to principal member is required.');
        return;
      }
      if (principalMemberPin.trim() && isPrincipalPinValid === false) {
        Alert.alert('Invalid PIN', 'Principal Member PIN failed Mod-11 verification.');
        return;
      }
      if (principalDob.trim()) {
        const pDobCheck = validateDateString(principalDob, { boundaryMode: 'pastOrToday' });
        if (!pDobCheck.isValid) {
          Alert.alert('Invalid Date of Birth', pDobCheck.errorMessage || 'Principal Date of Birth cannot be in the future.');
          return;
        }
      }
    }

    const effectivePatient = hydratedPatient || patient;

    const mergedCustomFields = mergePatientCustomFields({
      patient: effectivePatient,
      effectiveCustomFields: renderedCustomFields,
      customFieldValues,
      staticValues,
      tenantCustomFieldsCount: tenantCustomFields.length,
      classification,
      studentId,
      college,
      program,
      yearLevel,
      employeeId,
      department,
      memberType,
      principalMemberPin,
      principalFullName,
      principalRelationship,
      principalDob,
      philHealthNumber,
      firstName,
      lastName,
      middleName,
      dateOfBirth,
    });

    const allergiesSummary = structuredAllergies.length > 0
      ? structuredAllergies.map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`).join(', ')
      : undefined;

    const normalizedGuardian = normalizeGuardianPayload(guardian);
    const hasAddressInput = Boolean(permanentAddress.regionPsgc || permanentAddress.streetAddress?.trim());

    const payload: RegisterPatientPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      suffix: suffix.trim() || undefined,
      dateOfBirth: dateOfBirth.trim(),
      sex,
      genderIdentity: genderIdentity.trim(),
      civilStatus,
      contactNumber: contactNumber.trim(),
      email: email.trim() || undefined,
      philHealthNumber: philHealthNumber.trim() || undefined,
      seniorCitizenId: seniorCitizenId.trim() || undefined,
      pwdId: pwdId.trim() || undefined,
      bloodType: bloodType.trim() || undefined,
      allergies: hasFullClinicalContext ? (allergiesSummary ?? '') : allergiesSummary,
      structuredAllergies: hasFullClinicalContext
        ? structuredAllergies
        : structuredAllergies.length > 0
          ? structuredAllergies
          : undefined,
      chronicConditions: formatMedicalHistoriesSummary(structuredMedicalHistories) || undefined,
      alerts: hasFullClinicalContext ? alerts.trim() : alerts.trim() || undefined,
      customFields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : undefined,
      verificationStatus: effectivePatient.verificationStatus || 'Verified',
      medicalHistories: hasFullClinicalContext
        ? structuredMedicalHistories
        : structuredMedicalHistories.length > 0
          ? structuredMedicalHistories
          : undefined,
      addresses: hasAddressInput
        ? [permanentAddress]
        : effectivePatient.addresses && effectivePatient.addresses.length > 0
          ? []
          : undefined,
      guardians: normalizedGuardian
        ? [normalizedGuardian]
        : effectivePatient.guardians && effectivePatient.guardians.length > 0
          ? []
          : undefined,
      regionPsgc: permanentAddress.regionPsgc || undefined,
      provincePsgc: permanentAddress.provincePsgc || undefined,
      cityMunicipalityPsgc: permanentAddress.cityMunicipalityPsgc || undefined,
      barangayPsgc: permanentAddress.barangayPsgc || undefined,
      zipCode: permanentAddress.zipCode || undefined,
    };

    setSaving(true);
    const [updated, err] = await clinicService.updatePatient(patient.id, payload);
    setSaving(false);

    if (updated) {
      notify.success(`${updated.fullName || firstName} updated successfully.`);
      setFieldErrors({});
      onSaved(updated);
      onClose();
    } else {
      const fieldErrorsMap: Record<string, string> = {};
      if (err) {
        if (typeof err.getFieldErrorsMap === 'function') {
          Object.assign(fieldErrorsMap, err.getFieldErrorsMap());
        }
        const fnErr = err.getFieldError?.('firstName');
        if (fnErr) fieldErrorsMap.firstName = fnErr;

        const lnErr = err.getFieldError?.('lastName');
        if (lnErr) fieldErrorsMap.lastName = lnErr;

        const mnErr = err.getFieldError?.('middleName');
        if (mnErr) fieldErrorsMap.middleName = mnErr;

        const dobErr = err.getFieldError?.('dateOfBirth') || err.getFieldError?.('dob');
        if (dobErr) fieldErrorsMap.dateOfBirth = dobErr;

        const phoneErr = err.getFieldError?.('contactNumber') || err.getFieldError?.('phone');
        if (phoneErr) fieldErrorsMap.contactNumber = phoneErr;

        const philErr = err.getFieldError?.('philHealthId') || err.getFieldError?.('philHealthPin') || err.getFieldError?.('philHealthNumber');
        if (philErr) {
          fieldErrorsMap.philHealthId = philErr;
          fieldErrorsMap.philHealthPin = philErr;
          fieldErrorsMap.philHealthNumber = philErr;
        }

        const emailErr = err.getFieldError?.('email');
        if (emailErr) fieldErrorsMap.email = emailErr;
      }
      setFieldErrors(fieldErrorsMap);

      notify.error(err?.message || 'Failed to update patient demographics.', {
        traceId: err?.traceId,
      });
    }
  };

  return (
    <Modal raw visible={visible} animationType="slide" transparent onClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.headerTitleGroup}>
              <ThemedText variant="title" color={theme.colors.text}>
                Edit Patient Demographics
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {patient ? `${patient.fullName} (${patient.patientCode})` : 'Update details'}
              </ThemedText>
            </View>
            <Pressable
              onPress={onClose}
              disabled={saving}
              style={styles.closeBtn}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>
          </View>

          {/* Form Body */}
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            showsVerticalScrollIndicator
          >
            {/* Primary Identification Section */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Primary Identification
            </ThemedText>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Input
                  label="First Name"
                  required
                  placeholder="First Name"
                  value={firstName}
                  onChangeText={(val) => {
                    setFirstName(val);
                    clearFieldError('firstName');
                  }}
                  error={fieldErrors.firstName}
                />
              </View>
              <View style={styles.formCol}>
                <Input
                  label="Middle Name"
                  placeholder="Middle Name"
                  value={middleName}
                  onChangeText={(val) => {
                    setMiddleName(val);
                    clearFieldError('middleName');
                  }}
                  error={fieldErrors.middleName}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Input
                  label="Last Name"
                  required
                  placeholder="Last Name"
                  value={lastName}
                  onChangeText={(val) => {
                    setLastName(val);
                    clearFieldError('lastName');
                  }}
                  error={fieldErrors.lastName}
                />
              </View>
              <View style={styles.formCol}>
                <Input
                  label="Suffix"
                  placeholder="e.g. Jr., Sr., III"
                  value={suffix}
                  onChangeText={(val) => {
                    setSuffix(val);
                    clearFieldError('suffix');
                  }}
                  error={fieldErrors.suffix}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <ValidatedDateInput
                  label="Date of Birth"
                  required
                  placeholder="YYYY-MM-DD"
                  value={dateOfBirth}
                  onChangeText={(val) => {
                    setDateOfBirth(val);
                    clearFieldError('dateOfBirth');
                    clearFieldError('dob');
                  }}
                  boundaryMode="pastOrToday"
                  error={fieldErrors.dateOfBirth || fieldErrors.dob}
                />
              </View>
              <View style={styles.formCol}>
                <BloodTypeSelect
                  value={bloodType}
                  onChange={setBloodType}
                />
              </View>
            </View>

            {/* Biological Sex & Gender Identity Side-by-Side */}
            <View style={styles.formRow}>
              <View style={[styles.formCol, { minWidth: 0 }]}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Sex<ThemedText color={theme.colors.emergency}> *</ThemedText>
                </ThemedText>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.pillScroll}
                  contentContainerStyle={styles.pillScrollRow}
                >
                  {sexOptions.map((item) => {
                    const isSelected = sex.toLowerCase() === item.toLowerCase();
                    return (
                      <Pressable
                        key={item}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: isSelected }}
                        accessibilityLabel={`Sex: ${item}`}
                        style={[styles.scrollablePill, isSelected && styles.pillActive]}
                        onPress={() => setSex(item)}
                      >
                        <ThemedText
                          variant="smallBold"
                          numberOfLines={1}
                          color={isSelected ? theme.colors.textInverted : theme.colors.textSecondary}
                        >
                          {item}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
              <View style={[styles.formCol, { minWidth: 0 }]}>
                <Select
                  label="Gender Identity"
                  placeholder="Select gender identity"
                  value={genderIdentity}
                  options={genderIdentityOptions}
                  onSelect={setGenderIdentity}
                  allowClear
                  allowCustom
                  modalTitle="Select Gender Identity"
                />
              </View>
            </View>

            {/* Civil Status Selector (Horizontally Scrollable) */}
            <View style={{ gap: theme.spacing.xs }}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Civil Status
              </ThemedText>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.pillScroll}
                contentContainerStyle={styles.pillScrollRow}
              >
                {civilStatusOptions.map((item) => {
                  const normCurrent = civilStatus.toLowerCase();
                  const normItem = item.toLowerCase();
                  const isSelected =
                    normCurrent === normItem ||
                    ((normCurrent === 'cohabiting' || normCurrent === 'commonlaw') &&
                      normItem.startsWith('cohabiting')) ||
                    (normCurrent === 'other' && normItem === 'other civil status');
                  return (
                    <Pressable
                      key={item}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: isSelected }}
                      accessibilityLabel={`Civil Status: ${item}`}
                      style={[styles.scrollablePill, isSelected && styles.pillActive]}
                      onPress={() => setCivilStatus(item)}
                    >
                      <ThemedText
                        variant="smallBold"
                        numberOfLines={1}
                        color={isSelected ? theme.colors.textInverted : theme.colors.textSecondary}
                      >
                        {item}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* Contact & Address Section */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Contact & Address
            </ThemedText>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <Input
                  label="Contact Phone Number"
                  required
                  placeholder="0917-123-4567"
                  value={contactNumber}
                  onChangeText={(val) => {
                    setContactNumber(val);
                    clearFieldError('contactNumber');
                    clearFieldError('phone');
                  }}
                  error={fieldErrors.contactNumber || fieldErrors.phone}
                />
              </View>
              <View style={styles.formCol}>
                <Input
                  label="Email Address"
                  placeholder="patient@example.com"
                  value={email}
                  onChangeText={(val) => {
                    setEmail(val);
                    clearFieldError('email');
                  }}
                  error={fieldErrors.email}
                />
              </View>
            </View>

            {/* Home Address (Official 1NF PatientAddress Entity) */}
            <PsgcAddressSelector
              value={permanentAddress}
              onChange={setPermanentAddress}
            />

            {/* Secondary Address (Dynamic Custom Fields) */}
            {addressFields.length > 0 && (
              <>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
                  Secondary Address
                </ThemedText>
                <DynamicCustomFieldsRenderer
                  fields={addressFields}
                  values={customFieldValues}
                  onChange={handleCustomFieldChange}
                  errors={customFieldErrors}
                  staticValues={staticValues}
                />
              </>
            )}

            {/* Legal Guardian (Official 1NF PatientGuardian Entity) */}
            <GuardianSection
              guardian={guardian}
              onChange={setGuardian}
              patientDateOfBirth={dateOfBirth}
              errors={guardianErrors}
              onClearError={clearGuardianError}
              onPinValidityChange={setIsGuardianPinValid}
            />

            {/* Emergency Contact (Dynamic Custom Fields) */}
            {emergencyFields.length > 0 && (
              <>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
                  Emergency Contact
                </ThemedText>
                <DynamicCustomFieldsRenderer
                  fields={emergencyFields}
                  values={customFieldValues}
                  onChange={handleCustomFieldChange}
                  errors={customFieldErrors}
                  staticValues={staticValues}
                />
              </>
            )}

            {/* Government IDs & Coverage */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Government IDs & Coverage
            </ThemedText>

            <PhilHealthPinInput
              label="PhilHealth PIN"
              value={philHealthNumber}
              onChangeText={(val) => {
                setPhilHealthNumber(val);
                clearFieldError('philHealthId');
                clearFieldError('philHealthPin');
                clearFieldError('philHealthNumber');
              }}
              onValidityChange={setIsPinValid}
              error={fieldErrors.philHealthId || fieldErrors.philHealthPin || fieldErrors.philHealthNumber}
            />

            {/* PhilHealth Member Type Selector (MM vs DD) */}
            <View style={{ gap: 4 }}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                PhilHealth Member Type *
              </ThemedText>
              <SegmentedControl
                options={[
                  { value: 'MM', label: 'Member' },
                  { value: 'DD', label: 'Dependent' },
                ]}
                value={memberType}
                onChange={(val) => setMemberType(val as MemberType)}
              />
            </View>

            {/* Conditional Principal Sponsor Details Card when DD */}
            {memberType === 'DD' && (
              <View style={styles.sponsorCard}>
                <View style={styles.sponsorHeaderRow}>
                  <View style={styles.sponsorHeader}>
                    <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primaryDark} />
                    <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                      Principal Member Details
                    </ThemedText>
                  </View>
                  <Button
                    title={guardianSponsor ? guardianSponsor.buttonLabel : 'Use Legal Guardian'}
                    icon="copy"
                    variant="outline"
                    size="sm"
                    onPress={handleApplyGuardianAsSponsor}
                  />
                </View>

                <Input
                  label="Principal Member Full Name *"
                  placeholder="e.g. Maria Santos"
                  value={principalFullName}
                  onChangeText={(val) => {
                    setPrincipalFullName(val);
                    clearFieldError('principalFullName');
                  }}
                  error={fieldErrors.principalFullName}
                />

                <View style={{ gap: 4 }}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                    Relationship to Principal Member *
                  </ThemedText>
                  <View style={styles.relationshipGrid}>
                    {relationshipOptions.map((rel) => {
                      const isSelected = principalRelationship === rel.code;
                      return (
                        <Pressable
                          key={rel.code}
                          onPress={() => setPrincipalRelationship(rel.code as PrincipalRelationship)}
                          style={[
                            styles.relationshipChip,
                            isSelected && styles.relationshipChip_selected,
                          ]}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <ThemedText
                            variant="captionBold"
                            color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                          >
                            {rel.label}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.formRow}>
                  <View style={styles.formCol}>
                    <PhilHealthPinInput
                      label="Principal Member PIN"
                      value={principalMemberPin}
                      onChangeText={setPrincipalMemberPin}
                      onValidityChange={setIsPrincipalPinValid}
                      error={fieldErrors.principalMemberPin}
                    />
                  </View>
                  <View style={styles.formCol}>
                    <ValidatedDateInput
                      label="Principal Date of Birth"
                      value={principalDob}
                      onChangeText={setPrincipalDob}
                      boundaryMode="pastOrToday"
                      placeholder="YYYY-MM-DD"
                    />
                  </View>
                </View>
              </View>
            )}

            <View style={styles.formRow}>
              {isSenior && (
                <View style={styles.formCol}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                    Senior Citizen ID
                  </ThemedText>
                  <TextInput
                    style={styles.textInput}
                    placeholder="SC-SP-2020-001"
                    placeholderTextColor={theme.colors.textMuted}
                    value={seniorCitizenId}
                    onChangeText={setSeniorCitizenId}
                  />
                </View>
              )}
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  PWD ID
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="PWD-BIN-2022-001"
                  placeholderTextColor={theme.colors.textMuted}
                  value={pwdId}
                  onChangeText={setPwdId}
                />
              </View>
            </View>
          </ScrollView>

          {/* Action Footer */}
          <View style={styles.modalFooter}>
            <Button
              title="Cancel"
              variant="outline"
              size="md"
              onPress={onClose}
              disabled={saving}
            />
            <Button
              title={saving ? 'Saving...' : 'Save Demographics'}
              variant="primary"
              size="md"
              icon="save"
              loading={saving}
              onPress={handleSave}
              disabled={saving || (hydratingPatient && !hasFullClinicalContext)}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default EditPatientModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    width: '100%',
    maxWidth: 720,
    maxHeight: '95%',
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    paddingBottom: theme.spacing.md,
  },
  headerTitleGroup: {
    gap: 2,
  },
  closeBtn: {
    padding: theme.spacing.xs,
  },
  formScroll: {
    flexShrink: 1,
    maxHeight: 520,
  },
  formContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: theme.spacing.xs,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
  },
  formCol: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  inputLabel: {
    marginBottom: 2,
  },
  textInput: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    minHeight: theme.sizes.controlMd,
  },
  pillRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: 2,
  },
  pillScroll: {
    width: '100%',
    flexGrow: 0,
  },
  pillScrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingRight: theme.spacing.xs,
  },
  scrollablePill: {
    flexShrink: 0,
    minHeight: theme.sizes.controlMd,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  institutionalBox: {
    backgroundColor: theme.colors.infoBg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.md,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
    paddingTop: theme.spacing.md,
  },
  sponsorCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  sponsorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  relationshipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  relationshipChip: {
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  relationshipChip_selected: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
    borderWidth: 1.5,
  },
});
