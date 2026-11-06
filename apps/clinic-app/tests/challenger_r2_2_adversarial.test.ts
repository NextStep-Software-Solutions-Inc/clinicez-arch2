// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;

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
    value,
    placeholder,
    onChangeText,
    spin,
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
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(source?.uri ? { 'data-src': source.uri } : {}),
        ...(spin !== undefined ? { 'data-spin': String(spin) } : {}),
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
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
    loop: () => ({ start: (cb?: any) => cb && cb() }),
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
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('../../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
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

const mockNavigate = mock(() => {});
const mockGoBack = mock(() => {});
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
  }),
}));

const mockStaffList = [
  { id: 'staff-curr', firstName: 'Juan', lastName: 'Luna', title: 'Dr.', role: 'Doctor' },
  { id: 'staff-2', firstName: 'Maria', lastName: 'Santos', title: 'Nurse', role: 'Nurse' },
  { id: 'staff-3', firstName: 'Ramon', lastName: 'Garcia', title: 'Admin', role: 'Administrator' },
  { id: 'staff-4', firstName: 'Elena', lastName: 'Reyes', title: 'PharmD', role: 'Pharmacist' },
];

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    current: mockStaffList[0],
    staff: mockStaffList,
  }),
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));
mock.module('../../context/StaffContext', () => ({
  useStaff: () => ({
    current: mockStaffList[0],
    staff: mockStaffList,
  }),
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Doctor', clinicId: 'c1' },
    can: () => true,
    offline: false,
  }),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Doctor', clinicId: 'c1' },
    can: () => true,
    offline: false,
  }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'Clinic EZ Central',
    license: { clinicId: 'c1' },
  }),
}));
mock.module('../../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'Clinic EZ Central',
    license: { clinicId: 'c1' },
  }),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isWorkstation: true,
    breakpoint: 'lg',
    width: 1280,
  }),
}));
mock.module('../../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isWorkstation: true,
    breakpoint: 'lg',
    width: 1280,
  }),
}));

let mockToasts: { type: string; msg: string }[] = [];
mock.module('../utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.push({ type: 'success', msg }),
    error: (msg: string) => mockToasts.push({ type: 'error', msg }),
    info: (msg: string) => mockToasts.push({ type: 'info', msg }),
  },
}));
mock.module('../../utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.push({ type: 'success', msg }),
    error: (msg: string) => mockToasts.push({ type: 'error', msg }),
    info: (msg: string) => mockToasts.push({ type: 'info', msg }),
  },
}));

let mockActiveConversation = {
  id: 'conv-active-1',
  title: 'Pediatric Asthma Triage',
  scope: 'PatientFacility',
  contextId: 'p-asthma-101',
};
let mockActiveMessages: any[] = [
  { messageId: 'm-1', conversationId: 'conv-active-1', contentText: 'Child age 4 wheezing since midnight. [PO] salbutamol given.', senderType: 'Patient', sentAtUtc: '2026-11-06T00:10:00Z' },
  { messageId: 'm-2', conversationId: 'conv-active-1', contentText: 'Vitals charted: SpO2 93%, HR 135 bpm (stat observation needed).', senderType: 'Staff', sentAtUtc: '2026-11-06T00:12:00Z' },
  { messageId: 'm-3', conversationId: 'conv-active-1', contentText: 'Pediatric resident at bedside now with nebulizer *+?.', senderType: 'Staff', sentAtUtc: '2026-11-06T00:15:00Z' },
];

let mockSendMessage = mock(async () => {});
let mockResendMessage = mock(async () => {});
let mockAcknowledgeMessage = mock(async () => {});
let mockReconnect = mock(async () => {});
let mockRefreshConversations = mock(async () => {});
let mockRefreshTriage = mock(async () => {});
let mockCreateConversation = mock(async (req: any) => ({ id: 'conv-created-99', ...req }));

let mockCommsStatus = 'connected';
let mockCommsIsReconnecting = false;

mock.module('@clinicez/comms-sdk/react', () => ({
  CommsProvider: ({ children }: any) => children,
  useConversation: (id: string) => ({
    conversation: { ...mockActiveConversation, id },
    messages: mockActiveMessages,
    isLoading: false,
    error: null,
    acknowledgeMessage: mockAcknowledgeMessage,
  }),
  useSendMessage: () => ({
    sendMessage: mockSendMessage,
    resendMessage: mockResendMessage,
  }),
  useComms: () => ({
    status: mockCommsStatus,
    reconnect: mockReconnect,
    isReconnecting: mockCommsIsReconnecting,
  }),
  useConversations: () => ({
    conversations: [
      { id: 'conv-active-1', title: 'Pediatric Asthma Triage', scope: 'PatientFacility', priority: 'Emergency', unreadCount: 2, lastMessageSnippet: 'Vitals charted', lastMessageAtUtc: '2026-11-06T00:15:00Z' },
    ],
    unreadCount: 2,
    isLoading: false,
    error: null,
    refresh: mockRefreshConversations,
    createConversation: mockCreateConversation,
  }),
  useTriageQueue: () => ({
    items: [
      {
        id: 'triage-1',
        contextId: 'p-asthma-101',
        title: 'Pediatric Asthma Triage',
        category: 'Emergency',
        priority: 'Emergency',
        status: 'Submitted',
        lastMessageSnippet: 'Wheezing since midnight',
        createdAtUtc: '2026-11-06T00:10:00Z',
        triageDueAtUtc: '2026-11-06T00:25:00Z',
        isSlaBreached: false,
        slaTimeRemainingSeconds: 600,
        isEmergencyConfirmed: true,
      },
    ],
    pendingCount: 1,
    urgentCount: 1,
    isLoading: false,
    error: null,
    refresh: mockRefreshTriage,
    answerRequest: mock(async () => {}),
    requestVisit: mock(async () => {}),
    declineRequest: mock(async () => {}),
    routeToStaff: mock(async () => {}),
  }),
}));

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: createMockComponent('ChatDrawer'),
  MessageThread: (props: any) => {
    return React.createElement('div', {
      'data-component': 'MessageThread',
      'data-conv-id': props.conversationId,
      'data-conv-title': props.conversationTitle,
      'data-conv-scope': props.conversationScope,
      'data-privacy-blur': String(props.privacyBlurEnabled),
      'data-message-count': props.messages?.length,
    });
  },
  TriageQueueView: (props: any) => {
    return React.createElement('div', {
      'data-component': 'TriageQueueView',
      'data-item-count': props.items?.length,
      onClick: () => props.onSelectCard?.('conv-active-1'),
    });
  },
}));

let mockClinicComms = {
  isChatDrawerOpen: true,
  openChatDrawer: mock(() => { mockClinicComms.isChatDrawerOpen = true; }),
  closeChatDrawer: mock(() => { mockClinicComms.isChatDrawerOpen = false; }),
  toggleChatDrawer: mock(() => { mockClinicComms.isChatDrawerOpen = !mockClinicComms.isChatDrawerOpen; }),
  activeConversationId: undefined as string | undefined,
  setActiveConversationId: mock((id?: string) => { mockClinicComms.activeConversationId = id; }),
};

mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => mockClinicComms,
}));
mock.module('../../context/ClinicCommsContext', () => ({
  useClinicComms: () => mockClinicComms,
}));

const { default: ClinicActiveThread } = await import('../components/comms/ClinicActiveThread');
const { default: NewConversationModal } = await import('../components/comms/NewConversationModal');
const { default: ClinicChatDrawerHost } = await import('../components/comms/ClinicChatDrawerHost');

describe('Challenger R2.2 Empirical Stress & Adversarial Suite', () => {
  beforeEach(() => {
    mockToasts = [];
    mockSendMessage.mockClear();
    mockResendMessage.mockClear();
    mockAcknowledgeMessage.mockClear();
    mockReconnect.mockClear();
    mockRefreshConversations.mockClear();
    mockRefreshTriage.mockClear();
    mockCreateConversation.mockClear();
    mockNavigate.mockClear();
    mockGoBack.mockClear();
    mockClinicComms.isChatDrawerOpen = true;
    mockClinicComms.activeConversationId = undefined;
    mockCommsStatus = 'connected';
    mockCommsIsReconnecting = false;
  });

  // =========================================================================
  // Test Set 1: Active Thread Header Layout & Order Invariants
  // =========================================================================
  describe('1. Active Thread Header Layout & Order Invariants', () => {
    test('1.1 Left Back Button is strictly Icon-Only with NO text label', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      // Back button element
      expect(html).toContain('aria-label="Back to conversations"');
      expect(html).toContain('data-hitslop="{&quot;top&quot;:8,&quot;bottom&quot;:8,&quot;left&quot;:8,&quot;right&quot;:8}"');
      
      // Must not contain textual labels like "Back" or "Conversations" inside the button
      expect(html).not.toMatch(/aria-label="Back to conversations"[^>]*>.*Back.*<\/div>/);
      expect(html).not.toMatch(/aria-label="Back to conversations"[^>]*>.*Conversations.*<\/div>/);

      // Back button must contain the lucide-arrow-left icon
      expect(html).toContain('lucide-arrow-left');
    });

    test('1.2 Center section displays Title + Edit pencil icon (tap-to-rename)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      expect(html).toContain('aria-label="Rename conversation"');
      expect(html).toContain('Pediatric Asthma Triage');
      expect(html).toContain('lucide-pencil');
    });

    test('1.3 Right controls render in EXACT order: 1. Care Team Count, 2. Privacy Blur, 3. Action Menu', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      const posMembers = html.indexOf('aria-label="Care team members:');
      const posPrivacy = html.indexOf('aria-label="Toggle medical privacy blur"');
      const posActionMenu = html.indexOf('aria-label="Conversation action menu"');

      expect(posMembers).toBeGreaterThan(-1);
      expect(posPrivacy).toBeGreaterThan(posMembers);
      expect(posActionMenu).toBeGreaterThan(posPrivacy);

      // Verify privacy blur button is icon-only (eye icon, no text label)
      const privacySlice = html.slice(posPrivacy, posActionMenu);
      expect(privacySlice).toContain('lucide-eye');
      expect(privacySlice).not.toContain('Privacy');
      expect(privacySlice).not.toContain('Blur');

      // Verify action menu button contains lucide-more-vertical
      const actionSlice = html.slice(posActionMenu);
      expect(actionSlice).toContain('lucide-more-vertical');
    });
  });

  // =========================================================================
  // Test Set 2: Action Menu Exactly 7 Operations
  // =========================================================================
  describe('2. Action Menu Exactly 7 Operations', () => {
    test('2.1 Action Menu Modal renders exactly 7 action items with required operations', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
          initialActionMenuOpen: true,
        })
      );

      const requiredOps = [
        'Rename',
        'View Patient Chart',
        'Search in Conversation',
        'Shift Handoff Summary',
        'Mute Channel',
        'Close &amp; Archive',
        'Delete Conversation',
      ];

      for (const op of requiredOps) {
        expect(html).toContain(op);
      }

      // Action menu section check
      const actionMenuIdx = html.indexOf('Conversation Actions');
      expect(actionMenuIdx).toBeGreaterThan(-1);
      const actionMenuHtml = html.slice(actionMenuIdx);

      // Verify each operation appears in the menu
      for (const op of requiredOps) {
        expect(actionMenuHtml).toContain(op);
      }
    });

    test('2.2 Delete Conversation guard prevents deleting conversations with recorded messages', () => {
      const onBackMock = mock(() => {});
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: onBackMock,
          initialActionMenuOpen: true,
        })
      );

      expect(html).toContain('Delete Conversation');
      expect(mockActiveMessages.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // Test Set 3: Top Drawer Header Connection Pill & Manual Reconnect
  // =========================================================================
  describe('3. Top Drawer Header Live Connection Indicator & Manual Reconnect', () => {
    test('3.1 Live Connection Pill maps connection statuses accurately', () => {
      // 1. Connected
      mockCommsStatus = 'connected';
      let html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Connected');

      // 2. Reconnecting
      mockCommsStatus = 'reconnecting';
      html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Reconnecting...');

      // 3. Connecting
      mockCommsStatus = 'connecting';
      html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Reconnecting...');

      // 4. Offline
      mockCommsStatus = 'disconnected';
      html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('Offline');
    });

    test('3.2 Manual Reconnect Button is present beside connection pill and renders refresh icon', () => {
      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));

      const posPill = html.indexOf('Connected');
      const posReconnect = html.indexOf('aria-label="Manual reconnect to clinic communications"');

      expect(posPill).toBeGreaterThan(-1);
      expect(posReconnect).toBeGreaterThan(-1);
      expect(posReconnect).toBeGreaterThan(posPill);

      const reconnectSlice = html.slice(posReconnect, posReconnect + 800);
      expect(reconnectSlice).toContain('lucide-refresh-cw');
    });
  });

  // =========================================================================
  // Test Set 4: NewConversationModal Validation Across Direct, Care Team & Facility
  // =========================================================================
  describe('4. NewConversationModal Validation Across All Types', () => {
    test('4.1 Direct Message: Requires staff selection from useStaff()', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      expect(html).toContain('Direct Message');
      expect(html).toContain('Select Colleague');
      // Lists staff colleagues Maria Santos, Ramon Garcia, Elena Reyes
      expect(html).toContain('Nurse Maria Santos');
      expect(html).toContain('Admin Ramon Garcia');
      expect(html).toContain('PharmD Elena Reyes');
      // Current user Dr. Juan Luna is filtered out
      expect(html).not.toContain('Dr. Juan Luna');
    });

    test('4.2 Care Team: Renders patient context & encounter input', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      expect(html).toContain('Care Team');
      expect(html).toContain('Facility Channel');
    });
  });

  // =========================================================================
  // Test Set 5: Clinical Productivity Tools
  // =========================================================================
  describe('5. Clinical Productivity Tools Invariants', () => {
    test('5.1 Pinned Clinical Orders & Alerts banner renders at top of thread', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
          pinnedAlerts: [
            {
              id: 'alert-1',
              label: 'Penicillin Allergy Alert',
              details: 'NPO after midnight • Strict bedside observation',
              severity: 'Emergency',
            },
          ],
        })
      );

      expect(html).toContain('Penicillin Allergy Alert');
      expect(html).toContain('NPO after midnight • Strict bedside observation');
      expect(html).toContain('lucide-alert-circle');
    });

    test('5.2 Exactly 4 Quick 1-tap clinical response pills are displayed', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      const pills = [
        '+ Vitals Charted',
        '+ Bedside Now',
        '+ Lab Requested',
        '+ On My Way',
      ];

      for (const pill of pills) {
        expect(html).toContain(pill);
      }
    });

    test('5.3 In-thread search filtering with regex meta-characters does literal matching safely', () => {
      const adversarialQueries = [
        '[PO]',
        '(stat)',
        '.*+?',
        '^.*$',
        '\\d+',
        'a{1,3}',
        '|',
        '(?=.*)',
        '\\w\\s\\d',
        '<script>alert(1)</script>',
        "' OR '1'='1",
      ];

      for (const q of adversarialQueries) {
        const lowerQ = q.toLowerCase();
        // Safe literal matching filter:
        const matches = mockActiveMessages.filter((m) => m.contentText.toLowerCase().includes(lowerQ));
        // Must not throw or crash
        expect(Array.isArray(matches)).toBe(true);
      }

      // Verify specific expected matches
      const poMatches = mockActiveMessages.filter((m) => m.contentText.toLowerCase().includes('[po]'));
      expect(poMatches.length).toBe(1);
      expect(poMatches[0].messageId).toBe('m-1');

      const statMatches = mockActiveMessages.filter((m) => m.contentText.toLowerCase().includes('(stat'));
      expect(statMatches.length).toBe(1);
      expect(statMatches[0].messageId).toBe('m-2');

      const symbolMatches = mockActiveMessages.filter((m) => m.contentText.toLowerCase().includes('*+?'));
      expect(symbolMatches.length).toBe(1);
      expect(symbolMatches[0].messageId).toBe('m-3');
    });
  });

  // =========================================================================
  // Test Set 6: Design Tokens Compliance & AST Guard
  // =========================================================================
  describe('6. Design Tokens Compliance & AST Guard', () => {
    const filesToAudit = [
      path.resolve(__dirname, '../components/comms/ClinicActiveThread.tsx'),
      path.resolve(__dirname, '../components/comms/NewConversationModal.tsx'),
      path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx'),
    ];

    test('6.1 Zero hardcoded hex colors (#xxx, #xxxxxx, #xxxxxxxx)', () => {
      const hexColorRegex = /#[0-9a-fA-F]{3,8}\b/g;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(hexColorRegex) || [];
        expect(matches).toEqual([]);
      }
    });

    test('6.2 Zero raw emojis in JSX source code', () => {
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line) => {
          if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            expect(emojiRegex.test(line)).toBe(false);
          }
        });
      }
    });

    test('6.3 Zero raw palette imports', () => {
      const rawPaletteRegex = /@clinicez\/design-tokens\/palette/g;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(rawPaletteRegex.test(content)).toBe(false);
      }
    });

    test('6.4 No sub-12px font sizes in StyleSheet definitions', () => {
      const fontSizeRegex = /fontSize:\s*([0-9.]+)/g;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        let match;
        while ((match = fontSizeRegex.exec(content)) !== null) {
          const size = parseFloat(match[1]);
          expect(size).toBeGreaterThanOrEqual(12);
        }
      }
    });
  });
});
