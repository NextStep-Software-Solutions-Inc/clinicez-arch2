import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { ThemedText, TextInput, Input, Icon, Button, PhilHealthPinInput, ValidatedDateInput, validateDateString, BloodTypeSelect } from '../ui';
import { theme } from '../../constants/theme';
import { clinicService, type ClinicPatient, type RegisterPatientPayload, type ClinicCustomFieldDefinition } from '../../services/clinicService';
import { DynamicCustomFieldsRenderer, validateCustomFields, sanitizeCustomFieldsPayload } from '../custom-fields';
import { notify, Alert } from '../../utils/feedback';

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
  const [addressLine, setAddressLine] = useState('');
  const [barangay, setBarangay] = useState('');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('');
  const [philHealthNumber, setPhilHealthNumber] = useState('');
  const [seniorCitizenId, setSeniorCitizenId] = useState('');
  const [pwdId, setPwdId] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const clearFieldError = (field: string) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

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
    setAddressLine(patient.addressLine || '');
    setBarangay(patient.barangay || '');
    setCity(patient.city || '');
    setProvince(patient.province || '');
    setEmergencyContactName(patient.emergencyContactName || '');
    setEmergencyContactPhone(patient.emergencyContactPhone || '');
    setEmergencyContactRelationship(patient.emergencyContactRelationship || '');
    setPhilHealthNumber(patient.philHealthNumber || '');
    setSeniorCitizenId(patient.seniorCitizenId || '');
    setPwdId(patient.pwdId || '');
    setBloodType(patient.bloodType || '');
    setAllergies(patient.allergies || '');
    setChronicConditions(patient.chronicConditions || '');
    setAlerts(patient.alerts || '');

    const cf = patient.customFields || {};
    setCustomFieldValues({ ...cf });
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
    const staticValues = { gender, civilStatus, dateOfBirth };
    if (tenantCustomFields.length > 0) {
      const { isValid, errors } = validateCustomFields(tenantCustomFields, customFieldValues, staticValues);
      if (!isValid) {
        setCustomFieldErrors(errors);
        Alert.alert('Missing Required Custom Fields', Object.values(errors).join('\n'));
        return;
      }
    }

    setSaving(true);

    const mergedCustomFields: Record<string, any> = {
      ...(patient.customFields || {}),
    };

    if (tenantCustomFields.length > 0) {
      const cleanCustom = sanitizeCustomFieldsPayload(tenantCustomFields, customFieldValues, staticValues);
      Object.assign(mergedCustomFields, cleanCustom);
    } else {
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
      addressLine: addressLine.trim() || undefined,
      barangay: barangay.trim() || undefined,
      city: city.trim() || undefined,
      province: province.trim() || undefined,
      emergencyContactName: emergencyContactName.trim() || undefined,
      emergencyContactPhone: emergencyContactPhone.trim() || undefined,
      emergencyContactRelationship: emergencyContactRelationship.trim() || undefined,
      philHealthNumber: philHealthNumber.trim() || undefined,
      seniorCitizenId: seniorCitizenId.trim() || undefined,
      pwdId: pwdId.trim() || undefined,
      bloodType: bloodType.trim() || undefined,
      allergies: allergies.trim() || undefined,
      chronicConditions: chronicConditions.trim() || undefined,
      alerts: alerts.trim() || undefined,
      customFields: Object.keys(mergedCustomFields).length > 0 ? mergedCustomFields : undefined,
      verificationStatus: patient.verificationStatus || 'Verified',
    };

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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
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

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Address Line / Street
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="House / Unit / Street"
                  placeholderTextColor={theme.colors.textMuted}
                  value={addressLine}
                  onChangeText={setAddressLine}
                />
              </View>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Barangay
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="Barangay"
                  placeholderTextColor={theme.colors.textMuted}
                  value={barangay}
                  onChangeText={setBarangay}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  City / Municipality
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="City"
                  placeholderTextColor={theme.colors.textMuted}
                  value={city}
                  onChangeText={setCity}
                />
              </View>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Province
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="Province"
                  placeholderTextColor={theme.colors.textMuted}
                  value={province}
                  onChangeText={setProvince}
                />
              </View>
            </View>

            {/* Emergency Contact Section */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Emergency Contact
            </ThemedText>

            <View style={styles.formRow}>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Contact Person Name
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="Full Name"
                  placeholderTextColor={theme.colors.textMuted}
                  value={emergencyContactName}
                  onChangeText={setEmergencyContactName}
                />
              </View>
              <View style={styles.formCol}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                  Contact Person Phone
                </ThemedText>
                <TextInput
                  style={styles.textInput}
                  placeholder="0918-123-4567"
                  placeholderTextColor={theme.colors.textMuted}
                  value={emergencyContactPhone}
                  onChangeText={setEmergencyContactPhone}
                />
              </View>
            </View>

            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Relationship to Patient
              </ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Spouse, Parent, Sibling, Guardian"
                placeholderTextColor={theme.colors.textMuted}
                value={emergencyContactRelationship}
                onChangeText={setEmergencyContactRelationship}
              />
            </View>

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

            {/* Institutional & Custom Metadata */}
            {tenantCustomFields.length > 0 && (
              <>
                <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
                  Additional Intake & Institutional Details
                </ThemedText>
                <DynamicCustomFieldsRenderer
                  fields={tenantCustomFields}
                  values={customFieldValues}
                  onChange={(key, val) => {
                    setCustomFieldValues((prev) => ({ ...prev, [key]: val }));
                    setCustomFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next[key];
                      return next;
                    });
                  }}
                  errors={customFieldErrors}
                  staticValues={{ gender, civilStatus, dateOfBirth }}
                />
              </>
            )}

            {/* Clinical Summary & Alerts */}
            <ThemedText variant="captionBold" color={theme.colors.primaryDark} style={styles.sectionHeader}>
              Clinical Summary & Alerts
            </ThemedText>

            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Known Allergies
              </ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Penicillin, Peanuts"
                placeholderTextColor={theme.colors.textMuted}
                value={allergies}
                onChangeText={setAllergies}
              />
            </View>

            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Chronic Conditions
              </ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Hypertension, Asthma"
                placeholderTextColor={theme.colors.textMuted}
                value={chronicConditions}
                onChangeText={setChronicConditions}
              />
            </View>

            <View>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.inputLabel}>
                Clinical Alerts
              </ThemedText>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. High fall risk, Hearing impaired"
                placeholderTextColor={theme.colors.textMuted}
                value={alerts}
                onChangeText={setAlerts}
              />
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
              disabled={saving}
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
});
