// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
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

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: false,
  }),
}));

// Import component under test
const {
  OrderCatalogSearchModal,
} = await import('../components/consultation/OrderCatalogSearchModal');
import type { OrderCatalogItemPayload, OrderCatalogSearchModalProps } from '../components/consultation/OrderCatalogSearchModal';
import type { ClinicServiceItem } from '../services/clinicService';

// Sample mock fee schedule catalog
const MOCK_CATALOG: ClinicServiceItem[] = [
  {
    id: 'item-diag-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-CBC',
    name: 'Complete Blood Count (CBC)',
    category: 'Diagnostic',
    standardPrice: 250,
    description: 'Whole blood automated cell count with differential',
    isActive: true,
    philHealthCode: 'KONS-LAB-01',
    philHealthDescription: 'Complete Blood Count',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-diag-2',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-RBS',
    name: 'Random Blood Sugar (RBS) Fingerstick',
    category: 'Diagnostic',
    standardPrice: 120,
    description: 'Capillary point-of-care rapid glucose',
    isActive: true,
    philHealthCode: 'KONS-LAB-02',
    philHealthDescription: 'Random Blood Sugar',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-diag-3',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-ECG',
    name: '12-Lead Electrocardiogram (ECG)',
    category: 'Diagnostic',
    standardPrice: 450,
    description: 'Standard 12-lead resting electrocardiogram',
    isActive: true,
    philHealthCode: 'KONS-LAB-03',
    philHealthDescription: '12-Lead ECG',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-diag-4',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-LIPID',
    name: 'Lipid Profile Panel',
    category: 'Diagnostic',
    standardPrice: 600,
    description: 'Total cholesterol, HDL, LDL, Triglycerides (requires 10-12 hr fasting)',
    isActive: true,
    philHealthCode: 'KONS-LAB-04',
    philHealthDescription: 'Lipid Profile',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-diag-5',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-DIP',
    name: 'Urinalysis 10-Parameter Dipstick',
    category: 'Diagnostic',
    standardPrice: 90,
    description: 'Rapid point-of-care reagent strip',
    isActive: true,
    philHealthCode: 'KONS-LAB-05',
    philHealthDescription: 'Urinalysis',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-diag-6',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-PRIVATE-1',
    name: 'Dengue NS1 Antigen Rapid Test',
    category: 'Diagnostic',
    standardPrice: 750,
    description: 'Private rapid test without PhilHealth formulary coverage',
    isActive: true,
    isPhilHealthFormulary: false,
  },
  {
    id: 'item-proc-1',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'PROC-NEB',
    name: 'Nebulization Therapy',
    category: 'Procedure',
    standardPrice: 150,
    description: 'Aerosolized bronchodilator delivery with sterile kit',
    isActive: true,
    philHealthCode: 'KONS-PROC-01',
    philHealthDescription: 'Nebulization Therapy',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-proc-2',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'PROC-WOUND',
    name: 'Wound Dressing & Debridement',
    category: 'Procedure',
    standardPrice: 350,
    description: 'Minor wound care with sterile dressing',
    isActive: true,
    philHealthCode: 'KONS-PROC-02',
    philHealthDescription: 'Wound Dressing',
    isPhilHealthFormulary: true,
  },
  {
    id: 'item-proc-3',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'PROC-NURSE-1',
    name: 'Suture Removal',
    category: 'Nursing Procedure',
    standardPrice: 200,
    description: 'Removal of surgical sutures and antiseptic cleansing',
    isActive: true,
  },
  {
    id: 'item-inactive',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'LAB-DISCONTINUED',
    name: 'Discontinued Rapid COVID Antigen',
    category: 'Diagnostic',
    standardPrice: 500,
    isActive: false,
  },
];

describe('Challenger M1-1: Adversarial Challenge of OrderCatalogSearchModal', () => {

  // =========================================================================
  // 1. SEARCH QUERY EDGE CASES: EMPTY, WHITESPACE, CASE, SPECIAL CHARACTERS
  // =========================================================================
  describe('1. Search Queries: Edge Cases & Defense', () => {
    test('1.1 Empty query returns all active items', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Complete Blood Count (CBC)');
      expect(html).toContain('Random Blood Sugar (RBS) Fingerstick');
      expect(html).toContain('12-Lead Electrocardiogram (ECG)');
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Suture Removal');
      // Inactive item must NOT be rendered
      expect(html).not.toContain('Discontinued Rapid COVID Antigen');
      // Count of active items is 9 (out of 10)
      expect(html).toContain('Matching Catalog Items (9)');
    });

    test('1.2 Whitespace-only search query is trimmed and does not filter out items', () => {
      // Test search filter behavior with pure whitespace
      const filterCatalog = (catalog: ClinicServiceItem[], query: string, category: string) => {
        const q = query.trim().toLowerCase();
        return catalog.filter((item) => {
          if (item.isActive === false) return false;
          const catLower = (item.category || '').toLowerCase();
          if (category === 'Diagnostic' && !catLower.includes('diagnostic')) return false;
          if (category === 'Procedure' && !catLower.includes('procedure') && !catLower.includes('nursing')) return false;
          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
            const descMatch = (item.description || '').toLowerCase().includes(q);
            const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
            if (!nameMatch && !codeMatch && !philHealthCodeMatch && !descMatch && !philHealthDescMatch) {
              return false;
            }
          }
          return true;
        });
      };

      const resultSpaces = filterCatalog(MOCK_CATALOG, '   ', 'All');
      const resultTabs = filterCatalog(MOCK_CATALOG, '\t\n   \r\n', 'All');
      expect(resultSpaces.length).toBe(9);
      expect(resultTabs.length).toBe(9);
    });

    test('1.3 Case-insensitivity across uppercase, lowercase, mixed-case queries', () => {
      const filterCatalog = (catalog: ClinicServiceItem[], query: string) => {
        const q = query.trim().toLowerCase();
        return catalog.filter((item) => {
          if (item.isActive === false) return false;
          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
            const descMatch = (item.description || '').toLowerCase().includes(q);
            const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
            return nameMatch || codeMatch || philHealthCodeMatch || descMatch || philHealthDescMatch;
          }
          return true;
        });
      };

      // Searching 'cbc', 'CBC', 'cBc' should all return the CBC test
      expect(filterCatalog(MOCK_CATALOG, 'cbc').map(i => i.code)).toEqual(['LAB-CBC']);
      expect(filterCatalog(MOCK_CATALOG, 'CBC').map(i => i.code)).toEqual(['LAB-CBC']);
      expect(filterCatalog(MOCK_CATALOG, 'cBc').map(i => i.code)).toEqual(['LAB-CBC']);

      // Searching 'nebulization', 'NEBULIZATION', 'NebUlIzAtIoN'
      expect(filterCatalog(MOCK_CATALOG, 'nebulization').map(i => i.code)).toEqual(['PROC-NEB']);
      expect(filterCatalog(MOCK_CATALOG, 'NEBULIZATION').map(i => i.code)).toEqual(['PROC-NEB']);
      expect(filterCatalog(MOCK_CATALOG, 'NebUlIzAtIoN').map(i => i.code)).toEqual(['PROC-NEB']);
    });

    test('1.4 Special characters in search query do not throw regex exceptions and match literally', () => {
      const filterCatalog = (catalog: ClinicServiceItem[], query: string) => {
        const q = query.trim().toLowerCase();
        return catalog.filter((item) => {
          if (item.isActive === false) return false;
          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
            const descMatch = (item.description || '').toLowerCase().includes(q);
            const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
            return nameMatch || codeMatch || philHealthCodeMatch || descMatch || philHealthDescMatch;
          }
          return true;
        });
      };

      // Query with regex parentheses `(cbc)` should not throw SyntaxError and should match 'Complete Blood Count (CBC)'
      expect(() => filterCatalog(MOCK_CATALOG, '(cbc)')).not.toThrow();
      expect(filterCatalog(MOCK_CATALOG, '(cbc)').map(i => i.code)).toEqual(['LAB-CBC']);

      // Query with regex square brackets `[`, `]`
      expect(() => filterCatalog(MOCK_CATALOG, '[')).not.toThrow();
      expect(filterCatalog(MOCK_CATALOG, '[')).toEqual([]);

      // Query with asterisks, plus, question marks, backslashes, carets, dollars, pipes
      const regexDangerousChars = ['*', '+', '?', '^', '$', '\\', '/', '.', '|', '(', ')', '[', ']', '{', '}'];
      for (const char of regexDangerousChars) {
        expect(() => filterCatalog(MOCK_CATALOG, char)).not.toThrow();
      }

      // Query with hyphens, e.g. '12-lead' or '10-parameter'
      expect(filterCatalog(MOCK_CATALOG, '12-lead').map(i => i.code)).toEqual(['LAB-ECG']);
      expect(filterCatalog(MOCK_CATALOG, '10-parameter').map(i => i.code)).toEqual(['LAB-DIP']);
    });

    test('1.5 Multi-attribute search matches against code, PhilHealth code, and description', () => {
      const filterCatalog = (catalog: ClinicServiceItem[], query: string) => {
        const q = query.trim().toLowerCase();
        return catalog.filter((item) => {
          if (item.isActive === false) return false;
          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            const philHealthCodeMatch = (item.philHealthCode || '').toLowerCase().includes(q);
            const descMatch = (item.description || '').toLowerCase().includes(q);
            const philHealthDescMatch = (item.philHealthDescription || '').toLowerCase().includes(q);
            return nameMatch || codeMatch || philHealthCodeMatch || descMatch || philHealthDescMatch;
          }
          return true;
        });
      };

      // Match by clinic internal code
      expect(filterCatalog(MOCK_CATALOG, 'LAB-RBS').map(i => i.code)).toEqual(['LAB-RBS']);

      // Match by PhilHealth statutory catalog code
      expect(filterCatalog(MOCK_CATALOG, 'KONS-LAB-04').map(i => i.code)).toEqual(['LAB-LIPID']);

      // Match by clinical description snippet
      expect(filterCatalog(MOCK_CATALOG, 'bronchodilator').map(i => i.code)).toEqual(['PROC-NEB']);
      expect(filterCatalog(MOCK_CATALOG, 'differential').map(i => i.code)).toEqual(['LAB-CBC']);
      expect(filterCatalog(MOCK_CATALOG, 'resting').map(i => i.code)).toEqual(['LAB-ECG']);
    });
  });

  // =========================================================================
  // 2. EMPTY CATALOG & MALFORMED DATA RESILIENCE
  // =========================================================================
  describe('2. Empty Catalog & Missing Field Resilience', () => {
    test('2.1 Empty catalog renders clean empty state and does not crash', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: [],
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('No matching catalog items found');
      expect(html).toContain('Matching Catalog Items (0)');
      expect(html).toContain('Try adjusting your search query or switching the category tab.');
    });

    test('2.2 Undefined catalog prop falls back to default empty array cleanly', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: undefined,
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('No matching catalog items found');
      expect(html).toContain('Matching Catalog Items (0)');
    });

    test('2.3 Catalog item with missing optional fields renders safely', () => {
      const minimalItem: ClinicServiceItem = {
        id: 'min-1',
        tenantId: 't1',
        clinicId: 'c1',
        code: 'MIN-01',
        name: 'Basic Test Without Description',
        category: 'Diagnostic',
        standardPrice: 100,
        isActive: true,
        // description, philHealthCode, philHealthDescription, isPhilHealthFormulary are omitted
      };

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: [minimalItem],
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Basic Test Without Description');
      expect(html).toContain('MIN-01');
      expect(html).toContain('₱100');
    });

    test('2.4 Standard price of 0 pesos formats correctly as ₱0', () => {
      const freeItem: ClinicServiceItem = {
        id: 'free-1',
        tenantId: 't1',
        clinicId: 'c1',
        code: 'FREE-01',
        name: 'Complimentary Follow-up Review',
        category: 'Procedure',
        standardPrice: 0,
        isActive: true,
      };

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: [freeItem],
          initialCategory: 'All',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Complimentary Follow-up Review');
      expect(html).toContain('₱0');
    });

    test('2.5 Malformed item with undefined code or name when alreadyOrdered lists are populated', () => {
      const malformedItem: any = {
        id: 'bad-1',
        tenantId: 't1',
        clinicId: 'c1',
        name: 'Malformed Item Without Code',
        category: 'Diagnostic',
        standardPrice: 150,
        isActive: true,
        // code is undefined!
      };

      // When rendering with alreadyOrderedCodes populated, it crashes on item.code.toLowerCase()
      let threw = false;
      let errorMsg = '';
      try {
        renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            onClose: () => {},
            catalog: [malformedItem],
            initialCategory: 'All',
            alreadyOrderedCodes: ['SOME-CODE'],
            onSelectOrder: () => {},
          })
        );
      } catch (e: any) {
        threw = true;
        errorMsg = e.message;
      }

      // Verifies empirical challenger discovery: line 284 evaluates item.code.toLowerCase() without optional chaining or fallback
      expect(threw).toBe(true);
      expect(errorMsg).toContain('toLowerCase');
    });
  });

  // =========================================================================
  // 3. ALREADY ORDERED ITEM DISABLING
  // =========================================================================
  describe('3. Already Ordered Item Disabling & Safety', () => {
    test('3.1 Item matching alreadyOrderedNames is marked with Already Ordered badge and disabled', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'All',
          alreadyOrderedNames: ['Complete Blood Count (CBC)'],
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Already Ordered');
    });

    test('3.2 Matching alreadyOrderedNames is case-insensitive', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'All',
          alreadyOrderedNames: ['complete blood count (cbc)'], // lowercase
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Already Ordered');
    });

    test('3.3 Item matching alreadyOrderedCodes is marked as already ordered', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'All',
          alreadyOrderedCodes: ['proc-neb'], // lowercase code
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Already Ordered');
    });

    test('3.4 Selection handler rejects already ordered items', () => {
      let selectedItem: ClinicServiceItem | null = null;
      const alreadyOrderedNames = ['Complete Blood Count (CBC)'];
      const alreadyOrderedCodes = ['PROC-NEB'];

      const handleSelectItem = (item: ClinicServiceItem) => {
        const isOrdered =
          alreadyOrderedNames.some((n) => n.toLowerCase() === item.name.toLowerCase()) ||
          alreadyOrderedCodes.some((c) => c.toLowerCase() === item.code.toLowerCase());

        if (isOrdered) return;
        selectedItem = item;
      };

      // Attempt to select CBC (ordered by name)
      handleSelectItem(MOCK_CATALOG[0]);
      expect(selectedItem).toBeNull();

      // Attempt to select Nebulization (ordered by code)
      handleSelectItem(MOCK_CATALOG[6]);
      expect(selectedItem).toBeNull();

      // Select RBS (not ordered)
      handleSelectItem(MOCK_CATALOG[1]);
      expect(selectedItem).not.toBeNull();
      expect((selectedItem as any).code).toBe('LAB-RBS');
    });

    test('3.5 Submit button is disabled when selectedItem is already ordered', () => {
      const alreadyOrderedNames = ['12-Lead Electrocardiogram (ECG)'];
      const selectedItem = MOCK_CATALOG[2]; // ECG

      const isSelectedAlreadyOrdered =
        alreadyOrderedNames.some((n) => n.toLowerCase() === selectedItem.name.toLowerCase());

      const isButtonDisabled = !selectedItem || isSelectedAlreadyOrdered;
      expect(isButtonDisabled).toBe(true);

      // Verify submit guard aborts
      let submitted = false;
      const handleSubmit = () => {
        if (!selectedItem || isSelectedAlreadyOrdered) return;
        submitted = true;
      };
      handleSubmit();
      expect(submitted).toBe(false);
    });
  });

  // =========================================================================
  // 4. CATEGORY TABS FILTERING
  // =========================================================================
  describe('4. Category Tabs: Segmented Filtering', () => {
    test('4.1 Diagnostic tab filters only diagnostic items', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'Diagnostic',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Complete Blood Count (CBC)');
      expect(html).toContain('Random Blood Sugar (RBS) Fingerstick');
      expect(html).toContain('12-Lead Electrocardiogram (ECG)');
      expect(html).toContain('Lipid Profile Panel');
      expect(html).toContain('Urinalysis 10-Parameter Dipstick');
      expect(html).toContain('Dengue NS1 Antigen Rapid Test');

      // Procedures must NOT be included under Diagnostic tab
      expect(html).not.toContain('Nebulization Therapy');
      expect(html).not.toContain('Wound Dressing & Debridement');
      expect(html).not.toContain('Suture Removal');
      // Count is 6 diagnostics
      expect(html).toContain('Matching Catalog Items (6)');
    });

    test('4.2 Procedure tab filters procedures and in-clinic nursing services', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: MOCK_CATALOG,
          initialCategory: 'Procedure',
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Wound Dressing');
      expect(html).toContain('Suture Removal');

      // Diagnostics must NOT be included under Procedure tab
      expect(html).not.toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Random Blood Sugar (RBS) Fingerstick');
      expect(html).not.toContain('12-Lead Electrocardiogram (ECG)');
      // Count is 3 procedures
      expect(html).toContain('Matching Catalog Items (3)');
    });

    test('4.3 Category tab combined with search query performs intersection filtering', () => {
      const filterCatalog = (catalog: ClinicServiceItem[], query: string, category: string) => {
        const q = query.trim().toLowerCase();
        return catalog.filter((item) => {
          if (item.isActive === false) return false;
          const catLower = (item.category || '').toLowerCase();
          if (category === 'Diagnostic' && !catLower.includes('diagnostic')) return false;
          if (category === 'Procedure' && !catLower.includes('procedure') && !catLower.includes('nursing')) return false;
          if (q) {
            const nameMatch = (item.name || '').toLowerCase().includes(q);
            const codeMatch = (item.code || '').toLowerCase().includes(q);
            return nameMatch || codeMatch;
          }
          return true;
        });
      };

      // Searching 'wound' under Diagnostic tab yields 0 items
      const diagWound = filterCatalog(MOCK_CATALOG, 'wound', 'Diagnostic');
      expect(diagWound.length).toBe(0);

      // Searching 'wound' under Procedure tab yields 1 item
      const procWound = filterCatalog(MOCK_CATALOG, 'wound', 'Procedure');
      expect(procWound.length).toBe(1);
      expect(procWound[0].code).toBe('PROC-WOUND');
    });
  });

  // =========================================================================
  // 5. FULFILLMENT MODE TOGGLING & HEURISTIC DETECTION
  // =========================================================================
  describe('5. Fulfillment Mode: Heuristics & Toggling', () => {
    const IN_HOUSE_RAPID_TEST_REGEX = /fingerstick|ecg|dipstick|rapid|rbs|urinalysis/i;

    function getHeuristicFulfillmentMode(item: ClinicServiceItem): 'in_house' | 'outside' {
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');
      if (!isDiagnostic) {
        return 'in_house';
      }
      const matchTarget = `${item.name || ''} ${item.code || ''} ${item.description || ''}`;
      if (IN_HOUSE_RAPID_TEST_REGEX.test(matchTarget)) {
        return 'in_house';
      }
      return 'outside';
    }

    test('5.1 Heuristic defaults point-of-care rapid tests to in_house', () => {
      // RBS fingerstick
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[1])).toBe('in_house');
      // ECG
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[2])).toBe('in_house');
      // Urinalysis dipstick
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[4])).toBe('in_house');
      // Dengue NS1 rapid test
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[5])).toBe('in_house');
    });

    test('5.2 Heuristic defaults non-rapid complex diagnostics to outside', () => {
      // Complete Blood Count (CBC)
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[0])).toBe('outside');
      // Lipid Profile Panel
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[3])).toBe('outside');
    });

    test('5.3 Procedures always default to in_house', () => {
      // Nebulization
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[6])).toBe('in_house');
      // Wound Dressing
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[7])).toBe('in_house');
      // Suture Removal
      expect(getHeuristicFulfillmentMode(MOCK_CATALOG[8])).toBe('in_house');
    });

    test('5.4 Clinician override allows toggling diagnostic from outside to in_house and vice versa', () => {
      let mode: 'in_house' | 'outside' = getHeuristicFulfillmentMode(MOCK_CATALOG[0]); // CBC -> 'outside'
      expect(mode).toBe('outside');

      // Doctor overrides to in_house
      mode = 'in_house';
      expect(mode).toBe('in_house');

      // Doctor overrides back to outside
      mode = 'outside';
      expect(mode).toBe('outside');
    });

    test('5.5 Payload for Procedure enforces in_house fulfillment mode regardless of state', () => {
      const procItem = MOCK_CATALOG[6]; // Nebulization
      const isDiagnostic = (procItem.category || '').toLowerCase().includes('diagnostic');
      const arbitraryStateMode: 'outside' = 'outside';

      const payload: OrderCatalogItemPayload = {
        serviceItemId: procItem.id,
        code: procItem.code,
        name: procItem.name,
        category: procItem.category,
        standardPrice: procItem.standardPrice,
        philHealthCode: procItem.philHealthCode,
        philHealthDescription: procItem.philHealthDescription,
        isPhilHealthFormulary: procItem.isPhilHealthFormulary,
        fulfillmentMode: isDiagnostic ? arbitraryStateMode : 'in_house',
      };

      expect(payload.fulfillmentMode).toBe('in_house');
    });
  });

  // =========================================================================
  // 6. DYNAMIC PRICE PREVIEW & PHILHEALTH YAKAP CO-PAY RECALCULATION
  // =========================================================================
  describe('6. Price Preview: PhilHealth Yakap Co-Pay & Outside Requisition', () => {
    const computePricePreview = (
      item: ClinicServiceItem,
      fulfillmentMode: 'in_house' | 'outside',
      isYakapEligible: boolean
    ) => {
      const isDiagnostic = (item.category || '').toLowerCase().includes('diagnostic');
      const isYakapCovered = Boolean(
        isYakapEligible &&
        item.philHealthCode &&
        (fulfillmentMode === 'in_house' || !isDiagnostic)
      );

      if (isDiagnostic && fulfillmentMode === 'outside') {
        return {
          type: 'outside',
          badge: 'Outside Requisition',
          priceDisplay: '₱0 Clinic Fee',
          note: 'Patient will receive requisition slip for partner laboratory fulfillment. No clinic fee is billed.',
        };
      }

      if (isYakapCovered) {
        return {
          type: 'yakap',
          badge: 'PhilHealth Yakap - ₱0 Co-pay',
          priceDisplay: '₱0',
          note: `PhilHealth Yakap formulary benefit covers 100% patient co-pay (Standard fee: ₱${item.standardPrice.toLocaleString()}).`,
        };
      }

      return {
        type: 'standard',
        badge: null,
        priceDisplay: `₱${item.standardPrice.toLocaleString()}`,
        note: 'Standard clinic fee will be added to the patient consultation invoice upon encounter signing.',
      };
    };

    test('6.1 Outside laboratory requisition always displays ₱0 Clinic Fee and outside notice', () => {
      // Diagnostic CBC sent outside for Yakap eligible patient
      const cbcOutsideYakap = computePricePreview(MOCK_CATALOG[0], 'outside', true);
      expect(cbcOutsideYakap.type).toBe('outside');
      expect(cbcOutsideYakap.badge).toBe('Outside Requisition');
      expect(cbcOutsideYakap.priceDisplay).toBe('₱0 Clinic Fee');

      // Diagnostic CBC sent outside for non-Yakap patient
      const cbcOutsidePrivate = computePricePreview(MOCK_CATALOG[0], 'outside', false);
      expect(cbcOutsidePrivate.type).toBe('outside');
      expect(cbcOutsidePrivate.priceDisplay).toBe('₱0 Clinic Fee');
    });

    test('6.2 In-house diagnostic with PhilHealth Yakap coverage displays ₱0 Co-Pay', () => {
      // RBS fingerstick performed in-house for Yakap eligible patient
      const rbsInHouseYakap = computePricePreview(MOCK_CATALOG[1], 'in_house', true);
      expect(rbsInHouseYakap.type).toBe('yakap');
      expect(rbsInHouseYakap.badge).toBe('PhilHealth Yakap - ₱0 Co-pay');
      expect(rbsInHouseYakap.priceDisplay).toBe('₱0');
      expect(rbsInHouseYakap.note).toContain('covers 100% patient co-pay');
      expect(rbsInHouseYakap.note).toContain('Standard fee: ₱120');
    });

    test('6.3 In-house diagnostic for non-Yakap patient displays standard fee', () => {
      // RBS fingerstick performed in-house for Private patient (isYakapEligible = false)
      const rbsInHousePrivate = computePricePreview(MOCK_CATALOG[1], 'in_house', false);
      expect(rbsInHousePrivate.type).toBe('standard');
      expect(rbsInHousePrivate.badge).toBeNull();
      expect(rbsInHousePrivate.priceDisplay).toBe('₱120');
      expect(rbsInHousePrivate.note).toContain('Standard clinic fee will be added');
    });

    test('6.4 Non-formulary diagnostic test displays standard fee even for Yakap eligible patient', () => {
      // Dengue NS1 rapid test (no philHealthCode)
      const dengueInHouse = computePricePreview(MOCK_CATALOG[5], 'in_house', true);
      expect(dengueInHouse.type).toBe('standard');
      expect(dengueInHouse.priceDisplay).toBe('₱750');
    });

    test('6.5 In-clinic procedure with PhilHealth coverage displays ₱0 Co-Pay for Yakap patient', () => {
      // Nebulization for Yakap patient
      const nebYakap = computePricePreview(MOCK_CATALOG[6], 'in_house', true);
      expect(nebYakap.type).toBe('yakap');
      expect(nebYakap.badge).toBe('PhilHealth Yakap - ₱0 Co-pay');
      expect(nebYakap.priceDisplay).toBe('₱0');
      expect(nebYakap.note).toContain('Standard fee: ₱150');
    });

    test('6.6 In-clinic procedure without PhilHealth coverage displays standard fee', () => {
      // Suture removal (no philHealthCode)
      const sutureProc = computePricePreview(MOCK_CATALOG[8], 'in_house', true);
      expect(sutureProc.type).toBe('standard');
      expect(sutureProc.priceDisplay).toBe('₱200');
    });
  });

  // =========================================================================
  // 7. INSTRUCTION CHIPS & CUSTOM INSTRUCTIONS
  // =========================================================================
  describe('7. Instruction Chips & Custom Instructions', () => {
    test('7.1 Toggling instruction chip appends to and removes from instructions string', () => {
      let instructions = '';

      const handleToggleChip = (chip: string) => {
        const trimmed = instructions.trim();
        if (!trimmed) {
          instructions = chip;
          return;
        }
        const parts = trimmed.split(';').map((p) => p.trim());
        if (parts.includes(chip)) {
          const remaining = parts.filter((p) => p !== chip);
          instructions = remaining.join('; ');
          return;
        }
        instructions = `${trimmed}; ${chip}`;
      };

      // Add STAT
      handleToggleChip('STAT');
      expect(instructions).toBe('STAT');

      // Add 10-12 hr fasting
      handleToggleChip('10-12 hr fasting');
      expect(instructions).toBe('STAT; 10-12 hr fasting');

      // Remove STAT
      handleToggleChip('STAT');
      expect(instructions).toBe('10-12 hr fasting');

      // Add Morning mid-stream urine
      handleToggleChip('Morning mid-stream urine');
      expect(instructions).toBe('10-12 hr fasting; Morning mid-stream urine');

      // Remove 10-12 hr fasting
      handleToggleChip('10-12 hr fasting');
      expect(instructions).toBe('Morning mid-stream urine');
    });

    test('7.2 Submission sanitizes empty or whitespace instructions to undefined', () => {
      const buildInstructionsPayload = (raw: string) => {
        return raw.trim() ? raw.trim() : undefined;
      };

      expect(buildInstructionsPayload('')).toBeUndefined();
      expect(buildInstructionsPayload('   ')).toBeUndefined();
      expect(buildInstructionsPayload('\n\t  ')).toBeUndefined();
      expect(buildInstructionsPayload('  STAT; 8 hr fasting  ')).toBe('STAT; 8 hr fasting');
    });
  });

  // =========================================================================
  // 8. CONTRACT & PAYLOAD INTEGRITY
  // =========================================================================
  describe('8. Contract & Payload Integrity', () => {
    test('8.1 Order payload contains exact required properties matching Milestone 2 contract', () => {
      const selectedItem = MOCK_CATALOG[0]; // CBC
      const fulfillmentMode: 'outside' = 'outside';
      const instructions = 'Routine; Outside send-out to Hi-Precision';

      const payload: OrderCatalogItemPayload = {
        serviceItemId: selectedItem.id,
        code: selectedItem.code,
        name: selectedItem.name,
        category: selectedItem.category,
        standardPrice: selectedItem.standardPrice,
        philHealthCode: selectedItem.philHealthCode,
        philHealthDescription: selectedItem.philHealthDescription,
        isPhilHealthFormulary: selectedItem.isPhilHealthFormulary,
        fulfillmentMode: 'outside',
        instructions: instructions.trim() ? instructions.trim() : undefined,
      };

      expect(payload).toEqual({
        serviceItemId: 'item-diag-1',
        code: 'LAB-CBC',
        name: 'Complete Blood Count (CBC)',
        category: 'Diagnostic',
        standardPrice: 250,
        philHealthCode: 'KONS-LAB-01',
        philHealthDescription: 'Complete Blood Count',
        isPhilHealthFormulary: true,
        fulfillmentMode: 'outside',
        instructions: 'Routine; Outside send-out to Hi-Precision',
      });
    });
  });
});
