import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useComms } from '../../src/react/hooks/useComms';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { createHookHarness } from './hook-test-harness';

function createMockContext(client = new MockCommsClient()): InternalCommsContextValue {
  return {
    client,
    connectionState: {
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: new Date(),
      lastDisconnectedAt: null,
      error: null
    },
    activeTicket: {
      ticket: 'mock.ticket',
      expiresAtUtc: new Date(Date.now() + 300000).toISOString()
    },
    tenantId: 'tenant-test',
    facilityId: 'facility-test',
    staffId: 'staff-1',
    staffDisplayName: 'Dr. Santos',
    connect: async () => {},
    disconnect: async () => {
      await client.disconnect();
    },
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'new.ticket', expiresAtUtc: new Date().toISOString() }),
    store: new OptimisticStore(),
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('useComms Hook', () => {
  it('exposes connection status and allows disconnect', async () => {
    const mockClient = new MockCommsClient();
    const mockContext = createMockContext(mockClient);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useComms(), {
      contextValues: contextMap
    });

    expect(harness.result.current.isConnected).toBe(true);
    expect(harness.result.current.status).toBe('connected');
    expect(harness.result.current.activeTicket?.ticket).toBe('mock.ticket');

    await harness.result.current.disconnect();
    expect(mockClient.getConnectionState()).toBe('Disconnected');
  });
});
