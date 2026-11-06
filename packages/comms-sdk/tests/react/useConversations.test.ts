import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useConversations } from '../../src/react/hooks/useConversations';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { createHookHarness } from './hook-test-harness';

function createMockContext(client = new MockCommsClient(), store = new OptimisticStore(), baseUrl = ''): InternalCommsContextValue {
  return {
    client,
    connectionState: {
      status: 'connected',
      reconnectAttempt: 0,
      lastConnectedAt: new Date(),
      lastDisconnectedAt: null,
      error: null
    },
    activeTicket: { ticket: 'mock-ticket-xyz', expiresAtUtc: new Date().toISOString() },
    tenantId: 'tenant-100',
    facilityId: 'facility-50',
    staffId: 'staff-nurse-1',
    staffDisplayName: 'Nurse Joy',
    baseUrl,
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'mock-ticket-xyz', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('useConversations Hook Backend Wireup', () => {
  it('connects refresh() to GET /api/v1/comms/conversations with Bearer ticket', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: Array<{ url: string; options: any }> = [];

    const mockConversations = [
      {
        id: 'conv-backend-1',
        tenantId: 'tenant-100',
        facilityId: 'facility-50',
        scope: 'Direct',
        kind: 'General',
        title: 'Dr. Santos Consultation',
        status: 'Submitted',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 3,
        lastSeq: 3,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'staff-nurse-1',
        participants: []
      }
    ];

    globalThis.fetch = (async (url: string, options: any) => {
      fetchCalls.push({ url, options });
      return new Response(JSON.stringify(mockConversations), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    try {
      const client = new MockCommsClient();
      const store = new OptimisticStore();
      const mockContext = createMockContext(client, store, 'https://comms.local');

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useConversations('Direct'), {
        contextValues: contextMap
      });

      await harness.result.current.refresh();

      expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
      const getCall = fetchCalls[fetchCalls.length - 1];
      expect(getCall.url).toContain('https://comms.local/api/v1/comms/conversations');
      expect(getCall.url).toContain('facilityId=facility-50');
      expect(getCall.url).toContain('scope=Direct');
      expect(getCall.options.headers['Authorization']).toBe('Bearer mock-ticket-xyz');
      expect(getCall.options.headers['Content-Type']).toBe('application/json');

      expect(harness.result.current.conversations.length).toBe(1);
      expect(harness.result.current.conversations[0].id).toBe('conv-backend-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('connects createConversation() to POST /api/v1/comms/conversations with active staffId', async () => {
    const originalFetch = globalThis.fetch;
    const postCalls: Array<{ url: string; options: any }> = [];

    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        postCalls.push({ url, options });
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          id: 'conv-server-created-777',
          tenantId: body.tenantId,
          facilityId: body.facilityId,
          scope: body.scope,
          kind: body.kind,
          title: body.title,
          status: 'Submitted',
          isEmergencyConfirmed: false,
          isLocalOnly: false,
          reopenCount: 0,
          messageCount: 0,
          lastSeq: 0,
          createdAtUtc: new Date().toISOString(),
          createdBy: 'staff-nurse-1',
          participants: []
        }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    try {
      const client = new MockCommsClient();
      const store = new OptimisticStore();
      const mockContext = createMockContext(client, store, 'https://comms.local');

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useConversations(), {
        contextValues: contextMap
      });

      const created = await harness.result.current.createConversation({
        scope: 'StaffContext',
        title: 'Cardiology Care Team',
        contextType: 'Patient',
        contextId: 'patient-999',
        participantStaffIds: ['staff-doctor-2', 'staff-nurse-1']
      });

      expect(postCalls.length).toBe(1);
      const call = postCalls[0];
      expect(call.url).toBe('https://comms.local/api/v1/comms/conversations');
      expect(call.options.headers['Authorization']).toBe('Bearer mock-ticket-xyz');

      const parsed = JSON.parse(call.options.body);
      expect(parsed.title).toBe('Cardiology Care Team');
      expect(parsed.scope).toBe('StaffContext');
      expect(parsed.contextId).toBe('patient-999');
      expect(created.id).toBe('conv-server-created-777');
      expect(created.createdBy).toBe('staff-nurse-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects createConversation() and rolls back optimistic state on non-2xx', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        return new Response('Bad Request: Invalid participant', {
          status: 400,
          statusText: 'Bad Request'
        });
      }
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }) as any;

    try {
      const client = new MockCommsClient();
      const store = new OptimisticStore();
      const mockContext = createMockContext(client, store, 'https://comms.local');

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useConversations(), {
        contextValues: contextMap
      });

      let failed = false;
      try {
        await harness.result.current.createConversation({
          scope: 'Direct',
          title: 'Direct Chat'
        });
      } catch (err: any) {
        failed = true;
        expect(err.message).toContain('Failed to create conversation: 400 Bad Request');
      }

      expect(failed).toBe(true);
      expect(harness.result.current.conversations.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
