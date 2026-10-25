import React, { useState, useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Input from '../ui/Input';
import ValidatedDateInput, { validateDateString } from '../ui/ValidatedDateInput';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import type {
  ClinicCustomFieldDefinition,
  VisibilityRule,
  ConditionalOptionsConfig,
} from '../../services/clinicService';

export interface StaticPatientValues {
  gender?: string;
  civilStatus?: string;
  dateOfBirth?: string;
  age?: number;
  [key: string]: any;
}

export interface DynamicCustomFieldsRendererProps {
  fields: ClinicCustomFieldDefinition[];
  values: Record<string, any>;
  onChange: (fieldKey: string, value: any) => void;
  errors?: Record<string, string>;
  staticValues?: StaticPatientValues;
  disabled?: boolean;
}

/**
 * Pure evaluation function for conditional visibility.
 * Evaluates visibilityRuleJson against current form values and static patient properties.
 * Fails open (returns true) if rule is absent or malformed.
 */
export function isFieldVisible(
  field: ClinicCustomFieldDefinition,
  values: Record<string, any>,
  staticValues: StaticPatientValues = {}
): boolean {
  if (!field.visibilityRuleJson) return true;

  try {
    const rule: VisibilityRule = JSON.parse(field.visibilityRuleJson);
    let actualValue: any;

    if (rule.source === 'static') {
      if (rule.field === 'gender') actualValue = staticValues.gender;
      else if (rule.field === 'civilStatus') actualValue = staticValues.civilStatus;
      else if (rule.field === 'dateOfBirth') actualValue = staticValues.dateOfBirth;
      else if (rule.field === 'age') actualValue = staticValues.age;
      else actualValue = (staticValues as any)[rule.field];
    } else {
      actualValue = values[rule.field];
    }

    switch (rule.operator) {
      case 'equals':
        return String(actualValue ?? '').trim().toLowerCase() === String(rule.value ?? '').trim().toLowerCase();

      case 'not_equals':
        return String(actualValue ?? '').trim().toLowerCase() !== String(rule.value ?? '').trim().toLowerCase();

      case 'in':
        if (Array.isArray(rule.value)) {
          return rule.value.map((v) => String(v).trim().toLowerCase()).includes(String(actualValue ?? '').trim().toLowerCase());
        }
        return false;

      case 'contains':
        return String(actualValue ?? '').toLowerCase().includes(String(rule.value ?? '').toLowerCase());

      case 'not_empty':
        return actualValue !== null && actualValue !== undefined && String(actualValue).trim() !== '';

      default:
        return true;
    }
  } catch {
    // Malformed rule fails open to visible
    return true;
  }
}

/**
 * Derives available options for Select fields, dynamically resolving cascading/dependent choices.
 */
export function getAvailableOptions(
  field: ClinicCustomFieldDefinition,
  values: Record<string, any>
): string[] {
  if (field.dataType !== 'Select') return [];

  if (field.conditionalOptionsJson) {
    try {
      const config: ConditionalOptionsConfig = JSON.parse(field.conditionalOptionsJson);
      const parentVal = values[config.parentField];
      if (parentVal && config.mapping && config.mapping[parentVal]) {
        return config.mapping[parentVal];
      }
      return config.defaultOptions || [];
    } catch {
      // Fallback
    }
  }

  if (field.optionsJson) {
    try {
      const parsed = JSON.parse(field.optionsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

/**
 * Sanitizes real-time numeric keyboard input by stripping non-numeric/non-decimal characters,
 * allowing at most one leading negative sign, and at most one decimal point.
 * Preserves interim typing inputs ('-', '.', '-.') so user typing is not blocked.
 */
export function sanitizeNumericInput(text: string): string {
  if (text === null || text === undefined) return '';
  const str = String(text);
  if (!str) return '';

  let hasDecimal = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '-' && result.length === 0) {
      result += '-';
    } else if (char === '.' && !hasDecimal) {
      hasDecimal = true;
      result += '.';
    } else if (char >= '0' && char <= '9') {
      result += char;
    }
  }

  return result;
}

/**
 * Validates whether a value is a complete, finite, well-formed number.
 * Accepts finite numbers and numeric strings matching /^-?\d+(\.\d+)?$/.
 * Rejects incomplete typing states ('-', '.', '-.', '12.'), symbols, alphabetic strings, and booleans.
 */
export function isValidCustomNumber(val: any): boolean {
  if (val === null || val === undefined || typeof val === 'boolean') {
    return false;
  }
  if (typeof val === 'number') {
    return Number.isFinite(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return false;
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return false;
    const num = Number(trimmed);
    return Number.isFinite(num);
  }
  return false;
}

export interface MergeCustomFieldsOptions {
  /**
   * When true, any defined custom field key that previously existed in `existingCustomFields`
   * and is now cleared or conditionally hidden is emitted as `null` instead of omitted.
   * Required for HTTP PUT payloads where backend `UpdateClinicPatientCommand` uses additive
   * JSON merge semantics (`null` tombstone signals server-side key deletion).
   */
  emitNullTombstones?: boolean;
}

/**
 * Merges form custom field values into existing custom fields on update.
 * Explicitly removes cleared or conditionally hidden custom fields (or emits `null` tombstones
 * when `options.emitNullTombstones` is enabled for HTTP PUT additive merge endpoints) while
 * preserving unrelated system metadata keys (e.g., member_type, principal_member_pin, philhealth_profile).
 */
export function mergeCustomFieldsForUpdate(
  existingCustomFields: Record<string, any> | undefined,
  definitions: ClinicCustomFieldDefinition[],
  values: Record<string, any>,
  staticValues: StaticPatientValues = {},
  options?: MergeCustomFieldsOptions
): Record<string, any> {
  const merged: Record<string, any> = { ...(existingCustomFields || {}) };
  const emitTombstones = options?.emitNullTombstones === true;

  const clearOrTombstone = (key: string) => {
    const existingKeysMatching = existingCustomFields
      ? Object.keys(existingCustomFields).filter((k) => k.toLowerCase() === key.toLowerCase())
      : [];
    for (const k of existingKeysMatching) {
      delete merged[k];
    }
    delete merged[key];
    if (emitTombstones && existingKeysMatching.length > 0) {
      merged[key] = null;
    }
  };

  const assignCanonicalValue = (key: string, nextVal: any) => {
    if (existingCustomFields) {
      for (const k of Object.keys(existingCustomFields)) {
        if (k !== key && k.toLowerCase() === key.toLowerCase()) {
          delete merged[k];
        }
      }
    }
    merged[key] = nextVal;
  };

  for (const def of definitions) {
    const key = def.fieldKey;
    if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    const isVisible = isFieldVisible(def, values, staticValues);

    if (!isVisible) {
      clearOrTombstone(key);
      continue;
    }

    const val = values[key];
    if (val === null || val === undefined) {
      clearOrTombstone(key);
    } else if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed === '') {
        clearOrTombstone(key);
      } else {
        assignCanonicalValue(key, trimmed);
      }
    } else if (typeof val === 'number') {
      if (Number.isFinite(val)) {
        assignCanonicalValue(key, val);
      } else {
        clearOrTombstone(key);
      }
    } else {
      assignCanonicalValue(key, val);
    }
  }

  return merged;
}

/**
 * Validates custom fields: enforces isRequired only on currently VISIBLE fields.
 * Hidden fields never block validation.
 * Validates non-empty Number fields against isValidCustomNumber, and Date fields against validateDateString.
 */
export function validateCustomFields(
  definitions: ClinicCustomFieldDefinition[],
  values: Record<string, any>,
  staticValues: StaticPatientValues = {}
): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let isValid = true;

  const visibleFields = definitions
    .filter((f) => isFieldVisible(f, values, staticValues))
    .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));

  for (const def of visibleFields) {
    const val = values[def.fieldKey];
    const isEmpty =
      val === null ||
      val === undefined ||
      (typeof val === 'string' && val.trim() === '') ||
      (typeof val === 'boolean' && val === false && def.dataType !== 'Boolean');

    if (def.isRequired && isEmpty) {
      errors[def.fieldKey] = `${def.label} is required.`;
      isValid = false;
      continue;
    }

    if (!isEmpty) {
      if (def.dataType === 'Number') {
        if (!isValidCustomNumber(val)) {
          errors[def.fieldKey] = `${def.label} must be a valid number.`;
          isValid = false;
        }
      } else if (def.dataType === 'Date') {
        const dateCheck = validateDateString(String(val), { boundaryMode: 'any' });
        if (!dateCheck.isValid) {
          errors[def.fieldKey] = `${def.label} must be a valid date (YYYY-MM-DD).`;
          isValid = false;
        }
      }
    }
  }

  return { isValid, errors };
}

/**
 * Sanitizes submission payload by stripping keys of all currently hidden fields,
 * trimming strings, and omitting whitespace-only strings while preserving valid 0 and false.
 */
export function sanitizeCustomFieldsPayload(
  definitions: ClinicCustomFieldDefinition[],
  values: Record<string, any>,
  staticValues: StaticPatientValues = {}
): Record<string, any> {
  const cleanPayload: Record<string, any> = {};
  const visibleKeys = new Set(
    definitions
      .filter((f) => isFieldVisible(f, values, staticValues))
      .map((f) => f.fieldKey)
  );

  for (const [k, v] of Object.entries(values || {})) {
    if (!visibleKeys.has(k)) continue;
    if (v === null || v === undefined) continue;

    if (typeof v === 'string') {
      const trimmed = v.trim();
      if (trimmed !== '') {
        cleanPayload[k] = trimmed;
      }
    } else if (typeof v === 'number') {
      if (Number.isFinite(v)) {
        cleanPayload[k] = v;
      }
    } else {
      cleanPayload[k] = v;
    }
  }

  return cleanPayload;
}

/**
 * Reactive Dynamic Custom Fields Renderer Component
 * Renders custom fields strictly in configured DisplayOrder with real-time condition evaluation,
 * cascading select choice resolution, defensive validation hints, and strict design-token styling.
 */
export default function DynamicCustomFieldsRenderer({
  fields,
  values,
  onChange,
  errors = {},
  staticValues = {},
  disabled = false,
}: DynamicCustomFieldsRendererProps) {
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // 1. Sort definitions deterministically by displayOrder, then label
  const sortedFields = useMemo(() => {
    return [...fields].sort((a, b) => {
      if ((a.displayOrder ?? 0) !== (b.displayOrder ?? 0)) {
        return (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
      }
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [fields]);

  // 2. Filter to currently visible fields based on visibility rules
  const visibleFields = useMemo(() => {
    return sortedFields.filter((f) => isFieldVisible(f, values, staticValues));
  }, [sortedFields, values, staticValues]);

  // 3. Handle field change with automatic cascading child reset
  const handleFieldChange = (fieldKey: string, newValue: any) => {
    onChange(fieldKey, newValue);

    // Find dependent fields whose options depend on this parent field
    for (const def of fields) {
      if (def.conditionalOptionsJson) {
        try {
          const config: ConditionalOptionsConfig = JSON.parse(def.conditionalOptionsJson);
          if (config.parentField === fieldKey) {
            const nextParentVals = { ...values, [fieldKey]: newValue };
            const availableOptions = getAvailableOptions(def, nextParentVals);
            const currentChildVal = values[def.fieldKey];
            if (currentChildVal && !availableOptions.includes(currentChildVal)) {
              onChange(def.fieldKey, '');
            }
          }
        } catch {}
      }
    }
  };

  if (!visibleFields.length) {
    return null;
  }

  return (
    <View style={styles.container}>
      {visibleFields.map((field) => {
        const error = errors[field.fieldKey] || localErrors[field.fieldKey];
        const val = values[field.fieldKey];

        switch (field.dataType) {
          case 'Text':
            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <Input
                  label={field.label}
                  required={field.isRequired}
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  value={val !== undefined && val !== null ? String(val) : ''}
                  onChangeText={(text) => handleFieldChange(field.fieldKey, text)}
                  error={error}
                  editable={!disabled}
                />
              </View>
            );

          case 'Number': {
            const handleNumberChange = (text: string) => {
              const sanitized = sanitizeNumericInput(text);
              if (localErrors[field.fieldKey]) {
                setLocalErrors((prev) => {
                  const next = { ...prev };
                  delete next[field.fieldKey];
                  return next;
                });
              }
              handleFieldChange(field.fieldKey, sanitized);
            };

            const handleNumberBlur = () => {
              const currentVal = values[field.fieldKey];
              if (currentVal !== undefined && currentVal !== null && String(currentVal).trim() !== '') {
                if (!isValidCustomNumber(currentVal)) {
                  setLocalErrors((prev) => ({
                    ...prev,
                    [field.fieldKey]: `${field.label} must be a valid number.`,
                  }));
                  return;
                }
              }
              setLocalErrors((prev) => {
                if (!prev[field.fieldKey]) return prev;
                const next = { ...prev };
                delete next[field.fieldKey];
                return next;
              });
            };

            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <Input
                  label={field.label}
                  required={field.isRequired}
                  keyboardType="numeric"
                  inputMode="decimal"
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  value={val !== undefined && val !== null ? String(val) : ''}
                  onChangeText={handleNumberChange}
                  onBlur={handleNumberBlur}
                  error={error}
                  editable={!disabled}
                />
              </View>
            );
          }

          case 'Date':
            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <ValidatedDateInput
                  label={field.label}
                  required={field.isRequired}
                  placeholder={field.placeholder || 'YYYY-MM-DD'}
                  value={val !== undefined && val !== null ? String(val) : ''}
                  onChangeText={(text) => handleFieldChange(field.fieldKey, text)}
                  error={error}
                  boundaryMode="any"
                  disabled={disabled}
                />
              </View>
            );

          case 'Boolean':
            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
                  {field.label}
                  {field.isRequired ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
                </ThemedText>
                <View style={styles.booleanRow}>
                  <Pressable
                    disabled={disabled}
                    onPress={() => handleFieldChange(field.fieldKey, true)}
                    style={[
                      styles.choicePill,
                      val === true && styles.choicePillActive,
                      disabled && styles.pillDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: val === true }}
                  >
                    <ThemedText
                      variant={val === true ? 'smallBold' : 'small'}
                      color={val === true ? theme.colors.primary : theme.colors.textSecondary}
                    >
                      Yes
                    </ThemedText>
                  </Pressable>
                  <Pressable
                    disabled={disabled}
                    onPress={() => handleFieldChange(field.fieldKey, false)}
                    style={[
                      styles.choicePill,
                      val === false && styles.choicePillActive,
                      disabled && styles.pillDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: val === false }}
                  >
                    <ThemedText
                      variant={val === false ? 'smallBold' : 'small'}
                      color={val === false ? theme.colors.primary : theme.colors.textSecondary}
                    >
                      No
                    </ThemedText>
                  </Pressable>
                </View>
                {error ? (
                  <View style={styles.errorContainer}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                    <ThemedText variant="caption" color={theme.colors.emergency}>
                      {error}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            );

          case 'Select': {
            const availableOptions = getAvailableOptions(field, values);

            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
                  {field.label}
                  {field.isRequired ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
                </ThemedText>

                {availableOptions.length > 0 ? (
                  <View style={styles.optionsWrap}>
                    {availableOptions.map((opt) => {
                      const isSelected = String(val ?? '') === String(opt);
                      return (
                        <Pressable
                          key={opt}
                          disabled={disabled}
                          onPress={() => handleFieldChange(field.fieldKey, opt)}
                          style={[
                            styles.choicePill,
                            isSelected && styles.choicePillActive,
                            disabled && styles.pillDisabled,
                          ]}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isSelected }}
                        >
                          <ThemedText
                            variant={isSelected ? 'smallBold' : 'small'}
                            color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                          >
                            {opt}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.noOptionsContainer}>
                    <ThemedText variant="caption" color={theme.colors.textMuted}>
                      {field.conditionalOptionsJson
                        ? 'Select a parent value first to view available options.'
                        : 'No options configured.'}
                    </ThemedText>
                  </View>
                )}

                {error ? (
                  <View style={styles.errorContainer}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
                    <ThemedText variant="caption" color={theme.colors.emergency}>
                      {error}
                    </ThemedText>
                  </View>
                ) : null}
              </View>
            );
          }

          default:
            return null;
        }
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.sm,
  },
  fieldWrapper: {
    marginBottom: theme.spacing.xs,
  },
  label: {
    marginBottom: theme.spacing.xs,
  },
  booleanRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  optionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  choicePill: {
    minHeight: theme.sizes.touchTarget,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceHighlight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  choicePillActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  pillDisabled: {
    opacity: 0.5,
  },
  noOptionsContainer: {
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
});
