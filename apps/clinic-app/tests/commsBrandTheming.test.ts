// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import * as ReactNamespace from 'react';
import React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { lightColors, radiusScale } from '@clinicez/design-tokens';

(globalThis as any).__DEV__ = true;

// Force a single React instance across apps/clinic-app and packages/comms-sdk even if nested node_modules exist
mock.module('react', () => ({ ...ReactNamespace, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

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
    value,
    placeholder,
    placeholderTextColor,
    color,
    horizontal: _horizontal,
    showsHorizontalScrollIndicator: _showsHorizontalScrollIndicator,
    nestedScrollEnabled: _nestedScrollEnabled,
    activeOpacity: _activeOpacity,
    numberOfLines: _numberOfLines,
    multiline: _multiline,
    blurOnSubmit: _blurOnSubmit,
    autoFocus: _autoFocus,
    scrollEventThrottle: _scrollEventThrottle,
    contentContainerStyle: _contentContainerStyle,
    animationType: _animationType,
    transparent: _transparent,
    onRequestClose: _onRequestClose,
    onChangeText: _onChangeText,
    onSubmitEditing: _onSubmitEditing,
    onKeyPress: _onKeyPress,
    pointerEvents: _pointerEvents,
    size: _size,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const flatStyle = Array.isArray(resolvedStyle)
      ? Object.assign({}, ...resolvedStyle.flat(Infinity).filter(Boolean))
      : resolvedStyle;
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
        ...(placeholderTextColor ? { 'data-placeholder-color': placeholderTextColor } : {}),
        ...(color ? { 'data-color': color } : {}),
        ...(value !== undefined ? { 'data-value': String(value) } : {}),
        ...(onPress ? { 'data-pressable': 'true', onClick: onPress } : {}),
        'data-style': flatStyle ? JSON.stringify(flatStyle) : undefined,
        ...rest,
      },
      title || label,
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

const reactNativeMockFactory = () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.flat(Infinity).filter(Boolean)) : s || {}),
    absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
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
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    parallel: (anims: any[]) => ({
      start: (cb?: any) => {
        anims.forEach((a) => a?.start?.());
        if (cb) cb();
      },
    }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
});
mock.module('react-native', reactNativeMockFactory);

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
  useRoute: () => ({ params: {} }),
  useFocusEffect: () => {},
  useIsFocused: () => true,
  NavigationContainer: ({ children }: any) => children,
}));

const mockStaffList = [
  { id: 'staff-curr', firstName: 'Juan', lastName: 'Luna', title: 'Dr.', role: 'Doctor' },
  { id: 'staff-2', firstName: 'Maria', lastName: 'Santos', title: 'Nurse', role: 'Nurse' },
];

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    current: mockStaffList[0],
    staff: mockStaffList,
  }),
  formatStaffName: (s: any) =>
    s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));
mock.module('../../context/StaffContext', () => ({
  useStaff: () => ({
    current: mockStaffList[0],
    staff: mockStaffList,
  }),
  formatStaffName: (s: any) =>
    s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Admin', clinicId: 'c1' },
    can: () => true,
    offline: false,
  }),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Admin', clinicId: 'c1' },
    can: () => true,
    offline: false,
  }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'St. Luke Clinic',
    license: { clinicId: 'c1' },
    rooms: [{ id: 'r1', name: 'Pediatrics', isActive: true }],
  }),
}));
mock.module('../../context/ClinicContext', () => ({
  useClinic: () => ({
    facilityName: 'St. Luke Clinic',
    license: { clinicId: 'c1' },
    rooms: [{ id: 'r1', name: 'Pediatrics', isActive: true }],
  }),
}));

let mockActiveConversationId: string | undefined = undefined;
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    isChatDrawerOpen: true,
    closeChatDrawer: () => {},
    activeConversationId: mockActiveConversationId,
    setActiveConversationId: (id?: string) => {
      mockActiveConversationId = id;
    },
  }),
}));
mock.module('../../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    isChatDrawerOpen: true,
    closeChatDrawer: () => {},
    activeConversationId: mockActiveConversationId,
    setActiveConversationId: (id?: string) => {
      mockActiveConversationId = id;
    },
  }),
}));

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isWorkstation: true,
    isMobile: false,
    width: 1280,
  }),
}));
mock.module('../../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    isWorkstation: true,
    isMobile: false,
    width: 1280,
  }),
}));

const realFeedback = await import('../utils/feedback');
mock.module('../utils/feedback', () => ({
  ...realFeedback,
  notify: {
    ...realFeedback.notify,
    success: () => {},
    error: () => {},
    info: () => {},
  },
}));
mock.module('../../utils/feedback', () => ({
  ...realFeedback,
  notify: {
    ...realFeedback.notify,
    success: () => {},
    error: () => {},
    info: () => {},
  },
}));

mock.module('../utils/alertSounds', () => ({
  playMessageChime: () => {},
}));
mock.module('../../utils/alertSounds', () => ({
  playMessageChime: () => {},
}));

mock.module('@clinicez/comms-sdk/react', () => ({
  useConversation: (id: string) => ({
    conversation: {
      id,
      title: 'Pediatric Triage Team',
      scope: 'PatientFacility',
      contextId: 'p-10492',
    },
    messages: [
      {
        messageId: 'm-me-1',
        seq: 1,
        conversationId: id,
        contentText: 'Vitals charted and stable.',
        senderType: 'Staff',
        senderId: 'staff-curr',
        senderDisplayName: 'Dr. Juan Luna',
        visibility: 'Public',
        deliveryState: 'Received',
        sentAtUtc: '2026-11-11T06:00:00Z',
      },
      {
        messageId: 'm-other-2',
        seq: 2,
        conversationId: id,
        contentText: 'Please confirm IV order.',
        senderType: 'Staff',
        senderId: 'staff-2',
        senderDisplayName: 'Nurse Maria Santos',
        visibility: 'Public',
        deliveryState: 'Received',
        requiresAcknowledgement: true,
        isAcknowledged: false,
        sentAtUtc: '2026-11-11T06:02:00Z',
      },
    ],
    isLoading: false,
    error: null,
    acknowledgeMessage: async () => {},
  }),
  useSendMessage: () => ({
    sendMessage: async () => {},
    resendMessage: async () => {},
  }),
  useComms: () => ({
    status: 'connected',
    reconnect: async () => {},
    isReconnecting: false,
  }),
  useConversations: () => ({
    conversations: [
      {
        id: 'conv-direct-1',
        scope: 'Direct',
        title: 'Dr. Maria Santos',
        lastMessageSnippet: 'Ready for rounds',
        lastMessageAtUtc: '2026-11-11T06:00:00Z',
        unreadCount: 3,
        priority: 'Normal',
      },
    ],
    unreadCount: 3,
    isLoading: false,
    error: null,
    refresh: async () => {},
    createConversation: async (req: any) => ({ id: 'conv-new-123', ...req }),
  }),
  useTriageQueue: () => ({
    items: [],
    pendingCount: 2,
    urgentCount: 0,
    isLoading: false,
    error: null,
    refresh: async () => {},
    answerRequest: async () => {},
    requestVisit: async () => {},
    declineRequest: async () => {},
    routeToStaff: async () => {},
  }),
}));

const { ChatDrawer } = await import('../../../packages/comms-sdk/src/native-ui/ChatDrawer');
const { MessageThread } = await import('../../../packages/comms-sdk/src/native-ui/MessageThread');
const { TriageQueueView } = await import('../../../packages/comms-sdk/src/native-ui/TriageQueueView');

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer,
  MessageThread,
  TriageQueueView,
}));

const { getActiveThemeState, syncActiveTheme } = await import('../constants/theme');
const { DEFAULT_CLINIC_BRAND_COLOR } = await import('../constants/color');
const { default: ClinicChatDrawerHost } = await import('../components/comms/ClinicChatDrawerHost');
const { default: ClinicActiveThread } = await import('../components/comms/ClinicActiveThread');
const { default: NewConversationModal } = await import('../components/comms/NewConversationModal');

const renderMarkup = (element: React.ReactElement): string =>
  renderToStaticMarkup(element).replaceAll('&quot;', '"');

const renderStylesAndMarkup = (element: React.ReactElement) => {
  const raw = renderToStaticMarkup(element);
  const stylesList = Array.from(raw.matchAll(/data-style="([^"]+)"/g)).map((m) =>
    JSON.parse(m[1].replaceAll('&quot;', '"')),
  );
  return { html: raw.replaceAll('&quot;', '"'), stylesList };
};

describe('Messaging Sidebar Chips, Soft Pastel Bubbles & Triage Brand Sync (#104)', () => {
  beforeEach(() => {
    mockActiveConversationId = undefined;
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
  });

  afterEach(() => {
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
  });

  describe('1. Comms SDK Native UI — Default lightColors Fallback', () => {
    test('ChatDrawer falls back to lightColors with soft brand chips when colors prop is omitted', () => {
      const { html, stylesList } = renderStylesAndMarkup(
        React.createElement(ChatDrawer, {
          items: [
            {
              id: 'conv-1',
              scope: 'Direct',
              title: 'Dr. Maria Santos',
              lastMessageSnippet: 'Lab results ready',
              unreadCount: 2,
            },
          ],
          activeConversationId: 'conv-1',
          onSelectConversation: () => {},
          selectedScope: 'Direct',
          onSelectScope: () => {},
          searchQuery: '',
          onSearchChange: () => {},
          onNewConversation: () => {},
        }),
      );

      // Soft pastel active scope pill (primaryLight + primaryBorder + primaryDark bold)
      expect(
        stylesList.some(
          (s) => s.backgroundColor === lightColors.primaryLight && s.borderColor === lightColors.primaryBorder,
        ),
      ).toBe(true);
      expect(
        stylesList.some((s) => s.color === lightColors.primaryDark && s.fontWeight === '700'),
      ).toBe(true);

      // + New primary button & unread badge
      expect(stylesList.some((s) => s.backgroundColor === lightColors.primary)).toBe(true);
      expect(stylesList.some((s) => s.color === lightColors.onPrimary)).toBe(true);

      // Active card subtle tint + 4px left border + primary title + Direct monogram
      expect(
        stylesList.some(
          (s) =>
            s.backgroundColor === lightColors.primarySubtle &&
            s.borderLeftWidth === 4 &&
            s.borderLeftColor === lightColors.primary,
        ),
      ).toBe(true);
      expect(html).toContain('>MS<');
    });

    test('MessageThread renders soft pastel outgoing bubbleMe (not solid primary) while keeping solid Send & routine Ack', () => {
      const { stylesList } = renderStylesAndMarkup(
        React.createElement(MessageThread, {
          conversationId: 'conv-1',
          conversationTitle: 'Care Team',
          conversationScope: 'StaffContext',
          currentUserId: 'doc-1',
          privacyBlurEnabled: false,
          onTogglePrivacyBlur: () => {},
          onSendMessage: async () => {},
          onResendMessage: async () => {},
          onAcknowledgeMessage: async () => {},
          messages: [
            {
              id: 'm-sent',
              seq: 1,
              conversationId: 'conv-1',
              senderType: 'Staff',
              senderId: 'doc-1',
              senderDisplayName: 'Dr. Luna',
              contentText: 'BP stabilized at 120/80.',
              visibility: 'Public',
              state: 'Received',
              clientSentAtUtc: '2026-11-11T06:00:00Z',
            },
            {
              id: 'm-failed',
              seq: 2,
              conversationId: 'conv-1',
              senderType: 'Staff',
              senderId: 'doc-1',
              senderDisplayName: 'Dr. Luna',
              contentText: 'Retry vitals upload',
              visibility: 'Public',
              state: 'NotReceived',
              clientSentAtUtc: '2026-11-11T06:01:00Z',
            },
            {
              id: 'm-other',
              seq: 3,
              conversationId: 'conv-1',
              senderType: 'Staff',
              senderId: 'nurse-2',
              senderDisplayName: 'Nurse Santos',
              contentText: 'Administer STAT order',
              visibility: 'Public',
              state: 'Received',
              requiresAcknowledgement: true,
              isAcknowledged: false,
              clientSentAtUtc: '2026-11-11T06:02:00Z',
            },
          ],
        }),
      );

      // Soft pastel outgoing bubbleMe
      expect(
        stylesList.some(
          (s) =>
            s.backgroundColor === lightColors.primaryLight &&
            s.borderColor === lightColors.primaryBorder &&
            s.borderWidth === 1 &&
            s.borderBottomRightRadius === radiusScale.xs,
        ),
      ).toBe(true);
      // Outgoing body text uses readable c.text (not white onPrimary)
      expect(
        stylesList.some((s) => s.color === lightColors.text && s.lineHeight === 20),
      ).toBe(true);
      // Outgoing timestamp uses primaryDark with 0.8 opacity
      expect(
        stylesList.some((s) => s.color === lightColors.primaryDark && s.opacity === 0.8),
      ).toBe(true);
      // Delivered indicator uses c.primary
      expect(
        stylesList.some((s) => s.color === lightColors.primary && s.fontWeight === '700'),
      ).toBe(true);
      // Failed resend button uses emergencyBg + emergencyBorder + emergencyText
      expect(
        stylesList.some(
          (s) =>
            s.backgroundColor === lightColors.emergencyBg &&
            s.borderColor === lightColors.emergencyBorder &&
            s.borderWidth === 1,
        ),
      ).toBe(true);
      // Acknowledge button uses routineBg + routineBorder + routineText
      expect(
        stylesList.some(
          (s) => s.backgroundColor === lightColors.routineBg && s.borderColor === lightColors.routineBorder,
        ),
      ).toBe(true);
    });

    test('TriageQueueView styles active filter chip, routine badge & empty shield while preserving semantic Emergency/Urgent', () => {
      const { stylesList } = renderStylesAndMarkup(
        React.createElement(TriageQueueView, {
          facilityName: 'St. Luke Clinic',
          activeFilter: 'Routine',
          onFilterChange: () => {},
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          items: [
            {
              conversationId: 't-routine',
              requestId: 'r-1',
              patientId: 'p-1',
              patientNameMasked: 'Maria C.',
              category: 'Prescription Refill',
              contentText: 'Requesting maintenance refill',
              priority: 'Routine',
              status: 'Submitted',
              submittedAtUtc: '2026-11-11T06:00:00Z',
              triageDueAtUtc: '2026-11-11T09:00:00Z',
              slaTimeRemainingSeconds: 3600,
              isOffHours: false,
              slaBreached: false,
              isEmergencyConfirmed: true,
            },
          ],
        }),
      );

      // Soft pastel active filter pill
      expect(
        stylesList.some(
          (s) => s.backgroundColor === lightColors.primaryLight && s.borderColor === lightColors.primaryBorder,
        ),
      ).toBe(true);
      expect(
        stylesList.some((s) => s.color === lightColors.primaryDark && s.fontWeight === '700'),
      ).toBe(true);
      // Routine badge + Answer CTA
      expect(
        stylesList.some(
          (s) => s.backgroundColor === lightColors.routineBg && s.borderColor === lightColors.routineBorder,
        ),
      ).toBe(true);
      expect(stylesList.some((s) => s.backgroundColor === lightColors.primary)).toBe(true);
    });
  });

  describe('2. Dynamic Clinic Brand & Personal Accent Sync Across Light & Dark Modes', () => {
    test('Rose (#E11D48) Clinic Brand & Violet (#7C3AED) Dark Personal Accent propagate across ChatDrawer, MessageThread & TriageQueueView', () => {
      // 1. Switch Clinic Brand to Rose (#E11D48)
      syncActiveTheme({ brandColorHex: '#E11D48', userBrandColorHex: null, scheme: 'light' });
      const roseColors = getActiveThemeState().resolvedColors;

      const roseDrawerHtml = renderMarkup(
        React.createElement(ChatDrawer, {
          items: [
            {
              id: 'conv-rose',
              scope: 'Direct',
              title: 'Dr. Rosa',
              lastMessageSnippet: 'Updated chart',
              unreadCount: 1,
            },
          ],
          activeConversationId: 'conv-rose',
          onSelectConversation: () => {},
          selectedScope: 'All',
          onSelectScope: () => {},
          searchQuery: '',
          onSearchChange: () => {},
          onNewConversation: () => {},
          colors: roseColors,
        }),
      );

      expect(roseDrawerHtml).toContain(`"backgroundColor":"${roseColors.primaryLight}"`);
      expect(roseDrawerHtml).toContain(`"borderColor":"${roseColors.primaryBorder}"`);
      expect(roseDrawerHtml).toContain(`"color":"${roseColors.primaryDark}"`);
      expect(roseDrawerHtml).toContain(`"backgroundColor":"${roseColors.primary}"`);
      expect(roseDrawerHtml).not.toContain(lightColors.primary);

      // 2. Switch Personal Accent to Violet (#7C3AED) in Dark Mode
      syncActiveTheme({ brandColorHex: '#E11D48', userBrandColorHex: '#7C3AED', scheme: 'dark' });
      const violetDarkColors = getActiveThemeState().resolvedColors;

      const violetThreadHtml = renderMarkup(
        React.createElement(MessageThread, {
          conversationId: 'conv-v',
          conversationTitle: 'Night Shift',
          conversationScope: 'Facility',
          currentUserId: 'staff-curr',
          privacyBlurEnabled: false,
          onTogglePrivacyBlur: () => {},
          onSendMessage: async () => {},
          onResendMessage: async () => {},
          colors: violetDarkColors,
          messages: [
            {
              id: 'm-dark-1',
              seq: 1,
              conversationId: 'conv-v',
              senderType: 'Staff',
              senderId: 'staff-curr',
              senderDisplayName: 'Dr. Juan Luna',
              contentText: 'Night shift handoff complete.',
              visibility: 'Public',
              state: 'Waiting',
              clientSentAtUtc: '2026-11-11T14:00:00Z',
            },
          ],
        }),
      );

      expect(violetThreadHtml).toContain(`"backgroundColor":"${violetDarkColors.primaryLight}"`);
      expect(violetThreadHtml).toContain(`"borderColor":"${violetDarkColors.primaryBorder}"`);
      expect(violetThreadHtml).toContain(`"color":"${violetDarkColors.text}"`);
      expect(violetThreadHtml).toContain(`"color":"${violetDarkColors.primaryDark}","opacity":0.8`);
      expect(violetThreadHtml).toContain(`"color":"${violetDarkColors.textMuted}"`);
      expect(violetThreadHtml).not.toContain(roseColors.primary);

      // 3. TriageQueueView preserves Emergency red & Urgent orange even under custom Violet brand
      const violetTriageHtml = renderMarkup(
        React.createElement(TriageQueueView, {
          facilityName: 'St. Luke Clinic',
          activeFilter: 'All',
          onFilterChange: () => {},
          onExecuteDisposition: async () => {},
          onRefresh: () => {},
          colors: violetDarkColors,
          items: [
            {
              conversationId: 't-emerg',
              requestId: 'r-emerg',
              patientId: 'p-emerg',
              patientNameMasked: 'Juan D.',
              category: 'Chest Pain',
              contentText: 'Acute chest tightness',
              priority: 'Emergency',
              status: 'Submitted',
              submittedAtUtc: '2026-11-11T14:00:00Z',
              triageDueAtUtc: '2026-11-11T13:55:00Z',
              slaTimeRemainingSeconds: 0,
              isOffHours: false,
              slaBreached: true,
              isEmergencyConfirmed: false,
            },
            {
              conversationId: 't-urg',
              requestId: 'r-urg',
              patientId: 'p-urg',
              patientNameMasked: 'Pedro S.',
              category: 'High Fever',
              contentText: 'Fever 39.2C',
              priority: 'Urgent',
              status: 'Submitted',
              submittedAtUtc: '2026-11-11T14:00:00Z',
              triageDueAtUtc: '2026-11-11T14:30:00Z',
              slaTimeRemainingSeconds: 1200,
              isOffHours: false,
              slaBreached: false,
              isEmergencyConfirmed: true,
            },
            {
              conversationId: 't-rout',
              requestId: 'r-rout',
              patientId: 'p-rout',
              patientNameMasked: 'Ana L.',
              category: 'Follow-up',
              contentText: 'Routine checkup question',
              priority: 'Routine',
              status: 'Submitted',
              submittedAtUtc: '2026-11-11T14:00:00Z',
              triageDueAtUtc: '2026-11-11T16:00:00Z',
              slaTimeRemainingSeconds: 7200,
              isOffHours: false,
              slaBreached: false,
              isEmergencyConfirmed: true,
            },
          ],
        }),
      );

      expect(violetTriageHtml).toContain(`"backgroundColor":"${violetDarkColors.primaryLight}"`);
      expect(violetTriageHtml).toContain(`"backgroundColor":"${violetDarkColors.routineBg}"`);
      expect(violetTriageHtml).toContain(`"backgroundColor":"${violetDarkColors.emergencyBg}"`);
      expect(violetTriageHtml).toContain(`"backgroundColor":"${violetDarkColors.urgentBg}"`);
    });
  });

  describe('3. Clinic App Comms Hosts Live Theme Reactivity', () => {
    test('ClinicChatDrawerHost tints Messages title, active segmented tab, and passes concrete resolvedColors to ChatDrawer', () => {
      syncActiveTheme({ brandColorHex: '#E11D48', userBrandColorHex: null, scheme: 'light' });
      const rose = getActiveThemeState().resolvedColors;

      const roseHostHtml = renderMarkup(React.createElement(ClinicChatDrawerHost));
      expect(roseHostHtml).toContain('Messages');
      expect(roseHostHtml).toContain(`"color":"${rose.primary}"`);
      expect(roseHostHtml).toContain(`"backgroundColor":"${rose.primaryLight}"`);
      expect(roseHostHtml).toContain(`"borderColor":"${rose.primaryBorder}"`);
      expect(roseHostHtml).toContain(`"color":"${rose.primaryDark}"`);

      // Switch to Personal Accent (#0284C7 Sky Blue) and verify immediate re-render sync
      syncActiveTheme({ brandColorHex: '#E11D48', userBrandColorHex: '#0284C7', scheme: 'light' });
      const sky = getActiveThemeState().resolvedColors;

      const skyHostHtml = renderMarkup(React.createElement(ClinicChatDrawerHost));
      expect(skyHostHtml).toContain(`"color":"${sky.primary}"`);
      expect(skyHostHtml).toContain(`"backgroundColor":"${sky.primaryLight}"`);
      expect(skyHostHtml).toContain(`"color":"${sky.primaryDark}"`);
      expect(skyHostHtml).not.toContain(`"color":"${rose.primary}"`);
    });

    test('ClinicActiveThread syncs SPEED_RESPONSE_PILLS (primarySubtle/primaryBorder/primaryDark) and soft pastel MessageThread bubbles', () => {
      syncActiveTheme({ brandColorHex: '#7C3AED', userBrandColorHex: null, scheme: 'light' });
      const violet = getActiveThemeState().resolvedColors;

      const threadHtml = renderMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: 'conv-1',
          onBack: () => {},
          currentUserId: 'staff-curr',
        }),
      );

      // Speed pills use primarySubtle + primaryBorder + primaryDark
      expect(threadHtml).toContain('+ Vitals Charted');
      expect(threadHtml).toContain(`"backgroundColor":"${violet.primarySubtle}"`);
      expect(threadHtml).toContain(`"borderColor":"${violet.primaryBorder}"`);
      expect(threadHtml).toContain(`"color":"${violet.primaryDark}"`);

      // Embedded MessageThread receives concrete resolvedColors for pastel outgoing bubbleMe
      expect(threadHtml).toContain(
        `"backgroundColor":"${violet.primaryLight}","borderColor":"${violet.primaryBorder}","borderWidth":1,"borderBottomRightRadius":${radiusScale.xs}`,
      );
    });

    test('NewConversationModal dynamically updates type tabs and staff avatars when brand color changes', () => {
      syncActiveTheme({ brandColorHex: '#D97706', userBrandColorHex: null, scheme: 'light' });
      const amber = getActiveThemeState().resolvedColors;

      const modalHtml = renderMarkup(
        React.createElement(NewConversationModal, {
          visible: true,
          onClose: () => {},
          onCreateConversation: async () => {},
        }),
      );

      expect(modalHtml).toContain('Direct Message');
      expect(modalHtml).toContain(`"backgroundColor":"${amber.primaryLight}"`);
      expect(modalHtml).toContain(`"borderColor":"${amber.primaryBorder}"`);
      expect(modalHtml).toContain(`"color":"${amber.primaryDark}"`);
      expect(modalHtml).toContain(`"backgroundColor":"${amber.primarySubtle}"`);
    });
  });
});
