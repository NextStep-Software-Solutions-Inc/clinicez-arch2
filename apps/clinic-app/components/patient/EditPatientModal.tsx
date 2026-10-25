import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ThemedText, TextInput, Input, Icon, Button, Badge, PhilHealthPinInput, ValidatedDateInput, validateDateString, BloodTypeSelect, Modal, SegmentedControl } from '../ui';
import { theme } from '../../constants/theme';
import { clinicService, type ClinicPatient, type RegisterPatientPayload, type ClinicCustomFieldDefinition } from '../../services/clinicService';
import { DynamicCustomFieldsRenderer, validateCustomFields, sanitizeCustomFieldsPayload, mergeCustomFieldsForUpdate } from '../custom-fields';
import { notify, Alert } from '../../utils/feedback';
import {
  type MemberType,
  type PrincipalRelationship,
  PHILHEALTH_RELATIONSHIPS,
  buildPhilHealthProfileData,
  extractPhilHealthProfileData,
} from './memberType';
import StructuredAllergyIntakeModal, {
  AllergyPillList,
  CreateAllergyRequest,
} from './StructuredAllergyIntakeModal';
import StructuredMedicalHistoryModal, {
  MedicalHistoryPillList,
  MedicalHistoryItem,
  PHILHEALTH_QUICK_CONDITIONS,
  formatMedicalHistoriesSummary,
  parseChronicConditionsStringToStructured,
} from './StructuredMedicalHistoryModal';
import ClinicalAlertsSection from './ClinicalAlertsSection';
import YakapEnlistmentSection from './YakapEnlistmentSection';

export { parseChronicConditionsStringToStructured };

export const BASELINE_PATIENT_CUSTOM_FIELDS: ClinicCustomFieldDefinition[] = [
  {
    id: 'default-primary-address-line',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'primary_address_line',
    label: 'Address Line / Street',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 1,
    placeholder: 'House / Unit / Street',
    isActive: true,
  },
  {
    id: 'default-primary-barangay',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'primary_barangay',
    label: 'Barangay',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 2,
    placeholder: 'Barangay',
    isActive: true,
  },
  {
    id: 'default-primary-city',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'primary_city',
    label: 'City / Municipality',
    dataType: 'Text',
    category: 'Address',
    isRequired: false,
    displayOrder: 3,
    placeholder: 'City',
    isActive: true,
  },
  {
    id: 'default-primary-province',
    tenantId: '',
    clinicId: '',
    entityType: 'ClinicPatient',
    fieldKey: 'primary_province',
    label: 'Province',
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

export function EditPatientModal({
  patient,
  visible,
  onClose,
  onSaved,
}: EditPatientModalProps) {
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState<'Male' | 'Female' | 'Other'>('Male');
  const [civilStatus, setCivilStatus] = useState<'Single' | 'Married' | 'Widowed' | 'Separated'>('Single');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [philHealthNumber, setPhilHealthNumber] = useState('');
  const [memberType, setMemberType] = useState<MemberType>('MM');
  const [principalMemberPin, setPrincipalMemberPin] = useState('');
  const [principalFullName, setPrincipalFullName] = useState('');
  const [principalRelationship, setPrincipalRelationship] = useState<PrincipalRelationship>('C');
  const [principalDob, setPrincipalDob] = useState('');
  const [isPrincipalPinValid, setIsPrincipalPinValid] = useState<boolean | null>(null);
  const [seniorCitizenId, setSeniorCitizenId] = useState('');
  const [pwdId, setPwdId] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [structuredAllergies, setStructuredAllergies] = useState<CreateAllergyRequest[]>([]);
  const [allergyModalVisible, setAllergyModalVisible] = useState(false);
  const [chronicConditions, setChronicConditions] = useState('');
  const [structuredMedicalHistories, setStructuredMedicalHistories] = useState<MedicalHistoryItem[]>([]);
  const [medicalHistoryModalVisible, setMedicalHistoryModalVisible] = useState(false);
  const [alerts, setAlerts] = useState('');

  const toggleQuickCondition = (code: string, title: string) => {
    setStructuredMedicalHistories((prev) => {
      const exists = prev.some(
        (c) =>
          c.philHealthMdiseaseCode === code ||
          c.conditionTitle.trim().toLowerCase() === title.trim().toLowerCase()
      );
      if (exists) {
        return prev.filter(
          (c) =>
            c.philHealthMdiseaseCode !== code &&
            c.conditionTitle.trim().toLowerCase() !== title.trim().toLowerCase()
        );
      } else {
        return [...prev, { conditionTitle: title, philHealthMdiseaseCode: code }];
      }
    });
  };

  const quickCodesSet = useMemo(() => new Set(PHILHEALTH_QUICK_CONDITIONS.map((q) => q.code)), []);
  const quickTitlesSet = useMemo(() => new Set(PHILHEALTH_QUICK_CONDITIONS.map((q) => q.title.toLowerCase())), []);

  const additionalConditions = useMemo(() => {
    return structuredMedicalHistories.filter(
      (c) =>
        (!(c.philHealthMdiseaseCode && quickCodesSet.has(c.philHealthMdiseaseCode)) &&
         !quickTitlesSet.has(c.conditionTitle.trim().toLowerCase())) ||
        Boolean(c.clinicalNotes?.trim()) ||
        Boolean(c.icd10Code?.trim())
    );
  }, [structuredMedicalHistories, quickCodesSet, quickTitlesSet]);

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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const effectiveCustomFields = useMemo(() => {
    const existingKeys = new Set(tenantCustomFields.map((f) => f.fieldKey));
    const missingBaseline = BASELINE_PATIENT_CUSTOM_FIELDS.filter(
      (bf) => !existingKeys.has(bf.fieldKey)
    );
    return [...tenantCustomFields, ...missingBaseline].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0)
    );
  }, [tenantCustomFields]);

  const addressFields = useMemo(() => {
    return effectiveCustomFields.filter((f) => f.category === 'Address');
  }, [effectiveCustomFields]);

  const emergencyFields = useMemo(() => {
    return effectiveCustomFields.filter((f) => f.category === 'Emergency Contacts');
  }, [effectiveCustomFields]);

  const additionalCustomFields = useMemo(() => {
    return effectiveCustomFields.filter(
      (f) => f.category !== 'Address' && f.category !== 'Emergency Contacts'
    );
  }, [effectiveCustomFields]);

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
    () => ({ gender, civilStatus, dateOfBirth }),
    [gender, civilStatus, dateOfBirth]
  );

  const [saving, setSaving] = useState(false);
  const [isPinValid, setIsPinValid] = useState<boolean | null>(null);

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
    if (!patient) return;

    setFirstName(patient.firstName || '');
    setMiddleName(patient.middleName || '');
    setLastName(patient.lastName || '');
    setSuffix(patient.suffix || '');
    setDateOfBirth(patient.dateOfBirth || '');
    setGender(
      patient.gender === 'Female' ? 'Female' : patient.gender === 'Other' ? 'Other' : 'Male'
    );
    setCivilStatus(
      patient.civilStatus === 'Married'
        ? 'Married'
        : patient.civilStatus === 'Widowed'
        ? 'Widowed'
        : patient.civilStatus === 'Separated'
        ? 'Separated'
        : 'Single'
    );
    setContactNumber(patient.contactNumber || '');
    setEmail(patient.email || '');
    setPhilHealthNumber(patient.philHealthNumber || '');
    const pProfile = extractPhilHealthProfileData(patient.customFields, patient);
    setMemberType(pProfile.memberType);
    setPrincipalMemberPin(pProfile.principalPin);
    setPrincipalFullName(pProfile.principalFullName);
    setPrincipalRelationship(pProfile.principalRelationship);
    setPrincipalDob(pProfile.principalDob);
    setIsPrincipalPinValid(null);
    setSeniorCitizenId(patient.seniorCitizenId || '');
    setPwdId(patient.pwdId || '');
    setBloodType(patient.bloodType || '');
    const initialAllergies = (patient as any)?.structuredAllergies && Array.isArray((patient as any).structuredAllergies) && (patient as any).structuredAllergies.length > 0
      ? (patient as any).structuredAllergies
      : parseAllergiesStringToStructured(patient.allergies);
    setStructuredAllergies(initialAllergies);
    const initialConditions: MedicalHistoryItem[] =
      (patient as any)?.pastMedicalHistories &&
      Array.isArray((patient as any).pastMedicalHistories) &&
      (patient as any).pastMedicalHistories.length > 0
        ? (patient as any).pastMedicalHistories
        : parseChronicConditionsStringToStructured(patient.chronicConditions);
    setStructuredMedicalHistories(initialConditions);
    setChronicConditions(patient.chronicConditions || '');
    setAlerts(patient.alerts || '');

    const cf = patient.customFields || {};
    setCustomFieldValues({
      ...cf,
      primary_address_line: cf['primary_address_line'] ?? (patient as any).addressLine ?? '',
      primary_barangay: cf['primary_barangay'] ?? (patient as any).barangay ?? '',
      primary_city: cf['primary_city'] ?? (patient as any).city ?? '',
      primary_province: cf['primary_province'] ?? (patient as any).province ?? '',
      emergency_contact_name: cf['emergency_contact_name'] ?? (patient as any).emergencyContactName ?? '',
      emergency_contact_phone: cf['emergency_contact_phone'] ?? (patient as any).emergencyContactPhone ?? '',
      emergency_contact_relationship: cf['emergency_contact_relationship'] ?? (patient as any).emergencyContactRelationship ?? '',
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
  }, [patient]);

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

    // Defensive validation for dynamic custom fields
    if (effectiveCustomFields.length > 0) {
      const { isValid, errors } = validateCustomFields(effectiveCustomFields, customFieldValues, staticValues);
      if (!isValid) {
        setCustomFieldErrors(errors);
        Alert.alert('Invalid Custom Fields', Object.values(errors).join('\n'));
        return;
      }
    }

    const mergedCustomFields: Record<string, any> = effectiveCustomFields.length > 0
      ? mergeCustomFieldsForUpdate(
          patient.customFields,
          effectiveCustomFields,
          customFieldValues,
          staticValues,
          { emitNullTombstones: true }
        )
      : { ...(patient.customFields || {}) };

    // Explicit handling for the 7 address & emergency contact keys
    const addressAndContactKeys = [
      'primary_address_line',
      'primary_barangay',
      'primary_city',
      'primary_province',
      'emergency_contact_name',
      'emergency_contact_phone',
      'emergency_contact_relationship',
    ];

    for (const key of addressAndContactKeys) {
      const val = customFieldValues[key];
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed) {
          mergedCustomFields[key] = trimmed;
        } else if (patient.customFields?.[key] || (patient as any)[key]) {
          mergedCustomFields[key] = null;
        } else {
          delete mergedCustomFields[key];
        }
      } else if (val !== undefined && val !== null) {
        mergedCustomFields[key] = val;
      } else if (patient.customFields?.[key] || (patient as any)[key]) {
        mergedCustomFields[key] = null;
      } else {
        delete mergedCustomFields[key];
      }
    }

    if (customFieldValues['yakap_enlistments']) {
      mergedCustomFields['yakap_enlistments'] = customFieldValues['yakap_enlistments'];
    }

    if (tenantCustomFields.length === 0) {
      mergedCustomFields['classification'] = classification;
      if (classification === 'Student') {
        if (studentId.trim()) mergedCustomFields['student_id'] = studentId.trim();
        else delete mergedCustomFields['student_id'];
        if (college.trim()) mergedCustomFields['college'] = college.trim();
        else delete mergedCustomFields['college'];
        if (program.trim()) mergedCustomFields['program'] = program.trim();
        else delete mergedCustomFields['program'];
        if (yearLevel.trim()) mergedCustomFields['year_level'] = yearLevel.trim();
        else delete mergedCustomFields['year_level'];
        delete mergedCustomFields['employee_id'];
        delete mergedCustomFields['department'];
      } else if (classification === 'Employee') {
        if (employeeId.trim()) mergedCustomFields['employee_id'] = employeeId.trim();
        else delete mergedCustomFields['employee_id'];
        if (department.trim()) mergedCustomFields['department'] = department.trim();
        else delete mergedCustomFields['department'];
        delete mergedCustomFields['student_id'];
        delete mergedCustomFields['college'];
        delete mergedCustomFields['program'];
        delete mergedCustomFields['year_level'];
      } else {
        delete mergedCustomFields['student_id'];
        delete mergedCustomFields['college'];
        delete mergedCustomFields['program'];
        delete mergedCustomFields['year_level'];
        delete mergedCustomFields['employee_id'];
        delete mergedCustomFields['department'];
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

    mergedCustomFields['member_type'] = memberType;
    if (memberType === 'DD') {
      mergedCustomFields['principal_member_pin'] = principalMemberPin.trim();
      mergedCustomFields['principal_full_name'] = principalFullName.trim();
      mergedCustomFields['principal_relationship'] = principalRelationship;
      if (principalDob.trim()) mergedCustomFields['principal_dob'] = principalDob.trim();
    } else {
      delete mergedCustomFields['principal_member_pin'];
      delete mergedCustomFields['principal_full_name'];
      delete mergedCustomFields['principal_relationship'];
      delete mergedCustomFields['principal_dob'];
    }

    mergedCustomFields['philhealth_profile'] = buildPhilHealthProfileData({
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

    const allergiesSummary = structuredAllergies.length > 0
      ? structuredAllergies.map((a) => `${a.allergen} (${a.category}${a.isAnaphylactic ? ' - STAT' : ''})`).join(', ')
      : undefined;

    const payload: RegisterPatientPayload = {
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      suffix: suffix.trim() || undefined,
      dateOfBirth: dateOfBirth.trim(),
      gender,
      civilStatus,
      contactNumber: contactNumber.trim(),
      email: email.trim() || undefined,
      philHealthNumber: philHealthNumber.trim() || undefined,
      seniorCitizenId: seniorCitizenId.trim() || undefined,
      pwdId: pwdId.trim() || undefined,
      bloodType: bloodType.trim() || undefined,
      allergies: allergiesSummary,
      structuredAllergies: structuredAllergies.length > 0 ? structuredAllergies : undefined,
      chronicConditions: formatMedicalHistoriesSummary(structuredMedicalHistories) || undefined,
      alerts: alerts.trim() || undefined,
      customFields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : undefined,
      verificationStatus: patient.verificationStatus || 'Verified',
      medicalHistories: structuredMedicalHistories,
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
    <>
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
                  label="Date of Birth (YYYY-MM-DD)"
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

            {/* Sex / Gender Selector */}
            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Sex / Gender *
              </ThemedText>
              <View style={styles.pillRow}>
                {(['Male', 'Female', 'Other'] as const).map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.pill, gender === item && styles.pillActive]}
                    onPress={() => setGender(item)}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={gender === item ? theme.colors.textInverted : theme.colors.textSecondary}
                    >
                      {item}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Civil Status Selector */}
            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Civil Status
              </ThemedText>
              <View style={styles.pillRow}>
                {(['Single', 'Married', 'Widowed', 'Separated'] as const).map((item) => (
                  <Pressable
                    key={item}
                    style={[styles.pill, civilStatus === item && styles.pillActive]}
                    onPress={() => setCivilStatus(item)}
                  >
                    <ThemedText
                      variant="smallBold"
                      color={civilStatus === item ? theme.colors.textInverted : theme.colors.textSecondary}
                    >
                      {item}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
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

            {/* Address Details (Dynamic Custom Fields) */}
            {addressFields.length > 0 && (
              <>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
                  Address Details
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

            {/* Statutory Identifiers */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Statutory Identifiers
            </ThemedText>

            <PhilHealthPinInput
              label="PhilHealth PIN (RA 11223)"
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
                  { value: 'MM', label: 'Member (MM)' },
                  { value: 'DD', label: 'Dependent (DD)' },
                ]}
                value={memberType}
                onChange={(val) => setMemberType(val as MemberType)}
              />
            </View>

            {/* Conditional Principal Sponsor Details Card when DD */}
            {memberType === 'DD' && (
              <View style={styles.sponsorCard}>
                <View style={styles.sponsorHeader}>
                  <Icon name="shield" size={14} color={theme.colors.primaryDark} />
                  <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                    Principal Sponsor Details
                  </ThemedText>
                  <Badge label="Required for Konsulta" variant="info" size="sm" />
                </View>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Required for PhilHealth Konsulta dependent registration and statutory encounter claims.
                </ThemedText>

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
                    {PHILHEALTH_RELATIONSHIPS.map((rel) => {
                      const isSelected = principalRelationship === rel.code;
                      return (
                        <Pressable
                          key={rel.code}
                          onPress={() => setPrincipalRelationship(rel.code)}
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
                      label="Principal Member PIN (RA 11223)"
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
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Senior Citizen ID (RA 9994)
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="SC-SP-2020-001"
                  placeholderTextColor={theme.colors.textMuted}
                  value={seniorCitizenId}
                  onChangeText={setSeniorCitizenId}
                />
              </View>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  PWD ID (RA 10754)
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

            {/* PhilHealth YAKAP Annual Enlistment Lifecycle Section */}
            <YakapEnlistmentSection
              customFields={customFieldValues}
              onCustomFieldsChange={(next) => setCustomFieldValues(next)}
            />

            {/* Institutional & Additional Details */}
            {additionalCustomFields.length > 0 && (
              <>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
                  Institutional & Additional Details
                </ThemedText>
                <DynamicCustomFieldsRenderer
                  fields={additionalCustomFields}
                  values={customFieldValues}
                  onChange={handleCustomFieldChange}
                  errors={customFieldErrors}
                  staticValues={staticValues}
                />
              </>
            )}

            {/* Clinical Summary & Alerts */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Clinical Summary & Alerts
            </ThemedText>

            {/* Embedded Structured Allergy Section */}
            <View style={styles.allergySectionCard}>
              <View style={styles.allergySectionHeader}>
                <View style={styles.allergySectionTitleRow}>
                  <Icon name="emergency" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                    Known Allergies & Anaphylaxis Alerts
                  </ThemedText>
                </View>
                <Button
                  title="+ Add Allergy"
                  variant="outline"
                  size="sm"
                  onPress={() => setAllergyModalVisible(true)}
                />
              </View>

              <AllergyPillList
                allergies={structuredAllergies}
                onRemove={(index) => {
                  setStructuredAllergies((prev) => prev.filter((_, i) => i !== index));
                }}
              />
            </View>

            {/* Section 1: Past Medical History & Chronic Conditions */}
            <View style={styles.formSectionBox}>
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderLeft}>
                  <Icon name="medical" size={16} color={theme.colors.primary} />
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                    Past Medical History & Chronic Conditions
                  </ThemedText>
                </View>
                <Button
                  title="+ Add / Select Condition"
                  variant="outline"
                  size="sm"
                  onPress={() => setMedicalHistoryModalVisible(true)}
                />
              </View>

              {/* Quick Chips Row */}
              <View style={styles.quickChipsRow}>
                {PHILHEALTH_QUICK_CONDITIONS.map((qc) => {
                  const isSelected = structuredMedicalHistories.some(
                    (c) =>
                      c.philHealthMdiseaseCode === qc.code ||
                      c.conditionTitle.trim().toLowerCase() === qc.title.trim().toLowerCase()
                  );
                  return (
                    <Pressable
                      key={qc.code}
                      style={[styles.quickChip, isSelected && styles.quickChipActive]}
                      onPress={() => toggleQuickCondition(qc.code, qc.title)}
                    >
                      <ThemedText
                        variant={isSelected ? 'captionBold' : 'caption'}
                        color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                      >
                        {qc.label}
                      </ThemedText>
                      {isSelected ? (
                        <Icon name="check" size={12} color={theme.colors.primary} />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              {additionalConditions.length > 0 && (
                <View style={styles.additionalConditionsWrap}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={{ marginBottom: 6 }}>
                    Additional Documented Conditions:
                  </ThemedText>
                  <MedicalHistoryPillList
                    items={additionalConditions}
                    onRemove={(index) => {
                      const target = additionalConditions[index];
                      setStructuredMedicalHistories((prev) => prev.filter((item) => item !== target));
                    }}
                  />
                </View>
              )}

              {structuredMedicalHistories.length === 0 && (
                <ThemedText variant="caption" color={theme.colors.textMuted} style={{ marginTop: 2 }}>
                  No chronic conditions selected (Patient has no known chronic illnesses).
                </ThemedText>
              )}
            </View>

            {/* Section 2: Dedicated Clinical & Safety Alerts */}
            <ClinicalAlertsSection
              alerts={alerts}
              onChangeAlerts={setAlerts}
            />
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
              disabled={saving}
            />
          </View>
        </View>
      </View>
    </Modal>

    {/* Structured Allergy Intake Sub-Modal */}
    <StructuredAllergyIntakeModal
      visible={visible && allergyModalVisible}
      onClose={() => setAllergyModalVisible(false)}
      allergies={structuredAllergies}
      onChange={setStructuredAllergies}
    />

    {/* Structured Medical History Intake Sub-Modal */}
    <StructuredMedicalHistoryModal
      visible={visible && medicalHistoryModalVisible}
      onClose={() => setMedicalHistoryModalVisible(false)}
      conditions={structuredMedicalHistories}
      onChange={setStructuredMedicalHistories}
    />
  </>
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
  allergySectionCard: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm + 4,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
  allergySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  allergySectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  formSectionBox: {
    gap: theme.spacing.xs,
  },
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  additionalConditionsWrap: {
    marginTop: theme.spacing.xs,
  },
  quickChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radii.full || 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  quickChipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight,
  },
  sponsorCard: {
    backgroundColor: theme.colors.surfaceSubtle,
    borderColor: theme.colors.borderLight,
    borderWidth: 1,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  sponsorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
