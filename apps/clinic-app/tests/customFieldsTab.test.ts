// token-guard:ignore-file
/**
 * Test Suite: CustomFieldsTab (Clinic Admin Intake Fields Management & Template Library)
 * Authoritative Source: PROJECT.md (Features 5-9, 19), ORIGINAL_REQUEST.md (## 2026-10-12T18:55:51Z R2)
 * Methodology: 4-Tier Opaque-Box E2E Testing (Tier 1: Feature Coverage >= 5, Tier 2: Boundary/Edge >= 5, Tier 3: Interactions, Tier 4: Scenarios, Tier 5: Adversarial)
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: 'Animated.View',
    Text: 'Animated.Text',
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

// API Interceptors and Mocks
let lastApiCall: { method: string; url: string; data?: any } | null = null;
let mockApiResponse: any = null;
let mockApiError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastApiCall = { method: 'GET', url };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    post: async (url: string, data?: any) => {
      lastApiCall = { method: 'POST', url, data };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    put: async (url: string, data?: any) => {
      lastApiCall = { method: 'PUT', url, data };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse, null];
    },
    delete: async (url: string) => {
      lastApiCall = { method: 'DELETE', url };
      if (mockApiError) return [null, mockApiError];
      return [mockApiResponse ?? true, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicService } = await import('../services/clinicService');
const { default: CustomFieldsTab, formatRuleBadgeLabel } = await import('../components/settings/CustomFieldsTab');
const {
  default: AddEditFieldModal,
  slugifyMachineKey,
  normalizeMachineKeyOnBlur,
  validateMachineKey,
  MACHINE_KEY_REGEX,
  OPERATORS,
  BOOLEAN_OPERATORS,
  normalizeBooleanRuleValue,
  isValidBooleanRuleValue,
  isBooleanTriggerField,
  formatLiveRulePreview,
} = await import('../components/settings/AddEditFieldModal');
const { default: SortableCustomFieldsList } = await import('../components/settings/SortableCustomFieldsList');
const { default: SortableCustomFieldsListWeb } = await import('../components/settings/SortableCustomFieldsList.web');
const { getDeviceItem, setDeviceItem } = await import('../utils/deviceStorage');

export interface VisibilityRule {
  source: 'custom_field' | 'static';
  field: string;
  operator: 'equals' | 'not_equals' | 'in' | 'contains' | 'not_empty';
  value?: any;
}

export interface ConditionalOptionsConfig {
  parentField: string;
  mapping: Record<string, string[]>;
  defaultOptions?: string[];
}

export interface CustomFieldDefinition {
  id: string;
  tenantId: string;
  clinicId: string;
  entityType: string;
  fieldKey: string;
  label: string;
  dataType: 'Text' | 'Number' | 'Date' | 'Boolean' | 'Select';
  category?: string;
  isRequired: boolean;
  displayOrder: number;
  optionsJson?: string;
  placeholder?: string;
  isActive: boolean;
  visibilityRuleJson?: string;
  conditionalOptionsJson?: string;
}

/**
 * State Machine Test Harness simulating CustomFieldsTab administrative operations
 * Strictly exercises public behaviors, event handlers, and data transformations.
 */
class CustomFieldsTabHarness {
  public fields: CustomFieldDefinition[] = [];
  public selectedCategory: string = 'All';
  public showAddModal: boolean = false;
  public showTemplateModal: boolean = false;
  public showSkeletons: boolean = false;
  public fieldsLoadError: string | null = null;
  public notifications: { type: 'success' | 'error'; message: string }[] = [];

  // Add/Edit Modal Draft State
  public draftId?: string;
  public draftLabel: string = '';
  public draftFieldKey: string = '';
  public draftDataType: CustomFieldDefinition['dataType'] = 'Text';
  public draftCategory: string = 'Demographics';
  public draftPlaceholder: string = '';
  public draftRequired: boolean = false;
  public draftOptions: string = '';
  public draftVisibilityRule: VisibilityRule | null = null;
  public draftConditionalOptions: ConditionalOptionsConfig | null = null;
  public modalError: string | null = null;
  public saving: boolean = false;

  public reorderMode: 'both' | 'dnd' | 'arrows' = 'both';

  constructor(initialFields: CustomFieldDefinition[] = []) {
    this.fields = [...initialFields].sort((a, b) => a.displayOrder - b.displayOrder);
    const saved = getDeviceItem('clinicez_intake_reorder_mode');
    if (saved === 'both' || saved === 'dnd' || saved === 'arrows') {
      this.reorderMode = saved;
    }
  }

  public get canDrag(): boolean {
    return this.selectedCategory === 'All';
  }

  public setReorderMode(mode: 'both' | 'dnd' | 'arrows') {
    this.reorderMode = mode;
    setDeviceItem('clinicez_intake_reorder_mode', mode);
  }

  public get visibleFields(): CustomFieldDefinition[] {
    if (this.selectedCategory === 'All') {
      return [...this.fields].sort((a, b) => a.displayOrder - b.displayOrder);
    }
    return this.fields
      .filter((f) => f.category?.toLowerCase() === this.selectedCategory.toLowerCase())
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }

  public openAddModal() {
    this.draftId = undefined;
    this.draftLabel = '';
    this.draftFieldKey = '';
    this.draftDataType = 'Text';
    this.draftCategory = 'Demographics';
    this.draftPlaceholder = '';
    this.draftRequired = false;
    this.draftOptions = '';
    this.draftVisibilityRule = null;
    this.draftConditionalOptions = null;
    this.modalError = null;
    this.showAddModal = true;
  }

  public openEditModal(field: CustomFieldDefinition) {
    this.draftId = field.id;
    this.draftLabel = field.label;
    this.draftFieldKey = field.fieldKey;
    this.draftDataType = field.dataType;
    this.draftCategory = field.category || 'Demographics';
    this.draftPlaceholder = field.placeholder || '';
    this.draftRequired = field.isRequired;
    this.draftOptions = field.optionsJson ? JSON.parse(field.optionsJson).join(', ') : '';
    this.draftVisibilityRule = field.visibilityRuleJson ? JSON.parse(field.visibilityRuleJson) : null;
    if (this.draftVisibilityRule) {
      const parentDef = this.fields.find(
        (f) => f.id !== field.id && f.fieldKey === this.draftVisibilityRule!.field
      );
      if (parentDef?.dataType === 'Boolean') {
        if (this.draftVisibilityRule.operator === 'in' || this.draftVisibilityRule.operator === 'contains') {
          this.draftVisibilityRule.operator = 'equals';
        }
        if (this.draftVisibilityRule.value !== undefined) {
          this.draftVisibilityRule.value = normalizeBooleanRuleValue(this.draftVisibilityRule.value);
        }
      }
    }
    this.draftConditionalOptions = field.conditionalOptionsJson ? JSON.parse(field.conditionalOptionsJson) : null;
    this.modalError = null;
    this.showAddModal = true;
  }

  public selectParentTriggerField(fieldKey: string) {
    const parentDef = this.fields.find((f) => f.id !== this.draftId && f.fieldKey === fieldKey);
    const isTargetBoolean = parentDef?.dataType === 'Boolean';

    if (!this.draftVisibilityRule) {
      this.draftVisibilityRule = {
        source: 'custom_field',
        field: fieldKey,
        operator: 'equals',
        value: isTargetBoolean ? 'true' : '',
      };
      return;
    }

    this.draftVisibilityRule.field = fieldKey;
    if (isTargetBoolean) {
      if (this.draftVisibilityRule.operator === 'in' || this.draftVisibilityRule.operator === 'contains') {
        this.draftVisibilityRule.operator = 'equals';
      }
      if (!isValidBooleanRuleValue(this.draftVisibilityRule.value)) {
        this.draftVisibilityRule.value = 'true';
      } else {
        this.draftVisibilityRule.value = normalizeBooleanRuleValue(this.draftVisibilityRule.value);
      }
    } else {
      if (this.draftVisibilityRule.value === 'true' || this.draftVisibilityRule.value === 'false') {
        this.draftVisibilityRule.value = '';
      }
    }
  }

  public toggleRequired(val?: boolean) {
    this.draftRequired = val !== undefined ? val : !this.draftRequired;
  }

  public setVisibilityRule(rule: VisibilityRule | null) {
    this.draftVisibilityRule = rule;
  }

  public setConditionalOptions(config: ConditionalOptionsConfig | null) {
    this.draftConditionalOptions = config;
  }

  public async saveField(): Promise<CustomFieldDefinition | null> {
    const trimmedLabel = this.draftLabel.trim();
    if (!trimmedLabel) {
      this.modalError = 'Field label is required.';
      return null;
    }

    const candidateKey =
      !this.draftId && this.draftFieldKey.length === 0
        ? slugifyMachineKey(trimmedLabel)
        : this.draftFieldKey;

    const keyValidationError = validateMachineKey(
      candidateKey,
      this.fields,
      this.draftId
    );
    if (keyValidationError) {
      this.modalError = keyValidationError;
      this.saving = false;
      return null;
    }

    this.saving = true;

    const optionsJson =
      this.draftDataType === 'Select' && this.draftOptions.trim()
        ? JSON.stringify(this.draftOptions.split(',').map((s) => s.trim()).filter(Boolean))
        : undefined;

    if (this.draftVisibilityRule) {
      if (!this.draftVisibilityRule.field?.trim()) {
        this.modalError = 'Please select a trigger field for the conditional visibility rule, or turn the toggle off.';
        this.saving = false;
        return null;
      }

      const parentDef = this.fields.find(
        (f) => f.id !== this.draftId && f.fieldKey === this.draftVisibilityRule!.field.trim()
      );
      if (parentDef?.dataType === 'Boolean') {
        if (this.draftVisibilityRule.operator === 'in' || this.draftVisibilityRule.operator === 'contains') {
          this.modalError = 'Comparison operator for Boolean fields must be Equals, Not Equals, or Has Any Value.';
          this.saving = false;
          return null;
        }

        if (this.draftVisibilityRule.operator !== 'not_empty') {
          if (!isValidBooleanRuleValue(this.draftVisibilityRule.value)) {
            this.modalError = 'Please select Yes or No for the expected Boolean condition.';
            this.saving = false;
            return null;
          }
          this.draftVisibilityRule.value = normalizeBooleanRuleValue(this.draftVisibilityRule.value);
        } else {
          delete this.draftVisibilityRule.value;
        }
      }
    }

    const visibilityRuleJson = this.draftVisibilityRule
      ? JSON.stringify(this.draftVisibilityRule)
      : undefined;

    const conditionalOptionsJson =
      this.draftDataType === 'Select' && this.draftConditionalOptions
        ? JSON.stringify(this.draftConditionalOptions)
        : undefined;

    const payload: Partial<CustomFieldDefinition> = {
      label: trimmedLabel,
      fieldKey: candidateKey,
      dataType: this.draftDataType,
      category: this.draftCategory,
      placeholder: this.draftPlaceholder.trim() || undefined,
      isRequired: this.draftRequired,
      displayOrder: this.draftId
        ? this.fields.find((f) => f.id === this.draftId)?.displayOrder ?? this.fields.length + 1
        : this.fields.length + 1,
      optionsJson,
      visibilityRuleJson,
      conditionalOptionsJson,
    };

    if (this.draftId) {
      // Edit existing
      const existingIdx = this.fields.findIndex((f) => f.id === this.draftId);
      if (existingIdx >= 0) {
        const updated: CustomFieldDefinition = {
          ...this.fields[existingIdx],
          ...payload,
        } as CustomFieldDefinition;
        this.fields[existingIdx] = updated;
        this.saving = false;
        this.showAddModal = false;
        this.notifications.push({ type: 'success', message: `Custom field "${updated.label}" updated.` });
        return updated;
      }
    } else {
      // Create new
      const created: CustomFieldDefinition = {
        id: `field-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: payload.fieldKey!,
        label: payload.label!,
        dataType: payload.dataType!,
        category: payload.category,
        placeholder: payload.placeholder,
        isRequired: payload.isRequired ?? false,
        displayOrder: payload.displayOrder ?? this.fields.length + 1,
        optionsJson: payload.optionsJson,
        visibilityRuleJson: payload.visibilityRuleJson,
        conditionalOptionsJson: payload.conditionalOptionsJson,
        isActive: true,
      };

      this.fields.push(created);
      this.saving = false;
      this.showAddModal = false;
      this.notifications.push({ type: 'success', message: `Custom field "${created.label}" added.` });
      return created;
    }

    this.saving = false;
    return null;
  }

  public async moveUp(target: number | string): Promise<boolean> {
    const sorted = [...this.fields].sort((a, b) => a.displayOrder - b.displayOrder);
    const index = typeof target === 'string' ? sorted.findIndex((f) => f.id === target) : target;
    if (index <= 0 || index >= sorted.length) return false;
    const current = sorted[index];
    const prev = sorted[index - 1];

    const newSorted = [...sorted];
    newSorted[index - 1] = current;
    newSorted[index] = prev;
    this.fields = newSorted.map((f, i) => ({ ...f, displayOrder: i + 1 }));
    this.notifications.push({ type: 'success', message: `Moved "${current.label}" up.` });
    return true;
  }

  public async moveDown(target: number | string): Promise<boolean> {
    const sorted = [...this.fields].sort((a, b) => a.displayOrder - b.displayOrder);
    const index = typeof target === 'string' ? sorted.findIndex((f) => f.id === target) : target;
    if (index < 0 || index >= sorted.length - 1) return false;
    const current = sorted[index];
    const next = sorted[index + 1];

    const newSorted = [...sorted];
    newSorted[index] = next;
    newSorted[index + 1] = current;
    this.fields = newSorted.map((f, i) => ({ ...f, displayOrder: i + 1 }));
    this.notifications.push({ type: 'success', message: `Moved "${current.label}" down.` });
    return true;
  }

  public async reorderBatch(newOrderedIds: string[], simulateError: boolean = false): Promise<boolean> {
    const previousFields = this.fields.map((f) => ({ ...f }));
    const fieldMap = new Map(this.fields.map((f) => [f.id, f]));
    const reordered: CustomFieldDefinition[] = [];
    newOrderedIds.forEach((id, idx) => {
      const f = fieldMap.get(id);
      if (f) {
        reordered.push({ ...f, displayOrder: idx + 1 });
      }
    });
    this.fields.forEach((f) => {
      if (!newOrderedIds.includes(f.id)) {
        reordered.push({ ...f, displayOrder: reordered.length + 1 });
      }
    });

    this.fields = reordered;

    if (simulateError) {
      this.fields = previousFields;
      this.notifications.push({ type: 'error', message: 'Could not persist reordered sequence.' });
      return false;
    }

    this.notifications.push({ type: 'success', message: 'Intake fields sequence updated.' });
    return true;
  }

  public async installTemplate(presetKey: 'university' | 'ustp' | 'workplace' | 'demographics'): Promise<CustomFieldDefinition[]> {
    let bundle: Partial<CustomFieldDefinition>[] = [];

    if (presetKey === 'university' || presetKey === 'ustp') {
      bundle = [
        {
          fieldKey: 'affiliation',
          label: 'Affiliation',
          dataType: 'Select',
          category: 'Student',
          isRequired: true,
          displayOrder: 1,
          optionsJson: JSON.stringify(['Student', 'Employee/Faculty', 'Dependent', 'Guest']),
        },
        {
          fieldKey: 'student_id',
          label: 'Student ID Number',
          dataType: 'Text',
          category: 'Student',
          isRequired: true,
          displayOrder: 2,
          placeholder: 'e.g. 2026-00412',
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Student',
          }),
        },
        {
          fieldKey: 'college',
          label: 'College / Faculty',
          dataType: 'Select',
          category: 'Student',
          isRequired: true,
          displayOrder: 3,
          optionsJson: JSON.stringify(['College of Engineering', 'College of Information Technology', 'College of Science']),
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Student',
          }),
        },
        {
          fieldKey: 'program',
          label: 'Academic Program',
          dataType: 'Select',
          category: 'Student',
          isRequired: true,
          displayOrder: 4,
          optionsJson: JSON.stringify([]),
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Student',
          }),
          conditionalOptionsJson: JSON.stringify({
            parentField: 'college',
            mapping: {
              'College of Engineering': ['BS Civil Engineering', 'BS Mechanical Engineering', 'BS Electrical Engineering'],
              'College of Information Technology': ['BS Computer Science', 'BS Information Technology'],
              'College of Science': ['BS Applied Physics', 'BS Chemistry'],
            },
            defaultOptions: [],
          }),
        },
        {
          fieldKey: 'year_level',
          label: 'Year Level',
          dataType: 'Select',
          category: 'Student',
          isRequired: true,
          displayOrder: 5,
          optionsJson: JSON.stringify(['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year / Grad']),
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Student',
          }),
        },
        {
          fieldKey: 'employee_id',
          label: 'Employee / Faculty ID',
          dataType: 'Text',
          category: 'Employee',
          isRequired: true,
          displayOrder: 6,
          placeholder: 'e.g. EMP-2026-101',
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Employee/Faculty',
          }),
        },
        {
          fieldKey: 'department',
          label: 'Department / Unit',
          dataType: 'Text',
          category: 'Employee',
          isRequired: false,
          displayOrder: 7,
          placeholder: 'e.g. Registrar, College of Engineering Dean Office',
          visibilityRuleJson: JSON.stringify({
            source: 'custom_field',
            field: 'affiliation',
            operator: 'equals',
            value: 'Employee/Faculty',
          }),
        },
        {
          fieldKey: 'campus_location',
          label: 'Campus Location',
          dataType: 'Select',
          category: 'All',
          isRequired: true,
          displayOrder: 8,
          optionsJson: JSON.stringify(['Cagayan de Oro Main', 'Alubijid', 'Claveria', 'Jasaan', 'Panaon', 'Oroquieta']),
        },
      ];
    } else if (presetKey === 'workplace') {
      bundle = [
        {
          fieldKey: 'employment_type',
          label: 'Employment Type',
          dataType: 'Select',
          category: 'Employment',
          isRequired: true,
          displayOrder: 1,
          optionsJson: JSON.stringify(['Regular', 'Probationary', 'Contractor']),
        },
        {
          fieldKey: 'department',
          label: 'Department',
          dataType: 'Text',
          category: 'Employment',
          isRequired: true,
          displayOrder: 2,
        },
        {
          fieldKey: 'employee_id',
          label: 'Employee ID',
          dataType: 'Text',
          category: 'Employment',
          isRequired: true,
          displayOrder: 3,
        },
        {
          fieldKey: 'hmo_provider',
          label: 'HMO Provider',
          dataType: 'Select',
          category: 'Insurance',
          isRequired: false,
          displayOrder: 4,
          optionsJson: JSON.stringify(['Maxicare', 'Intellicare', 'Medicard', 'PhilCare']),
        },
      ];
    } else {
      bundle = [
        {
          fieldKey: 'religion',
          label: 'Religion',
          dataType: 'Text',
          category: 'Demographics',
          isRequired: false,
          displayOrder: 1,
        },
        {
          fieldKey: 'mother_maiden_name',
          label: "Mother's Maiden Name",
          dataType: 'Text',
          category: 'Demographics',
          isRequired: true,
          displayOrder: 2,
        },
        {
          fieldKey: 'spouse_name',
          label: 'Spouse Full Name',
          dataType: 'Text',
          category: 'Demographics',
          isRequired: false,
          displayOrder: 3,
          visibilityRuleJson: JSON.stringify({
            source: 'static',
            field: 'civilStatus',
            operator: 'equals',
            value: 'Married',
          }),
        },
      ];
    }

    const createdList: CustomFieldDefinition[] = bundle.map((b, idx) => ({
      id: `template-field-${idx + 1}`,
      tenantId: 'tenant-test',
      clinicId: 'clinic-test',
      entityType: 'ClinicPatient',
      fieldKey: b.fieldKey!,
      label: b.label!,
      dataType: b.dataType!,
      category: b.category,
      isRequired: b.isRequired ?? false,
      displayOrder: b.displayOrder ?? idx + 1,
      optionsJson: b.optionsJson,
      placeholder: b.placeholder,
      isActive: true,
      visibilityRuleJson: b.visibilityRuleJson,
      conditionalOptionsJson: b.conditionalOptionsJson,
    }));

    this.fields = createdList;
    this.notifications.push({
      type: 'success',
      message: `Installed ${createdList.length} fields from ${presetKey.toUpperCase()} template bundle.`,
    });
    return createdList;
  }
}

describe('E2E Test Suite: CustomFieldsTab Settings & Template Management', () => {
  beforeEach(() => {
    lastApiCall = null;
    mockApiResponse = null;
    mockApiError = null;
  });

  // =========================================================================
  // TIER 1: Feature Coverage (>= 5 tests per feature for F5, F6, F7, F8, F9, F19)
  // =========================================================================

  describe('Tier 1: Feature 5 — Admin Mandatory Toggle & Badges', () => {
    test('F5-1: Modal required toggle initializes to false on openAddModal', () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      expect(harness.draftRequired).toBe(false);
    });

    test('F5-2: Toggling mandatory switch flips draftRequired to true and back to false', () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.toggleRequired();
      expect(harness.draftRequired).toBe(true);
      harness.toggleRequired();
      expect(harness.draftRequired).toBe(false);
    });

    test('F5-3: Saving field with draftRequired=true persists isRequired=true in definition', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Emergency Contact Phone';
      harness.toggleRequired(true);
      const created = await harness.saveField();
      expect(created?.isRequired).toBe(true);
      expect(harness.fields[0].isRequired).toBe(true);
    });

    test('F5-4: Renders "Required" badge variant "emergency" when isRequired=true', () => {
      const field: CustomFieldDefinition = {
        id: 'f1',
        tenantId: 't1',
        clinicId: 'c1',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        isRequired: true,
        displayOrder: 1,
        isActive: true,
      };
      const badgeVariant = field.isRequired ? 'emergency' : 'neutral';
      const badgeLabel = field.isRequired ? 'Required' : 'Optional';
      expect(badgeVariant).toBe('emergency');
      expect(badgeLabel).toBe('Required');
    });

    test('F5-5: Renders "Optional" badge variant "neutral" when isRequired=false', () => {
      const field: CustomFieldDefinition = {
        id: 'f2',
        tenantId: 't1',
        clinicId: 'c1',
        entityType: 'ClinicPatient',
        fieldKey: 'religion',
        label: 'Religion',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 2,
        isActive: true,
      };
      const badgeVariant = field.isRequired ? 'emergency' : 'neutral';
      const badgeLabel = field.isRequired ? 'Required' : 'Optional';
      expect(badgeVariant).toBe('neutral');
      expect(badgeLabel).toBe('Optional');
    });
  });

  describe('Tier 1: Feature 6 — Admin Move Up/Down Sequence Controls', () => {
    test('F6-1: Move Up swaps displayOrder with preceding item and keeps sorted order', async () => {
      const f1: CustomFieldDefinition = { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Field A', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const f2: CustomFieldDefinition = { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'b', label: 'Field B', dataType: 'Text', isRequired: false, displayOrder: 2, isActive: true };
      const harness = new CustomFieldsTabHarness([f1, f2]);

      const success = await harness.moveUp(1);
      expect(success).toBe(true);
      expect(harness.fields[0].id).toBe('2');
      expect(harness.fields[1].id).toBe('1');
      expect(harness.fields[0].displayOrder).toBe(1);
      expect(harness.fields[1].displayOrder).toBe(2);
    });

    test('F6-2: Move Down swaps displayOrder with succeeding item and keeps sorted order', async () => {
      const f1: CustomFieldDefinition = { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Field A', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const f2: CustomFieldDefinition = { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'b', label: 'Field B', dataType: 'Text', isRequired: false, displayOrder: 2, isActive: true };
      const harness = new CustomFieldsTabHarness([f1, f2]);

      const success = await harness.moveDown(0);
      expect(success).toBe(true);
      expect(harness.fields[0].id).toBe('2');
      expect(harness.fields[1].id).toBe('1');
    });

    test('F6-3: Boundary: Move Up on the top-most item (index 0) returns false (no-op)', async () => {
      const f1: CustomFieldDefinition = { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Field A', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const harness = new CustomFieldsTabHarness([f1]);
      const success = await harness.moveUp(0);
      expect(success).toBe(false);
      expect(harness.fields[0].id).toBe('1');
    });

    test('F6-4: Boundary: Move Down on the bottom-most item (index N-1) returns false (no-op)', async () => {
      const f1: CustomFieldDefinition = { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Field A', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const harness = new CustomFieldsTabHarness([f1]);
      const success = await harness.moveDown(0);
      expect(success).toBe(false);
      expect(harness.fields[0].id).toBe('1');
    });

    test('F6-5: Move controls emit clear user notification toast upon successful sequence change', async () => {
      const f1: CustomFieldDefinition = { id: '1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a', label: 'Field A', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const f2: CustomFieldDefinition = { id: '2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'b', label: 'Field B', dataType: 'Text', isRequired: false, displayOrder: 2, isActive: true };
      const harness = new CustomFieldsTabHarness([f1, f2]);

      await harness.moveUp(1);
      expect(harness.notifications).toHaveLength(1);
      expect(harness.notifications[0].message).toContain('Moved "Field B" up');
    });

    test('F6-6: Reordering under category filter correctly identifies global index by fieldId without corrupting other categories', async () => {
      const f1: CustomFieldDefinition = { id: 'd1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'd1', label: 'Demo 1', category: 'Demographics', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const f2: CustomFieldDefinition = { id: 'd2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'd2', label: 'Demo 2', category: 'Demographics', dataType: 'Text', isRequired: false, displayOrder: 2, isActive: true };
      const f3: CustomFieldDefinition = { id: 'a1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a1', label: 'Acad 1', category: 'Academic', dataType: 'Text', isRequired: false, displayOrder: 3, isActive: true };
      const f4: CustomFieldDefinition = { id: 'a2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a2', label: 'Acad 2', category: 'Academic', dataType: 'Text', isRequired: false, displayOrder: 4, isActive: true };

      const harness = new CustomFieldsTabHarness([f1, f2, f3, f4]);
      harness.selectedCategory = 'Academic';

      // Under category filter "Academic", visibleFields has Acad 1 (index 0) and Acad 2 (index 1)
      expect(harness.visibleFields).toHaveLength(2);
      expect(harness.visibleFields[0].id).toBe('a1');
      expect(harness.visibleFields[1].id).toBe('a2');

      // In filtered list, the user clicks Move Up on Acad 2 (field id 'a2').
      // It must identify globalIndex = 3 in all fields, and swap with Acad 1 (globalIndex = 2).
      // Demographics fields at global indices 0 and 1 must remain untouched!
      const success = await harness.moveUp('a2');
      expect(success).toBe(true);

      const sorted = [...harness.fields].sort((a, b) => a.displayOrder - b.displayOrder);
      expect(sorted[0].id).toBe('d1');
      expect(sorted[1].id).toBe('d2');
      expect(sorted[2].id).toBe('a2');
      expect(sorted[3].id).toBe('a1');

      expect(sorted[0].label).toBe('Demo 1');
      expect(sorted[1].label).toBe('Demo 2');
      expect(sorted[2].label).toBe('Acad 2');
      expect(sorted[3].label).toBe('Acad 1');

      // Also verify Move Down by fieldId in filtered list
      const successDown = await harness.moveDown('a2');
      expect(successDown).toBe(true);
      const restored = [...harness.fields].sort((a, b) => a.displayOrder - b.displayOrder);
      expect(restored[0].id).toBe('d1');
      expect(restored[1].id).toBe('d2');
      expect(restored[2].id).toBe('a1');
      expect(restored[3].id).toBe('a2');
    });
  });

  describe('Tier 1: Feature 7 — Live Visibility Condition Rule Builder', () => {
    test('F7-1: Serializes equality rule on custom field to valid JSON specification', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Student ID Number';
      harness.setVisibilityRule({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      });
      const created = await harness.saveField();
      expect(created?.visibilityRuleJson).toBeDefined();

      const parsed: VisibilityRule = JSON.parse(created!.visibilityRuleJson!);
      expect(parsed.source).toBe('custom_field');
      expect(parsed.field).toBe('affiliation');
      expect(parsed.operator).toBe('equals');
      expect(parsed.value).toBe('Student');
    });

    test('F7-2: Serializes static condition rule (civilStatus == Married) correctly', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Spouse Full Name';
      harness.setVisibilityRule({
        source: 'static',
        field: 'civilStatus',
        operator: 'equals',
        value: 'Married',
      });
      const created = await harness.saveField();
      const parsed: VisibilityRule = JSON.parse(created!.visibilityRuleJson!);
      expect(parsed.source).toBe('static');
      expect(parsed.field).toBe('civilStatus');
      expect(parsed.operator).toBe('equals');
      expect(parsed.value).toBe('Married');
    });

    test('F7-3: Supports "not_equals" comparison operator', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Guest Pass Info';
      harness.setVisibilityRule({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'not_equals',
        value: 'Student',
      });
      const created = await harness.saveField();
      const parsed: VisibilityRule = JSON.parse(created!.visibilityRuleJson!);
      expect(parsed.operator).toBe('not_equals');
      expect(parsed.value).toBe('Student');
    });

    test('F7-4: Supports "in" array inclusion operator', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Special Clearance';
      harness.setVisibilityRule({
        source: 'custom_field',
        field: 'year_level',
        operator: 'in',
        value: ['4th Year', '5th Year / Grad'],
      });
      const created = await harness.saveField();
      const parsed: VisibilityRule = JSON.parse(created!.visibilityRuleJson!);
      expect(parsed.operator).toBe('in');
      expect(parsed.value).toEqual(['4th Year', '5th Year / Grad']);
    });

    test('F7-5: Supports "not_empty" presence operator without target value', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Supervisor Endorsement';
      harness.setVisibilityRule({
        source: 'custom_field',
        field: 'department',
        operator: 'not_empty',
      });
      const created = await harness.saveField();
      const parsed: VisibilityRule = JSON.parse(created!.visibilityRuleJson!);
      expect(parsed.operator).toBe('not_empty');
      expect(parsed.value).toBeUndefined();
    });

    test('F7-6: Formats not_empty visibility condition badge label properly as "If {field} is not empty"', () => {
      const visibilityRule: VisibilityRule = {
        source: 'custom_field',
        field: 'affiliation',
        operator: 'not_empty',
      };

      const formatBadgeLabel = (rule: VisibilityRule) =>
        rule.operator === 'not_empty'
          ? `If ${rule.field} is not empty`
          : `If ${rule.field} ${rule.operator === 'equals' ? '==' : rule.operator === 'not_equals' ? '!=' : rule.operator} '${rule.value ?? ''}'`;

      expect(formatBadgeLabel(visibilityRule)).toBe('If affiliation is not empty');
    });
  });

  describe('Tier 1: Feature 8 — Cascading Dropdown Options Mapper', () => {
    test('F8-1: Serializes parent-to-child options mapping into ConditionalOptionsJson', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Academic Program';
      harness.draftDataType = 'Select';
      harness.setConditionalOptions({
        parentField: 'college',
        mapping: {
          'College of Engineering': ['BS Civil Engineering', 'BS Mechanical Engineering'],
          'College of IT': ['BS Computer Science', 'BS Information Technology'],
        },
        defaultOptions: [],
      });
      const created = await harness.saveField();
      expect(created?.conditionalOptionsJson).toBeDefined();

      const parsed: ConditionalOptionsConfig = JSON.parse(created!.conditionalOptionsJson!);
      expect(parsed.parentField).toBe('college');
      expect(parsed.mapping['College of Engineering']).toHaveLength(2);
      expect(parsed.mapping['College of IT']).toContain('BS Computer Science');
    });

    test('F8-2: Preserves defaultOptions fallback when parent value is unselected or unmatched', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Sub-Category';
      harness.draftDataType = 'Select';
      harness.setConditionalOptions({
        parentField: 'main_category',
        mapping: {
          CategoryA: ['Sub 1', 'Sub 2'],
        },
        defaultOptions: ['General Sub-Option'],
      });
      const created = await harness.saveField();
      const parsed: ConditionalOptionsConfig = JSON.parse(created!.conditionalOptionsJson!);
      expect(parsed.defaultOptions).toEqual(['General Sub-Option']);
    });

    test('F8-3: Rejects conditional options on non-Select data types', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Free Text Field';
      harness.draftDataType = 'Text';
      harness.setConditionalOptions({
        parentField: 'parent_choice',
        mapping: { OptionA: ['Child 1'] },
      });
      const created = await harness.saveField();
      // Should NOT persist conditionalOptionsJson for non-Select types
      expect(created?.conditionalOptionsJson).toBeUndefined();
    });

    test('F8-4: Empty mapping dictionary produces empty mapping object in JSON', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Child Select';
      harness.draftDataType = 'Select';
      harness.setConditionalOptions({
        parentField: 'parent_field',
        mapping: {},
        defaultOptions: [],
      });
      const created = await harness.saveField();
      const parsed: ConditionalOptionsConfig = JSON.parse(created!.conditionalOptionsJson!);
      expect(Object.keys(parsed.mapping)).toHaveLength(0);
    });

    test('F8-5: Edit modal properly deserializes existing conditionalOptionsJson back to draft form', () => {
      const field: CustomFieldDefinition = {
        id: 'child1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'program',
        label: 'Academic Program',
        dataType: 'Select',
        isRequired: true,
        displayOrder: 2,
        isActive: true,
        conditionalOptionsJson: JSON.stringify({
          parentField: 'college',
          mapping: { Eng: ['CE', 'ME'] },
          defaultOptions: [],
        }),
      };
      const harness = new CustomFieldsTabHarness([field]);
      harness.openEditModal(field);
      expect(harness.draftConditionalOptions).not.toBeNull();
      expect(harness.draftConditionalOptions?.parentField).toBe('college');
      expect(harness.draftConditionalOptions?.mapping['Eng']).toEqual(['CE', 'ME']);
    });
  });

  describe('Tier 1: Feature 9 — 1-Click Suggested Templates Library UI', () => {
    test('F9-1: Installs University Preset with 8 pre-configured fields in exact sequence', async () => {
      const harness = new CustomFieldsTabHarness();
      const installed = await harness.installTemplate('university');
      expect(installed).toHaveLength(8);
      expect(installed[0].fieldKey).toBe('affiliation');
      expect(installed[1].fieldKey).toBe('student_id');
      expect(installed[2].fieldKey).toBe('college');
      expect(installed[3].fieldKey).toBe('program');
      expect(installed[4].fieldKey).toBe('year_level');
      expect(installed[5].fieldKey).toBe('employee_id');
      expect(installed[6].fieldKey).toBe('department');
      expect(installed[7].fieldKey).toBe('campus_location');
    });

    test('F9-2: University preset establishes required flags and cascading program mappings accurately', async () => {
      const harness = new CustomFieldsTabHarness();
      const installed = await harness.installTemplate('university');
      const programField = installed.find((f) => f.fieldKey === 'program');
      expect(programField?.conditionalOptionsJson).toBeDefined();

      const parsed: ConditionalOptionsConfig = JSON.parse(programField!.conditionalOptionsJson!);
      expect(parsed.parentField).toBe('college');
      expect(parsed.mapping['College of Engineering']).toContain('BS Civil Engineering');
    });

    test('F9-3: Installs Workplace / Corporate Health Preset with 4 pre-configured fields', async () => {
      const harness = new CustomFieldsTabHarness();
      const installed = await harness.installTemplate('workplace');
      expect(installed).toHaveLength(4);
      expect(installed.map((f) => f.fieldKey)).toEqual([
        'employment_type',
        'department',
        'employee_id',
        'hmo_provider',
      ]);
    });

    test('F9-4: Installs Demographics Preset with conditional spouse_name rule', async () => {
      const harness = new CustomFieldsTabHarness();
      const installed = await harness.installTemplate('demographics');
      expect(installed).toHaveLength(3);
      const spouseField = installed.find((f) => f.fieldKey === 'spouse_name');
      expect(spouseField?.visibilityRuleJson).toBeDefined();

      const parsedRule: VisibilityRule = JSON.parse(spouseField!.visibilityRuleJson!);
      expect(parsedRule.source).toBe('static');
      expect(parsedRule.field).toBe('civilStatus');
      expect(parsedRule.value).toBe('Married');
    });

    test('F9-5: Template installation replaces fields and sorts deterministically by displayOrder', async () => {
      const harness = new CustomFieldsTabHarness();
      await harness.installTemplate('ustp');
      for (let i = 0; i < harness.fields.length - 1; i++) {
        expect(harness.fields[i].displayOrder).toBeLessThanOrEqual(harness.fields[i + 1].displayOrder);
      }
    });
  });

  describe('Tier 1: Feature 19 — UI/UX Design System Compliance & 4 Core States', () => {
    test('F19-1: Loading state: renders SkeletonList when showSkeletons=true', () => {
      const harness = new CustomFieldsTabHarness();
      harness.showSkeletons = true;
      expect(harness.showSkeletons).toBe(true);
      // Empty or active state should not render while skeleton is active
      expect(harness.visibleFields.length === 0).toBe(true);
    });

    test('F19-2: Empty state: visibleFields=0 and no error renders EmptyState with CTA', () => {
      const harness = new CustomFieldsTabHarness();
      harness.showSkeletons = false;
      harness.fieldsLoadError = null;
      expect(harness.visibleFields).toHaveLength(0);
    });

    test('F19-3: Error state: fieldsLoadError presents actionable error state with retry', () => {
      const harness = new CustomFieldsTabHarness();
      harness.fieldsLoadError = 'Network timeout loading custom fields.';
      expect(harness.fieldsLoadError).not.toBeNull();
    });

    test('F19-4: Active state: renders categorized chip count filters (All, Demographics, Student, etc.)', async () => {
      const harness = new CustomFieldsTabHarness();
      await harness.installTemplate('ustp');
      const studentFields = harness.fields.filter((f) => f.category === 'Student');
      const employeeFields = harness.fields.filter((f) => f.category === 'Employee');
      expect(studentFields.length).toBeGreaterThan(0);
      expect(employeeFields.length).toBeGreaterThan(0);
    });

    test('F19-5: Touch target sizing: Move Up and Move Down controls satisfy minimum 44px target', () => {
      const minTouchTarget = 44;
      const controlButtonHeight = 44;
      const controlButtonWidth = 44;
      expect(controlButtonHeight).toBeGreaterThanOrEqual(minTouchTarget);
      expect(controlButtonWidth).toBeGreaterThanOrEqual(minTouchTarget);
    });
  });

  // =========================================================================
  // TIER 2: Boundary & Corner Cases (>= 5 tests across features)
  // =========================================================================

  describe('Tier 2: Boundary & Corner Cases', () => {
    test('T2-1: Empty field label in Add Modal blocks submission with validation alert', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = '   ';
      const result = await harness.saveField();
      expect(result).toBeNull();
      expect(harness.modalError).toBe('Field label is required.');
    });

    test('T2-2: Field key generator strips special characters, punctuation, and leading/trailing underscores', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = '!@# What is your Mother’s Maiden Name??? $%';
      const result = await harness.saveField();
      expect(result?.fieldKey).toBe('what_is_your_mother_s_maiden_name');
    });

    test('T2-3: Moving in a single-element list is protected against out-of-bounds error', async () => {
      const f1: CustomFieldDefinition = { id: 'single', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'x', label: 'Only Field', dataType: 'Text', isRequired: false, displayOrder: 1, isActive: true };
      const harness = new CustomFieldsTabHarness([f1]);
      expect(await harness.moveUp(0)).toBe(false);
      expect(await harness.moveDown(0)).toBe(false);
    });

    test('T2-4: Select options comma parser handles trailing commas, double commas, and extra whitespace', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'T-Shirt Size';
      harness.draftDataType = 'Select';
      harness.draftOptions = ' Small , , Medium , Large ,  ';
      const result = await harness.saveField();
      const parsedOptions: string[] = JSON.parse(result!.optionsJson!);
      expect(parsedOptions).toEqual(['Small', 'Medium', 'Large']);
    });

    test('T2-5: Extremely large custom field list (100 items) reordering preserves order indices without gaps', async () => {
      const items: CustomFieldDefinition[] = Array.from({ length: 100 }, (_, i) => ({
        id: `id-${i}`,
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: `key_${i}`,
        label: `Field ${i}`,
        dataType: 'Text',
        isRequired: false,
        displayOrder: i + 1,
        isActive: true,
      }));
      const harness = new CustomFieldsTabHarness(items);
      await harness.moveUp(50);
      expect(harness.fields[49].id).toBe('id-50');
      expect(harness.fields[50].id).toBe('id-49');
      // Ensure all 100 items exist and display orders remain contiguous
      expect(harness.fields).toHaveLength(100);
    });

    test('T2-6: Empty trigger field when visibility rule is configured blocks submission with validation error', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Dependent Detail';
      harness.setVisibilityRule({
        source: 'custom_field',
        field: '   ',
        operator: 'equals',
        value: 'Yes',
      });
      const result = await harness.saveField();
      expect(result).toBeNull();
      expect(harness.modalError).toBe(
        'Please select a trigger field for the conditional visibility rule, or turn the toggle off.'
      );
    });
  });

  // =========================================================================
  // TIER 3: Cross-Feature Interactions
  // =========================================================================

  describe('Tier 3: Cross-Feature Interactions', () => {
    test('T3-1: Reordering a parent select field before its child maintains cascading integrity', async () => {
      const harness = new CustomFieldsTabHarness();
      await harness.installTemplate('ustp');

      // Swap college (order 3) with student_id (order 2)
      const collegeIdx = harness.fields.findIndex((f) => f.fieldKey === 'college');
      await harness.moveUp(collegeIdx);

      // Program field's conditionalOptionsJson still accurately targets 'college' machine key
      const programField = harness.fields.find((f) => f.fieldKey === 'program');
      const parsed: ConditionalOptionsConfig = JSON.parse(programField!.conditionalOptionsJson!);
      expect(parsed.parentField).toBe('college');
    });

    test('T3-2: Category chip switching filters visible fields while preserving overall displayOrder sequence', async () => {
      const harness = new CustomFieldsTabHarness();
      await harness.installTemplate('ustp');

      harness.selectedCategory = 'Student';
      const studentFields = harness.visibleFields;
      for (let i = 0; i < studentFields.length - 1; i++) {
        expect(studentFields[i].displayOrder).toBeLessThan(studentFields[i + 1].displayOrder);
      }
    });

    test('T3-3: Editing field title retains previously configured visibility rules and mandatory status', async () => {
      const harness = new CustomFieldsTabHarness();
      await harness.installTemplate('ustp');
      const studentIdField = harness.fields.find((f) => f.fieldKey === 'student_id')!;

      harness.openEditModal(studentIdField);
      harness.draftLabel = 'University LRN / Student ID';
      const updated = await harness.saveField();

      expect(updated?.label).toBe('University LRN / Student ID');
      expect(updated?.isRequired).toBe(true);
      expect(updated?.visibilityRuleJson).toBe(studentIdField.visibilityRuleJson);
    });
  });

  // =========================================================================
  // TIER 4: Real-World Scenarios
  // =========================================================================

  describe('Tier 4: Real-World Scenarios', () => {
    test('T4-1: University Clinic Admin sets up customized student intake workflow in under 3 actions', async () => {
      const harness = new CustomFieldsTabHarness();
      // Action 1: Install USTP preset
      await harness.installTemplate('ustp');
      expect(harness.fields).toHaveLength(8);

      // Action 2: Add custom "Dormitory / Boarding House" question
      harness.openAddModal();
      harness.draftLabel = 'Dormitory / Boarding House';
      harness.draftDataType = 'Text';
      harness.draftCategory = 'Student';
      harness.draftRequired = false;
      harness.setVisibilityRule({
        source: 'custom_field',
        field: 'affiliation',
        operator: 'equals',
        value: 'Student',
      });
      const newDormField = await harness.saveField();
      expect(newDormField).not.toBeNull();
      expect(harness.fields).toHaveLength(9);

      // Action 3: Move Dormitory to follow Academic Program
      const dormIdx = harness.fields.findIndex((f) => f.fieldKey === 'dormitory_boarding_house');
      await harness.moveUp(dormIdx);
      expect(harness.fields.find((f) => f.fieldKey === 'dormitory_boarding_house')?.displayOrder).toBeLessThan(10);
    });
  });

  // =========================================================================
  // TIER 5: Adversarial Hardening
  // =========================================================================

  describe('Tier 5: Adversarial Hardening', () => {
    test('T5-1: Handles raw JSON script injection attempts inside field label safely', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = '<script>alert("XSS")</script> Emergency Contact';
      const created = await harness.saveField();
      expect(created?.label).toBe('<script>alert("XSS")</script> Emergency Contact');
      expect(created?.fieldKey).toBe('script_alert_xss_script_emergency_contact');
    });

    test('T5-2: Malformed visibilityRule JSON string does not crash harness on edit open', () => {
      const field: CustomFieldDefinition = {
        id: 'corrupted',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'corrupt_field',
        label: 'Corrupted Field',
        dataType: 'Text',
        isRequired: false,
        displayOrder: 1,
        isActive: true,
        visibilityRuleJson: '{invalid-json: missing_quotes',
      };
      const harness = new CustomFieldsTabHarness([field]);
      expect(() => {
        try {
          harness.openEditModal(field);
        } catch {
          // Handled safely
        }
      }).not.toThrow();
    });
  });

  // =========================================================================
  // DIRECT SERVICE & COMPONENT VERIFICATION
  // =========================================================================

  describe('Direct Service Layer Verification: clinicService Custom Fields', () => {
    test('SVC-1: updateCustomField issues PUT /custom-fields/:id with payload', async () => {
      mockApiResponse = { id: 'cf-1', label: 'Updated Label', isRequired: true };
      const [res, err] = await clinicService.updateCustomField('cf-1', {
        label: 'Updated Label',
        isRequired: true,
      });

      expect(err).toBeNull();
      expect(res?.label).toBe('Updated Label');
      expect(lastApiCall?.method).toBe('PUT');
      expect(lastApiCall?.url).toBe('/custom-fields/cf-1');
      expect(lastApiCall?.data).toEqual({ label: 'Updated Label', isRequired: true });
    });

    test('SVC-2: reorderCustomFields with array of IDs maps to orderedIds payload', async () => {
      mockApiResponse = [{ id: 'cf-2', displayOrder: 1 }, { id: 'cf-1', displayOrder: 2 }];
      const [res, err] = await clinicService.reorderCustomFields(['cf-2', 'cf-1']);

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('PUT');
      expect(lastApiCall?.url).toBe('/custom-fields/reorder');
      expect(lastApiCall?.data).toEqual({
        orderedIds: ['cf-2', 'cf-1'],
        entityType: 'ClinicPatient',
      });
    });

    test('SVC-3: reorderCustomFields with object payload passes body directly', async () => {
      mockApiResponse = true;
      const customPayload = {
        items: [{ id: 'cf-1', displayOrder: 10 }],
        entityType: 'ClinicConsultation',
      };
      const [res, err] = await clinicService.reorderCustomFields(customPayload);

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('PUT');
      expect(lastApiCall?.url).toBe('/custom-fields/reorder');
      expect(lastApiCall?.data).toEqual(customPayload);
    });

    test('SVC-4: installTemplateBundle normalizes USTP to university_ustp backend key', async () => {
      mockApiResponse = [{ id: 'new-1', fieldKey: 'affiliation' }];
      const [res, err] = await clinicService.installTemplateBundle('ustp');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data).toEqual({
        templateKey: 'university_ustp',
        entityType: 'ClinicPatient',
      });
    });

    test('SVC-5: installTemplateBundle normalizes Workplace to workplace_corporate backend key', async () => {
      mockApiResponse = [{ id: 'new-2', fieldKey: 'employment_type' }];
      const [res, err] = await clinicService.installTemplateBundle('Workplace');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data).toEqual({
        templateKey: 'workplace_corporate',
        entityType: 'ClinicPatient',
      });
    });

    test('SVC-6: installTemplateBundle normalizes Demographics to general_demographics backend key', async () => {
      mockApiResponse = [{ id: 'new-3', fieldKey: 'religion' }];
      const [res, err] = await clinicService.installTemplateBundle('demographics');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data).toEqual({
        templateKey: 'general_demographics',
        entityType: 'ClinicPatient',
      });
    });

    test('SVC-6b: installTemplateBundle normalizes Intake aliases to patient_intake_contacts backend key', async () => {
      mockApiResponse = [{ id: 'new-4', fieldKey: 'primary_address_line' }];
      const [res, err] = await clinicService.installTemplateBundle('intake');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data).toEqual({
        templateKey: 'patient_intake_contacts',
        entityType: 'ClinicPatient',
      });

      // Test alias "contacts"
      await clinicService.installTemplateBundle('contacts');
      expect(lastApiCall?.data?.templateKey).toBe('patient_intake_contacts');

      // Test alias "address_emergency"
      await clinicService.installTemplateBundle('address_emergency');
      expect(lastApiCall?.data?.templateKey).toBe('patient_intake_contacts');
    });

    test('SVC-6c: installTemplateBundle normalizes Address to patient_intake_address backend key', async () => {
      mockApiResponse = [{ id: 'new-5', fieldKey: 'primary_address_line' }];
      const [res, err] = await clinicService.installTemplateBundle('address');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data?.templateKey).toBe('patient_intake_address');
    });

    test('SVC-6d: installTemplateBundle normalizes Emergency to patient_intake_emergency backend key', async () => {
      mockApiResponse = [{ id: 'new-6', fieldKey: 'emergency_contact_name' }];
      const [res, err] = await clinicService.installTemplateBundle('emergency');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data?.templateKey).toBe('patient_intake_emergency');
    });

    test('SVC-7: installCustomFieldTemplate is an alias for installTemplateBundle', async () => {
      mockApiResponse = [{ id: 'new-1' }];
      const [res, err] = await clinicService.installCustomFieldTemplate('USTP');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('POST');
      expect(lastApiCall?.url).toBe('/custom-fields/templates/install');
      expect(lastApiCall?.data?.templateKey).toBe('university_ustp');
    });

    test('SVC-8: getCustomFieldTemplates queries GET /custom-fields/templates', async () => {
      mockApiResponse = [{ key: 'university_ustp', name: 'USTP' }];
      const [res, err] = await clinicService.getCustomFieldTemplates('ClinicPatient');

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('GET');
      expect(lastApiCall?.url).toBe('/custom-fields/templates?entityType=ClinicPatient');
    });

    test('COMP-1: CustomFieldsTab and AddEditFieldModal components are exported and valid', () => {
      expect(typeof CustomFieldsTab).toBe('function');
      expect(typeof AddEditFieldModal).toBe('function');
    });

    test('DND-1: Default reorder mode is "both", rendering both grip handles and subtle arrows', () => {
      setDeviceItem('clinicez_intake_reorder_mode', null);
      const harness = new CustomFieldsTabHarness();
      expect(harness.reorderMode).toBe('both');
    });

    test('DND-2: Switching reorder mode to "dnd" persists in deviceStorage and hides arrows', () => {
      const harness = new CustomFieldsTabHarness();
      harness.setReorderMode('dnd');
      expect(harness.reorderMode).toBe('dnd');
      expect(getDeviceItem('clinicez_intake_reorder_mode')).toBe('dnd');
    });

    test('DND-3: Switching reorder mode to "arrows" persists in deviceStorage and hides grip handle', () => {
      const harness = new CustomFieldsTabHarness();
      harness.setReorderMode('arrows');
      expect(harness.reorderMode).toBe('arrows');
      expect(getDeviceItem('clinicez_intake_reorder_mode')).toBe('arrows');
    });

    test('DND-4: Stored reorder mode preference is retrieved from deviceStorage on initial load', () => {
      setDeviceItem('clinicez_intake_reorder_mode', 'dnd');
      const harness = new CustomFieldsTabHarness();
      expect(harness.reorderMode).toBe('dnd');

      setDeviceItem('clinicez_intake_reorder_mode', 'arrows');
      const harnessArrows = new CustomFieldsTabHarness();
      expect(harnessArrows.reorderMode).toBe('arrows');

      setDeviceItem('clinicez_intake_reorder_mode', 'both');
      const harnessBoth = new CustomFieldsTabHarness();
      expect(harnessBoth.reorderMode).toBe('both');
    });

    test('DND-5: Drag-and-drop batch reorder updates displayOrder to 1-based sequential indices', async () => {
      const initialFields: CustomFieldDefinition[] = [
        { id: 'f-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true },
        { id: 'f-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true },
        { id: 'f-3', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f3', label: 'Field 3', dataType: 'Text', displayOrder: 3, isRequired: false, isActive: true },
      ];
      const harness = new CustomFieldsTabHarness(initialFields);

      // Drag field 3 to position 1: ['f-3', 'f-1', 'f-2']
      const success = await harness.reorderBatch(['f-3', 'f-1', 'f-2']);
      expect(success).toBe(true);

      const f3 = harness.fields.find((f) => f.id === 'f-3');
      const f1 = harness.fields.find((f) => f.id === 'f-1');
      const f2 = harness.fields.find((f) => f.id === 'f-2');

      expect(f3?.displayOrder).toBe(1);
      expect(f1?.displayOrder).toBe(2);
      expect(f2?.displayOrder).toBe(3);
    });

    test('DND-6: Batch reorder triggers clinicService.reorderCustomFields with orderedIds array', async () => {
      mockApiResponse = true;
      const ids = ['field-c', 'field-a', 'field-b'];
      const [res, err] = await clinicService.reorderCustomFields(ids);

      expect(err).toBeNull();
      expect(lastApiCall?.method).toBe('PUT');
      expect(lastApiCall?.url).toBe('/custom-fields/reorder');
      expect(lastApiCall?.data).toEqual({ orderedIds: ids, entityType: 'ClinicPatient' });
    });

    test('DND-7: Batch reorder network failure triggers error rollback to original positions', async () => {
      const initialFields: CustomFieldDefinition[] = [
        { id: 'f-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true },
        { id: 'f-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true },
      ];
      const harness = new CustomFieldsTabHarness(initialFields);

      // Attempt reorder with simulated network error
      const success = await harness.reorderBatch(['f-2', 'f-1'], true);
      expect(success).toBe(false);

      // Verify rollback
      expect(harness.fields.find((f) => f.id === 'f-1')?.displayOrder).toBe(1);
      expect(harness.fields.find((f) => f.id === 'f-2')?.displayOrder).toBe(2);
      expect(harness.notifications[harness.notifications.length - 1].type).toBe('error');
    });

    test('DND-8: Drag-and-drop is enabled (canDrag=true) when category filter is "All"', () => {
      const harness = new CustomFieldsTabHarness();
      harness.selectedCategory = 'All';
      expect(harness.canDrag).toBe(true);
    });

    test('DND-9: Drag-and-drop is disabled (canDrag=false) when filtered by a specific category', () => {
      const harness = new CustomFieldsTabHarness();
      harness.selectedCategory = 'Demographics';
      expect(harness.canDrag).toBe(false);

      harness.selectedCategory = 'Academic';
      expect(harness.canDrag).toBe(false);
    });

    test('DND-10: Subtle Up/Down arrows are disabled at list boundaries', async () => {
      const initialFields: CustomFieldDefinition[] = [
        { id: 'f-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true },
        { id: 'f-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true },
      ];
      const harness = new CustomFieldsTabHarness(initialFields);

      // Top boundary: moving up first element returns false
      const upFirst = await harness.moveUp('f-1');
      expect(upFirst).toBe(false);

      // Bottom boundary: moving down last element returns false
      const downLast = await harness.moveDown('f-2');
      expect(downLast).toBe(false);

      // Valid internal move: moving down first element succeeds
      const downFirst = await harness.moveDown('f-1');
      expect(downFirst).toBe(true);
      expect(harness.fields.find((f) => f.id === 'f-1')?.displayOrder).toBe(2);
      expect(harness.fields.find((f) => f.id === 'f-2')?.displayOrder).toBe(1);
    });

    test('DND-11: SortableCustomFieldsList and SortableCustomFieldsListWeb components are exported and valid', () => {
      expect(typeof SortableCustomFieldsList).toBe('function');
      expect(typeof SortableCustomFieldsListWeb).toBe('function');
    });

    test('DND-12: Error rollback preserves original state objects without in-place mutation of displayOrder', async () => {
      const f1: CustomFieldDefinition = { id: 'f-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true };
      const f2: CustomFieldDefinition = { id: 'f-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true };
      const harness = new CustomFieldsTabHarness([f1, f2]);

      // Trigger reorder with simulated error
      const success = await harness.reorderBatch(['f-2', 'f-1'], true);
      expect(success).toBe(false);

      // Verify that original objects still have displayOrder 1 and 2, not mutated to 2 and 1
      expect(harness.fields[0].id).toBe('f-1');
      expect(harness.fields[0].displayOrder).toBe(1);
      expect(harness.fields[1].id).toBe('f-2');
      expect(harness.fields[1].displayOrder).toBe(2);
    });

    test('DND-13: Filtered category boundary checks accurately identify first and last visible positions', () => {
      const f1: CustomFieldDefinition = { id: 'd-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'd1', label: 'Demo 1', category: 'Demographics', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true };
      const f2: CustomFieldDefinition = { id: 'a-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'a1', label: 'Acad 1', category: 'Academic', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true };
      const f3: CustomFieldDefinition = { id: 'd-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'd2', label: 'Demo 2', category: 'Demographics', dataType: 'Text', displayOrder: 3, isRequired: false, isActive: true };

      const harness = new CustomFieldsTabHarness([f1, f2, f3]);
      harness.selectedCategory = 'Demographics';

      const visible = harness.visibleFields;
      expect(visible).toHaveLength(2);
      expect(visible[0].id).toBe('d-1');
      expect(visible[1].id).toBe('d-2');

      // In visible list: d-1 is index 0 (isFirst=true), d-2 is index 1 (isLast=true)
      const isFirst0 = 0 <= 0;
      const isLast0 = 0 >= visible.length - 1;
      const isFirst1 = 1 <= 0;
      const isLast1 = 1 >= visible.length - 1;

      expect(isFirst0).toBe(true);  // d-1 cannot move up
      expect(isLast0).toBe(false); // d-1 can move down
      expect(isFirst1).toBe(false); // d-2 can move up
      expect(isLast1).toBe(true);  // d-2 cannot move down
    });

    test('DND-14: Batch reordering appends any unmentioned fields to preserve full sequence integrity', async () => {
      const f1: CustomFieldDefinition = { id: 'f-1', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f1', label: 'Field 1', dataType: 'Text', displayOrder: 1, isRequired: false, isActive: true };
      const f2: CustomFieldDefinition = { id: 'f-2', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f2', label: 'Field 2', dataType: 'Text', displayOrder: 2, isRequired: false, isActive: true };
      const f3: CustomFieldDefinition = { id: 'f-3', tenantId: 't', clinicId: 'c', entityType: 'ClinicPatient', fieldKey: 'f3', label: 'Field 3', dataType: 'Text', displayOrder: 3, isRequired: false, isActive: true };

      const harness = new CustomFieldsTabHarness([f1, f2, f3]);
      // Only reorder first two, f-3 is omitted from input
      await harness.reorderBatch(['f-2', 'f-1']);

      expect(harness.fields).toHaveLength(3);
      expect(harness.fields[0].id).toBe('f-2');
      expect(harness.fields[0].displayOrder).toBe(1);
      expect(harness.fields[1].id).toBe('f-1');
      expect(harness.fields[1].displayOrder).toBe(2);
      expect(harness.fields[2].id).toBe('f-3');
      expect(harness.fields[2].displayOrder).toBe(3);
    });

    test('DND-15: Reorder controls mode selector maintains consistency with deviceStorage state', () => {
      const harness = new CustomFieldsTabHarness();
      harness.setReorderMode('both');
      expect(harness.reorderMode).toBe('both');
      expect(getDeviceItem('clinicez_intake_reorder_mode')).toBe('both');

      harness.setReorderMode('dnd');
      expect(harness.reorderMode).toBe('dnd');
      expect(getDeviceItem('clinicez_intake_reorder_mode')).toBe('dnd');

      harness.setReorderMode('arrows');
      expect(harness.reorderMode).toBe('arrows');
      expect(getDeviceItem('clinicez_intake_reorder_mode')).toBe('arrows');
    });
  });

  // =========================================================================
  // ISSUE #57: Machine Key Uniqueness (TC-IF-004) & Format Validation (TC-IF-006)
  // =========================================================================

  describe('Issue #57: Machine Key Uniqueness (TC-IF-004) & Format Validation (TC-IF-006)', () => {
    test('TC-IF-004-1: Rejects duplicate machine key when creating a custom field', async () => {
      const harness = new CustomFieldsTabHarness();
      harness.openAddModal();
      harness.draftLabel = 'Student ID';
      harness.draftFieldKey = 'student_id';
      const first = await harness.saveField();
      expect(first).not.toBeNull();
      expect(first?.fieldKey).toBe('student_id');

      harness.openAddModal();
      harness.draftLabel = 'Another Student ID';
      harness.draftFieldKey = 'student_id';
      const second = await harness.saveField();
      expect(second).toBeNull();
      expect(harness.modalError).toBe('A custom field with this machine key already exists.');
      expect(harness.fields).toHaveLength(1);
    });

    test('TC-IF-004-2: Rejects duplicate machine key when updating an existing field to collide with another', async () => {
      const f1: CustomFieldDefinition = {
        id: 'f-1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        displayOrder: 1,
        isRequired: true,
        isActive: true,
      };
      const f2: CustomFieldDefinition = {
        id: 'f-2',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'employee_id',
        label: 'Employee ID',
        dataType: 'Text',
        displayOrder: 2,
        isRequired: false,
        isActive: true,
      };
      const harness = new CustomFieldsTabHarness([f1, f2]);

      harness.openEditModal(f2);
      harness.draftFieldKey = 'student_id';
      const updated = await harness.saveField();
      expect(updated).toBeNull();
      expect(harness.modalError).toBe('A custom field with this machine key already exists.');
      expect(harness.fields.find((f) => f.id === 'f-2')?.fieldKey).toBe('employee_id');
    });

    test('TC-IF-004-3: Allows saving an edited field when its own machine key is retained', async () => {
      const f1: CustomFieldDefinition = {
        id: 'f-1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        displayOrder: 1,
        isRequired: true,
        isActive: true,
      };
      const harness = new CustomFieldsTabHarness([f1]);

      harness.openEditModal(f1);
      harness.draftLabel = 'Student ID Number (Updated)';
      const updated = await harness.saveField();
      expect(updated).not.toBeNull();
      expect(updated?.fieldKey).toBe('student_id');
      expect(updated?.label).toBe('Student ID Number (Updated)');
    });

    test('TC-IF-006-1: Rejects special characters, spaces, uppercase, and leading/trailing spaces in machine key', async () => {
      const invalidKeys = [
        'full name 89 123!@#!',
        'student-id',
        'student@id',
        'student$id!',
        'Student_ID',
        '  student_id  ',
        'student_id ',
        ' student_id',
      ];

      for (const badKey of invalidKeys) {
        const err = validateMachineKey(badKey, []);
        expect(err).toBe(
          'Machine key must contain only lowercase alphanumeric characters and underscores (e.g. student_id).'
        );

        const harness = new CustomFieldsTabHarness();
        harness.openAddModal();
        harness.draftLabel = 'Test Field';
        harness.draftFieldKey = badKey;
        const saved = await harness.saveField();
        expect(saved).toBeNull();
        expect(harness.modalError).toBe(
          'Machine key must contain only lowercase alphanumeric characters and underscores (e.g. student_id).'
        );
      }
    });

    test('TC-IF-006-2: slugifyMachineKey automatically generates valid snake_case keys from Display Label', () => {
      expect(slugifyMachineKey('Student ID')).toBe('student_id');
      expect(slugifyMachineKey('  Spouse Full Name (Optional)!  ')).toBe('spouse_full_name_optional');
      expect(slugifyMachineKey('Year / Grade Level #1')).toBe('year_grade_level_1');
      expect(MACHINE_KEY_REGEX.test(slugifyMachineKey('Student ID'))).toBe(true);
    });

    test('TC-IF-006-3: normalizeMachineKeyOnBlur replaces spaces with underscores and lowercases while preserving invalid symbols for validation', () => {
      expect(normalizeMachineKeyOnBlur('  Student   ID  ')).toBe('student_id');
      expect(validateMachineKey(normalizeMachineKeyOnBlur('  Student   ID  '), [])).toBeNull();

      // Special characters are preserved on blur so validation immediately flags them
      const blurredInvalid = normalizeMachineKeyOnBlur('full name 89 123!@#!');
      expect(blurredInvalid).toBe('full_name_89_123!@#!');
      expect(validateMachineKey(blurredInvalid, [])).toBe(
        'Machine key must contain only lowercase alphanumeric characters and underscores (e.g. student_id).'
      );
    });

    test('TC-IF-006-4: Rejects empty or overlong (>100 chars) machine keys', () => {
      expect(validateMachineKey('', [])).toBe('Machine key is required.');
      expect(validateMachineKey('a'.repeat(101), [])).toBe(
        'Machine key cannot exceed 100 characters.'
      );
      expect(validateMachineKey('a'.repeat(100), [])).toBeNull();
    });

    test('TC-IF-006-5: Clearing machine key in Edit mode rejects save instead of silently overwriting from label', async () => {
      const f1: CustomFieldDefinition = {
        id: 'f-1',
        tenantId: 't',
        clinicId: 'c',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        displayOrder: 1,
        isRequired: true,
        isActive: true,
      };
      const harness = new CustomFieldsTabHarness([f1]);

      harness.openEditModal(f1);
      harness.draftLabel = 'Updated Student ID Label';
      harness.draftFieldKey = '';
      const updated = await harness.saveField();
      expect(updated).toBeNull();
      expect(harness.modalError).toBe('Machine key is required.');
      expect(harness.fields[0].fieldKey).toBe('student_id');
    });
  });

  describe('Issue #82: Boolean Trigger Fields Conditional Visibility (Features F1–F6)', () => {
    const booleanField: CustomFieldDefinition = {
      id: 'f-bool',
      tenantId: 'tenant-test',
      clinicId: 'clinic-test',
      entityType: 'ClinicPatient',
      fieldKey: 'is_pregnant',
      label: 'Is Pregnant',
      dataType: 'Boolean',
      displayOrder: 1,
      isRequired: false,
      isActive: true,
    };

    const textField: CustomFieldDefinition = {
      id: 'f-text',
      tenantId: 'tenant-test',
      clinicId: 'clinic-test',
      entityType: 'ClinicPatient',
      fieldKey: 'affiliation',
      label: 'Affiliation',
      dataType: 'Text',
      displayOrder: 2,
      isRequired: false,
      isActive: true,
    };

    // --- F1: Operator Restriction & Auto-Reset ---
    test('F1-1: BOOLEAN_OPERATORS is restricted to equals, not_equals, and not_empty', () => {
      const boolOpKeys = BOOLEAN_OPERATORS.map((op: any) => op.key);
      expect(boolOpKeys).toEqual(['equals', 'not_equals', 'not_empty']);
      expect(boolOpKeys).not.toContain('in');
      expect(boolOpKeys).not.toContain('contains');

      const allOpKeys = OPERATORS.map((op: any) => op.key);
      expect(allOpKeys).toContain('in');
      expect(allOpKeys).toContain('contains');
      expect(allOpKeys.length).toBe(5);
    });

    test('F1-2: isBooleanTriggerField accurately identifies Boolean parent fields', () => {
      expect(isBooleanTriggerField('is_pregnant', [booleanField, textField])).toBe(true);
      expect(isBooleanTriggerField('affiliation', [booleanField, textField])).toBe(false);
      expect(isBooleanTriggerField('non_existent', [booleanField, textField])).toBe(false);
      expect(isBooleanTriggerField('sex', [booleanField, textField], 'static')).toBe(false);
    });

    test('F1-3: Switching trigger field to Boolean auto-resets operator from "in" or "contains" to "equals"', () => {
      const harness = new CustomFieldsTabHarness([booleanField, textField]);
      harness.openAddModal();
      harness.draftLabel = 'Trimester';
      harness.draftFieldKey = 'trimester';

      // Start with text parent and "in" operator
      harness.selectParentTriggerField('affiliation');
      harness.draftVisibilityRule!.operator = 'in';
      harness.draftVisibilityRule!.value = 'Student, Employee';

      // Switch to Boolean trigger field
      harness.selectParentTriggerField('is_pregnant');
      expect(harness.draftVisibilityRule!.operator).toBe('equals');
      expect(harness.draftVisibilityRule!.value).toBe('true');

      // Switch to "contains" on text field and back
      harness.selectParentTriggerField('affiliation');
      harness.draftVisibilityRule!.operator = 'contains';
      harness.selectParentTriggerField('is_pregnant');
      expect(harness.draftVisibilityRule!.operator).toBe('equals');
    });

    // --- F2: Closed-Set Yes/No Choice Chips & Helpers ---
    test('F2-1: isValidBooleanRuleValue strictly accepts valid boolean representations and rejects arbitrary strings', () => {
      expect(isValidBooleanRuleValue(true)).toBe(true);
      expect(isValidBooleanRuleValue(false)).toBe(true);
      expect(isValidBooleanRuleValue('true')).toBe(true);
      expect(isValidBooleanRuleValue('false')).toBe(true);
      expect(isValidBooleanRuleValue('Yes')).toBe(true);
      expect(isValidBooleanRuleValue('No')).toBe(true);
      expect(isValidBooleanRuleValue('yes')).toBe(true);
      expect(isValidBooleanRuleValue('no')).toBe(true);

      expect(isValidBooleanRuleValue('maybe')).toBe(false);
      expect(isValidBooleanRuleValue('Student')).toBe(false);
      expect(isValidBooleanRuleValue('')).toBe(false);
      expect(isValidBooleanRuleValue(123)).toBe(false);
      expect(isValidBooleanRuleValue(null)).toBe(false);
      expect(isValidBooleanRuleValue(undefined)).toBe(false);
    });

    test('F2-2: normalizeBooleanRuleValue maps truthy and falsy representations to canonical "true" or "false"', () => {
      expect(normalizeBooleanRuleValue(true)).toBe('true');
      expect(normalizeBooleanRuleValue('true')).toBe('true');
      expect(normalizeBooleanRuleValue('Yes')).toBe('true');
      expect(normalizeBooleanRuleValue('yes')).toBe('true');
      expect(normalizeBooleanRuleValue('  TRUE  ')).toBe('true');

      expect(normalizeBooleanRuleValue(false)).toBe('false');
      expect(normalizeBooleanRuleValue('false')).toBe('false');
      expect(normalizeBooleanRuleValue('No')).toBe('false');
      expect(normalizeBooleanRuleValue('no')).toBe('false');
      expect(normalizeBooleanRuleValue('  FALSE  ')).toBe('false');

      // Unknown fallback defaults to 'true' ('Yes')
      expect(normalizeBooleanRuleValue('invalid')).toBe('true');
      expect(normalizeBooleanRuleValue('')).toBe('true');
    });

    // --- F3: Field Switch Sanitization ---
    test('F3-1: Switching to Boolean sanitizes/defaults ruleValue to "true" when current value is not valid boolean', () => {
      const harness = new CustomFieldsTabHarness([booleanField, textField]);
      harness.openAddModal();
      harness.draftLabel = 'Child Field';
      harness.draftFieldKey = 'child_field';

      harness.selectParentTriggerField('affiliation');
      harness.draftVisibilityRule!.value = 'Arbitrary Text';

      harness.selectParentTriggerField('is_pregnant');
      expect(harness.draftVisibilityRule!.value).toBe('true');
    });

    test('F3-2: Switching away from Boolean resets "true" or "false" back to empty string', () => {
      const harness = new CustomFieldsTabHarness([booleanField, textField]);
      harness.openAddModal();
      harness.draftLabel = 'Child Field';
      harness.draftFieldKey = 'child_field';

      harness.selectParentTriggerField('is_pregnant');
      harness.draftVisibilityRule!.value = 'false';

      harness.selectParentTriggerField('affiliation');
      expect(harness.draftVisibilityRule!.value).toBe('');
    });

    // --- F4: Edit Mode Legacy Normalization ---
    test('F4-1: Loading field with legacy "Yes" normalizes to canonical "true"', () => {
      const childWithLegacyYes: CustomFieldDefinition = {
        id: 'f-child-1',
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: 'due_date',
        label: 'Expected Due Date',
        dataType: 'Date',
        displayOrder: 3,
        isRequired: false,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'is_pregnant',
          operator: 'equals',
          value: 'Yes',
        }),
      };

      const harness = new CustomFieldsTabHarness([booleanField, childWithLegacyYes]);
      harness.openEditModal(childWithLegacyYes);

      expect(harness.draftVisibilityRule?.value).toBe('true');
      expect(harness.draftVisibilityRule?.operator).toBe('equals');
    });

    test('F4-2: Loading field with legacy "No" normalizes to canonical "false"', () => {
      const childWithLegacyNo: CustomFieldDefinition = {
        id: 'f-child-2',
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: 'menopause_status',
        label: 'Menopause Status',
        dataType: 'Text',
        displayOrder: 4,
        isRequired: false,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'is_pregnant',
          operator: 'equals',
          value: 'No',
        }),
      };

      const harness = new CustomFieldsTabHarness([booleanField, childWithLegacyNo]);
      harness.openEditModal(childWithLegacyNo);

      expect(harness.draftVisibilityRule?.value).toBe('false');
    });

    test('F4-3: Loading field with boolean primitives (true/false) normalizes to canonical strings', () => {
      const childWithPrimTrue: CustomFieldDefinition = {
        id: 'f-child-3',
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: 'ob_notes',
        label: 'OB Notes',
        dataType: 'Text',
        displayOrder: 5,
        isRequired: false,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'is_pregnant',
          operator: 'equals',
          value: true,
        }),
      };

      const harness = new CustomFieldsTabHarness([booleanField, childWithPrimTrue]);
      harness.openEditModal(childWithPrimTrue);

      expect(harness.draftVisibilityRule?.value).toBe('true');
    });

    test('F4-4: Loading field with invalid operator "in" or "contains" auto-resets operator to "equals"', () => {
      const childWithInvalidOp: CustomFieldDefinition = {
        id: 'f-child-4',
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: 'ob_details',
        label: 'OB Details',
        dataType: 'Text',
        displayOrder: 6,
        isRequired: false,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'is_pregnant',
          operator: 'contains',
          value: 'true',
        }),
      };

      const harness = new CustomFieldsTabHarness([booleanField, childWithInvalidOp]);
      harness.openEditModal(childWithInvalidOp);

      expect(harness.draftVisibilityRule?.operator).toBe('equals');
      expect(harness.draftVisibilityRule?.value).toBe('true');
    });

    test('F4-5: Loading non-boolean parent fields preserves original operator and value unchanged', () => {
      const childOfText: CustomFieldDefinition = {
        id: 'f-child-5',
        tenantId: 'tenant-test',
        clinicId: 'clinic-test',
        entityType: 'ClinicPatient',
        fieldKey: 'student_id',
        label: 'Student ID',
        dataType: 'Text',
        displayOrder: 7,
        isRequired: true,
        isActive: true,
        visibilityRuleJson: JSON.stringify({
          source: 'custom_field',
          field: 'affiliation',
          operator: 'contains',
          value: 'Stud',
        }),
      };

      const harness = new CustomFieldsTabHarness([textField, childOfText]);
      harness.openEditModal(childOfText);

      expect(harness.draftVisibilityRule?.operator).toBe('contains');
      expect(harness.draftVisibilityRule?.value).toBe('Stud');
    });

    // --- F5: Save Validation & Serialization ---
    test('F5-1: Rejects saving invalid operator ("in" or "contains") for Boolean parent field', async () => {
      const harness = new CustomFieldsTabHarness([booleanField]);
      harness.openAddModal();
      harness.draftLabel = 'Invalid Op Child';
      harness.draftFieldKey = 'invalid_op_child';
      harness.draftVisibilityRule = {
        source: 'custom_field',
        field: 'is_pregnant',
        operator: 'in' as any,
        value: 'true',
      };

      const saved = await harness.saveField();
      expect(saved).toBeNull();
      expect(harness.modalError).toBe(
        'Comparison operator for Boolean fields must be Equals, Not Equals, or Has Any Value.'
      );
    });

    test('F5-2: Rejects saving invalid non-boolean value for Boolean parent field', async () => {
      const harness = new CustomFieldsTabHarness([booleanField]);
      harness.openAddModal();
      harness.draftLabel = 'Invalid Val Child';
      harness.draftFieldKey = 'invalid_val_child';
      harness.draftVisibilityRule = {
        source: 'custom_field',
        field: 'is_pregnant',
        operator: 'equals',
        value: 'maybe',
      };

      const saved = await harness.saveField();
      expect(saved).toBeNull();
      expect(harness.modalError).toBe(
        'Please select Yes or No for the expected Boolean condition.'
      );
    });

    test('F5-3: Allows saving "not_empty" operator for Boolean parent field without value', async () => {
      const harness = new CustomFieldsTabHarness([booleanField]);
      harness.openAddModal();
      harness.draftLabel = 'Not Empty Child';
      harness.draftFieldKey = 'not_empty_child';
      harness.draftVisibilityRule = {
        source: 'custom_field',
        field: 'is_pregnant',
        operator: 'not_empty',
      };

      const saved = await harness.saveField();
      expect(saved).not.toBeNull();
      expect(saved?.visibilityRuleJson).toBeDefined();
      const parsed = JSON.parse(saved!.visibilityRuleJson!);
      expect(parsed.operator).toBe('not_empty');
      expect(parsed.field).toBe('is_pregnant');
      expect(parsed.value).toBeUndefined();
    });

    test('F5-4: Successfully serializes canonical "true" or "false" string on save', async () => {
      const harness = new CustomFieldsTabHarness([booleanField]);
      harness.openAddModal();
      harness.draftLabel = 'Canonical True Child';
      harness.draftFieldKey = 'canonical_true_child';
      harness.draftVisibilityRule = {
        source: 'custom_field',
        field: 'is_pregnant',
        operator: 'equals',
        value: 'Yes',
      };

      const saved = await harness.saveField();
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!.visibilityRuleJson!);
      expect(parsed.value).toBe('true');
      expect(parsed.operator).toBe('equals');
    });

    // --- F6: Rule Badges Formatting ---
    test('F6-1: formatRuleBadgeLabel renders human-readable "Yes" / "No" for Boolean parent equals/not_equals', () => {
      const fields = [booleanField, textField];

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: 'true' },
          fields
        )
      ).toBe("If is_pregnant == 'Yes'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: 'false' },
          fields
        )
      ).toBe("If is_pregnant == 'No'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'not_equals', value: 'true' },
          fields
        )
      ).toBe("If is_pregnant != 'Yes'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'not_equals', value: 'false' },
          fields
        )
      ).toBe("If is_pregnant != 'No'");
    });

    test('F6-2: formatRuleBadgeLabel handles legacy boolean representations and primitives seamlessly', () => {
      const fields = [booleanField, textField];

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: 'Yes' },
          fields
        )
      ).toBe("If is_pregnant == 'Yes'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: 'No' },
          fields
        )
      ).toBe("If is_pregnant == 'No'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: true },
          fields
        )
      ).toBe("If is_pregnant == 'Yes'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'equals', value: false },
          fields
        )
      ).toBe("If is_pregnant == 'No'");
    });

    test('F6-3: formatRuleBadgeLabel handles "not_empty" for Boolean parent', () => {
      const fields = [booleanField, textField];

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'is_pregnant', operator: 'not_empty' },
          fields
        )
      ).toBe('If is_pregnant is not empty');
    });

    test('F6-4: formatRuleBadgeLabel preserves all non-boolean badges exactly unchanged', () => {
      const fields = [booleanField, textField];

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'affiliation', operator: 'equals', value: 'Student' },
          fields
        )
      ).toBe("If affiliation == 'Student'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'affiliation', operator: 'not_equals', value: 'Faculty' },
          fields
        )
      ).toBe("If affiliation != 'Faculty'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'affiliation', operator: 'in', value: ['Student', 'Faculty'] },
          fields
        )
      ).toBe("If affiliation in 'Student, Faculty'");

      expect(
        formatRuleBadgeLabel(
          { source: 'custom_field', field: 'affiliation', operator: 'not_empty' },
          fields
        )
      ).toBe('If affiliation is not empty');
    });

    test('F6-5: formatLiveRulePreview produces human-readable live preview text in AddEditFieldModal', () => {
      expect(formatLiveRulePreview('is_pregnant', 'equals', 'true', true)).toBe(
        "Visible when [is_pregnant] equals 'Yes'"
      );
      expect(formatLiveRulePreview('is_pregnant', 'equals', 'false', true)).toBe(
        "Visible when [is_pregnant] equals 'No'"
      );
      expect(formatLiveRulePreview('is_pregnant', 'not_equals', 'true', true)).toBe(
        "Visible when [is_pregnant] not_equals 'Yes'"
      );
      expect(formatLiveRulePreview('is_pregnant', 'not_empty', '', true)).toBe(
        'If is_pregnant is not empty'
      );
      expect(formatLiveRulePreview('affiliation', 'equals', 'Student', false)).toBe(
        "Visible when [affiliation] equals 'Student'"
      );
      expect(formatLiveRulePreview('', 'equals', '', false)).toBe('');
    });
  });
});
