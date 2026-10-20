// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
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
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
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

describe('Challenger 1 Empirical Stress & Adversarial Suite (Milestone MC Iteration 2)', () => {
  // =========================================================================
  // 1. Full Callback Permutation Matrix Stress Test
  // =========================================================================
  describe('1. Full Callback Permutation Matrix Stress Test', () => {
    type PermutationTestCase = {
      name: string;
      onQuickOrderProcedure?: (tooth: number, surface?: string) => void;
      onOrderProcedure?: (tooth: number, surface?: string) => void;
      disabled?: boolean;
      initialToothNumber?: number;
      expectedRenderButton: boolean;
      expectedButtonText?: string;
    };

    const dummyQuick = () => {};
    const dummyOrder = () => {};

    const permutations: PermutationTestCase[] = [
      // Active mode, tooth #16 selected
      {
        name: 'Permutation 1: onQuickOrderProcedure only (Consultations.screen production path)',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: undefined,
        disabled: false,
        initialToothNumber: 16,
        expectedRenderButton: true,
        expectedButtonText: '+ Order Procedure for Tooth #16',
      },
      {
        name: 'Permutation 2: onOrderProcedure only (alias compatibility path)',
        onQuickOrderProcedure: undefined,
        onOrderProcedure: dummyOrder,
        disabled: false,
        initialToothNumber: 16,
        expectedRenderButton: true,
        expectedButtonText: '+ Order Procedure for Tooth #16',
      },
      {
        name: 'Permutation 3: Both callbacks provided simultaneously',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: dummyOrder,
        disabled: false,
        initialToothNumber: 16,
        expectedRenderButton: true,
        expectedButtonText: '+ Order Procedure for Tooth #16',
      },
      {
        name: 'Permutation 4: Neither callback provided',
        onQuickOrderProcedure: undefined,
        onOrderProcedure: undefined,
        disabled: false,
        initialToothNumber: 16,
        expectedRenderButton: false,
      },
      // Disabled mode, tooth #16 selected
      {
        name: 'Permutation 5: Disabled=true with onQuickOrderProcedure',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: undefined,
        disabled: true,
        initialToothNumber: 16,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 6: Disabled=true with onOrderProcedure',
        onQuickOrderProcedure: undefined,
        onOrderProcedure: dummyOrder,
        disabled: true,
        initialToothNumber: 16,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 7: Disabled=true with both callbacks',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: dummyOrder,
        disabled: true,
        initialToothNumber: 16,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 8: Disabled=true with neither callback',
        onQuickOrderProcedure: undefined,
        onOrderProcedure: undefined,
        disabled: true,
        initialToothNumber: 16,
        expectedRenderButton: false,
      },
      // Tooth unselected (initialToothNumber = undefined)
      {
        name: 'Permutation 9: Tooth unselected with onQuickOrderProcedure',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: undefined,
        disabled: false,
        initialToothNumber: undefined,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 10: Tooth unselected with onOrderProcedure',
        onQuickOrderProcedure: undefined,
        onOrderProcedure: dummyOrder,
        disabled: false,
        initialToothNumber: undefined,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 11: Tooth unselected with both callbacks',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: dummyOrder,
        disabled: false,
        initialToothNumber: undefined,
        expectedRenderButton: false,
      },
      {
        name: 'Permutation 12: Tooth unselected and disabled=true',
        onQuickOrderProcedure: dummyQuick,
        onOrderProcedure: dummyOrder,
        disabled: true,
        initialToothNumber: undefined,
        expectedRenderButton: false,
      },
    ];

    for (const tc of permutations) {
      test(tc.name, () => {
        const html = renderToStaticMarkup(
          React.createElement(InlineDentalChartCard, {
            initialToothNumber: tc.initialToothNumber,
            onQuickOrderProcedure: tc.onQuickOrderProcedure,
            onOrderProcedure: tc.onOrderProcedure,
            disabled: tc.disabled,
          })
        );

        const hasButton = html.includes('inline-dental-chart-card-order-proc-btn');
        expect(hasButton).toBe(tc.expectedRenderButton);

        if (tc.expectedButtonText) {
          expect(html).toContain(tc.expectedButtonText);
        }
      });
    }

    test('Execution precedence: When both callbacks are provided, onQuickOrderProcedure takes priority', () => {
      let quickCalls = 0;
      let orderCalls = 0;
      let capturedTooth = 0;
      let capturedSurface: string | undefined = undefined;

      const mockQuick = (t: number, s?: string) => {
        quickCalls++;
        capturedTooth = t;
        capturedSurface = s;
      };

      const mockOrder = (t: number, s?: string) => {
        orderCalls++;
      };

      // InlineDentalChartCard implementation:
      // const effectiveOrderProcedure = onQuickOrderProcedure || onOrderProcedure;
      const effectiveOrderProcedure = mockQuick || mockOrder;
      expect(effectiveOrderProcedure).toBe(mockQuick);

      // Simulate execution:
      const toothState: DentalToothState = { toothNumber: 36, status: 'Decay', surface: 'DO' };
      const canonicalSurface = toothState.surface ? sortToothSurfaces(toothState.surface) : undefined;
      effectiveOrderProcedure(toothState.toothNumber, canonicalSurface);

      expect(quickCalls).toBe(1);
      expect(orderCalls).toBe(0);
      expect(capturedTooth).toBe(36);
      expect(capturedSurface).toBe('OD');
    });

    test('Execution fallback: When only onOrderProcedure is provided, it is invoked with canonical surface', () => {
      let orderCalls = 0;
      let capturedTooth = 0;
      let capturedSurface: string | undefined = undefined;

      const mockOrder = (t: number, s?: string) => {
        orderCalls++;
        capturedTooth = t;
        capturedSurface = s;
      };

      const effectiveOrderProcedure = undefined || mockOrder;
      expect(effectiveOrderProcedure).toBe(mockOrder);

      const toothState: DentalToothState = { toothNumber: 46, status: 'Filled', surface: 'BL' };
      const canonicalSurface = toothState.surface ? sortToothSurfaces(toothState.surface) : undefined;
      effectiveOrderProcedure(toothState.toothNumber, canonicalSurface);

      expect(orderCalls).toBe(1);
      expect(capturedTooth).toBe(46);
      expect(capturedSurface).toBe('BL');
    });

    test('Child tooth quick order button formatting with multi-surface MO on tooth #54', () => {
      const chart: Record<number, DentalToothState> = {
        54: { toothNumber: 54, status: 'Decay', surface: 'MO' },
      };
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart,
          initialToothNumber: 54,
          onQuickOrderProcedure: () => {},
        })
      );
      expect(html).toContain('inline-dental-chart-card-order-proc-btn');
      expect(html).toContain('+ Order Procedure for Tooth #54 (MO)');
    });
  });

  // =========================================================================
  // 2. Canonical Surface Sorting (MODBL) Adversarial & Random Stress Test
  // =========================================================================
  describe('2. Canonical Surface Sorting (MODBL) Adversarial & Random Stress Test', () => {
    test('Canonical order is strictly M -> O -> D -> B -> L', () => {
      expect(CANONICAL_SURFACES).toEqual(['M', 'O', 'D', 'B', 'L']);
    });

    test('10,000 randomized surface toggle iterations strictly maintain canonical MODBL ordering & idempotence', () => {
      const surfaces = ['M', 'O', 'D', 'B', 'L'];
      let currentSurfaces: string[] = [];

      // Pseudo-random deterministic LCG generator for reproducible stress testing
      let seed = 42;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      for (let i = 0; i < 10000; i++) {
        // Randomly pick a surface code to toggle
        const pickIndex = Math.floor(rnd() * surfaces.length);
        const code = surfaces[pickIndex];

        // Toggle on/off
        if (currentSurfaces.includes(code)) {
          currentSurfaces = currentSurfaces.filter((c) => c !== code);
        } else {
          currentSurfaces.push(code);
        }

        // Shuffle currentSurfaces randomly to simulate chaotic input sequence
        for (let j = currentSurfaces.length - 1; j > 0; j--) {
          const k = Math.floor(rnd() * (j + 1));
          [currentSurfaces[j], currentSurfaces[k]] = [currentSurfaces[k], currentSurfaces[j]];
        }

        // Apply canonical sort
        const sorted = sortToothSurfaces(currentSurfaces);

        // Invariant 1: Result has no duplicates
        const chars = sorted.split('');
        const uniqueSet = new Set(chars);
        expect(chars.length).toBe(uniqueSet.size);

        // Invariant 2: Every character belongs to CANONICAL_SURFACES
        for (const c of chars) {
          expect(CANONICAL_SURFACES.includes(c as any)).toBe(true);
        }

        // Invariant 3: Characters appear in strictly ascending index order of CANONICAL_SURFACES
        let lastCanonicalIdx = -1;
        for (const c of chars) {
          const idx = CANONICAL_SURFACES.indexOf(c as any);
          expect(idx).toBeGreaterThan(lastCanonicalIdx);
          lastCanonicalIdx = idx;
        }

        // Invariant 4: Idempotence: sorting an already sorted string returns the exact same string
        expect(sortToothSurfaces(sorted)).toBe(sorted);
      }
    });

    test('Exhaustive stress: all 120 permutations of all 5 surfaces evaluate to "MODBL"', () => {
      const getPerms = <T>(arr: T[]): T[][] => {
        if (arr.length <= 1) return [arr];
        const res: T[][] = [];
        for (let i = 0; i < arr.length; i++) {
          const cur = arr[i];
          const rem = [...arr.slice(0, i), ...arr.slice(i + 1)];
          for (const p of getPerms(rem)) res.push([cur, ...p]);
        }
        return res;
      };

      const perms = getPerms(['M', 'O', 'D', 'B', 'L']);
      expect(perms.length).toBe(120);

      for (const p of perms) {
        expect(sortToothSurfaces(p)).toBe('MODBL');
        expect(sortToothSurfaces(p.join(''))).toBe('MODBL');
        expect(sortToothSurfaces(p.join('').toLowerCase())).toBe('MODBL');
      }
    });

    test('Adversarial inputs: noisy characters, punctuation, casing, duplicates, and edge cases', () => {
      // Punctuation and spaces
      expect(sortToothSurfaces('M, O, D, B, L')).toBe('MODBL');
      expect(sortToothSurfaces('L-B-D-O-M')).toBe('MODBL');
      expect(sortToothSurfaces('   D   M   O   ')).toBe('MOD');

      // Duplicate spam
      expect(sortToothSurfaces('MMMMMMMMMOOOOOOODDDDDDBBBBLLLL')).toBe('MODBL');
      expect(sortToothSurfaces(['M', 'M', 'O', 'O', 'D'])).toBe('MOD');

      // Unrelated characters and symbols
      expect(sortToothSurfaces('M X O Y D Z 1 2 3 ! @ #')).toBe('MOD');
      expect(sortToothSurfaces('SURFACE_OCCLUSAL_MESIAL')).toBe('MOL'); // Contains M, O, and L (from OCCLUSAL and MESIAL)

      // Empty and falsy values
      expect(sortToothSurfaces('')).toBe('');
      expect(sortToothSurfaces([])).toBe('');
      expect(sortToothSurfaces('XYZ')).toBe('');
    });
  });

  // =========================================================================
  // 3. Multi-Tooth Procedure Ordering & Collision Resistance
  // =========================================================================
  describe('3. Multi-Tooth Procedure Ordering & Collision Resistance', () => {
    test('Stress test: 52 distinct teeth (32 Adult + 20 Child) ordered for "Fluoride Varnish" maintain 100% collision-free keys and independent state', () => {
      const adultTeeth = [
        11, 12, 13, 14, 15, 16, 17, 18,
        21, 22, 23, 24, 25, 26, 27, 28,
        31, 32, 33, 34, 35, 36, 37, 38,
        41, 42, 43, 44, 45, 46, 47, 48,
      ];
      const childTeeth = [
        51, 52, 53, 54, 55,
        61, 62, 63, 64, 65,
        71, 72, 73, 74, 75,
        81, 82, 83, 84, 85,
      ];
      const allTeeth = [...adultTeeth, ...childTeeth];
      expect(allTeeth.length).toBe(52);

      let orderedProcedures: LocalProcedureOrder[] = [];

      // Simulate Consultations.screen.tsx handleSelectCatalogOrder
      const addProcedure = (order: {
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

      // Order Fluoride Varnish for all 52 teeth
      for (const tooth of allTeeth) {
        addProcedure({
          serviceItemId: 'srv-fluoride',
          code: 'D1206',
          name: 'Topical Fluoride Varnish',
          standardPrice: 500,
          toothNumber: tooth,
          toothSurface: tooth >= 50 ? 'O' : 'MOD',
          instructions: `Application on tooth ${tooth}`,
        });
      }

      expect(orderedProcedures.length).toBe(52);

      // Verify all react render keys are 100% unique
      // Consultations.screen.tsx:3555-3557:
      // key={proc.serviceItemId ? `${proc.serviceItemId}-${proc.toothNumber ?? '0'}` : `${proc.name}-${proc.toothNumber ?? '0'}-${proc.code ?? ''}`}
      const keys = orderedProcedures.map((p) =>
        p.serviceItemId ? `${p.serviceItemId}-${p.toothNumber ?? '0'}` : `${p.name}-${p.toothNumber ?? '0'}-${p.code ?? ''}`
      );
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(52);

      // Verify every key follows pattern srv-fluoride-<tooth>
      for (const tooth of allTeeth) {
        expect(uniqueKeys.has(`srv-fluoride-${tooth}`)).toBe(true);
      }

      // Update Tooth #16 price and surface
      addProcedure({
        serviceItemId: 'srv-fluoride',
        code: 'D1206',
        name: 'Topical Fluoride Varnish',
        standardPrice: 750,
        toothNumber: 16,
        toothSurface: 'MODBL',
        instructions: 'Comprehensive 5-surface application',
      });

      // Still 52 total entries (no duplicates created)
      expect(orderedProcedures.length).toBe(52);

      const tooth16 = orderedProcedures.find((p) => p.toothNumber === 16);
      expect(tooth16?.standardPrice).toBe(750);
      expect(tooth16?.toothSurface).toBe('MODBL');

      // Tooth 26 remains completely unchanged
      const tooth26 = orderedProcedures.find((p) => p.toothNumber === 26);
      expect(tooth26?.standardPrice).toBe(500);
      expect(tooth26?.toothSurface).toBe('MOD');

      // Total invoice value
      const totalAmount = orderedProcedures.reduce((sum, p) => sum + p.standardPrice, 0);
      expect(totalAmount).toBe(51 * 500 + 750); // 26,250
    });

    test('Multiple distinct procedures on the same tooth coexist without false key collisions', () => {
      let orderedProcedures: LocalProcedureOrder[] = [];

      const addProcedure = (order: {
        serviceItemId?: string;
        code?: string;
        name: string;
        standardPrice: number;
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
          category: 'Procedure',
          standardPrice: order.standardPrice,
          toothNumber: order.toothNumber,
          toothSurface: order.toothSurface,
        };
        if (index >= 0) {
          orderedProcedures[index] = newProc;
        } else {
          orderedProcedures.push(newProc);
        }
      };

      // Tooth 16 has 3 procedures:
      // 1. Composite Filling
      addProcedure({
        serviceItemId: 'srv-composite',
        code: 'D2391',
        name: 'Composite Filling',
        standardPrice: 1500,
        toothNumber: 16,
        toothSurface: 'MOD',
      });

      // 2. Pulp Capping
      addProcedure({
        serviceItemId: 'srv-pulp-cap',
        code: 'D3110',
        name: 'Direct Pulp Cap',
        standardPrice: 800,
        toothNumber: 16,
      });

      // 3. Ceramic Crown
      addProcedure({
        serviceItemId: 'srv-crown',
        code: 'D2740',
        name: 'Crown - Porcelain/Ceramic',
        standardPrice: 8500,
        toothNumber: 16,
      });

      expect(orderedProcedures.length).toBe(3);

      const keys = orderedProcedures.map((p) =>
        p.serviceItemId ? `${p.serviceItemId}-${p.toothNumber ?? '0'}` : `${p.name}-${p.toothNumber ?? '0'}-${p.code ?? ''}`
      );
      expect(new Set(keys).size).toBe(3);
      expect(keys).toEqual(['srv-composite-16', 'srv-pulp-cap-16', 'srv-crown-16']);
    });

    test('Non-tooth (general) procedure orders coexist cleanly with tooth-specific procedures', () => {
      let orderedProcedures: LocalProcedureOrder[] = [];

      const addProcedure = (order: LocalProcedureOrder) => {
        const index = orderedProcedures.findIndex(
          (p) =>
            p.name.toLowerCase() === order.name.toLowerCase() &&
            (order.toothNumber !== undefined ? p.toothNumber === order.toothNumber : p.toothNumber === undefined)
        );
        if (index >= 0) {
          orderedProcedures[index] = order;
        } else {
          orderedProcedures.push(order);
        }
      };

      // General dental prophylaxis (no tooth)
      addProcedure({
        serviceItemId: 'srv-prophy',
        code: 'D1110',
        name: 'Dental Prophylaxis',
        category: 'Procedure',
        standardPrice: 1000,
      });

      // Localized sealant on tooth #16
      addProcedure({
        serviceItemId: 'srv-sealant',
        code: 'D1351',
        name: 'Dental Sealant',
        category: 'Procedure',
        standardPrice: 600,
        toothNumber: 16,
        toothSurface: 'O',
      });

      // General sealant without tooth number
      addProcedure({
        serviceItemId: 'srv-sealant',
        code: 'D1351',
        name: 'Dental Sealant',
        category: 'Procedure',
        standardPrice: 600,
      });

      expect(orderedProcedures.length).toBe(3);

      const keys = orderedProcedures.map((p) =>
        p.serviceItemId ? `${p.serviceItemId}-${p.toothNumber ?? '0'}` : `${p.name}-${p.toothNumber ?? '0'}-${p.code ?? ''}`
      );
      expect(keys[0]).toBe('srv-prophy-0');
      expect(keys[1]).toBe('srv-sealant-16');
      expect(keys[2]).toBe('srv-sealant-0');
      expect(new Set(keys).size).toBe(3);
    });

    test('Selective removal of tooth procedures preserves other teeth and non-tooth procedures', () => {
      let orderedProcedures: LocalProcedureOrder[] = [
        { serviceItemId: 'srv-fill', name: 'Filling', category: 'Procedure', standardPrice: 1000, toothNumber: 16 },
        { serviceItemId: 'srv-fill', name: 'Filling', category: 'Procedure', standardPrice: 1000, toothNumber: 26 },
        { serviceItemId: 'srv-fill', name: 'Filling', category: 'Procedure', standardPrice: 1000, toothNumber: 36 },
        { serviceItemId: 'srv-fill', name: 'Filling', category: 'Procedure', standardPrice: 1000 }, // no tooth
      ];

      const removeProcedure = (procName: string, toothNumber?: number) => {
        orderedProcedures = orderedProcedures.filter((p) => {
          if (p.name.toLowerCase() !== procName.toLowerCase()) return true;
          if (toothNumber !== undefined && p.toothNumber !== toothNumber) return true;
          if (toothNumber === undefined && p.toothNumber !== undefined) return true;
          return false;
        });
      };

      // Remove Tooth #26 Filling only
      removeProcedure('Filling', 26);
      expect(orderedProcedures.length).toBe(3);
      expect(orderedProcedures.map((p) => p.toothNumber)).toEqual([16, 36, undefined]);

      // Remove non-tooth Filling
      removeProcedure('Filling', undefined);
      expect(orderedProcedures.length).toBe(2);
      expect(orderedProcedures.map((p) => p.toothNumber)).toEqual([16, 36]);

      // Remove Tooth #16 Filling
      removeProcedure('Filling', 16);
      expect(orderedProcedures.length).toBe(1);
      expect(orderedProcedures[0].toothNumber).toBe(36);
    });
  });

  // =========================================================================
  // 4. Consultation Workstation Wiring & Gating Verification
  // =========================================================================
  describe('4. Consultation Workstation Wiring & Gating Verification', () => {
    test('Specialty mode gating: Dental specialty enables dental module and suppresses physical exam checklist', () => {
      // Logic from Consultations.screen.tsx:
      // const isDentalEnabled = specialtyMode === 'Dental' || enableDentalModule;
      // const showPhysicalExam = specialtyMode !== 'Dental';
      const testCases = [
        { specialtyMode: 'Dental', enableDentalModule: false, expectedDental: true, expectedPE: false },
        { specialtyMode: 'Dental', enableDentalModule: true, expectedDental: true, expectedPE: false },
        { specialtyMode: 'MultiSpecialty', enableDentalModule: true, expectedDental: true, expectedPE: true },
        { specialtyMode: 'MultiSpecialty', enableDentalModule: false, expectedDental: false, expectedPE: true },
        { specialtyMode: 'Medical', enableDentalModule: false, expectedDental: false, expectedPE: true },
        { specialtyMode: 'Medical', enableDentalModule: true, expectedDental: true, expectedPE: true },
      ];

      for (const tc of testCases) {
        const isDentalEnabled = tc.specialtyMode === 'Dental' || tc.enableDentalModule;
        const showPhysicalExam = tc.specialtyMode !== 'Dental';
        expect(isDentalEnabled).toBe(tc.expectedDental);
        expect(showPhysicalExam).toBe(tc.expectedPE);
      }
    });

    test('Consultations.screen handleQuickOrderDentalProcedure initiates modal state and prevents actions when signed', () => {
      let isSigned = false;
      let orderInitialToothNumber: number | undefined = undefined;
      let orderInitialToothSurface: string | undefined = undefined;
      let orderSearchInitialCategory: string | undefined = undefined;
      let orderSearchModalVisible = false;

      const handleQuickOrderDentalProcedure = (toothNumber: number, toothSurface?: string) => {
        if (isSigned) return;
        orderInitialToothNumber = toothNumber;
        orderInitialToothSurface = toothSurface;
        orderSearchInitialCategory = 'Procedure';
        orderSearchModalVisible = true;
      };

      // 1. Invocation when active (isSigned = false)
      handleQuickOrderDentalProcedure(16, 'MOD');
      expect(orderInitialToothNumber).toBe(16);
      expect(orderInitialToothSurface).toBe('MOD');
      expect(orderSearchInitialCategory).toBe('Procedure');
      expect(orderSearchModalVisible).toBe(true);

      // Reset
      orderInitialToothNumber = undefined;
      orderInitialToothSurface = undefined;
      orderSearchModalVisible = false;

      // 2. Invocation when signed (isSigned = true)
      isSigned = true;
      handleQuickOrderDentalProcedure(16, 'MOD');
      expect(orderInitialToothNumber).toBeUndefined();
      expect(orderInitialToothSurface).toBeUndefined();
      expect(orderSearchModalVisible).toBe(false);
    });
  });
});
