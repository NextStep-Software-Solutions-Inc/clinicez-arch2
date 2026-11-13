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
import {
  resolveCustomFieldPlaceholderPresentation,
  LONG_PLACEHOLDER_CHAR_LIMIT,
} from '../custom-fields/DynamicCustomFieldsRenderer';
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
  { key: 'sex', label: 'Sex' },
  { key: 'civilStatus', label: 'Civil Status (Single, Married, etc.)' },
  { key: 'affiliation', label: 'Institutional Affiliation' },
  { key: 'age', label: 'Patient Age' },
];

export const OPERATORS = [
  { key: 'equals', label: 'Equals (==)' },
  { key: 'not_equals', label: 'Not Equals (!=)' },
  { key: 'in', label: 'In List (comma separated)' },
  { key: 'contains', label: 'Contains Substring' },
  { key: 'not_empty', label: 'Has Any Value (Not Empty)' },
] as const;

export const BOOLEAN_OPERATORS = [
  { key: 'equals', label: 'Equals (==)' },
  { key: 'not_equals', label: 'Not Equals (!=)' },
  { key: 'not_empty', label: 'Has Any Value (Not Empty)' },
] as const;

export function normalizeBooleanRuleValue(rawVal: any): 'true' | 'false' {
  if (rawVal === true) return 'true';
  if (rawVal === false) return 'false';
  const str = String(rawVal ?? '').trim().toLowerCase();
  if (str === 'true' || str === 'yes') return 'true';
  if (str === 'false' || str === 'no') return 'false';
  return 'true';
}

export function isValidBooleanRuleValue(rawVal: any): boolean {
  if (rawVal === true || rawVal === false) return true;
  const str = String(rawVal ?? '').trim().toLowerCase();
  return str === 'true' || str === 'false' || str === 'yes' || str === 'no';
}

export function isBooleanTriggerField(
  fieldKey: string,
  existingFields: Array<Pick<ClinicCustomFieldDefinition, 'fieldKey' | 'dataType'>>,
  source: 'custom_field' | 'static' = 'custom_field'
): boolean {
  if (source !== 'custom_field') return false;
  const match = existingFields.find((f) => f.fieldKey === fieldKey);
  return match?.dataType === 'Boolean';
}

export function formatLiveRulePreview(
  ruleField: string,
  ruleOperator: VisibilityRule['operator'],
  ruleValue: string,
  isParentBoolean: boolean
): string {
  if (!ruleField) return '';
  if (ruleOperator === 'not_empty') {
    return `If ${ruleField} is not empty`;
  }
  if (isParentBoolean) {
    let displayVal = '...';
    const s = ruleValue?.trim().toLowerCase();
    if (s === 'true' || s === 'yes') {
      displayVal = 'Yes';
    } else if (s === 'false' || s === 'no') {
      displayVal = 'No';
    } else if (ruleValue) {
      displayVal = ruleValue;
    }
    return `Visible when [${ruleField}] ${ruleOperator} '${displayVal}'`;
  }
  return `Visible when [${ruleField}] ${ruleOperator} '${ruleValue || '...'}'`;
}

export function isDateBoundaryModeChanged(
  fieldToEdit: Pick<ClinicCustomFieldDefinition, 'boundaryMode' | 'category' | 'dataType'> | null | undefined,
  currentBoundaryMode: BoundaryMode,
  currentDataType: string
): boolean {
  if (!fieldToEdit || currentDataType !== 'Date') return false;
  const historicalBoundaryMode =
    fieldToEdit.boundaryMode ||
    ((fieldToEdit.category || '').trim().toLowerCase() === 'clinical' ? 'pastOrToday' : 'any');
  return Boolean(historicalBoundaryMode && currentBoundaryMode !== historicalBoundaryMode);
}

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
  const [label, setLabel] = useState(() => (visible && fieldToEdit ? fieldToEdit.label || '' : ''));
  const [fieldKey, setFieldKey] = useState(() => (visible && fieldToEdit ? fieldToEdit.fieldKey || '' : ''));
  const [isFieldKeyManuallyEdited, setIsFieldKeyManuallyEdited] = useState(() => Boolean(visible && fieldToEdit));
  const [fieldKeyError, setFieldKeyError] = useState<string | null>(null);
  const [dataType, setDataType] = useState<ClinicCustomFieldDefinition['dataType']>(() =>
    visible && fieldToEdit ? fieldToEdit.dataType || 'Text' : 'Text'
  );
  const [category, setCategory] = useState(() =>
    visible && fieldToEdit ? fieldToEdit.category || 'Demographics' : 'Demographics'
  );
  const [placeholder, setPlaceholder] = useState(() =>
    visible && fieldToEdit ? fieldToEdit.placeholder || '' : ''
  );
  const [isRequired, setIsRequired] = useState(() => Boolean(visible && fieldToEdit?.isRequired));
  const [options, setOptions] = useState('');
  const [boundaryMode, setBoundaryMode] = useState<BoundaryMode>(() => {
    if (visible && fieldToEdit) {
      if (fieldToEdit.boundaryMode) return fieldToEdit.boundaryMode;
      const isClinical = (fieldToEdit.category || '').trim().toLowerCase() === 'clinical';
      return isClinical ? 'pastOrToday' : 'any';
    }
    return 'any';
  });
  const [isBoundaryModeManuallySet, setIsBoundaryModeManuallySet] = useState(() =>
    Boolean(visible && fieldToEdit?.boundaryMode)
  );

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

  // Preceding fields candidate list for visibility/cascading
  const candidateParentFields = existingFields.filter(
    (f) => !fieldToEdit || f.id !== fieldToEdit.id
  );

  const selectedParentField = ruleSource === 'custom_field'
    ? candidateParentFields.find((f) => f.fieldKey === ruleField)
    : undefined;
  const isParentBoolean = selectedParentField?.dataType === 'Boolean';

  const isBoundaryModeChanged = isDateBoundaryModeChanged(fieldToEdit, boundaryMode, dataType);

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
          const src = rule.source || 'custom_field';
          setRuleSource(src);
          const parentKey = rule.field || rule.parentFieldKey || '';
          setRuleField(parentKey);

          const parentDef = src === 'custom_field'
            ? existingFields.find((f) => (!fieldToEdit || f.id !== fieldToEdit.id) && f.fieldKey === parentKey)
            : undefined;
          const isBooleanParent = parentDef?.dataType === 'Boolean';

          let op: VisibilityRule['operator'] = rule.operator || 'equals';
          if (isBooleanParent && (op === 'in' || op === 'contains')) {
            op = 'equals';
          }
          setRuleOperator(op);

          if (isBooleanParent) {
            const raw = rule.value !== undefined ? rule.value : (rule.expectedValue !== undefined ? rule.expectedValue : '');
            setRuleValue(normalizeBooleanRuleValue(raw));
          } else if (Array.isArray(rule.value)) {
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

  const handleSelectRuleField = (key: string) => {
    const target = candidateParentFields.find((f) => f.fieldKey === key);
    const isTargetBoolean = target?.dataType === 'Boolean';

    if (isTargetBoolean) {
      if (ruleOperator === 'in' || ruleOperator === 'contains') {
        setRuleOperator('equals');
      }
      if (!isValidBooleanRuleValue(ruleValue)) {
        setRuleValue('true');
      } else {
        setRuleValue(normalizeBooleanRuleValue(ruleValue));
      }
    } else {
      if (ruleValue === 'true' || ruleValue === 'false') {
        setRuleValue('');
      }
    }
    setRuleField(key);
  };

  const handleSelectStaticField = (key: string) => {
    if (ruleValue === 'true' || ruleValue === 'false') {
      setRuleValue('');
    }
    setRuleField(key);
  };

  const handleRuleSourceChange = (src: 'custom_field' | 'static') => {
    setRuleSource(src);
    setRuleField('');
    if (ruleValue === 'true' || ruleValue === 'false') {
      setRuleValue('');
    }
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

      if (isParentBoolean) {
        if (ruleOperator === 'in' || ruleOperator === 'contains') {
          const errorMsg = 'Comparison operator for Boolean fields must be Equals, Not Equals, or Has Any Value.';
          setError(errorMsg);
          Alert.alert('Validation Error', errorMsg);
          setSaving(false);
          return;
        }

        if (ruleOperator !== 'not_empty') {
          if (!isValidBooleanRuleValue(ruleValue)) {
            const errorMsg = 'Please select Yes or No for the expected Boolean condition.';
            setError(errorMsg);
            Alert.alert('Validation Error', errorMsg);
            setSaving(false);
            return;
          }
        }
      }

      let val: any;
      if (isParentBoolean && ruleOperator !== 'not_empty') {
        val = normalizeBooleanRuleValue(ruleValue);
      } else if (ruleOperator === 'in') {
        val = ruleValue
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else if (ruleOperator === 'not_empty') {
        val = undefined;
      } else {
        val = ruleValue.trim();
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

  const displayedError = error || (!dismissedSaveError ? saveError : null);
  const isSingleLineFieldType =
    dataType === 'Text' || dataType === 'Number' || dataType === 'Date';
  const placeholderPresentation = isSingleLineFieldType
    ? resolveCustomFieldPlaceholderPresentation(placeholder, dataType)
    : { inputPlaceholder: placeholder, helperHint: undefined, isExpandedHint: false };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={isEditing ? 'Edit Registration Question' : 'Add Registration Question'}
      subtitle={
        isEditing
          ? 'Update the question wording, answer type, or when this question is shown.'
          : 'Create an extra question asked when registering a patient.'
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
            title={isEditing ? 'Save Changes' : 'Add Question'}
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

        {/* Question Label */}
        <Input
          label="Question label"
          required
          value={label}
          onChangeText={handleLabelChange}
          placeholder="Enter question label"
        />

        {/* Field ID */}
        <View style={styles.machineKeyFieldBlock}>
          <View style={styles.rowBetween}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              Field ID
              <ThemedText color={theme.colors.emergency}> *</ThemedText>
            </ThemedText>
            <Button
              title="Generate from label"
              icon="refresh"
              variant="ghost"
              size="xs"
              accessibilityLabel="Generate field ID from question label"
              onPress={handleAutoSlugify}
            />
          </View>
          <Input
            value={fieldKey}
            onChangeText={handleFieldKeyChange}
            onBlur={handleFieldKeyBlur}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Enter field ID"
            error={fieldKeyError || undefined}
            helperText="Lowercase letters, numbers, and underscores only."
          />
        </View>

        {/* Answer Type */}
        <FieldGroup label="Answer Type">
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

        {/* Question Group */}
        <FieldGroup label="Question Group">
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

        {/* Allowed Dates */}
        {dataType === 'Date' && (
          <FieldGroup label="Allowed Dates">
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
                ? 'Allows past dates or today (good for medical history, past exams, or symptom start dates).'
                : boundaryMode === 'futureOrToday'
                ? 'Allows today or future dates (good for ID expiry dates or follow-up dates).'
                : boundaryMode === 'futureOnly'
                ? 'Allows future dates only.'
                : 'Allows any calendar date.'}
            </ThemedText>

            {isBoundaryModeChanged && (
              <View style={styles.boundaryChangeWarningBox}>
                <Icon name="alert" size={16} color={theme.colors.warningText} />
                <ThemedText variant="caption" color={theme.colors.warningText} style={styles.boundaryWarningText}>
                  Note: Updating date rules will only apply to new entries or edits. Existing historical patient records remain preserved and will not be locked out.
                </ThemedText>
              </View>
            )}
          </FieldGroup>
        )}

        {/* Required Answer Toggle */}
        <View style={styles.toggleRowContainer}>
          <View style={styles.toggleTextCol}>
            <View style={styles.rowAlign}>
              <ThemedText variant="bodyBold">Require an answer</ThemedText>
              <Badge
                label={isRequired ? 'Required' : 'Optional'}
                variant={isRequired ? 'emergency' : 'neutral'}
                size="sm"
              />
            </View>
            <ThemedText variant="caption" color={theme.colors.textMuted}>
              Patients and staff must fill in this question when it is shown during registration.
            </ThemedText>
          </View>
          <ToggleSwitch
            value={isRequired}
            onValueChange={setIsRequired}
            accessibilityLabel="Require an answer"
          />
        </View>

        {/* Help text / example */}
        <Input
          label="Help text or example (optional)"
          value={placeholder}
          onChangeText={setPlaceholder}
          placeholder="Optional guidance shown to patients or staff"
          helperText="Recommended: under 50 characters. Hints longer than 75 characters automatically wrap beneath the field during intake so staff can read them."
        />
        {isSingleLineFieldType &&
        placeholderPresentation.isExpandedHint &&
        placeholderPresentation.helperHint ? (
          <View style={styles.longPlaceholderPreviewCard}>
            <View style={styles.rowBetween}>
              <View style={styles.rowAlign}>
                <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.infoText} />
                <ThemedText variant="captionBold" color={theme.colors.infoText}>
                  Full Help Text Preview ({placeholder.trim().length} characters)
                </ThemedText>
              </View>
              <Badge label="Wraps Below Field" variant="primary" size="sm" />
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Long help text is shown underneath single-line {dataType.toLowerCase()} fields so the entire instruction is easy to read without getting cut off:
            </ThemedText>
            <View style={styles.simulatedInputPreview}>
              <ThemedText variant="caption" color={theme.colors.textLight}>
                {placeholderPresentation.inputPlaceholder}
              </ThemedText>
            </View>
            <View style={styles.simulatedExpandedHintBox}>
              <Icon name="info" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.flex1}>
                {placeholderPresentation.helperHint}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {/* Select Choices (Flat options when not cascading) */}
        {dataType === 'Select' && !isCascading && (
          <Input
            label="Dropdown choices (comma separated)"
            value={options}
            onChangeText={setOptions}
            placeholder="Enter choices separated by commas"
          />
        )}

        {/* =========================================================================
            LIVE VISIBILITY RULE BUILDER
           ========================================================================= */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeaderRow}>
            <View style={styles.rowAlign}>
              <Icon name="eye" size={theme.sizes.iconSm} color={theme.colors.primary} />
              <ThemedText variant="bodyBold">Show Only For Specific Answers</ThemedText>
            </View>
            <ToggleSwitch
              value={hasVisibilityRule}
              onValueChange={setHasVisibilityRule}
              accessibilityLabel="Show Only For Specific Answers"
            />
          </View>

          {hasVisibilityRule && (
            <View style={styles.ruleBuilderBody}>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                Only show this question when an earlier answer matches your condition.
              </ThemedText>

              {/* Source Selector */}
              <FieldGroup label="Check Answer From">
                <View style={styles.chipRow}>
                  <Chip
                    label="Another Registration Question"
                    active={ruleSource === 'custom_field'}
                    onPress={() => handleRuleSourceChange('custom_field')}
                  />
                  <Chip
                    label="Basic Patient Info"
                    active={ruleSource === 'static'}
                    onPress={() => handleRuleSourceChange('static')}
                  />
                </View>
              </FieldGroup>

              {/* Field Selector */}
              <FieldGroup label="Question to Check">
                {ruleSource === 'static' ? (
                  <View style={styles.chipRow}>
                    {STATIC_FIELD_OPTIONS.map((opt) => (
                      <Chip
                        key={opt.key}
                        label={opt.label}
                        active={ruleField === opt.key}
                        onPress={() => handleSelectStaticField(opt.key)}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={styles.chipRow}>
                    {candidateParentFields.length === 0 ? (
                      <ThemedText variant="caption" color={theme.colors.textMuted}>
                        No other registration questions created yet.
                      </ThemedText>
                    ) : (
                      candidateParentFields.map((f) => (
                        <Chip
                          key={f.fieldKey}
                          label={`${f.label} (${f.fieldKey})`}
                          active={ruleField === f.fieldKey}
                          onPress={() => handleSelectRuleField(f.fieldKey)}
                        />
                      ))
                    )}
                  </View>
                )}
              </FieldGroup>

              {/* Operator Selector */}
              <FieldGroup label="Condition">
                <View style={styles.chipRow}>
                  {(isParentBoolean ? BOOLEAN_OPERATORS : OPERATORS).map((op) => (
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
                isParentBoolean ? (
                  <FieldGroup label="Answer That Shows This Question">
                    <View style={styles.chipRow}>
                      <Chip
                        label="Yes"
                        active={ruleValue === 'true'}
                        onPress={() => setRuleValue('true')}
                      />
                      <Chip
                        label="No"
                        active={ruleValue === 'false'}
                        onPress={() => setRuleValue('false')}
                      />
                    </View>
                  </FieldGroup>
                ) : (
                  <Input
                    label="Answer That Shows This Question"
                    value={ruleValue}
                    onChangeText={setRuleValue}
                    placeholder={
                      ruleOperator === 'in'
                        ? 'Enter matching answers separated by commas'
                        : 'Enter matching answer'
                    }
                  />
                )
              )}

              {/* Live Preview Badge */}
              <View style={styles.previewBox}>
                <ThemedText variant="captionBold" color={theme.colors.warningText}>
                  RULE PREVIEW:
                </ThemedText>
                {ruleField ? (
                  <Badge
                    label={formatLiveRulePreview(ruleField, ruleOperator, ruleValue, isParentBoolean)}
                    variant="warning"
                    size="md"
                  />
                ) : (
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Choose a question above to preview when this will appear.
                  </ThemedText>
                )}
              </View>
            </View>
          )}
        </View>

        {/* =========================================================================
            DEPENDENT DROPDOWN OPTIONS MAPPER (FOR SELECT FIELDS)
           ========================================================================= */}
        {dataType === 'Select' && (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <View style={styles.rowAlign}>
                <Icon name="tag" size={theme.sizes.iconSm} color={theme.colors.purple} />
                <ThemedText variant="bodyBold">Filter Choices by Earlier Answer</ThemedText>
              </View>
              <ToggleSwitch
                value={isCascading}
                onValueChange={setIsCascading}
                accessibilityLabel="Filter Choices by Earlier Answer"
              />
            </View>

            {isCascading && (
              <View style={styles.ruleBuilderBody}>
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  Show different dropdown choices depending on what was picked in an earlier dropdown question.
                </ThemedText>

                {/* Parent Select Field Selector */}
                <FieldGroup label="Earlier Dropdown Question">
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
                      Choices for Each Earlier Answer:
                    </ThemedText>
                    <Button
                      title="+ Add Answer Group"
                      variant="outline"
                      size="sm"
                      onPress={handleAddMappingEntry}
                    />
                  </View>

                  {mappingEntries.map((entry, index) => (
                    <View key={entry.id} style={styles.mappingEntryCard}>
                      <View style={styles.rowBetween}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>
                          Answer Group {index + 1}
                        </ThemedText>
                        <Button
                          title="Remove"
                          icon="trash"
                          variant="dangerGhost"
                          size="xs"
                          onPress={() => handleRemoveMappingEntry(entry.id)}
                        />
                      </View>
                      <Input
                        label="Earlier Answer"
                        value={entry.parentVal}
                        onChangeText={(v) => handleUpdateMappingEntry(entry.id, 'parentVal', v)}
                        placeholder="Enter earlier answer"
                      />
                      <Input
                        label="Dropdown Choices (comma separated)"
                        value={entry.childOptions}
                        onChangeText={(v) => handleUpdateMappingEntry(entry.id, 'childOptions', v)}
                        placeholder="Enter choices separated by commas"
                      />
                    </View>
                  ))}
                </View>

                {/* Default Fallback Options */}
                <Input
                  label="Default Choices (when no earlier answer is picked)"
                  value={defaultOptions}
                  onChangeText={setDefaultOptions}
                  placeholder="Enter default choices separated by commas"
                />

                {parentField ? (
                  <View style={styles.previewBox}>
                    <Badge
                      label={`Depends on ${parentField} (${mappingEntries.length} answer groups)`}
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
  longPlaceholderPreviewCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.infoBorder,
    backgroundColor: theme.colors.infoBg,
    gap: theme.spacing.xs,
  },
  simulatedInputPreview: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  simulatedExpandedHintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  boundaryChangeWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  boundaryWarningText: {
    flex: 1,
  },
});
