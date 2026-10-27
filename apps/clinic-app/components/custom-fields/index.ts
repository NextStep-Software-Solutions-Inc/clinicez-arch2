export {
  default as DynamicCustomFieldsRenderer,
  isFieldVisible,
  getAvailableOptions,
  validateCustomFields,
  sanitizeCustomFieldsPayload,
  resolveEffectiveBoundaryMode,
  sanitizeNumericInput,
  isValidCustomNumber,
  mergeCustomFieldsForUpdate,
  parseBooleanState,
  parseBooleanValue,
} from './DynamicCustomFieldsRenderer';
export type {
  DynamicCustomFieldsRendererProps,
  StaticPatientValues,
  MergeCustomFieldsOptions,
} from './DynamicCustomFieldsRenderer';
export * from './customFields.types';
