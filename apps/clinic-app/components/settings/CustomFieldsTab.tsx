import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge, { BadgeVariant } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import ErrorState from '../ui/ErrorState';
import { SkeletonList } from '../ui/Skeleton';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import {
  clinicService,
  ClinicCustomFieldDefinition,
  VisibilityRule,
  ConditionalOptionsConfig,
} from '../../services/clinicService';
import { Chip } from './common';
import AddEditFieldModal from './AddEditFieldModal';

const FIELD_TYPE_BADGE: Record<ClinicCustomFieldDefinition['dataType'], BadgeVariant> = {
  Text: 'neutral',
  Number: 'primary',
  Date: 'warning',
  Boolean: 'success',
  Select: 'purple',
};

export interface TemplateBundlePreset {
  key: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: 'graduation' | 'briefcase' | 'patients';
}

const TEMPLATE_BUNDLES: TemplateBundlePreset[] = [
  {
    key: 'university',
    title: 'University / School Clinic',
    subtitle: '8 Fields · Affiliation, Student/Employee IDs, cascading College & Program dropdowns',
    badge: '8 Fields · Cascading',
    icon: 'graduation',
  },
  {
    key: 'workplace',
    title: 'Workplace / Corporate Health',
    subtitle: '4 Fields · Employment Type, Department, Corporate Employee ID, HMO Provider',
    badge: '4 Fields · Corporate',
    icon: 'briefcase',
  },
  {
    key: 'demographics',
    title: 'General Clinical Demographics',
    subtitle: '3 Fields · Religion, Mother’s Maiden Name, conditional Spouse Name',
    badge: '3 Fields · Conditional',
    icon: 'patients',
  },
];

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
  const [showModal, setShowModal] = useState(false);
  const [editingField, setEditingField] = useState<ClinicCustomFieldDefinition | null>(null);
  const [showTemplatesSection, setShowTemplatesSection] = useState(false);
  const [installingBundle, setInstallingBundle] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);

  // Sorted fields by displayOrder
  const sortedFields = [...fields].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  const visibleFields =
    selectedCategory === 'All'
      ? sortedFields
      : sortedFields.filter((f) => f.category?.toLowerCase() === selectedCategory.toLowerCase());

  const handleOpenAdd = () => {
    setEditingField(null);
    setShowModal(true);
  };

  const handleOpenEdit = (field: ClinicCustomFieldDefinition) => {
    setEditingField(field);
    setShowModal(true);
  };

  const handleSaveField = async (payload: Partial<ClinicCustomFieldDefinition>): Promise<boolean> => {
    if (editingField) {
      // Update existing
      const [updated, err] = await clinicService.updateCustomField(editingField.id, payload);
      if (err || !updated) {
        notify.error(err?.message || 'Could not update custom field.');
        return false;
      }
      setFields((prev) =>
        prev.map((f) => (f.id === editingField.id ? { ...f, ...updated } : f))
      );
      notify.success(`Custom field "${updated.label}" updated.`);
      return true;
    } else {
      // Create new
      const nextDisplayOrder =
        fields.length > 0
          ? Math.max(...fields.map((f) => f.displayOrder ?? 0)) + 1
          : 1;

      const [created, err] = await clinicService.createCustomField({
        entityType: 'ClinicPatient',
        displayOrder: nextDisplayOrder,
        ...payload,
      });

      if (err || !created) {
        notify.error(err?.message || 'Could not create custom field.');
        return false;
      }

      setFields((prev) => [...prev, created]);
      notify.success(`Custom field "${created.label}" added.`);
      return true;
    }
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

  const handleMoveUp = async (fieldId: string) => {
    if (isReordering) return;
    const globalIndex = sortedFields.findIndex((f) => f.id === fieldId);
    if (globalIndex <= 0) return;
    const current = sortedFields[globalIndex];
    const prev = sortedFields[globalIndex - 1];

    setIsReordering(true);
    try {
      const newFields = [...sortedFields];
      newFields[globalIndex - 1] = current;
      newFields[globalIndex] = prev;
      newFields.forEach((f, i) => {
        f.displayOrder = i + 1;
      });

      setFields(newFields);
      notify.success(`Moved "${current.label}" up.`);

      // Persist reorder to backend
      const orderedIds = newFields.map((f) => f.id);
      const [_, err] = await clinicService.reorderCustomFields(orderedIds);
      if (err) {
        notify.error(err.message || 'Could not persist reordered sequence.');
        await onRefreshFields();
      }
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveDown = async (fieldId: string) => {
    if (isReordering) return;
    const globalIndex = sortedFields.findIndex((f) => f.id === fieldId);
    if (globalIndex < 0 || globalIndex >= sortedFields.length - 1) return;
    const current = sortedFields[globalIndex];
    const next = sortedFields[globalIndex + 1];

    setIsReordering(true);
    try {
      const newFields = [...sortedFields];
      newFields[globalIndex] = next;
      newFields[globalIndex + 1] = current;
      newFields.forEach((f, i) => {
        f.displayOrder = i + 1;
      });

      setFields(newFields);
      notify.success(`Moved "${current.label}" down.`);

      // Persist reorder to backend
      const orderedIds = newFields.map((f) => f.id);
      const [_, err] = await clinicService.reorderCustomFields(orderedIds);
      if (err) {
        notify.error(err.message || 'Could not persist reordered sequence.');
        await onRefreshFields();
      }
    } finally {
      setIsReordering(false);
    }
  };

  const handleInstallBundle = async (templateKey: string) => {
    setInstallingBundle(templateKey);
    const [installed, err] = await clinicService.installTemplateBundle(templateKey);
    setInstallingBundle(null);

    if (err || !installed) {
      notify.error(err?.message || `Could not install template bundle ${templateKey}.`);
      return;
    }

    setFields(installed);
    notify.success(`Installed template bundle: ${templateKey.toUpperCase()}.`);
    await onRefreshFields();
  };

  return (
    <View style={styles.container}>
      {/* Suggested Common Templates Library Toolbar Card */}
      <Card>
        <CardHeader
          title="Intake Template Library"
          subtitle="Adopt standard clinic setups with 1-click installable bundles"
          rightAction={
            <Button
              title={showTemplatesSection ? 'Hide Templates' : 'Browse Templates'}
              variant="outline"
              size="sm"
              icon="scroll"
              onPress={() => setShowTemplatesSection((prev) => !prev)}
            />
          }
        />
        {showTemplatesSection && (
          <CardContent>
            <View style={styles.templatesGrid}>
              {TEMPLATE_BUNDLES.map((bundle) => {
                const isInstalling = installingBundle === bundle.key;
                return (
                  <View key={bundle.key} style={styles.templateCard}>
                    <View style={styles.templateHeaderRow}>
                      <View style={styles.rowAlign}>
                        <Icon name={bundle.icon} size={theme.sizes.iconMd} color={theme.colors.primary} />
                        <ThemedText variant="bodyBold">{bundle.title}</ThemedText>
                      </View>
                      <Badge label={bundle.badge} variant="purple" size="sm" />
                    </View>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      {bundle.subtitle}
                    </ThemedText>
                    <Button
                      title={isInstalling ? 'Installing...' : '1-Click Install'}
                      variant="primary"
                      size="sm"
                      loading={isInstalling}
                      onPress={() => handleInstallBundle(bundle.key)}
                    />
                  </View>
                );
              })}
            </View>
          </CardContent>
        )}
      </Card>

      {/* Patient Intake Custom Fields Card */}
      <Card>
        <CardHeader
          title="Patient Intake & Custom Fields"
          subtitle="Configure questions, arrange display sequence, and mark required fields"
          rightAction={
            <Button title="Add intake field" icon="plus" onPress={handleOpenAdd} />
          }
        />
        <CardContent>
          {/* Category Filter Chips */}
          <View style={styles.chipRow}>
            {(
              [
                'All',
                'Demographics',
                'Academic',
                'Employment',
                'Clinical',
                'Insurance',
                'MedicalHistory',
              ] as const
            ).map((cat) => {
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

          {/* 4 Core UX States */}
          {showSkeletons ? (
            <SkeletonList rows={4} />
          ) : fieldsLoadError ? (
            <ErrorState
              compact
              title="Could not load custom fields"
              message={fieldsLoadError}
              onRetry={onRefreshFields}
            />
          ) : visibleFields.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No custom fields defined"
              description="Add custom intake questions or install a 1-click template bundle."
              actionTitle="Browse Templates"
              onAction={() => setShowTemplatesSection(true)}
            />
          ) : (
            <View style={styles.fieldList}>
              {visibleFields.map((field, index) => {
                // Parse options
                let options: string[] = [];
                if (field.optionsJson) {
                  try {
                    options = JSON.parse(field.optionsJson);
                  } catch {
                    options = [];
                  }
                }

                // Parse visibility rule safely
                let visibilityRule: VisibilityRule | null = null;
                if (field.visibilityRuleJson) {
                  try {
                    visibilityRule = JSON.parse(field.visibilityRuleJson);
                  } catch {
                    visibilityRule = null;
                  }
                }

                // Parse cascading options safely
                let conditionalOptions: ConditionalOptionsConfig | null = null;
                if (field.conditionalOptionsJson) {
                  try {
                    conditionalOptions = JSON.parse(field.conditionalOptionsJson);
                  } catch {
                    conditionalOptions = null;
                  }
                }

                const globalIndex = sortedFields.findIndex((f) => f.id === field.id);
                const isFirst = globalIndex <= 0;
                const isLast = globalIndex >= sortedFields.length - 1;

                return (
                  <View key={field.id} style={styles.fieldItem}>
                    {/* Sequence and Reordering Arrangement Controls */}
                    <View style={styles.reorderControlsCol}>
                      <ThemedText variant="captionBold" color={theme.colors.textMuted} style={styles.sequenceIndexText}>
                        #{globalIndex >= 0 ? globalIndex + 1 : index + 1}
                      </ThemedText>
                      <View style={styles.reorderButtonPair}>
                        <Pressable
                          onPress={() => handleMoveUp(field.id)}
                          disabled={isFirst || isReordering}
                          accessibilityRole="button"
                          accessibilityLabel={`Move "${field.label}" up`}
                          style={[
                            styles.reorderButton,
                            (isFirst || isReordering) && styles.reorderButtonDisabled,
                          ]}
                        >
                          <Icon
                            name="arrowUp"
                            size={theme.sizes.iconSm}
                            color={isFirst || isReordering ? theme.colors.textLight : theme.colors.primary}
                          />
                        </Pressable>
                        <Pressable
                          onPress={() => handleMoveDown(field.id)}
                          disabled={isLast || isReordering}
                          accessibilityRole="button"
                          accessibilityLabel={`Move "${field.label}" down`}
                          style={[
                            styles.reorderButton,
                            (isLast || isReordering) && styles.reorderButtonDisabled,
                          ]}
                        >
                          <Icon
                            name="arrowDown"
                            size={theme.sizes.iconSm}
                            color={isLast || isReordering ? theme.colors.textLight : theme.colors.primary}
                          />
                        </Pressable>
                      </View>
                    </View>

                    {/* Field Info & Semantic Badges */}
                    <View style={styles.fieldInfoCol}>
                      <View style={styles.fieldTitleRow}>
                        <ThemedText variant="bodyBold">{field.label}</ThemedText>
                        <Badge
                          label={field.dataType}
                          variant={FIELD_TYPE_BADGE[field.dataType] || 'neutral'}
                          size="sm"
                        />
                        <Badge
                          label={field.isRequired ? 'Required' : 'Optional'}
                          variant={field.isRequired ? 'emergency' : 'neutral'}
                          size="sm"
                        />
                        {visibilityRule ? (
                          <Badge
                            label={
                              visibilityRule.operator === 'not_empty'
                                ? `If ${visibilityRule.field} is not empty`
                                : `If ${visibilityRule.field} ${
                                    visibilityRule.operator === 'equals'
                                      ? '=='
                                      : visibilityRule.operator === 'not_equals'
                                      ? '!='
                                      : visibilityRule.operator
                                  } '${
                                    Array.isArray(visibilityRule.value)
                                      ? visibilityRule.value.join(', ')
                                      : visibilityRule.value ?? ''
                                  }'`
                            }
                            variant="warning"
                            size="sm"
                          />
                        ) : null}
                        {conditionalOptions ? (
                          <Badge
                            label={`Cascades on ${conditionalOptions.parentField}`}
                            variant="purple"
                            size="sm"
                          />
                        ) : null}
                      </View>

                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        Key: {field.fieldKey} · Category: {field.category || 'General'}
                        {field.placeholder ? ` · Hint: "${field.placeholder}"` : ''}
                      </ThemedText>

                      {options.length > 0 && (
                        <ThemedText variant="caption" color={theme.colors.textSecondary}>
                          Choices: {options.join(', ')}
                        </ThemedText>
                      )}
                    </View>

                    {/* Actions: Edit & Delete */}
                    <View style={styles.actionButtonGroup}>
                      <Button
                        title="Edit"
                        variant="outline"
                        size="sm"
                        icon="edit"
                        onPress={() => handleOpenEdit(field)}
                      />
                      <Button
                        title="Delete"
                        variant="ghost"
                        size="sm"
                        icon="trash"
                        onPress={() => handleDeleteField(field.id)}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </CardContent>
      </Card>

      {/* Add & Edit Modal */}
      <AddEditFieldModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        fieldToEdit={editingField}
        existingFields={fields}
        onSave={handleSaveField}
      />
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
  templatesGrid: {
    gap: theme.spacing.md,
  },
  templateCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
    gap: theme.spacing.sm,
  },
  templateHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
  reorderControlsCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
    minWidth: 48,
  },
  sequenceIndexText: {
    textAlign: 'center',
  },
  reorderButtonPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reorderButton: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  reorderButtonDisabled: {
    opacity: 0.35,
    borderColor: theme.colors.borderLight,
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
  actionButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
});
