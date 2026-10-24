import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Input from '../ui/Input';
import ValidatedDateInput, { validateDateString } from '../ui/ValidatedDateInput';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import type {
  ClinicCustomFieldDefinition,
  BoundaryMode,
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
 * Resolves the effective boundary mode for a custom Date field:
 * - If field.boundaryMode is configured, uses it.
 * - If field.category (case-insensitive) is 'Clinical', defaults to 'pastOrToday'.
 * - Otherwise defaults to 'any'.
 */
export function resolveEffectiveBoundaryMode(
  field: Pick<ClinicCustomFieldDefinition, 'boundaryMode' | 'category'>
): BoundaryMode {
  if (field.boundaryMode) {
    return field.boundaryMode;
  }
  if (field.category && field.category.trim().toLowerCase() === 'clinical') {
    return 'pastOrToday';
  }
  return 'any';
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
 * Validates custom fields: enforces isRequired only on currently VISIBLE fields.
 * Validates Date fields for calendar validity and boundary constraints.
 * Hidden fields never block validation.
 */
export function validateCustomFields(
  definitions: ClinicCustomFieldDefinition[],
  values: Record<string, any>,
  staticValues: StaticPatientValues = {},
  options?: { now?: Date }
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

    if (def.dataType === 'Date' && !isEmpty) {
      const boundaryMode = resolveEffectiveBoundaryMode(def);
      const res = validateDateString(String(val).trim(), {
        boundaryMode,
        now: options?.now,
      });

      if (!res.isValid) {
        errors[def.fieldKey] = `${def.label}: ${res.errorMessage || 'Invalid date'}`;
        isValid = false;
      }
    }
  }

  return { isValid, errors };
}

/**
 * Sanitizes submission payload by stripping keys of all currently hidden fields and empty strings.
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

  for (const [k, v] of Object.entries(values)) {
    if (visibleKeys.has(k) && v !== null && v !== undefined && v !== '') {
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
        const error = errors[field.fieldKey];
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

          case 'Number':
            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <Input
                  label={field.label}
                  required={field.isRequired}
                  keyboardType="numeric"
                  placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                  value={val !== undefined && val !== null ? String(val) : ''}
                  onChangeText={(text) => handleFieldChange(field.fieldKey, text)}
                  error={error}
                  editable={!disabled}
                />
              </View>
            );

          case 'Date': {
            const effectiveBoundaryMode = resolveEffectiveBoundaryMode(field);
            return (
              <View key={field.id || field.fieldKey} style={styles.fieldWrapper}>
                <ValidatedDateInput
                  label={field.label}
                  required={field.isRequired}
                  placeholder={field.placeholder || 'YYYY-MM-DD'}
                  value={val !== undefined && val !== null ? String(val) : ''}
                  onChangeText={(text) => handleFieldChange(field.fieldKey, text)}
                  error={error}
                  boundaryMode={effectiveBoundaryMode}
                  disabled={disabled}
                />
              </View>
            );
          }

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
