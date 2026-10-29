import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import {
  ThemedText,
  Input,
  Icon,
  Button,
  Badge,
  PhilHealthPinInput,
  ValidatedDateInput,
  validateDateString,
  Select,
  type SelectOption,
} from '../ui';
import { theme } from '../../constants/theme';
import { clinicService, type PatientGuardianDto } from '../../services/clinicService';

export function createEmptyGuardianDraft(): PatientGuardianDto {
  return {
    firstName: '',
    lastName: '',
    middleName: '',
    suffix: '',
    birthDate: '',
    sex: '',
    contactNumber: '',
    relationshipCode: '',
    relationshipOtherSpecify: '',
    philHealthPin: '',
    isPrimaryGuardian: true,
    isEmergencyContact: true,
  };
}

import { isMinorFromDob, isSeniorFromDob } from '../../utils/age';

export { isMinorFromDob, isSeniorFromDob };

export function hasAnyGuardianInput(guardian?: PatientGuardianDto | null): boolean {
  if (!guardian) return false;
  return Boolean(
    guardian.firstName?.trim() ||
      guardian.lastName?.trim() ||
      guardian.middleName?.trim() ||
      guardian.suffix?.trim() ||
      guardian.birthDate?.trim() ||
      guardian.sex?.trim() ||
      guardian.contactNumber?.trim() ||
      guardian.relationshipCode?.trim() ||
      guardian.relationshipOtherSpecify?.trim() ||
      guardian.philHealthPin?.replace(/\D/g, '').trim()
  );
}

export function normalizeGuardianPayload(
  guardian?: PatientGuardianDto | null
): PatientGuardianDto | null {
  if (!guardian || !hasAnyGuardianInput(guardian)) {
    return null;
  }
  const relationshipCode = (guardian.relationshipCode || '').trim();
  const rawPin = (guardian.philHealthPin || '').replace(/\D/g, '');
  return {
    ...(guardian.id ? { id: guardian.id } : {}),
    firstName: (guardian.firstName || '').trim(),
    lastName: (guardian.lastName || '').trim(),
    middleName: guardian.middleName?.trim() || null,
    suffix: guardian.suffix?.trim() || null,
    birthDate: guardian.birthDate?.trim() || null,
    sex: guardian.sex?.trim() || null,
    contactNumber: (guardian.contactNumber || '').trim(),
    relationshipCode,
    relationshipOtherSpecify:
      relationshipCode === 'NON_RELATIVE_CAREGIVER'
        ? guardian.relationshipOtherSpecify?.trim() || null
        : null,
    philHealthPin: rawPin || null,
    isPrimaryGuardian: guardian.isPrimaryGuardian ?? true,
    isEmergencyContact: guardian.isEmergencyContact ?? true,
  };
}

export function validateGuardianDraft(
  guardian: PatientGuardianDto | null,
  isMinor: boolean,
  isGuardianPinValid?: boolean | null
): { isValid: boolean; errors: Record<string, string>; summary: string } {
  const errors: Record<string, string> = {};
  const hasInput = hasAnyGuardianInput(guardian);

  if (!isMinor && !hasInput) {
    return { isValid: true, errors: {}, summary: '' };
  }

  if (!guardian?.firstName?.trim()) {
    errors.firstName = 'Guardian first name is required.';
  }
  if (!guardian?.lastName?.trim()) {
    errors.lastName = 'Guardian last name is required.';
  }
  if (!guardian?.relationshipCode?.trim()) {
    errors.relationshipCode = 'Relationship to patient is required.';
  } else if (
    guardian.relationshipCode.trim() === 'NON_RELATIVE_CAREGIVER' &&
    !guardian.relationshipOtherSpecify?.trim()
  ) {
    errors.relationshipOtherSpecify = 'Please specify the caregiver relationship.';
  }
  if (!guardian?.contactNumber?.trim()) {
    errors.contactNumber = 'Guardian contact phone number is required.';
  }

  if (guardian?.birthDate?.trim()) {
    const dobCheck = validateDateString(guardian.birthDate.trim(), {
      boundaryMode: 'pastOrToday',
    });
    if (!dobCheck.isValid) {
      errors.birthDate =
        dobCheck.errorMessage || 'Guardian date of birth cannot be in the future.';
    }
  }

  const pinDigits = guardian?.philHealthPin?.replace(/\D/g, '') || '';
  if (pinDigits.length > 0 && (pinDigits.length !== 12 || isGuardianPinValid === false)) {
    errors.philHealthPin =
      'Please enter a valid 12-digit Guardian PhilHealth PIN or leave it blank.';
  }

  const messages = Object.values(errors);
  return {
    isValid: messages.length === 0,
    errors,
    summary: messages.join('\n'),
  };
}

export interface GuardianSectionProps {
  guardian: PatientGuardianDto | null;
  onChange: (next: PatientGuardianDto | null) => void;
  patientDateOfBirth?: string;
  errors?: Record<string, string>;
  onClearError?: (field: string) => void;
  onPinValidityChange?: (valid: boolean | null) => void;
}

export function GuardianSection({
  guardian,
  onChange,
  patientDateOfBirth,
  errors = {},
  onClearError,
  onPinValidityChange,
}: GuardianSectionProps) {
  const [relationshipOptions, setRelationshipOptions] = useState<SelectOption[]>([]);
  const [sexOptions, setSexOptions] = useState<SelectOption[]>([]);

  const isMinor = isMinorFromDob(patientDateOfBirth);
  const expanded = isMinor || guardian !== null;

  useEffect(() => {
    let isMounted = true;
    clinicService.getOptionSet('guardian_relationship').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setRelationshipOptions(
          opts.map((o) => ({
            value: o.code,
            label: o.label,
            requiresCustom: Boolean(o.requiresSpecifyText),
          }))
        );
      }
    });
    clinicService.getOptionSet('sex').then((opts) => {
      if (isMounted && opts && opts.length > 0) {
        setSexOptions(
          opts.map((o) => ({
            value: o.label,
            label: o.label,
          }))
        );
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (isMinor && guardian === null) {
      onChange(createEmptyGuardianDraft());
    }
  }, [isMinor, guardian, onChange]);

  const currentDraft: PatientGuardianDto = guardian ?? createEmptyGuardianDraft();

  const updateField = <K extends keyof PatientGuardianDto>(
    field: K,
    value: PatientGuardianDto[K]
  ) => {
    onClearError?.(String(field));
    onChange({
      ...currentDraft,
      [field]: value,
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerTitleRow}>
          <Icon name="shield" size={theme.sizes.iconSm} color={theme.colors.primary} />
          <ThemedText variant="smallBold" color={theme.colors.text}>
            Legal Guardian
          </ThemedText>
          <Badge
            label={isMinor ? 'Required for Minors' : 'Optional'}
            variant={isMinor ? 'warning' : 'neutral'}
          />
        </View>
        {!isMinor &&
          (expanded ? (
            <Button
              title="Remove"
              variant="ghost"
              size="sm"
              onPress={() => {
                onPinValidityChange?.(null);
                onChange(null);
              }}
            />
          ) : (
            <Button
              title="+ Add Guardian"
              variant="outline"
              size="sm"
              onPress={() => onChange(createEmptyGuardianDraft())}
            />
          ))}
      </View>

      {!expanded ? (
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Capture parent, legal guardian, or authorized caregiver details (automatically required for patients under 18).
        </ThemedText>
      ) : (
        <View style={styles.fieldsStack}>
          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Input
                label="Guardian First Name"
                required
                placeholder="First Name"
                value={currentDraft.firstName}
                onChangeText={(val) => updateField('firstName', val)}
                error={errors.firstName}
              />
            </View>
            <View style={styles.formCol}>
              <Input
                label="Guardian Last Name"
                required
                placeholder="Last Name"
                value={currentDraft.lastName}
                onChangeText={(val) => updateField('lastName', val)}
                error={errors.lastName}
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Input
                label="Guardian Middle Name"
                placeholder="Middle Name"
                value={currentDraft.middleName || ''}
                onChangeText={(val) => updateField('middleName', val)}
              />
            </View>
            <View style={styles.formCol}>
              <Input
                label="Guardian Suffix"
                placeholder="e.g. Jr., Sr., III"
                value={currentDraft.suffix || ''}
                onChangeText={(val) => updateField('suffix', val)}
              />
            </View>
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Select
                label="Relationship to Patient"
                required
                placeholder="Select relationship"
                value={currentDraft.relationshipCode}
                options={relationshipOptions}
                onSelect={(val) => {
                  onClearError?.('relationshipCode');
                  onClearError?.('relationshipOtherSpecify');
                  onChange({
                    ...currentDraft,
                    relationshipCode: val,
                    relationshipOtherSpecify:
                      val === 'NON_RELATIVE_CAREGIVER'
                        ? currentDraft.relationshipOtherSpecify || ''
                        : '',
                  });
                }}
                allowCustom={false}
                error={errors.relationshipCode}
                modalTitle="Select Guardian Relationship"
              />
            </View>
            <View style={styles.formCol}>
              <Input
                label="Guardian Contact Phone"
                required
                placeholder="0917-123-4567"
                value={currentDraft.contactNumber}
                onChangeText={(val) => updateField('contactNumber', val)}
                error={errors.contactNumber}
              />
            </View>
          </View>

          {currentDraft.relationshipCode === 'NON_RELATIVE_CAREGIVER' && (
            <Input
              label="Specify Caregiver Relationship"
              required
              placeholder="e.g. Foster Aunt, Authorized Caregiver"
              value={currentDraft.relationshipOtherSpecify || ''}
              onChangeText={(val) => updateField('relationshipOtherSpecify', val)}
              error={errors.relationshipOtherSpecify}
            />
          )}

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <ValidatedDateInput
                label="Guardian Date of Birth"
                placeholder="YYYY-MM-DD"
                value={currentDraft.birthDate || ''}
                onChangeText={(val) => updateField('birthDate', val)}
                boundaryMode="pastOrToday"
                error={errors.birthDate}
              />
            </View>
            <View style={styles.formCol}>
              <Select
                label="Guardian Sex"
                placeholder="Select sex"
                value={currentDraft.sex || ''}
                options={sexOptions}
                onSelect={(val) => updateField('sex', val)}
                allowClear
                allowCustom={false}
                modalTitle="Select Guardian Sex"
              />
            </View>
          </View>

          <PhilHealthPinInput
            label="Guardian PhilHealth PIN"
            value={currentDraft.philHealthPin || ''}
            onChangeText={(val) => updateField('philHealthPin', val)}
            onValidityChange={onPinValidityChange}
            error={errors.philHealthPin}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: Boolean(currentDraft.isEmergencyContact) }}
            accessibilityLabel="Also set as Primary Emergency Contact"
            style={styles.checkboxRow}
            onPress={() =>
              updateField('isEmergencyContact', !currentDraft.isEmergencyContact)
            }
          >
            <View
              style={[
                styles.checkboxBox,
                currentDraft.isEmergencyContact && styles.checkboxBoxChecked,
              ]}
            >
              {currentDraft.isEmergencyContact && (
                <Icon name="check" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
              )}
            </View>
            <ThemedText variant="small" color={theme.colors.textSecondary}>
              Also set as Primary Emergency Contact
            </ThemedText>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceMuted,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  fieldsStack: {
    gap: theme.spacing.md,
    paddingTop: theme.spacing.xs,
  },
  formRow: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
  },
  formCol: {
    flex: 1,
    minWidth: 220,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  checkboxBox: {
    width: theme.sizes.iconMd,
    height: theme.sizes.iconMd,
    borderRadius: theme.radii.xs,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
});

export default GuardianSection;
