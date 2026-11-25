import { describe, expect, it, mock } from 'bun:test';
import * as realReact from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { lightColors, radiusScale, sizes, spaceScale } from '@clinicez/design-tokens';

let useStateOverride: ((init: any) => [any, any]) | null = null;

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
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
}));

mock.module('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

mock.module('@react-navigation/native', () => ({
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
  MessageThread: makeStub('MessageThread'),
}));

mock.module('../contexts/ThemeContext', () => ({
  useAppTheme: () => ({
    colors: lightColors,
    spacing: spaceScale,
    radii: radiusScale,
    sizes,
    shadows: { sm: {}, md: {} },
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

describe('Issue #284: Patient Portal Category Labels & Deduplication', () => {
  it('MessagesInboxScreen renders single formatted category label without repeating raw PostVisitFollowUp', async () => {
    const mockConversations = [
      {
        id: 'conv-legacy-1',
        patientId: 'pat-1',
        homeTenantId: 't1',
        homeFacilityId: 'f1',
        homeFacilityType: 'Clinic',
        facilityName: 'Nextstep OPD',
        category: 'PostVisitFollowUp',
        subject: 'PostVisitFollowUp',
        status: 'WithTriage',
        isHiddenByPatient: false,
        openedAtUtc: '2026-11-25T10:00:00Z',
        lastMessageAtUtc: '2026-11-25T10:00:00Z',
        lastMessagePreview: 'Checking on my post-visit labs.',
        unreadCount: 0,
      },
      {
        id: 'conv-custom-2',
        patientId: 'pat-1',
        homeTenantId: 't1',
        homeFacilityId: 'f1',
        homeFacilityType: 'Clinic',
        facilityName: 'Nextstep OPD',
        category: 'PostVisitFollowUp',
        subject: 'CBC blood test results',
        status: 'Routed',
        isHiddenByPatient: false,
        openedAtUtc: '2026-11-25T11:00:00Z',
        lastMessageAtUtc: '2026-11-25T11:00:00Z',
        lastMessagePreview: 'Doctor reviewed your CBC.',
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

    try {
      const mod = await import('../navigation/screens/messages/MessagesInbox.screen');
      const html = renderToStaticMarkup(realReact.createElement(mod.default));

      expect(html).toContain('Medical / Follow-Up');
      expect(html).not.toContain('PostVisitFollowUp');
      expect(html).toContain('CBC blood test results');
      // Legacy row must render "Medical / Follow-Up" only once in visible DOM text (no duplicate subject text)
      const legacyCardSection = html.split('Checking on my post-visit labs.')[0];
      expect(legacyCardSection.match(/>Medical \/ Follow-Up</g)?.length).toBe(1);
    } finally {
      useStateOverride = null;
    }
  });

  it('ConversationThreadScreen renders single formatted category label when subject matches raw category', async () => {
    const mockDetail = {
      id: 'conv-legacy-1',
      patientId: 'pat-1',
      homeTenantId: 't1',
      homeFacilityId: 'f1',
      homeFacilityType: 'Clinic',
      facilityName: 'Nextstep OPD',
      category: 'PostVisitFollowUp',
      subject: 'PostVisitFollowUp',
      status: 'WithTriage',
      isHiddenByPatient: false,
      openedAtUtc: '2026-11-25T10:00:00Z',
      messages: [],
    };

    let stateCall = 0;
    useStateOverride = (init: any) => {
      const idx = stateCall++;
      if (idx === 0) return [mockDetail, () => {}];
      if (idx === 2) return [false, () => {}];
      return [init, () => {}];
    };

    try {
      const mod = await import('../navigation/screens/messages/ConversationThread.screen');
      const html = renderToStaticMarkup(
        realReact.createElement(mod.default, {
          route: { params: { conversationId: 'conv-legacy-1', title: 'Nextstep OPD', scope: 'Clinic' } } as any,
        }),
      );

      expect(html).toContain('Medical / Follow-Up');
      expect(html).not.toContain('PostVisitFollowUp');
      expect(html).not.toContain('Medical / Follow-Up • Medical / Follow-Up');
    } finally {
      useStateOverride = null;
    }
  });
});
