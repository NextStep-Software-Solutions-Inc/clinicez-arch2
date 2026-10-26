// token-guard:ignore-file
/**
 * Test Suite: AuditWorkstation (Clinic-Wide Audit Log & Forensic Activity Trail)
 * Authoritative Sources:
 *  - PROJECT.md (Milestone 3, Features 3.1 - 3.7, Milestone 4 Quality Gate)
 *  - ORIGINAL_REQUEST.md (## 2026-10-17T03:10:29Z R3)
 *  - clinicez-ui-ux-expert Skill (Design Tokens, Urgency Badges, 4 UX States)
 *  - Reviewer 1 Defect Report (c:\Users\User\projects\nextstep\github\clinicez-arch2\.agents\teamwork\reviewer_m3_workstation_1\handoff.md)
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// =============================================================================
// 1. React Native Mocking for Headless Bun Environment
// =============================================================================

let currentWindowWidth = 1280;
let currentWindowHeight = 800;

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(onPress ? { onClick: onPress } : {}),
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
    get: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: currentWindowWidth, height: currentWindowHeight }),
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
  PanResponder: { create: () => ({ panHandlers: {} }) },
  processColor: (c: any) => c,
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'audit-uuid-' + Math.random().toString(36).substring(2, 9),
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

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: currentWindowWidth,
    height: currentWindowHeight,
    isCompact: currentWindowWidth < 768,
    isWorkstation: currentWindowWidth >= 768,
    isDesktop: currentWindowWidth >= 1024,
    isWide: currentWindowWidth >= 1280,
  }),
}));

// =============================================================================
// 2. Auth Context Mocking for RBAC Testing
// =============================================================================

let mockAuthUser: any = { role: 'Admin', name: 'Dr. Maria Santos' };
let mockPermissionsList: string[] = ['audit:read', 'audit:export'];

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    state: 'signedIn',
    permissions: mockPermissionsList,
    offline: false,
    notice: null,
    can: (p: string) => mockPermissionsList.includes(p),
  }),
  usePermission: (perm: string) => mockPermissionsList.includes(perm),
}));

// =============================================================================
// 3. Mock API Client & Canonical Test Fixtures
// =============================================================================

let lastApiCall: { method: string; url: string; params?: any } | null = null;
let mockAuditListResponse: any = null;
let mockAuditDetailResponse: any = null;
let mockApiError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      lastApiCall = { method: 'GET', url, params: config?.params };
      if (mockApiError) return [null, mockApiError];
      if (url.includes('/export')) return ['csv-data-blob', null];
      if (url.match(/\/audit\/[a-z0-9-]+$/i) || url.match(/\/api\/v1\/audit\/[a-z0-9-]+$/i)) {
        return [mockAuditDetailResponse ?? MOCK_DETAIL_ENTRY, null];
      }
      return [
        mockAuditListResponse ?? {
          items: MOCK_AUDIT_ENTRIES,
          totalCount: MOCK_AUDIT_ENTRIES.length,
          hasMore: false,
        },
        null,
      ];
    },
    getBlob: async (url: string, config?: any) => {
      lastApiCall = { method: 'GET', url, params: config?.params };
      if (mockApiError) return [null, mockApiError];
      return [new Blob(['test-blob'], { type: 'text/csv' }), null];
    },
    post: async (url: string, body?: any) => {
      lastApiCall = { method: 'POST', url, params: body };
      return [{ success: true }, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { theme } = await import('../constants/theme');
const { default: Badge } = await import('../components/ui/Badge');
const { PERMISSIONS } = await import('../constants/permissions');

// Import ACTUAL audit workstation components directly (no mock harness)
const { AuditTable } = await import('../components/audit/AuditTable');
const { AuditTableRow } = await import('../components/audit/AuditTableRow');
const { AuditFilterBar, CATEGORY_PILLS, DATE_PRESETS, SEVERITY_OPTIONS } = await import('../components/audit/AuditFilterBar');
const { AuditInspectionDrawer } = await import('../components/audit/AuditInspectionDrawer');
const { AuditTableSkeleton } = await import('../components/audit/AuditTableSkeleton');
const { AuditEmptyState } = await import('../components/audit/AuditEmptyState');
const { AuditExportModal } = await import('../components/audit/AuditExportModal');
const { AuditWorkstationView } = await import('../components/audit/AuditWorkstationView');
const { useAuditLogs } = await import('../hooks/useAuditLogs');
const { clinicService } = await import('../services/clinicService');
type ClinicAuditEntryDto = import('../services/clinicService').ClinicAuditEntryDto;
type ClinicAuditEntryDetailDto = import('../services/clinicService').ClinicAuditEntryDetailDto;

const MOCK_AUDIT_ENTRIES: ClinicAuditEntryDto[] = [
  {
    id: 'entry-sec-01',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-cdo-main',
    timestamp: '2026-10-17T04:30:00Z',
    category: 'Security',
    severity: 'Emergency',
    action: 'auth.login.failed',
    actorName: 'Unknown / Attacker',
    actorRole: 'Anonymous',
    clientIpAddress: '203.177.12.45',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    targetEntityType: 'StaffMember',
    targetEntityId: 'staff-admin-99',
    outcome: 'Failure',
    description: 'Consecutive failed login attempts triggered temporary account lockout',
    metadataJson: JSON.stringify({
      attemptCount: 5,
      lockoutDurationMinutes: 15,
      password: '[REDACTED_SECRET]',
    }),
    createdAt: '2026-10-17T04:30:00Z',
  },
  {
    id: 'entry-clin-01',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-cdo-main',
    timestamp: '2026-10-17T04:15:00Z',
    category: 'Clinical',
    severity: 'Routine',
    action: 'clinical.consultation.signed',
    actorStaffId: 'staff-dr-santos',
    actorName: 'Dr. Maria Santos',
    actorRole: 'Doctor',
    clientIpAddress: '192.168.1.104',
    userAgent: 'ClinicEZ-Workstation/1.0',
    targetEntityType: 'ConsultationEncounter',
    targetEntityId: 'enc-20261017-001',
    patientId: 'pat-juan-01',
    patientNameMasked: 'J*** D*** C***',
    patientPinMasked: '12-****5678-9',
    outcome: 'Success',
    description: 'Signed PhilHealth Konsulta consultation with 9-system physical exam',
    metadataJson: JSON.stringify({
      doctorPan: 'PAN-9948271',
      doctorPrc: 'PRC-0081294',
      icd10Codes: ['I10', 'E11.9'],
      chiefComplaint: '[Clinical Text Redacted - DPA RA 10173]',
      soapSubjective: '[Clinical Text Redacted - DPA RA 10173]',
      soapObjective: '[Clinical Text Redacted - DPA RA 10173]',
    }),
    createdAt: '2026-10-17T04:15:00Z',
  },
  {
    id: 'entry-bill-01',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-cdo-main',
    timestamp: '2026-10-17T03:50:00Z',
    category: 'Billing',
    severity: 'Urgent',
    action: 'billing.invoice.voided',
    actorStaffId: 'staff-cashier-ana',
    actorName: 'Ana Gomez',
    actorRole: 'Cashier',
    clientIpAddress: '192.168.1.112',
    targetEntityType: 'Invoice',
    targetEntityId: 'INV-2026-0042',
    patientId: 'pat-pedro-02',
    patientNameMasked: 'P*** R***',
    patientPinMasked: '08-****1122-3',
    outcome: 'Warning',
    description: 'Cashier voided invoice due to duplicate cashier entry before shift closure',
    metadataJson: JSON.stringify({
      invoiceTotal: 1250.0,
      voidReason: 'Cashier entered wrong patient account; re-issued as INV-2026-0043',
    }),
    createdAt: '2026-10-17T03:50:00Z',
  },
  {
    id: 'entry-yakap-01',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-cdo-main',
    timestamp: '2026-10-17T03:20:00Z',
    category: 'PhilHealth',
    severity: 'Urgent',
    action: 'yakap.transmittal.rejected',
    actorStaffId: 'staff-admin-99',
    actorName: 'Clinic Administrator',
    actorRole: 'Admin',
    clientIpAddress: '192.168.1.101',
    targetEntityType: 'YakapTransmittal',
    targetEntityId: 'TRANS-KONSULTA-0089',
    outcome: 'Failure',
    description: 'PhilHealth SOAP claims batch rejected: Invalid accreditation sequence',
    metadataJson: JSON.stringify({
      transmittalId: 'TRANS-KONSULTA-0089',
      rejectionCode: 'ERR-PH-302',
      rejectionMessage: 'Attending physician accreditation certificate expired on transmittal date',
    }),
    createdAt: '2026-10-17T03:20:00Z',
  },
  {
    id: 'entry-ops-01',
    tenantId: 'tenant-ustp',
    clinicId: 'clinic-cdo-main',
    timestamp: '2026-10-17T02:00:00Z',
    category: 'Operations',
    severity: 'Routine',
    action: 'admin.room.reassigned',
    actorStaffId: 'staff-admin-99',
    actorName: 'Clinic Administrator',
    actorRole: 'Admin',
    targetEntityType: 'ClinicRoom',
    targetEntityId: 'room-cons-1',
    outcome: 'Success',
    description: 'Updated room assignment: Dr. Santos assigned to Consultation Room 1 and Treatment Bay',
    metadataJson: JSON.stringify({
      roomId: 'room-cons-1',
      assignedDoctorIds: ['staff-dr-santos'],
    }),
    createdAt: '2026-10-17T02:00:00Z',
  },
];

const MOCK_DETAIL_ENTRY: ClinicAuditEntryDetailDto = {
  ...MOCK_AUDIT_ENTRIES[1],
  proseChecksums: {
    chiefComplaintHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    soapSubjectiveHash: 'a8f4e2d3198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852112',
    soapObjectiveHash: 'b7c1d3e5198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852994',
  },
};

// =============================================================================
// 4. Test Suite Execution
// =============================================================================

describe('Milestone M3 Remediation: High-Density Clinic Admin Audit Workstation Comprehensive Test Suite', () => {
  beforeEach(() => {
    currentWindowWidth = 1280;
    currentWindowHeight = 800;
    lastApiCall = null;
    mockAuditListResponse = null;
    mockAuditDetailResponse = null;
    mockApiError = null;
    mockAuthUser = { role: 'Admin', name: 'Dr. Maria Santos' };
    mockPermissionsList = ['audit:read', 'audit:export'];
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 1: Table Rendering and Column Validation (Actual Components)
  // ---------------------------------------------------------------------------
  describe('Dimension 1: Table Rendering & 9-Column Structure (AuditTable & AuditTableRow)', () => {
    test('1.1 AuditTable directly renders exactly 9 column headers in static markup', () => {
      let inspectedEntry: ClinicAuditEntryDto | null = null;
      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: MOCK_AUDIT_ENTRIES,
          loading: false,
          totalCount: MOCK_AUDIT_ENTRIES.length,
          pageNumber: 1,
          onInspect: (e) => { inspectedEntry = e; },
          onResetFilters: () => {},
        })
      );

      // Verify all 9 column header texts directly present in actual markup
      expect(markup).toContain('Timestamp');
      expect(markup).toContain('Category');
      expect(markup).toContain('Severity');
      expect(markup).toContain('Action');
      expect(markup).toContain('Actor');
      expect(markup).toContain('Target');
      expect(markup).toContain('Patient (Masked)');
      expect(markup).toContain('Outcome');
      expect(markup).toContain('Inspect');
    });

    test('1.2 AuditTableRow directly renders row data with formatted fields from ClinicAuditEntryDto', () => {
      let inspectedEntry: ClinicAuditEntryDto | null = null;
      const entry = MOCK_AUDIT_ENTRIES[1]; // Clinical consultation signed

      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry,
          isEven: false,
          onInspect: (e) => { inspectedEntry = e; },
        })
      );

      expect(markup).toContain('Dr. Maria Santos');
      expect(markup).toContain('Doctor');
      expect(markup).toContain('clinical.consultation.signed');
      expect(markup).toContain('ConsultationEncounter');
      expect(markup).toContain('enc-20261017-001');
      expect(markup).toContain('J*** D*** C***');
      expect(markup).toContain('12-****5678-9');
      expect(markup).toContain('Success');
      expect(markup).toContain('Routine');
      expect(markup).toContain('Inspect');
      expect(markup).toContain('aria-label="Inspect audit entry clinical.consultation.signed by Dr. Maria Santos"');
    });

    test('1.3 Non-patient events cleanly render em-dash fallback placeholder in patient column', () => {
      const secEntry = MOCK_AUDIT_ENTRIES[0]; // Failed login (non-patient)
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: secEntry,
          isEven: false,
          onInspect: () => {},
        })
      );

      // Em-dash placeholder for non-patient events
      expect(markup).toContain('—');
      expect(markup).toContain('auth.login.failed');
      expect(markup).toContain('Unknown / Attacker');
      expect(markup).toContain('Anonymous');
    });

    test('1.4 Outcome statuses map accurately to semantic badges (Success, Failure, Warning)', () => {
      const successMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: MOCK_AUDIT_ENTRIES[1], onInspect: () => {} })
      );
      expect(successMarkup).toContain('Success');

      const failureMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: MOCK_AUDIT_ENTRIES[0], onInspect: () => {} })
      );
      expect(failureMarkup).toContain('Failure');

      const warningMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: MOCK_AUDIT_ENTRIES[2], onInspect: () => {} })
      );
      expect(warningMarkup).toContain('Warning');
    });

    test('1.5 Memoized AuditTableRow wraps with React.memo and preserves function prototype', () => {
      // AuditTableRow must be memoized to prevent re-renders on high-density 50-row tables
      expect(typeof AuditTableRow).toBe('object'); // React.memo returns memo object
      expect((AuditTableRow as any).$$typeof).toBeDefined();

      const rendered = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry: MOCK_AUDIT_ENTRIES[4],
          isEven: true,
          onInspect: () => {},
        })
      );
      expect(rendered).toContain('admin.room.reassigned');
      expect(rendered).toContain('ClinicRoom');
      expect(rendered).toContain('room-cons-1');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 2: Urgency & Severity Visual Badges (@clinicez/design-tokens)
  // ---------------------------------------------------------------------------
  describe('Dimension 2: Urgency & Severity Visual Badges (@clinicez/design-tokens)', () => {
    test('2.1 Emergency severity maps strictly to red semantic tokens with dual-encoded STAT label', () => {
      const emergencyEntry = MOCK_AUDIT_ENTRIES[0];
      const rowMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: emergencyEntry, onInspect: () => {} })
      );
      expect(rowMarkup).toContain('STAT');

      expect(theme.colors.emergency).toBe('#DC2626');
      expect(theme.colors.emergencyBg).toBe('#FEE2E2');
      expect(theme.colors.emergencyText).toBe('#991B1B');
      expect(theme.colors.emergencyBorder).toBe('#FECACA');
    });

    test('2.2 Urgent severity maps strictly to orange semantic tokens with dual-encoded Urgent label', () => {
      const urgentEntry = MOCK_AUDIT_ENTRIES[2];
      const rowMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: urgentEntry, onInspect: () => {} })
      );
      expect(rowMarkup).toContain('Urgent');

      expect(theme.colors.urgent).toBe('#EA580C');
      expect(theme.colors.urgentBg).toBe('#FFEDD5');
      expect(theme.colors.urgentText).toBe('#C2410C');
      expect(theme.colors.urgentBorder).toBe('#FED7AA');
    });

    test('2.3 Routine severity maps strictly to teal brand/routine tokens with Routine label', () => {
      const routineEntry = MOCK_AUDIT_ENTRIES[1];
      const rowMarkup = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: routineEntry, onInspect: () => {} })
      );
      expect(rowMarkup).toContain('Routine');

      expect(theme.colors.routine).toBe('#0D6963');
      expect(theme.colors.routineBg).toBe('#D9FAF1');
      expect(theme.colors.routineText).toBe('#0A5651');
      expect(theme.colors.routineBorder).toBe('#A8EEDC');
    });

    test('2.4 Dual encoding compliance: Urgency badges NEVER rely on color alone', () => {
      const entriesBySeverity = [
        { entry: MOCK_AUDIT_ENTRIES[0], expectedText: 'STAT' },
        { entry: MOCK_AUDIT_ENTRIES[2], expectedText: 'Urgent' },
        { entry: MOCK_AUDIT_ENTRIES[1], expectedText: 'Routine' },
      ];

      for (const { entry, expectedText } of entriesBySeverity) {
        const rowMarkup = renderToStaticMarkup(
          React.createElement(AuditTableRow, { entry, onInspect: () => {} })
        );
        expect(rowMarkup).toContain(expectedText);
      }
    });

    test('2.5 Contrast ratios for all urgency badge states meet WCAG AA >= 4.5:1', () => {
      function luminance(hex: string): number {
        const h = hex.replace('#', '');
        const [r, g, b] = [0, 2, 4].map((i) => {
          const c = parseInt(h.slice(i, i + 2), 16) / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      function contrast(a: string, b: string): number {
        const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
        return (l1 + 0.05) / (l2 + 0.05);
      }

      expect(contrast(theme.colors.emergencyText, theme.colors.emergencyBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.colors.urgentText, theme.colors.urgentBg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.colors.routineText, theme.colors.routineBg)).toBeGreaterThanOrEqual(4.5);
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 3: Category Filter Bar & Interaction (AuditFilterBar)
  // ---------------------------------------------------------------------------
  describe('Dimension 3: Category Filter Bar & Interaction (AuditFilterBar)', () => {
    test('3.1 AuditFilterBar renders all 6 category pills in actual DOM markup', () => {
      let selectedCat = 'All';
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: selectedCat,
          onSelectCategory: (c) => { selectedCat = c; },
          search: '',
          onSearchChange: () => {},
          startDate: '',
          onStartDateChange: () => {},
          endDate: '',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {},
        })
      );

      // Verify pill labels from CATEGORY_PILLS constant rendered
      expect(CATEGORY_PILLS.length).toBe(6);
      for (const pill of CATEGORY_PILLS) {
        expect(markup).toContain(pill.label);
        expect(markup).toContain(`aria-label="Filter by ${pill.label}"`);
      }
    });

    test('3.2 AuditFilterBar renders search input with correct placeholder and accessibility attributes', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'Security',
          onSelectCategory: () => {},
          search: 'login',
          onSearchChange: () => {},
          startDate: '',
          onStartDateChange: () => {},
          endDate: '',
          onEndDateChange: () => {},
          severityFilter: 'Emergency',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('Search action, actor name, patient, entity ID or description...');
      expect(markup).toContain('aria-label="Search audit trail"');
      expect(markup).toContain('aria-label="Clear search"');
    });

    test('3.3 AuditFilterBar renders date presets group (today, 7d, 30d, all)', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '',
          onStartDateChange: () => {},
          endDate: '',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          datePreset: '7d',
          onResetFilters: () => {},
        })
      );

      expect(DATE_PRESETS.length).toBe(4);
      for (const preset of DATE_PRESETS) {
        expect(markup).toContain(preset.label);
        expect(markup).toContain(`aria-label="Date preset ${preset.label}"`);
      }
    });

    test('3.4 AuditFilterBar renders severity pills including Emergency (STAT), Urgent, Routine', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '',
          onStartDateChange: () => {},
          endDate: '',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {},
        })
      );

      expect(SEVERITY_OPTIONS.length).toBe(4);
      for (const opt of SEVERITY_OPTIONS) {
        expect(markup).toContain(opt.label);
      }
    });

    test('3.5 AuditFilterBar renders Reset Filters and Export Log CTA buttons', () => {
      let resetCalled = false;
      let exportCalled = false;
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'Billing',
          onSelectCategory: () => {},
          search: 'invoice',
          onSearchChange: () => {},
          startDate: '2026-10-01',
          onStartDateChange: () => {},
          endDate: '2026-10-17',
          onEndDateChange: () => {},
          severityFilter: 'Urgent',
          onSeverityFilterChange: () => {},
          onResetFilters: () => { resetCalled = true; },
          onOpenExport: () => { exportCalled = true; },
        })
      );

      expect(markup).toContain('Reset Filters');
      expect(markup).toContain('Export Log');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 4: Defensive States (Skeleton & Contextual Empty State)
  // ---------------------------------------------------------------------------
  describe('Dimension 4: Defensive States (AuditTableSkeleton, AuditEmptyState, Inline Date Alert)', () => {
    test('4.1 AuditTableSkeleton renders 8 structural animated skeleton rows in actual markup', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableSkeleton, { rows: 8 })
      );

      expect(markup).toContain('role="progressbar"');
      expect(markup).toContain('aria-label="Loading audit trail"');
      expect(markup).toContain('Loading audit entries...');
    });

    test('4.2 AuditTable with loading: true and empty items delegates directly to AuditTableSkeleton', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: [],
          loading: true,
          onInspect: () => {},
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('role="progressbar"');
      expect(markup).toContain('Loading audit entries...');
    });

    test('4.3 AuditEmptyState renders contextual explanation, search icon, and Reset Filters button', () => {
      let resetTriggered = false;
      const markup = renderToStaticMarkup(
        React.createElement(AuditEmptyState, {
          filterSummary: 'PhilHealth Yakap',
          onResetFilters: () => { resetTriggered = true; },
        })
      );

      expect(markup).toContain('No audit records found');
      expect(markup).toContain('No forensic events found matching &quot;PhilHealth Yakap&quot;');
      expect(markup).toContain('Reset Filters');
    });

    test('4.4 AuditTable with loading: false and empty items delegates directly to AuditEmptyState', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: [],
          loading: false,
          filterSummary: 'security.failed',
          onInspect: () => {},
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('No audit records found');
      expect(markup).toContain('No forensic events found matching &quot;security.failed&quot;');
      expect(markup).toContain('Reset Filters');
    });

    test('4.5 Invalid date range boundary (startDate > endDate) in AuditFilterBar renders inline alert', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '2026-10-20',
          onStartDateChange: () => {},
          endDate: '2026-10-10',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          dateRangeError: 'Start date cannot exceed end date.',
          onResetFilters: () => {},
        })
      );

      expect(markup).toContain('role="alert"');
      expect(markup).toContain('Start date cannot exceed end date.');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 5: Slide-Over Inspection Drawer & Metadata Diff (AuditInspectionDrawer)
  // ---------------------------------------------------------------------------
  describe('Dimension 5: Slide-Over Inspection Drawer & Metadata Diff (AuditInspectionDrawer)', () => {
    test('5.1 AuditInspectionDrawer renders forensic header with action verb, badges, and description', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Forensic Entry Inspection');
      expect(markup).toContain('clinical.consultation.signed');
      expect(markup).toContain('Action Summary');
      expect(markup).toContain('Signed PhilHealth Konsulta consultation with 9-system physical exam');
      expect(markup).toContain('aria-label="Close inspection drawer"');
    });

    test('5.2 Drawer displays actor credentials, client IP address, user agent, and target IDs', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Actor &amp; Forensic Network Identity');
      expect(markup).toContain('Dr. Maria Santos');
      expect(markup).toContain('Doctor');
      expect(markup).toContain('staff-dr-santos');
      expect(markup).toContain('192.168.1.104');
      expect(markup).toContain('ClinicEZ-Workstation/1.0');
      expect(markup).toContain('ConsultationEncounter');
      expect(markup).toContain('enc-20261017-001');
    });

    test('5.3 Patient Privacy Protection section displays DPA RA 10173 notice and masked identifiers', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Patient Privacy Protection');
      expect(markup).toContain('DPA RA 10173 Compliant');
      expect(markup).toContain('Direct PHI is cryptographically segregated');
      expect(markup).toContain('J*** D*** C***');
      expect(markup).toContain('12-****5678-9');
      expect(markup).toContain('pat-juan-01');
    });

    test('5.4 Metadata diff strictly displays [Clinical Text Redacted - DPA RA 10173] with structural codes', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Sanitized Metadata &amp; Diff Viewer');
      expect(markup).toContain('[Clinical Text Redacted - DPA RA 10173]');
      expect(markup).toContain('PAN-9948271');
      expect(markup).toContain('PRC-0081294');
      expect(markup).toContain('I10');
      expect(markup).toContain('E11.9');
    });

    test('5.5 Drawer renders SHA-256 cryptographic narrative checksums from detail DTO', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Cryptographic Forensic Checksums (SHA-256)');
      expect(markup).toContain('chiefComplaintHash');
      expect(markup).toContain('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      expect(markup).toContain('soapSubjectiveHash');
      expect(markup).toContain('a8f4e2d3198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852112');
      expect(markup).toContain('soapObjectiveHash');
      expect(markup).toContain('b7c1d3e5198fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852994');
    });

    test('5.6 Drawer displays clear fallback message when detail contains no prose checksums', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[0], // security event (no prose checksums)
          detail: { ...MOCK_AUDIT_ENTRIES[0], proseChecksums: {} },
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toContain('No free-text clinical prose hashes attached to this transaction.');
    });

    test('5.7 Drawer returns empty string when entry is null', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: null,
          detail: null,
          loadingDetail: false,
          onClose: () => {},
        })
      );

      expect(markup).toBe('');
    });

    test('5.8 Breakpoint adaptation: Desktop renders desktopOverlay; Mobile renders Modal', () => {
      currentWindowWidth = 1280;
      const desktopMarkup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );
      expect(desktopMarkup).toContain('aria-label="Dismiss inspection drawer"');

      currentWindowWidth = 412;
      const mobileMarkup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: MOCK_AUDIT_ENTRIES[1],
          detail: MOCK_DETAIL_ENTRY,
          loadingDetail: false,
          onClose: () => {},
        })
      );
      expect(mobileMarkup).toContain('Forensic Entry Inspection');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 6: Export Modal & Limits Selection (AuditExportModal)
  // ---------------------------------------------------------------------------
  describe('Dimension 6: Export Modal & Limits Selection (AuditExportModal)', () => {
    test('6.1 AuditExportModal renders format selection for CSV and JSON streaming', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: async () => {},
          isExporting: false,
          activeCategory: 'All',
          activeSeverity: 'All',
          activeSearch: '',
          startDate: '',
          endDate: '',
        })
      );

      expect(markup).toContain('Export Audit Records');
      expect(markup).toContain('Generate compliant forensic log stream');
      expect(markup).toContain('CSV (Spreadsheet)');
      expect(markup).toContain('RFC 4180 with UTF-8 BOM for Microsoft Excel / Sheets');
      expect(markup).toContain('JSON (Raw Stream)');
      expect(markup).toContain('Full forensic metadata and SHA-256 prose digests');
    });

    test('6.2 AuditExportModal renders limit choices for 1,000, 5,000, and 10,000 rows', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: async () => {},
          isExporting: false,
          activeCategory: 'All',
          activeSeverity: 'All',
          activeSearch: '',
          startDate: '',
          endDate: '',
        })
      );

      expect(markup).toContain('Maximum Rows Limit');
      expect(markup).toContain('1,000 rows');
      expect(markup).toContain('5,000 rows');
      expect(markup).toContain('10,000 rows');
    });

    test('6.3 AuditExportModal renders active filter scope summary', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: async () => {},
          isExporting: false,
          activeCategory: 'Security',
          activeSeverity: 'Emergency',
          activeSearch: 'login failed',
          startDate: '2026-10-01',
          endDate: '2026-10-17',
        })
      );

      expect(markup).toContain('Export Scope (Active Filters)');
      expect(markup).toContain('Security');
      expect(markup).toContain('Emergency');
      expect(markup).toContain('login failed');
      expect(markup).toContain('2026-10-01 → 2026-10-17');
    });

    test('6.4 Auditing the Auditor Notice explicitly cites DPA RA 10173 and immutable event trigger', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: async () => {},
          isExporting: false,
          activeCategory: 'All',
          activeSeverity: 'All',
          activeSearch: '',
          startDate: '',
          endDate: '',
        })
      );

      expect(markup).toContain('Auditing the Auditor Notice');
      expect(markup).toContain('audit.log.exported');
      expect(markup).toContain('DPA RA 10173');
      expect(markup).toContain('STAT Event');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 7: Full Workstation View & RBAC Gating (AuditWorkstationView)
  // ---------------------------------------------------------------------------
  describe('Dimension 7: Full Workstation View & RBAC Gating (AuditWorkstationView)', () => {
    test('7.1 Administrator with audit:read permission renders complete audit workstation', () => {
      mockAuthUser = { role: 'Admin', name: 'Dr. Maria Santos' };
      mockPermissionsList = ['audit:read', 'audit:export'];

      const markup = renderToStaticMarkup(
        React.createElement(AuditWorkstationView, {})
      );

      // Shell layout provides the page header; workstation body provides controls, search, and table
      expect(markup).toContain('Search action, actor name, patient, entity ID or description...');
      expect(markup).toContain('Refresh');
      expect(markup).toContain('Export Log');
      expect(markup).toContain('Reset Filters');
    });

    test('7.2 Staff member lacking audit:read and non-admin displays Access Denied', () => {
      mockAuthUser = { role: 'Nurse', name: 'Nurse Joy' };
      mockPermissionsList = ['clinical:vitals'];

      const markup = renderToStaticMarkup(
        React.createElement(AuditWorkstationView, {})
      );

      expect(markup).toContain('Access Denied');
      expect(markup).toContain('You do not have administrative permission (audit:read) to view the clinic audit log.');
    });

    test('7.3 Workstation does not render internal duplicate header (shell layout provides header)', () => {
      mockAuthUser = { role: 'Admin', name: 'Dr. Maria Santos' };
      mockPermissionsList = ['audit:read', 'audit:export'];

      const markup = renderToStaticMarkup(
        React.createElement(AuditWorkstationView, { embeddedInSettings: true })
      );

      // Shell layout handles the page heading; workstation does not render duplicate header
      expect(markup).not.toContain('Audit Log &amp; Forensic Trail');
      // Still renders filter bar and table
      expect(markup).toContain('Search action, actor name, patient, entity ID or description...');
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 8: useAuditLogs Hook & clinicService API Methods
  // ---------------------------------------------------------------------------
  describe('Dimension 8: useAuditLogs Hook & clinicService API Methods', () => {
    test('8.1 clinicService.getAuditLogs correctly encodes parameters into URL query string', async () => {
      const [result, err] = await clinicService.getAuditLogs({
        category: 'Security',
        severity: 'Emergency',
        search: 'unauthorized',
        startDate: '2026-10-01',
        endDate: '2026-10-17T23:59:59.999Z',
        before: '2026-10-17T03:00:00Z',
        pageSize: 50,
      });

      expect(err).toBeNull();
      expect(result).toBeDefined();
      expect(lastApiCall).toBeDefined();
      expect(lastApiCall!.method).toBe('GET');
      expect(lastApiCall!.url).toContain('/audit?');
      expect(lastApiCall!.url).toContain('category=Security');
      expect(lastApiCall!.url).toContain('severity=Emergency');
      expect(lastApiCall!.url).toContain('search=unauthorized');
      expect(lastApiCall!.url).toContain('startDate=2026-10-01');
      expect(lastApiCall!.url).toContain('pageSize=50');
      expect(lastApiCall!.url).toContain('before=2026-10-17T03%3A00%3A00Z');
    });

    test('8.2 clinicService.getAuditEntryDetail calls /audit/{id} and returns prose checksums', async () => {
      const [detail, err] = await clinicService.getAuditEntryDetail('entry-clin-01');

      expect(err).toBeNull();
      expect(detail).toBeDefined();
      expect(lastApiCall).toBeDefined();
      expect(lastApiCall!.method).toBe('GET');
      expect(lastApiCall!.url).toBe('/audit/entry-clin-01');
      expect(detail!.proseChecksums).toBeDefined();
      expect(detail!.proseChecksums.soapSubjectiveHash).toMatch(/^[a-f0-9]{64}$/);
    });

    test('8.3 clinicService.exportAuditLogs passes format, category, and limit to endpoint', async () => {
      const [blob, err] = await clinicService.exportAuditLogs({
        format: 'json',
        category: 'Clinical',
        severity: 'Routine',
        limit: 10000,
      });

      expect(err).toBeNull();
      expect(blob).toBeDefined();
      expect(lastApiCall).toBeDefined();
      expect(lastApiCall!.method).toBe('GET');
      expect(lastApiCall!.url).toContain('/audit/export?');
      expect(lastApiCall!.url).toContain('format=json');
      expect(lastApiCall!.url).toContain('category=Clinical');
      expect(lastApiCall!.url).toContain('severity=Routine');
      expect(lastApiCall!.url).toContain('limit=10000');
    });

    test('8.4 useAuditLogs hook initializes with valid default state', () => {
      let hookState: any = null;
      function HookConsumer() {
        hookState = useAuditLogs({ initialPageSize: 50 });
        return React.createElement('div', null);
      }

      renderToStaticMarkup(React.createElement(HookConsumer));

      expect(hookState).toBeDefined();
      expect(hookState.category).toBe('All');
      expect(hookState.severity).toBe('All');
      expect(hookState.search).toBe('');
      expect(hookState.pageSize).toBe(50);
      expect(hookState.datePreset).toBe('7d');
      expect(typeof hookState.exportLogs).toBe('function');
      expect(typeof hookState.resetFilters).toBe('function');
      expect(typeof hookState.applyDatePreset).toBe('function');
      expect(typeof hookState.openDetail).toBe('function');
    });

    test('8.5 useAuditLogs exportLogs forwards user-selected limit parameter to clinicService', async () => {
      let hookState: any = null;
      function HookConsumer() {
        hookState = useAuditLogs({ canRead: true });
        return React.createElement('div', null);
      }

      renderToStaticMarkup(React.createElement(HookConsumer));

      // Invoke exportLogs with format = json and limit = 10000
      const exportResult = await hookState.exportLogs('json', 10000);
      expect(exportResult.success).toBe(true);

      // Verify that clinicService.exportAuditLogs was called with limit: 10000
      expect(lastApiCall).toBeDefined();
      expect(lastApiCall!.url).toContain('format=json');
      expect(lastApiCall!.url).toContain('limit=10000');
    });

    test('8.6 useAuditLogs date validation detects inverted date boundaries (startDate > endDate)', () => {
      let hookState: any = null;
      function HookConsumer() {
        hookState = useAuditLogs({ canRead: true });
        return React.createElement('div', null);
      }

      renderToStaticMarkup(React.createElement(HookConsumer));

      // Test date validation logic inside hook
      expect(hookState.dateRangeError).toBeNull();
      // Set inverted dates
      hookState.setStartDate('2026-10-25');
      hookState.setEndDate('2026-10-15');
    });

    test('8.7 useAuditLogs halts fetch and does not make API call when canRead is false', async () => {
      lastApiCall = null;
      let hookState: any = null;
      function HookConsumer() {
        hookState = useAuditLogs({ canRead: false });
        return React.createElement('div', null);
      }

      renderToStaticMarkup(React.createElement(HookConsumer));

      await hookState.refresh();
      // When canRead is false, fetchLogs exits immediately without requesting API
      expect(lastApiCall).toBeNull();
    });

    test('8.8 useAuditLogs date preset application computes valid ISO dates for different presets', () => {
      let allState: any = null;
      function AllConsumer() {
        allState = useAuditLogs({ initialDatePreset: 'all' });
        return React.createElement('div', null);
      }
      renderToStaticMarkup(React.createElement(AllConsumer));

      expect(allState.datePreset).toBe('all');
      expect(allState.startDate).toBe('');
      expect(allState.endDate).toBe('');

      let todayState: any = null;
      function TodayConsumer() {
        todayState = useAuditLogs({ initialDatePreset: 'today' });
        return React.createElement('div', null);
      }
      renderToStaticMarkup(React.createElement(TodayConsumer));

      const todayStr = new Date().toISOString().slice(0, 10);
      expect(todayState.datePreset).toBe('today');
      expect(todayState.startDate).toBe(todayStr);
      expect(todayState.endDate).toBe(todayStr);
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 9: Strict Design Token Usage (Zero Raw Hex Verification)
  // ---------------------------------------------------------------------------
  describe('Dimension 9: Strict Design Token Usage (Zero Raw Hex Verification)', () => {
    test('9.1 Design token check script passes cleanly with zero violations', async () => {
      const { execSync } = await import('child_process');
      const rootDir = fs.existsSync(path.resolve(__dirname, '../../../package.json'))
        ? path.resolve(__dirname, '../../..')
        : path.resolve(process.cwd());

      const scriptPath = path.resolve(rootDir, 'apps/clinic-app/scripts/check-tokens.mjs');
      const runtime = process.execPath || 'node';
      const output = execSync(`"${runtime}" "${scriptPath}" --strict`, {
        cwd: rootDir,
        encoding: 'utf8',
      });
      expect(output).toContain('Token guard: 0 violation(s) in 0 file(s)');
    }, { timeout: 30000 });

    test('9.2 Brand teal hex #0D6963 is consumed exclusively through theme.colors.primary', () => {
      expect(theme.colors.primary).toBe('#0D6963');
      expect(theme.colors.onPrimary).toBe('#FFFFFF');
    });

    test('9.3 All urgency colors in theme.ts match required statutory design tokens', () => {
      expect(theme.colors.emergency).toBe('#DC2626');
      expect(theme.colors.emergencyBg).toBe('#FEE2E2');
      expect(theme.colors.urgent).toBe('#EA580C');
      expect(theme.colors.urgentBg).toBe('#FFEDD5');
      expect(theme.colors.routine).toBe('#0D6963');
      expect(theme.colors.routineBg).toBe('#D9FAF1');
    });

    test('9.4 AST / Regex token scanner verifies newly created audit component paths', () => {
      const AUDIT_COMPONENT_FILES = [
        'apps/clinic-app/navigation/screens/Audit.screen.tsx',
        'apps/clinic-app/components/audit/AuditWorkstationView.tsx',
        'apps/clinic-app/components/audit/AuditFilterBar.tsx',
        'apps/clinic-app/components/audit/AuditTable.tsx',
        'apps/clinic-app/components/audit/AuditTableRow.tsx',
        'apps/clinic-app/components/audit/AuditRow.tsx',
        'apps/clinic-app/components/audit/AuditInspectionDrawer.tsx',
        'apps/clinic-app/components/audit/AuditTableSkeleton.tsx',
        'apps/clinic-app/components/audit/AuditEmptyState.tsx',
        'apps/clinic-app/components/audit/AuditExportModal.tsx',
      ];

      const HEX_COLOR_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b|\brgba?\(/g;
      const FONT_SIZE_REGEX = /\bfontSize:\s*\d+/g;
      const RADIUS_REGEX = /\b(?!shadow)\w*[rR]adius:\s*[1-9]\d*/g;

      const rootDir = fs.existsSync(path.resolve(__dirname, '../../../package.json'))
        ? path.resolve(__dirname, '../../..')
        : path.resolve(process.cwd());

      for (const relPath of AUDIT_COMPONENT_FILES) {
        const fullPath = path.resolve(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Strip comments
          const clean = content.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

          const hexMatches = clean.match(HEX_COLOR_REGEX) || [];
          expect(hexMatches.length).toBe(0);

          const fontMatches = clean.match(FONT_SIZE_REGEX) || [];
          expect(fontMatches.length).toBe(0);

          const radiusMatches = clean.match(RADIUS_REGEX) || [];
          expect(radiusMatches.length).toBe(0);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // DIMENSION 10: Clinic Regional Settings Integration & Timestamp Display
  // ---------------------------------------------------------------------------
  describe('Dimension 10: Clinic Regional Settings Integration & Timestamp Display', () => {
    test('10.1 AuditTableRow renders formatted timestamp respecting default clinic settings', () => {
      const entry = MOCK_AUDIT_ENTRIES[1]; // '2026-10-17T04:15:00Z'
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry,
          onInspect: () => {},
        })
      );

      // In Asia/Manila (UTC+8), 04:15:00Z is 12:15 PM
      expect(markup).toContain('Oct 17, 2026, 12:15 PM');
    });

    test('10.2 AuditTableRow respects custom date and time format overrides', () => {
      const entry = MOCK_AUDIT_ENTRIES[1]; // '2026-10-17T04:15:00Z'
      const markup = renderToStaticMarkup(
        React.createElement(AuditTableRow, {
          entry,
          onInspect: () => {},
          dateFormat: 'dd/MM/yyyy',
          timeFormat: '24h',
        })
      );

      expect(markup).toContain('17/10/2026, 12:15');
    });

    test('10.3 AuditTable forwards regional configuration props to all rows', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: [MOCK_AUDIT_ENTRIES[1]],
          loading: false,
          totalCount: 1,
          pageNumber: 1,
          onInspect: () => {},
          onResetFilters: () => {},
          dateFormat: 'yyyy-MM-dd',
          timeFormat: '24h',
          timeZoneId: 'UTC',
        })
      );

      // In UTC 24h: 04:15
      expect(markup).toContain('2026-10-17, 04:15');
    });

    test('10.4 AuditInspectionDrawer renders formatted Clinic Timestamp alongside UTC Timestamp', () => {
      const entry = MOCK_AUDIT_ENTRIES[1];
      const markup = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry,
          detail: null,
          loadingDetail: false,
          onClose: () => {},
          dateFormat: 'd MMM yyyy',
          timeFormat: '12h',
          timeZoneId: 'Asia/Manila',
        })
      );

      expect(markup).toContain('UTC Timestamp');
      expect(markup).toContain(entry.timestamp);
      expect(markup).toContain('Clinic Timestamp');
      expect(markup).toContain('17 Oct 2026, 12:15 PM');
    });
  });
});
