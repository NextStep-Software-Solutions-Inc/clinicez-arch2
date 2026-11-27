import { afterEach, describe, expect, it, mock } from 'bun:test';
import * as realReact from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { darkColors, radiusScale, sizes, spaceScale } from '@clinicez/design-tokens';

let useStateOverride: ((init: any) => [any, any]) | null = null;
let capturedMessageThreadProps: any = null;
let capturedPreviewModalProps: any = null;

mock.module('react', () => ({
  ...realReact,
  default: {
    ...realReact,
    useState: (init: any) =>
      useStateOverride ? useStateOverride(init) : realReact.useState(init),
  },
  useState: (init: any) =>
    useStateOverride ? useStateOverride(init) : realReact.useState(init),
}));

const makeStub = (name: string) => {
  const Comp = ({ children, label, title, style: _style, ...rest }: any) =>
    realReact.createElement('div', { 'data-component': name, ...rest }, label ?? title, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: (obj: any) => obj?.web ?? obj?.default },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, hairlineWidth: 1 },
  View: makeStub('View'),
  Text: makeStub('Text'),
  Image: makeStub('Image'),
  Pressable: makeStub('Pressable'),
  FlatList: ({ data = [], renderItem }: any) =>
    realReact.createElement(
      'div',
      { 'data-component': 'FlatList' },
      data.map((item: any, i: number) =>
        realReact.createElement(realReact.Fragment, { key: item.id ?? i }, renderItem({ item, index: i })),
      ),
    ),
  RefreshControl: makeStub('RefreshControl'),
  ScrollView: makeStub('ScrollView'),
  TextInput: makeStub('TextInput'),
  TouchableOpacity: makeStub('TouchableOpacity'),
  ActivityIndicator: makeStub('ActivityIndicator'),
  Modal: makeStub('Modal'),
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
mock.module('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true, assets: [] }),
}));
mock.module('@react-navigation/native', () => ({
  useFocusEffect: () => {},
  useNavigation: () => ({
    navigate: () => {},
    goBack: () => {},
    setOptions: () => {},
  }),
}));

mock.module('../components/layout/Screen', () => ({
  default: ({ children, footer }: any) => realReact.createElement('div', null, children, footer),
}));
mock.module('../components/ui/Card', () => ({ default: makeStub('Card') }));
mock.module('../components/ui/Badge', () => ({
  default: ({ label }: any) => realReact.createElement('span', { 'data-badge': label }, label),
}));
mock.module('../components/ui/Icon', () => ({ AppIcon: makeStub('AppIcon') }));
mock.module('../components/ui/IconButton', () => ({ default: makeStub('IconButton') }));
mock.module('../components/ui/ThemedText', () => ({
  default: ({ children }: any) => realReact.createElement('span', null, children),
}));
mock.module('../components/ui/EmptyState', () => ({ default: makeStub('EmptyState') }));
mock.module('../components/ui/Skeleton', () => ({ SkeletonCard: makeStub('SkeletonCard') }));
mock.module('../components/ui/FilterChipBar', () => ({ default: makeStub('FilterChipBar') }));
mock.module('../components/BottomTabsHeaderRight', () => ({
  default: makeStub('BottomTabsHeaderRight'),
}));

mock.module('@clinicez/comms-sdk/native-ui', () => ({
  MessageThread: (props: any) => {
    capturedMessageThreadProps = props;
    return realReact.createElement('div', { 'data-component': 'MessageThread' });
  },
  AttachmentPreviewModal: (props: any) => {
    capturedPreviewModalProps = props;
    return realReact.createElement('div', {
      'data-component': 'AttachmentPreviewModal',
      'data-file-name': props.attachment?.fileName ?? '',
    });
  },
}));

mock.module('../contexts/ThemeContext', () => ({
  useAppTheme: () => ({
    scheme: 'dark',
    dark: true,
    colors: darkColors,
    spacing: spaceScale,
    radii: radiusScale,
    sizes,
    shadows: { none: {}, sm: {}, md: {}, lg: {} },
  }),
}));
mock.module('../contexts/AuthContext', () => ({
  useAuth: () => ({ getToken: async () => 'tok', internalPatientId: 'pat-1', userId: 'user-1' }),
}));
mock.module('../contexts/PrivacyContext', () => ({
  usePrivacy: () => ({
    privacyBlurEnabled: false,
    togglePrivacyBlur: () => {},
    showHiddenConversations: false,
    hiddenConversationIds: new Set<string>(),
    hideConversation: async () => {},
  }),
}));
mock.module('../hooks/useContentInsets', () => ({
  useContentInsets: () => ({ bottom: 0, fabBottom: 0 }),
}));
mock.module('../hooks/usePersistedTab', () => ({
  usePersistedTab: () => ['All', () => {}],
}));
mock.module('../utils/dialog', () => ({
  dialog: { confirm: async () => false, alert: () => {} },
}));

describe('Issue #297: Patient Portal Dark Mode Thread, Attachment Preview Modal & Readable Status Badges', () => {
  afterEach(() => {
    useStateOverride = null;
    capturedMessageThreadProps = null;
    capturedPreviewModalProps = null;
  });

  it('MessagesInboxScreen renders human-readable status labels ("With Triage", "Needs Visit") instead of raw enums', async () => {
    const mockConversations = [
      {
        id: 'conv-triage-1',
        patientId: 'pat-1',
        homeTenantId: 't1',
        homeFacilityId: 'f1',
        homeFacilityType: 'Clinic',
        facilityName: 'Nextstep OPD',
        category: 'PostVisitFollowUp',
        subject: 'PostVisitFollowUp',
        status: 'WithTriage',
        isHiddenByPatient: false,
        openedAtUtc: '2026-11-27T10:00:00Z',
        lastMessageAtUtc: '2026-11-27T10:00:00Z',
        lastMessagePreview: 'Checking on my prescription.',
        unreadCount: 0,
      },
      {
        id: 'conv-visit-2',
        patientId: 'pat-1',
        homeTenantId: 't1',
        homeFacilityId: 'f1',
        homeFacilityType: 'Clinic',
        facilityName: 'Nextstep OPD',
        category: 'Scheduling',
        subject: 'Follow-up check',
        status: 'NeedsVisit',
        isHiddenByPatient: false,
        openedAtUtc: '2026-11-27T11:00:00Z',
        lastMessageAtUtc: '2026-11-27T11:00:00Z',
        lastMessagePreview: 'Please schedule an in-clinic visit.',
        unreadCount: 1,
      },
    ];

    let stateCall = 0;
    useStateOverride = (init: any) => {
      const idx = stateCall++;
      if (idx === 0) return [mockConversations, () => {}];
      if (idx === 2) return [false, () => {}];
      return [init, () => {}];
    };

    const mod = await import('../navigation/screens/messages/MessagesInbox.screen');
    const html = renderToStaticMarkup(realReact.createElement(mod.default));

    expect(html).toContain('With Triage');
    expect(html).not.toContain('WithTriage');
    expect(html).toContain('Needs Visit');
    expect(html).not.toContain('NeedsVisit');
  });

  it('ConversationThreadScreen forwards active darkColors to MessageThread and opens AttachmentPreviewModal inline', async () => {
    const sampleAttachment = {
      attachmentId: 'att-epress-1',
      fileKey: 'comms/epress.pdf',
      fileName: 'EPRESS_12345.pdf',
      contentType: 'application/pdf',
      sizeBytes: 102400,
      isClean: true,
    };

    let capturedSetterValue: any = null;
    let stateCall = 0;
    useStateOverride = (init: any) => {
      const idx = stateCall++;
      if (idx === 0) {
        return [
          {
            id: 'conv-dark-1',
            patientId: 'pat-1',
            homeTenantId: 't1',
            homeFacilityId: 'f1',
            homeFacilityType: 'Clinic',
            facilityName: 'Nextstep OPD',
            category: 'PrescriptionRefill',
            subject: 'PrescriptionRefill',
            status: 'WithTriage',
            isHiddenByPatient: false,
            openedAtUtc: '2026-11-27T10:00:00Z',
            messages: [],
          },
          () => {},
        ];
      }
      if (idx === 2) return [false, () => {}];
      if (idx === 4) {
        return [
          sampleAttachment,
          (next: any) => {
            capturedSetterValue = next;
          },
        ];
      }
      return [init, () => {}];
    };

    const mod = await import('../navigation/screens/messages/ConversationThread.screen');
    const html = renderToStaticMarkup(
      realReact.createElement(mod.default, {
        route: { params: { conversationId: 'conv-dark-1', title: 'Nextstep OPD', scope: 'Clinic' } } as any,
      }),
    );

    // 1. MessageThread receives active dark theme colors from useAppTheme()
    expect(capturedMessageThreadProps).not.toBeNull();
    expect(capturedMessageThreadProps.colors).toEqual(darkColors);

    // 2. Clicking an attachment triggers state setter to open modal (does not call window.open)
    let windowOpenCalled = false;
    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = {
      open: () => {
        windowOpenCalled = true;
        return null;
      },
    };
    try {
      capturedMessageThreadProps.onOpenAttachment(sampleAttachment);
    } finally {
      (globalThis as any).window = originalWindow;
    }
    expect(windowOpenCalled).toBe(false);
    expect(capturedSetterValue).toEqual(sampleAttachment);

    // 3. AttachmentPreviewModal renders with active dark theme colors & loadPreview callback
    expect(html).toContain('AttachmentPreviewModal');
    expect(html).toContain('EPRESS_12345.pdf');
    expect(capturedPreviewModalProps).not.toBeNull();
    expect(capturedPreviewModalProps.visible).toBe(true);
    expect(capturedPreviewModalProps.attachment).toEqual(sampleAttachment);
    expect(capturedPreviewModalProps.colors).toEqual(darkColors);
    expect(typeof capturedPreviewModalProps.loadPreview).toBe('function');
  });
});
