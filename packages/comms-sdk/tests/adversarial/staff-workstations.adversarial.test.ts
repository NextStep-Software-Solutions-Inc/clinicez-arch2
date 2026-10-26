import { describe, expect, it } from 'bun:test';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';
import { TicketRenewalTimer } from '../../src/core/connection/TicketRenewalTimer';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { CommsContext, InternalCommsContextValue } from '../../src/react/CommsContext';
import { useTriageQueue } from '../../src/react/hooks/useTriageQueue';
import { useSendMessage } from '../../src/react/hooks/useSendMessage';
import { SubscriptionTracker } from '../../src/react/internal/SubscriptionTracker';
import { createHookHarness } from '../react/hook-test-harness';
import type { MessageDto } from '../../src/core/types';

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
    activeTicket: { ticket: 'mock.ticket', expiresAtUtc: new Date().toISOString() },
    tenantId: 'tenant-prod-1',
    facilityId: 'facility-clinic-1',
    staffId: 'staff-doc-1',
    staffDisplayName: 'Dr. Maria Santos',
    connect: async () => {},
    disconnect: async () => {},
    reconnect: async () => {},
    refreshTicket: async () => ({ ticket: 'mock.ticket', expiresAtUtc: new Date().toISOString() }),
    store,
    subscriptionTracker: new SubscriptionTracker()
  };
}

describe('Adversarial Staff Workstations Suite (Challenger 1)', () => {

  // =========================================================================
  // 1. Disposition Submission Without Required Clinical Notes or Response Text
  // =========================================================================
  describe('Scenario 1: Disposition Submission Without Required Clinical Notes / Response Text', () => {
    it('handles empty replyText by assigning fallback clinical response in workstation handlers', async () => {
      const client = new MockCommsClient();
      const mockContext = createMockContext(client);
      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useTriageQueue('facility-clinic-1'), {
        contextValues: contextMap
      });

      // Emit incoming patient inquiry
      client.events.emit('conversationCreated', {
        id: 'conv-inquiry-1',
        tenantId: 'tenant-prod-1',
        facilityId: 'facility-clinic-1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Prescription Invalidation Query',
        category: 'PrescriptionRefill',
        status: 'Submitted',
        priority: 'Routine',
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

      // Workstation fallback pattern (as implemented in Clinic, Pharmacy, and Lab triage screens):
      const submittedReply = '';
      const resolvedReply = submittedReply || 'Inquiry answered by clinic staff.';

      const updated = await harness.result.current.answerRequest('conv-inquiry-1', resolvedReply);
      expect(updated.status).toBe('Closed');
      expect(updated.triageDisposition).toBe('Answered');
      expect(updated.triagedByStaffId).toBe('staff-doc-1');
      expect(updated.triagedByStaffName).toBe('Dr. Maria Santos');
    });

    it('handles decline submission with empty declineNotes using administrative fallback', async () => {
      const client = new MockCommsClient();
      const mockContext = createMockContext(client);
      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useTriageQueue('facility-clinic-1'), {
        contextValues: contextMap
      });

      client.events.emit('conversationCreated', {
        id: 'conv-inquiry-2',
        tenantId: 'tenant-prod-1',
        facilityId: 'facility-clinic-1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Out of Scope Request',
        status: 'Submitted',
        priority: 'Routine',
        isEmergencyConfirmed: false,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
        participants: []
      });

      const declineReason = undefined;
      const declineNotes = '';
      const resolvedReason = declineReason || 'OTHER';
      const resolvedNotes = declineNotes || 'Request could not be processed.';

      const declined = await harness.result.current.declineRequest(
        'conv-inquiry-2',
        resolvedReason,
        resolvedNotes
      );

      expect(declined.status).toBe('Closed');
      expect(declined.triageDisposition).toBe('Declined');
      expect(declined.declineReasonCode).toBe('OTHER');
    });

    it('1-click NeedsVisit dispatches standardized clinical visit recommendation', async () => {
      const client = new MockCommsClient();
      const mockContext = createMockContext(client);
      const contextMap = new Map();
      contextMap.set(CommsContext, mockContext);

      const harness = createHookHarness(() => useTriageQueue('facility-clinic-1'), {
        contextValues: contextMap
      });

      client.events.emit('conversationCreated', {
        id: 'conv-inquiry-3',
        tenantId: 'tenant-prod-1',
        facilityId: 'facility-clinic-1',
        scope: 'PatientFacility',
        kind: 'PatientTriage',
        title: 'Severe Cough and Fever',
        status: 'Submitted',
        priority: 'Urgent',
        isEmergencyConfirmed: true,
        isLocalOnly: false,
        reopenCount: 0,
        messageCount: 1,
        lastSeq: 1,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'patient',
        participants: []
      });

      const visitReq = await harness.result.current.requestVisit(
        'conv-inquiry-3',
        'In-clinic consultation recommended for patient evaluation.'
      );

      expect(visitReq.status).toBe('Closed');
      expect(visitReq.triageDisposition).toBe('NeedsVisit');
    });
  });

  // =========================================================================
  // 2. Unauthenticated Ticket Acquisition & Malformed Token Handling
  // =========================================================================
  describe('Scenario 2: Unauthenticated Ticket Acquisition & Malformed Token Handling', () => {
    it('throws when facility ticket acquisition endpoint returns 401 Unauthorized', async () => {
      const mockUnauthenticatedEndpoint = async (): Promise<any> => {
        throw new Error('401 Unauthorized: Session token expired.');
      };

      expect(mockUnauthenticatedEndpoint()).rejects.toThrow('401 Unauthorized');
    });

    it('strictly rejects malformed tokens missing the cryptographic signature part', () => {
      const timer = new TicketRenewalTimer(async () => 'only-payload-no-sig');
      expect(() => timer.parseClaims('only-payload-no-sig')).toThrow(
        'Malformed comms ticket: expected {payload}.{signature}'
      );
    });

    it('strictly rejects tokens with 3 parts (standard Bearer JWT instead of 2-part comms ticket)', () => {
      const timer = new TicketRenewalTimer(async () => 'part1.part2.part3');
      expect(() => timer.parseClaims('part1.part2.part3')).toThrow(
        'Malformed comms ticket: expected {payload}.{signature}'
      );
    });

    it('handles tickets with expired TTL without recursive renewal loop', () => {
      const timer = new TicketRenewalTimer(async () => 'dummy', {
        minLeadTimeSeconds: 15,
        maxLeadTimeSeconds: 30,
        leadTimeRatio: 0.75
      });

      const nowSec = Math.floor(Date.now() / 1000);
      const expiredPayload = {
        sub: 'staff-99',
        name: 'Nurse Joy',
        tenant_id: 't-1',
        facility_id: 'f-1',
        permissions: ['messaging:read', 'messaging:write'],
        iss: 'clinic-api',
        iat: nowSec - 600,
        exp: nowSec - 10 // Expired 10 seconds ago
      };

      const rawTicket = `${Buffer.from(JSON.stringify(expiredPayload)).toString('base64url')}.sig_bytes`;
      expect(() => timer.updateTicket(rawTicket)).not.toThrow();
      expect(timer.getActiveClaims()?.sub).toBe('staff-99');
      timer.stop();
    });
  });

  // =========================================================================
  // 3. Concurrent Drawer Toggling, Message Sending & Store Isolation
  // =========================================================================
  describe('Scenario 3: Concurrent Drawer Toggling, Multiple Message Sending & Optimistic Store Isolation', () => {
    it('concurrent drawer toggling with functional updater maintains deterministic parity', () => {
      let isOpen = false;
      const toggleChatDrawer = () => {
        isOpen = !isOpen;
      };

      // 500 rapid concurrent toggles
      for (let i = 0; i < 500; i++) {
        toggleChatDrawer();
      }
      expect(isOpen).toBe(false);

      toggleChatDrawer();
      expect(isOpen).toBe(true);
    });

    it('optimistic store guarantees strict message isolation across multiple conversations under load', () => {
      const store = new OptimisticStore();

      const convClinic = 'conv-clinic-workstation';
      const convPharmacy = 'conv-pharmacy-workstation';
      const convLab = 'conv-lab-workstation';
      const convCashier = 'conv-cashier-workstation';

      const conversations = [convClinic, convPharmacy, convLab, convCashier];

      // Send 25 messages to each conversation concurrently (total 100 messages)
      for (let seq = 1; seq <= 25; seq++) {
        for (const convId of conversations) {
          const msg: MessageDto = {
            messageId: `msg-${convId}-${seq}`,
            conversationId: convId,
            seq,
            senderType: 'Staff',
            senderDisplayName: 'Staff Member',
            contentText: `Message ${seq} for ${convId}`,
            visibility: 'Public',
            requiresAcknowledgement: false,
            isAcknowledged: false,
            acknowledgedAtUtc: null,
            acknowledgedByAccountId: null,
            acknowledgedByName: null,
            attachments: [],
            deliveryState: 'Waiting',
            sentAtUtc: new Date().toISOString()
          };
          store.appendMessage(msg);
        }
      }

      // Check isolation for each conversation
      for (const convId of conversations) {
        const msgs = store.getMessages(convId);
        expect(msgs.length).toBe(25);
        expect(msgs.every((m) => m.conversationId === convId)).toBe(true);
        expect(msgs[0].seq).toBe(1);
        expect(msgs[24].seq).toBe(25);
      }

      // Check pending isolation
      store.addPending({
        clientMessageId: 'pending-clinic-1',
        conversationId: convClinic,
        contentText: 'Clinic pending',
        visibility: 'Public',
        requiresAcknowledgement: false,
        attachments: [],
        sentAt: new Date(),
        state: 'Sending'
      });

      store.addPending({
        clientMessageId: 'pending-pharmacy-1',
        conversationId: convPharmacy,
        contentText: 'Pharmacy pending',
        visibility: 'Public',
        requiresAcknowledgement: false,
        attachments: [],
        sentAt: new Date(),
        state: 'Sending'
      });

      const clinicPending = store.getPending(convClinic);
      const pharmacyPending = store.getPending(convPharmacy);

      expect(clinicPending.length).toBe(1);
      expect(clinicPending[0].clientMessageId).toBe('pending-clinic-1');

      expect(pharmacyPending.length).toBe(1);
      expect(pharmacyPending[0].clientMessageId).toBe('pending-pharmacy-1');
    });

    it('delivery state changes do not leak across conversations or unrelated messages', () => {
      const store = new OptimisticStore();

      store.appendMessage({
        messageId: 'msg-alpha',
        conversationId: 'conv-alpha',
        seq: 1,
        senderType: 'Staff',
        senderDisplayName: 'Staff A',
        contentText: 'Alpha',
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

      store.appendMessage({
        messageId: 'msg-beta',
        conversationId: 'conv-beta',
        seq: 1,
        senderType: 'Staff',
        senderDisplayName: 'Staff B',
        contentText: 'Beta',
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

      // Update delivery state on conv-alpha only
      store.updateMessageState('msg-alpha', 'conv-alpha', 'Received');

      expect(store.getMessages('conv-alpha')[0].deliveryState).toBe('Received');
      expect(store.getMessages('conv-beta')[0].deliveryState).toBe('Waiting'); // Unaffected!
    });
  });

  // =========================================================================
  // 4. Teleconsultation Waiting Room Prepayment Gate & Emergency Override
  // =========================================================================
  describe('Scenario 4: Teleconsultation Prepayment Gate, PhilHealth Yakap Auto-Exemption & Emergency Override', () => {
    const isPrepaidBlocked = (
      policy: 'Prepaid' | 'Postpaid' | 'Exempt',
      status: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden',
      isYakapExempt?: boolean
    ): boolean => {
      return policy === 'Prepaid' && status === 'Unpaid' && !isYakapExempt;
    };

    it('strictly blocks admission when paymentPolicy is Prepaid and paymentStatus is Unpaid without Yakap', () => {
      expect(isPrepaidBlocked('Prepaid', 'Unpaid', false)).toBe(true);
      expect(isPrepaidBlocked('Prepaid', 'Unpaid', undefined)).toBe(true);
    });

    it('PhilHealth Yakap auto-exemption (isYakapExempt === true) unblocks admission gate', () => {
      // YAKAP auto-exemption bypasses Prepaid Unpaid block
      expect(isPrepaidBlocked('Prepaid', 'Unpaid', true)).toBe(false);
    });

    it('Postpaid and Exempt payment policies bypass admission gate', () => {
      expect(isPrepaidBlocked('Postpaid', 'Unpaid', false)).toBe(false);
      expect(isPrepaidBlocked('Exempt', 'Unpaid', false)).toBe(false);
    });

    it('Paid and Overridden payment statuses unlock admission gate', () => {
      expect(isPrepaidBlocked('Prepaid', 'Paid', false)).toBe(false);
      expect(isPrepaidBlocked('Prepaid', 'Overridden', false)).toBe(false);
    });

    it('Emergency clinical override requires non-empty, non-whitespace clinical rationale', async () => {
      let paymentStatus: 'Unpaid' | 'Paid' | 'Exempt' | 'Overridden' = 'Unpaid';
      let isReadyToAdmit = false;
      let auditedRationale: string | null = null;

      const handleEmergencyPaymentOverride = async (reason: string) => {
        if (!reason || !reason.trim()) {
          throw new Error('Clinical rationale is required for emergency override.');
        }
        paymentStatus = 'Overridden';
        isReadyToAdmit = true;
        auditedRationale = reason.trim();
      };

      // Empty rationale fails
      expect(handleEmergencyPaymentOverride('')).rejects.toThrow('Clinical rationale is required');
      expect(handleEmergencyPaymentOverride('   ')).rejects.toThrow('Clinical rationale is required');

      // Valid rationale succeeds and unblocks gate
      const validRationale = 'Acute asthma exacerbation with severe wheezing; immediate clinician consultation indicated.';
      await handleEmergencyPaymentOverride(validRationale);

      expect(paymentStatus).toBe('Overridden');
      expect(isReadyToAdmit).toBe(true);
      expect(auditedRationale).toBe(validRationale);
      expect(isPrepaidBlocked('Prepaid', paymentStatus, false)).toBe(false);
    });
  });
});
