import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge, { BadgeVariant } from '../ui/Badge';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicCustomFieldDefinition } from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

const FIELD_TYPE_BADGE: Record<ClinicCustomFieldDefinition['dataType'], BadgeVariant> = {
  Text: 'neutral',
  Number: 'primary',
  Date: 'warning',
  Boolean: 'success',
  Select: 'purple',
};

interface CustomFieldsTabProps {
  fields: ClinicCustomFieldDefinition[];
  setFields: React.Dispatch<React.SetStateAction<ClinicCustomFieldDefinition[]>>;
  fieldsLoadError: string | null;
  showSkeletons: boolean;
  onRefreshFields: () => Promise<void>;
}

export default function CustomFieldsTab({
  fields,
  setFields,
  fieldsLoadError,
  showSkeletons,
  onRefreshFields,
}: CustomFieldsTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldDataType, setFieldDataType] = useState<ClinicCustomFieldDefinition['dataType']>('Text');
  const [fieldCategory, setFieldCategory] = useState('Demographics');
  const [fieldPlaceholder, setFieldPlaceholder] = useState('');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState('');
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const visibleFields =
    selectedCategory === 'All'
      ? fields
      : fields.filter((f) => f.category?.toLowerCase() === selectedCategory.toLowerCase());

  const handleOpenAdd = () => {
    setFieldLabel('');
    setFieldDataType('Text');
    setFieldCategory('Demographics');
    setFieldPlaceholder('');
    setFieldRequired(false);
    setFieldOptions('');
    setFieldError(null);
    setShowAddModal(true);
  };

  const handleCreateField = async () => {
    if (!fieldLabel.trim()) {
      setFieldError('Field label is required.');
      return;
    }

    setSavingField(true);
    setFieldError(null);

    const generatedKey = fieldLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    const [created, err] = await clinicService.createCustomField({
      entityType: 'ClinicPatient',
      fieldKey: generatedKey || `field_${Date.now()}`,
      label: fieldLabel.trim(),
      dataType: fieldDataType,
      category: fieldCategory,
      placeholder: fieldPlaceholder.trim() || undefined,
      isRequired: fieldRequired,
      displayOrder: fields.length + 1,
      optionsJson:
        fieldDataType === 'Select'
          ? JSON.stringify(
              fieldOptions
                .split(',')
                .map((o) => o.trim())
                .filter(Boolean)
            )
          : undefined,
    });

    setSavingField(false);

    if (err || !created) {
      setFieldError(err?.message || 'Could not save the custom intake field.');
      return;
    }

    setFields((prev) => [...prev, created]);
    setShowAddModal(false);
    notify.success(`Custom field "${created.label}" added.`);
  };

  const handleDeleteField = async (id: string) => {
    const [_, err] = await clinicService.deleteCustomField(id);
    if (err) {
      notify.error(err.message || 'Could not delete custom field.');
      return;
    }
    setFields((prev) => prev.filter((f) => f.id !== id));
    notify.success('Custom field deleted.');
  };

  return (
    <View style={styles.container}>
      <Card>
        <CardHeader
          title="Patient Intake & Custom Fields"
          subtitle="Custom clinical and demographic questions asked during patient registration"
          rightAction={
            <Button title="Add intake field" icon="plus" onPress={handleOpenAdd} />
          }
        />
        <CardContent>
          <View style={styles.chipRow}>
            {(['All', 'Demographics', 'MedicalHistory', 'Insurance', 'Clinical'] as const).map((cat) => {
              const count =
                cat === 'All'
                  ? fields.length
                  : fields.filter((f) => f.category?.toLowerCase() === cat.toLowerCase()).length;
              return (
                <Chip
                  key={cat}
                  label={`${cat} (${count})`}
                  active={selectedCategory === cat}
                  onPress={() => setSelectedCategory(cat)}
                />
              );
            })}
          </View>

          {showSkeletons ? (
            <SkeletonList rows={3} />
          ) : fieldsLoadError ? (
            <ErrorState compact title="Could not load custom fields" message={fieldsLoadError} onRetry={onRefreshFields} />
          ) : visibleFields.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No custom fields defined"
              description="Add custom intake questions to collect specific details from patients during registration."
              actionTitle="Add first field"
              onAction={handleOpenAdd}
            />
          ) : (
            <View style={styles.fieldList}>
              {visibleFields.map((field) => {
                let options: string[] = [];
                if (field.optionsJson) {
                  try {
                    options = JSON.parse(field.optionsJson);
                  } catch {
                    options = [];
                  }
                }

                return (
                  <View key={field.id} style={styles.fieldItem}>
                    <View style={styles.fieldInfoCol}>
                      <View style={styles.fieldTitleRow}>
                        <ThemedText variant="bodyBold">{field.label}</ThemedText>
                        <Badge label={field.dataType} variant={FIELD_TYPE_BADGE[field.dataType] || 'neutral'} size="sm" />
                        <Badge
                          label={field.isRequired ? 'Required' : 'Optional'}
                          variant={field.isRequired ? 'emergency' : 'neutral'}
                          size="sm"
                        />
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Key: {field.fieldKey} · Category: {field.category || 'General'}
                        {field.placeholder ? ` · Hint: "${field.placeholder}"` : ''}
                      </ThemedText>
                      {options.length > 0 && (
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          Options: {options.join(', ')}
                        </ThemedText>
                      )}
                    </View>

                    <Button
                      title="Delete"
                      variant="ghost"
                      size="sm"
                      onPress={() => handleDeleteField(field.id)}
                    />
                  </View>
                );
              })}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Add Custom Field Modal */}
      <Modal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add patient intake field"
        subtitle="Specify question prompt and data format for patient registration."
        maxWidth={500}
        footer={
          <View style={styles.modalFooter}>
            <Button title="Cancel" variant="ghost" onPress={() => setShowAddModal(false)} disabled={savingField} />
            <Button title="Save field" onPress={handleCreateField} loading={savingField} />
          </View>
        }
      >
        {fieldError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {fieldError}
            </ThemedText>
          </View>
        ) : null}

        <Input
          label="Field display label"
          required
          value={fieldLabel}
          onChangeText={setFieldLabel}
          placeholder="e.g. Religion, Employer Name, Mother's Maiden Name"
        />

        <FieldGroup label="Field Type">
          <View style={styles.chipRow}>
            {(['Text', 'Number', 'Date', 'Boolean', 'Select'] as const).map((type) => (
              <Chip
                key={type}
                label={type}
                active={fieldDataType === type}
                onPress={() => setFieldDataType(type)}
              />
            ))}
          </View>
        </FieldGroup>

        <FieldGroup label="Category">
          <View style={styles.chipRow}>
            {['Demographics', 'MedicalHistory', 'Insurance', 'Clinical'].map((cat) => (
              <Chip
                key={cat}
                label={cat}
                active={fieldCategory === cat}
                onPress={() => setFieldCategory(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        <Input
          label="Placeholder hint (optional)"
          value={fieldPlaceholder}
          onChangeText={setFieldPlaceholder}
          placeholder="e.g. Enter employer address"
        />

        {fieldDataType === 'Select' && (
          <Input
            label="Dropdown choices (comma separated)"
            value={fieldOptions}
            onChangeText={setFieldOptions}
            placeholder="e.g. Roman Catholic, Christian, Muslim, Others"
          />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  fieldList: {
    gap: theme.spacing.sm,
  },
  fieldItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
    gap: theme.spacing.md,
  },
  fieldInfoCol: {
    flex: 1,
    minWidth: 240,
    gap: 4,
  },
  fieldTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
  },
  flex1: {
    flex: 1,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
    marginBottom: theme.spacing.md,
  },
});
