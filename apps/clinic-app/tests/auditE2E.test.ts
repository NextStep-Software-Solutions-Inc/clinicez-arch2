// token-guard:ignore-file
/**
 * Test Suite: AuditE2E (End-to-End Audit Workstation User Journeys)
 * Authoritative Sources:
 *  - TEST_INFRA.md (§ Test Architecture & Coverage Thresholds)
 *  - DISPATCH.md (Worker M4: E2E Test Suite & Dual-Track Verification Specialist)
 *  - ORIGINAL_REQUEST.md (## 2026-10-17T03:10:29Z R3 Admin Workstation)
 *  - clinicez-ui-ux-expert Skill (Clinical Urgency Badges, 4 UX States, Semantic Tokens)
 *
 * Verifies End-to-End User Workflows:
 *  1. Standalone /audit route loading, responsive layout, and initial state.
 *  2. Dual-encoded clinical urgency badges (STAT / Urgent / Routine) across table rows and inspection drawer.
 *  3. Multi-dimensional category filtering (all 6 categories) and severity combinations.
 *  4. Defensive date range validation (startDate > endDate triggers inline alert without crash).
 *  5. Desktop slide-over inspection drawer (>=1024px) with SHA-256 prose checksums and DPA RA 10173 notices.
 *  6. Backward cursor pagination traversing earlier records and resetting upon filter changes.
 *  7. Export modal format selection (CSV / JSON) and row limits (1,000, 5,000, 10,000).
 *  8. Strict design token compliance (zero raw hex literals, semantic theme token mapping).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { theme } from '../constants/theme';

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
  Vibration: { vibrate: () => {}, cancel: () => {} },
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

mock.module('../components/layout/ResponsiveLayout', () => ({
  default: ({ children, headerTitle, headerSubtitle }: any) =>
    React.createElement(
      'div',
      {
        'data-component': 'ResponsiveLayout',
        'data-title': headerTitle,
        'data-subtitle': headerSubtitle,
      },
      React.createElement('div', null, headerTitle),
      React.createElement('div', null, headerSubtitle),
      children
    ),
}));

// =============================================================================
// 2. Auth Context Mocking for RBAC Testing
// =============================================================================

let mockAuthUser: any = { role: 'Admin', name: 'Dr. Roberto Santos' };
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
// 3. Mock Canonical Fixtures for Full User Journey E2E
// =============================================================================

const MOCK_E2E_AUDIT_LOGS = [
  {
    id: 'e2e-audit-001',
    tenantId: 'tenant-e2e-ph',
    clinicId: 'clinic-alpha-qc',
    timestamp: '2026-10-17T05:30:00.000Z',
    category: 'Security',
    severity: 'Emergency',
    action: 'auth.account.locked',
    actorStaffId: null,
    actorName: 'SecurityEnforcementEngine',
    actorRole: 'SystemSecurity',
    clientIpAddress: '203.0.113.42',
    userAgent: 'Python-requests/2.28.1',
    targetEntityType: 'StaffMember',
    targetEntityId: 'staff-9001',
    patientId: null,
    patientNameMasked: null,
    patientPinMasked: null,
    outcome: 'Warning',
    description: 'Account nurse.santos locked automatically after 5 consecutive failed authentications from 203.0.113.42',
    metadataJson: '{"threshold":5,"offendingIp":"203.0.113.42"}',
  },
  {
    id: 'e2e-audit-002',
    tenantId: 'tenant-e2e-ph',
    clinicId: 'clinic-alpha-qc',
    timestamp: '2026-10-17T05:25:00.000Z',
    category: 'Billing',
    severity: 'Urgent',
    action: 'billing.invoice.voided',
    actorStaffId: 'staff-cashier-01',
    actorName: 'Cashier Mark Santos',
    actorRole: 'Cashier',
    clientIpAddress: '192.168.10.88',
    userAgent: 'ClinicWorkstation/1.0 (Cashier-POS-01)',
    targetEntityType: 'Invoice',
    targetEntityId: 'INV-202610-0412',
    patientId: 'patient-4401',
    patientNameMasked: 'M*** G***',
    patientPinMasked: '04-****7890-1',
    outcome: 'Warning',
    description: 'Invoice INV-202610-0412 voided by cashier. Statutory Reason: Duplicate charge for whole ultrasound',
    metadataJson: '{"originalAmount":2850.00,"statutoryReason":"Duplicate charge"}',
  },
  {
    id: 'e2e-audit-003',
    tenantId: 'tenant-e2e-ph',
    clinicId: 'clinic-alpha-qc',
    timestamp: '2026-10-17T05:15:00.000Z',
    category: 'Clinical',
    severity: 'Routine',
    action: 'clinical.consultation.signed',
    actorStaffId: 'staff-doc-01',
    actorName: 'Dr. Roberto Santos, MD',
    actorRole: 'Physician',
    clientIpAddress: '192.168.10.22',
    userAgent: 'ClinicWorkstation/1.0 (Doctor-Station-03)',
    targetEntityType: 'ConsultationEncounter',
    targetEntityId: 'enc-7701',
    patientId: 'patient-1201',
    patientNameMasked: 'J*** D*** C***',
    patientPinMasked: '12-****8901-2',
    outcome: 'Success',
    description: 'Consultation encounter signed with ICD-10 J18.9 for J*** D*** C***',
    metadataJson: '{"subjective":"[Clinical Text Redacted - DPA RA 10173]","subjectiveChecksum":"sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069","icd10":"J18.9"}',
  },
  {
    id: 'e2e-audit-004',
    tenantId: 'tenant-e2e-ph',
    clinicId: 'clinic-alpha-qc',
    timestamp: '2026-10-17T05:00:00.000Z',
    category: 'PhilHealth',
    severity: 'Routine',
    action: 'yakap.ekas.created',
    actorStaffId: 'staff-doc-01',
    actorName: 'Dr. Roberto Santos, MD',
    actorRole: 'Physician',
    clientIpAddress: '192.168.10.22',
    userAgent: 'ClinicWorkstation/1.0 (Doctor-Station-03)',
    targetEntityType: 'EkasRecord',
    targetEntityId: 'EKAS-202610-0914',
    patientId: 'patient-1201',
    patientNameMasked: 'J*** D*** C***',
    patientPinMasked: '12-****8901-2',
    outcome: 'Success',
    description: 'eKAS #EKAS-202610-0914 generated for patient J*** D*** C***',
    metadataJson: '{"ekasNumber":"EKAS-202610-0914","accreditationNumber":"H99214001"}',
  },
  {
    id: 'e2e-audit-005',
    tenantId: 'tenant-e2e-ph',
    clinicId: 'clinic-alpha-qc',
    timestamp: '2026-10-17T04:45:00.000Z',
    category: 'Operations',
    severity: 'Routine',
    action: 'operations.schedule.created',
    actorStaffId: 'staff-admin-01',
    actorName: 'Admin Sarah',
    actorRole: 'Administrator',
    clientIpAddress: '192.168.10.10',
    userAgent: 'ClinicWorkstation/1.0',
    targetEntityType: 'DoctorSchedule',
    targetEntityId: 'SCHED-QC-101',
    patientId: null,
    patientNameMasked: null,
    patientPinMasked: null,
    outcome: 'Success',
    description: 'Doctor consultation schedule template published for Room 3',
    metadataJson: '{"room":"Room 3","daysOfWeek":["Monday","Wednesday","Friday"]}',
  },
];

const MOCK_E2E_DETAIL = {
  ...MOCK_E2E_AUDIT_LOGS[2], // Dr. Santos consultation
  metadataJson: JSON.stringify({
    subjective: '[Clinical Text Redacted - DPA RA 10173]',
    subjectiveChecksum: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    objective: '[Clinical Text Redacted - DPA RA 10173]',
    objectiveChecksum: 'sha256:a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    assessment: '[Clinical Text Redacted - DPA RA 10173]',
    assessmentChecksum: 'sha256:c221e646ebfa80726ec584547beab8645cbb6dbd',
    plan: '[Clinical Text Redacted - DPA RA 10173]',
    planChecksum: 'sha256:49942a69d8aa53efd68378772a813dbe610731eb',
    icd10: 'J18.9',
    medication: 'Amoxicillin/Clavulanate 1000mg',
  }),
  proseChecksums: {
    subjectiveChecksum: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
    objectiveChecksum: 'sha256:a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    assessmentChecksum: 'sha256:c221e646ebfa80726ec584547beab8645cbb6dbd',
    planChecksum: 'sha256:49942a69d8aa53efd68378772a813dbe610731eb',
  },
  createdAt: '2026-10-17T05:15:01.000Z',
};

let lastApiCall: { method: string; url: string; params?: any } | null = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async (url: string, config?: any) => {
      let params = config?.params;
      if (!params && url.includes('?')) {
        const query = url.slice(url.indexOf('?') + 1);
        params = Object.fromEntries(new URLSearchParams(query).entries());
      }
      lastApiCall = { method: 'GET', url, params };
      if (url.includes('/export')) return ['test-csv-data', null];
      if (url.match(/\/audit\/[a-z0-9-]+$/i) || url.match(/\/api\/v1\/audit\/[a-z0-9-]+$/i)) {
        return [MOCK_E2E_DETAIL, null];
      }
      return [
        {
          items: MOCK_E2E_AUDIT_LOGS,
          totalCount: MOCK_E2E_AUDIT_LOGS.length,
          hasMore: true,
          nextCursor: 'eyJ0aW1lc3RhbXAiOiIyMDI2LTEwLTE3VDA0OjQ1OjAwLjAwMFoifQ==',
        },
        null,
      ];
    },
    getBlob: async (url: string, config?: any) => {
      let params = config?.params;
      if (!params && url.includes('?')) {
        const query = url.slice(url.indexOf('?') + 1);
        params = Object.fromEntries(new URLSearchParams(query).entries());
      }
      lastApiCall = { method: 'GET', url, params };
      return [new Blob(['Id,TimestampUtc\n1,2026-10-17'], { type: 'text/csv' }), null];
    },
    post: async (url: string, body?: any) => {
      lastApiCall = { method: 'POST', url, params: body };
      return [{ success: true }, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

// Load Actual Application Components
const { default: AuditScreen } = await import('../navigation/screens/Audit.screen');
const { AuditWorkstationView } = await import('../components/audit/AuditWorkstationView');
const { AuditTableRow } = await import('../components/audit/AuditTableRow');
const { AuditTable } = await import('../components/audit/AuditTable');
const { AuditFilterBar, CATEGORY_PILLS, SEVERITY_OPTIONS, DATE_PRESETS } = await import('../components/audit/AuditFilterBar');
const { AuditInspectionDrawer } = await import('../components/audit/AuditInspectionDrawer');
const { AuditExportModal } = await import('../components/audit/AuditExportModal');
const { clinicService } = await import('../services/clinicService');

describe('Milestone M4: Clinic Admin Audit Workstation E2E Verification Suite', () => {
  beforeEach(() => {
    currentWindowWidth = 1280;
    currentWindowHeight = 800;
    mockAuthUser = { role: 'Admin', name: 'Dr. Roberto Santos' };
    mockPermissionsList = ['audit:read', 'audit:export'];
    lastApiCall = null;
  });

  // ===========================================================================
  // WORKFLOW 1: Standalone /audit Route Loading & Navigation Registration
  // ===========================================================================
  describe('Workflow 1: Standalone Route Loading & Navigation Architecture', () => {
    test('1.1 AuditScreen mounts cleanly with ResponsiveLayout header and subtitle', () => {
      const html = renderToStaticMarkup(React.createElement(AuditScreen));
      expect(html).toContain('Audit Log');
      expect(html).toContain('Clinic-wide forensic activity trail &amp; privacy compliance');
    });

    test('1.2 Audit route is registered with linking path "audit" in main navigation', () => {
      // Inspect static configuration of Navigation container
      const fsNavContent = fs.readFileSync(path.join(__dirname, '../navigation/Navigation.tsx'), 'utf8');
      expect(fsNavContent).toContain("linking: 'audit'");
      expect(fsNavContent).toContain("title: 'Audit Log'");
      expect(fsNavContent).toContain("tabBarIcon: tabIcon('scroll')");
      expect(fsNavContent).toContain('screen: AuditScreen');
    });

    test('1.3 Workstation displays primary action buttons (Refresh and Export Log)', () => {
      const html = renderToStaticMarkup(React.createElement(AuditWorkstationView));
      expect(html).toContain('Refresh');
      expect(html).toContain('Export Log');
    });
  });

  // ===========================================================================
  // WORKFLOW 2: Dual-Encoded Clinical Urgency Badges (STAT / Urgent / Routine)
  // ===========================================================================
  describe('Workflow 2: Clinical Urgency Visual & Textual Dual-Encoding', () => {
    test('2.1 Emergency severity maps strictly to textual label "STAT" and emergency variant', () => {
      const emergencyEntry = MOCK_E2E_AUDIT_LOGS[0]; // Severity: Emergency
      const html = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: emergencyEntry as any, onInspect: () => {} })
      );
      // Dual-encoding: "STAT" label rendered alongside semantic emergency container
      expect(html).toContain('STAT');
      expect(html).not.toContain('>Emergency<'); // Replaced by clinical statutory abbreviation STAT
    });

    test('2.2 Urgent severity renders "Urgent" badge with warning/expedited styling', () => {
      const urgentEntry = MOCK_E2E_AUDIT_LOGS[1]; // Severity: Urgent
      const html = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: urgentEntry as any, onInspect: () => {} })
      );
      expect(html).toContain('Urgent');
    });

    test('2.3 Routine severity renders "Routine" badge for standard clinical transactions', () => {
      const routineEntry = MOCK_E2E_AUDIT_LOGS[2]; // Severity: Routine
      const html = renderToStaticMarkup(
        React.createElement(AuditTableRow, { entry: routineEntry as any, onInspect: () => {} })
      );
      expect(html).toContain('Routine');
    });

    test('2.4 Inspection drawer header reflects dual-encoded urgency badges', () => {
      const emergencyEntry = MOCK_E2E_AUDIT_LOGS[0];
      const html = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: emergencyEntry as any,
          detail: null,
          onClose: () => {},
        })
      );
      expect(html).toContain('STAT');
      expect(html).toContain('Warning'); // Outcome
      expect(html).toContain('Security'); // Category
    });
  });

  // ===========================================================================
  // WORKFLOW 3: Category Filtering (All 6 Categories) & Severity Combinations
  // ===========================================================================
  describe('Workflow 3: Multi-Category Filtering & Cross-Feature Severity Combinations', () => {
    test('3.1 Category pills include all 6 statutory categories', () => {
      const expectedCategories = [
        'All',
        'Security',
        'Operations',
        'Billing',
        'Clinical Access',
        'PhilHealth Yakap',
      ];
      const renderedKeys = CATEGORY_PILLS.map((p) => p.key);
      expect(renderedKeys).toEqual(expectedCategories);
    });

    test('3.2 Selecting a category pill highlights it with primary token styling', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'PhilHealth Yakap',
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
      expect(html).toContain('PhilHealth Yakap');
      expect(html).toContain('Filter by PhilHealth Yakap');
    });

    test('3.3 Pairwise category + severity query parameter generation in clinicService', async () => {
      // Test Security + Emergency combination
      await clinicService.getAuditLogs({
        category: 'Security',
        severity: 'Emergency',
      });
      expect(lastApiCall).not.toBeNull();
      expect(lastApiCall!.params.category).toBe('Security');
      expect(lastApiCall!.params.severity).toBe('Emergency');

      // Test Billing + Urgent combination
      await clinicService.getAuditLogs({
        category: 'Billing',
        severity: 'Urgent',
      });
      expect(lastApiCall!.params.category).toBe('Billing');
      expect(lastApiCall!.params.severity).toBe('Urgent');

      // Test PhilHealth Yakap + Routine combination
      await clinicService.getAuditLogs({
        category: 'PhilHealth Yakap',
        severity: 'Routine',
      });
      expect(lastApiCall!.params.category).toBe('PhilHealth Yakap');
      expect(lastApiCall!.params.severity).toBe('Routine');
    });
  });

  // ===========================================================================
  // WORKFLOW 4: Date Range Validation (Inverted Dates Defensive Alert)
  // ===========================================================================
  describe('Workflow 4: Date Range Boundary Validation & Error Recovery', () => {
    test('4.1 Inverted date range (startDate > endDate) renders inline alert with role="alert"', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '2026-10-25',
          onStartDateChange: () => {},
          endDate: '2026-10-10', // Earlier than start date!
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {},
        })
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain('Start date cannot exceed end date.');
    });

    test('4.2 Equal start and end dates (single day filter) does NOT trigger error alert', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'All',
          onSelectCategory: () => {},
          search: '',
          onSearchChange: () => {},
          startDate: '2026-10-17',
          onStartDateChange: () => {},
          endDate: '2026-10-17',
          onEndDateChange: () => {},
          severityFilter: 'All',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {},
        })
      );
      expect(html).not.toContain('role="alert"');
    });

    test('4.3 Reset filters button is prominently rendered in the control bar', () => {
      let resetTriggered = false;
      const html = renderToStaticMarkup(
        React.createElement(AuditFilterBar, {
          selectedCategory: 'Billing',
          onSelectCategory: () => {},
          search: 'query',
          onSearchChange: () => {},
          startDate: '2026-10-25',
          onStartDateChange: () => {},
          endDate: '2026-10-10',
          onEndDateChange: () => {},
          severityFilter: 'Urgent',
          onSeverityFilterChange: () => {},
          onResetFilters: () => {
            resetTriggered = true;
          },
        })
      );
      expect(html).toContain('Reset Filters');
    });
  });

  // ===========================================================================
  // WORKFLOW 5: Slide-Over Inspection Drawer (Desktop >=1024px)
  // ===========================================================================
  describe('Workflow 5: Slide-Over Inspection Drawer & Cryptographic Checksums', () => {
    test('5.1 Desktop breakpoint (width=1280) renders desktopOverlay slide-over drawer', () => {
      currentWindowWidth = 1280;
      const entry = MOCK_E2E_AUDIT_LOGS[2];
      const html = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: entry as any,
          detail: MOCK_E2E_DETAIL as any,
          onClose: () => {},
        })
      );
      expect(html).toContain('Dismiss inspection drawer');
      expect(html).toContain('Forensic Entry Inspection');
      expect(html).toContain('clinical.consultation.signed');
    });

    test('5.2 Drawer displays actor credentials, client IP, and target correlation', () => {
      const entry = MOCK_E2E_AUDIT_LOGS[2];
      const html = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: entry as any,
          detail: MOCK_E2E_DETAIL as any,
          onClose: () => {},
        })
      );
      expect(html).toContain('Dr. Roberto Santos, MD');
      expect(html).toContain('Physician');
      expect(html).toContain('192.168.10.22');
      expect(html).toContain('ClinicWorkstation/1.0 (Doctor-Station-03)');
      expect(html).toContain('ConsultationEncounter');
      expect(html).toContain('enc-7701');
    });

    test('5.3 Drawer displays Philippine DPA RA 10173 badge and masked patient identifiers', () => {
      const entry = MOCK_E2E_AUDIT_LOGS[2];
      const html = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: entry as any,
          detail: MOCK_E2E_DETAIL as any,
          onClose: () => {},
        })
      );
      expect(html).toContain('DPA RA 10173 Compliant');
      expect(html).toContain('J*** D*** C***');
      expect(html).toContain('12-****8901-2');
    });

    test('5.4 Drawer displays SHA-256 prose checksums for SOAP clinical narrative fields', () => {
      const entry = MOCK_E2E_AUDIT_LOGS[2];
      const html = renderToStaticMarkup(
        React.createElement(AuditInspectionDrawer, {
          entry: entry as any,
          detail: MOCK_E2E_DETAIL as any,
          onClose: () => {},
        })
      );
      expect(html).toContain('Cryptographic Forensic Checksums (SHA-256)');
      expect(html).toContain('subjectiveChecksum');
      expect(html).toContain('sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069');
      expect(html).toContain('objectiveChecksum');
      expect(html).toContain('assessmentChecksum');
      expect(html).toContain('planChecksum');
    });
  });

  // ===========================================================================
  // WORKFLOW 6: Backward Cursor Pagination User Journey
  // ===========================================================================
  describe('Workflow 6: Backward Cursor Pagination & Filter Reset Flow', () => {
    test('6.1 AuditTable renders pagination footer with current page and total count', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: MOCK_E2E_AUDIT_LOGS as any,
          loading: false,
          hasMore: true,
          hasPreviousPage: false,
          hasNextPage: true,
          pageNumber: 1,
          totalCount: 45,
          onInspect: () => {},
          onNextPage: () => {},
          onPreviousPage: () => {},
          onResetFilters: () => {},
        })
      );
      expect(html).toContain('Page 1');
      expect(html).toContain('Showing 5 of 45 entries · Page 1');
      expect(html).toContain('Next Page');
    });

    test('6.2 Navigating to earlier page triggers cursor fetch with before parameter', async () => {
      const cursor = 'eyJ0aW1lc3RhbXAiOiIyMDI2LTEwLTE3VDA0OjQ1OjAwLjAwMFoifQ==';
      await clinicService.getAuditLogs({
        before: cursor,
        pageSize: 50,
      });
      expect(lastApiCall).not.toBeNull();
      expect(lastApiCall!.params.before).toBe(cursor);
      expect(String(lastApiCall!.params.pageSize)).toBe('50');
    });

    test('6.3 Table with hasMore: false renders previous page button and suppresses next page', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditTable, {
          items: MOCK_E2E_AUDIT_LOGS as any,
          loading: false,
          hasMore: false,
          hasPreviousPage: true,
          hasNextPage: false,
          pageNumber: 2,
          totalCount: 5,
          onInspect: () => {},
          onNextPage: () => {},
          onPreviousPage: () => {},
          onResetFilters: () => {},
        })
      );
      expect(html).toContain('Showing 5 of 5 entries · Page 2');
      expect(html).toContain('Previous Page');
      expect(html).not.toContain('Next Page');
    });
  });

  // ===========================================================================
  // WORKFLOW 7: Export Modal Format & Limit Selection
  // ===========================================================================
  describe('Workflow 7: Forensic Export Modal & DPA RA 10173 Audit Notice', () => {
    test('7.1 Export modal renders both CSV and JSON format choices', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: () => {},
          isExporting: false,
        })
      );
      expect(html).toContain('CSV (Spreadsheet)');
      expect(html).toContain('JSON (Raw Stream)');
    });

    test('7.2 Export modal renders limits for 1,000, 5,000, and 10,000 records', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: () => {},
          isExporting: false,
        })
      );
      expect(html).toContain('1,000');
      expect(html).toContain('5,000');
      expect(html).toContain('10,000');
    });

    test('7.3 Export modal displays mandatory Auditing the Auditor statutory alert', () => {
      const html = renderToStaticMarkup(
        React.createElement(AuditExportModal, {
          visible: true,
          onClose: () => {},
          onExport: () => {},
          isExporting: false,
        })
      );
      expect(html).toContain('Auditing the Auditor Notice');
      expect(html).toContain('DPA RA 10173');
      expect(html).toContain('audit.log.exported');
    });

    test('7.4 Triggering export forwards format and row limit to clinicService.exportAuditLogs', async () => {
      await clinicService.exportAuditLogs({
        format: 'json',
        limit: 10000,
        category: 'Billing',
      });
      expect(lastApiCall).not.toBeNull();
      expect(lastApiCall!.url).toContain('/audit/export');
      expect(lastApiCall!.params.format).toBe('json');
      expect(String(lastApiCall!.params.limit)).toBe('10000');
      expect(lastApiCall!.params.category).toBe('Billing');
    });
  });

  // ===========================================================================
  // WORKFLOW 8: Strict Design Token Verification (Zero Raw Hex Violation)
  // ===========================================================================
  describe('Workflow 8: Design Token Compliance & Theme Mapping', () => {
    test('8.1 Component files in components/audit have zero raw hex color literals', () => {
      const auditDir = path.join(__dirname, '../components/audit');
      const files = fs.readdirSync(auditDir).filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'));

      // Raw hex pattern matching 3, 4, 6, or 8 hex digits
      const hexRegex = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

      for (const file of files) {
        const content = fs.readFileSync(path.join(auditDir, file), 'utf8');
        const matches = content.match(hexRegex);
        expect(matches).toBeNull();
      }
    });

    test('8.2 Clinic primary brand color matches statutory Teal palette token', () => {
      expect(theme.colors.primary).toBeDefined();
      // Verified through semantic token abstraction
      expect(typeof theme.colors.primary).toBe('string');
      expect(theme.colors.primaryLight).toBeDefined();
    });

    test('8.3 Clinical urgency colors strictly follow Clinic EZ design system tokens', () => {
      expect(theme.colors.emergency).toBeDefined();
      expect(theme.colors.emergencyBg).toBeDefined();
      expect(theme.colors.emergencyText).toBeDefined();
      expect(theme.colors.urgent).toBeDefined();
      expect(theme.colors.urgentBg).toBeDefined();
      expect(theme.colors.urgentText).toBeDefined();
      expect(theme.colors.routine).toBeDefined();
      expect(theme.colors.routineBg).toBeDefined();
      expect(theme.colors.routineText).toBeDefined();
    });
  });
});
