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
import { getDeviceItem, setDeviceItem } from '../../utils/deviceStorage';
import {
  clinicService,
  ClinicCustomFieldDefinition,
  VisibilityRule,
  ConditionalOptionsConfig,
} from '../../services/clinicService';
import { Chip } from './common';
import AddEditFieldModal from './AddEditFieldModal';
import SortableCustomFieldsList, { ReorderControlsMode } from './SortableCustomFieldsList';

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
  const [reorderMode, setReorderMode] = useState<ReorderControlsMode>(() => {
    const saved = getDeviceItem('clinicez_intake_reorder_mode');
    if (saved === 'both' || saved === 'dnd' || saved === 'arrows') {
      return saved;
    }
    return 'both';
  });

  const handleSetReorderMode = (mode: ReorderControlsMode) => {
    setReorderMode(mode);
    setDeviceItem('clinicez_intake_reorder_mode', mode);
  };

  // Sorted fields by displayOrder
  const sortedFields = [...fields].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const canDrag = selectedCategory === 'All';

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

  const handleReorderEnd = async (newOrderedIds: string[]) => {
    if (isReordering) return;
    setIsReordering(true);
    const previousFields = fields.map((f) => ({ ...f }));

    // Optimistically reorder in memory with 1-based displayOrder
    const fieldMap = new Map(sortedFields.map((f) => [f.id, f]));
    const reordered: ClinicCustomFieldDefinition[] = [];
    newOrderedIds.forEach((id, idx) => {
      const field = fieldMap.get(id);
      if (field) {
        reordered.push({ ...field, displayOrder: idx + 1 });
      }
    });
    // Append any unmentioned fields
    sortedFields.forEach((f) => {
      if (!newOrderedIds.includes(f.id)) {
        reordered.push({ ...f, displayOrder: reordered.length + 1 });
      }
    });

    setFields(reordered);

    try {
      const fullOrderedIds = reordered.map((f) => f.id);
      const [_, err] = await clinicService.reorderCustomFields(fullOrderedIds);
      if (err) {
        notify.error(err.message || 'Could not persist reordered sequence.');
        setFields(previousFields);
        await onRefreshFields();
      } else {
        notify.success('Intake fields sequence updated.');
      }
    } catch (error: any) {
      notify.error(error?.message || 'Could not persist reordered sequence.');
      setFields(previousFields);
      await onRefreshFields();
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveUp = async (fieldId: string) => {
    if (isReordering) return;
    const globalIndex = sortedFields.findIndex((f) => f.id === fieldId);
    if (globalIndex <= 0) return;
    const current = sortedFields[globalIndex];
    const prev = sortedFields[globalIndex - 1];

    setIsReordering(true);
    const previousFields = fields.map((f) => ({ ...f }));
    try {
      const newFields = [...sortedFields];
      newFields[globalIndex - 1] = current;
      newFields[globalIndex] = prev;
      const reorderedFields = newFields.map((f, i) => ({
        ...f,
        displayOrder: i + 1,
      }));

      setFields(reorderedFields);
      notify.success(`Moved "${current.label}" up.`);

      // Persist reorder to backend
      const orderedIds = reorderedFields.map((f) => f.id);
      const [_, err] = await clinicService.reorderCustomFields(orderedIds);
      if (err) {
        notify.error(err.message || 'Could not persist reordered sequence.');
        setFields(previousFields);
        await onRefreshFields();
      }
    } catch (error: any) {
      notify.error(error?.message || 'Could not persist reordered sequence.');
      setFields(previousFields);
      await onRefreshFields();
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
    const previousFields = fields.map((f) => ({ ...f }));
    try {
      const newFields = [...sortedFields];
      newFields[globalIndex] = next;
      newFields[globalIndex + 1] = current;
      const reorderedFields = newFields.map((f, i) => ({
        ...f,
        displayOrder: i + 1,
      }));

      setFields(reorderedFields);
      notify.success(`Moved "${current.label}" down.`);

      // Persist reorder to backend
      const orderedIds = reorderedFields.map((f) => f.id);
      const [_, err] = await clinicService.reorderCustomFields(orderedIds);
      if (err) {
        notify.error(err.message || 'Could not persist reordered sequence.');
        setFields(previousFields);
        await onRefreshFields();
      }
    } catch (error: any) {
      notify.error(error?.message || 'Could not persist reordered sequence.');
      setFields(previousFields);
      await onRefreshFields();
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

          {/* Reorder Mode Selector Toolbar */}
          <View style={styles.reorderControlsToolbar}>
            <View style={styles.reorderModeLabelRow}>
              <Icon name="gripVertical" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                Reorder controls:
              </ThemedText>
            </View>
            <View style={styles.modeSegmentGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show both drag handle and subtle arrows"
                accessibilityState={{ selected: reorderMode === 'both' }}
                style={[styles.modeSegmentBtn, reorderMode === 'both' && styles.modeSegmentBtnActive]}
                onPress={() => handleSetReorderMode('both')}
              >
                <ThemedText
                  variant="captionBold"
                  color={reorderMode === 'both' ? theme.colors.onPrimary : theme.colors.textSecondary}
                >
                  Both
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show drag and drop handle only"
                accessibilityState={{ selected: reorderMode === 'dnd' }}
                style={[styles.modeSegmentBtn, reorderMode === 'dnd' && styles.modeSegmentBtnActive]}
                onPress={() => handleSetReorderMode('dnd')}
              >
                <ThemedText
                  variant="captionBold"
                  color={reorderMode === 'dnd' ? theme.colors.onPrimary : theme.colors.textSecondary}
                >
                  Drag & Drop
                </ThemedText>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Show subtle arrow buttons only"
                accessibilityState={{ selected: reorderMode === 'arrows' }}
                style={[styles.modeSegmentBtn, reorderMode === 'arrows' && styles.modeSegmentBtnActive]}
                onPress={() => handleSetReorderMode('arrows')}
              >
                <ThemedText
                  variant="captionBold"
                  color={reorderMode === 'arrows' ? theme.colors.onPrimary : theme.colors.textSecondary}
                >
                  Arrows only
                </ThemedText>
              </Pressable>
            </View>
          </View>

          {/* Category Filter Guidance Banner */}
          {selectedCategory !== 'All' && reorderMode !== 'arrows' && (
            <View style={styles.filteredCategoryBanner}>
              <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.info} />
              <ThemedText variant="caption" color={theme.colors.infoText} style={styles.flex1}>
                {reorderMode === 'dnd'
                  ? `Filtered by category "${selectedCategory}". Switch to "All" to drag and drop across all intake fields.`
                  : `Filtered by category "${selectedCategory}". Switch to "All" to drag and drop across all intake fields, or use the subtle Up/Down arrows.`}
              </ThemedText>
            </View>
          )}

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
            <SortableCustomFieldsList
              fields={visibleFields}
              sortedFields={sortedFields}
              isReordering={isReordering}
              canDrag={canDrag}
              reorderMode={reorderMode}
              onReorderEnd={handleReorderEnd}
              onMoveUp={handleMoveUp}
              onMoveDown={handleMoveDown}
              renderFieldContent={(field) => {
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

                return (
                  <>
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
                  </>
                );
              }}
            />
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
  reorderControlsToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    marginBottom: theme.spacing.md,
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  reorderModeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  modeSegmentGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    padding: 2,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
  },
  modeSegmentBtn: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.xs,
  },
  modeSegmentBtnActive: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  filteredCategoryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.infoBg,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    marginBottom: theme.spacing.md,
  },
  flex1: {
    flex: 1,
  },
  fieldInfoCol: {
    flex: 1,
    minWidth: 240,
    gap: theme.spacing.xs,
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
