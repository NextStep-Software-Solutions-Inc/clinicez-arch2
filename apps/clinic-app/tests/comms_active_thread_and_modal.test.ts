// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

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

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mock(() => {}),
    goBack: mock(() => {}),
  }),
}));

const mockStaffList = [
  { id: 'staff-curr', firstName: 'Juan', lastName: 'Luna', title: 'Dr.', role: 'Doctor' },
  { id: 'staff-2', firstName: 'Maria', lastName: 'Santos', title: 'Nurse', role: 'Nurse' },
  { id: 'staff-3', firstName: 'Ramon', lastName: 'Garcia', title: 'Admin', role: 'Administrator' },
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
    facilityName: 'Clinic EZ Metro',
    license: { clinicId: 'c1' },
  }),
}));
mock.module('../../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'Clinic EZ Metro',
    license: { clinicId: 'c1' },
  }),
}));

let mockToasts: string[] = [];
mock.module('../utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.push(msg),
    error: (msg: string) => mockToasts.push(msg),
    info: (msg: string) => mockToasts.push(msg),
  },
}));
mock.module('../../utils/feedback', () => ({
  notify: {
    success: (msg: string) => mockToasts.push(msg),
    error: (msg: string) => mockToasts.push(msg),
    info: (msg: string) => mockToasts.push(msg),
  },
}));

let mockSendMessage = mock(async () => {});
let mockResendMessage = mock(async () => {});
let mockAcknowledgeMessage = mock(async () => {});

mock.module('@clinicez/comms-sdk/react', () => ({
  useConversation: (id: string) => ({
    conversation: {
      id,
      title: id === 'conv-active-999' ? 'Conversation conv-active-999' : 'Pediatric Triage Team',
      scope: 'PatientFacility',
      contextId: 'p-10492',
    },
    messages: [
      { messageId: 'm-1', conversationId: id, contentText: 'Patient exhibits low grade fever.', senderType: 'Staff', sentAtUtc: new Date().toISOString() },
      { messageId: 'm-2', conversationId: id, contentText: 'Vitals charted: BP 120/80', senderType: 'Staff', sentAtUtc: new Date().toISOString() },
    ],
    isLoading: false,
    error: null,
    acknowledgeMessage: mockAcknowledgeMessage,
  }),
  useSendMessage: () => ({
    sendMessage: mockSendMessage,
    resendMessage: mockResendMessage,
  }),
  useComms: () => ({
    status: 'connected',
    reconnect: mock(async () => {}),
    isReconnecting: false,
  }),
  useConversations: () => ({
    conversations: [],
    unreadCount: 0,
    isLoading: false,
    error: null,
    refresh: mock(async () => {}),
    createConversation: mock(async (req: any) => ({ id: 'conv-new-123', ...req })),
  }),
  useTriageQueue: () => ({
    items: [],
    pendingCount: 0,
    urgentCount: 0,
    isLoading: false,
    error: null,
    refresh: mock(async () => {}),
    answerRequest: mock(async () => {}),
    requestVisit: mock(async () => {}),
    declineRequest: mock(async () => {}),
    routeToStaff: mock(async () => {}),
  }),
}));

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: createMockComponent('ChatDrawer'),
  MessageThread: createMockComponent('MessageThread'),
  TriageQueueView: createMockComponent('TriageQueueView'),
}));

const { default: ClinicActiveThread } = await import('../components/comms/ClinicActiveThread');
const { default: NewConversationModal } = await import('../components/comms/NewConversationModal');

describe('ClinicActiveThread & NewConversationModal Dedicated Suite', () => {
  beforeEach(() => {
    mockToasts = [];
    mockSendMessage.mockClear();
    mockResendMessage.mockClear();
    mockAcknowledgeMessage.mockClear();
  });

  describe('ClinicActiveThread Header & Ergonomics', () => {
    test('Header contains Icon-only Back button (aria-label="Back to conversations")', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
        })
      );

      expect(html).toContain('aria-label="Back to conversations"');
      expect(html).not.toContain('>Conversations<'); // Icon only, no text label
    });

    test('Header center contains conversation title and tap-to-rename pencil icon', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
        })
      );

      expect(html).toContain('Pediatric Triage Team');
      expect(html).toContain('aria-label="Rename conversation"');
      expect(html).toContain('Patient Request'); // Category badge
    });

    test('Header right controls appear in exact order (1. 👥, 2. 👁️, 3. •••)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
        })
      );

      // Verify sequence of buttons
      const membersIdx = html.indexOf('aria-label="Care team members: 1"');
      const privacyIdx = html.indexOf('aria-label="Toggle medical privacy blur"');
      const actionMenuIdx = html.indexOf('aria-label="Conversation action menu"');

      expect(membersIdx).toBeGreaterThan(0);
      expect(privacyIdx).toBeGreaterThan(membersIdx);
      expect(actionMenuIdx).toBeGreaterThan(privacyIdx);
    });

    test('Renders Pinned Clinical Orders & Alerts banner', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
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
      expect(html).toContain('NPO after midnight');
    });

    test('Renders 4 Quick 1-tap clinical response speed pills', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
        })
      );

      expect(html).toContain('+ Vitals Charted');
      expect(html).toContain('+ Bedside Now');
      expect(html).toContain('+ Lab Requested');
      expect(html).toContain('+ On My Way');
    });

    test('Action Menu houses all 7 clinical operations', () => {
      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
          initialActionMenuOpen: true,
        })
      );

      expect(html).toContain('Rename');
      expect(html).toContain('View Patient Chart');
      expect(html).toContain('Search in Conversation');
      expect(html).toContain('Shift Handoff Summary');
      expect(html).toContain('Mute Channel');
      expect(html).toContain('Close');
      expect(html).toContain('Archive');
      expect(html).toContain('Delete Conversation');
    });
  });

  describe('NewConversationModal Lifecycle & Strict Validation', () => {
    test('Renders 3 conversation type tabs: Direct Message, Care Team, Facility Channel', () => {
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
    });

    test('Excludes current staff member from direct message selection directory', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      // Current user is Dr. Juan Luna (staff-curr)
      expect(html).not.toContain('Dr. Juan Luna');
      // Other staff are shown
      expect(html).toContain('Nurse Maria Santos');
      expect(html).toContain('Admin Ramon Garcia');
    });

    test('Displays role badges and avatar initials for staff', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      expect(html).toContain('>MS<'); // Maria Santos initials
      expect(html).toContain('>RG<'); // Ramon Garcia initials
      expect(html).toContain('>Nurse<');
      expect(html).toContain('>Administrator<');
    });

    test('Contains Start Conversation submit button and Cancel button', () => {
      const html = renderToStaticMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        })
      );

      expect(html).toContain('Start Conversation');
      expect(html).toContain('Cancel');
    });

    test('AST audit verifies ClinicChatDrawerHost maps Facility department to contextId/contextType, not MessageCategory', () => {
      const fs = require('fs');
      const path = require('path');
      const hostPath = path.resolve(__dirname, '../components/comms/ClinicChatDrawerHost.tsx');
      const hostSource = fs.readFileSync(hostPath, 'utf-8');

      // Must not assign department to category enum
      expect(hostSource).not.toContain('category: params.department');
      // Must map contextType to Department for facility scope
      expect(hostSource).toContain("isFacility && params.department ? 'Department'");
      // Must map contextId to params.department for facility scope
      expect(hostSource).toContain("isFacility ? params.department");
      // Must map contextType to Patient for staffContext scope
      expect(hostSource).toContain("isStaffContext && params.patientId ? 'Patient'");
    });

    test('Facility scope conversation in ClinicActiveThread protects handleViewPatientChart from treating room name as patient ID', () => {
      const fs = require('fs');
      const path = require('path');
      const threadPath = path.resolve(__dirname, '../components/comms/ClinicActiveThread.tsx');
      const threadSource = fs.readFileSync(threadPath, 'utf-8');

      // Must guard patientId resolution with scope check
      expect(threadSource).toContain("conversation?.scope === 'StaffContext' || conversation?.scope === 'PatientFacility'");
    });
  });
});
