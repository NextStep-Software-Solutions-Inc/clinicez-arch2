import { describe, expect, it } from 'bun:test';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useTriageQueue } from '../../src/react/hooks/useTriageQueue';
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
    staffId: 'nurse-1',
    staffDisplayName: 'Nurse Joy',
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
});
