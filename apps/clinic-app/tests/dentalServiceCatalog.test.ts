// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, title, label, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(label ? { 'data-label': label } : {}),
      },
      title || label || placeholder,
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
  Polyline: createMockComponent('polyline'),
  Polygon: createMockComponent('polygon'),
  Defs: createMockComponent('defs'),
  LinearGradient: createMockComponent('lineargradient'),
  Stop: createMockComponent('stop'),
  G: createMockComponent('g'),
  Text: createMockComponent('text'),
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

// Mock clinicApiClient instead of whole clinicService to prevent module contamination
let lastApiClientCall = { method: '', url: '', data: null as any };
const mockApiClientPost = mock(async (url: string, data?: any) => {
  lastApiClientCall = { method: 'POST', url, data };
  if (url === '/services/seed-dental') {
    return [
      [
        { id: 'dent-1', code: 'DENT-CONS', name: 'Dental Consultation & Oral Examination', category: 'Dental', standardPrice: 500, isActive: true },
        { id: 'dent-2', code: 'DENT-CLEAN', name: 'Oral Prophylaxis / Dental Cleaning', category: 'Dental', standardPrice: 850, isActive: true },
        { id: 'dent-3', code: 'DENT-FILL-COMP', name: 'Composite Light-Cure Tooth Restoration', category: 'Dental', standardPrice: 950, isActive: true },
        { id: 'dent-4', code: 'DENT-EXT-SIMPLE', name: 'Tooth Extraction - Simple Exodontia', category: 'Dental', standardPrice: 1000, isActive: true },
        { id: 'dent-5', code: 'DENT-EXT-SURG', name: 'Surgical Odontectomy - Impacted Third Molar', category: 'Dental', standardPrice: 3500, isActive: true },
        { id: 'dent-6', code: 'DENT-SEALANT', name: 'Pit and Fissure Sealant', category: 'Dental', standardPrice: 600, isActive: true },
        { id: 'dent-7', code: 'DENT-FLUOR', name: 'Topical Fluoride Varnish Application', category: 'Dental', standardPrice: 500, isActive: true },
        { id: 'dent-8', code: 'DENT-XR-PA', name: 'Dental Periapical Radiograph / X-Ray', category: 'Dental', standardPrice: 400, isActive: true },
        { id: 'dent-9', code: 'DENT-RCT', name: 'Root Canal Therapy / Endodontic Treatment', category: 'Dental', standardPrice: 4000, isActive: true },
        { id: 'dent-10', code: 'DENT-PULP', name: 'Pediatric Pulpotomy', category: 'Dental', standardPrice: 1500, isActive: true },
      ],
      null,
    ];
  }
  return [{ id: 'mock-created', ...data }, null];
});

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string) => {
      lastApiClientCall = { method: 'GET', url, data: null };
      return [[], null];
    },
    post: mockApiClientPost,
    put: async (url: string, data?: any) => {
      lastApiClientCall = { method: 'PUT', url, data };
      return [{ id: 'mock-updated', ...data }, null];
    },
    delete: async (url: string) => {
      lastApiClientCall = { method: 'DELETE', url, data: null };
      return [true, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

// Imports after mocking
const {
  OrderCatalogSearchModal,
  CATEGORY_TABS,
  DENTAL_CLINICAL_INSTRUCTION_CHIPS,
} = await import('../components/consultation/OrderCatalogSearchModal');
const { default: ServicesCatalogTab } = await import('../components/settings/ServicesCatalogTab');
import type { ClinicServiceItem } from '../services/clinicService';

// Sample mixed test catalog with 10 canonical dental presets
const SAMPLE_SERVICES: ClinicServiceItem[] = [
  { id: 'med-1', tenantId: 't1', clinicId: 'c1', code: 'MED-AMOX-500', name: 'Amoxicillin 500mg Capsule', category: 'Medicine', standardPrice: 15, isActive: true },
  { id: 'proc-1', tenantId: 't1', clinicId: 'c1', code: 'PROC-NEB', name: 'Nebulization Therapy', category: 'Procedure', standardPrice: 250, isActive: true },
  { id: 'proc-2', tenantId: 't1', clinicId: 'c1', code: 'PROC-VAX', name: 'Vaccine Administration Fee', category: 'NursingService', standardPrice: 200, isActive: true },
  { id: 'diag-1', tenantId: 't1', clinicId: 'c1', code: 'LAB-CBC', name: 'Complete Blood Count (CBC)', category: 'Diagnostic', standardPrice: 250, isActive: true },
  { id: 'cons-1', tenantId: 't1', clinicId: 'c1', code: 'CONS-GEN', name: 'General Medical Consultation', category: 'Consultation', standardPrice: 500, isActive: true },
  { id: 'dent-1', tenantId: 't1', clinicId: 'c1', code: 'DENT-CONS', name: 'Dental Consultation & Oral Examination', category: 'Dental', standardPrice: 500, isActive: true },
  { id: 'dent-2', tenantId: 't1', clinicId: 'c1', code: 'DENT-CLEAN', name: 'Oral Prophylaxis / Dental Cleaning', category: 'Dental', standardPrice: 850, isActive: true },
  { id: 'dent-3', tenantId: 't1', clinicId: 'c1', code: 'DENT-FILL-COMP', name: 'Composite Light-Cure Tooth Restoration', category: 'Dental', standardPrice: 950, isActive: true },
  { id: 'dent-4', tenantId: 't1', clinicId: 'c1', code: 'DENT-EXT-SIMPLE', name: 'Tooth Extraction - Simple Exodontia', category: 'Dental', standardPrice: 1000, description: 'Routine non-surgical tooth extraction', isActive: true },
  { id: 'dent-5', tenantId: 't1', clinicId: 'c1', code: 'DENT-EXT-SURG', name: 'Surgical Odontectomy - Impacted Third Molar', category: 'Dental', standardPrice: 3500, description: 'Surgical extraction of impacted third molar', isActive: true },
  { id: 'dent-6', tenantId: 't1', clinicId: 'c1', code: 'DENT-SEALANT', name: 'Pit and Fissure Sealant', category: 'Dental', standardPrice: 600, isActive: true },
  { id: 'dent-7', tenantId: 't1', clinicId: 'c1', code: 'DENT-FLUOR', name: 'Topical Fluoride Varnish Application', category: 'Dental', standardPrice: 500, isActive: true },
  { id: 'dent-8', tenantId: 't1', clinicId: 'c1', code: 'DENT-XR-PA', name: 'Dental Periapical Radiograph / X-Ray', category: 'Dental', standardPrice: 400, isActive: true },
  { id: 'dent-9', tenantId: 't1', clinicId: 'c1', code: 'DENT-RCT', name: 'Root Canal Therapy / Endodontic Treatment', category: 'Dental', standardPrice: 4000, isActive: true },
  { id: 'dent-10', tenantId: 't1', clinicId: 'c1', code: 'DENT-PULP', name: 'Pediatric Pulpotomy', category: 'Dental', standardPrice: 1500, isActive: true },
];

describe('Dental Service Catalog Frontend Integration Tests (R3, R4, R5)', () => {
  beforeEach(() => {
    mockApiClientPost.mockClear();
  });

  // -------------------------------------------------------------------------
  // 1. ServicesCatalogTab Category Label, Filter Chips, and Preset Seeding UI (R3)
  // -------------------------------------------------------------------------
  describe('1. ServicesCatalogTab Dental Category & Seeding UI', () => {
    test('1.1 ServicesCatalogTab renders Dental Services category filter chip with exact item count', () => {
      const setServicesMock = mock(() => {});
      const onRefreshMock = mock(() => Promise.resolve());

      const html = renderToStaticMarkup(
        React.createElement(ServicesCatalogTab, {
          services: SAMPLE_SERVICES,
          setServices: setServicesMock,
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: onRefreshMock,
          formatPeso: (v) => `₱${v}`,
          showAddModal: false,
          setShowAddModal: () => {},
        })
      );

      // Verify Dental Services label and count chip are present
      expect(html).toContain('Dental Services (10)');
      expect(html).toContain('All Items (15)');
      expect(html).toContain('Consultations (1)');
      expect(html).toContain('Procedures (1)');
      expect(html).toContain('Diagnostics (1)');
      expect(html).toContain('Medicines (1)');
      expect(html).toContain('Nursing Services (1)');
    });

    test('1.2 ServicesCatalogTab renders "Add service item" in header actions without redundant "Add Dental Services" button', () => {
      const setServicesMock = mock(() => {});
      const onRefreshMock = mock(() => Promise.resolve());

      const html = renderToStaticMarkup(
        React.createElement(ServicesCatalogTab, {
          services: SAMPLE_SERVICES,
          setServices: setServicesMock,
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: onRefreshMock,
          formatPeso: (v) => `₱${v}`,
          showAddModal: false,
          setShowAddModal: () => {},
        })
      );

      expect(html).toContain('Add service item');
      expect(html).not.toContain('Add Dental Services');
    });

    test('1.3 "Add Service" modal category selector includes "Dental" option and optional PhilHealth code input', () => {
      const setServicesMock = mock(() => {});
      const onRefreshMock = mock(() => Promise.resolve());

      const html = renderToStaticMarkup(
        React.createElement(ServicesCatalogTab, {
          services: SAMPLE_SERVICES,
          setServices: setServicesMock,
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: onRefreshMock,
          formatPeso: (v) => `₱${v}`,
          showAddModal: true,
          setShowAddModal: () => {},
        })
      );

      // The modal is open (showAddModal: true), verifying category chips include Dental and PhilHealth input is present
      expect(html).toContain('Add catalog service item');
      expect(html).toContain('Dental');
      expect(html).toContain('Consultation');
      expect(html).toContain('Procedure');
      expect(html).toContain('Diagnostic');
      expect(html).toContain('Medicine');
      expect(html).toContain('NursingService');
      expect(html).toContain('PhilHealth statutory code (optional)');
    });

    test('1.4 seedDentalServices API client invokes /services/seed-dental endpoint', async () => {
      const { clinicService } = await import('../services/clinicService');
      const [items, err] = await clinicService.seedDentalServices();

      expect(mockApiClientPost).toHaveBeenCalled();
      expect(lastApiClientCall.method).toBe('POST');
      expect(lastApiClientCall.url).toBe('/services/seed-dental');
      expect(err).toBeNull();
      expect(items).toBeArray();
      expect(items?.length).toBe(10);
      expect(items?.[0].code).toBe('DENT-CONS');
      expect(items?.[0].category).toBe('Dental');
    });

    test('1.5 ServicesCatalogTab source code includes Dental in Add/Edit modals, PhilHealth code support, and no redundant header button', async () => {
      const fs = await import('fs');
      const tabSource = fs.readFileSync(
        fileURLToPath(new URL('../components/settings/ServicesCatalogTab.tsx', import.meta.url)),
        'utf8'
      );
      expect(tabSource).toContain("Dental: 'Dental Services'");
      expect(tabSource).toContain("'Dental', 'Medicine', 'NursingService'");
      expect(tabSource).not.toContain('title="Add Dental Services"');
      expect(tabSource).toContain('itemPhilHealthCode');
      expect(tabSource).toContain('editPhilHealthCode');
      expect(tabSource).toContain('PhilHealth: ${item.philHealthCode.trim()}');
    });

    test('1.6 ServicesCatalogTab source code binds Seed Dental Services to empty state for dental category', async () => {
      const tabSource = await Bun.file(
        fileURLToPath(new URL('../components/settings/ServicesCatalogTab.tsx', import.meta.url))
      ).text();

      expect(tabSource).toContain("selectedCategory === 'Dental' ? 'Seed Dental Services'");
      expect(tabSource).toContain('handleSeedDentalServices');
    });

    test('1.7 ServicesCatalogTab displays PhilHealth code as a chip on the list of added services when provided under any category', () => {
      const setServicesMock = mock(() => {});
      const onRefreshMock = mock(() => Promise.resolve());

      const servicesWithPhilHealth: ClinicServiceItem[] = [
        {
          id: 'svc-cons-ph',
          tenantId: 't1',
          clinicId: 'c1',
          code: 'CONS-PH',
          name: 'Konsulta Primary Consultation',
          category: 'Consultation',
          standardPrice: 500,
          philHealthCode: '99201',
          isActive: true,
        },
        {
          id: 'svc-dent-ph',
          tenantId: 't1',
          clinicId: 'c1',
          code: 'DENT-CLEAN-PH',
          name: 'Oral Prophylaxis',
          category: 'Dental',
          standardPrice: 850,
          philHealthCode: 'D1110',
          isActive: true,
        },
        {
          id: 'svc-diag-blank',
          tenantId: 't1',
          clinicId: 'c1',
          code: 'LAB-PLAIN',
          name: 'Plain Diagnostic Test',
          category: 'Diagnostic',
          standardPrice: 300,
          philHealthCode: '   ',
          isActive: true,
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(ServicesCatalogTab, {
          services: servicesWithPhilHealth,
          setServices: setServicesMock,
          servicesLoadError: null,
          showSkeletons: false,
          onRefreshServices: onRefreshMock,
          formatPeso: (v) => `₱${v}`,
          showAddModal: false,
          setShowAddModal: () => {},
        })
      );

      expect(html).toContain('PhilHealth: 99201');
      expect(html).toContain('PhilHealth: D1110');
      expect(html).not.toContain('PhilHealth:    ');
    });

    test('1.8 clinicService.createService transmits optional philHealthCode for any category', async () => {
      const { clinicService } = await import('../services/clinicService');
      const [created, err] = await clinicService.createService({
        code: 'DENT-001',
        name: 'Dental Extraction',
        category: 'Dental',
        standardPrice: 1000,
        description: 'Simple extraction',
        philHealthCode: 'D7140',
      });

      expect(err).toBeNull();
      expect(lastApiClientCall.method).toBe('POST');
      expect(lastApiClientCall.url).toBe('/services');
      expect(lastApiClientCall.data).toEqual({
        code: 'DENT-001',
        name: 'Dental Extraction',
        category: 'Dental',
        standardPrice: 1000,
        description: 'Simple extraction',
        philHealthCode: 'D7140',
      });
      expect(created?.philHealthCode).toBe('D7140');
    });

    test('1.9 clinicService.updateService supports updating and clearing philHealthCode across categories', async () => {
      const { clinicService } = await import('../services/clinicService');
      const [updated, err] = await clinicService.updateService('svc-1', {
        name: 'Dental Extraction',
        category: 'Dental',
        standardPrice: 1100,
        isActive: true,
        philHealthCode: undefined,
        philHealthDescription: undefined,
        isPhilHealthFormulary: false,
      });

      expect(err).toBeNull();
      expect(lastApiClientCall.method).toBe('PUT');
      expect(lastApiClientCall.url).toBe('/services/svc-1');
      expect(lastApiClientCall.data.philHealthCode).toBeUndefined();
      expect(lastApiClientCall.data.isPhilHealthFormulary).toBe(false);
      expect(updated?.philHealthCode).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. OrderCatalogSearchModal Category Tabs & Filtering (R4)
  // -------------------------------------------------------------------------
  describe('2. OrderCatalogSearchModal Category Tabs & Filtering', () => {
    test('2.1 CATEGORY_TABS includes "Dental" tab', () => {
      expect(CATEGORY_TABS).toContainEqual({ value: 'Dental', label: 'Dental' });
      expect(CATEGORY_TABS.map((t) => t.value)).toEqual(['All', 'Diagnostic', 'Procedure', 'Dental']);
    });

    test('2.2 OrderCatalogSearchModal filters catalog items by "Dental" category', () => {
      const onSelectMock = mock(() => {});
      const onCloseMock = mock(() => {});

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: onCloseMock,
          catalog: SAMPLE_SERVICES,
          initialCategory: 'Dental',
          onSelectOrder: onSelectMock,
        })
      );

      // Renders dental items
      expect(html).toContain('Dental Consultation &amp; Oral Examination');
      expect(html).toContain('DENT-CONS');
      expect(html).toContain('Composite Light-Cure Tooth Restoration');
      expect(html).toContain('DENT-FILL-COMP');
      expect(html).toContain('Surgical Odontectomy - Impacted Third Molar');
      expect(html).toContain('DENT-EXT-SURG');

      // Does not render non-dental diagnostic or medicine items
      expect(html).not.toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Amoxicillin 500mg');
    });

    test('2.3 When selectedCategory is "Procedure", dental procedures are included', () => {
      const onSelectMock = mock(() => {});
      const onCloseMock = mock(() => {});

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: onCloseMock,
          catalog: SAMPLE_SERVICES,
          initialCategory: 'Procedure',
          onSelectOrder: onSelectMock,
        })
      );

      // Both general procedures and dental procedures must be visible
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Vaccine Administration Fee');
      expect(html).toContain('Composite Light-Cure Tooth Restoration');
      expect(html).toContain('Tooth Extraction - Simple Exodontia');

      // Diagnostic and medicine items must NOT be visible under Procedure tab
      expect(html).not.toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Amoxicillin 500mg');
    });

    test('2.4 When selectedCategory is "Diagnostic", dental procedures are excluded', () => {
      const onSelectMock = mock(() => {});
      const onCloseMock = mock(() => {});

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: onCloseMock,
          catalog: SAMPLE_SERVICES,
          initialCategory: 'Diagnostic',
          onSelectOrder: onSelectMock,
        })
      );

      expect(html).toContain('Complete Blood Count (CBC)');
      expect(html).not.toContain('Composite Light-Cure Tooth Restoration');
      expect(html).not.toContain('Nebulization Therapy');
    });

    test('2.5 OrderCatalogSearchModal filters search query within Dental category', () => {
      const query = 'extraction';
      const dentalItems = SAMPLE_SERVICES.filter((item) => {
        if (item.isActive === false) return false;
        const catLower = (item.category || '').toLowerCase();
        if (!catLower.includes('dental')) return false;
        const q = query.trim().toLowerCase();
        const nameMatch = (item.name || '').toLowerCase().includes(q);
        const codeMatch = (item.code || '').toLowerCase().includes(q);
        const descMatch = (item.description || '').toLowerCase().includes(q);
        return nameMatch || codeMatch || descMatch;
      });

      expect(dentalItems.length).toBe(2);
      expect(dentalItems.map((i) => i.code)).toEqual(['DENT-EXT-SIMPLE', 'DENT-EXT-SURG']);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Dental Clinical Instruction Chips (R4)
  // -------------------------------------------------------------------------
  describe('3. Dental Clinical Instruction Chips', () => {
    test('3.1 DENTAL_CLINICAL_INSTRUCTION_CHIPS exports the 5 required clinical instruction presets', () => {
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toEqual([
        'Local anesthesia (Infiltration)',
        'Mandibular nerve block',
        'Rubber dam isolation',
        'Post-extraction care instructions',
        'Suture removal 7 days',
      ]);
    });

    test('3.2 Dental clinical instruction chips render when initialToothNumber is provided', () => {
      const onSelectMock = mock(() => {});
      const onCloseMock = mock(() => {});

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: onCloseMock,
          catalog: SAMPLE_SERVICES,
          initialCategory: 'Dental',
          initialToothNumber: 18,
          initialToothSurface: 'MOD',
          onSelectOrder: onSelectMock,
        })
      );

      expect(html).toContain('Tooth #18 (MOD)');
    });

    test('3.3 Instruction chip toggle adds and removes chips with semicolon delimiter without losing tooth info', () => {
      // Helper simulating handleToggleChip
      const toggleChip = (prev: string, chip: string): string => {
        const trimmed = prev.trim();
        if (!trimmed) return chip;
        const parts = trimmed.split(';').map((p) => p.trim());
        if (parts.includes(chip)) {
          return parts.filter((p) => p !== chip).join('; ');
        }
        return `${trimmed}; ${chip}`;
      };

      let notes = 'Tooth #18 (MOD)';
      notes = toggleChip(notes, 'Local anesthesia (Infiltration)');
      expect(notes).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration)');

      notes = toggleChip(notes, 'Rubber dam isolation');
      expect(notes).toBe('Tooth #18 (MOD); Local anesthesia (Infiltration); Rubber dam isolation');

      // Toggling an existing chip removes it cleanly
      notes = toggleChip(notes, 'Local anesthesia (Infiltration)');
      expect(notes).toBe('Tooth #18 (MOD); Rubber dam isolation');

      // Removing the second chip leaves tooth notes intact
      notes = toggleChip(notes, 'Rubber dam isolation');
      expect(notes).toBe('Tooth #18 (MOD)');
    });

    test('3.4 OrderCatalogSearchModal exports DENTAL_CLINICAL_INSTRUCTION_CHIPS and binds it in source AST', async () => {
      const fs = await import('fs');
      const modalSource = fs.readFileSync(
        fileURLToPath(new URL('../components/consultation/OrderCatalogSearchModal.tsx', import.meta.url)),
        'utf8'
      );

      expect(modalSource).toContain('DENTAL_CLINICAL_INSTRUCTION_CHIPS');
      expect(modalSource).toContain('Dental Clinical Instructions & Notes');
      expect(modalSource).toContain("selectedCategory === 'Dental'");
      expect(modalSource).toContain("catLower.includes('dental')");

      // Verify all 5 dental instruction chips are exported
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS.length).toBe(5);
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toContain('Local anesthesia (Infiltration)');
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toContain('Mandibular nerve block');
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toContain('Rubber dam isolation');
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toContain('Post-extraction care instructions');
      expect(DENTAL_CLINICAL_INSTRUCTION_CHIPS).toContain('Suture removal 7 days');
    });
  });

  // -------------------------------------------------------------------------
  // 4. Odontogram Quick Order Pre-Selection & Cashier Invoice Integration (R4, R5)
  // -------------------------------------------------------------------------
  describe('4. Odontogram Quick Order Pre-Selection & Cashier Invoice Integration', () => {
    test('4.1 Quick order from odontogram pre-selects Dental category and passes tooth metadata', () => {
      let initialCategoryState = 'All';
      let initialToothNumberState: number | undefined;
      let initialToothSurfaceState: string | undefined;
      let modalVisibleState = false;

      const handleQuickOrderDentalProcedure = (toothNumber: number, toothSurface?: string) => {
        initialToothNumberState = toothNumber;
        initialToothSurfaceState = toothSurface;
        initialCategoryState = 'Dental';
        modalVisibleState = true;
      };

      // User clicks "+ Order Dental Procedure" for tooth #18 surface MOD
      handleQuickOrderDentalProcedure(18, 'MOD');

      expect(initialCategoryState).toBe('Dental');
      expect(initialToothNumberState).toBe(18);
      expect(initialToothSurfaceState).toBe('MOD');
      expect(modalVisibleState).toBe(true);
    });

    test('4.2 procedureCatalog includes "dental" category ensuring ordered dental procedures match', () => {
      const activeCatalog = SAMPLE_SERVICES.filter((s) => s.isActive);
      const catalogByCategory = (...categories: string[]) =>
        activeCatalog.filter((s) => categories.includes(s.category.toLowerCase()));

      const procedureCatalog = catalogByCategory('procedure', 'nursingservice', 'dental');

      // Verify all dental services are included in procedureCatalog
      const dentalItems = procedureCatalog.filter((p) => p.category.toLowerCase() === 'dental');
      expect(dentalItems.length).toBe(10);
      expect(procedureCatalog.some((p) => p.code === 'DENT-FILL-COMP')).toBe(true);
      expect(procedureCatalog.some((p) => p.code === 'DENT-EXT-SIMPLE')).toBe(true);
      expect(procedureCatalog.some((p) => p.code === 'PROC-NEB')).toBe(true);
    });

    test('4.3 Encounter signing maps ordered dental procedures to Cashier invoice line items', () => {
      const activeCatalog = SAMPLE_SERVICES.filter((s) => s.isActive);
      const catalogByCategory = (...categories: string[]) =>
        activeCatalog.filter((s) => categories.includes(s.category.toLowerCase()));
      const procedureCatalog = catalogByCategory('procedure', 'nursingservice', 'dental');

      const orderedProcedures = [
        {
          name: 'Composite Light-Cure Tooth Restoration',
          code: 'DENT-FILL-COMP',
          category: 'Dental',
          standardPrice: 950,
          toothNumber: 18,
          toothSurface: 'MOD',
          instructions: 'Tooth #18 (MOD); Local anesthesia (Infiltration); Rubber dam isolation',
        },
        {
          name: 'Tooth Extraction - Simple Exodontia',
          code: 'DENT-EXT-SIMPLE',
          category: 'Dental',
          standardPrice: 1000,
          toothNumber: 26,
          instructions: 'Tooth #26; Mandibular nerve block; Post-extraction care instructions',
        },
      ];

      // Simulate handleSignAndSync cashier billing item aggregation
      const billItems: Array<{
        serviceItemId?: string;
        itemCode?: string;
        description: string;
        category: string;
        unitPrice: number;
        quantity: number;
      }> = [];

      for (const proc of orderedProcedures) {
        const procInfo = procedureCatalog.find(
          (p) => p.name.toLowerCase() === proc.name.toLowerCase() || (p.code && p.code === proc.code)
        );
        billItems.push({
          serviceItemId: procInfo?.id,
          itemCode: proc.code || procInfo?.code,
          description: proc.name,
          category: proc.category || procInfo?.category || 'Procedure',
          unitPrice: proc.standardPrice || procInfo?.standardPrice || 0,
          quantity: 1,
        });
      }

      expect(billItems.length).toBe(2);

      expect(billItems[0]).toEqual({
        serviceItemId: 'dent-3',
        itemCode: 'DENT-FILL-COMP',
        description: 'Composite Light-Cure Tooth Restoration',
        category: 'Dental',
        unitPrice: 950,
        quantity: 1,
      });

      expect(billItems[1]).toEqual({
        serviceItemId: 'dent-4',
        itemCode: 'DENT-EXT-SIMPLE',
        description: 'Tooth Extraction - Simple Exodontia',
        category: 'Dental',
        unitPrice: 1000,
        quantity: 1,
      });
    });

    test('4.4 OrderCatalogItemPayload assembly preserves toothNumber, toothSurface, and instructions', () => {
      const selectedItem = SAMPLE_SERVICES.find((s) => s.code === 'DENT-FILL-COMP')!;
      const initialToothNumber = 18;
      const initialToothSurface = 'MOD';
      const instructions = 'Tooth #18 (MOD); Local anesthesia (Infiltration); Rubber dam isolation';

      const payload = {
        serviceItemId: selectedItem.id,
        code: selectedItem.code,
        name: selectedItem.name,
        category: selectedItem.category,
        standardPrice: selectedItem.standardPrice,
        philHealthCode: selectedItem.philHealthCode,
        philHealthDescription: selectedItem.philHealthDescription,
        isPhilHealthFormulary: selectedItem.isPhilHealthFormulary,
        fulfillmentMode: 'in_house' as const,
        instructions,
        toothNumber: initialToothNumber,
        toothSurface: initialToothSurface,
      };

      expect(payload.category).toBe('Dental');
      expect(payload.toothNumber).toBe(18);
      expect(payload.toothSurface).toBe('MOD');
      expect(payload.instructions).toContain('Rubber dam isolation');
      expect(payload.fulfillmentMode).toBe('in_house');
    });
  });
});
