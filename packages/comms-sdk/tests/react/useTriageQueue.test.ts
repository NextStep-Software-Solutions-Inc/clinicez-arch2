import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useTriageQueue } from '../../src/react/hooks/useTriageQueue';
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
    activeTicket: { ticket: 'mock', expiresAtUtc: new Date().toISOString() },
    tenantId: 't1',
    facilityId: 'f1',
    staffId: 'nurse-1',
    staffDisplayName: 'Nurse Joy',
    baseUrl,
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'mock', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('useTriageQueue Hook', () => {
  it('manages triage requests and executes 1-click dispositions', async () => {
    const client = new MockCommsClient();
    const mockContext = createMockContext(client);

    const contextMap = new Map();
    contextMap.set(CommsContext, mockContext);

    const harness = createHookHarness(() => useTriageQueue('facility-1'), {
      contextValues: contextMap
    });

    // Simulate incoming patient inquiry via event
    client.events.emit('conversationCreated', {
      id: 'conv-trg-1',
      tenantId: 't1',
      facilityId: 'facility-1',
      scope: 'PatientFacility',
      kind: 'PatientTriage',
      title: 'Maria Santos',
      category: 'PrescriptionRefill',
      status: 'Submitted',
      priority: 'Emergency',
      isEmergencyConfirmed: true,
      isLocalOnly: false,
      reopenCount: 0,
      messageCount: 1,
      lastSeq: 1,
      createdAtUtc: new Date().toISOString(),
      createdBy: 'patient',
      participants: []
    });

    expect(harness.result.current.items.length).toBe(1);
    expect(harness.result.current.urgentCount).toBe(1);

    // 1-click answer
    const answered = await harness.result.current.answerRequest(
      'conv-trg-1',
      'Refill approved. Please pick up at the dispensary.'
    );
    expect(answered.triageDisposition).toBe('Answered');
    expect(answered.status).toBe('Closed');

    // 1-click decline
    const declined = await harness.result.current.declineRequest(
      'conv-trg-2',
      'OUT_OF_SCOPE',
      'Please consult a dermatologist.'
    );
    expect(declined.triageDisposition).toBe('Declined');
    expect(declined.declineReasonCode).toBe('OUT_OF_SCOPE');

    // 1-click route
    const routed = await harness.result.current.routeToStaff(
      'conv-trg-3',
      'dr-santos',
      'Dr. Santos',
      'Urgent'
    );
    expect(routed.triageDisposition).toBe('Routed');
    expect(routed.assignedStaffId).toBe('dr-santos');
    expect(routed.priority).toBe('Urgent');
  });

  it('connects refresh() to GET /api/v1/comms/conversations?scope=PatientFacility&facilityId=f1 with Bearer token', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: { url: string; options: any }[] = [];

    const mockConversations = [
      {
        id: 'conv-fetched-1',
        tenantId: 't1',
        facilityId: 'f1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Juan Dela Cruz',
        category: 'General',
        status: 'Submitted',
        priority: 'Urgent',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
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

      const harness = createHookHarness(() => useTriageQueue('f1'), {
        contextValues: contextMap
      });

      // Manual refresh call
      await harness.result.current.refresh();

      // Verify fetch was called with correct URL and headers
      const getCall = fetchCalls.find(
        (c) => c.url.includes('/api/v1/comms/conversations') && c.options?.method === 'GET'
      );
      expect(getCall).toBeDefined();
      expect(getCall!.url).toBe('https://comms.local/api/v1/comms/conversations?scope=PatientFacility&facilityId=f1');
      expect(getCall!.options.headers['Authorization']).toBe('Bearer mock');

      // Verify conversation was stored and mapped to queue
      expect(harness.result.current.items.length).toBe(1);
      expect(harness.result.current.items[0].conversationId).toBe('conv-fetched-1');
      expect(harness.result.current.items[0].patientNameMasked).toBe('Juan D***');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('connects recordDisposition() to POST /api/v1/comms/triage/:id/disposition with Bearer token and full payload', async () => {
    const originalFetch = globalThis.fetch;
    const postCalls: { url: string; options: any }[] = [];

    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        postCalls.push({ url, options });
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
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

      const harness = createHookHarness(() => useTriageQueue('f1'), {
        contextValues: contextMap
      });

      // Pre-seed a conversation via client event
      client.events.emit('conversationCreated', {
        id: 'conv-disp-1',
        tenantId: 't1',
        facilityId: 'f1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Pedro Penduko',
        category: 'FollowUp',
        status: 'Submitted',
        priority: 'Emergency',
        isEmergencyConfirmed: true,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
        participants: []
      });

      // Record a disposition with full details
      await harness.result.current.recordDisposition('conv-disp-1', 'NeedsVisit', 'Patient needs in-person examination', {
        priority: 'Emergency',
        internalNote: 'Patient needs in-person examination',
        publicResponseText: 'Please visit Clinic Room 204 today.',
        assignedStaffId: 'dr-garcia',
        assignedStaffName: 'Dr. Garcia'
      });

      expect(postCalls.length).toBe(1);
      const postCall = postCalls[0];
      expect(postCall.url).toBe('https://comms.local/api/v1/comms/triage/conv-disp-1/disposition');
      expect(postCall.options.headers['Authorization']).toBe('Bearer mock');
      expect(postCall.options.headers['Content-Type']).toBe('application/json');

      const body = JSON.parse(postCall.options.body);
      expect(body.action).toBe('NeedsVisit');
      expect(body.disposition).toBe('NeedsVisit');
      expect(body.priority).toBe('Emergency');
      expect(body.internalNote).toBe('Patient needs in-person examination');
      expect(body.publicMessage).toBe('Please visit Clinic Room 204 today.');
      expect(body.publicResponseText).toBe('Please visit Clinic Room 204 today.');
      expect(body.assignedStaffId).toBe('dr-garcia');
      expect(body.assignedStaffName).toBe('Dr. Garcia');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sets error state and prevents empty queue display when refresh() returns non-2xx', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response('Internal Server Error', {
        status: 500,
        statusText: 'Internal Server Error'
      });
    }) as any;

    try {
      const client = new MockCommsClient();
      const store = new OptimisticStore();
      const mockContext = createMockContext(client, store, 'https://comms.local');

      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useTriageQueue('f1'), {
        contextValues: contextMap
      });

      await harness.result.current.refresh();

      expect(harness.result.current.error).toBeDefined();
      expect(harness.result.current.error?.message).toBe('Failed to fetch triage queue: 500 Internal Server Error');
      expect(harness.result.current.isLoading).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects recordDisposition() and rolls back optimistic state on non-2xx response', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        return new Response('Forbidden', {
          status: 403,
          statusText: 'Forbidden'
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

      const harness = createHookHarness(() => useTriageQueue('f1'), {
        contextValues: contextMap
      });

      await harness.result.current.refresh();

      client.events.emit('conversationCreated', {
        id: 'conv-fail-1',
        tenantId: 't1',
        facilityId: 'f1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Carlos Yulo',
        category: 'FollowUp',
        status: 'Submitted',
        priority: 'Emergency',
        isEmergencyConfirmed: true,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
        participants: []
      });

      expect(harness.result.current.items.length).toBe(1);
      expect(harness.result.current.items[0].status).toBe('Submitted');

      let thrownError: Error | null = null;
      try {
        await harness.result.current.recordDisposition('conv-fail-1', 'Answered', 'Response text');
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toBe('Failed to record triage disposition: 403 Forbidden');

      // Optimistic state must be rolled back: conversation remains in queue with 'Submitted' status
      expect(harness.result.current.items.length).toBe(1);
      expect(harness.result.current.items[0].id).toBe('conv-fail-1');
      expect(harness.result.current.items[0].status).toBe('Submitted');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects recordDisposition() and rolls back optimistic state on network failure', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, options: any) => {
      if (options?.method === 'POST') {
        throw new Error('Network connection offline');
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

      const harness = createHookHarness(() => useTriageQueue('f1'), {
        contextValues: contextMap
      });

      await harness.result.current.refresh();

      client.events.emit('conversationCreated', {
        id: 'conv-net-fail',
        tenantId: 't1',
        facilityId: 'f1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Ana Ramos',
        category: 'FollowUp',
        status: 'Submitted',
        priority: 'Urgent',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
        participants: []
      });

      expect(harness.result.current.items.length).toBe(1);

      let thrownError: Error | null = null;
      try {
        await harness.result.current.recordDisposition('conv-net-fail', 'NeedsVisit');
      } catch (err: any) {
        thrownError = err;
      }

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toBe('Network connection offline');

      // Optimistic state must be rolled back: conversation remains in queue
      expect(harness.result.current.items.length).toBe(1);
      expect(harness.result.current.items[0].id).toBe('conv-net-fail');
      expect(harness.result.current.items[0].status).toBe('Submitted');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
