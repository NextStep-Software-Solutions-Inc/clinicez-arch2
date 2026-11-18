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

  it('auto-enrolls creator with staffDisplayName and preserves recipient in Direct conversations', async () => {
    const originalFetch = globalThis.fetch;
    const postCalls: Array<{ url: string; options: any }> = [];

    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        postCalls.push({ url, options });
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          id: 'conv-direct-101',
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
          participants: body.participants || []
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

      // Pass only recipient ID in participantStaffIds
      const created = await harness.result.current.createConversation({
        scope: 'Direct',
        title: 'Chat with Wave Ambray',
        participantStaffIds: ['staff-wave-2']
      });

      expect(postCalls.length).toBe(1);
      const payload = JSON.parse(postCalls[0].options.body);

      // Verify payload has BOTH creator (staff-nurse-1 / Nurse Joy) and recipient (staff-wave-2)
      expect(payload.participants).toBeDefined();
      expect(payload.participants.length).toBe(2);

      const creatorInPayload = payload.participants.find((p: any) => p.participantId === 'staff-nurse-1');
      expect(creatorInPayload).toBeDefined();
      expect(creatorInPayload.displayName).toBe('Nurse Joy');
      expect(creatorInPayload.role).toBe('Owner');

      const recipientInPayload = payload.participants.find((p: any) => p.participantId === 'staff-wave-2');
      expect(recipientInPayload).toBeDefined();
      expect(recipientInPayload.role).toBe('Member');

      // Verify created result also contains both participants
      expect(created.participants.length).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('creates Facility conversation with department room name without sending category enum and binds contextType/contextId (#182)', async () => {
    const originalFetch = globalThis.fetch;
    const postCalls: Array<{ url: string; options: any }> = [];

    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        postCalls.push({ url, options });
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          id: 'conv-server-facility-888',
          tenantId: body.tenantId,
          facilityId: body.facilityId,
          scope: body.scope,
          kind: body.kind,
          title: body.title,
          contextType: body.contextType,
          contextId: body.contextId,
          category: body.category,
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
        scope: 'Facility',
        title: 'Room 1 Channel',
        department: 'Room 1'
      });

      expect(postCalls.length).toBe(1);
      const call = postCalls[0];
      const parsed = JSON.parse(call.options.body);

      // Invariants: Category must be null (not "Room 1"), contextType mapped to Department, contextId mapped to Room 1
      expect(parsed.title).toBe('Room 1 Channel');
      expect(parsed.scope).toBe('Facility');
      expect(parsed.contextType).toBe('Department');
      expect(parsed.contextId).toBe('Room 1');
      expect(parsed.category).toBeNull();

      expect(created.id).toBe('conv-server-facility-888');
      expect(created.contextType).toBe('Department');
      expect(created.contextId).toBe('Room 1');
      expect(created.category).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sanitizes invalid or free-text category into null before sending to backend to prevent 400 Bad Request (#182)', async () => {
    const originalFetch = globalThis.fetch;
    const postCalls: Array<{ url: string; options: any }> = [];

    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        postCalls.push({ url, options });
        const body = JSON.parse(options.body);
        return new Response(JSON.stringify({
          id: 'conv-sanitized-999',
          tenantId: body.tenantId,
          facilityId: body.facilityId,
          scope: body.scope,
          title: body.title,
          category: body.category,
          status: 'Submitted',
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

      // Pass an invalid free-text category that is not a valid MessageCategory enum
      const created = await harness.result.current.createConversation({
        scope: 'Facility',
        title: 'Triage Station Channel',
        contextType: 'Department',
        contextId: 'Triage Station',
        category: 'Triage Station' as any
      });

      expect(postCalls.length).toBe(1);
      const call = postCalls[0];
      const parsed = JSON.parse(call.options.body);

      // Free-text category must be sanitized to null
      expect(parsed.category).toBeNull();
      expect(created.id).toBe('conv-sanitized-999');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('markConversationRead optimistically zeros unreadCount and posts to /read (#158)', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string; body?: any }> = [];

    const initialConversations = [
      {
        id: 'conv-read-1',
        tenantId: 'tenant-100',
        facilityId: 'facility-50',
        scope: 'Direct',
        kind: 'Direct',
        title: 'Dr. Santos',
        status: 'Submitted',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 4,
        unreadCount: 3,
        lastSeq: 4,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'staff-doc-2',
        participants: []
      }
    ];

    globalThis.fetch = (async (url: string, options: any) => {
      const method = options?.method ?? 'GET';
      calls.push({ url, method, body: options?.body ? JSON.parse(options.body) : undefined });
      if (url.endsWith('/read') && method === 'POST') {
        return new Response(JSON.stringify({ conversationId: 'conv-read-1', unreadCount: 0 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(initialConversations), {
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

      await harness.result.current.refresh();
      expect(harness.result.current.unreadCount).toBe(3);
      expect(harness.result.current.conversations[0].unreadCount).toBe(3);

      await harness.result.current.markConversationRead('conv-read-1', 'msg-44');

      expect(harness.result.current.conversations[0].unreadCount).toBe(0);
      expect(harness.result.current.unreadCount).toBe(0);

      const readCall = calls.find((c) => c.method === 'POST' && c.url.endsWith('/api/v1/comms/conversations/conv-read-1/read'));
      expect(readCall).toBeDefined();
      expect(readCall?.body).toEqual({ lastReadMessageId: 'msg-44' });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('setConversationMuted optimistically updates staff participant isMuted, patches /mute, and rolls back on failure (#158)', async () => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; method: string; body?: any }> = [];
    let shouldFailMute = false;

    const initialConversations = [
      {
        id: 'conv-mute-1',
        tenantId: 'tenant-100',
        facilityId: 'facility-50',
        scope: 'Facility',
        kind: 'General',
        title: 'Nurses Station',
        status: 'Submitted',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        unreadCount: 0,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'staff-nurse-1',
        participants: [
          {
            id: 'part-1',
            userId: 'staff-nurse-1',
            participantId: 'staff-nurse-1',
            displayName: 'Nurse Joy',
            role: 'Owner',
            joinedAtUtc: new Date().toISOString(),
            isMuted: false
          },
          {
            id: 'part-2',
            userId: 'staff-doc-2',
            participantId: 'staff-doc-2',
            displayName: 'Dr. Santos',
            role: 'Member',
            joinedAtUtc: new Date().toISOString(),
            isMuted: false
          }
        ]
      }
    ];

    globalThis.fetch = (async (url: string, options: any) => {
      const method = options?.method ?? 'GET';
      calls.push({ url, method, body: options?.body ? JSON.parse(options.body) : undefined });
      if (url.endsWith('/mute') && method === 'PATCH') {
        if (shouldFailMute) {
          return new Response('Server Error', { status: 500, statusText: 'Internal Server Error' });
        }
        const parsed = JSON.parse(options.body);
        return new Response(JSON.stringify({
          id: 'part-1',
          participantId: 'staff-nurse-1',
          displayName: 'Nurse Joy',
          role: 'Owner',
          joinedAtUtc: initialConversations[0].participants[0].joinedAtUtc,
          isMuted: parsed.isMuted
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify(initialConversations), {
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

      await harness.result.current.refresh();

      await harness.result.current.setConversationMuted('conv-mute-1', true);
      const convAfterMute = harness.result.current.conversations[0];
      expect(convAfterMute.isMuted).toBe(true);
      expect(convAfterMute.participants.find((p) => p.participantId === 'staff-nurse-1')?.isMuted).toBe(true);
      expect(convAfterMute.participants.find((p) => p.participantId === 'staff-doc-2')?.isMuted).toBe(false);

      const muteCall = calls.find((c) => c.method === 'PATCH' && c.url.endsWith('/api/v1/comms/conversations/conv-mute-1/mute'));
      expect(muteCall).toBeDefined();
      expect(muteCall?.body).toEqual({ isMuted: true });

      // Simulate server error when unmuting -> should rollback to muted=true
      shouldFailMute = true;
      let failed = false;
      try {
        await harness.result.current.setConversationMuted('conv-mute-1', false);
      } catch {
        failed = true;
      }
      expect(failed).toBe(true);
      expect(harness.result.current.conversations[0].isMuted).toBe(true);
      expect(harness.result.current.conversations[0].participants.find((p) => p.participantId === 'staff-nurse-1')?.isMuted).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('increments unreadCount on incoming messageReceived only when sender is not current staff (#158)', async () => {
    const client = new MockCommsClient();
    const store = new OptimisticStore();
    const mockContext = createMockContext(client, store, '');

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useConversations(), {
      contextValues: contextMap
    });

    client.events.emit('conversationCreated', {
      id: 'conv-live-unread',
      tenantId: 'tenant-100',
      facilityId: 'facility-50',
      scope: 'Direct',
      kind: 'Direct',
      title: 'Dr. Santos',
      status: 'Submitted',
      isEmergencyConfirmed: false,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 0,
      unreadCount: 0,
      lastSeq: 0,
      createdAtUtc: new Date().toISOString(),
      createdBy: 'staff-nurse-1',
      participants: []
    });

    // Own message -> unreadCount stays 0
    client.events.emit('messageReceived', {
      messageId: 'm-own-1',
      conversationId: 'conv-live-unread',
      seq: 1,
      clientMessageId: 'c1',
      senderType: 'Staff',
      senderId: 'staff-nurse-1',
      senderDisplayName: 'Nurse Joy',
      contentText: 'Hello Doctor',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Waiting',
      sentAtUtc: new Date().toISOString()
    });
    expect(harness.result.current.conversations[0].unreadCount).toBe(0);

    // Other sender message -> unreadCount increments to 1
    client.events.emit('messageReceived', {
      messageId: 'm-other-2',
      conversationId: 'conv-live-unread',
      seq: 2,
      clientMessageId: 'c2',
      senderType: 'Staff',
      senderId: 'staff-doc-2',
      senderDisplayName: 'Dr. Santos',
      contentText: 'On my way',
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Waiting',
      sentAtUtc: new Date().toISOString()
    });
    expect(harness.result.current.conversations[0].unreadCount).toBe(1);
    expect(harness.result.current.unreadCount).toBe(1);

    harness.unmount();
  });
});
