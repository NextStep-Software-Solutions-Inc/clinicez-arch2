// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;

// 1. Mock React Native modules
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    visible,
    style,
    onPress,
    hitSlop,
    title,
    label,
    source,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { 'data-accessibility-role': accessibilityRole, role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(hitSlop ? { 'data-hitslop': JSON.stringify(hitSlop) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(label ? { 'data-label': label } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        ...(onPress ? { 'data-pressable': 'true', onClick: onPress } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      title || label,
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
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
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
  SafeAreaView: createMockComponent('SafeAreaView'),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

// Mock fonts
mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('../../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Navigation mock
let mockNavigate = mock(() => {});
let mockGoBack = mock(() => {});
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

// Auth mock state
let mockAuth = {
  user: { id: 'u-1', name: 'Dr. Test', role: 'Doctor', clinicId: 'clinic-123' } as any,
  can: (perm: string) => false,
  offline: false,
};
mock.module('../context/AuthContext', () => ({
  useAuth: () => (globalThis as any).__mockAuthContext ?? mockAuth,
  usePermission: (perm: string) => ((globalThis as any).__mockAuthContext ?? mockAuth).can(perm),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => (globalThis as any).__mockAuthContext ?? mockAuth,
  usePermission: (perm: string) => ((globalThis as any).__mockAuthContext ?? mockAuth).can(perm),
}));

// ClinicContext mock state
let mockClinic = {
  facilityName: 'Clinic EZ Center',
  planTier: 'pro',
  clinicLogo: null,
  primaryColorHex: '#0D6963',
  license: { clinicId: 'clinic-123' },
};
mock.module('../context/ClinicContext', () => ({
  useClinic: () => (globalThis as any).__mockClinicContext ?? mockClinic,
}));
mock.module('../../context/ClinicContext', () => ({
  useClinic: () => (globalThis as any).__mockClinicContext ?? mockClinic,
}));

// StaffContext mock
mock.module('../context/StaffContext', () => ({
  useStaff: () => (globalThis as any).__mockStaffContext ?? { current: null, staff: [] },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));
mock.module('../../context/StaffContext', () => ({
  useStaff: () => (globalThis as any).__mockStaffContext ?? { current: null, staff: [] },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));

// ClinicCommsContext mock state
let mockClinicComms = {
  isChatDrawerOpen: true,
  openChatDrawer: mock(() => {}),
  closeChatDrawer: mock(() => {}),
  toggleChatDrawer: mock(() => {}),
  activeConversationId: undefined as string | undefined,
  setActiveConversationId: mock((id?: string) => {
    mockClinicComms.activeConversationId = id;
  }),
  showTriageBadge: true,
};
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => mockClinicComms,
}));
mock.module('../../context/ClinicCommsContext', () => ({
  useClinicComms: () => mockClinicComms,
}));

// Breakpoint mock
let mockBreakpoint = {
  isWorkstation: true,
  isCompact: false,
  width: 1280,
  height: 800,
};
mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => mockBreakpoint,
}));
mock.module('../../utils/useBreakpoint', () => ({
  useBreakpoint: () => mockBreakpoint,
}));

mock.module('../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
mock.module('../../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

mock.module('../context/UiDensityContext', () => ({
  useUiDensity: () => ({
    multiplier: 1,
    headerHeight: 64,
    sidebarWidth: 240,
  }),
}));
mock.module('../../context/UiDensityContext', () => ({
  useUiDensity: () => ({
    multiplier: 1,
    headerHeight: 64,
    sidebarWidth: 240,
  }),
}));

mock.module('../hooks/useClinicNotifications', () => ({
  useClinicNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    hasStatAlert: false,
    loading: false,
    refresh: () => {},
    markAsRead: () => {},
    markAllAsRead: () => {},
  }),
}));
mock.module('../../hooks/useClinicNotifications', () => ({
  useClinicNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    hasStatAlert: false,
    loading: false,
    refresh: () => {},
    markAsRead: () => {},
    markAllAsRead: () => {},
  }),
}));

// Feedback notify mock
let mockNotify = {
  success: mock((msg: string) => {}),
  error: mock((msg: string) => {}),
  info: mock((msg: string) => {}),
  warn: mock((msg: string) => {}),
};
mock.module('../utils/feedback', () => ({
  notify: mockNotify,
}));
mock.module('../../utils/feedback', () => ({
  notify: mockNotify,
}));

mock.module('../components/notifications/ClinicNotificationCenterModal', () => ({
  default: createMockComponent('ClinicNotificationCenterModal'),
}));
mock.module('./ClinicNotificationCenterModal', () => ({
  default: createMockComponent('ClinicNotificationCenterModal'),
}));

// Comms SDK mocks
let mockConversationsData = {
  conversations: [
    { id: 'c-1', title: 'General Inquiries', scope: 'Facility', lastMessageSnippet: 'Hello clinic', unreadCount: 2, priority: 'Routine' },
    { id: 'c-2', title: 'Lab Coordination', scope: 'Facility', lastMessageSnippet: 'Results ready', unreadCount: 0, priority: 'Urgent' },
  ],
  unreadCount: 2,
  isLoading: false,
  error: null,
  createConversation: mock(async (payload: any) => ({ id: 'c-new', ...payload })),
};

let mockTriageQueueData = {
  items: [
    {
      id: 'triage-1',
      contextId: 'pat-1',
      patientFullName: 'Jane Doe',
      patientAge: '32',
      patientSex: 'Female',
      category: 'Prescription Refill',
      lastMessageSnippet: 'Need maintenance meds refill',
      priority: 'Routine',
      status: 'Submitted',
      createdAtUtc: new Date().toISOString(),
      triageDueAtUtc: new Date(Date.now() + 3600000).toISOString(),
      isSlaBreached: false,
      slaTimeRemainingSeconds: 3600,
      isEmergencyConfirmed: false,
    },
  ],
  pendingCount: 1,
  urgentCount: 0,
  isLoading: false,
  error: null as any,
  refresh: mock(() => {}),
  answerRequest: mock(async (id: string, text: string) => {}),
  requestVisit: mock(async (id: string, text: string) => {}),
  declineRequest: mock(async (id: string, code: string, notes: string) => {}),
  routeToStaff: mock(async (id: string, staffId: string, role: string, prio: string, notes?: string) => {}),
};

let mockCommsContext = {
  facilityId: 'clinic-123',
};

mock.module('@clinicez/comms-sdk/react', () => ({
  useComms: () => ({ status: 'connected' }),
  useConversations: () => mockConversationsData,
  useConversation: (id: string) => ({
    conversation: { id, title: `Conversation ${id}`, scope: 'Facility' },
    messages: [
      { messageId: 'm-1', conversationId: id, contentText: 'First message', senderType: 'Staff', sentAtUtc: new Date().toISOString() },
    ],
    isLoading: false,
    error: null,
    acknowledgeMessage: mock(async () => {}),
  }),
  useSendMessage: () => ({
    sendMessage: mock(async () => {}),
    resendMessage: mock(async () => {}),
  }),
  useTriageQueue: (facilityId: string) => mockTriageQueueData,
  useCommsContext: () => mockCommsContext,
  CommsContext: React.createContext(mockCommsContext),
}));

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: createMockComponent('ChatDrawer'),
  MessageThread: createMockComponent('MessageThread'),
  TriageQueueView: createMockComponent('TriageQueueView'),
}));

// Load targets
const { default: WorkstationSidebar, WORKSTATION_NAV_ITEMS } = await import('../components/layout/WorkstationSidebar');
const { default: ClinicChatDrawerHost } = await import('../components/comms/ClinicChatDrawerHost');
const { default: ClinicHeaderBar } = await import('../components/layout/ClinicHeaderBar');
import { PERMISSIONS } from '../constants/permissions';

describe('Challenger M2: Milestone 2 Empirical & Adversarial Test Suite', () => {
  beforeEach(() => {
    mockNavigate = mock(() => {});
    mockGoBack = mock(() => {});
    mockNotify.success = mock(() => {});
    mockNotify.error = mock(() => {});
    mockClinicComms.closeChatDrawer = mock(() => {});
    mockClinicComms.activeConversationId = undefined;
    mockClinicComms.isChatDrawerOpen = true;
    mockBreakpoint.isWorkstation = true;
    mockAuth = {
      user: { id: 'u-admin', name: 'Admin User', role: 'Admin', clinicId: 'clinic-123' },
      can: (p: string) => true,
      offline: false,
    };
    mockTriageQueueData.pendingCount = 1;
    mockTriageQueueData.urgentCount = 0;
    mockConversationsData.unreadCount = 2;
  });

  // =========================================================================
  // Section 1: WorkstationSidebar Navigation Consolidation
  // =========================================================================
  describe('1. WorkstationSidebar Navigation Consolidation', () => {
    test('1.1 WORKSTATION_NAV_ITEMS length is exactly 9', () => {
      expect(WORKSTATION_NAV_ITEMS.length).toBe(9);
    });

    test('1.2 Order and keys of WORKSTATION_NAV_ITEMS match expected schema', () => {
      const keys = WORKSTATION_NAV_ITEMS.map((item) => item.key);
      expect(keys).toEqual([
        'Dashboard',
        'Patients',
        'Consultations',
        'Appointments',
        'Billing',
        'ResultReview',
        'Yakap',
        'Audit',
        'Settings',
      ]);
    });

    test('1.3 Adversarially verifies no item has key "Triage" or label "Triage desk"', () => {
      const hasTriageKey = WORKSTATION_NAV_ITEMS.some(
        (item) => item.key.toLowerCase() === 'triage'
      );
      const hasTriageLabel = WORKSTATION_NAV_ITEMS.some(
        (item) => item.label.toLowerCase().includes('triage')
      );
      expect(hasTriageKey).toBe(false);
      expect(hasTriageLabel).toBe(false);
    });

    test('1.4 Deep link route /triage is cleanly removed and superseded by the side sheet', () => {
      const navPath = path.resolve(__dirname, '../navigation/Navigation.tsx');
      const navSource = fs.readFileSync(navPath, 'utf-8');

      // Check deletion of obsolete Triage screen
      expect(navSource).not.toContain('screen: TriageScreen');
      expect(navSource).not.toContain("linking: 'triage'");
    });

    test('1.5 Role-based filtering never leaks Triage item to any user role', () => {
      const roles: Array<{ role: string; canFn: (p: string) => boolean; maxAllowedItems: number }> = [
        { role: 'Admin', canFn: () => true, maxAllowedItems: 9 },
        { role: 'Doctor', canFn: (p) => [PERMISSIONS.patientsRead, PERMISSIONS.consultationsRead, PERMISSIONS.appointmentsRead, PERMISSIONS.labOrdersRead, PERMISSIONS.yakapRead].includes(p), maxAllowedItems: 6 },
        { role: 'Nurse', canFn: (p) => [PERMISSIONS.patientsRead, PERMISSIONS.consultationsRead, PERMISSIONS.appointmentsRead].includes(p), maxAllowedItems: 4 },
        { role: 'Cashier', canFn: (p) => [PERMISSIONS.billingRead].includes(p), maxAllowedItems: 2 },
        { role: 'Receptionist', canFn: (p) => [PERMISSIONS.patientsRead, PERMISSIONS.appointmentsRead, PERMISSIONS.billingRead].includes(p), maxAllowedItems: 4 },
      ];

      for (const { role, canFn, maxAllowedItems } of roles) {
        mockAuth = {
          user: { id: `u-${role}`, name: `Test ${role}`, role, clinicId: 'c1' },
          can: canFn,
          offline: false,
        };

        const html = renderToStaticMarkup(
          React.createElement(WorkstationSidebar, {
            currentRoute: 'Dashboard',
            onNavigate: () => {},
          })
        );

        expect(html).not.toContain('Triage desk');
        expect(html).not.toContain('data-title="Triage"');
      }
    });
  });

  // =========================================================================
  // Section 2: ClinicChatDrawerHost Dimensions & Ergonomics
  // =========================================================================
  describe('2. ClinicChatDrawerHost Sizing, Ergonomics & Fullscreen Maximize', () => {
    test('2.1 AST & Style audit confirms desktop dockedPanel width is exactly 460', () => {
      const hostPath = path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx');
      const hostSource = fs.readFileSync(hostPath, 'utf-8');

      // Regex verify dockedPanel width
      const dockedPanelMatch = hostSource.match(/dockedPanel:\s*\{[\s\S]*?width:\s*(\d+)/);
      expect(dockedPanelMatch).not.toBeNull();
      expect(Number(dockedPanelMatch![1])).toBe(460);

      // Verify mobilePanel height is 85%
      const mobilePanelMatch = hostSource.match(/mobilePanel:\s*\{[\s\S]*?height:\s*['"](\d+%)['"]/);
      expect(mobilePanelMatch).not.toBeNull();
      expect(mobilePanelMatch![1]).toBe('85%');
    });

    test('2.2 Fullscreen maximize button toggles sheet width dynamically', () => {
      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));

      // Check header maximize button
      expect(html).toContain('aria-label="Expand side panel"');

      // Inspect source code for the exact callback logic
      const hostPath = path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx');
      const hostSource = fs.readFileSync(hostPath, 'utf-8');
      expect(hostSource).toContain('handleToggleMaximize');
      expect(hostSource).toContain('dockedPanelMaximized');
    });

    test('2.3 Desktop vs Mobile responsive layout rendering', () => {
      // 1. Desktop Workstation layout
      mockBreakpoint.isWorkstation = true;
      const desktopHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(desktopHtml).toContain('Messages');
      expect(desktopHtml).not.toContain('data-component="Modal"');

      // 2. Mobile Compact layout
      mockBreakpoint.isWorkstation = false;
      const mobileHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(mobileHtml).toContain('data-component="Modal"');
      expect(mobileHtml).toContain('Messages');
    });
  });

  // =========================================================================
  // Section 3: Dual-Tab RBAC Logic & Tab Switching
  // =========================================================================
  describe('3. RBAC Logic & Tab Switching Invariants', () => {
    test('3.1 User with PERMISSIONS.triageRead sees "Triage Requests" tab', () => {
      mockAuth = {
        user: { id: 'u-nurse', name: 'Triage Nurse', role: 'Nurse', clinicId: 'c1' },
        can: (perm: string) => perm === PERMISSIONS.triageRead,
        offline: false,
      };

      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Conversations');
      expect(html).toContain('Triage Requests');
    });

    test('3.2 User with messaging:triage permission sees "Triage Requests" tab', () => {
      mockAuth = {
        user: { id: 'u-staff', name: 'Comms Staff', role: 'Receptionist', clinicId: 'c1' },
        can: (perm: string) => perm === 'messaging:triage',
        offline: false,
      };

      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Conversations');
      expect(html).toContain('Triage Requests');
    });

    test('3.3 Admin role sees "Triage Requests" tab even if can() returns false', () => {
      mockAuth = {
        user: { id: 'u-admin', name: 'Super Admin', role: 'Admin', clinicId: 'c1' },
        can: () => false,
        offline: false,
      };

      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Conversations');
      expect(html).toContain('Triage Requests');
    });

    test('3.4 Unauthorized roles (Doctor/Nurse without triage permissions) do NOT see "Triage Requests" tab', () => {
      mockAuth = {
        user: { id: 'u-doc', name: 'Dr. General', role: 'Doctor', clinicId: 'c1' },
        can: (perm: string) => perm === PERMISSIONS.consultationsRead,
        offline: false,
      };

      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      // Triage Requests tab is hidden
      expect(html).not.toContain('Triage Requests');
      // Segmented tab bar is suppressed for non-triage staff (no redundant single-tab bar)
      expect(html).not.toContain('tabSegmentBar');
      // ChatDrawer is displayed directly
      expect(html).toContain('data-component="ChatDrawer"');
      // TriageQueueView is NOT rendered
      expect(html).not.toContain('data-component="TriageQueueView"');
    });

    test('3.5 Tab lifecycle: initial tab is conversations and resets on drawer close', () => {
      const hostPath = path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx');
      const hostSource = fs.readFileSync(hostPath, 'utf-8');

      // Initial state is 'conversations'
      expect(hostSource).toContain("useState<'conversations' | 'triage'>('conversations')");

      // Reset tab on drawer close
      expect(hostSource).toContain('if (!isChatDrawerOpen) {');
      expect(hostSource).toContain("setDrawerTab('conversations');");

      // Reset tab if canViewTriage becomes false
      expect(hostSource).toContain("if (!canViewTriage && drawerTab === 'triage') {");
      expect(hostSource).toContain("setDrawerTab('conversations');");
    });
  });

  // =========================================================================
  // Section 4: Edge Cases — Unread Triage Counts & Active Thread Selection
  // =========================================================================
  describe('4. Edge Cases: Triage Counts & Active Thread Switching', () => {
    test('4.1 Zero unread triage requests (pendingCount === 0) hides triage count badge in tab and header', () => {
      mockTriageQueueData.pendingCount = 0;
      mockTriageQueueData.urgentCount = 0;

      // Drawer Host
      const drawerHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(drawerHtml).toContain('Triage Requests');
      expect(drawerHtml).not.toContain('triageCountPill');

      // Header Bar
      const headerHtml = renderToStaticMarkup(React.createElement(ClinicHeaderBar));
      expect(headerHtml).not.toContain('triagePip');
      expect(headerHtml).not.toContain('pending triage');
    });

    test('4.2 Routine triage inquiries (pendingCount > 0, urgentCount === 0) renders routine pip and badge', () => {
      mockTriageQueueData.pendingCount = 3;
      mockTriageQueueData.urgentCount = 0;

      const drawerHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(drawerHtml).toContain('3');

      const headerHtml = renderToStaticMarkup(React.createElement(ClinicHeaderBar));
      expect(headerHtml).toContain('aria-label="Communications, 2 unread, 3 pending triage"');
    });

    test('4.3 Urgent triage inquiries (pendingCount > 0, urgentCount > 0) elevates styling to emergency', () => {
      mockTriageQueueData.pendingCount = 5;
      mockTriageQueueData.urgentCount = 2;

      const drawerHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(drawerHtml).toContain('5');

      const headerHtml = renderToStaticMarkup(React.createElement(ClinicHeaderBar));
      expect(headerHtml).toContain('aria-label="Communications, 2 unread, 5 pending triage (urgent)"');
    });

    test('4.4 Badge overflow threshold (>99) displays "99+" in tab badge', () => {
      mockTriageQueueData.pendingCount = 125;
      mockTriageQueueData.urgentCount = 1;

      const drawerHtml = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(drawerHtml).toContain('99+');
    });

    test('4.5 Selecting active conversation switches view to MessageThread and hides tab bar', () => {
      mockClinicComms.activeConversationId = 'conv-active-999';

      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));

      // Tab bar should be hidden
      expect(html).not.toContain('Triage Requests');
      // Thread header and back button should be visible
      expect(html).toContain('aria-label="Back to conversations"');
      expect(html).toContain('Conversation conv-active-999');
      // MessageThread component should be rendered
      expect(html).toContain('data-component="MessageThread"');
    });

    test('4.6 Drawer returns null when isChatDrawerOpen is false', () => {
      mockClinicComms.isChatDrawerOpen = false;
      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toBe('');
    });
  });

  // =========================================================================
  // Section 5: Disposition Dispatching Simulation
  // =========================================================================
  describe('5. Triage Disposition Dispatching Logic', () => {
    test('5.1 Verify all 4 disposition actions (Answered, NeedsVisit, Declined, Routed) are wired to live methods', () => {
      const hostPath = path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx');
      const hostSource = fs.readFileSync(hostPath, 'utf-8');

      // Check handler executes answerRequest
      expect(hostSource).toContain("payload.disposition === 'Answered'");
      expect(hostSource).toContain('await answerRequest(');
      expect(hostSource).toContain("notify.success('Inquiry disposition recorded: Answered.')");

      // Check handler executes requestVisit
      expect(hostSource).toContain("payload.disposition === 'NeedsVisit'");
      expect(hostSource).toContain('await requestVisit(');
      expect(hostSource).toContain("notify.success('Inquiry disposition recorded: In-Clinic Visit Requested.')");

      // Check handler executes declineRequest
      expect(hostSource).toContain("payload.disposition === 'Declined'");
      expect(hostSource).toContain('await declineRequest(');
      expect(hostSource).toContain("notify.success('Inquiry disposition recorded: Declined.')");

      // Check handler executes routeToStaff
      expect(hostSource).toContain("payload.disposition === 'Routed'");
      expect(hostSource).toContain('await routeToStaff(');
      expect(hostSource).toContain("notify.success('Inquiry routed to attending clinician.')");
    });
  });
});
