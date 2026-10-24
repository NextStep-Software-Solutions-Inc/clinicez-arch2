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
  BoundaryMode,
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

export const MACHINE_KEY_REGEX = /^[a-z0-9_]+$/;

export function slugifyMachineKey(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeMachineKeyOnBlur(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function validateMachineKey(
  rawKey: string,
  existingFields: Array<Pick<ClinicCustomFieldDefinition, 'id' | 'fieldKey'>>,
  editingFieldId?: string | null
): string | null {
  if (!rawKey) {
    return 'Machine key is required.';
  }
  if (rawKey !== rawKey.trim() || !MACHINE_KEY_REGEX.test(rawKey)) {
    return 'Machine key must contain only lowercase alphanumeric characters and underscores (e.g. student_id).';
  }
  if (rawKey.length > 100) {
    return 'Machine key cannot exceed 100 characters.';
  }
  const normalized = rawKey.toLowerCase();
  const isDuplicate = existingFields.some(
    (f) => f.id !== editingFieldId && f.fieldKey.toLowerCase() === normalized
  );
  if (isDuplicate) {
    return 'A custom field with this machine key already exists.';
  }
  return null;
}

export interface AddEditFieldModalProps {
  visible: boolean;
  onClose: () => void;
  fieldToEdit?: ClinicCustomFieldDefinition | null;
  existingFields: ClinicCustomFieldDefinition[];
  onSave: (fieldData: Partial<ClinicCustomFieldDefinition>) => Promise<boolean>;
  saveError?: string | null;
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
  saveError,
}: AddEditFieldModalProps) {
  const isEditing = Boolean(fieldToEdit);

  // Core metadata state
  const [label, setLabel] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [isFieldKeyManuallyEdited, setIsFieldKeyManuallyEdited] = useState(false);
  const [fieldKeyError, setFieldKeyError] = useState<string | null>(null);
  const [dataType, setDataType] = useState<ClinicCustomFieldDefinition['dataType']>('Text');
  const [category, setCategory] = useState('Demographics');
  const [placeholder, setPlaceholder] = useState('');
  const [isRequired, setIsRequired] = useState(false);
  const [options, setOptions] = useState('');
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>('any');
  const [isBoundaryModeManuallySet, setIsBoundaryModeManuallySet] = useState(false);

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
  const [dismissedSaveError, setDismissedSaveError] = useState(false);

  // Initialize form when fieldToEdit changes or modal opens
  useEffect(() => {
    if (!visible) return;

    if (fieldToEdit) {
      setLabel(fieldToEdit.label || '');
      setFieldKey(fieldToEdit.fieldKey || '');
      setIsFieldKeyManuallyEdited(true);
      setFieldKeyError(null);
      setDataType(fieldToEdit.dataType || 'Text');
      setCategory(fieldToEdit.category || 'Demographics');
      setPlaceholder(fieldToEdit.placeholder || '');
      setIsRequired(Boolean(fieldToEdit.isRequired));

      if (fieldToEdit.boundaryMode) {
        setBoundaryMode(fieldToEdit.boundaryMode);
        setIsBoundaryModeManuallySet(true);
      } else {
        const isClinical = (fieldToEdit.category || '').trim().toLowerCase() === 'clinical';
        setBoundaryMode(isClinical ? 'pastOrToday' : 'any');
        setIsBoundaryModeManuallySet(false);
      }

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
      setIsFieldKeyManuallyEdited(false);
      setFieldKeyError(null);
      setDataType('Text');
      setCategory('Demographics');
      setPlaceholder('');
      setIsRequired(false);
      setOptions('');
      setBoundaryMode('any');
      setIsBoundaryModeManuallySet(false);
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
    setDismissedSaveError(false);
    setSaving(false);
  }, [visible, fieldToEdit]);

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    if (!isBoundaryModeManuallySet) {
      if (newCat.trim().toLowerCase() === 'clinical') {
        setBoundaryMode('pastOrToday');
      } else {
        setBoundaryMode('any');
      }
    }
  };

  // Handle label change and auto-generate key in Create mode
  const handleLabelChange = (text: string) => {
    setLabel(text);
    setDismissedSaveError(true);
    if (!isEditing && !isFieldKeyManuallyEdited) {
      const generated = slugifyMachineKey(text);
      setFieldKey(generated);
      if (fieldKeyError) {
        setFieldKeyError(
          generated ? validateMachineKey(generated, existingFields, fieldToEdit?.id) : null
        );
      }
    }
  };

  const handleFieldKeyChange = (text: string) => {
    setFieldKey(text);
    setIsFieldKeyManuallyEdited(true);
    setDismissedSaveError(true);
    if (fieldKeyError) {
      setFieldKeyError(validateMachineKey(text, existingFields, fieldToEdit?.id));
    }
    if (error) {
      setError(null);
    }
  };

  const handleFieldKeyBlur = () => {
    if (!fieldKey.trim() && label.trim() && !isEditing && !isFieldKeyManuallyEdited) {
      const generated = slugifyMachineKey(label);
      setFieldKey(generated);
      setFieldKeyError(
        generated ? validateMachineKey(generated, existingFields, fieldToEdit?.id) : null
      );
      return;
    }
    if (fieldKey || isEditing || isFieldKeyManuallyEdited) {
      const normalized = normalizeMachineKeyOnBlur(fieldKey);
      setFieldKey(normalized);
      setFieldKeyError(validateMachineKey(normalized, existingFields, fieldToEdit?.id));
    }
  };

  const handleAutoSlugify = () => {
    const source = label.trim() || fieldKey.trim();
    const slugified = slugifyMachineKey(source);
    setFieldKey(slugified);
    setIsFieldKeyManuallyEdited(false);
    setDismissedSaveError(true);
    setFieldKeyError(
      slugified ? validateMachineKey(slugified, existingFields, fieldToEdit?.id) : null
    );
    if (error) {
      setError(null);
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

    const candidateKey =
      !isEditing && !isFieldKeyManuallyEdited && fieldKey.length === 0
        ? slugifyMachineKey(trimmedLabel)
        : fieldKey;
    const keyValidationError = validateMachineKey(candidateKey, existingFields, fieldToEdit?.id);
    if (keyValidationError) {
      setFieldKeyError(keyValidationError);
      setError(keyValidationError);
      return;
    }

    setSaving(true);
    setError(null);
    setDismissedSaveError(false);
    setFieldKeyError(null);

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
      fieldKey: candidateKey,
      dataType,
      category,
      placeholder: placeholder.trim() || undefined,
      isRequired,
      boundaryMode: dataType === 'Date' ? boundaryMode : null,
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

  const displayedError = error || (!dismissedSaveError ? saveError : null);

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
        {displayedError ? (
          <View style={styles.errorBox}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {displayedError}
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
        <View style={styles.machineKeyFieldBlock}>
          <View style={styles.rowBetween}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Machine Key (System Identifier)
              <ThemedText color={theme.colors.emergency}> *</ThemedText>
            </ThemedText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Auto-slugify machine key from label"
              onPress={handleAutoSlugify}
              style={styles.slugifyActionBtn}
            >
              <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="captionBold" color={theme.colors.primary}>
                Auto-slugify from label
              </ThemedText>
            </Pressable>
          </View>
          <Input
            value={fieldKey}
            onChangeText={handleFieldKeyChange}
            onBlur={handleFieldKeyBlur}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. student_id, college, spouse_name"
            error={fieldKeyError || undefined}
            helperText="Lowercase letters, numbers, and underscores only (^[a-z0-9_]+$)."
          />
        </View>

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
                onPress={() => handleCategoryChange(cat)}
              />
            ))}
          </View>
        </FieldGroup>

        {/* Date Boundary Rule */}
        {dataType === 'Date' && (
          <FieldGroup label="Date Boundary Rule">
            <View style={styles.chipRow}>
              {([
                { key: 'pastOrToday', label: 'Past or Today' },
                { key: 'futureOrToday', label: 'Today or Future' },
                { key: 'futureOnly', label: 'Future Only' },
                { key: 'any', label: 'Any Date' },
              ] as const).map((mode) => (
                <Chip
                  key={mode.key}
                  label={mode.label}
                  active={boundaryMode === mode.key}
                  onPress={() => {
                    setBoundaryMode(mode.key);
                    setIsBoundaryModeManuallySet(true);
                  }}
                />
              ))}
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              {boundaryMode === 'pastOrToday'
                ? 'Restricts input to past dates or today (recommended for clinical history, past examinations, onset dates).'
                : boundaryMode === 'futureOrToday'
                ? 'Restricts input to today or future dates (recommended for expiry dates, follow-up scheduling).'
                : boundaryMode === 'futureOnly'
                ? 'Restricts input strictly to future dates.'
                : 'Permits any calendar date without restriction.'}
            </ThemedText>
          </FieldGroup>
        )}

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
  machineKeyFieldBlock: {
    gap: theme.spacing.xs,
  },
  slugifyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.xs,
  },
});
