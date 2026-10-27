import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useSendMessage } from '../../src/react/hooks/useSendMessage';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { createHookHarness } from './hook-test-harness';

function createMockContext(client = new MockCommsClient(), store = new OptimisticStore()): InternalCommsContextValue {
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
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('useSendMessage Hook', () => {
  it('optimistically inserts message and tracks clientMessageId', async () => {
    const client = new MockCommsClient();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useSendMessage(), {
      contextValues: contextMap
    });

    const msg = await harness.result.current.sendMessage({
      conversationId: 'conv-123',
      contentText: 'Patient has arrived for checkup',
      visibility: 'Public'
    });

    expect(msg).toBeDefined();
    expect(msg.contentText).toBe('Patient has arrived for checkup');
    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].conversationId).toBe('conv-123');
    expect(client.sentMessages[0].clientMessageId).toBeDefined();

    // Check message in store
    const stored = store.getMessages('conv-123');
    expect(stored.length).toBeGreaterThanOrEqual(1);
  });

  it('preserves exact same clientMessageId on single-tap resend', async () => {
    const client = new MockCommsClient();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store);

    // Fail first attempt
    let attempts = 0;
    const orig = client.sendMessage.bind(client);
    client.sendMessage = async (req) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Signal lost');
      }
      return orig(req);
    };

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useSendMessage(), {
      contextValues: contextMap
    });

    // 1st attempt fails
    try {
      await harness.result.current.sendMessage({
        conversationId: 'conv-456',
        contentText: 'Prescription ready',
        clientMessageId: 'my-custom-uuid-999'
      });
    } catch {
      // Expected failure
    }

    const pending = store.getPending('conv-456');
    expect(pending.length).toBe(1);
    expect(pending[0].state).toBe('NotReceived');
    expect(pending[0].clientMessageId).toBe('my-custom-uuid-999');

    // Resend message
    const resubmitted = await harness.result.current.resendMessage('my-custom-uuid-999');
    expect(resubmitted.clientMessageId).toBe('my-custom-uuid-999');
    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].clientMessageId).toBe('my-custom-uuid-999');
  });
});
