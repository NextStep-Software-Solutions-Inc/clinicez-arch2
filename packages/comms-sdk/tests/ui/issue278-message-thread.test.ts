import { beforeAll, describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import type { ThreadAttachment, ThreadMessage } from '../../src/native-ui/types';
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
    create: (styles: any) => styles,
    flatten: (s: any) => (Array.isArray(s) ? Object.assign({}, ...s.filter(Boolean)) : s || {}),
  },
}));

let NativeMessageThread: any;

beforeAll(async () => {
  const threadMod = await import('../../src/native-ui/MessageThread');
  NativeMessageThread = threadMod.MessageThread;
});

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

describe('Issue #278 — MessageThread viewerType, attachments, OptimisticStore ordering & SubscriptionTracker', () => {
  const mixedMessages: ThreadMessage[] = [
    {
      id: 'msg-pat-1',
      seq: 1,
      conversationId: 'conv-278',
      senderType: 'Patient',
      senderId: 'pat-1',
      senderDisplayName: 'Justine Mae Tabasan',
      contentText: 'Good afternoon! Sending lab request.',
      visibility: 'Public',
      state: 'Received',
      clientSentAtUtc: '2026-11-25T06:41:00Z',
      attachments: [
        {
          attachmentId: 'att-1',
          fileKey: 'comms/attachments/pat-1/xray.jpg',
          fileName: 'xray.jpg',
          contentType: 'image/jpeg',
          sizeBytes: 24576,
          isClean: true,
        },
      ],
    },
    {
      id: 'msg-staff-1',
      seq: 2,
      conversationId: 'conv-278',
      senderType: 'Staff',
      senderId: 'staff-opd-1',
      senderDisplayName: 'Nextstep OPD',
      contentText: 'Hi, Justine!',
      visibility: 'Public',
      state: 'Received',
      clientSentAtUtc: '2026-11-25T06:48:00Z',
    },
  ];

  it('aligns Patient messages right (isMe) and Staff messages left with sender label when viewerType="Patient"', () => {
    const harness = createHookHarness(() =>
      NativeMessageThread({
        conversationId: 'conv-278',
        conversationTitle: 'Nextstep OPD',
        conversationScope: 'PatientFacility',
        viewerType: 'Patient',
        currentUserId: 'pat-1',
        messages: mixedMessages,
        onSendMessage: async () => {},
        onResendMessage: async () => {},
      })
    );
    const tree = harness.result.current;

    const wrappers = findAllElements(tree, (el) =>
      Array.isArray(el?.props?.style) &&
      el.props.style.some((s: any) => s && (s.alignSelf === 'flex-end' || s.alignSelf === 'flex-start'))
    );
    expect(wrappers.length).toBe(2);
    // First message is Patient -> aligned right (flex-end)
    expect(wrappers[0].props.style.some((s: any) => s?.alignSelf === 'flex-end')).toBe(true);
    // Second message is Staff -> aligned left (flex-start) and shows senderDisplayName "Nextstep OPD"
    expect(wrappers[1].props.style.some((s: any) => s?.alignSelf === 'flex-start')).toBe(true);
    const staffSenderText = findAllElements(wrappers[1], (el) => el?.props?.children === 'Nextstep OPD');
    expect(staffSenderText.length).toBeGreaterThan(0);
  });

  it('aligns Staff own messages right and Patient messages left when viewerType="Staff"', () => {
    const harness = createHookHarness(() =>
      NativeMessageThread({
        conversationId: 'conv-278',
        conversationTitle: 'Justine Mae Tabasan',
        conversationScope: 'PatientFacility',
        viewerType: 'Staff',
        currentUserId: 'staff-opd-1',
        messages: mixedMessages,
        onSendMessage: async () => {},
        onResendMessage: async () => {},
      })
    );
    const tree = harness.result.current;

    const wrappers = findAllElements(tree, (el) =>
      Array.isArray(el?.props?.style) &&
      el.props.style.some((s: any) => s && (s.alignSelf === 'flex-end' || s.alignSelf === 'flex-start'))
    );
    expect(wrappers.length).toBe(2);
    // Patient message is left for staff viewer
    expect(wrappers[0].props.style.some((s: any) => s?.alignSelf === 'flex-start')).toBe(true);
    // Staff own message is right for staff viewer
    expect(wrappers[1].props.style.some((s: any) => s?.alignSelf === 'flex-end')).toBe(true);
  });

  it('renders message attachments and composer attach button when onOpenAttachment & onPickAttachment provided', () => {
    const opened: ThreadAttachment[] = [];
    const harness = createHookHarness(() =>
      NativeMessageThread({
        conversationId: 'conv-278',
        conversationTitle: 'Nextstep OPD',
        conversationScope: 'PatientFacility',
        viewerType: 'Patient',
        currentUserId: 'pat-1',
        messages: mixedMessages,
        onSendMessage: async () => {},
        onResendMessage: async () => {},
        onOpenAttachment: (att: ThreadAttachment) => {
          opened.push(att);
        },
        onPickAttachment: async () => null,
      })
    );
    const tree = harness.result.current;

    const attButton = findAllElements(
      tree,
      (el) => el?.props?.accessibilityLabel === 'Open attachment xray.jpg'
    )[0];
    expect(attButton).toBeDefined();
    expect(Boolean(attButton.props.disabled)).toBe(false);
    attButton.props.onPress();
    expect(opened).toHaveLength(1);
    expect(opened[0].attachmentId).toBe('att-1');

    const attachBtn = findAllElements(
      tree,
      (el) => el?.props?.accessibilityLabel === 'Attach file'
    )[0];
    expect(attachBtn).toBeDefined();
  });

  it('OptimisticStore sorts messages chronologically by sentAtUtc then seq then messageId', () => {
    const store = new OptimisticStore();
    store.appendMessage({
      messageId: 'm-3',
      conversationId: 'conv-1',
      seq: 2,
      senderType: 'Staff',
      senderDisplayName: 'Nextstep OPD',
      contentText: '02:48 reply',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      deliveryState: 'Received',
      sentAtUtc: '2026-11-25T06:48:00Z',
      retentionDeadlineUtc: '2026-12-02T06:48:00Z',
    });
    store.appendMessage({
      messageId: 'm-1',
      conversationId: 'conv-1',
      seq: 1,
      senderType: 'Patient',
      senderDisplayName: 'Justine',
      contentText: '02:41 inquiry',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      deliveryState: 'Received',
      sentAtUtc: '2026-11-25T06:41:00Z',
      retentionDeadlineUtc: '2026-12-02T06:41:00Z',
    });
    store.appendMessage({
      messageId: 'm-2',
      conversationId: 'conv-1',
      seq: 4, // Higher seq from hub, earlier client timestamp
      senderType: 'Patient',
      senderDisplayName: 'Justine',
      contentText: '02:42 Hello?',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      deliveryState: 'Received',
      sentAtUtc: '2026-11-25T06:42:00Z',
      retentionDeadlineUtc: '2026-12-02T06:42:00Z',
    });

    const sorted = store.getMessages('conv-1');
    expect(sorted.map((m) => m.messageId)).toEqual(['m-1', 'm-2', 'm-3']);
  });

  it('SubscriptionTracker.ensureJoined retries joining retained room after Connected transition', async () => {
    const tracker = new SubscriptionTracker();
    const joined: string[] = [];
    let state: 'Connecting' | 'Connected' = 'Connecting';
    const mockClient: any = {
      getConnectionState: () => state,
      joinConversation: async (id: string) => {
        joined.push(id);
      },
      leaveConversation: async () => {},
    };

    await tracker.retainRoom(mockClient, 'conv-retry');
    expect(joined).toHaveLength(0);

    state = 'Connected';
    await tracker.ensureJoined(mockClient, 'conv-retry');
    expect(joined).toEqual(['conv-retry']);

    await tracker.releaseRoom(mockClient, 'conv-retry');
  });
});
