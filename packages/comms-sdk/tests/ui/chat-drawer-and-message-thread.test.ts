import { beforeAll, describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { createShadows, lightColors } from '@clinicez/design-tokens';
import {
  getClosedConversationLabel,
  isConversationClosed,
  TERMINAL_CONVERSATION_STATUSES
} from '../../src/core/conversationFilters';
import type { RequestStatus } from '../../src/core/types';
import type {
  ChatDrawerItem,
  ConversationScopeFilter,
  ThreadMessage
} from '../../src/native-ui/types';
import { createHookHarness } from '../react/hook-test-harness';

mock.module('react-native', () => ({
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props }) : null),
  StyleSheet: {
    create: (styles: any) => styles
  }
}));

let ChatDrawer: any;
let MessageThread: any;
let TriageQueueView: any;
let WebChatDrawer: any;
let WebMessageThread: any;
let WebTriageQueueView: any;

beforeAll(async () => {
  const drawerMod = await import('../../src/native-ui/ChatDrawer');
  ChatDrawer = drawerMod.ChatDrawer;
  const threadMod = await import('../../src/native-ui/MessageThread');
  MessageThread = threadMod.MessageThread;
  const triageMod = await import('../../src/native-ui/TriageQueueView');
  TriageQueueView = triageMod.TriageQueueView;
  const webDrawerMod = await import('../../src/web-ui/ChatDrawer');
  WebChatDrawer = webDrawerMod.ChatDrawer;
  const webThreadMod = await import('../../src/web-ui/MessageThread');
  WebMessageThread = webThreadMod.MessageThread;
  const webTriageMod = await import('../../src/web-ui/TriageQueueView');
  WebTriageQueueView = webTriageMod.TriageQueueView;
});

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join(' ');
  if (element.props?.children) return getTextContent(element.props.children);
  return '';
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (predicate(element)) return element;
  if (element.props?.children) {
    return findElement(element.props.children, predicate);
  }
  return null;
}

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      if (Array.isArray(el.props.children)) {
        el.props.children.forEach(search);
      } else {
        search(el.props.children);
      }
    }
  }
  search(element);
  return results;
}

describe('Native UI ChatDrawer & MessageThread (#212, #213, #158)', () => {
  it('ChatDrawer renders Archived scope chip and allows selecting Archived scope', () => {
    let selectedScope: ConversationScopeFilter = 'All';
    const items: ChatDrawerItem[] = [
      {
        id: 'conv-archived-1',
        scope: 'Direct',
        title: 'Closed Consult',
        lastMessageSnippet: 'Final follow-up complete',
        unreadCount: 0,
        isArchived: true,
        isMuted: true
      }
    ];

    const harness = createHookHarness(() =>
      ChatDrawer({
        items,
        selectedScope,
        onSelectScope: (next: ConversationScopeFilter) => {
          selectedScope = next;
        },
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    const archivedChip = findElement(
      harness.result.current,
      (el) => el.props?.accessibilityRole === 'button' && getTextContent(el).trim() === 'Archived'
    );
    expect(archivedChip).not.toBeNull();

    archivedChip.props.onPress();
    expect(selectedScope).toBe('Archived');

    // Archived badge uses design tokens (surfaceSubtle, border, textMuted)
    const archivedBadge = findElement(
      harness.result.current,
      (el) => el.props?.testID === 'badge-archived-conv-archived-1'
    );
    expect(archivedBadge).not.toBeNull();
    expect(archivedBadge.props.style.backgroundColor).toBe(lightColors.surfaceSubtle);
    expect(archivedBadge.props.style.borderColor).toBe(lightColors.border);

    const badgeText = findElement(
      archivedBadge,
      (el) => el.type === 'span' && getTextContent(el).trim() === 'Closed / Archived'
    );
    expect(badgeText).not.toBeNull();
    expect(badgeText.props.style.color).toBe(lightColors.textMuted);

    const mutedBadge = findElement(
      harness.result.current,
      (el) => el.props?.testID === 'badge-muted-conv-archived-1'
    );
    expect(mutedBadge).not.toBeNull();

    harness.unmount();
  });

  it('MessageThread renders noticeBannerText using design tokens when provided and hides it when undefined', () => {
    const noticeMsg =
      'Patient has not joined the video room yet — public messages will be delivered automatically when they join.';
    const sampleMsg: ThreadMessage = {
      id: 'opt-cid-99',
      clientMessageId: 'cid-99',
      seq: 1,
      conversationId: 'conv-call-1',
      senderType: 'Staff',
      senderId: 'doc-1',
      senderDisplayName: 'Dr. Reyes',
      contentText: 'Ready whenever you join.',
      visibility: 'Public',
      state: 'Sending',
      clientSentAtUtc: '2026-11-17T08:00:00Z'
    };

    const withNotice = createHookHarness(() =>
      MessageThread({
        conversationId: 'conv-call-1',
        conversationTitle: 'Teleconsult Chat',
        conversationScope: 'StaffContext',
        messages: [sampleMsg],
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        noticeBannerText: noticeMsg,
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    const banner = findElement(
      withNotice.result.current,
      (el) => el.props?.testID === 'message-thread-notice-banner'
    );
    expect(banner).not.toBeNull();
    expect(banner.props.style.backgroundColor).toBe(lightColors.surfaceSubtle);
    expect(banner.props.style.borderBottomColor).toBe(lightColors.border);
    expect(getTextContent(banner)).toContain(noticeMsg);

    const bannerTextEl = findElement(
      banner,
      (el) => el.type === 'span' && getTextContent(el).includes('Patient has not joined')
    );
    expect(bannerTextEl.props.style.color).toBe(lightColors.textSecondary);
    withNotice.unmount();

    const withoutNotice = createHookHarness(() =>
      MessageThread({
        conversationId: 'conv-call-1',
        conversationTitle: 'Teleconsult Chat',
        conversationScope: 'StaffContext',
        messages: [sampleMsg],
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );
    expect(
      findElement(
        withoutNotice.result.current,
        (el) => el.props?.testID === 'message-thread-notice-banner'
      )
    ).toBeNull();
    withoutNotice.unmount();
  });

  it('MessageThread hides input composer and renders read-only banner when isArchived is true (#212)', () => {
    const messages: ThreadMessage[] = [
      {
        id: 'm-1',
        clientMessageId: 'cid-1',
        seq: 1,
        conversationId: 'conv-arch-1',
        senderType: 'Staff',
        senderId: 'doc-1',
        senderDisplayName: 'Dr. Reyes',
        contentText: 'Case closed.',
        visibility: 'Public',
        state: 'Received',
        clientSentAtUtc: '2026-11-17T08:00:00Z'
      }
    ];

    const defaultBannerHarness = createHookHarness(() =>
      MessageThread({
        conversationId: 'conv-arch-1',
        conversationTitle: 'Archived Case',
        conversationScope: 'Direct',
        messages,
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        isArchived: true,
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    // Input composer & send button must NOT be rendered
    const inputs = findAllElements(
      defaultBannerHarness.result.current,
      (el) => el.props?.accessibilityLabel === 'Message input field'
    );
    const sendButtons = findAllElements(
      defaultBannerHarness.result.current,
      (el) => el.props?.accessibilityLabel === 'Send message'
    );
    expect(inputs.length).toBe(0);
    expect(sendButtons.length).toBe(0);

    const archivedBanner = findElement(
      defaultBannerHarness.result.current,
      (el) => el.props?.testID === 'message-thread-archived-banner'
    );
    expect(archivedBanner).not.toBeNull();
    expect(getTextContent(archivedBanner)).toContain(
      'This conversation is closed and archived. Message history is read-only.'
    );
    defaultBannerHarness.unmount();

    // Custom archivedBannerText overrides default text
    const customBannerHarness = createHookHarness(() =>
      MessageThread({
        conversationId: 'conv-arch-1',
        conversationTitle: 'Archived Case',
        conversationScope: 'Direct',
        messages,
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        isArchived: true,
        archivedBannerText: 'Archived clinical thread — read only.',
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    const customBanner = findElement(
      customBannerHarness.result.current,
      (el) => el.props?.testID === 'message-thread-archived-banner'
    );
    expect(getTextContent(customBanner)).toContain('Archived clinical thread — read only.');
    customBannerHarness.unmount();
  });

  it('ChatDrawer renders "No Archived Conversations" without CTA and excludes archived items from collapsed/card unread badges (#212)', () => {
    const emptyArchivedHarness = createHookHarness(() =>
      ChatDrawer({
        items: [],
        selectedScope: 'Archived',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onNewConversation: () => {},
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    const emptyText = getTextContent(emptyArchivedHarness.result.current);
    expect(emptyText).toContain('No Archived Conversations');
    expect(emptyText).not.toContain('Start Conversation');
    emptyArchivedHarness.unmount();

    const archivedUnreadItems: ChatDrawerItem[] = [
      {
        id: 'conv-arch-unread',
        scope: 'Direct',
        title: 'Closed Consult',
        unreadCount: 5,
        isArchived: true
      }
    ];

    const collapsedHarness = createHookHarness(() =>
      ChatDrawer({
        items: archivedUnreadItems,
        selectedScope: 'Archived',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        isCollapsed: true,
        onToggleCollapse: () => {},
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    // Collapsed dot must not render when only archived items have unreadCount > 0
    const collapsedSpans = findAllElements(
      collapsedHarness.result.current,
      (el) => el.type === 'span' && getTextContent(el).trim() === '•'
    );
    // Only the expand button fallback icon should render (1), not a second badge dot
    expect(collapsedSpans.length).toBe(1);
    collapsedHarness.unmount();

    // Expanded view must also suppress unread pill on archived card
    const expandedHarness = createHookHarness(() =>
      ChatDrawer({
        items: archivedUnreadItems,
        selectedScope: 'Archived',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );
    const unreadPillText = findElement(
      expandedHarness.result.current,
      (el) => el.type === 'span' && getTextContent(el).trim() === '5'
    );
    expect(unreadPillText).toBeNull();
    expandedHarness.unmount();
  });

  it('MessageThread supports isReadOnly and custom readOnlyBanner ReactNode (#212)', () => {
    const customBannerNode = React.createElement(
      'div',
      { testID: 'custom-readonly-banner' },
      'Custom read-only clinical archive notice'
    );

    const harness = createHookHarness(() =>
      MessageThread({
        conversationId: 'conv-ro-1',
        conversationTitle: 'Closed Consult',
        conversationScope: 'Direct',
        messages: [],
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        isReadOnly: true,
        readOnlyBanner: customBannerNode,
        colors: lightColors,
        shadows: createShadows(lightColors)
      })
    );

    const inputs = findAllElements(
      harness.result.current,
      (el) => el.props?.accessibilityLabel === 'Message input field'
    );
    expect(inputs.length).toBe(0);

    const customBanner = findElement(
      harness.result.current,
      (el) => el.props?.testID === 'custom-readonly-banner'
    );
    expect(customBanner).not.toBeNull();
    expect(getTextContent(customBanner)).toContain('Custom read-only clinical archive notice');
    harness.unmount();
  });

  it('Web UI ChatDrawer & MessageThread support Archived scope, Closed / Archived badge, empty state, and isReadOnly (#212)', () => {
    let selectedScope: ConversationScopeFilter = 'All';
    const items: ChatDrawerItem[] = [
      {
        id: 'web-arch-1',
        scope: 'Facility',
        title: 'Closed Facility Thread',
        lastMessageSnippet: 'Closed last week',
        unreadCount: 3,
        isArchived: true
      }
    ];

    const webDrawerHarness = createHookHarness(() =>
      WebChatDrawer({
        isOpen: true,
        onClose: () => {},
        items,
        selectedScope,
        onSelectScope: (next: ConversationScopeFilter) => {
          selectedScope = next;
        },
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onNewConversation: () => {}
      })
    );

    const archivedTab = findElement(
      webDrawerHarness.result.current,
      (el) => el.type === 'button' && el.props?.role === 'tab' && getTextContent(el).trim() === 'Archived'
    );
    expect(archivedTab).not.toBeNull();
    archivedTab.props.onClick();
    expect(selectedScope).toBe('Archived');

    const archivedBadge = findElement(
      webDrawerHarness.result.current,
      (el) => el.props?.['data-testid'] === 'badge-archived-web-arch-1'
    );
    expect(archivedBadge).not.toBeNull();
    expect(getTextContent(archivedBadge).trim()).toBe('Closed / Archived');

    // Unread pill suppressed for archived web item
    const unreadPill = findElement(
      webDrawerHarness.result.current,
      (el) => el.type === 'span' && getTextContent(el).trim() === '3'
    );
    expect(unreadPill).toBeNull();
    webDrawerHarness.unmount();

    // Empty Archived state without CTA
    const webEmptyArchived = createHookHarness(() =>
      WebChatDrawer({
        isOpen: true,
        onClose: () => {},
        items: [],
        selectedScope: 'Archived',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
        onNewConversation: () => {}
      })
    );
    const emptyText = getTextContent(webEmptyArchived.result.current);
    expect(emptyText).toContain('No Archived Conversations');
    expect(emptyText).not.toContain('Start Conversation');
    webEmptyArchived.unmount();

    // Web MessageThread read-only mode
    const webThreadHarness = createHookHarness(() =>
      WebMessageThread({
        conversationId: 'web-arch-1',
        conversationTitle: 'Closed Facility Thread',
        conversationScope: 'Facility',
        messages: [],
        currentUserId: 'doc-1',
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        privacyBlurEnabled: false,
        onTogglePrivacyBlur: () => {},
        isReadOnly: true
      })
    );
    const forms = findAllElements(webThreadHarness.result.current, (el) => el.type === 'form');
    expect(forms.length).toBe(0);
    const banner = findElement(
      webThreadHarness.result.current,
      (el) => el.props?.['data-testid'] === 'message-thread-archived-banner'
    );
    expect(banner).not.toBeNull();
    expect(getTextContent(banner)).toContain(
      'This conversation is closed and archived. Message history is read-only.'
    );
    webThreadHarness.unmount();
  });

  it('isConversationClosed and getClosedConversationLabel classify all terminal statuses and closedAtUtc (#282)', () => {
    const activeStatuses: RequestStatus[] = ['Submitted', 'WithTriage', 'Routed'];
    for (const status of activeStatuses) {
      expect(isConversationClosed({ status, closedAtUtc: null })).toBe(false);
      expect(isConversationClosed({ status, closedAtUtc: '2026-11-25T08:00:00Z' })).toBe(true);
    }

    const terminalExpectations: Array<[RequestStatus, string]> = [
      ['Answered', 'Answered'],
      ['NeedsVisit', 'Needs Visit'],
      ['Declined', 'Declined'],
      ['Resolved', 'Resolved'],
      ['Closed', 'Closed / Archived'],
    ];
    for (const [status, expectedLabel] of terminalExpectations) {
      expect(TERMINAL_CONVERSATION_STATUSES.has(status)).toBe(true);
      expect(isConversationClosed({ status, closedAtUtc: null })).toBe(true);
      expect(getClosedConversationLabel({ status, closedAtUtc: null })).toBe(expectedLabel);
    }

    expect(isConversationClosed(null)).toBe(false);
    expect(isConversationClosed(undefined)).toBe(false);
  });

  it('TriageQueueView (native & web) and ChatDrawer render formatted category labels and subtitles (#284)', () => {
    const triageItem = {
      conversationId: 't-284',
      requestId: 't-284',
      patientId: 'pat-284',
      patientNameMasked: 'Justine Mae Tabasan',
      category: 'PostVisitFollowUp',
      contentText: 'Checking on my post-visit labs.',
      priority: 'Routine' as const,
      status: 'WithTriage' as const,
      submittedAtUtc: '2026-11-25T10:00:00Z',
      triageDueAtUtc: '2026-11-25T12:00:00Z',
      isOffHours: false,
      slaBreached: false,
      isEmergencyConfirmed: false,
    };

    const nativeTriage = createHookHarness(() =>
      TriageQueueView({
        items: [triageItem],
        facilityName: 'Nextstep OPD',
        onExecuteDisposition: async () => {},
        onRefresh: () => {},
      })
    );
    const nativeTriageText = getTextContent(nativeTriage.result.current);
    expect(nativeTriageText).toContain('Justine Mae Tabasan');
    expect(nativeTriageText).toContain('Post-Visit Follow-Up');
    expect(nativeTriageText).not.toContain('PostVisitFollowUp');
    nativeTriage.unmount();

    const webTriage = createHookHarness(() =>
      WebTriageQueueView({
        items: [triageItem],
        facilityName: 'Nextstep OPD',
        onExecuteDisposition: async () => {},
        onRefresh: () => {},
      })
    );
    const webTriageText = getTextContent(webTriage.result.current);
    expect(webTriageText).toContain('Justine Mae Tabasan');
    expect(webTriageText).toContain('Post-Visit Follow-Up');
    expect(webTriageText).not.toContain('PostVisitFollowUp');
    webTriage.unmount();

    const drawerItems: ChatDrawerItem[] = [
      {
        id: 'd-284',
        scope: 'PatientFacility',
        title: 'Justine Mae Tabasan',
        subtitle: 'Post-Visit Follow-Up',
        lastMessageSnippet: 'Checking on my post-visit labs.',
        unreadCount: 1,
      },
    ];

    const nativeDrawer = createHookHarness(() =>
      ChatDrawer({
        items: drawerItems,
        selectedScope: 'All',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
      })
    );
    const nativeDrawerText = getTextContent(nativeDrawer.result.current);
    expect(nativeDrawerText).toContain('Justine Mae Tabasan');
    expect(nativeDrawerText).toContain('Post-Visit Follow-Up');
    nativeDrawer.unmount();

    const webDrawer = createHookHarness(() =>
      WebChatDrawer({
        isOpen: true,
        onClose: () => {},
        items: drawerItems,
        selectedScope: 'All',
        onSelectScope: () => {},
        onSelectConversation: () => {},
        searchQuery: '',
        onSearchChange: () => {},
      })
    );
    const webDrawerText = getTextContent(webDrawer.result.current);
    expect(webDrawerText).toContain('Justine Mae Tabasan');
    expect(webDrawerText).toContain('Post-Visit Follow-Up');
    webDrawer.unmount();
  });
});
