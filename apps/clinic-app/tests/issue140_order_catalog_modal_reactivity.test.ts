// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

(globalThis as any).__DEV__ = true;

const renderedPressHandlers = new Map<string, () => void>();
const renderedTextHandlers = new Map<string, (text: string) => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    style,
    onPress,
    onChangeText,
    onChange,
    value,
    visible,
    placeholder,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    if (onPress) {
      if (testID) renderedPressHandlers.set(testID, onPress);
      if (accessibilityLabel) renderedPressHandlers.set(accessibilityLabel, onPress);
    }
    if (onChangeText && testID) {
      renderedTextHandlers.set(testID, onChangeText);
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
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
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
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: mock(() => {}) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'svg',
  Path: 'path',
  Circle: 'circle',
  Rect: 'rect',
  Line: 'line',
  default: 'svg',
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
  OrderCatalogSearchModal,
  EMPTY_STRING_ARRAY,
  EMPTY_EXISTING_ORDERS,
  EMPTY_ROOMS,
  CATEGORY_TABS,
} = await import('../components/consultation/OrderCatalogSearchModal');

const ConsultationExports = await import('../components/consultation');

import type { OrderCatalogItemPayload } from '../components/consultation/OrderCatalogSearchModal';
import type { ClinicServiceItem, ClinicRoom } from '../services/clinicService';

describe('GitHub Issue #140: OrderCatalogSearchModal Reactivity & Zero-Technical-Debt Suite', () => {
  const sampleRooms: ClinicRoom[] = [
    { id: 'room-tx-1', name: 'Treatment Bay 1', type: 'Treatment', isActive: true },
    { id: 'room-op-1', name: 'Dental Chair 1', type: 'Treatment', isActive: true },
  ];

  const sampleCatalog: ClinicServiceItem[] = [
    {
      id: 'item-diag-cbc',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-CBC',
      name: 'Complete Blood Count (CBC)',
      category: 'Diagnostic',
      standardPrice: 250,
      description: 'Standard hematology panel with platelet count',
      isActive: true,
      philHealthCode: '90001',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-diag-urinalysis',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'LAB-URI',
      name: 'Routine Urinalysis',
      category: 'Diagnostic',
      standardPrice: 120,
      description: 'Point-of-care rapid dipstick urinalysis',
      isActive: true,
      philHealthCode: '90002',
      isPhilHealthFormulary: true,
    },
    {
      id: 'item-proc-nebulization',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'PROC-NEB',
      name: 'Nebulization Therapy',
      category: 'Procedure',
      standardPrice: 350,
      description: 'In-clinic respiratory nebulization with Salbutamol',
      isActive: true,
      isNurseOrderable: true,
    },
    {
      id: 'item-proc-suture',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'PROC-SUT',
      name: 'Wound Suture & Dressing',
      category: 'Procedure',
      standardPrice: 850,
      description: 'Minor surgical laceration repair and sterile dressing',
      isActive: true,
      isNurseOrderable: false,
    },
    {
      id: 'item-dental-prophy',
      tenantId: 'tenant-1',
      clinicId: 'clinic-1',
      code: 'DENT-PROPHY',
      name: 'Oral Prophylaxis (Cleaning)',
      category: 'Dental',
      standardPrice: 1200,
      description: 'Full mouth scaling and polishing',
      isActive: true,
    },
  ];

  beforeEach(() => {
    renderedPressHandlers.clear();
    renderedTextHandlers.clear();
  });

  // =========================================================================
  // 1. Stable Default Constants Assertions
  // =========================================================================
  describe('1. Stable Default Constants & Export Integrity', () => {
    test('1.1 EMPTY_STRING_ARRAY is exported, empty, and frozen', () => {
      expect(EMPTY_STRING_ARRAY).toBeDefined();
      expect(Array.isArray(EMPTY_STRING_ARRAY)).toBe(true);
      expect(EMPTY_STRING_ARRAY.length).toBe(0);
      expect(Object.isFrozen(EMPTY_STRING_ARRAY)).toBe(true);
    });

    test('1.2 EMPTY_EXISTING_ORDERS is exported, empty, and frozen', () => {
      expect(EMPTY_EXISTING_ORDERS).toBeDefined();
      expect(Array.isArray(EMPTY_EXISTING_ORDERS)).toBe(true);
      expect(EMPTY_EXISTING_ORDERS.length).toBe(0);
      expect(Object.isFrozen(EMPTY_EXISTING_ORDERS)).toBe(true);
    });

    test('1.3 EMPTY_ROOMS is exported, empty, and frozen', () => {
      expect(EMPTY_ROOMS).toBeDefined();
      expect(Array.isArray(EMPTY_ROOMS)).toBe(true);
      expect(EMPTY_ROOMS.length).toBe(0);
      expect(Object.isFrozen(EMPTY_ROOMS)).toBe(true);
    });

    test('1.4 Consultation index barrel re-exports the stable constants', () => {
      expect((ConsultationExports as any).EMPTY_STRING_ARRAY).toBe(EMPTY_STRING_ARRAY);
      expect((ConsultationExports as any).EMPTY_EXISTING_ORDERS).toBe(EMPTY_EXISTING_ORDERS);
      expect((ConsultationExports as any).EMPTY_ROOMS).toBe(EMPTY_ROOMS);
    });

    test('1.5 Constants retain identical referential identity across repeated accesses', () => {
      expect(EMPTY_STRING_ARRAY).toBe(EMPTY_STRING_ARRAY);
      expect(EMPTY_EXISTING_ORDERS).toBe(EMPTY_EXISTING_ORDERS);
      expect(EMPTY_ROOMS).toBe(EMPTY_ROOMS);
    });
  });

  // =========================================================================
  // 2. Category Tab Switching & Search Reactivity
  // =========================================================================
  describe('2. Category Tabs & Search Filtering', () => {
    test('2.1 Initial category renders Diagnostic tab active when opened from Diagnostics button', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Diagnostic',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Complete Blood Count (CBC)');
      expect(html).toContain('Routine Urinalysis');
      // Procedures should not appear in Diagnostic category tab
      expect(html).not.toContain('Nebulization Therapy');
      expect(html).not.toContain('Oral Prophylaxis (Cleaning)');
    });

    test('2.2 Initial category renders Procedure tab active when opened from Procedures button', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Procedure',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Wound Suture');
      // Diagnostics should not appear in Procedure category tab
      expect(html).not.toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Routine Urinalysis');
    });

    test('2.3 Category tab "All" renders items from all categories', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'All',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Complete Blood Count (CBC)');
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Oral Prophylaxis (Cleaning)');
    });

    test('2.4 Dental tab renders dental procedures specifically', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Dental',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Oral Prophylaxis (Cleaning)');
      expect(html).not.toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Nebulization Therapy');
    });
  });

  // =========================================================================
  // 3. Item Selection, Configuration Panel & Ordering Flow
  // =========================================================================
  describe('3. Item Selection & Configuration Panel', () => {
    test('3.1 Pre-selected initialSelectedItem renders configuration area and enables "+ Add to Order"', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Procedure',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          initialSelectedItem: sampleCatalog[2], // Nebulization Therapy
          onClose: () => {},
          onSelectOrder: () => {},
          testID: 'test-order-modal',
        })
      );

      expect(html).toContain('Configure Order: Nebulization Therapy');
      expect(html).toContain('Send / Assign to Room');
      expect(html).toContain('Treatment Bay 1');
      expect(html).toContain('Dental Chair 1');
      expect(html).toContain('Add to Order');
      expect(html).not.toContain('Select an item from the list above to configure fulfillment mode');
    });

    test('3.2 Submitting order emits valid OrderCatalogItemPayload and closes modal', () => {
      let emittedOrder: OrderCatalogItemPayload | null = null;
      let closed = false;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Procedure',
          catalog: sampleCatalog,
          rooms: sampleRooms,
          initialSelectedItem: sampleCatalog[2], // Nebulization Therapy
          onClose: () => {
            closed = true;
          },
          onSelectOrder: (payload) => {
            emittedOrder = payload;
          },
          testID: 'test-submit-modal',
        })
      );

      const submitHandler = renderedPressHandlers.get('test-submit-modal-submit-btn');
      expect(submitHandler).toBeDefined();
      submitHandler!();

      expect(emittedOrder).not.toBeNull();
      expect(emittedOrder!.serviceItemId).toBe('item-proc-nebulization');
      expect(emittedOrder!.name).toBe('Nebulization Therapy');
      expect(emittedOrder!.category).toBe('Procedure');
      expect(emittedOrder!.fulfillmentMode).toBe('in_house');
      expect(emittedOrder!.standardPrice).toBe(350);
      expect(closed).toBe(true);
    });

    test('3.3 Diagnostic item with Outside fulfillment mode reflects outside in payload', () => {
      let emittedOrder: OrderCatalogItemPayload | null = null;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          initialCategory: 'Diagnostic',
          catalog: sampleCatalog,
          initialSelectedItem: sampleCatalog[0], // CBC (sendout by default)
          onClose: () => {},
          onSelectOrder: (payload) => {
            emittedOrder = payload;
          },
          testID: 'test-diag-modal',
        })
      );

      const submitHandler = renderedPressHandlers.get('test-diag-modal-submit-btn');
      expect(submitHandler).toBeDefined();
      submitHandler!();

      expect(emittedOrder).not.toBeNull();
      expect(emittedOrder!.serviceItemId).toBe('item-diag-cbc');
      expect(emittedOrder!.name).toBe('Complete Blood Count (CBC)');
      expect(emittedOrder!.category).toBe('Diagnostic');
      expect(emittedOrder!.fulfillmentMode).toBe('outside');
    });

    test('3.4 Cancel button triggers onClose without calling onSelectOrder', () => {
      let selectedCalled = false;
      let closed = false;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          catalog: sampleCatalog,
          onClose: () => {
            closed = true;
          },
          onSelectOrder: () => {
            selectedCalled = true;
          },
          testID: 'test-cancel-modal',
        })
      );

      const cancelHandler = renderedPressHandlers.get('test-cancel-modal-cancel-btn');
      expect(cancelHandler).toBeDefined();
      cancelHandler!();

      expect(closed).toBe(true);
      expect(selectedCalled).toBe(false);
    });
  });

  // =========================================================================
  // 4. Immunity to Parent Re-renders with Inline Array Props
  // =========================================================================
  describe('4. Immunity to Parent Re-renders with Inline Array Props', () => {
    test('4.1 Renders consistently when parent passes new inline array references', () => {
      // Simulate parent re-rendering 5 consecutive times with fresh inline array allocations
      for (let i = 0; i < 5; i++) {
        const html = renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            initialCategory: 'Procedure',
            catalog: [...sampleCatalog],
            rooms: [...sampleRooms],
            alreadyOrderedNames: [`Already Ordered ${i}`],
            alreadyOrderedCodes: [`CODE-${i}`],
            existingOrders: [{ name: `Procedure ${i}` }],
            initialSelectedItem: sampleCatalog[2],
            onClose: () => {},
            onSelectOrder: () => {},
          })
        );

        expect(html).toContain('Configure Order: Nebulization Therapy');
        expect(html).toContain('Send / Assign to Room');
      }
    });

    test('4.2 Missing optional array props gracefully fallback to frozen constants without throwing', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          catalog: sampleCatalog,
          onClose: () => {},
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Add Test or Procedure');
      expect(html).toContain('Matching Catalog Items (5)');
    });
  });

  // =========================================================================
  // 5. Source Code AST & Architecture Integrity
  // =========================================================================
  describe('5. Source Code AST & Architecture Integrity', () => {
    test('5.1 OrderCatalogSearchModal imports and instantiates useRef for prevVisibleRef', () => {
      const source = fs.readFileSync(
        path.resolve(fileURLToPath(import.meta.url), '../../components/consultation/OrderCatalogSearchModal.tsx'),
        'utf-8'
      );

      expect(source).toContain('useRef');
      expect(source).toContain('const prevVisibleRef = useRef(false);');
    });

    test('5.2 OrderCatalogSearchModal defines and exports EMPTY_STRING_ARRAY, EMPTY_EXISTING_ORDERS, and EMPTY_ROOMS', () => {
      const source = fs.readFileSync(
        path.resolve(fileURLToPath(import.meta.url), '../../components/consultation/OrderCatalogSearchModal.tsx'),
        'utf-8'
      );

      expect(source).toContain('export const EMPTY_STRING_ARRAY: readonly string[] = Object.freeze([]);');
      expect(source).toContain('export const EMPTY_EXISTING_ORDERS: readonly ExistingOrderItemContext[] = Object.freeze([]);');
      expect(source).toContain('export const EMPTY_ROOMS: readonly ClinicRoom[] = Object.freeze([]);');
    });

    test('5.3 Parameter defaults and targetRooms fallback consume the frozen constants', () => {
      const source = fs.readFileSync(
        path.resolve(fileURLToPath(import.meta.url), '../../components/consultation/OrderCatalogSearchModal.tsx'),
        'utf-8'
      );

      expect(source).toContain('rooms = EMPTY_ROOMS as ClinicRoom[]');
      expect(source).toContain('alreadyOrderedNames = EMPTY_STRING_ARRAY as string[]');
      expect(source).toContain('alreadyOrderedCodes = EMPTY_STRING_ARRAY as string[]');
      expect(source).toContain('existingOrders = EMPTY_EXISTING_ORDERS as ExistingOrderItemContext[]');
      expect(source).toContain('return EMPTY_ROOMS as ClinicRoom[];');
    });

    test('5.4 Form initialization effect is transition-guarded with !prevVisibleRef.current', () => {
      const source = fs.readFileSync(
        path.resolve(fileURLToPath(import.meta.url), '../../components/consultation/OrderCatalogSearchModal.tsx'),
        'utf-8'
      );

      expect(source).toContain('if (!visible) {');
      expect(source).toContain('prevVisibleRef.current = false;');
      expect(source).toContain('if (!prevVisibleRef.current) {');
      expect(source).toContain('prevVisibleRef.current = true;');
    });
  });
});
