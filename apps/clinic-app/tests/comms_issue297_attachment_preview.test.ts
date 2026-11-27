// token-guard:ignore-file
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as ReactNamespace from 'react';
import React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

mock.module('react', () => ({ ...ReactNamespace, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

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

const createMockComponent = (name: string) => {
  const Comp = ({ children, style: _style, ...rest }: any) =>
    React.createElement('div', { 'data-component': name, ...rest }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj?.web ?? obj?.default },
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
  Image: createMockComponent('Image'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Alert: { alert: () => {} },
  Touchable: { Mixin: {} },
  Animated: {
    Value: class { constructor(public val: any) {} setValue(v: any) { this.val = v; } interpolate() { return this; } },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
  },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
}));

mock.module('../constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('../../constants/fonts', () => ({ applyFontFamily: (s: any) => s, fontAssets: {} }));
mock.module('../context/StaffContext', () => ({
  useStaff: () => ({ current: { id: 'staff-1', firstName: 'Juan', lastName: 'Luna', role: 'Doctor' }, staff: [] }),
  formatStaffName: () => 'Dr. Juan Luna',
  staffInitials: () => 'JL',
}));
mock.module('../../context/StaffContext', () => ({
  useStaff: () => ({ current: { id: 'staff-1', firstName: 'Juan', lastName: 'Luna', role: 'Doctor' }, staff: [] }),
  formatStaffName: () => 'Dr. Juan Luna',
  staffInitials: () => 'JL',
}));
mock.module('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1', name: 'Dr. Juan Luna', role: 'Doctor', clinicId: 'c1' }, can: () => true }),
}));
mock.module('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'staff-1', name: 'Dr. Juan Luna', role: 'Doctor', clinicId: 'c1' }, can: () => true }),
}));

const realFeedback = await import('../utils/feedback');
mock.module('../utils/feedback', () => ({
  ...realFeedback,
  notify: { ...realFeedback.notify, success: () => {}, error: () => {}, info: () => {} },
}));
mock.module('../../utils/feedback', () => ({
  ...realFeedback,
  notify: { ...realFeedback.notify, success: () => {}, error: () => {}, info: () => {} },
}));

const realAlertSounds = await import('../utils/alertSounds');
mock.module('../utils/alertSounds', () => ({
  ...realAlertSounds,
  playMessageChime: () => {},
}));
mock.module('../../utils/alertSounds', () => ({
  ...realAlertSounds,
  playMessageChime: () => {},
}));

mock.module('../services/commsUrl', () => ({
  getCommsApiBaseUrl: () => 'https://comms.dev.clinicez.net',
}));
mock.module('../../services/commsUrl', () => ({
  getCommsApiBaseUrl: () => 'https://comms.dev.clinicez.net',
}));

const samplePdfAttachment = {
  attachmentId: 'att-clinic-pdf-1',
  fileKey: 'comms/epress-clinic.pdf',
  fileName: 'EPRESS_Patient_Rx.pdf',
  contentType: 'application/pdf',
  sizeBytes: 98304,
};

let capturedMessageThreadProps: any = null;
let capturedPreviewModalProps: any = null;

mock.module('@clinicez/comms-sdk/react', () => ({
  useConversation: (id: string) => ({
    conversation: {
      id,
      scope: 'PatientFacility',
      title: 'Justine Mae Tabasan',
      status: 'WithTriage',
      category: 'PrescriptionRefill',
      participants: [],
    },
    messages: [
      {
        messageId: 'm-att-1',
        seq: 1,
        conversationId: id,
        senderType: 'Patient',
        senderId: 'pat-1',
        senderDisplayName: 'Justine Mae Tabasan',
        contentText: 'Attached prescription.',
        visibility: 'Public',
        deliveryState: 'Received',
        sentAtUtc: '2026-11-27T10:00:00Z',
        attachments: [samplePdfAttachment],
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
    activeTicket: { ticket: 'clinic-comms-ticket-xyz' },
    refreshTicket: async () => ({ ticket: 'clinic-comms-ticket-xyz' }),
    client: { events: { emit: () => {} } },
  }),
}));

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  MessageThread: (props: any) => {
    capturedMessageThreadProps = props;
    return React.createElement('div', { 'data-component': 'MessageThread' });
  },
  AttachmentPreviewModal: (props: any) => {
    capturedPreviewModalProps = props;
    return React.createElement('div', {
      'data-component': 'AttachmentPreviewModal',
      'data-filename': props.attachment?.fileName ?? '',
    });
  },
  ChatDrawer: createMockComponent('ChatDrawer'),
  TriageQueueView: createMockComponent('TriageQueueView'),
  CallWaitingRoom: createMockComponent('CallWaitingRoom'),
  CallStage: createMockComponent('CallStage'),
}));

const { syncActiveTheme, getActiveThemeState } = await import('../constants/theme');
const { DEFAULT_CLINIC_BRAND_COLOR } = await import('../constants/color');
const { default: ClinicActiveThread } = await import('../components/comms/ClinicActiveThread');

describe('Issue #297: ClinicActiveThread In-App Attachment Preview Modal', () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    capturedMessageThreadProps = null;
    capturedPreviewModalProps = null;
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'dark',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    syncActiveTheme({
      brandColorHex: DEFAULT_CLINIC_BRAND_COLOR,
      userBrandColorHex: null,
      scheme: 'light',
    });
  });

  test('clicking an attachment opens AttachmentPreviewModal inline without calling window.open and fetches blob with comms ticket', async () => {
    let windowOpenCalled = false;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      open: () => {
        windowOpenCalled = true;
        return null;
      },
    };

    const fetchCalls: Array<{ url: string; auth: string | null }> = [];
    const revokedUrls: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      fetchCalls.push({ url: String(input), auth: headers.get('Authorization') });
      return new Response(new TextEncoder().encode('%PDF-1.4\nclinic-preview'), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf' },
      });
    }) as typeof globalThis.fetch;

    URL.createObjectURL = (() => 'blob:https://nextstep.clinic.dev.clinicez.net/clinic-preview-1') as typeof URL.createObjectURL;
    URL.revokeObjectURL = ((url: string) => {
      revokedUrls.push(url);
    }) as typeof URL.revokeObjectURL;

    const harness = createClinicHookHarness(() =>
      ClinicActiveThread({
        conversationId: 'conv-clinic-297',
        onBack: () => {},
        currentUserId: 'staff-1',
      }),
    );

    try {
      const findByPredicate = (el: any, matcher: (node: any) => boolean): any => {
        if (!el) return null;
        if (Array.isArray(el)) {
          for (const child of el) {
            const hit = findByPredicate(child, matcher);
            if (hit) return hit;
          }
          return null;
        }
        if (matcher(el)) return el;
        return el.props?.children ? findByPredicate(el.props.children, matcher) : null;
      };

      const threadEl = findByPredicate(
        harness.result.current,
        (el) => typeof el?.props?.onOpenAttachment === 'function',
      );
      expect(threadEl).not.toBeNull();

      // Before clicking, no AttachmentPreviewModal is mounted
      expect(
        findByPredicate(harness.result.current, (el) => typeof el?.props?.loadPreview === 'function'),
      ).toBeNull();

      // Click attachment -> opens inline modal, does NOT call window.open
      threadEl.props.onOpenAttachment({ ...samplePdfAttachment, isClean: true });
      expect(windowOpenCalled).toBe(false);

      const modalEl = findByPredicate(
        harness.result.current,
        (el) => typeof el?.props?.loadPreview === 'function',
      );
      expect(modalEl).not.toBeNull();
      expect(modalEl.props.visible).toBe(true);
      expect(modalEl.props.attachment.fileName).toBe('EPRESS_Patient_Rx.pdf');
      expect(modalEl.props.colors).toEqual(getActiveThemeState().resolvedColors);

      // Invoking loadPreview fetches authenticated PDF blob and returns a revocable object URL
      const preview = await modalEl.props.loadPreview(modalEl.props.attachment);
      expect(fetchCalls).toEqual([
        {
          url: 'https://comms.dev.clinicez.net/api/v1/comms/attachments/att-clinic-pdf-1/download',
          auth: 'Bearer clinic-comms-ticket-xyz',
        },
      ]);
      expect(preview.uri).toBe('blob:https://nextstep.clinic.dev.clinicez.net/clinic-preview-1');
      expect(preview.mimeType).toBe('application/pdf');
      expect(preview.fileName).toBe('EPRESS_Patient_Rx.pdf');

      preview.revoke?.();
      expect(revokedUrls).toEqual(['blob:https://nextstep.clinic.dev.clinicez.net/clinic-preview-1']);

      // Closing clears modal
      modalEl.props.onClose();
      expect(
        findByPredicate(harness.result.current, (el) => typeof el?.props?.loadPreview === 'function'),
      ).toBeNull();
    } finally {
      harness.unmount();
      (globalThis as any).window = originalWindow;
    }

    // Verify SSR markup renders cleanly without throwing
    const ssrHtml = renderToStaticMarkup(
      React.createElement(ClinicActiveThread, {
        conversationId: 'conv-clinic-297',
        onBack: () => {},
        currentUserId: 'staff-1',
      }),
    );
    expect(ssrHtml).toContain('MessageThread');
    expect(capturedMessageThreadProps).not.toBeNull();
    expect(capturedPreviewModalProps).toBeNull();
  });
});
