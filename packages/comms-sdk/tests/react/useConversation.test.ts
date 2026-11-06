import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useConversation } from '../../src/react/hooks/useConversation';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { createHookHarness } from './hook-test-harness';

function createMockContext(
  client = new MockCommsClient(),
  store = new OptimisticStore(),
  tracker = new SubscriptionTracker(),
  baseUrl = ''
): InternalCommsContextValue {
  return {
    client,
    connectionState: {
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: new Date(),
      lastDisconnectedAt: null,
      error: null
    },
    activeTicket: { ticket: 'mock', expiresAtUtc: new Date().toISOString() },
    tenantId: 't1',
    facilityId: 'f1',
    staffId: 'staff-42',
    staffDisplayName: 'Dr. Reyes',
    baseUrl,
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'mock', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: tracker
  };
}

describe('useConversation Hook', () => {
  it('retains room in SubscriptionTracker on mount and releases on unmount', () => {
    const client = new MockCommsClient();
    const tracker = new SubscriptionTracker();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store, tracker);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useConversation('conv-room-1'), {
      contextValues: contextMap
    });

    expect(tracker.getRefCount('conv-room-1')).toBe(1);
    expect(client.joinedRooms.has('conv-room-1')).toBe(true);

    harness.unmount();
    expect(tracker.getRefCount('conv-room-1')).toBe(0);
  });

  it('supports acknowledgeMessage, sendReaction, and confirmDelivery', async () => {
    const client = new MockCommsClient();
    const tracker = new SubscriptionTracker();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store, tracker);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useConversation('conv-room-2'), {
      contextValues: contextMap
    });

    await harness.result.current.acknowledgeMessage('msg-101');
    expect(client.acknowledgedMessageIds).toContain('msg-101');

    await harness.result.current.sendReaction('msg-101', '👍');
    expect(client.sentReactions.some((r) => r.messageId === 'msg-101' && r.reaction === '👍')).toBe(true);

    await harness.result.current.confirmDelivery('msg-101');
    expect(client.confirmedDeliveryMessageIds).toContain('msg-101');
  });

  it('hydrates persisted message history from client.getMessagesAfterSeq on mount', async () => {
    const client = new MockCommsClient();
    const persistedMessages = [
      {
        messageId: 'msg-persisted-1',
        conversationId: 'conv-persisted-1',
        seq: 1,
        senderType: 'Staff',
        senderId: 'staff-1',
        senderDisplayName: 'Dr. Santos',
        contentText: 'Initial lab report received',
        visibility: 'Public',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: [],
        deliveryState: 'Waiting',
        sentAtUtc: new Date().toISOString()
      },
      {
        messageId: 'msg-persisted-2',
        conversationId: 'conv-persisted-1',
        seq: 2,
        senderType: 'Staff',
        senderId: 'staff-2',
        senderDisplayName: 'Nurse Joy',
        contentText: 'Vitals charted: BP 120/80',
        visibility: 'Public',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: [],
        deliveryState: 'Received',
        sentAtUtc: new Date().toISOString()
      }
    ];

    client.getMessagesAfterSeq = async (convId: string, seq: number) => {
      if (convId === 'conv-persisted-1') return persistedMessages as any;
      return [];
    };

    const tracker = new SubscriptionTracker();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store, tracker);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useConversation('conv-persisted-1'), {
      contextValues: contextMap
    });

    // Allow async refresh on mount to resolve
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.result.current.messages.length).toBe(2);
    expect(harness.result.current.messages[0].contentText).toBe('Initial lab report received');
    expect(harness.result.current.messages[1].contentText).toBe('Vitals charted: BP 120/80');
  });

  it('fetches conversation metadata from baseUrl /api/v1/comms/conversations/:id', async () => {
    const originalFetch = globalThis.fetch;
    const mockConv = {
      id: 'conv-meta-99',
      tenantId: 't1',
      facilityId: 'f1',
      scope: 'Facility',
      kind: 'General',
      title: 'Emergency Response Channel',
      status: 'Submitted',
      isEmergencyConfirmed: true,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 5,
      lastSeq: 5,
      createdAtUtc: new Date().toISOString(),
      participants: []
    };

    globalThis.fetch = (async (url: string) => {
      if (url.includes('/api/v1/comms/conversations/conv-meta-99')) {
        return {
          ok: true,
          status: 200,
          json: async () => mockConv
        };
      }
      return { ok: false, status: 404 };
    }) as any;

    try {
      const client = new MockCommsClient();
      const tracker = new SubscriptionTracker();
      const store = new OptimisticStore();
      const mockContext = createMockContext(client, store, tracker, 'https://comms.test');

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useConversation('conv-meta-99'), {
        contextValues: contextMap
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(harness.result.current.conversation).not.toBeNull();
      expect(harness.result.current.conversation?.title).toBe('Emergency Response Channel');
      expect(harness.result.current.conversation?.isEmergencyConfirmed).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
