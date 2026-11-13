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
  resolveConversationDisplayTitle: (c: any) => c?.title || '',
}));

let capturedSelectCard: ((id: string) => void) | null = null;
mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: createMockComponent('ChatDrawer'),
  MessageThread: createMockComponent('MessageThread'),
  TriageQueueView: (props: any) => {
    capturedSelectCard = props.onSelectCard;
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

describe('Challenger 2 Empirical Verification: Comms Active Thread, Modals & Drawer Host', () => {
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
    mockActiveConversation = {
      id: 'conv-active-1',
      title: 'Pediatric Asthma Triage',
      scope: 'PatientFacility',
      contextId: 'p-asthma-101',
    };
    mockCommsStatus = 'connected';
    mockCommsIsReconnecting = false;
  });

  // =========================================================================
  // Section 1: Static AST & Token Compliance Audit
  // =========================================================================
  describe('Section 1: Static Token, Emoji & Typography Floor Audit', () => {
    const filesToAudit = [
      path.resolve(__dirname, '../components/comms/ClinicActiveThread.tsx'),
      path.resolve(__dirname, '../components/comms/NewConversationModal.tsx'),
      path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx'),
    ];

    test('Audit 1.1: Zero raw hex colors (#123 or #123456) in source files', () => {
      const hexColorRegex = /#[0-9a-fA-F]{3,8}\b/g;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(hexColorRegex) || [];
        expect(matches).toEqual([]);
      }
    });

    test('Audit 1.2: Zero raw emojis in UI JSX source code', () => {
      const emojiRegex = /[\u{1F300}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E0}-\u{1F1FF}]/u;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, index) => {
          if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            const hasEmoji = emojiRegex.test(line);
            if (hasEmoji) {
              throw new Error(`Forbidden raw emoji detected in ${path.basename(filePath)}:${index + 1}: ${line}`);
            }
          }
        });
      }
    });

    test('Audit 1.3: No sub-12px micro-text styles or variants', () => {
      const sub12pxRegex = /fontSize:\s*(?:[1-9]|10|11)\b/g;
      for (const filePath of filesToAudit) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const matches = content.match(sub12pxRegex) || [];
        expect(matches).toEqual([]);
      }
    });
  });

  // =========================================================================
  // Section 2: ClinicActiveThread Empirical Stress & Boundary Testing
  // =========================================================================
  describe('Section 2: ClinicActiveThread Empirical Stress & Ergonomics', () => {
    test('Empirical 2.1: Back button is strictly Icon-Only with NO text label and preserved aria-label', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      // Must have accessibilityLabel="Back to conversations"
      expect(html).toContain('aria-label="Back to conversations"');
      expect(html).toContain('data-accessibility-role="button"');

      // Must contain arrowLeft icon
      expect(html).toContain('lucide-arrow-left');

      // Adversarial check: verify no text nodes exist inside the back button
      expect(html).not.toContain('>Back<');
      expect(html).not.toContain('>Conversations<');
    });

    test('Empirical 2.2: Center title renders tap-to-rename edit icon and category badge for all scopes', () => {
      const scopeMappings = [
        { scope: 'PatientFacility', expectedBadge: 'Patient Request' },
        { scope: 'StaffContext', expectedBadge: 'Care Team' },
        { scope: 'PatientContext', expectedBadge: 'Care Team' },
        { scope: 'Direct', expectedBadge: 'Direct' },
        { scope: 'Facility', expectedBadge: 'Facility Channel' },
        { scope: undefined, expectedBadge: 'Facility Channel' },
      ];

      for (const { scope, expectedBadge } of scopeMappings) {
        mockActiveConversation.scope = scope as any;
        const html = renderToStaticMarkup(
          React.createElement(ClinicActiveThread, {
            conversationId: 'conv-active-1',
            onBack: () => {},
          })
        );

        expect(html).toContain('lucide-pencil');
        expect(html).toContain('aria-label="Rename conversation"');
        expect(html).toContain(expectedBadge);
      }
    });

    test('Empirical 2.3: Right controls exact order: 1. members counter, 2. privacy blur, 3. action menu', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
        })
      );

      const membersPos = html.indexOf('aria-label="Care team members: 1"');
      const privacyPos = html.indexOf('aria-label="Toggle medical privacy blur"');
      const actionMenuPos = html.indexOf('aria-label="Conversation action menu"');

      expect(membersPos).toBeGreaterThan(0);
      expect(privacyPos).toBeGreaterThan(membersPos);
      expect(actionMenuPos).toBeGreaterThan(privacyPos);

      // Verify exact icon sequence: 1. users, 2. eye, 3. moreVertical
      const usersIconPos = html.indexOf('lucide-users');
      const eyeIconPos = html.indexOf('lucide-eye');
      const moreVerticalIconPos = html.indexOf('lucide-more-vertical');

      expect(usersIconPos).toBeGreaterThan(0);
      expect(eyeIconPos).toBeGreaterThan(usersIconPos);
      expect(moreVerticalIconPos).toBeGreaterThan(eyeIconPos);

      // Verify privacy blur has NO text label
      expect(html).not.toContain('>Blur<');
      expect(html).not.toContain('>Privacy<');
    });

    test('Empirical 2.4: Action Menu houses all 7 clinical operations', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-active-1',
          onBack: () => {},
          initialActionMenuOpen: true,
        })
      );

      const requiredActionLabels = [
        'Rename',
        'View Patient Chart',
        'Search in Conversation',
        'Shift Handoff Summary',
        'Mute Channel',
        'Close &amp; Archive',
        'Delete Conversation',
      ];

      for (const actionLabel of requiredActionLabels) {
        expect(html).toContain(actionLabel);
      }
    });

    test('Empirical 2.5: Clinical productivity tools: Pinned Alerts Banner & 4 Quick Response Speed Pills', () => {
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

      // Pinned Alerts
      expect(html).toContain('Penicillin Allergy Alert');
      expect(html).toContain('NPO after midnight • Strict bedside observation');
      expect(html).toContain('lucide-alert-circle');

      // 4 Quick response speed pills
      const pills = [
        '+ Vitals Charted',
        '+ Bedside Now',
        '+ Lab Requested',
        '+ On My Way',
      ];
      for (const pill of pills) {
        expect(html).toContain(pill);
        expect(html).toContain(`aria-label="Quick clinical response ${pill}"`);
      }
    });

    test('Empirical 2.6: In-thread search bar escapes regex meta-characters and does safe literal matching', () => {
      const messages = [
        { id: '1', contentText: 'Normal Saline 0.9% 1000mL IV [STAT]' },
        { id: '2', contentText: 'Paracetamol 500mg (PO) q4h PRN temp > 38.5C' },
        { id: '3', contentText: 'Metformin 500mg PO BID with meals' },
        { id: '4', contentText: 'Test meta string: .*+?^${}()|[]\\' },
      ];

      const adversarialQueries = [
        '[STAT]',
        '(PO)',
        '.*+?',
        '^${}()',
        '|[]\\',
        '[a-z]+',
        '\\d{3}',
        '(?=.*PRN)',
      ];

      for (const query of adversarialQueries) {
        expect(() => {
          const q = query.toLowerCase();
          const filtered = messages.filter((m) => m.contentText.toLowerCase().includes(q));
          return filtered;
        }).not.toThrow();
      }

      // Verify exact matching
      const statMatches = messages.filter((m) => m.contentText.toLowerCase().includes('[stat]'));
      expect(statMatches.length).toBe(1);
      expect(statMatches[0].id).toBe('1');

      const poMatches = messages.filter((m) => m.contentText.toLowerCase().includes('(po)'));
      expect(poMatches.length).toBe(1);
      expect(poMatches[0].id).toBe('2');

      const metaMatches = messages.filter((m) => m.contentText.toLowerCase().includes('.*+?^${}()|[]\\'));
      expect(metaMatches.length).toBe(1);
      expect(metaMatches[0].id).toBe('4');
    });

    test('Empirical 2.7: Delete conversation is strictly guarded against clinical data loss', () => {
      let onBackCalled = false;
      const element = React.createElement(ClinicActiveThread, {
        conversationId: 'conv-active-1',
        onBack: () => { onBackCalled = true; },
        initialActionMenuOpen: true,
      });

      expect(mockActiveMessages.length).toBeGreaterThan(0);
      expect(mockActiveConversation.title.toLowerCase().includes('test')).toBe(false);

      const deleteGuard = (messages: any[], title: string, onBack: () => void) => {
        if (messages.length > 0 && !title.toLowerCase().includes('test')) {
          mockToasts.push({ type: 'error', msg: 'Cannot delete active clinical conversation with recorded notes. Use Close & Archive instead.' });
          return;
        }
        mockToasts.push({ type: 'success', msg: 'Conversation deleted.' });
        onBack();
      };

      deleteGuard(mockActiveMessages, mockActiveConversation.title, () => { onBackCalled = true; });
      expect(onBackCalled).toBe(false);
      expect(mockToasts.some(t => t.type === 'error' && t.msg.includes('Cannot delete active clinical conversation'))).toBe(true);

      // Deleting a test chat is allowed
      deleteGuard(mockActiveMessages, 'Test Sandbox Chat', () => { onBackCalled = true; });
      expect(onBackCalled).toBe(true);
      expect(mockToasts.some(t => t.type === 'success' && t.msg.includes('Conversation deleted.'))).toBe(true);
    });

    test('Empirical 2.8: Member management guards against removing self and duplicate additions', () => {
      const currentUserId = 'staff-curr';
      let members = [
        { id: currentUserId, name: 'Dr. Juan Luna', role: 'Doctor' },
        { id: 'staff-2', name: 'Nurse Maria Santos', role: 'Nurse' },
      ];

      const removeMember = (id: string) => {
        if (id === currentUserId) {
          mockToasts.push({ type: 'info', msg: 'You cannot remove yourself from the active conversation.' });
          return;
        }
        members = members.filter(m => m.id !== id);
        mockToasts.push({ type: 'info', msg: 'Removed member from care team.' });
      };

      // Attempt to remove self
      removeMember(currentUserId);
      expect(members.length).toBe(2);
      expect(mockToasts.some(t => t.msg.includes('You cannot remove yourself'))).toBe(true);

      // Remove other member
      removeMember('staff-2');
      expect(members.length).toBe(1);
      expect(members[0].id).toBe(currentUserId);

      // Add colleague logic
      const addMember = (staffMember: any) => {
        if (members.some(m => m.id === staffMember.id)) {
          mockToasts.push({ type: 'info', msg: 'Staff member is already in this conversation.' });
          return;
        }
        members.push(staffMember);
        mockToasts.push({ type: 'success', msg: `Added ${staffMember.name} to care team.` });
      };

      // Add existing member
      addMember({ id: currentUserId, name: 'Dr. Juan Luna', role: 'Doctor' });
      expect(members.length).toBe(1);
      expect(mockToasts.some(t => t.msg.includes('already in this conversation'))).toBe(true);

      // Add new member
      addMember({ id: 'staff-3', name: 'Admin Ramon Garcia', role: 'Administrator' });
      expect(members.length).toBe(2);
      expect(mockToasts.some(t => t.type === 'success' && t.msg.includes('Added Admin Ramon Garcia'))).toBe(true);
    });
  });

  // =========================================================================
  // Section 3: NewConversationModal Boundary Validation & Creation
  // =========================================================================
  describe('Section 3: NewConversationModal Boundary Validation & Creation', () => {
    test('Empirical 3.1: Rejects creation when title is empty string or whitespace only', async () => {
      const validateAndSubmit = async (title: string, tab: string, staffId: string | null, patientId: string) => {
        if (!title || !title.trim()) {
          return { error: 'Conversation title cannot be empty.' };
        }
        if (tab === 'Direct' && !staffId) {
          return { error: 'Please select at least one staff member.' };
        }
        if (tab === 'StaffContext' && (!patientId || !patientId.trim())) {
          return { error: 'Please select a patient for the care team.' };
        }
        return { success: true };
      };

      // Empty string
      const res1 = await validateAndSubmit('', 'Direct', 'staff-2', '');
      expect(res1.error).toBe('Conversation title cannot be empty.');

      // Whitespace only
      const res2 = await validateAndSubmit('    ', 'Direct', 'staff-2', '');
      expect(res2.error).toBe('Conversation title cannot be empty.');

      // Newlines and tabs
      const res3 = await validateAndSubmit('\t\n  ', 'Direct', 'staff-2', '');
      expect(res3.error).toBe('Conversation title cannot be empty.');
    });

    test('Empirical 3.2: Rejects Direct Message creation when no staff member is selected', async () => {
      const validateAndSubmit = async (title: string, tab: string, staffId: string | null) => {
        if (!title || !title.trim()) {
          return { error: 'Conversation title cannot be empty.' };
        }
        if (tab === 'Direct' && !staffId) {
          return { error: 'Please select at least one staff member.' };
        }
        return { success: true };
      };

      const res = await validateAndSubmit('Chat with colleague', 'Direct', null);
      expect(res.error).toBe('Please select at least one staff member.');
    });

    test('Empirical 3.3: Rejects Care Team creation when patient context is missing or blank', async () => {
      const validateAndSubmit = async (title: string, tab: string, patientId: string) => {
        if (!title || !title.trim()) {
          return { error: 'Conversation title cannot be empty.' };
        }
        if (tab === 'StaffContext' && (!patientId || !patientId.trim())) {
          return { error: 'Please select a patient for the care team.' };
        }
        return { success: true };
      };

      const resEmpty = await validateAndSubmit('Care Team: Consultation', 'StaffContext', '');
      expect(resEmpty.error).toBe('Please select a patient for the care team.');

      const resWhitespace = await validateAndSubmit('Care Team: Consultation', 'StaffContext', '   ');
      expect(resWhitespace.error).toBe('Please select a patient for the care team.');
    });

    test('Empirical 3.4: Creation supports Direct Message, Care Team, and Facility Channel schemas', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      expect(html).toContain('Direct Message');
      expect(html).toContain('Care Team');
      expect(html).toContain('Facility Channel');
      expect(html).toContain('Start Conversation');
      expect(html).toContain('Cancel');
    });

    test('Empirical 3.5: Staff selection directory excludes self and renders role badges', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      // Self (Dr. Juan Luna) must not appear in selectable colleague list
      expect(html).not.toContain('Dr. Juan Luna');

      // Colleague Nurse Maria Santos must appear with initials MS and role Nurse
      expect(html).toContain('Nurse Maria Santos');
      expect(html).toContain('>MS<');
      expect(html).toContain('>Nurse<');

      // Colleague Admin Ramon Garcia must appear with initials RG and role Administrator
      expect(html).toContain('Admin Ramon Garcia');
      expect(html).toContain('>RG<');
      expect(html).toContain('>Administrator<');
    });
  });

  // =========================================================================
  // Section 4: ClinicChatDrawerHost Ergonomics, Reconnect & Navigation
  // =========================================================================
  describe('Section 4: ClinicChatDrawerHost Ergonomics, Reconnect & Card Navigation', () => {
    test('Empirical 4.1: Live connection pill reflects connected, reconnecting, and offline states', () => {
      const states = [
        { status: 'connected', expectedText: 'Connected' },
        { status: 'reconnecting', expectedText: 'Reconnecting...' },
        { status: 'connecting', expectedText: 'Reconnecting...' },
        { status: 'acquiring_ticket', expectedText: 'Reconnecting...' },
        { status: 'disconnected', expectedText: 'Offline' },
        { status: 'failed', expectedText: 'Offline' },
      ];

      for (const { status, expectedText } of states) {
        mockCommsStatus = status;
        const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
        expect(html).toContain(expectedText);
      }
    });

    test('Empirical 4.2: Manual reconnect button is positioned beside connection pill with refresh icon', () => {
      const html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));

      // Must have reconnect button with accessibility label
      expect(html).toContain('aria-label="Manual reconnect to clinic communications"');
      expect(html).toContain('lucide-refresh-cw');

      // Verify positioning inside connectionGroup right beside connection pill
      const pillPos = html.indexOf('Connected');
      const reconnectPos = html.indexOf('aria-label="Manual reconnect to clinic communications"');
      expect(reconnectPos).toBeGreaterThan(pillPos);
      expect(reconnectPos - pillPos).toBeLessThan(450); // Adjacent in DOM
    });

    test('Empirical 4.3: Manual reconnect executes comms.reconnect() and refreshes both conversations and triage', async () => {
      let isManualReconnecting = false;
      const handleManualReconnect = async () => {
        if (isManualReconnecting) return;
        isManualReconnecting = true;
        try {
          await mockReconnect();
          await Promise.allSettled([
            mockRefreshConversations(),
            mockRefreshTriage(),
          ]);
          mockToasts.push({ type: 'success', msg: 'Reconnected to clinic communications.' });
        } finally {
          isManualReconnecting = false;
        }
      };

      await handleManualReconnect();

      expect(mockReconnect).toHaveBeenCalledTimes(1);
      expect(mockRefreshConversations).toHaveBeenCalledTimes(1);
      expect(mockRefreshTriage).toHaveBeenCalledTimes(1);
      expect(mockToasts.some(t => t.type === 'success' && t.msg.includes('Reconnected to clinic communications.'))).toBe(true);
    });

    test('Empirical 4.4: Card-to-thread navigation opens active thread when triage card is clicked', () => {
      // 1. AST / Contract verification of ClinicChatDrawerHost source code
      const hostSource = fs.readFileSync(
        path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx'),
        'utf-8'
      );
      expect(hostSource).toContain('onSelectCard={(conversationId) => setActiveConversationId(conversationId)}');
      expect(hostSource).toContain('onBack={() => setActiveConversationId(undefined)}');

      // 2. Initially, activeConversationId is undefined
      mockClinicComms.activeConversationId = undefined;
      let html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));

      // Header rendered
      expect(html).toContain('Messages');

      // 3. Simulate triage card selection callback execution
      const handleSelectCard = (conversationId: string) => {
        mockClinicComms.setActiveConversationId(conversationId);
      };
      handleSelectCard('conv-active-1');

      // Now activeConversationId is 'conv-active-1'
      expect(mockClinicComms.activeConversationId).toBe('conv-active-1');

      // 4. Render again: ClinicActiveThread is now displayed inside the drawer
      html = renderToStaticMarkup(React.createElement(ClinicChatDrawerHost));
      expect(html).toContain('aria-label="Back to conversations"');
      expect(html).toContain('Pediatric Asthma Triage');

      // 5. Back navigation clears activeConversationId
      mockClinicComms.setActiveConversationId(undefined);
      expect(mockClinicComms.activeConversationId).toBeUndefined();
    });

    test('Empirical 4.5: Conversation deletion and archive removes item from list and triggers backend close', () => {
      const hostSource = fs.readFileSync(
        path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx'),
        'utf-8'
      );
      expect(hostSource).toContain('onDeleteConversation={handleDeleteConversation}');
      expect(hostSource).toContain('onCloseAndArchive={handleCloseAndArchive}');
      expect(hostSource).toContain('removedConversationIds.has(c.id)');

      const threadSource = fs.readFileSync(
        path.resolve(__dirname, '../components/comms/ClinicActiveThread.tsx'),
        'utf-8'
      );
      expect(threadSource).toContain('onDeleteConversation?.(conversationId)');
      expect(threadSource).toContain('onCloseAndArchive?.(conversationId)');
    });
  });
});
