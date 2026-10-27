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
  tracker = new SubscriptionTracker()
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
});
