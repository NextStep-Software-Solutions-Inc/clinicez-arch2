// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityHint,
    placeholder,
    value,
    onPress,
    title,
    visible,
    helperText,
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityHint ? { 'data-accessibility-hint': accessibilityHint } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title, title } : {}),
        ...(helperText ? { 'data-helper-text': helperText } : {}),
        onClick: onPress,
      },
      title,
      placeholder,
      helperText,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  RefreshControl: createMockComponent('RefreshControl'),
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Alert: { alert: () => {} },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
}));

mock.module('react-native-svg', () => ({
  default: 'Svg',
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  G: ({ children }: any) => children,
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));
mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

const {
  resolveCustomFieldPlaceholderPresentation,
  LONG_PLACEHOLDER_CHAR_LIMIT,
  EXPANDED_PLACEHOLDER_INPUT_TEXT,
  default: DynamicCustomFieldsRenderer,
} = await import('../components/custom-fields/DynamicCustomFieldsRenderer');
const AddEditFieldModal = (await import('../components/settings/AddEditFieldModal')).default;
const CustomFieldsTab = (await import('../components/settings/CustomFieldsTab')).default;

describe('GitHub #162: resolveCustomFieldPlaceholderPresentation pure helper', () => {
  test('returns unmodified placeholder when absent, empty, or <= 75 trimmed chars', () => {
    expect(LONG_PLACEHOLDER_CHAR_LIMIT).toBe(75);

    expect(resolveCustomFieldPlaceholderPresentation(undefined, 'Text')).toEqual({
      inputPlaceholder: undefined,
      helperHint: undefined,
      isExpandedHint: false,
    });

    expect(resolveCustomFieldPlaceholderPresentation(null, 'Text')).toEqual({
      inputPlaceholder: null,
      helperHint: undefined,
      isExpandedHint: false,
    });

    const exact75 = 'A'.repeat(75);
    expect(resolveCustomFieldPlaceholderPresentation(exact75, 'Text')).toEqual({
      inputPlaceholder: exact75,
      helperHint: undefined,
      isExpandedHint: false,
    });

    const padded75 = `   ${exact75}   `;
    expect(resolveCustomFieldPlaceholderPresentation(padded75, 'Number')).toEqual({
      inputPlaceholder: padded75,
      helperHint: undefined,
      isExpandedHint: false,
    });
  });

  test('expands single-line placeholders strictly > 75 trimmed chars (Text, Number, Date, omitted type)', () => {
    const exact76 = 'B'.repeat(76);
    expect(resolveCustomFieldPlaceholderPresentation(`  ${exact76}  `, 'Text')).toEqual({
      inputPlaceholder: 'Enter response (see guidance below)...',
      helperHint: exact76,
      isExpandedHint: true,
    });

    for (const fieldType of ['text', 'Text', 'number', 'Number', 'date', 'Date', undefined]) {
      const res = resolveCustomFieldPlaceholderPresentation(exact76, fieldType);
      expect(res.inputPlaceholder).toBe(EXPANDED_PLACEHOLDER_INPUT_TEXT);
      expect(res.helperHint).toBe(exact76);
      expect(res.isExpandedHint).toBe(true);
    }
  });

  test('excludes multiline textarea fields even when placeholder exceeds 75 chars', () => {
    const longTextareaHint =
      'Provide a chronological summary of prior hospitalizations, surgical procedures, and known drug allergies over the past 5 years.';
    expect(longTextareaHint.length).toBeGreaterThan(75);

    expect(resolveCustomFieldPlaceholderPresentation(longTextareaHint, 'textarea')).toEqual({
      inputPlaceholder: longTextareaHint,
      helperHint: undefined,
      isExpandedHint: false,
    });

    expect(resolveCustomFieldPlaceholderPresentation(longTextareaHint, 'TEXTAREA')).toEqual({
      inputPlaceholder: longTextareaHint,
      helperHint: undefined,
      isExpandedHint: false,
    });
  });
});

describe('GitHub #162: Component rendering across DynamicCustomFieldsRenderer, AddEditFieldModal, and CustomFieldsTab', () => {
  const longTextPrompt =
    'Enter full emergency contact name, relationship, and active mobile number reachable 24/7 during campus hours';
  const longNumberPrompt =
    'Enter average systolic blood pressure reading (mmHg) recorded at home over the past 7 consecutive mornings';
  const longDatePrompt =
    'Enter the exact calendar date (YYYY-MM-DD) of your most recent tetanus booster vaccination or chest X-ray';

  test('DynamicCustomFieldsRenderer renders wrapping multi-line helperHint below Text, Number, and Date inputs (even with active validation errors)', () => {
    const markup = renderToStaticMarkup(
      React.createElement(DynamicCustomFieldsRenderer, {
        fields: [
          {
            id: 'f-text',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'emergency_note',
            label: 'Emergency Contact Note',
            dataType: 'Text',
            isRequired: true,
            displayOrder: 1,
            placeholder: longTextPrompt,
            isActive: true,
          },
          {
            id: 'f-num',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'avg_sbp',
            label: 'Average Home SBP',
            dataType: 'Number',
            isRequired: false,
            displayOrder: 2,
            placeholder: longNumberPrompt,
            isActive: true,
          },
          {
            id: 'f-date',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'last_booster_date',
            label: 'Last Booster Date',
            dataType: 'Date',
            isRequired: false,
            displayOrder: 3,
            placeholder: longDatePrompt,
            isActive: true,
          },
        ],
        values: {},
        errors: {
          emergency_note: 'Emergency Contact Note is required.',
          last_booster_date: 'Invalid date',
        },
        onChange: () => {},
      })
    );

    expect(markup).toContain(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    expect(markup).toContain(longTextPrompt);
    expect(markup).toContain(longNumberPrompt);
    expect(markup).toContain(longDatePrompt);
    expect(markup).toContain('Emergency Contact Note is required.');
  });

  test('AddEditFieldModal renders live wrapping preview note when single-line placeholder exceeds 75 chars', () => {
    const modalWithLongHint = renderToStaticMarkup(
      React.createElement(AddEditFieldModal, {
        visible: true,
        onClose: () => {},
        existingFields: [],
        onSave: async () => true,
        fieldToEdit: {
          id: 'edit-1',
          tenantId: 't1',
          clinicId: 'c1',
          entityType: 'ClinicPatient',
          fieldKey: 'emergency_note',
          label: 'Emergency Contact Note',
          dataType: 'Text',
          category: 'Demographics',
          isRequired: true,
          displayOrder: 1,
          placeholder: longTextPrompt,
          isActive: true,
        },
      })
    );

    expect(modalWithLongHint).toContain('Full Help Text Preview');
    expect(modalWithLongHint).toContain('Wraps Below Field');
    expect(modalWithLongHint).toContain(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    expect(modalWithLongHint).toContain(longTextPrompt);

    const modalWithShortHint = renderToStaticMarkup(
      React.createElement(AddEditFieldModal, {
        visible: true,
        onClose: () => {},
        existingFields: [],
        onSave: async () => true,
        fieldToEdit: {
          id: 'edit-2',
          tenantId: 't1',
          clinicId: 'c1',
          entityType: 'ClinicPatient',
          fieldKey: 'student_id',
          label: 'Student ID',
          dataType: 'Text',
          category: 'Academic',
          isRequired: true,
          displayOrder: 1,
          placeholder: 'e.g. 2026-00142',
          isActive: true,
        },
      })
    );

    expect(modalWithShortHint).not.toContain('Full Help Text Preview');
    expect(modalWithShortHint).not.toContain('e.g. Student ID');
    expect(modalWithShortHint).not.toContain('e.g. College of Science');
  });

  test('CustomFieldsTab displays Expanded Guidance badge for single-line fields with >75 char hints and SkeletonList without zero-count chips when loading', () => {
    const loadingTabMarkup = renderToStaticMarkup(
      React.createElement(CustomFieldsTab, {
        fields: [],
        setFields: () => {},
        fieldsLoadError: null,
        showSkeletons: true,
        onRefreshFields: async () => {},
      })
    );

    expect(loadingTabMarkup).toContain('Loading');
    expect(loadingTabMarkup).not.toContain('All (0)');
    expect(loadingTabMarkup).not.toContain('Demographics (0)');
    const tabMarkup = renderToStaticMarkup(
      React.createElement(CustomFieldsTab, {
        fields: [
          {
            id: 'f-1',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'emergency_note',
            label: 'Emergency Contact Note',
            dataType: 'Text',
            category: 'Demographics',
            isRequired: true,
            displayOrder: 1,
            placeholder: longTextPrompt,
            isActive: true,
          },
        ],
        setFields: () => {},
        fieldsLoadError: null,
        showSkeletons: false,
        onRefreshFields: async () => {},
      })
    );

    expect(tabMarkup).toContain('Expanded Guidance');
    expect(tabMarkup).toContain(longTextPrompt);
  });
});

describe('TC-IF-018: Validate text boundaries and safe rendering (GitHub #162)', () => {
  const boundaryPrompt200 =
    "Please specify the referring medical specialist's full registered name, licensed PRC accreditation number, clinic hospital address, primary contact details, and initial diagnosis summary if known.";

  test('TC-IF-018-1: 200-character maximum boundary placeholder renders complete hint in wrapping guidance without truncation', () => {
    // Verify boundary test string length is up to 200 characters
    expect(boundaryPrompt200.length).toBeGreaterThan(75);
    expect(boundaryPrompt200.length).toBeLessThanOrEqual(200);

    const presentation = resolveCustomFieldPlaceholderPresentation(boundaryPrompt200, 'Text');
    expect(presentation.isExpandedHint).toBe(true);
    expect(presentation.inputPlaceholder).toBe(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    expect(presentation.helperHint).toBe(boundaryPrompt200);

    const markup = renderToStaticMarkup(
      React.createElement(DynamicCustomFieldsRenderer, {
        fields: [
          {
            id: 'cf-ref-notes',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'referring_physician_notes',
            label: 'Referring Physician Notes',
            dataType: 'Text',
            isRequired: false,
            displayOrder: 1,
            placeholder: boundaryPrompt200,
            isActive: true,
          },
        ],
        values: {},
        onChange: () => {},
      })
    );

    // Short cue in input placeholder
    expect(markup).toContain(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    // 100% of instructions rendered in expanded guidance callout
    const normalizedMarkup = markup.replace(/&#x27;/g, "'");
    expect(normalizedMarkup).toContain(boundaryPrompt200);
    // Tooltip title and accessibilityHint attributes present
    expect(normalizedMarkup).toContain(`data-title="${boundaryPrompt200}"`);
    expect(normalizedMarkup).toContain(`data-accessibility-hint="${boundaryPrompt200}"`);
  });

  test('TC-IF-018-2: Native hover tooltip and accessibilityHint forwarding across single-line field types (Text, Number, Date)', () => {
    const textHint = 'Enter full licensed PRC accreditation number';
    const numHint = 'Enter systolic blood pressure in mmHg';
    const dateHint = 'Enter date of initial referral consultation (YYYY-MM-DD)';

    const markup = renderToStaticMarkup(
      React.createElement(DynamicCustomFieldsRenderer, {
        fields: [
          {
            id: 'f-txt',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'prc_no',
            label: 'PRC Number',
            dataType: 'Text',
            isRequired: false,
            displayOrder: 1,
            placeholder: textHint,
            isActive: true,
          },
          {
            id: 'f-num',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'sbp_reading',
            label: 'SBP Reading',
            dataType: 'Number',
            isRequired: false,
            displayOrder: 2,
            placeholder: numHint,
            isActive: true,
          },
          {
            id: 'f-dt',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'referral_date',
            label: 'Referral Date',
            dataType: 'Date',
            isRequired: false,
            displayOrder: 3,
            placeholder: dateHint,
            isActive: true,
          },
        ],
        values: {},
        onChange: () => {},
      })
    );

    // Verify all 3 single-line types forward hover title and accessibilityHint
    expect(markup).toContain(`data-title="${textHint}"`);
    expect(markup).toContain(`data-accessibility-hint="${textHint}"`);
    expect(markup).toContain(`data-title="${numHint}"`);
    expect(markup).toContain(`data-accessibility-hint="${numHint}"`);
    expect(markup).toContain(`data-title="${dateHint}"`);
    expect(markup).toContain(`data-accessibility-hint="${dateHint}"`);
  });

  test('TC-IF-018-3: Form builder helperText guidance renders in AddEditFieldModal', () => {
    const modalMarkup = renderToStaticMarkup(
      React.createElement(AddEditFieldModal, {
        visible: true,
        onClose: () => {},
        existingFields: [],
        onSave: async () => true,
      })
    );

    expect(modalMarkup).toContain('Recommended: under 50 characters');
    expect(modalMarkup).toContain('Hints longer than 75 characters automatically wrap beneath the field during intake');
  });

  test('TC-IF-018-4: Exact length threshold boundaries (74, 75, 76, and 200 chars)', () => {
    const s74 = 'X'.repeat(74);
    const s75 = 'Y'.repeat(75);
    const s76 = 'Z'.repeat(76);
    const s200 = 'W'.repeat(200);

    // 74: Normal
    const r74 = resolveCustomFieldPlaceholderPresentation(s74, 'Text');
    expect(r74.isExpandedHint).toBe(false);
    expect(r74.inputPlaceholder).toBe(s74);
    expect(r74.helperHint).toBeUndefined();

    // 75: Normal (exact boundary limit)
    const r75 = resolveCustomFieldPlaceholderPresentation(s75, 'Text');
    expect(r75.isExpandedHint).toBe(false);
    expect(r75.inputPlaceholder).toBe(s75);
    expect(r75.helperHint).toBeUndefined();

    // 76: Expanded
    const r76 = resolveCustomFieldPlaceholderPresentation(s76, 'Text');
    expect(r76.isExpandedHint).toBe(true);
    expect(r76.inputPlaceholder).toBe(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    expect(r76.helperHint).toBe(s76);

    // 200: Expanded
    const r200 = resolveCustomFieldPlaceholderPresentation(s200, 'Text');
    expect(r200.isExpandedHint).toBe(true);
    expect(r200.inputPlaceholder).toBe(EXPANDED_PLACEHOLDER_INPUT_TEXT);
    expect(r200.helperHint).toBe(s200);
  });

  test('TC-IF-018-5: Invariant with active user values and validation errors', () => {
    const markupWithValAndErr = renderToStaticMarkup(
      React.createElement(DynamicCustomFieldsRenderer, {
        fields: [
          {
            id: 'cf-ref-notes',
            tenantId: 't1',
            clinicId: 'c1',
            entityType: 'ClinicPatient',
            fieldKey: 'referring_physician_notes',
            label: 'Referring Physician Notes',
            dataType: 'Text',
            isRequired: true,
            displayOrder: 1,
            placeholder: boundaryPrompt200,
            isActive: true,
          },
        ],
        values: {
          referring_physician_notes: 'Dr. Jane Doe, St. Jude Medical Center',
        },
        errors: {
          referring_physician_notes: 'PRC accreditation number missing in physician notes',
        },
        onChange: () => {},
      })
    );

    const normalizedMarkup = markupWithValAndErr.replace(/&#x27;/g, "'");
    // Input has the current typed value
    expect(normalizedMarkup).toContain('data-value="Dr. Jane Doe, St. Jude Medical Center"');
    // Error feedback is rendered
    expect(normalizedMarkup).toContain('PRC accreditation number missing in physician notes');
    // Wrapping guidance callout remains visible so staff can reference it
    expect(normalizedMarkup).toContain(boundaryPrompt200);
  });
});

