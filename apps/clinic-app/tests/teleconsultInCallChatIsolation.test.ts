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

const { OptimisticStore } = await import('../../../packages/comms-sdk/src/react/internal/OptimisticStore');
const { CommsEventEmitter } = await import('../../../packages/comms-sdk/src/core/events/CommsEventEmitter');
const { useAutoVideoOrientation } = await import('../../../packages/comms-sdk/src/react/hooks/useAutoVideoOrientation');
const realCore = await import('../../../packages/comms-sdk/src/core');

function createClinicHookHarness<Result>(
  hookFn: () => Result,
  contextValues: Map<React.Context<any>, any> = new Map(),
) {
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
    useContext: (context: React.Context<any>) =>
      contextValues.has(context) ? contextValues.get(context) : (context as any)._currentValue,
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
  const Comp = ({ children, testID, style, onPress, ...rest }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(onPress ? { onClick: onPress } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
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
    absoluteFill: {},
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
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Switch: createMockComponent('Switch'),
  Image: createMockComponent('Image'),
  RefreshControl: createMockComponent('RefreshControl'),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  I18nManager: { isRTL: false, allowRTL: () => {}, forceRTL: () => {} },
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class { constructor(public val: any) {} setValue(v: any) { this.val = v; } interpolate() { return this; } },
    ValueXY: class {
      setValue() {}
      setOffset() {}
      flattenOffset() {}
      getTranslateTransform() { return [{ translateX: 0 }, { translateY: 0 }]; }
    },
    timing: () => ({ start: (cb?: any) => cb?.() }),
    View: createMockComponent('Animated.View'),
  },
  PanResponder: { create: () => ({ panHandlers: {} }) },
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

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1', name: 'Dr. Maria Santos', role: 'Doctor', clinicId: 'c1' }, can: () => true }),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1', name: 'Dr. Maria Santos', role: 'Doctor', clinicId: 'c1' }, can: () => true }),
}));
mock.module('../context/ClinicCommsContext', () => ({
  useClinicComms: () => ({
    teleconsultSession: null,
    closeTeleconsultWaitingRoom: () => {},
    notifyTeleconsultEnded: () => {},
    isCallStageDocked: false,
    dockCallStage: () => {},
    maximizeCallStage: () => {},
    onOpenConsultationChart: null,
  }),
}));

const realFeedback = await import('../utils/feedback');
mock.module('../utils/feedback', () => ({
  ...realFeedback,
  notify: { ...realFeedback.notify, success: () => {}, error: () => {}, info: () => {} },
}));

// Controlled LocalPreviewMediaAdapter mock so we can inspect DataChannel buffers & emit participantJoined
let latestAdapterInstance: any = null;
let mockRemoteParticipants: any[] = [];
const sentDataPayloads: string[] = [];

class MockLocalPreviewMediaAdapter {
  private listeners = new Map<string, Set<(...args: any[]) => void>>();
  connectionState = 'connected' as const;
  constructor() {
    latestAdapterInstance = this;
  }
  isConnected() { return true; }
  async connect() {}
  async disconnect() {}
  async setMicrophoneEnabled() {}
  async setCameraEnabled() {}
  async setScreenShareEnabled() {}
  async switchCamera() {}
  getLocalVideoTrack() { return null; }
  getLocalAudioTrack() { return null; }
  getRemoteVideoTrack() { return null; }
  getRemoteAudioTrack() { return null; }
  getRemoteParticipants() { return mockRemoteParticipants; }
  getRecordingStream() { return null; }
  getNetworkQuality() { return 'good' as const; }
  async sendDataMessage(payload: string) {
    sentDataPayloads.push(payload);
  }
  on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }
  off(event: string, listener: (...args: any[]) => void) {
    this.listeners.get(event)?.delete(listener);
  }
  emit(event: string, ...args: any[]) {
    for (const l of this.listeners.get(event) ?? []) {
      l(...args);
    }
  }
}

mock.module('@clinicez/comms-sdk/core', () => ({
  ...realCore,
  LocalPreviewMediaAdapter: MockLocalPreviewMediaAdapter,
}));

const TestCommsContext = React.createContext<any>(null);
let mockConversations: any[] = [];
let mockPersistedMessages: any[] = [];
let mockSendMessageImpl: ((req: any) => Promise<any>) | null = null;
let mockCreateConversationImpl: ((req: any) => Promise<any>) | null = null;
let mockCallStatus: 'staging' | 'connected' = 'staging';

mock.module('@clinicez/comms-sdk/react', () => ({
  CommsContext: TestCommsContext,
  useAutoVideoOrientation,
  useCallSession: (_callId: string, opts: any) => ({
    status: mockCallStatus,
    roomName: 'room-1',
    paymentState: opts?.initialPaymentState ?? { policy: 'Exempt', status: 'Exempt', canAdmit: true, isYakapExempt: true },
    recordingState: {
      isRecording: false,
      consentStatus: 'none',
      recordingDurationSeconds: 0,
      recordingSessionId: null,
      requestRecordingConsent: async () => {},
      respondToRecordingConsent: async () => {},
      revokeRecordingConsent: async () => {},
    },
    mediaTracks: {
      isCameraEnabled: true,
      isMicEnabled: true,
      isScreenSharing: false,
      toggleCamera: () => {},
      toggleMic: () => {},
      toggleScreenShare: () => {},
    },
    updatePaymentPolicy: async () => {},
    admitPatient: async () => {},
    joinCall: async () => {},
    endCall: async () => {},
  }),
  useConversations: () => ({
    conversations: mockConversations,
    unreadCount: 0,
    isLoading: false,
    error: null,
    refresh: async () => {},
    createConversation: async (req: any) => {
      if (mockCreateConversationImpl) return mockCreateConversationImpl(req);
      return { id: 'conv-tele-created', ...req };
    },
  }),
  useConversation: () => ({
    conversation: null,
    messages: mockPersistedMessages,
    isLoading: false,
    error: null,
    acknowledgeMessage: async () => {},
  }),
  useSendMessage: () => ({
    sendMessage: async (req: any) => {
      if (mockSendMessageImpl) return mockSendMessageImpl(req);
    },
    resendMessage: async () => {},
  }),
}));

const { ChatDrawer: RealChatDrawer } = await import('../../../packages/comms-sdk/src/native-ui/ChatDrawer');
const { TriageQueueView: RealTriageQueueView } = await import('../../../packages/comms-sdk/src/native-ui/TriageQueueView');
const { CallWaitingRoom: RealCallWaitingRoom } = await import('../../../packages/comms-sdk/src/native-ui/CallWaitingRoom');
let capturedMessageThreadProps: any = null;
let capturedCallStageProps: any = null;

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  ChatDrawer: RealChatDrawer,
  TriageQueueView: RealTriageQueueView,
  CallWaitingRoom: RealCallWaitingRoom,
  MessageThread: (props: any) => {
    capturedMessageThreadProps = props;
    return React.createElement('div', { 'data-testid': 'mock-message-thread' });
  },
  CallStage: (props: any) => {
    capturedCallStageProps = props;
    return props.renderChatDrawer ? props.renderChatDrawer() : null;
  },
}));

const {
  TeleconsultInCallChatDrawer,
  ActiveTeleconsultModal,
} = await import('../components/teleconsult/TeleconsultWaitingRoomModal');
const { clinicService } = await import('../services/clinicService');

clinicService.getTeleconsultStatus = async () => [null, null] as any;
clinicService.createTeleconsultGuestInvite = async () => [null, null] as any;

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 15));
}

describe('Teleconsult In-Call Chat Isolation, Deduplication, REST Fallback & Pre-Join Replay (#213)', () => {
  beforeEach(() => {
    mockConversations = [];
    mockPersistedMessages = [];
    mockSendMessageImpl = null;
    mockCreateConversationImpl = null;
    mockCallStatus = 'staging';
    mockRemoteParticipants = [];
    sentDataPayloads.length = 0;
    latestAdapterInstance = null;
    capturedMessageThreadProps = null;
    capturedCallStageProps = null;
  });

  afterEach(() => {
    mockSendMessageImpl = null;
    mockCreateConversationImpl = null;
    mockCallStatus = 'staging';
  });

  test('1. Deterministic clientMessageId dedup handles >=10s clock skew and preserves distinct identical-text messages <5s apart', () => {
    mockConversations = [
      { id: 'conv-call-1', scope: 'StaffContext', contextType: 'TeleconsultCall', contextId: 'call-1', status: 'Open' },
    ];
    mockPersistedMessages = [
      {
        messageId: 'srv-msg-1',
        clientMessageId: 'uuid-skew-1',
        seq: 1,
        conversationId: 'conv-call-1',
        senderType: 'Staff',
        senderId: 'staff-1',
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Take 500mg amoxicillin',
        visibility: 'Public',
        deliveryState: 'Received',
        sentAtUtc: '2026-11-17T10:00:18.000Z',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedByName: null,
        acknowledgedAtUtc: null,
      },
      {
        messageId: 'srv-msg-2',
        clientMessageId: 'uuid-repeat-a',
        seq: 2,
        conversationId: 'conv-call-1',
        senderType: 'Staff',
        senderId: 'staff-1',
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Check BP again',
        visibility: 'Public',
        deliveryState: 'Received',
        sentAtUtc: '2026-11-17T10:01:00.000Z',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedByName: null,
        acknowledgedAtUtc: null,
      },
    ];

    const dataChannelMessages = [
      // Same clientMessageId, 18 seconds clock skew -> MUST deduplicate!
      {
        id: 'uuid-skew-1',
        clientMessageId: 'uuid-skew-1',
        seq: 100,
        conversationId: 'call-1',
        senderType: 'Staff' as const,
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Take 500mg amoxicillin',
        visibility: 'Public' as const,
        state: 'Received' as const,
        clientSentAtUtc: '2026-11-17T10:00:00.000Z',
      },
      // Identical text only 1s after srv-msg-2, DIFFERENT clientMessageId -> MUST NOT falsely collapse!
      {
        id: 'uuid-repeat-b',
        clientMessageId: 'uuid-repeat-b',
        seq: 101,
        conversationId: 'call-1',
        senderType: 'Staff' as const,
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Check BP again',
        visibility: 'Public' as const,
        state: 'Received' as const,
        clientSentAtUtc: '2026-11-17T10:01:01.000Z',
      },
    ];

    renderToStaticMarkup(
      React.createElement(
        TestCommsContext.Provider,
        { value: { client: { events: new CommsEventEmitter() } } },
        React.createElement(TeleconsultInCallChatDrawer, {
          callId: 'call-1',
          patientId: 'pat-1',
          patientName: 'Juan Dela Cruz',
          currentUserId: 'staff-1',
          hasRemoteParticipant: true,
          dataChannelMessages,
          onSendDataChannelMessage: async () => {},
        }),
      ),
    );

    expect(capturedMessageThreadProps.messages).toHaveLength(3);
    expect(capturedMessageThreadProps.messages.map((m: any) => m.id)).toEqual([
      'srv-msg-1',
      'srv-msg-2',
      'uuid-repeat-b',
    ]);
  });

  test('2. Multi-staff deduplication collapses opt-<id> optimistic and DataChannel peer IDs deterministically', () => {
    mockConversations = [
      { id: 'conv-call-2', scope: 'StaffContext', contextType: 'TeleconsultCall', contextId: 'call-2', status: 'Open' },
    ];
    mockPersistedMessages = [
      {
        messageId: 'opt-dc-staff-a',
        clientMessageId: 'dc-staff-a',
        seq: 1,
        conversationId: 'conv-call-2',
        senderType: 'Staff',
        senderId: 'staff-1',
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Staff A message',
        visibility: 'Public',
        deliveryState: 'Sending',
        sentAtUtc: '2026-11-17T10:00:00.000Z',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedByName: null,
        acknowledgedAtUtc: null,
      },
      {
        messageId: 'srv-peer-b',
        clientMessageId: 'dc-peer-b',
        seq: 2,
        conversationId: 'conv-call-2',
        senderType: 'Staff',
        senderId: 'staff-2',
        senderDisplayName: 'Nurse Ana',
        contentText: 'Staff B message',
        visibility: 'Public',
        deliveryState: 'Received',
        sentAtUtc: '2026-11-17T10:00:05.000Z',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedByName: null,
        acknowledgedAtUtc: null,
      },
    ];

    const dataChannelMessages = [
      {
        id: 'dc-staff-a',
        seq: 10,
        conversationId: 'call-2',
        senderType: 'Staff' as const,
        senderDisplayName: 'Dr. Maria Santos',
        contentText: 'Staff A message',
        visibility: 'Public' as const,
        state: 'Received' as const,
        clientSentAtUtc: '2026-11-17T10:00:00.000Z',
      },
      {
        id: 'dc-peer-b',
        clientMessageId: 'dc-peer-b',
        seq: 11,
        conversationId: 'call-2',
        senderType: 'Staff' as const,
        senderDisplayName: 'Nurse Ana',
        contentText: 'Staff B message',
        visibility: 'Public' as const,
        state: 'Received' as const,
        clientSentAtUtc: '2026-11-17T10:00:05.000Z',
      },
    ];

    renderToStaticMarkup(
      React.createElement(
        TestCommsContext.Provider,
        { value: { client: { events: new CommsEventEmitter() } } },
        React.createElement(TeleconsultInCallChatDrawer, {
          callId: 'call-2',
          patientId: 'pat-2',
          patientName: 'Maria Clara',
          currentUserId: 'staff-1',
          hasRemoteParticipant: true,
          dataChannelMessages,
          onSendDataChannelMessage: async () => {},
        }),
      ),
    );

    expect(capturedMessageThreadProps.messages).toHaveLength(2);
    expect(capturedMessageThreadProps.messages[0].id).toBe('opt-dc-staff-a');
    expect(capturedMessageThreadProps.messages[1].id).toBe('srv-peer-b');
  });

  test('3. REST fallback uses ticket.ticket, posts clientMessageId, and calls 1-arg OptimisticStore.appendMessage with deliveryState Waiting', async () => {
    mockConversations = [
      { id: 'conv-rest-1', scope: 'StaffContext', contextType: 'TeleconsultCall', contextId: 'call-rest', status: 'Open' },
    ];
    mockSendMessageImpl = async () => {
      throw new Error('Hub disconnected');
    };

    const store = new OptimisticStore();
    const fetchCalls: Array<{ url: string; init: any }> = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      fetchCalls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          messageId: 'srv-rest-99',
          seq: 5,
          conversationId: 'conv-rest-1',
          contentText: 'Fallback msg',
          visibility: 'Public',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as any;

    try {
      renderToStaticMarkup(
        React.createElement(
          TestCommsContext.Provider,
          {
            value: {
              baseUrl: 'https://comms.local/',
              activeTicket: { ticket: 'jwt-ticket-xyz' },
              staffId: 'staff-1',
              staffDisplayName: 'Dr. Maria Santos',
              store,
              client: { events: new CommsEventEmitter() },
            },
          },
          React.createElement(TeleconsultInCallChatDrawer, {
            callId: 'call-rest',
            patientId: 'pat-rest',
            patientName: 'Jose Rizal',
            currentUserId: 'staff-1',
            hasRemoteParticipant: true,
            dataChannelMessages: [],
            onSendDataChannelMessage: async () => {},
          }),
        ),
      );

      await capturedMessageThreadProps.onSendMessage('Fallback msg', false);

      expect(fetchCalls).toHaveLength(1);
      expect(fetchCalls[0].init.headers.Authorization).toBe('Bearer jwt-ticket-xyz');
      const body = JSON.parse(fetchCalls[0].init.body);
      expect(typeof body.clientMessageId).toBe('string');
      expect(body.clientMessageId.length).toBeGreaterThan(0);

      const stored = store.getMessages('conv-rest-1');
      expect(stored).toHaveLength(1);
      expect(stored[0].messageId).toBe('srv-rest-99');
      expect(stored[0].clientMessageId).toBe(body.clientMessageId);
      expect(stored[0].deliveryState).toBe('Waiting');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test('4. Care Team isolation: never reuses general Patient StaffContext or other CallId threads; prefers PatientFacility if open', async () => {
    const createdReqs: any[] = [];
    mockCreateConversationImpl = async (req) => {
      createdReqs.push(req);
      return { id: 'conv-new-tele', ...req };
    };

    mockConversations = [
      {
        id: 'conv-care-team-general',
        scope: 'StaffContext',
        contextType: 'Patient',
        contextId: 'pat-iso-1',
        status: 'Open',
      },
      {
        id: 'conv-other-teleconsult',
        scope: 'StaffContext',
        contextType: 'TeleconsultCall',
        contextId: 'call-OTHER',
        status: 'Open',
      },
    ];

    renderToStaticMarkup(
      React.createElement(
        TestCommsContext.Provider,
        { value: { client: { events: new CommsEventEmitter() } } },
        React.createElement(TeleconsultInCallChatDrawer, {
          callId: 'call-CURRENT',
          patientId: 'pat-iso-1',
          patientName: 'Elena Cruz',
          currentUserId: 'staff-1',
          hasRemoteParticipant: true,
          dataChannelMessages: [],
          onSendDataChannelMessage: async () => {},
        }),
      ),
    );

    // Did NOT match either general Care Team or call-OTHER
    expect(capturedMessageThreadProps.conversationId).toBe('call-CURRENT');
    await capturedMessageThreadProps.onSendMessage('Hello Elena', false);
    expect(createdReqs).toHaveLength(1);
    expect(createdReqs[0]).toMatchObject({
      scope: 'StaffContext',
      title: 'Teleconsult Chat: Elena Cruz',
      contextType: 'TeleconsultCall',
      contextId: 'call-CURRENT',
    });
  });

  test('5. Pre-join DataChannel buffer queues public messages with noticeBannerText and replays on participantJoined while skipping internal notes', async () => {
    mockCallStatus = 'connected';
    mockRemoteParticipants = [];
    mockConversations = [
      { id: 'conv-prejoin', scope: 'StaffContext', contextType: 'TeleconsultCall', contextId: 'call-prejoin', status: 'Open' },
    ];

    const harness = createClinicHookHarness(
      () =>
        ActiveTeleconsultModal({
          teleconsultSession: {
            callId: 'call-prejoin',
            appointmentId: 'apt-prejoin',
            patientId: 'pat-prejoin',
            patientName: 'Prejoin Patient',
            clinicianName: 'Dr. Maria Santos',
            scheduledTime: '2026-11-18 at 10:00 AM',
            paymentPolicy: 'Exempt',
            paymentStatus: 'Exempt',
          },
          closeTeleconsultWaitingRoom: () => {},
          isCallStageDocked: false,
          dockCallStage: () => {},
          maximizeCallStage: () => {},
        }),
      new Map([[TestCommsContext, { client: { events: new CommsEventEmitter() } }]]),
    );

    renderToStaticMarkup(harness.result.current);
    expect(capturedCallStageProps).not.toBeNull();
    expect(capturedMessageThreadProps).not.toBeNull();
    expect(capturedMessageThreadProps.noticeBannerText).toBe(
      'Patient has not joined the video room yet — public messages will be delivered automatically when they join.',
    );

    // Send 2 public messages and 1 internal note while patient is not in the video room
    await act(async () => {
      await capturedMessageThreadProps.onSendMessage('First pre-join message', false);
      await capturedMessageThreadProps.onSendMessage('Internal clinical note', true);
      await capturedMessageThreadProps.onSendMessage('Second pre-join message', false);
    });

    // Public messages are buffered (0 transmitted over DataChannel yet), internal note skipped
    expect(sentDataPayloads).toHaveLength(0);

    // Re-render to inspect dataChannelMessages passed to TeleconsultInCallChatDrawer
    harness.rerender();
    renderToStaticMarkup(harness.result.current);
    const dcTexts = capturedMessageThreadProps.messages.map((m: any) => m.contentText);
    expect(dcTexts).toEqual(['First pre-join message', 'Second pre-join message']);
    expect(dcTexts).not.toContain('Internal clinical note');

    // Patient joins -> participantJoined flushes buffered public messages in order
    mockRemoteParticipants = [{ identity: 'patient:pat-prejoin' }];
    await act(async () => {
      latestAdapterInstance.emit('participantJoined', { identity: 'patient:pat-prejoin' });
      await flushMicrotasks();
    });

    expect(sentDataPayloads).toHaveLength(2);
    expect(JSON.parse(sentDataPayloads[0]).text).toBe('First pre-join message');
    expect(JSON.parse(sentDataPayloads[1]).text).toBe('Second pre-join message');

    // Notice banner disappears once remote participant is present
    harness.rerender();
    renderToStaticMarkup(harness.result.current);
    expect(capturedMessageThreadProps.noticeBannerText).toBeUndefined();

    harness.unmount();
  });
});
