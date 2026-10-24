export type BoundaryMode = 'pastOrToday' | 'futureOrToday' | 'futureOnly' | 'any';

export type CustomFieldDataType = 'Text' | 'Number' | 'Date' | 'Select' | 'Boolean';

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  clinicId: string;
  entityType: string;
  fieldKey: string;
  label: string;
  dataType: CustomFieldDataType;
  category?: string;
  isRequired: boolean;
  displayOrder: number;
  optionsJson?: string;
  placeholder?: string;
  isActive: boolean;
  createdAt?: string;
  visibilityRuleJson?: string;
  conditionalOptionsJson?: string;
  boundaryMode?: BoundaryMode | null;
}

export type ClinicCustomFieldDefinition = CustomFieldDefinition;

export interface CreateCustomFieldInput {
  entityType?: string;
  fieldKey: string;
  label: string;
  dataType: CustomFieldDataType;
  category?: string;
  isRequired?: boolean;
  displayOrder?: number;
  optionsJson?: string;
  placeholder?: string;
  visibilityRuleJson?: string;
  conditionalOptionsJson?: string;
  boundaryMode?: BoundaryMode | null;
}

export interface UpdateCustomFieldInput extends Partial<CreateCustomFieldInput> {
  isActive?: boolean;
}
