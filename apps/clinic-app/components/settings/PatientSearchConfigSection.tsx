import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  clinicService,
  ClinicSettingsRecord,
  ClinicCustomFieldDefinition,
  ClinicPatient,
} from '../../services/clinicService';
import PatientSearchResultRow, {
  STANDARD_SEARCH_FIELDS,
  parseConfiguredSearchFields,
} from '../patient/PatientSearchResultRow';

interface PatientSearchConfigSectionProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (settings: ClinicSettingsRecord) => void;
}

export default function PatientSearchConfigSection({
  settings,
  onSettingsUpdated,
}: PatientSearchConfigSectionProps) {
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() =>
    parseConfiguredSearchFields(settings?.patientSearchDisplayFieldsJson)
  );
  const [customFields, setCustomFields] = useState<ClinicCustomFieldDefinition[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoadingFields(true);
    clinicService
      .getCustomFields('ClinicPatient')
      .then(([fields]) => {
        if (mounted && fields) {
          setCustomFields(fields.filter((f) => f.isActive));
        }
      })
      .finally(() => {
        if (mounted) setLoadingFields(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (settings?.patientSearchDisplayFieldsJson !== undefined) {
      setSelectedKeys(parseConfiguredSearchFields(settings.patientSearchDisplayFieldsJson));
    }
  }, [settings?.patientSearchDisplayFieldsJson]);

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) {
        // Prevent deselecting everything: keep at least 1 key
        if (prev.length <= 1) {
          notify.error('At least one field must be displayed in search results.');
          return prev;
        }
        return prev.filter((k) => k !== key);
      } else {
        return [...prev, key];
      }
    });
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    const json = JSON.stringify(selectedKeys);
    const [updated, err] = await clinicService.updateSettings({
      patientSearchDisplayFieldsJson: json,
    });
    setSaving(false);

    if (err || !updated) {
      notify.error(err?.message || 'Failed to save patient search display settings.');
      return;
    }

    notify.success('Patient search display settings updated successfully.');
    onSettingsUpdated?.(updated);
  };

  // Sample patient mock for live preview
  const samplePatient: ClinicPatient = {
    id: 'mock-sample-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    patientCode: 'PAT-2026-00001',
    firstName: 'Marco',
    lastName: 'Penida',
    fullName: 'Penida, Marco',
    dateOfBirth: '1998-05-14',
    age: 28,
    gender: 'Male',
    civilStatus: 'Single',
    contactNumber: '+63 917 123 4567',
    philHealthNumber: '12-345678901-2',
    bloodType: 'O+',
    barangay: 'Brgy. San Antonio',
    city: 'Pasig City',
    verificationStatus: 'Verified',
    createdAt: new Date().toISOString(),
    customFields: {
      primary_barangay: 'Brgy. San Antonio',
      primary_city: 'Pasig City',
      insurance_provider: 'PhilHealth Plus',
      department: 'Corporate Account',
      vip_status: 'Gold Tier',
      ...Object.fromEntries(customFields.map((f) => [f.fieldKey, `Sample ${f.label}`])),
    },
  };

  return (
    <Card>
      <CardHeader
        title="Patient Search Result Display"
        subtitle="Configure which patient demographic and metadata fields appear when searching patients across the clinic workstation"
        rightAction={
          <Button
            title="Save Search Fields"
            variant="primary"
            size="sm"
            loading={saving}
            onPress={handleSaveConfig}
          />
        }
      />
      <CardContent>
        <View style={styles.content}>
          {/* Standard Demographic Fields */}
          <View style={styles.section}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Standard Demographic Fields
            </ThemedText>
            <View style={styles.chipsRow}>
              {STANDARD_SEARCH_FIELDS.map((field) => {
                const isSelected = selectedKeys.includes(field.key);
                return (
                  <Pressable
                    key={field.key}
                    style={[styles.fieldChip, isSelected && styles.fieldChipSelected]}
                    onPress={() => toggleKey(field.key)}
                  >
                    <Icon
                      name={isSelected ? 'check' : 'plus'}
                      size={theme.sizes.iconSm}
                      color={isSelected ? theme.colors.onPrimary : theme.colors.textMuted}
                    />
                    <ThemedText
                      variant="captionBold"
                      color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                    >
                      {field.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Custom Metadata Fields */}
          <View style={styles.section}>
            <View style={styles.sectionTitleRow}>
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Patient Custom & Metadata Fields
              </ThemedText>
              <Badge
                label={`${customFields.length} Defined`}
                variant="neutral"
                size="sm"
              />
            </View>

            {loadingFields ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Loading clinic custom fields...
              </ThemedText>
            ) : customFields.length === 0 ? (
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                No custom patient fields configured in Custom Fields tab yet.
              </ThemedText>
            ) : (
              <View style={styles.chipsRow}>
                {customFields.map((field) => {
                  const metaKey = `meta:${field.fieldKey}`;
                  const isSelected = selectedKeys.includes(metaKey) || selectedKeys.includes(field.fieldKey);
                  return (
                    <Pressable
                      key={field.id}
                      style={[styles.fieldChip, isSelected && styles.fieldChipSelected]}
                      onPress={() => toggleKey(metaKey)}
                    >
                      <Icon
                        name={isSelected ? 'check' : 'plus'}
                        size={theme.sizes.iconSm}
                        color={isSelected ? theme.colors.onPrimary : theme.colors.textMuted}
                      />
                      <ThemedText
                        variant="captionBold"
                        color={isSelected ? theme.colors.onPrimary : theme.colors.text}
                      >
                        {field.label} ({field.dataType})
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Live Preview Section */}
          <View style={styles.previewSection}>
            <View style={styles.previewHeader}>
              <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Live Search Result Preview
              </ThemedText>
            </View>
            <View style={styles.previewContainer}>
              <PatientSearchResultRow
                patient={samplePatient}
                configuredFieldKeys={selectedKeys}
                customFieldDefs={customFields}
              />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              This is how search results will appear in the Book Appointment modal and other patient lookup dialogs.
            </ThemedText>
          </View>
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: theme.spacing.lg,
  },
  section: {
    gap: theme.spacing.xs,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  fieldChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    backgroundColor: theme.colors.surfaceMuted,
  },
  fieldChipSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  previewSection: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  previewContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.xs,
  },
});
