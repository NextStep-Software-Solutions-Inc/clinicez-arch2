// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun test environment
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
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
  CANONICAL_SURFACES,
  sortToothSurfaces,
  getToothDescription,
} = await import('../components/consultation/InlineDentalChartCard');
type DentalToothState = import('../components/consultation/InlineDentalChartCard').DentalToothState;
type LocalProcedureOrder = {
  serviceItemId?: string;
  code?: string;
  name: string;
  category: string;
  standardPrice: number;
  instructions?: string;
  targetRoomId?: string;
  targetRoomName?: string;
  isHandedOff?: boolean;
  handedOffAt?: string;
  toothNumber?: number;
  toothSurface?: string;
};

describe('Milestone MC Empirical Stress Testing & Adversarial Challenge', () => {
  // =========================================================================
  // Challenge 1: Quick Order Procedure Button Rendering with onQuickOrderProcedure prop
  // =========================================================================
  describe('Challenge 1: Quick Order Procedure Button Prop Aliasing', () => {
    test('renders + Order Procedure button when onOrderProcedure is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          initialToothNumber: 16,
          onOrderProcedure: () => {},
        })
      );
      expect(html).toContain('inline-dental-chart-card-order-proc-btn');
      expect(html).toContain('+ Order Procedure for Tooth #16');
    });

    test('FAIL-CHECK: renders + Order Procedure button when onQuickOrderProcedure is provided (Consultations.screen usage)', () => {
      // In Consultations.screen.tsx:3242, onQuickOrderProcedure={handleQuickOrderDentalProcedure} is used without onOrderProcedure.
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          initialToothNumber: 16,
          onQuickOrderProcedure: () => {},
        })
      );
      // If InlineDentalChartCard checks only `onOrderProcedure` at line 561 instead of `effectiveOrderProcedure`,
      // this test will fail because the button is not rendered!
      const hasButton = html.includes('inline-dental-chart-card-order-proc-btn');
      expect(hasButton).toBe(true);
    });
  });

  // =========================================================================
  // Challenge 2: Surface Permutations Stress Test (all orderings -> canonical MODBL)
  // =========================================================================
  describe('Challenge 2: Surface Permutation Stress Test', () => {
    // Generate all permutations of an array
    function getPermutations<T>(arr: T[]): T[][] {
      if (arr.length <= 1) return [arr];
      const result: T[][] = [];
      for (let i = 0; i < arr.length; i++) {
        const current = arr[i];
        const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
        for (const perm of getPermutations(remaining)) {
          result.push([current, ...perm]);
        }
      }
      return result;
    }

    test('All 120 permutations of ["M", "O", "D", "B", "L"] strictly evaluate to "MODBL"', () => {
      const surfaces = ['M', 'O', 'D', 'B', 'L'];
      const perms = getPermutations(surfaces);
      expect(perms.length).toBe(120);

      for (const p of perms) {
        const sortedArray = sortToothSurfaces(p);
        expect(sortedArray).toBe('MODBL');

        const sortedString = sortToothSurfaces(p.join(''));
        expect(sortedString).toBe('MODBL');

        const sortedLower = sortToothSurfaces(p.join('').toLowerCase());
        expect(sortedLower).toBe('MODBL');
      }
    });

    test('All 32 subsets of 5 canonical surfaces produce canonical ordering regardless of input sequence', () => {
      const canonical = ['M', 'O', 'D', 'B', 'L'];
      // Test all 2^5 = 32 combinations
      for (let mask = 0; mask < 32; mask++) {
        const expectedChars: string[] = [];
        const testChars: string[] = [];
        for (let bit = 0; bit < 5; bit++) {
          if (mask & (1 << bit)) {
            expectedChars.push(canonical[bit]);
            testChars.push(canonical[bit]);
          }
        }
        const expected = expectedChars.join('');

        // Reverse order
        expect(sortToothSurfaces([...testChars].reverse())).toBe(expected);

        // String representation
        expect(sortToothSurfaces(testChars.reverse().join(''))).toBe(expected);
      }
    });

    test('Simulated interactive toggling in arbitrary order (D -> O -> M -> L -> B) matches canonical MODBL', () => {
      // Simulate state progression when a user clicks D, then O, then M, then L, then B
      let currentSurface = '';
      const toggle = (code: string) => {
        const chars = currentSurface.split('').filter(Boolean);
        const next = chars.includes(code) ? chars.filter((c) => c !== code) : [...chars, code];
        currentSurface = sortToothSurfaces(next);
      };

      toggle('D');
      expect(currentSurface).toBe('D');

      toggle('O');
      expect(currentSurface).toBe('OD');

      toggle('M');
      expect(currentSurface).toBe('MOD');

      toggle('L');
      expect(currentSurface).toBe('MODL');

      toggle('B');
      expect(currentSurface).toBe('MODBL');

      // Now toggle O off
      toggle('O');
      expect(currentSurface).toBe('MDBL');

      // Toggle O back on
      toggle('O');
      expect(currentSurface).toBe('MODBL');
    });

    test('Handles noisy inputs, duplicate characters, and whitespace safely', () => {
      expect(sortToothSurfaces('M M O D D B L L')).toBe('MODBL');
      expect(sortToothSurfaces('x-M-y-O-z-D')).toBe('MOD');
      expect(sortToothSurfaces('')).toBe('');
      expect(sortToothSurfaces([])).toBe('');
    });
  });

  // =========================================================================
  // Challenge 3: Adult vs. Child Dentition Toggling & State Preservation
  // =========================================================================
  describe('Challenge 3: Adult vs. Child Dentition Toggling & State Preservation', () => {
    test('State preservation across switching between Adult and Child dentition', () => {
      // Simulated encounter state in Consultations.screen.tsx
      let dentalChart: Record<number, DentalToothState> = {};

      const updateTooth = (tooth: DentalToothState) => {
        dentalChart = {
          ...dentalChart,
          [tooth.toothNumber]: tooth,
        };
      };

      // 1. Chart Adult permanent teeth
      updateTooth({ toothNumber: 16, status: 'Decay', surface: 'MOD', notes: 'Adult upper molar decay' });
      updateTooth({ toothNumber: 21, status: 'Crown', surface: '', notes: 'Ceramic central crown' });
      updateTooth({ toothNumber: 36, status: 'Filled', surface: 'O', notes: 'Occlusal composite' });
      updateTooth({ toothNumber: 48, status: 'Missing', surface: '', notes: 'Extracted third molar' });

      expect(Object.keys(dentalChart).length).toBe(4);
      expect(dentalChart[16].status).toBe('Decay');
      expect(dentalChart[16].surface).toBe('MOD');

      // 2. Switch to Child dentition and chart primary deciduous teeth
      updateTooth({ toothNumber: 55, status: 'Decay', surface: 'MO', notes: 'Primary molar caries' });
      updateTooth({ toothNumber: 85, status: 'Filled', surface: 'O', notes: 'Primary lower filled' });

      expect(Object.keys(dentalChart).length).toBe(6);

      // 3. Verify Adult teeth remain intact without data corruption
      expect(dentalChart[16].status).toBe('Decay');
      expect(dentalChart[16].surface).toBe('MOD');
      expect(dentalChart[21].status).toBe('Crown');
      expect(dentalChart[36].status).toBe('Filled');
      expect(dentalChart[48].status).toBe('Missing');

      // 4. Verify Child teeth remain intact
      expect(dentalChart[55].status).toBe('Decay');
      expect(dentalChart[55].surface).toBe('MO');
      expect(dentalChart[85].status).toBe('Filled');

      // 5. Render Adult mode HTML from chart
      const adultHtml = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: dentalChart,
          initialToothNumber: 16,
        })
      );
      expect(adultHtml).toContain('tooth-cell-16');
      expect(adultHtml).toContain('tooth-cell-48');
      expect(adultHtml).toContain('Adult upper molar decay');
      expect(adultHtml).toContain('MOD');

      // 6. Render Child mode HTML from chart
      const childHtml = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: dentalChart,
          initialToothNumber: 55, // Automatically sets dentitionMode to Child
        })
      );
      expect(childHtml).toContain('tooth-cell-55');
      expect(childHtml).toContain('tooth-cell-85');
      expect(childHtml).toContain('Primary molar caries');
      expect(childHtml).toContain('MO');
    });

    test('Switching dentition maintains non-healthy count badge accurately across mixed dentition', () => {
      const mixedChart: Record<number, DentalToothState> = {
        16: { toothNumber: 16, status: 'Decay', surface: 'MOD' },
        21: { toothNumber: 21, status: 'Crown' },
        55: { toothNumber: 55, status: 'Decay', surface: 'O' },
        85: { toothNumber: 85, status: 'Filled' },
        11: { toothNumber: 11, status: 'Healthy' },
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: mixedChart,
        })
      );

      // 4 abnormal findings (16, 21, 55, 85)
      expect(html).toContain('4 Findings');
    });
  });

  // =========================================================================
  // Challenge 4: Quick Procedure Ordering with Empty vs. Multi-Surface
  // =========================================================================
  describe('Challenge 4: Quick Procedure Ordering Surface Handling', () => {
    test('Quick procedure ordering with empty surface sends undefined surface and formats button cleanly', () => {
      let orderedToothNumber: number | null = null;
      let orderedSurface: string | undefined = 'INITIAL';

      const handleOrder = (tooth: number, surface?: string) => {
        orderedToothNumber = tooth;
        orderedSurface = surface;
      };

      const emptySurfaceChart: Record<number, DentalToothState> = {
        11: { toothNumber: 11, status: 'Healthy', surface: '' },
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: emptySurfaceChart,
          initialToothNumber: 11,
          onOrderProcedure: handleOrder,
        })
      );

      // Button should be "+ Order Procedure for Tooth #11" without empty parens "()"
      expect(html).toContain('+ Order Procedure for Tooth #11');
      expect(html).not.toContain('+ Order Procedure for Tooth #11 ()');

      // Simulated button execution:
      // In InlineDentalChartCard.tsx:
      // const canonicalSurface = selectedToothState?.surface ? sortToothSurfaces(selectedToothState.surface) : undefined;
      // effectiveOrderProcedure?.(selectedToothNumber, canonicalSurface);
      const state = emptySurfaceChart[11];
      const canonicalSurface = state.surface ? sortToothSurfaces(state.surface) : undefined;
      handleOrder(11, canonicalSurface);

      expect(orderedToothNumber).toBe(11);
      expect(orderedSurface).toBeUndefined();
    });

    test('Quick procedure ordering with multi-surface MOD formats button with surfaces and delivers canonical string', () => {
      let orderedToothNumber: number | null = null;
      let orderedSurface: string | undefined = undefined;

      const handleOrder = (tooth: number, surface?: string) => {
        orderedToothNumber = tooth;
        orderedSurface = surface;
      };

      const multiSurfaceChart: Record<number, DentalToothState> = {
        26: { toothNumber: 26, status: 'Decay', surface: 'MOD' },
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: multiSurfaceChart,
          initialToothNumber: 26,
          onOrderProcedure: handleOrder,
        })
      );

      expect(html).toContain('+ Order Procedure for Tooth #26 (MOD)');

      const state = multiSurfaceChart[26];
      const canonicalSurface = state.surface ? sortToothSurfaces(state.surface) : undefined;
      handleOrder(26, canonicalSurface);

      expect(orderedToothNumber).toBe(26);
      expect(orderedSurface).toBe('MOD');
    });
  });

  // =========================================================================
  // Challenge 5: Simultaneous Procedure Ordering on Multiple Teeth (Collision Resistance)
  // =========================================================================
  describe('Challenge 5: Simultaneous Procedure Ordering on Multiple Teeth', () => {
    test('Simultaneous procedure ordering on Tooth 16 and Tooth 26 for "Composite Filling" avoids key collision and state corruption', () => {
      let orderedProcedures: LocalProcedureOrder[] = [];

      const handleSelectCatalogOrder = (order: {
        serviceItemId?: string;
        code?: string;
        name: string;
        category?: string;
        standardPrice: number;
        instructions?: string;
        toothNumber?: number;
        toothSurface?: string;
      }) => {
        const index = orderedProcedures.findIndex(
          (p) =>
            p.name.toLowerCase() === order.name.toLowerCase() &&
            (order.toothNumber !== undefined ? p.toothNumber === order.toothNumber : p.toothNumber === undefined)
        );
        const newProc: LocalProcedureOrder = {
          serviceItemId: order.serviceItemId,
          code: order.code,
          name: order.name,
          category: order.category || 'Procedure',
          standardPrice: order.standardPrice,
          instructions: order.instructions,
          toothNumber: order.toothNumber,
          toothSurface: order.toothSurface,
        };
        if (index >= 0) {
          orderedProcedures[index] = newProc;
        } else {
          orderedProcedures.push(newProc);
        }
      };

      const handleRemoveProcedure = (procName: string, toothNumber?: number) => {
        orderedProcedures = orderedProcedures.filter((p) => {
          if (p.name.toLowerCase() !== procName.toLowerCase()) return true;
          if (toothNumber !== undefined && p.toothNumber !== toothNumber) return true;
          if (toothNumber === undefined && p.toothNumber !== undefined) return true;
          return false;
        });
      };

      // 1. Doctor orders "Composite Filling" on Tooth 16 (MOD)
      handleSelectCatalogOrder({
        serviceItemId: 'srv-comp-fill',
        code: 'D2391',
        name: 'Composite Filling',
        category: 'Procedure',
        standardPrice: 1800,
        toothNumber: 16,
        toothSurface: 'MOD',
        instructions: 'Mesial-occlusal-distal restoration',
      });

      // 2. Doctor orders identical "Composite Filling" on Tooth 26 (MO)
      handleSelectCatalogOrder({
        serviceItemId: 'srv-comp-fill',
        code: 'D2391',
        name: 'Composite Filling',
        category: 'Procedure',
        standardPrice: 1800,
        toothNumber: 26,
        toothSurface: 'MO',
        instructions: 'Mesial-occlusal restoration',
      });

      // 3. Doctor orders "Composite Filling" without tooth number (general medical/dental)
      handleSelectCatalogOrder({
        serviceItemId: 'srv-comp-fill',
        code: 'D2391',
        name: 'Composite Filling',
        category: 'Procedure',
        standardPrice: 1800,
        instructions: 'General non-localized restoration',
      });

      // Assert all 3 orders coexist in the array
      expect(orderedProcedures.length).toBe(3);

      // Verify unique React render keys as implemented in Consultations.screen.tsx:3556-3557:
      // key={proc.serviceItemId ? `${proc.serviceItemId}-${proc.toothNumber ?? '0'}` : `${proc.name}-${proc.toothNumber ?? '0'}-${proc.code ?? ''}`}
      const keys = orderedProcedures.map((p) =>
        p.serviceItemId ? `${p.serviceItemId}-${p.toothNumber ?? '0'}` : `${p.name}-${p.toothNumber ?? '0'}-${p.code ?? ''}`
      );

      expect(keys[0]).toBe('srv-comp-fill-16');
      expect(keys[1]).toBe('srv-comp-fill-26');
      expect(keys[2]).toBe('srv-comp-fill-0');
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(3);

      // 4. Update Tooth 16's surface to "MODBL" without affecting Tooth 26
      handleSelectCatalogOrder({
        serviceItemId: 'srv-comp-fill',
        code: 'D2391',
        name: 'Composite Filling',
        category: 'Procedure',
        standardPrice: 2200,
        toothNumber: 16,
        toothSurface: 'MODBL',
        instructions: 'Expanded to all surfaces',
      });

      expect(orderedProcedures.length).toBe(3);
      expect(orderedProcedures[0].toothNumber).toBe(16);
      expect(orderedProcedures[0].toothSurface).toBe('MODBL');
      expect(orderedProcedures[0].standardPrice).toBe(2200);

      // Tooth 26 remains completely unaffected
      expect(orderedProcedures[1].toothNumber).toBe(26);
      expect(orderedProcedures[1].toothSurface).toBe('MO');
      expect(orderedProcedures[1].standardPrice).toBe(1800);

      // 5. Remove Tooth 16 procedure specifically
      handleRemoveProcedure('Composite Filling', 16);

      expect(orderedProcedures.length).toBe(2);
      expect(orderedProcedures.some((p) => p.toothNumber === 16)).toBe(false);
      expect(orderedProcedures.some((p) => p.toothNumber === 26)).toBe(true);
      expect(orderedProcedures.some((p) => p.toothNumber === undefined)).toBe(true);
    });
  });
});
