import { describe, expect, it } from 'bun:test';
import { ConnectionError } from '../../src/core/errors';
import { ClientMessageQueue } from '../../src/core/queue/ClientMessageQueue';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { CommsProvider } from '../../src/react/CommsProvider';
import { useSendMessage } from '../../src/react/hooks/useSendMessage';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { createHookHarness } from './hook-test-harness';

function createMockContext(
  client = new MockCommsClient(),
  store = new OptimisticStore(),
  messageQueue = new ClientMessageQueue(client)
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
    baseUrl: 'https://comms.local',
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'mock', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker(),
    messageQueue
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

  it('buffers messages in ClientMessageQueue during Reconnecting with identical clientMessageId and auto-flushes upon Connected', async () => {
    const client = new MockCommsClient();
    client.connectionState = 'Reconnecting';
    const store = new OptimisticStore();
    const queue = new ClientMessageQueue(client);
    const mockContext = createMockContext(client, store, queue);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useSendMessage(), {
      contextValues: contextMap
    });

    const sent = await harness.result.current.sendMessage({
      conversationId: 'conv-offline-1',
      contentText: 'Queued while reconnecting',
      clientMessageId: 'offline-uuid-111'
    });

    // Should stay Sending in store & queue and NOT call client.sendMessage yet
    expect(sent.messageId).toBe('opt-offline-uuid-111');
    expect(sent.deliveryState).toBe('Sending');
    expect(client.sentMessages.length).toBe(0);
    expect(queue.get('offline-uuid-111')?.state).toBe('Sending');
    expect(store.getMessages('conv-offline-1').length).toBe(1);
    expect(store.getMessages('conv-offline-1')[0].messageId).toBe('opt-offline-uuid-111');
    expect(store.getMessages('conv-offline-1')[0].deliveryState).toBe('Sending');
    expect(store.getPending('conv-offline-1')[0].state).toBe('Sending');

    // Now transition client to Connected -> ClientMessageQueue auto-flushes
    client.connectionState = 'Connected';
    client.events.emit('connectionStateChanged', 'Connected');

    await new Promise((r) => setTimeout(r, 20));

    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].clientMessageId).toBe('offline-uuid-111');
    expect(queue.get('offline-uuid-111')?.state).toBe('Waiting');

    // Optimistic message opt-offline-uuid-111 must be replaced by server message in store
    const msgs = store.getMessages('conv-offline-1');
    expect(msgs.length).toBe(1);
    expect(msgs[0].messageId).toBe('srv-offline-uuid-111');
    expect(msgs[0].clientMessageId).toBe('offline-uuid-111');
    expect(msgs[0].deliveryState).toBe('Waiting');
    expect(store.getPending('conv-offline-1').length).toBe(0);

    harness.unmount();
  });

  it('enqueues into ClientMessageQueue when ConnectionError occurs mid-send and flushes on Connected', async () => {
    const client = new MockCommsClient();
    const store = new OptimisticStore();
    const queue = new ClientMessageQueue(client);
    const mockContext = createMockContext(client, store, queue);

    let failWithConnError = true;
    const origSend = client.sendMessage.bind(client);
    client.sendMessage = async (req) => {
      if (failWithConnError) {
        throw new ConnectionError('Socket closed mid-send');
      }
      return origSend(req);
    };

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useSendMessage(), {
      contextValues: contextMap
    });

    const result = await harness.result.current.sendMessage({
      conversationId: 'conv-conn-drop',
      contentText: 'Race condition message',
      clientMessageId: 'conn-drop-uuid-222'
    });

    expect(result.messageId).toBe('opt-conn-drop-uuid-222');
    expect(result.deliveryState).toBe('Sending');
    expect(queue.get('conn-drop-uuid-222')?.state).toBe('Sending');
    expect(store.getMessages('conv-conn-drop')[0].deliveryState).toBe('Sending');

    // Reconnect and allow send to succeed
    failWithConnError = false;
    client.events.emit('connectionStateChanged', 'Connected');
    await new Promise((r) => setTimeout(r, 20));

    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].clientMessageId).toBe('conn-drop-uuid-222');
    const finalMsgs = store.getMessages('conv-conn-drop');
    expect(finalMsgs.length).toBe(1);
    expect(finalMsgs[0].messageId).toBe('srv-conn-drop-uuid-222');
    expect(finalMsgs[0].deliveryState).toBe('Waiting');

    harness.unmount();
  });

  it('CommsProvider instantiates shared ClientMessageQueue on context and syncs flushed messages into OptimisticStore', async () => {
    const client = new MockCommsClient();
    client.connectionState = 'Disconnected';

    const providerHarness = createHookHarness(() =>
      CommsProvider({
        baseUrl: 'https://comms.local',
        getCommsTicket: async () => ({ ticket: 't', expiresAtUtc: new Date().toISOString() }),
        tenantId: 't1',
        facilityId: 'f1',
        staffId: 'staff-42',
        staffDisplayName: 'Dr. Reyes',
        options: { autoConnect: false },
        client,
        children: null
      })
    );

    const providedValue = (providerHarness.result.current as any)?.props?.value as InternalCommsContextValue;
    expect(providedValue).toBeDefined();
    expect(providedValue.messageQueue).toBeInstanceOf(ClientMessageQueue);

    const contextMap = new Map();
    contextMap.set(CommsContext, providedValue);

    const sendHarness = createHookHarness(() => useSendMessage(), {
      contextValues: contextMap
    });

    await sendHarness.result.current.sendMessage({
      conversationId: 'conv-provider-1',
      contentText: 'Buffered via CommsProvider queue',
      clientMessageId: 'provider-cid-1'
    });

    expect(providedValue.store.getMessages('conv-provider-1')[0].messageId).toBe('opt-provider-cid-1');
    expect(providedValue.store.getMessages('conv-provider-1')[0].deliveryState).toBe('Sending');

    // Unmount sendHarness before reconnect to prove CommsProvider itself syncs store on flush
    sendHarness.unmount();

    client.connectionState = 'Connected';
    client.events.emit('connectionStateChanged', 'Connected');
    await new Promise((r) => setTimeout(r, 20));

    const synced = providedValue.store.getMessages('conv-provider-1');
    expect(synced.length).toBe(1);
    expect(synced[0].messageId).toBe('srv-provider-cid-1');
    expect(synced[0].deliveryState).toBe('Waiting');

    providerHarness.unmount();
  });
});
