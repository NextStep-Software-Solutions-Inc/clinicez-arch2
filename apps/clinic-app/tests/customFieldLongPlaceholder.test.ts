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
    placeholder,
    value,
    onPress,
    title,
    visible,
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(title ? { 'data-title': title } : {}),
        onClick: onPress,
      },
      title,
      placeholder,
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
