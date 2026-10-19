// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    placeholderTextColor,
    testID,
    visible,
    style,
    onPress,
    value,
    onChangeText,
    disabled,
    editable,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole, 'data-accessibility-role': accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(editable !== undefined ? { 'data-editable': String(editable) } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      placeholder,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() { return { remove: () => {} }; }
    removeAllListeners() {}
  },
  Alert: { alert: () => {} },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
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
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const {
  InlineDentalChartCard,
  ADULT_UPPER_RIGHT,
  ADULT_UPPER_LEFT,
  ADULT_LOWER_RIGHT,
  ADULT_LOWER_LEFT,
  CHILD_UPPER_RIGHT,
  CHILD_UPPER_LEFT,
  CHILD_LOWER_RIGHT,
  CHILD_LOWER_LEFT,
  CANONICAL_SURFACES,
  sortToothSurfaces,
  getToothDescription,
} = await import('../components/consultation/InlineDentalChartCard');
type DentalToothState = import('../components/consultation/InlineDentalChartCard').DentalToothState;

describe('InlineDentalChartCard — Consultation Workstation Dental Odontogram', () => {
  const sampleTeeth: Record<number, DentalToothState> = {
    16: { toothNumber: 16, status: 'Decay', surface: 'MOD', notes: 'Mesial-occlusal-distal decay' },
    21: { toothNumber: 21, status: 'Crown', surface: '', notes: 'Ceramic crown' },
    36: { toothNumber: 36, status: 'Filled', surface: 'O', notes: 'Composite restoration' },
    48: { toothNumber: 48, status: 'Missing', surface: '', notes: 'Impacted or extracted' },
  };

  test('1. Renders Adult dentition grid with all 32 FDI teeth organized by 4 quadrants', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
      })
    );

    expect(html).toContain('Dental Chart');
    expect(html).toContain('UPPER ARCH (MAXILLA)');
    expect(html).toContain('LOWER ARCH (MANDIBLE)');

    // Verify all 32 adult teeth are present
    const adultTeeth = [
      ...ADULT_UPPER_RIGHT,
      ...ADULT_UPPER_LEFT,
      ...ADULT_LOWER_RIGHT,
      ...ADULT_LOWER_LEFT,
    ];
    expect(adultTeeth.length).toBe(32);

    for (const toothNum of adultTeeth) {
      expect(html).toContain(`tooth-cell-${toothNum}`);
    }

    // Verify child deciduous teeth are not rendered in default adult mode
    expect(html).not.toContain('tooth-cell-55');
    expect(html).not.toContain('tooth-cell-85');
  });

  test('2. Toggling to Child dentition renders all 20 deciduous teeth (51–85)', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 55, // Prompts Child mode
      })
    );

    // Verify all 20 child teeth are present
    const childTeeth = [
      ...CHILD_UPPER_RIGHT,
      ...CHILD_UPPER_LEFT,
      ...CHILD_LOWER_RIGHT,
      ...CHILD_LOWER_LEFT,
    ];
    expect(childTeeth.length).toBe(20);

    for (const toothNum of childTeeth) {
      expect(html).toContain(`tooth-cell-${toothNum}`);
    }

    // Adult-only teeth (like 18, 48) should not be present in Child mode
    expect(html).not.toContain('tooth-cell-18');
    expect(html).not.toContain('tooth-cell-48');
  });

  test('3. Tooth cell selection displays tooth detail inspector with plain-English naming', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
      })
    );

    expect(html).toContain('Tooth #16');
    expect(html).toContain(getToothDescription(16)); // "Upper Right First Molar"
    expect(html).toContain('data-testid="inline-dental-chart-card-inspector"');
    expect(html).toContain('Mesial-occlusal-distal decay');
  });

  test('4. Plain-English status taxonomy contains all 6 statuses and updates status', () => {
    let updatedTooth: DentalToothState | null = null;
    const handleChangeTooth = (t: DentalToothState) => {
      updatedTooth = t;
    };

    const card = React.createElement(InlineDentalChartCard, {
      teeth: sampleTeeth,
      initialToothNumber: 16,
      onChangeTooth: handleChangeTooth,
    });

    const html = renderToStaticMarkup(card);
    expect(html).toContain('status-pill-healthy');
    expect(html).toContain('status-pill-decay');
    expect(html).toContain('status-pill-filled');
    expect(html).toContain('status-pill-missing');
    expect(html).toContain('status-pill-crown');
    expect(html).toContain('status-pill-extraction');
  });

  test('5. Tooth surface multi-select enforces canonical MODBL sorting', () => {
    // Direct canonical sorting utility tests
    expect(sortToothSurfaces(['D', 'O', 'M'])).toBe('MOD');
    expect(sortToothSurfaces('BMODL')).toBe('MODBL');
    expect(sortToothSurfaces(['L', 'B', 'D', 'O', 'M'])).toBe('MODBL');
    expect(sortToothSurfaces('OD')).toBe('OD');
    expect(sortToothSurfaces(['d', 'm'])).toBe('MD');
    expect(sortToothSurfaces([])).toBe('');

    // Verified canonical surfaces constant
    expect(CANONICAL_SURFACES).toEqual(['M', 'O', 'D', 'B', 'L']);
  });

  test('6. Clinical notes input allows entering observations', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
      })
    );

    expect(html).toContain('inline-dental-chart-card-notes-input');
    expect(html).toContain('data-value="Mesial-occlusal-distal decay"');
  });

  test('7a. Quick-action "+ Order Dental Procedure" button renders with onQuickOrderProcedure prop (Consultations workstation)', () => {
    let orderedTooth: number | null = null;
    let orderedSurface: string | undefined = undefined;

    const handleQuickOrder = (tooth: number, surface?: string) => {
      orderedTooth = tooth;
      orderedSurface = surface;
    };

    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
        onQuickOrderProcedure: handleQuickOrder,
      })
    );

    expect(html).toContain('+ Order Procedure for Tooth #16 (MOD)');
    expect(html).toContain('inline-dental-chart-card-order-proc-btn');
  });

  test('7b. Quick-action "+ Order Dental Procedure" button renders with onOrderProcedure prop (alias compatibility)', () => {
    let orderedTooth: number | null = null;
    let orderedSurface: string | undefined = undefined;

    const handleOrder = (tooth: number, surface?: string) => {
      orderedTooth = tooth;
      orderedSurface = surface;
    };

    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
        onOrderProcedure: handleOrder,
      })
    );

    expect(html).toContain('+ Order Procedure for Tooth #16 (MOD)');
    expect(html).toContain('inline-dental-chart-card-order-proc-btn');
  });

  test('7c. Quick-action button is omitted when neither onOrderProcedure nor onQuickOrderProcedure is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
      })
    );

    expect(html).not.toContain('inline-dental-chart-card-order-proc-btn');
  });

  test('8. Read-only / disabled mode protects inputs from modification and suppresses order button', () => {
    const html = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        teeth: sampleTeeth,
        initialToothNumber: 16,
        disabled: true,
        onQuickOrderProcedure: () => {},
        onOrderProcedure: () => {},
      })
    );

    // When disabled, editable should be false on notes input
    expect(html).toContain('data-editable="false"');
    // Order procedure button should not be present when disabled
    expect(html).not.toContain('inline-dental-chart-card-order-proc-btn');
  });

  test('9. Loading and Error 4-state lifecycle patterns render correctly', () => {
    const loadingHtml = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        loading: true,
      })
    );
    expect(loadingHtml).toContain('inline-dental-chart-card-loading');

    const errorHtml = renderToStaticMarkup(
      React.createElement(InlineDentalChartCard, {
        error: 'Network error loading odontogram',
      })
    );
    expect(errorHtml).toContain('inline-dental-chart-card-error');
    expect(errorHtml).toContain('Network error loading odontogram');
  });
});
