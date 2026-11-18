import { beforeAll, describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { createShadows, lightColors } from '@clinicez/design-tokens';
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

beforeAll(async () => {
  const drawerMod = await import('../../src/native-ui/ChatDrawer');
  ChatDrawer = drawerMod.ChatDrawer;
  const threadMod = await import('../../src/native-ui/MessageThread');
  MessageThread = threadMod.MessageThread;
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
      (el) => el.type === 'span' && getTextContent(el).trim() === 'Archived'
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
});
