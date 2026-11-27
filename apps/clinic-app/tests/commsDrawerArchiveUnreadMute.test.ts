// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import * as ReactNamespace from 'react';
import React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

mock.module('react', () => ({ ...ReactNamespace, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

const { CommsEventEmitter } = await import('../../../packages/comms-sdk/src/core/events/CommsEventEmitter');

function createClinicHookHarness<Result>(hookFn: () => Result) {
  const stateSlots: any[] = [];
  const effectSlots: Array<{ fn: () => any; cleanup?: any; deps: any[]; hasChanged: boolean }> = [];
  const refSlots: Array<{ current: any }> = [];
  const memoSlots: Array<{ value: any; deps: any[] }> = [];
  let slotIndex = 0;
  let effectIndex = 0;
  let refIndex = 0;
  let memoIndex = 0;
  let result!: Result;
  let isRendering = false;
  let hasPendingRender = false;

  const mockHooks: any = {
    useState: (initial: any) => {
      const idx = slotIndex++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setState = (newVal: any) => {
        const nextVal = typeof newVal === 'function' ? newVal(stateSlots[idx]) : newVal;
        if (stateSlots[idx] !== nextVal) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setState];
    },
    useRef: (initial: any) => {
      const idx = refIndex++;
      if (refSlots.length <= idx) refSlots.push({ current: initial });
      return refSlots[idx];
    },
    useCallback: (fn: any, deps: any[]) => mockHooks.useMemo(() => fn, deps),
    useMemo: (fn: any, deps: any[]) => {
      const idx = memoIndex++;
      const prev = memoSlots[idx];
      const changed = !prev || !deps || deps.some((d, i) => d !== prev.deps[i]);
      if (changed) {
        const value = fn();
        memoSlots[idx] = { value, deps };
        return value;
      }
      return prev.value;
    },
    useEffect: (fn: any, deps: any[]) => {
      const idx = effectIndex++;
      const prev = effectSlots[idx];
      const hasChanged = !prev || !deps || deps.some((d, i) => d !== prev?.deps[i]);
      effectSlots[idx] = { fn, deps, hasChanged, cleanup: prev?.cleanup };
    },
    useContext: (context: React.Context<any>) => (context as any)._currentValue,
    useSyncExternalStore: (_subscribe: any, getSnapshot: () => any) => getSnapshot(),
  };

  function scheduleRender() {
    if (isRendering) {
      hasPendingRender = true;
      return;
    }
    render();
  }

  function render() {
    if (isRendering) return;
    isRendering = true;
    try {
      do {
        hasPendingRender = false;
        slotIndex = 0;
        effectIndex = 0;
        refIndex = 0;
        memoIndex = 0;
        const internals = (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
        const prevDispatcher = internals ? internals.H : null;
        if (internals) internals.H = mockHooks;
        try {
          result = hookFn();
        } finally {
          if (internals) internals.H = prevDispatcher;
        }
        for (const eff of effectSlots) {
          if (eff.hasChanged) {
            eff.hasChanged = false;
            if (typeof eff.cleanup === 'function') eff.cleanup();
            eff.cleanup = eff.fn();
          }
        }
      } while (hasPendingRender);
    } finally {
      isRendering = false;
    }
  }

  render();

  return {
    get result() {
      return { current: result };
    },
    rerender: () => render(),
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') eff.cleanup();
      }
    },
  };
}

async function act(callback: () => Promise<void> | void): Promise<void> {
  await callback();
}

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
    title,
    label,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) return null;
    const resolvedStyle =
      typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(title ? { 'data-title': title } : {}),
        ...(label ? { 'data-label': label } : {}),
        ...(onPress ? { 'data-pressable': 'true', onClick: onPress } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      title || label,
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    parallel: (anims: any[]) => ({
      start: (cb?: any) => {
        anims.forEach((a) => a?.start?.());
        cb?.();
      },
    }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
}));

mock.module('@expo-google-fonts/geist', () => ({ useFonts: () => [true] }));
mock.module('@expo-google-fonts/geist-mono', () => ({ useFonts: () => [true] }));
mock.module('../constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('../../constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('../context/UiDensityContext', () => ({
  useUiDensity: () => ({ multiplier: 1, headerHeight: 64, sidebarWidth: 240 }),
}));
mock.module('../../context/UiDensityContext', () => ({
  useUiDensity: () => ({ multiplier: 1, headerHeight: 64, sidebarWidth: 240 }),
}));
mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {} }),
  useRoute: () => ({ params: {} }),
}));
mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({ isWorkstation: true, isMobile: false, width: 1280 }),
}));
mock.module('../../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({ isWorkstation: true, isMobile: false, width: 1280 }),
}));

const staffList = [
  { id: 'staff-curr', firstName: 'Juan', lastName: 'Luna', title: 'Dr.', role: 'Doctor' },
  { id: 'staff-2', firstName: 'Maria', lastName: 'Santos', title: 'Nurse', role: 'Nurse' },
];
mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ current: staffList[0], staff: staffList }),
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
}));
mock.module('../../context/StaffContext', () => ({
  useStaff: () => ({ current: staffList[0], staff: staffList }),
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
}));
mock.module('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Admin', clinicId: 'c1' }, can: () => true }),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-curr', name: 'Dr. Juan Luna', role: 'Admin', clinicId: 'c1' }, can: () => true }),
}));
mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({ facilityName: 'St. Luke Clinic', license: { clinicId: 'c1' }, rooms: [{ id: 'r1', name: 'Pharmacy', isActive: true }] }),
}));
mock.module('../../context/ClinicContext', () => ({
  useClinic: () => ({ facilityName: 'St. Luke Clinic', license: { clinicId: 'c1' }, rooms: [{ id: 'r1', name: 'Pharmacy', isActive: true }] }),
}));

let mockActiveConversationId: string | undefined = undefined;
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    isChatDrawerOpen: true,
    closeChatDrawer: () => {},
    activeConversationId: mockActiveConversationId,
    setActiveConversationId: (id?: string) => { mockActiveConversationId = id; },
  }),
}));
mock.module('../../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    isChatDrawerOpen: true,
    closeChatDrawer: () => {},
    activeConversationId: mockActiveConversationId,
    setActiveConversationId: (id?: string) => { mockActiveConversationId = id; },
  }),
}));

const notifyHistory: Array<{ level: string; msg: string }> = [];
const realFeedback = await import('../utils/feedback');
mock.module('../utils/feedback', () => ({
  ...realFeedback,
  notify: {
    ...realFeedback.notify,
    success: (msg: string) => notifyHistory.push({ level: 'success', msg }),
    error: (msg: string) => notifyHistory.push({ level: 'error', msg }),
    info: (msg: string) => notifyHistory.push({ level: 'info', msg }),
  },
}));
mock.module('../../utils/feedback', () => ({
  ...realFeedback,
  notify: {
    ...realFeedback.notify,
    success: (msg: string) => notifyHistory.push({ level: 'success', msg }),
    error: (msg: string) => notifyHistory.push({ level: 'error', msg }),
    info: (msg: string) => notifyHistory.push({ level: 'info', msg }),
  },
}));

let chimeCount = 0;
mock.module('../utils/alertSounds', () => ({
  playMessageChime: () => { chimeCount += 1; },
}));
mock.module('../../utils/alertSounds', () => ({
  playMessageChime: () => { chimeCount += 1; },
}));

let events = new CommsEventEmitter();
let mockConversations: any[] = [];
let mockUnreadCountOverride: number | null = null;
let mockActiveHookConv: any = null;
let mockActiveMessages: any[] = [];
let mockTriageItems: any[] = [];
const markReadCalls: string[] = [];
const muteCalls: Array<{ id: string; isMuted: boolean }> = [];
const createConversationCalls: any[] = [];
let capturedChatDrawerProps: any = null;
let capturedMessageThreadProps: any = null;
let capturedNewConvModalProps: any = null;
const sendMessageCalls: any[] = [];
const resendMessageCalls: string[] = [];
let refreshConversationsCount = 0;
let refreshTriageCount = 0;

mock.module('@clinicez/comms-sdk/react', () => ({
  CommsContext: React.createContext<any>(null),
  useComms: () => ({
    status: 'connected',
    reconnect: async () => {},
    isReconnecting: false,
    activeTicket: { ticket: 'ticket-test' },
    client: { events },
  }),
  useConversations: () => ({
    conversations: mockConversations,
    unreadCount:
      mockUnreadCountOverride ??
      mockConversations.reduce((s, c) => s + (c.unreadCount || 0), 0),
    isLoading: false,
    error: null,
    refresh: async () => {
      refreshConversationsCount++;
    },
    createConversation: async (req: any) => {
      createConversationCalls.push(req);
      return { id: 'conv-created-1', ...req };
    },
    markConversationRead: async (id: string) => {
      markReadCalls.push(id);
    },
    setConversationMuted: async (id: string, isMuted: boolean) => {
      muteCalls.push({ id, isMuted });
    },
  }),
  useConversation: (id: string) => ({
    conversation: mockActiveHookConv ?? mockConversations.find((c) => c.id === id) ?? {
      id,
      scope: 'Facility',
      status: 'Open',
      title: 'Test Thread',
      participants: [],
    },
    messages: mockActiveMessages,
    isLoading: false,
    error: null,
    acknowledgeMessage: async () => {},
  }),
  useSendMessage: () => ({
    sendMessage: async (req: any) => {
      sendMessageCalls.push(req);
    },
    resendMessage: async (msgId: string) => {
      resendMessageCalls.push(msgId);
    },
  }),
  useTriageQueue: () => ({
    items: mockTriageItems,
    pendingCount: mockTriageItems.length,
    urgentCount: 0,
    isLoading: false,
    error: null,
    refresh: async () => {
      refreshTriageCount++;
    },
    answerRequest: async () => {},
    requestVisit: async () => {},
    declineRequest: async () => {},
    routeToStaff: async () => {},
  }),
}));

const { ChatDrawer: RealChatDrawer } = await import('../../../packages/comms-sdk/src/native-ui/ChatDrawer');
const { MessageThread: RealMessageThread } = await import('../../../packages/comms-sdk/src/native-ui/MessageThread');
const { AttachmentPreviewModal: RealAttachmentPreviewModal } = await import('../../../packages/comms-sdk/src/native-ui/AttachmentPreviewModal');
const { TriageQueueView: RealTriageQueueView } = await import('../../../packages/comms-sdk/src/native-ui/TriageQueueView');
const { CallWaitingRoom: RealCallWaitingRoom } = await import('../../../packages/comms-sdk/src/native-ui/CallWaitingRoom');
const { CallStage: RealCallStage } = await import('../../../packages/comms-sdk/src/native-ui/CallStage');

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: (props: any) => {
    capturedChatDrawerProps = props;
    return React.createElement(RealChatDrawer, props);
  },
  MessageThread: (props: any) => {
    capturedMessageThreadProps = props;
    return React.createElement(RealMessageThread, props);
  },
  AttachmentPreviewModal: RealAttachmentPreviewModal,
  TriageQueueView: RealTriageQueueView,
  CallWaitingRoom: RealCallWaitingRoom,
  CallStage: RealCallStage,
}));

mock.module('../components/comms/NewConversationModal', () => ({
  default: (props: any) => {
    capturedNewConvModalProps = props;
    return null;
  },
}));

const { default: ClinicChatDrawerHost } = await import('../components/comms/ClinicChatDrawerHost');
const { default: ClinicActiveThread } = await import('../components/comms/ClinicActiveThread');

function collectElementsByType(node: any, results: any[] = []): any[] {
  if (!node || typeof node !== 'object') return results;
  if (Array.isArray(node)) {
    for (const child of node) collectElementsByType(child, results);
    return results;
  }
  results.push(node);
  if (node.props?.children) {
    collectElementsByType(node.props.children, results);
  }
  return results;
}

describe('Comms Drawer Archive, Unread Reset, Mute Suppression & Department Guard (#212, #158, #182)', () => {
  beforeEach(() => {
    events = new CommsEventEmitter();
    mockUnreadCountOverride = null;
    mockActiveConversationId = undefined;
    mockActiveHookConv = null;
    mockActiveMessages = [];
    mockTriageItems = [];
    markReadCalls.length = 0;
    muteCalls.length = 0;
    createConversationCalls.length = 0;
    notifyHistory.length = 0;
    chimeCount = 0;
    capturedChatDrawerProps = null;
    capturedMessageThreadProps = null;
    capturedNewConvModalProps = null;
    sendMessageCalls.length = 0;
    resendMessageCalls.length = 0;
    refreshConversationsCount = 0;
    refreshTriageCount = 0;
    mockConversations = [
      {
        id: 'conv-direct-open',
        scope: 'Direct',
        status: 'Submitted',
        title: 'Dr. Maria Santos',
        unreadCount: 2,
        participants: [
          { id: 'staff-curr', userId: 'staff-curr', participantId: 'staff-curr', isMuted: false },
        ],
      },
      {
        id: 'conv-care-team',
        scope: 'StaffContext',
        contextType: 'Patient',
        contextId: 'pat-42',
        status: 'Submitted',
        title: 'Care Team: Juan Dela Cruz',
        unreadCount: 1,
        participants: [
          { id: 'staff-curr', userId: 'staff-curr', participantId: 'staff-curr', isMuted: true },
        ],
      },
      {
        id: 'conv-teleconsult-call',
        scope: 'StaffContext',
        contextType: 'TeleconsultCall',
        contextId: 'call-999',
        status: 'Submitted',
        title: 'Teleconsult Chat: Juan Dela Cruz',
        unreadCount: 4,
        participants: [],
      },
      {
        id: 'conv-archived-1',
        scope: 'Facility',
        contextType: 'Department',
        contextId: 'Pharmacy',
        status: 'Closed',
        title: 'Pharmacy Channel (Old)',
        unreadCount: 0,
        participants: [],
      },
    ];
  });

  afterEach(() => {
    mockUnreadCountOverride = null;
    mockActiveConversationId = undefined;
    mockActiveHookConv = null;
    mockActiveMessages = [];
    mockTriageItems = [];
  });

  test('#212 + #213: excludes TeleconsultCall and Closed from All/StaffContext, and shows only Closed under Archived', async () => {
    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());

    // Render with default 'All' scope
    renderToStaticMarkup(harness.result.current);
    expect(capturedChatDrawerProps).not.toBeNull();
    const allIds = capturedChatDrawerProps.items.map((i: any) => i.id);
    expect(allIds).toEqual(['conv-direct-open', 'conv-care-team']);
    expect(allIds).not.toContain('conv-teleconsult-call');
    expect(allIds).not.toContain('conv-archived-1');

    // Switch to 'StaffContext' -> Care Team visible, TeleconsultCall excluded
    await act(async () => {
      capturedChatDrawerProps.onSelectScope('StaffContext');
    });
    renderToStaticMarkup(harness.result.current);
    expect(capturedChatDrawerProps.items.map((i: any) => i.id)).toEqual(['conv-care-team']);

    // Switch to 'Archived' -> only Closed thread shown with isArchived: true
    await act(async () => {
      capturedChatDrawerProps.onSelectScope('Archived');
    });
    renderToStaticMarkup(harness.result.current);
    expect(capturedChatDrawerProps.items.map((i: any) => i.id)).toEqual(['conv-archived-1']);
    expect(capturedChatDrawerProps.items[0].isArchived).toBe(true);

    harness.unmount();
  });

  test('#212: ClinicActiveThread hides speed pills and renders read-only archived banner when status is Closed', () => {
    const closedConv = {
      id: 'conv-archived-1',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'Facility' as const,
      kind: 'General' as const,
      title: 'Pharmacy Channel (Old)',
      status: 'Closed' as const,
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 1,
      lastSeq: 1,
      createdAtUtc: '2026-11-10T00:00:00Z',
      createdBy: 'staff-curr',
      participants: [],
    };
    mockActiveHookConv = closedConv;

    const html = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: 'conv-archived-1',
        initialConversation: closedConv,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );

    expect(html).not.toContain('+ Vitals Charted');
    expect(capturedMessageThreadProps.isArchived).toBe(true);
    expect(html).toContain('This conversation is closed and archived. Message history is read-only.');
  });

  test('#158: calls markConversationRead on open and suppresses messageReceived chime for muted threads and own messages', async () => {
    mockActiveConversationId = 'conv-direct-open';
    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());

    // Opening drawer with activeConversationId calls markConversationRead
    expect(markReadCalls).toEqual(['conv-direct-open']);

    // Incoming message from ANOTHER staff in an UNMUTED conversation -> plays chime
    events.emit('messageReceived', {
      messageId: 'm1',
      conversationId: 'conv-direct-open',
      seq: 1,
      clientMessageId: null,
      senderType: 'Staff',
      senderId: 'staff-2',
      senderDisplayName: 'Nurse Maria Santos',
      contentText: 'Hello doc',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Received',
      sentAtUtc: new Date().toISOString(),
    });
    expect(chimeCount).toBe(1);

    // Own message -> skipped
    events.emit('messageReceived', {
      messageId: 'm2',
      conversationId: 'conv-direct-open',
      seq: 2,
      clientMessageId: null,
      senderType: 'Staff',
      senderId: 'staff-curr',
      senderDisplayName: 'Dr. Juan Luna',
      contentText: 'My own reply',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Received',
      sentAtUtc: new Date().toISOString(),
    });
    expect(chimeCount).toBe(1);

    // Incoming message from another staff in a MUTED conversation ('conv-care-team') -> skipped
    events.emit('messageReceived', {
      messageId: 'm3',
      conversationId: 'conv-care-team',
      seq: 3,
      clientMessageId: null,
      senderType: 'Staff',
      senderId: 'staff-2',
      senderDisplayName: 'Nurse Maria Santos',
      contentText: 'Muted thread ping',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Received',
      sentAtUtc: new Date().toISOString(),
    });
    expect(chimeCount).toBe(1);

    harness.unmount();
  });

  test('#158: ClinicActiveThread syncs muted state from participant and persists toggle via onToggleMute', async () => {
    const mutedConv = {
      id: 'conv-care-team',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'StaffContext' as const,
      kind: 'General' as const,
      title: 'Care Team: Juan Dela Cruz',
      status: 'Submitted' as const,
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 0,
      lastSeq: 0,
      createdAtUtc: '2026-11-10T00:00:00Z',
      createdBy: 'staff-curr',
      participants: [
        {
          id: 'p1',
          userId: 'staff-curr',
          participantId: 'staff-curr',
          displayName: 'Dr. Juan Luna',
          role: 'Owner',
          joinedAtUtc: '2026-11-10T00:00:00Z',
          isMuted: true,
        },
      ],
    };
    mockActiveHookConv = mutedConv;
    const toggleCalls: boolean[] = [];

    const harness = createClinicHookHarness(() =>
      ClinicActiveThread({
        conversationId: 'conv-care-team',
        initialConversation: mutedConv,
        initialActionMenuOpen: true,
        onBack: () => {},
        currentUserId: 'staff-curr',
        onToggleMute: async (nextMuted: boolean) => {
          toggleCalls.push(nextMuted);
        },
      }),
    );

    const nodes = collectElementsByType(harness.result.current);
    const unmuteBtn = nodes.find((n) => n.props?.accessibilityLabel === 'Unmute channel');
    expect(unmuteBtn).toBeDefined();

    await act(async () => {
      await unmuteBtn.props.onPress();
    });

    expect(toggleCalls).toEqual([false]);
    harness.unmount();
  });

  test('#182: ClinicChatDrawerHost maps Facility department & StaffContext patientId on createConversation, and guards View Patient Chart', async () => {
    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(harness.result.current);

    expect(capturedNewConvModalProps).not.toBeNull();
    await act(async () => {
      await capturedNewConvModalProps.onCreateConversation({
        scope: 'Facility',
        title: 'Pharmacy Channel',
        department: 'Pharmacy',
      });
    });

    expect(createConversationCalls[0]).toEqual({
      scope: 'Facility',
      title: 'Pharmacy Channel',
      contextType: 'Department',
      contextId: 'Pharmacy',
      department: 'Pharmacy',
      participantStaffIds: undefined,
      participants: undefined,
    });

    await act(async () => {
      await capturedNewConvModalProps.onCreateConversation({
        scope: 'StaffContext',
        title: 'Care Team: Juan',
        patientId: 'pat-42',
      });
    });

    expect(createConversationCalls[1]).toEqual({
      scope: 'StaffContext',
      title: 'Care Team: Juan',
      contextType: 'Patient',
      contextId: 'pat-42',
      department: undefined,
      participantStaffIds: undefined,
      participants: undefined,
    });
    harness.unmount();

    // Chart guard: Facility Department channel MUST NOT invoke onOpenPatientChart('Pharmacy')
    const facilityConv = {
      id: 'conv-fac-pharm',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'Facility' as const,
      kind: 'General' as const,
      title: 'Pharmacy Channel',
      contextType: 'Department',
      contextId: 'Pharmacy',
      status: 'Submitted' as const,
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 0,
      lastSeq: 0,
      createdAtUtc: '2026-11-10T00:00:00Z',
      createdBy: 'staff-curr',
      participants: [],
    };
    mockActiveHookConv = facilityConv;
    const openedCharts: string[] = [];

    const facHarness = createClinicHookHarness(() =>
      ClinicActiveThread({
        conversationId: 'conv-fac-pharm',
        initialConversation: facilityConv,
        initialActionMenuOpen: true,
        onBack: () => {},
        currentUserId: 'staff-curr',
        onOpenPatientChart: (pid) => openedCharts.push(pid),
      }),
    );
    const facNodes = collectElementsByType(facHarness.result.current);
    const chartBtn = facNodes.find((n) => n.props?.accessibilityLabel === 'View patient chart');
    expect(chartBtn).toBeDefined();
    await act(async () => {
      chartBtn.props.onPress();
    });
    expect(openedCharts).toEqual([]);
    expect(notifyHistory.some((n) => n.msg.includes('not linked to an individual patient record'))).toBe(true);
    facHarness.unmount();

    // StaffContext Care Team channel SHOULD invoke onOpenPatientChart('pat-42')
    const careConv = {
      ...facilityConv,
      id: 'conv-care-42',
      scope: 'StaffContext' as const,
      contextType: 'Patient',
      contextId: 'pat-42',
    };
    mockActiveHookConv = careConv;
    const careHarness = createClinicHookHarness(() =>
      ClinicActiveThread({
        conversationId: 'conv-care-42',
        initialConversation: careConv,
        initialActionMenuOpen: true,
        onBack: () => {},
        currentUserId: 'staff-curr',
        onOpenPatientChart: (pid) => openedCharts.push(pid),
      }),
    );
    const careNodes = collectElementsByType(careHarness.result.current);
    const careChartBtn = careNodes.find((n) => n.props?.accessibilityLabel === 'View patient chart');
    await act(async () => {
      careChartBtn.props.onPress();
    });
    expect(openedCharts).toEqual(['pat-42']);
    careHarness.unmount();
  });

  test('#212: ClinicChatDrawerHost excludes Closed and TeleconsultCall from Conversations tab unread badge and drops unread count on Close & Archive', async () => {
    mockConversations = [
      ...mockConversations.map((c) =>
        c.id === 'conv-archived-1' ? { ...c, unreadCount: 5 } : c
      ),
    ];

    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(harness.result.current);
    const nodes = collectElementsByType(harness.result.current);
    const convTab = nodes.find(
      (n) => n.props?.accessibilityRole === 'tab' && n.props?.accessibilityState?.selected === true
    );
    expect(convTab).toBeDefined();

    // Active unread = conv-direct-open (2) + conv-care-team (1) = 3 (excludes conv-teleconsult-call=4 and conv-archived-1=5)
    const tabHtml = renderToStaticMarkup(convTab);
    expect(tabHtml).toContain('Conversations');
    expect(tabHtml).toContain('>3<');
    expect(tabHtml).not.toContain('>12<');

    // Open conv-direct-open and trigger Close & Archive -> activeUnreadCount drops from 3 to 1 immediately
    await act(async () => {
      capturedChatDrawerProps.onSelectConversation('conv-direct-open');
    });
    harness.rerender();
    const threadNodes = collectElementsByType(harness.result.current);
    const activeThreadEl = threadNodes.find((n) => typeof n.props?.onCloseAndArchive === 'function');
    expect(activeThreadEl).toBeDefined();

    const originalFetch = globalThis.fetch;
    const prevCommsUrl = process.env.EXPO_PUBLIC_COMMS_API_URL;
    process.env.EXPO_PUBLIC_COMMS_API_URL = 'https://comms.local';
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: true }), { status: 200 })) as any;
    try {
      await act(async () => {
        await activeThreadEl.props.onCloseAndArchive('conv-direct-open');
      });
    } finally {
      globalThis.fetch = originalFetch;
      if (prevCommsUrl === undefined) {
        delete process.env.EXPO_PUBLIC_COMMS_API_URL;
      } else {
        process.env.EXPO_PUBLIC_COMMS_API_URL = prevCommsUrl;
      }
    }

    harness.rerender();
    const updatedNodes = collectElementsByType(harness.result.current);
    const updatedTab = updatedNodes.find((n) => n.props?.accessibilityRole === 'tab');
    const updatedTabHtml = renderToStaticMarkup(updatedTab);
    expect(updatedTabHtml).toContain('>1<');
    harness.unmount();
  });

  test('#212: ClinicChatDrawerHost renders "No Archived Conversations" without CTA and supports search inside Archived scope', async () => {
    // 1. Empty Archived state without Start Conversation CTA
    mockConversations = mockConversations.filter((c) => c.status !== 'Closed');
    const emptyHarness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(emptyHarness.result.current);

    await act(async () => {
      capturedChatDrawerProps.onSelectScope('Archived');
    });
    const emptyHtml = renderToStaticMarkup(emptyHarness.result.current);
    expect(emptyHtml).toContain('No Archived Conversations');
    expect(emptyHtml).not.toContain('Start Conversation');
    emptyHarness.unmount();

    // 2. Search within Archived scope
    mockConversations = [
      {
        id: 'conv-arch-pharm',
        scope: 'Facility',
        status: 'Closed',
        title: 'Pharmacy Shift Archive',
        lastMessageSnippet: 'Stock verified',
        unreadCount: 0,
        participants: [],
      },
      {
        id: 'conv-arch-lab',
        scope: 'Facility',
        status: 'Closed',
        title: 'Lab Handoff Archive',
        lastMessageSnippet: 'Specimen processed',
        unreadCount: 0,
        participants: [],
      },
    ];
    const searchHarness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(searchHarness.result.current);
    await act(async () => {
      capturedChatDrawerProps.onSelectScope('Archived');
      capturedChatDrawerProps.onSearchChange('Pharmacy');
    });
    renderToStaticMarkup(searchHarness.result.current);
    expect(capturedChatDrawerProps.items.map((i: any) => i.id)).toEqual(['conv-arch-pharm']);
    searchHarness.unmount();
  });

  test('#212: ClinicActiveThread renders Closed / Archived badge, hides Close & Archive, and passes isReadOnly & readOnlyBanner even if hookConv is stale', () => {
    const staleHookConv = {
      id: 'conv-stale-arch',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'Facility' as const,
      kind: 'General' as const,
      title: 'Triage Channel',
      status: 'Submitted' as const,
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 1,
      lastSeq: 1,
      createdAtUtc: '2026-11-10T00:00:00Z',
      createdBy: 'staff-curr',
      participants: [],
    };
    mockActiveHookConv = staleHookConv;

    const closedInitialConv = { ...staleHookConv, status: 'Closed' as const };
    const html = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: 'conv-stale-arch',
        initialConversation: closedInitialConv,
        initialActionMenuOpen: true,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );

    expect(html).toContain('Closed / Archived');
    expect(html).not.toContain('+ Vitals Charted');
    expect(html).not.toContain('Close &amp; Archive');
    expect(html).not.toContain('Close & Archive');
    expect(capturedMessageThreadProps.isReadOnly).toBe(true);
    expect(capturedMessageThreadProps.isArchived).toBe(true);
    expect(capturedMessageThreadProps.readOnlyBanner).toBeDefined();
    expect(html).toContain('This conversation is closed and archived. Message history is read-only.');
  });

  test('#212: ClinicChatDrawerHost falls back to unreadCount when conversations is empty, while preserving R4 exclusions for Closed and TeleconsultCall', () => {
    // 1. Empty conversations + unreadCount fallback -> renders >5< on Conversations tab
    mockConversations = [];
    mockUnreadCountOverride = 5;

    const fallbackHarness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(fallbackHarness.result.current);
    const fallbackNodes = collectElementsByType(fallbackHarness.result.current);
    const fallbackConvTab = fallbackNodes.find(
      (n) => n.props?.accessibilityRole === 'tab' && n.props?.accessibilityState?.selected === true
    );
    expect(fallbackConvTab).toBeDefined();
    const fallbackTabHtml = renderToStaticMarkup(fallbackConvTab);
    expect(fallbackTabHtml).toContain('Conversations');
    expect(fallbackTabHtml).toContain('>5<');
    fallbackHarness.unmount();

    // 2. Non-empty conversations containing only Closed (5) and TeleconsultCall (4) with unreadCount: 9 -> renders 0 (no badge)
    mockConversations = [
      {
        id: 'conv-only-closed',
        scope: 'Facility',
        status: 'Closed',
        title: 'Closed Thread',
        unreadCount: 5,
        participants: [],
      },
      {
        id: 'conv-only-teleconsult',
        scope: 'StaffContext',
        contextType: 'TeleconsultCall',
        contextId: 'call-101',
        status: 'Submitted',
        title: 'Teleconsult Chat',
        unreadCount: 4,
        participants: [],
      },
    ];
    mockUnreadCountOverride = 9;

    const excludedHarness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(excludedHarness.result.current);
    const excludedNodes = collectElementsByType(excludedHarness.result.current);
    const excludedConvTab = excludedNodes.find(
      (n) => n.props?.accessibilityRole === 'tab' && n.props?.accessibilityState?.selected === true
    );
    expect(excludedConvTab).toBeDefined();
    const excludedTabHtml = renderToStaticMarkup(excludedConvTab);
    expect(excludedTabHtml).toContain('Conversations');
    expect(excludedTabHtml).not.toContain('>9<');
    expect(excludedTabHtml).not.toContain('>5<');
    expect(excludedTabHtml).not.toContain('>4<');
    expect(excludedTabHtml).not.toContain('>0<');
    excludedHarness.unmount();
  });

  test('#282: ClinicActiveThread disables composer, quick chips, and sendMessage for all terminal statuses and closedAtUtc != null', async () => {
    const cases = [
      { status: 'Answered' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'Conversation closed (Answered). Message history is read-only.' },
      { status: 'NeedsVisit' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'Conversation closed (Needs Visit). Message history is read-only.' },
      { status: 'Declined' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'Conversation closed (Declined). Message history is read-only.' },
      { status: 'Resolved' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'Conversation closed (Resolved). Message history is read-only.' },
      { status: 'Closed' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'This conversation is closed and archived. Message history is read-only.' },
      { status: 'Submitted' as const, closedAtUtc: '2026-11-25T08:00:00Z', expectedText: 'Conversation closed (Closed). Message history is read-only.' },
    ];

    for (const c of cases) {
      sendMessageCalls.length = 0;
      const conv = {
        id: `conv-term-${c.status}`,
        tenantId: 't1',
        facilityId: 'c1',
        scope: 'PatientFacility' as const,
        kind: 'PatientTriage' as const,
        title: 'Patient Inquiry',
        patientId: '00000000-0000-0000-0000-000000000111',
        status: c.status,
        closedAtUtc: c.closedAtUtc,
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 2,
        lastSeq: 2,
        createdAtUtc: '2026-11-25T00:00:00Z',
        createdBy: 'patient-1',
        participants: [],
      };
      mockActiveHookConv = conv;

      const html = renderToStaticMarkup(
        React.createElement(ClinicActiveThread, {
          conversationId: conv.id,
          initialConversation: conv,
          initialActionMenuOpen: true,
          onBack: () => {},
          currentUserId: 'staff-curr',
        }),
      );

      expect(html).not.toContain('+ Vitals Charted');
      expect(html).not.toContain('+ On My Way');
      expect(html).not.toContain('Type message...');
      expect(html).not.toContain('Close &amp; Archive');
      expect(html).not.toContain('Post to Thread');
      expect(html).toContain(c.expectedText);
      expect(capturedMessageThreadProps.isReadOnly).toBe(true);
      expect(capturedMessageThreadProps.isArchived).toBe(true);

      // Even if invoked programmatically, send/resend are blocked so no SignalR HubException can fire
      await capturedMessageThreadProps.onSendMessage('Should not send', false);
      await capturedMessageThreadProps.onResendMessage('msg-1');
      expect(sendMessageCalls.length).toBe(0);
      expect(resendMessageCalls.length).toBe(0);
    }
  });

  test('#282: Reopen Conversation button is wired to ReopenConversationCommand and hides when ineligible', async () => {
    const patientId = '11111111-1111-1111-1111-111111111111';
    const answeredConv = {
      id: 'conv-answered-reopen',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'PatientFacility' as const,
      kind: 'PatientTriage' as const,
      title: 'Juan Dela Cruz',
      patientId,
      status: 'Answered' as const,
      triageDisposition: 'Answered' as const,
      closedAtUtc: '2026-11-25T08:00:00Z',
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      grantWindowEndUtc: '2099-01-01T00:00:00Z',
      messageCount: 2,
      lastSeq: 2,
      createdAtUtc: '2026-11-25T00:00:00Z',
      createdBy: 'patient-1',
      participants: [],
    };
    mockActiveHookConv = answeredConv;

    const reopenedEvents: any[] = [];
    events.on('conversationUpdated', (payload) => reopenedEvents.push(payload));

    const fetchCalls: Array<{ url: string; method?: string; body: any }> = [];
    const originalFetch = globalThis.fetch;
    const prevCommsUrl = process.env.EXPO_PUBLIC_COMMS_API_URL;
    process.env.EXPO_PUBLIC_COMMS_API_URL = 'https://comms.local';
    globalThis.fetch = (async (url: string, init?: any) => {
      const parsedBody = init?.body ? JSON.parse(init.body) : null;
      fetchCalls.push({ url, method: init?.method, body: parsedBody });
      return new Response(
        JSON.stringify({
          ...answeredConv,
          status: 'WithTriage',
          triageDisposition: null,
          closedAtUtc: null,
          reopenCount: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;

    try {
      const reopenCallbacks: any[] = [];
      const harness = createClinicHookHarness(() =>
        ClinicActiveThread({
          conversationId: answeredConv.id,
          initialConversation: answeredConv,
          onBack: () => {},
          currentUserId: 'staff-curr',
          onReopenConversation: (conv) => {
            reopenCallbacks.push(conv);
          },
        }),
      );

      const initialHtml = renderToStaticMarkup(harness.result.current);
      expect(initialHtml).toContain('Reopen Conversation');
      expect(initialHtml).not.toContain('+ Vitals Charted');

      const bannerNodes = collectElementsByType(capturedMessageThreadProps.readOnlyBanner);
      const reopenBtn = bannerNodes.find((n) => n.props?.accessibilityLabel === 'Reopen conversation');
      expect(reopenBtn).toBeDefined();

      await act(async () => {
        await reopenBtn.props.onPress();
      });

      expect(fetchCalls.length).toBe(1);
      expect(fetchCalls[0].url).toBe('https://comms.local/api/v1/comms/conversations/conv-answered-reopen/reopen');
      expect(fetchCalls[0].method).toBe('POST');
      expect(fetchCalls[0].body).toEqual({
        patientId,
        isEmergencyConfirmed: false,
        reason: 'Reopened by clinic staff for follow-up',
        isStaffReopen: true,
      });
      expect(reopenedEvents.some((e) => e.id === 'conv-answered-reopen' && e.status === 'WithTriage')).toBe(true);
      expect(reopenCallbacks.length).toBe(1);

      const reopenedHtml = renderToStaticMarkup(harness.result.current);
      expect(reopenedHtml).toContain('+ Vitals Charted');
      expect(reopenedHtml).toContain('Type message...');
      expect(capturedMessageThreadProps.isReadOnly).toBe(false);
      harness.unmount();
    } finally {
      globalThis.fetch = originalFetch;
      if (prevCommsUrl === undefined) {
        delete process.env.EXPO_PUBLIC_COMMS_API_URL;
      } else {
        process.env.EXPO_PUBLIC_COMMS_API_URL = prevCommsUrl;
      }
    }

    // Ineligible cases must NOT render Reopen Conversation button:
    // 1. Reopen limit already reached (reopenCount >= 1)
    const limitReachedConv = { ...answeredConv, reopenCount: 1 };
    mockActiveHookConv = limitReachedConv;
    const limitHtml = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: limitReachedConv.id,
        initialConversation: limitReachedConv,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );
    expect(limitHtml).not.toContain('Reopen Conversation');

    // 2. Expired grant window
    const expiredGrantConv = { ...answeredConv, grantWindowEndUtc: '2020-01-01T00:00:00Z' };
    mockActiveHookConv = expiredGrantConv;
    const expiredHtml = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: expiredGrantConv.id,
        initialConversation: expiredGrantConv,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );
    expect(expiredHtml).not.toContain('Reopen Conversation');

    // 3. Non-triage Facility thread without patientId
    const facilityClosedConv = {
      ...answeredConv,
      scope: 'Facility' as const,
      patientId: null,
      status: 'Closed' as const,
    };
    mockActiveHookConv = facilityClosedConv;
    const facilityHtml = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: facilityClosedConv.id,
        initialConversation: facilityClosedConv,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );
    expect(facilityHtml).not.toContain('Reopen Conversation');
  });

  test('#282: ClinicChatDrawerHost treats terminal triage threads as archived and excludes their unread counts', async () => {
    mockConversations = [
      {
        id: 'conv-open-1',
        scope: 'Direct',
        status: 'Submitted',
        title: 'Open Thread',
        unreadCount: 2,
        participants: [],
      },
      {
        id: 'conv-answered-1',
        scope: 'PatientFacility',
        status: 'Answered',
        closedAtUtc: '2026-11-25T08:00:00Z',
        title: 'Answered Inquiry',
        unreadCount: 3,
        participants: [],
      },
    ];

    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(harness.result.current);

    // Active list excludes Answered thread and active unread badge only counts Open Thread (2)
    expect(capturedChatDrawerProps.items.map((i: any) => i.id)).toEqual(['conv-open-1']);
    const nodes = collectElementsByType(harness.result.current);
    const convTab = nodes.find(
      (n) => n.props?.accessibilityRole === 'tab' && n.props?.accessibilityState?.selected === true,
    );
    expect(renderToStaticMarkup(convTab)).toContain('>2<');

    // Switching to Archived shows the Answered thread with isArchived: true
    await act(async () => {
      capturedChatDrawerProps.onSelectScope('Archived');
    });
    renderToStaticMarkup(harness.result.current);
    expect(capturedChatDrawerProps.items.map((i: any) => i.id)).toEqual(['conv-answered-1']);
    expect(capturedChatDrawerProps.items[0].isArchived).toBe(true);
    harness.unmount();
  });

  test('#284: ClinicChatDrawerHost & ClinicActiveThread display patient name, formatted category, and patient sender label', () => {
    const patientConv = {
      id: 'conv-284-1',
      tenantId: 't1',
      facilityId: 'c1',
      scope: 'PatientFacility' as const,
      kind: 'PatientTriage' as const,
      title: 'PostVisitFollowUp Inquiry',
      category: 'PostVisitFollowUp' as const,
      status: 'WithTriage' as const,
      unreadCount: 1,
      lastMessageSnippet: 'Follow-up after lab test',
      lastMessageAtUtc: '2026-11-25T10:00:00Z',
      createdAtUtc: '2026-11-25T10:00:00Z',
      createdBy: 'patient-justine',
      participants: [
        {
          id: 'p-1',
          userId: 'patient-justine',
          participantId: 'patient-justine',
          participantType: 'Patient',
          displayName: 'Justine Mae Tabasan',
          role: 'Patient',
          joinedAtUtc: '2026-11-25T10:00:00Z',
        },
      ],
    };

    mockConversations = [patientConv];
    mockTriageItems = [
      {
        ...patientConv,
        conversationId: patientConv.id,
        requestId: patientConv.id,
        patientFullName: 'Justine Mae Tabasan',
        patientAge: 'Adult',
        patientSex: 'Female',
        patientContact: '',
        slaTimeRemainingSeconds: 3600,
        isSlaBreached: false,
      },
    ];

    const harness = createClinicHookHarness(() => ClinicChatDrawerHost());
    renderToStaticMarkup(harness.result.current);

    expect(capturedChatDrawerProps.items).toHaveLength(1);
    expect(capturedChatDrawerProps.items[0].title).toBe('Justine Mae Tabasan');
    expect(capturedChatDrawerProps.items[0].subtitle).toBe('Post-Visit Follow-Up');
    expect(capturedChatDrawerProps.items[0].title).not.toContain('PostVisitFollowUp');
    harness.unmount();

    mockActiveHookConv = patientConv;
    mockActiveMessages = [
      {
        messageId: 'm-284-1',
        conversationId: patientConv.id,
        seq: 1,
        clientMessageId: 'm-284-1',
        senderType: 'Patient',
        senderId: 'patient-justine',
        senderDisplayName: 'Patient',
        contentText: 'Good afternoon, checking on my follow-up.',
        visibility: 'Public',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: [],
        deliveryState: 'Received',
        sentAtUtc: '2026-11-25T10:00:00Z',
      },
    ];

    const threadHtml = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: patientConv.id,
        initialConversation: patientConv,
        onBack: () => {},
        currentUserId: 'staff-curr',
      }),
    );

    expect(threadHtml).toContain('Justine Mae Tabasan');
    expect(threadHtml).toContain('Post-Visit Follow-Up');
    expect(threadHtml).not.toContain('PostVisitFollowUp Inquiry');
    expect(capturedMessageThreadProps.messages[0].senderDisplayName).toBe('Justine Mae Tabasan');
  });
});
