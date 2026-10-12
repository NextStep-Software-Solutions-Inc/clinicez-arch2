import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import {
  ClinicCustomFieldDefinition,
  VisibilityRule,
  ConditionalOptionsConfig,
} from '../../services/clinicService';
import { Chip, FieldGroup } from './common';

export interface ToggleSwitchProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  accessibilityLabel?: string;
}

export function ToggleSwitch({
  value,
  onValueChange,
  accessibilityLabel,
}: ToggleSwitchProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={accessibilityLabel}
      style={styles.switchTouchTarget}
    >
      <View
        style={[
          styles.switchTrack,
          value ? styles.switchTrackActive : styles.switchTrackInactive,
        ]}
      >
        <View
          style={[
            styles.switchThumb,
            value ? styles.switchThumbActive : styles.switchThumbInactive,
          ]}
        />
      </View>
    </Pressable>
  );
}

export interface AddEditFieldModalProps {
  visible: boolean;
  onClose: () => void;
  fieldToEdit?: ClinicCustomFieldDefinition | null;
  existingFields: ClinicCustomFieldDefinition[];
  onSave: (fieldData: Partial<ClinicCustomFieldDefinition>) => Promise<boolean>;
}

const STATIC_FIELD_OPTIONS = [
  { key: 'gender', label: 'Gender / Biological Sex' },
  { key: 'civilStatus', label: 'Civil Status (Single, Married, etc.)' },
  { key: 'affiliation', label: 'Institutional Affiliation' },
  { key: 'age', label: 'Patient Age' },
];

const OPERATORS = [
  { key: 'equals', label: 'Equals (==)' },
  { key: 'not_equals', label: 'Not Equals (!=)' },
  { key: 'in', label: 'In List (comma separated)' },
  { key: 'contains', label: 'Contains Substring' },
  { key: 'not_empty', label: 'Has Any Value (Not Empty)' },
] as const;

export default function AddEditFieldModal({
  visible,
  onClose,
  fieldToEdit,
  existingFields,
  onSave,
}: AddEditFieldModalProps) {
  const isEditing = Boolean(fieldToEdit);

  // Core metadata state
  const [label, setLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [dataType, setDataType] = useState<ClinicCustomFieldDefinition['dataType']>('Text');
  const [category, setCategory] = useState('Demographics');
  const [placeholder, setPlaceholder] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState('');

  // Live Rule Builder state
  const [hasVisibilityRule, setHasVisibilityRule] = useState(false);
  const [ruleSource, setRuleSource] = useState<'custom_field' | 'static'>('custom_field');
  const [ruleField, setRuleField] = useState('');
  const [ruleOperator, setRuleOperator] = useState<VisibilityRule['operator']>('equals');
  const [ruleValue, setRuleValue] = useState('');

  // Cascading Dropdown Options Mapper state
  const [isCascading, setIsCascading] = useState(false);
  const [parentField, setParentField] = useState('');
  const [mappingEntries, setMappingEntries] = useState<
    Array<{ id: string; parentVal: string; childOptions: string }>
  >([]);
  const [defaultOptions, setDefaultOptions] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when fieldToEdit changes or modal opens
  useEffect(() => {
    if (!visible) return;

    if (fieldToEdit) {
      setLabel(fieldToEdit.label || '');
      setFieldKey(fieldToEdit.fieldKey || '');
      setDataType(fieldToEdit.dataType || 'Text');
      setCategory(fieldToEdit.category || 'Demographics');
      setPlaceholder(fieldToEdit.placeholder || '');
      setIsRequired(Boolean(fieldToEdit.isRequired));

      // Parse flat options
      if (fieldToEdit.optionsJson) {
        try {
          const opts = JSON.parse(fieldToEdit.optionsJson);
          setOptions(Array.isArray(opts) ? opts.join(', ') : '');
        } catch {
          setOptions('');
        }
      } else {
        setOptions('');
      }

      // Parse visibility rule
      if (fieldToEdit.visibilityRuleJson) {
        try {
          const rule = JSON.parse(fieldToEdit.visibilityRuleJson);
          setHasVisibilityRule(true);
          setRuleSource(rule.source || 'custom_field');
          setRuleField(rule.field || rule.parentFieldKey || '');
          setRuleOperator(rule.operator || 'equals');
          if (Array.isArray(rule.value)) {
            setRuleValue(rule.value.join(', '));
          } else {
            setRuleValue(rule.value !== undefined ? String(rule.value) : (rule.expectedValue !== undefined ? String(rule.expectedValue) : ''));
          }
        } catch {
          setHasVisibilityRule(false);
          setRuleSource('custom_field');
          setRuleField('');
          setRuleOperator('equals');
          setRuleValue('');
        }
      } else {
        setHasVisibilityRule(false);
        setRuleSource('custom_field');
        setRuleField('');
        setRuleOperator('equals');
        setRuleValue('');
      }

      // Parse cascading options
      if (fieldToEdit.conditionalOptionsJson) {
        try {
          const cond = JSON.parse(fieldToEdit.conditionalOptionsJson);
          setIsCascading(true);
          setParentField(cond.parentField || cond.parentFieldKey || '');
          const entries: Array<{ id: string; parentVal: string; childOptions: string }> = [];
          const mapping = cond.mapping || cond.optionsMap || {};
          let entryIdx = 1;
          for (const [k, v] of Object.entries(mapping)) {
            entries.push({
              id: `entry-${entryIdx++}`,
              parentVal: k,
              childOptions: Array.isArray(v) ? v.join(', ') : String(v),
            });
          }
          setMappingEntries(entries);
          setDefaultOptions(
            Array.isArray(cond.defaultOptions) ? cond.defaultOptions.join(', ') : ''
          );
        } catch {
          setIsCascading(false);
          setParentField('');
          setMappingEntries([]);
          setDefaultOptions('');
        }
      } else {
        setIsCascading(false);
        setParentField('');
        setMappingEntries([]);
        setDefaultOptions('');
      }
    } else {
      // Create mode defaults
      setLabel('');
      setFieldKey('');
      setDataType('Text');
      setCategory('Demographics');
      setPlaceholder('');
      setIsRequired(false);
      setOptions('');
      setHasVisibilityRule(false);
      setRuleSource('custom_field');
      setRuleField('');
      setRuleOperator('equals');
      setRuleValue('');
      setIsCascading(false);
      setParentField('');
      setMappingEntries([]);
      setDefaultOptions('');
    }
    setError(null);
    setSaving(false);
  }, [visible, fieldToEdit]);

  // Handle label change and auto-generate key in Create mode
  const handleLabelChange = (text: string) => {
    setLabel(text);
    if (!isEditing && !fieldKey) {
      const generated = text
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      setFieldKey(generated);
    }
  };

  const handleAddMappingEntry = () => {
    setMappingEntries((prev) => [
      ...prev,
      { id: `entry-${Date.now()}`, parentVal: '', childOptions: '' },
    ]);
  };

  const handleRemoveMappingEntry = (id: string) => {
    setMappingEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const handleUpdateMappingEntry = (
    id: string,
    key: 'parentVal' | 'childOptions',
    val: string
  ) => {
    setMappingEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [key]: val } : e))
    );
  };

  const handleSave = async () => {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setError('Field label is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const generatedKey =
      fieldKey.trim() ||
      trimmedLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

    // 1. Flat options serialization
    let optionsJson: string | undefined = undefined;
    if (dataType === 'Select' && options.trim()) {
      const parsed = options
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parsed.length > 0) {
        optionsJson = JSON.stringify(parsed);
      }
    }

    // 2. Visibility rule serialization
    let visibilityRuleJson: string | undefined = undefined;
    if (hasVisibilityRule) {
      if (!ruleField.trim()) {
        const errorMsg = 'Please select a trigger field for the conditional visibility rule, or turn the toggle off.';
        setError(errorMsg);
        Alert.alert('Validation Error', errorMsg);
        setSaving(false);
        return;
      }

      let val: any = ruleValue.trim();
      if (ruleOperator === 'in') {
        val = ruleValue
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (ruleOperator === 'not_empty') {
        val = undefined;
      }

      const ruleObj: VisibilityRule = {
        source: ruleSource,
        field: ruleField.trim(),
        operator: ruleOperator,
        ...(val !== undefined ? { value: val } : {}),
      };
      visibilityRuleJson = JSON.stringify(ruleObj);
    }

    // 3. Cascading options serialization
    let conditionalOptionsJson: string | undefined = undefined;
    if (dataType === 'Select' && isCascading) {
      if (!parentField.trim()) {
        setError('Please select a parent dropdown field for cascading choices, or turn the toggle off.');
        setSaving(false);
        return;
      }

      const mapObj: Record<string, string[]> = {};
      for (const entry of mappingEntries) {
        if (entry.parentVal.trim()) {
          mapObj[entry.parentVal.trim()] = entry.childOptions
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      const defOpts = defaultOptions
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const condObj: ConditionalOptionsConfig = {
        parentField: parentField.trim(),
        mapping: mapObj,
        defaultOptions: defOpts,
      };
      conditionalOptionsJson = JSON.stringify(condObj);
    }

    const payload: Partial<ClinicCustomFieldDefinition> = {
      label: trimmedLabel,
      fieldKey: generatedKey || `field_${Date.now()}`,
      dataType,
      category,
      placeholder: placeholder.trim() || undefined,
      isRequired,
      optionsJson,
      visibilityRuleJson,
      conditionalOptionsJson,
    };

    const success = await onSave(payload);
    setSaving(false);
    if (success) {
      onClose();
    }
  };

  // Preceding fields candidate list for visibility/cascading
  const candidateParentFields = existingFields.filter(
    (f) => !fieldToEdit || f.id !== fieldToEdit.id
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit patient intake field' : 'Add patient intake field'}
      subtitle={
        isEditing
          ? 'Modify field rules, mandatory constraints, or cascading choices.'
          : 'Define custom intake prompt, data validation, and visibility rules.'
      }
      maxWidth={580}
      footer={
        <View style={styles.modalFooter}>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            disabled={saving}
          />
          <Button
            title={isEditing ? 'Update field' : 'Save field'}
            onPress={handleSave}
            loading={saving}
          />
        </View>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {error ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {error}
            </ThemedText>
          </View>
        ) : null}

        {/* Display Label */}
        <Input
          label="Field display label"
          required
          value={label}
          onChangeText={handleLabelChange}
          placeholder="e.g. Student ID, College, Religion, Spouse Full Name"
        />

        {/* Machine Key */}
        <Input
          label="Machine Key (System Identifier)"
          value={fieldKey}
          onChangeText={setFieldKey}
          placeholder="e.g. student_id, college, spouse_name"
        />

        {/* Data Type */}
        <FieldGroup label="Data Format / Field Type">
          <View style={styles.chipRow}>
            {(['Text', 'Number', 'Date', 'Boolean', 'Select'] as const).map((type) => (
              <Chip
                key={type}
                label={type}
                active={dataType === type}
                onPress={() => setDataType(type)}
              />
            ))}
          </View>
        </FieldGroup>

        {/* Category */}
        <FieldGroup label="Category">
          <View style={styles.chipRow}>
            {['Demographics', 'Academic', 'Employment', 'Clinical', 'Insurance'].map((cat) => (
              <Chip
                key={cat}
                label={cat}
                active={category === cat}
                onPress={() => setCategory(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        {/* Mandatory / Required Toggle */}
        <View style={styles.toggleRowContainer}>
          <View style={styles.toggleTextCol}>
            <View style={styles.rowAlign}>
              <ThemedText variant="bodyBold">Mark field as mandatory / required</ThemedText>
              <Badge
                label={isRequired ? 'Required' : 'Optional'}
                variant={isRequired ? 'emergency' : 'neutral'}
                size="sm"
              />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Enforces validation during patient registration when visible on intake form.
            </ThemedText>
          </View>
          <ToggleSwitch
            value={isRequired}
            onValueChange={setIsRequired}
            accessibilityLabel="Mark field as mandatory / required"
          />
        </View>

        {/* Placeholder hint */}
        <Input
          label="Placeholder hint (optional)"
          value={placeholder}
          onChangeText={setPlaceholder}
          placeholder="e.g. Enter student registration number"
        />

        {/* Select Choices (Flat options when not cascading) */}
        {dataType === 'Select' && !isCascading && (
          <Input
            label="Dropdown choices (comma separated)"
            value={options}
            onChangeText={setOptions}
            placeholder="e.g. 1st Year, 2nd Year, 3rd Year, 4th Year"
          />
        )}

        {/* =========================================================================
            LIVE VISIBILITY RULE BUILDER
           ========================================================================= */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.rowAlign}>
              <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="bodyBold">Conditional Visibility Rule</ThemedText>
            </View>
            <ToggleSwitch
              value={hasVisibilityRule}
              onValueChange={setHasVisibilityRule}
              accessibilityLabel="Conditional Visibility Rule"
            />
          </View>

          {hasVisibilityRule && (
            <View style={styles.ruleBuilderBody}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Determine when this field appears on the intake form based on parent answers.
              </ThemedText>

              {/* Source Selector */}
              <FieldGroup label="Rule Source">
                <View style={styles.chipRow}>
                  <Chip
                    label="Custom Intake Field"
                    active={ruleSource === 'custom_field'}
                    onPress={() => setRuleSource('custom_field')}
                  />
                  <Chip
                    label="Static Patient Demographic"
                    active={ruleSource === 'static'}
                    onPress={() => setRuleSource('static')}
                  />
                </View>
              </FieldGroup>

              {/* Field Selector */}
              <FieldGroup label="Parent Trigger Field">
                {ruleSource === 'static' ? (
                  <View style={styles.chipRow}>
                    {STATIC_FIELD_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.key}
                        label={opt.label}
                        active={ruleField === opt.key}
                        onPress={() => setRuleField(opt.key)}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.chipRow}>
                    {candidateParentFields.length === 0 ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        No other custom fields created yet.
                      </ThemedText>
                    ) : (
                      candidateParentFields.map((f) => (
                        <Chip
                          key={f.fieldKey}
                          label={`${f.label} (${f.fieldKey})`}
                          active={ruleField === f.fieldKey}
                          onPress={() => setRuleField(f.fieldKey)}
                        />
                      ))
                    )}
                  </View>
                )}
              </FieldGroup>

              {/* Operator Selector */}
              <FieldGroup label="Comparison Operator">
                <View style={styles.chipRow}>
                  {OPERATORS.map((op) => (
                    <Chip
                      key={op.key}
                      label={op.label}
                      active={ruleOperator === op.key}
                      onPress={() => setRuleOperator(op.key as VisibilityRule['operator'])}
                    />
                  ))}
                </View>
              </FieldGroup>

              {/* Expected Value Input */}
              {ruleOperator !== 'not_empty' && (
                <Input
                  label="Expected Value to Trigger Visibility"
                  value={ruleValue}
                  onChangeText={setRuleValue}
                  placeholder={
                    ruleOperator === 'in'
                      ? 'e.g. 4th Year, 5th Year / Grad (comma separated)'
                      : 'e.g. Student, Married, Female'
                  }
                />
              )}

              {/* Live Preview Badge */}
              <View style={styles.previewBox}>
                <ThemedText variant="captionBold" color={theme.colors.warningText}>
                  LIVE RULE PREVIEW:
                </ThemedText>
                {ruleField ? (
                  <Badge
                    label={
                      ruleOperator === 'not_empty'
                        ? `If ${ruleField} is not empty`
                        : `Visible when [${ruleField}] ${ruleOperator} '${ruleValue || '...'}'`
                    }
                    variant="warning"
                    size="md"
                  />
                ) : (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Select a trigger field above to preview live rule.
                  </ThemedText>
                )}
              </View>
            </View>
          )}
        </View>

        {/* =========================================================================
            CASCADING DROPDOWN OPTIONS MAPPER (FOR SELECT FIELDS)
           ========================================================================= */}
        {dataType === 'Select' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.rowAlign}>
                <Icon name="tag" size={theme.sizes.iconSm} color={theme.colors.purple} />
                <ThemedText variant="bodyBold">Cascading / Dependent Dropdown Choices</ThemedText>
              </View>
              <ToggleSwitch
                value={isCascading}
                onValueChange={setIsCascading}
                accessibilityLabel="Cascading / Dependent Dropdown Choices"
              />
            </View>

            {isCascading && (
              <View style={styles.ruleBuilderBody}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Available choices change dynamically based on the value chosen in a parent field (e.g. College -&gt; Program).
                </ThemedText>

                {/* Parent Select Field Selector */}
                <FieldGroup label="Parent Dropdown Field">
                  <View style={styles.chipRow}>
                    {candidateParentFields
                      .filter((f) => f.dataType === 'Select')
                      .map((f) => (
                        <Chip
                          key={f.fieldKey}
                          label={`${f.label} (${f.fieldKey})`}
                          active={parentField === f.fieldKey}
                          onPress={() => setParentField(f.fieldKey)}
                        />
                      ))}
                  </View>
                </FieldGroup>

                {/* Mapping Entries List */}
                <View style={styles.mappingList}>
                  <View style={styles.rowBetween}>
                    <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                      Parent Value to Child Choices Mapping:
                    </ThemedText>
                    <Button
                      title="+ Add Mapping"
                      variant="outline"
                      size="sm"
                      onPress={handleAddMappingEntry}
                    />
                  </View>

                  {mappingEntries.map((entry, index) => (
                    <View key={entry.id} style={styles.mappingEntryCard}>
                      <View style={styles.rowBetween}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>
                          Mapping #{index + 1}
                        </ThemedText>
                        <Button
                          title="Remove"
                          variant="ghost"
                          size="sm"
                          onPress={() => handleRemoveMappingEntry(entry.id)}
                        />
                      </View>
                      <Input
                        label="Parent Option Value"
                        value={entry.parentVal}
                        onChangeText={(v) => handleUpdateMappingEntry(entry.id, 'parentVal', v)}
                        placeholder="e.g. College of Science"
                      />
                      <Input
                        label="Resulting Child Choices (comma separated)"
                        value={entry.childOptions}
                        onChangeText={(v) => handleUpdateMappingEntry(entry.id, 'childOptions', v)}
                        placeholder="e.g. BS Applied Physics, BS Chemistry, BS Biology"
                      />
                    </View>
                  ))}
                </View>

                {/* Default Fallback Options */}
                <Input
                  label="Default / Fallback Choices (when parent is unselected)"
                  value={defaultOptions}
                  onChangeText={setDefaultOptions}
                  placeholder="e.g. General Choice 1, General Choice 2"
                />

                {parentField ? (
                  <View style={styles.previewBox}>
                    <Badge
                      label={`Cascades on ${parentField} (${mappingEntries.length} mapped parents)`}
                      variant="purple"
                      size="md"
                    />
                  </View>
                ) : null}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
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
  },
  toggleRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    minHeight: theme.sizes.touchTarget,
  },
  toggleTextCol: {
    flex: 1,
    gap: theme.spacing.xs,
    paddingRight: theme.spacing.md,
  },
  switchTouchTarget: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  switchTrack: {
    width: 44,
    height: 26,
    borderRadius: theme.radii.full,
    padding: 2,
    justifyContent: 'center',
  },
  switchTrackActive: {
    backgroundColor: theme.colors.primary,
  },
  switchTrackInactive: {
    backgroundColor: theme.colors.surfaceHighlight,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
  },
  switchThumbActive: {
    alignSelf: 'flex-end',
  },
  switchThumbInactive: {
    alignSelf: 'flex-start',
  },
  rowAlign: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: theme.sizes.touchTarget,
  },
  ruleBuilderBody: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  previewBox: {
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderRadius: theme.radii.sm,
    gap: theme.spacing.xs,
  },
  mappingList: {
    gap: theme.spacing.sm,
  },
  mappingEntryCard: {
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceMuted,
    gap: theme.spacing.xs,
  },
});
