import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import { ClinicPatient, ClinicCustomFieldDefinition } from '../../services/clinicService';
import { computePatientLocation } from './patientLocation';

export const STANDARD_SEARCH_FIELDS = [
  { key: 'patientCode', label: 'Patient Code / ID', defaultChecked: true },
  { key: 'age', label: 'Age (e.g. 28y)', defaultChecked: false },
  { key: 'dateOfBirth', label: 'Date of Birth (YYYY-MM-DD)', defaultChecked: false },
  { key: 'gender', label: 'Sex / Gender', defaultChecked: false },
  { key: 'contactNumber', label: 'Contact Phone Number', defaultChecked: false },
  { key: 'philHealthNumber', label: 'PhilHealth PIN', defaultChecked: false },
  { key: 'barangay', label: 'Address / Location', defaultChecked: false },
  { key: 'bloodType', label: 'Blood Type', defaultChecked: false },
  { key: 'civilStatus', label: 'Civil Status', defaultChecked: false },
] as const;

export interface PatientSearchResultRowProps {
  patient: ClinicPatient;
  configuredFieldKeys?: string[];
  customFieldDefs?: ClinicCustomFieldDefinition[];
  onPress?: () => void;
  testID?: string;
}

export function parseConfiguredSearchFields(jsonOrArray?: string | string[] | null): string[] {
  if (!jsonOrArray) return ['patientCode'];
  if (Array.isArray(jsonOrArray)) return jsonOrArray;
  try {
    const parsed = JSON.parse(jsonOrArray);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fallback
  }
  return ['patientCode'];
}

export default function PatientSearchResultRow({
  patient,
  configuredFieldKeys = ['patientCode'],
  customFieldDefs = [],
  onPress,
  testID = 'patient-search-result-row',
}: PatientSearchResultRowProps) {
  const activeKeys = configuredFieldKeys.length > 0 ? configuredFieldKeys : ['patientCode'];

  // Helper to extract display value for a key
  const renderFieldDetail = (key: string): { label?: string; value: string } | null => {
    switch (key) {
      case 'patientCode':
        return patient.patientCode ? { value: patient.patientCode } : null;
      case 'age':
        return patient.age != null ? { value: `${patient.age}y` } : null;
      case 'dateOfBirth':
        return patient.dateOfBirth ? { label: 'DOB', value: patient.dateOfBirth } : null;
      case 'gender':
        return patient.gender ? { value: patient.gender } : null;
      case 'contactNumber':
        return patient.contactNumber ? { value: patient.contactNumber } : null;
      case 'philHealthNumber':
        return patient.philHealthNumber ? { label: 'PhilHealth', value: patient.philHealthNumber } : null;
      case 'bloodType':
        return patient.bloodType ? { label: 'Blood', value: patient.bloodType } : null;
      case 'civilStatus':
        return patient.civilStatus ? { value: patient.civilStatus } : null;
      case 'barangay': {
        const loc = computePatientLocation(patient);
        return loc ? { value: loc } : null;
      }
      default: {
        // Custom metadata field
        const customDef = customFieldDefs.find((d) => d.fieldKey === key || `meta:${d.fieldKey}` === key);
        const actualKey = key.startsWith('meta:') ? key.slice(5) : key;
        const rawVal = patient.customFields?.[actualKey];
        if (rawVal != null && String(rawVal).trim() !== '') {
          return {
            label: customDef?.label || actualKey,
            value: String(rawVal),
          };
        }
        return null;
      }
    }
  };

  const details = activeKeys
    .map((k) => renderFieldDetail(k))
    .filter((d): d is { label?: string; value: string } => d !== null);

  return (
    <Pressable
      testID={testID}
      style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}
      onPress={onPress}
    >
      <View style={styles.headerLine}>
        <ThemedText variant="bodyBold" color={theme.colors.text}>
          {patient.fullName}
        </ThemedText>
        {patient.verificationStatus ? (
          <Badge
            label={patient.verificationStatus}
            variant={patient.verificationStatus === 'Verified' ? 'success' : 'neutral'}
            size="sm"
          />
        ) : null}
      </View>

      {details.length > 0 ? (
        <View style={styles.detailsRow}>
          {details.map((d, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <ThemedText variant="caption" color={theme.colors.textLight}>
                  ·
                </ThemedText>
              )}
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {d.label ? `${d.label}: ` : ''}
                <ThemedText variant="captionBold" color={theme.colors.text}>
                  {d.value}
                </ThemedText>
              </ThemedText>
            </React.Fragment>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  resultRow: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  resultRowPressed: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  headerLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
