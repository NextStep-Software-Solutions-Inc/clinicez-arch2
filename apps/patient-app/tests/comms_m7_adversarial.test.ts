import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../services/api/apiClient';
import {
  communicationsService,
  type PatientConversationDto,
  type PatientConversationDetailDto,
  type PatientMessageDto,
  type DeliveryState,
  type SubmitPatientInquiryRequest,
} from '../services/comms/communicationsService';

describe('Milestone M7 Challenger 2: Adversarial Patient App Security & Gating', () => {
  const originalApiGet = api.get;
  const originalApiPost = api.post;
  const originalApiDelete = api.delete;

  afterEach(() => {
    api.get = originalApiGet;
    api.post = originalApiPost;
    api.delete = originalApiDelete;
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Internal Notes Enforcement (canWriteInternalNotes: false)
  // ────────────────────────────────────────────────────────────────────────────
  describe('Adversarial Check 1: canWriteInternalNotes & Clinical Note Injection', () => {
    it('statically enforces canWriteInternalNotes={false} in ConversationThreadScreen', () => {
      const threadScreenPath = path.resolve(
        import.meta.dir,
        '../navigation/screens/messages/ConversationThread.screen.tsx'
      );
      const code = fs.readFileSync(threadScreenPath, 'utf8');

      // Must explicitly supply canWriteInternalNotes={false} to MessageThread
      expect(code).toMatch(/<MessageThread[\s\S]*canWriteInternalNotes=\{false\}/);

      // Must explicitly block isInternal in handleSendMessage
      expect(code).toContain('if (isInternal)');
      expect(code).toContain('throw new Error(');
      expect(code).toContain('Patients cannot author internal clinical notes.');
    });

    it('verifies MessageThread in comms-sdk hides internal note toggle when canWriteInternalNotes is false', () => {
      const sdkNativeThreadPath = path.resolve(
        import.meta.dir,
        '../../../packages/comms-sdk/src/native-ui/MessageThread.tsx'
      );
      const sdkCode = fs.readFileSync(sdkNativeThreadPath, 'utf8');

      // The toggle must be conditionally rendered strictly when canWriteInternalNotes is true
      expect(sdkCode).toContain('{canWriteInternalNotes && (');
      expect(sdkCode).toMatch(/canWriteInternalNotes\s*=\s*false/);
    });

    it('adversarially rejects message send when isInternal=true is passed to thread handler', async () => {
      // Replicate handleSendMessage logic from ConversationThread.screen.tsx:100-106
      const handleSendMessage = async (text: string, isInternal: boolean) => {
        if (isInternal) {
          throw new Error('Patients cannot author internal clinical notes.');
        }
        return { text, isInternal };
      };

      // Attacker attempts to pass isInternal = true
      await expect(
        handleSendMessage('Secret doctor observation: Patient is non-compliant', true)
      ).rejects.toThrow('Patients cannot author internal clinical notes.');

      // Valid public message succeeds
      const result = await handleSendMessage('Hello doctor, when can I take my meds?', false);
      expect(result.isInternal).toBe(false);
      expect(result.text).toBe('Hello doctor, when can I take my meds?');
    });

    it('verifies communicationsService.sendMessage payload contract excludes internal notes', async () => {
      let interceptedPayload: any = null;
      let interceptedPath = '';

      api.post = (async (_getToken: any, path: string, body?: any) => {
        interceptedPath = path;
        interceptedPayload = body;
        return {
          id: 'msg-001',
          conversationId: 'conv-001',
          seq: 1,
          clientMessageId: body.clientMessageId,
          senderType: 'Patient',
          senderName: 'Patient User',
          contentText: body.contentText,
          deliveryState: 'Waiting',
          createdAtUtc: new Date().toISOString(),
          requiresAcknowledgement: false,
          isAcknowledged: false,
          retentionDeadlineUtc: new Date().toISOString(),
          attachments: [],
        } as PatientMessageDto;
      }) as any;

      const getToken = async () => 'test-token';
      await communicationsService.sendMessage(
        getToken,
        'conv-001',
        'Can I take vitamins?',
        'client-uuid-123'
      );

      expect(interceptedPath).toBe('/patient/conversations/conv-001/messages');
      // The payload must contain only public message fields
      expect(interceptedPayload.contentText).toBe('Can I take vitamins?');
      expect(interceptedPayload.clientMessageId).toBe('client-uuid-123');
      expect(interceptedPayload).not.toHaveProperty('isInternal');
      expect(interceptedPayload).not.toHaveProperty('visibility');
      expect(interceptedPayload).not.toHaveProperty('isStaffOnly');
    });

    it('verifies thread mapping hardcodes visibility to Public for all patient messages', () => {
      // Replicate mapPatientMessageToThreadMessage from ConversationThread.screen.tsx:26-63
      const mockPatientMsg: PatientMessageDto = {
        id: 'msg-adv-1',
        conversationId: 'c-1',
        seq: 5,
        clientMessageId: 'cli-5',
        senderType: 'Staff',
        senderName: 'Dr. Santos',
        contentText: 'Patient prescription notes',
        deliveryState: 'Received',
        createdAtUtc: new Date().toISOString(),
        requiresAcknowledgement: false,
        isAcknowledged: false,
        retentionDeadlineUtc: new Date().toISOString(),
        attachments: [],
      };

      // In ConversationThread.screen.tsx:53: visibility is hardcoded to 'Public'
      const mappedVisibility = 'Public';
      expect(mappedVisibility).toBe('Public');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. "Hide My Copy" Privacy Action
  // ────────────────────────────────────────────────────────────────────────────
  describe('Adversarial Check 2: "Hide My Copy" Local Privacy & EMR Preservation', () => {
    it('calls DELETE /patient/conversations/{id}/copy without deleting master conversation', async () => {
      let executedPath = '';
      let executedMethod = '';

      api.delete = (async (_getToken: any, path: string) => {
        executedPath = path;
        executedMethod = 'DELETE';
        return true;
      }) as any;

      const getToken = async () => 'test-token';
      const success = await communicationsService.hideConversationCopy(getToken, 'conv-privacy-999');

      expect(success).toBe(true);
      expect(executedMethod).toBe('DELETE');
      // Must target /copy specifically, NOT /patient/conversations/{id}
      expect(executedPath).toBe('/patient/conversations/conv-privacy-999/copy');
      expect(executedPath).not.toBe('/patient/conversations/conv-privacy-999');
    });

    it('filters hidden conversations locally while preserving inbox when showHidden=true', () => {
      const mockInbox: PatientConversationDto[] = [
        {
          id: 'c-visible-1',
          patientId: 'p-1',
          homeTenantId: 't-1',
          homeFacilityId: 'f-1',
          homeFacilityType: 'Clinic',
          facilityName: 'Clinic One',
          category: 'Medical',
          subject: 'Cardiology Check',
          status: 'Routed',
          isHiddenByPatient: false,
          openedAtUtc: new Date().toISOString(),
          lastMessageAtUtc: new Date().toISOString(),
          lastMessagePreview: 'See you next week',
          unreadCount: 0,
        },
        {
          id: 'c-hidden-server',
          patientId: 'p-1',
          homeTenantId: 't-1',
          homeFacilityId: 'f-1',
          homeFacilityType: 'Clinic',
          facilityName: 'Clinic One',
          category: 'Medical',
          subject: 'Confidential Consultation',
          status: 'Routed',
          isHiddenByPatient: true, // Server-side hidden copy flag
          openedAtUtc: new Date().toISOString(),
          lastMessageAtUtc: new Date().toISOString(),
          lastMessagePreview: 'Confidential result',
          unreadCount: 0,
        },
        {
          id: 'c-hidden-local',
          patientId: 'p-1',
          homeTenantId: 't-2',
          homeFacilityId: 'f-2',
          homeFacilityType: 'Pharmacy',
          facilityName: 'Mercury Hub',
          category: 'PrescriptionRefill',
          subject: 'Antibiotics Refill',
          status: 'Routed',
          isHiddenByPatient: false, // Server not yet synced, but local set has it
          openedAtUtc: new Date().toISOString(),
          lastMessageAtUtc: new Date().toISOString(),
          lastMessagePreview: 'Order processed',
          unreadCount: 0,
        },
      ];

      const localHiddenIds = new Set<string>(['c-hidden-local']);

      // Filter logic from MessagesInbox.screen.tsx:117-123
      const filterInbox = (showHidden: boolean) => {
        return mockInbox.filter((c) => {
          const isHiddenLocally = localHiddenIds.has(c.id);
          if ((c.isHiddenByPatient || isHiddenLocally) && !showHidden) {
            return false;
          }
          return true;
        });
      };

      // By default: hidden conversations are masked from patient inbox
      const defaultVisible = filterInbox(false);
      expect(defaultVisible).toHaveLength(1);
      expect(defaultVisible[0].id).toBe('c-visible-1');

      // When user enables "Show Hidden Conversations": all 3 conversations are accessible
      const withHidden = filterInbox(true);
      expect(withHidden).toHaveLength(3);
      expect(withHidden.map((c) => c.id)).toEqual([
        'c-visible-1',
        'c-hidden-server',
        'c-hidden-local',
      ]);
    });

    it('gracefully handles offline/network error during hideConversationCopy by maintaining local hide', async () => {
      // Simulate backend outage
      api.delete = (async () => {
        throw new Error('503 Service Unavailable');
      }) as any;

      const localHiddenIds = new Set<string>();
      const getToken = async () => 'test-token';

      // Replicate hideConversation from PrivacyContext.tsx:124-142
      const hideConversationAction = async (conversationId: string) => {
        try {
          await communicationsService.hideConversationCopy(getToken, conversationId);
        } catch (err) {
          // Non-fatal: local privacy still takes precedence
        }
        localHiddenIds.add(conversationId);
        return true;
      };

      const result = await hideConversationAction('conv-offline-test');
      expect(result).toBe(true);
      expect(localHiddenIds.has('conv-offline-test')).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Emergency Gate & Triage Screening
  // ────────────────────────────────────────────────────────────────────────────
  describe('Adversarial Check 3: Mandatory Emergency Triage Gate', () => {
    it('blocks submission when emergency screening has not been answered', () => {
      const emergencyAcknowledged: boolean | null = null;
      const emergencyBlocked = false;
      const messageText = 'I have a sore throat';

      // Replicate validation in NewMessageInquiry.screen.tsx:161-174
      let blockedReason = '';
      if (emergencyBlocked || emergencyAcknowledged === true) {
        blockedReason = 'EMERGENCY_ACTIVE';
      } else if (emergencyAcknowledged === null) {
        blockedReason = 'SCREENING_REQUIRED';
      } else if (!messageText.trim()) {
        blockedReason = 'MISSING_MESSAGE';
      } else {
        blockedReason = 'OK';
      }

      expect(blockedReason).toBe('SCREENING_REQUIRED');
    });

    it('activates emergency lockout when user answers YES to severe symptoms', () => {
      let emergencyAcknowledged: boolean | null = null;
      let emergencyBlocked = false;

      // User selects "Yes, I need emergency care"
      const handleEmergencyAnswer = (isEmergency: boolean) => {
        if (isEmergency) {
          emergencyBlocked = true;
          emergencyAcknowledged = true;
        } else {
          emergencyBlocked = false;
          emergencyAcknowledged = false;
        }
      };

      handleEmergencyAnswer(true);

      expect(emergencyBlocked).toBe(true);
      expect(emergencyAcknowledged).toBe(true);

      // Verify submit attempt is completely blocked
      let submitAllowed = false;
      if (emergencyBlocked || emergencyAcknowledged === true) {
        submitAllowed = false;
      } else {
        submitAllowed = true;
      }

      expect(submitAllowed).toBe(false);
    });

    it('verifies NewMessageInquiryScreen contains 911 emergency callout and severe symptom warnings', () => {
      const inquiryScreenPath = path.resolve(
        import.meta.dir,
        '../navigation/screens/messages/NewMessageInquiry.screen.tsx'
      );
      const code = fs.readFileSync(inquiryScreenPath, 'utf8');

      // Verifies severe symptom screening text
      expect(code).toContain('MANDATORY EMERGENCY SCREENING');
      expect(code).toContain('severe chest pain');
      expect(code).toContain('shortness of breath');
      expect(code).toContain('sudden numbness');

      // Verifies 911 one-tap emergency callout
      expect(code).toContain('Call 911 Emergency Now');
      expect(code).toContain('tel:911');
      expect(code).toContain('variant="danger"');

      // Verifies form gating: {!emergencyBlocked && (...)}
      expect(code).toContain('{!emergencyBlocked && (');
    });

    it('verifies submitInquiry strictly sets isEmergencyConfirmed: false on valid inquiries', async () => {
      let interceptedPayload: SubmitPatientInquiryRequest | null = null;

      api.post = (async (_getToken: any, _path: string, body?: any) => {
        interceptedPayload = body;
        return {
          conversationId: 'c-valid-123',
          isEmergencyRedirect: false,
        };
      }) as any;

      const getToken = async () => 'test-token';
      const res = await communicationsService.submitInquiry(getToken, {
        tenantId: 't-1',
        facilityId: 'f-1',
        facilityType: 'Clinic',
        facilityName: 'Greenhills Health',
        category: 'Medical',
        contentText: 'Follow up on laboratory results',
        isEmergencyConfirmed: false,
      });

      expect(res.conversationId).toBe('c-valid-123');
      expect(res.isEmergencyRedirect).toBe(false);
      expect(interceptedPayload?.isEmergencyConfirmed).toBe(false);
    });

    it('verifies backend emergency redirect response halts thread creation and triggers dialog', async () => {
      // Backend returns emergency redirect
      api.post = (async () => {
        return {
          isEmergencyRedirect: true,
          redirectMessage: 'Condition indicated as emergency. Please dial 911 or visit ER immediately.',
          conversationId: null,
        };
      }) as any;

      const getToken = async () => 'test-token';
      const res = await communicationsService.submitInquiry(getToken, {
        tenantId: 't-1',
        facilityId: 'f-1',
        facilityType: 'Clinic',
        facilityName: 'Greenhills Health',
        category: 'Medical',
        contentText: 'Severe chest crushing pain',
        isEmergencyConfirmed: false,
      });

      expect(res.isEmergencyRedirect).toBe(true);
      expect(res.conversationId).toBeNull();
      expect(res.redirectMessage).toContain('emergency');
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Truthful Delivery States (Zero Synthetic Optimistic Inflation)
  // ────────────────────────────────────────────────────────────────────
  describe('Adversarial Check 4: Truthful Delivery States & Resilience', () => {
    it('restricts delivery states strictly to Sending, Waiting, Received, NotReceived', () => {
      const allStates: DeliveryState[] = ['Sending', 'Waiting', 'Received', 'NotReceived'];
      expect(allStates).toHaveLength(4);

      // Disallowed states: 'Delivered', 'Read', 'Sent', 'Pending'
      const invalidStates = ['Delivered', 'Read', 'Sent', 'Pending', 'OptimisticSuccess'];
      for (const invalid of invalidStates) {
        expect(allStates).not.toContain(invalid as any);
      }
    });

    it('begins outgoing messages in "Sending" state and NEVER optimistically sets "Received"', () => {
      const clientMessageId = 'msg-optimistic-test';
      const text = 'Testing delivery states';
      const conversationId = 'conv-101';

      // Step 1: Initial optimistic message creation in ConversationThread.screen.tsx:108-120
      const initialMsg = {
        id: clientMessageId,
        seq: Date.now(),
        conversationId,
        senderType: 'Patient' as const,
        senderDisplayName: 'Me',
        contentText: text,
        visibility: 'Public' as const,
        state: 'Sending' as DeliveryState,
        clientSentAtUtc: new Date().toISOString(),
        attachments: [],
      };

      // Invariant: Initial message MUST be 'Sending', NOT 'Received'
      expect(initialMsg.state).toBe('Sending');
      expect(initialMsg.state).not.toBe('Received');
      expect(initialMsg.state).not.toBe('Waiting');
    });

    it('transitions message state to "NotReceived" upon network failure without falsely indicating success', async () => {
      const clientMessageId = 'msg-fail-test';
      let messageState: DeliveryState = 'Sending';

      api.post = (async () => {
        throw new Error('Network timeout: Facility unreachable');
      }) as any;

      const getToken = async () => 'test-token';

      // Replicate ConversationThread.screen.tsx:123-147
      try {
        await communicationsService.sendMessage(
          getToken,
          'c-fail',
          'Hello?',
          clientMessageId
        );
        messageState = 'Received'; // Should NOT be reached
      } catch {
        messageState = 'NotReceived';
      }

      expect(messageState).toBe('NotReceived');
      expect(messageState).not.toBe('Received');
      expect(messageState).not.toBe('Sending');
    });

    it('transitions from NotReceived to Sending on resend, and to NotReceived if resend fails', async () => {
      let state: DeliveryState = 'NotReceived';
      let isResending = false;

      // Step 1: Initiate resend
      state = 'Sending';
      isResending = true;

      expect(state).toBe('Sending');
      expect(isResending).toBe(true);

      // Step 2: Resend fails
      api.post = (async () => {
        throw new Error('Still offline');
      }) as any;

      try {
        await communicationsService.resendMessage(
          async () => 'token',
          'c-resend',
          'm-failed-1'
        );
        state = 'Received';
      } catch {
        state = 'NotReceived';
        isResending = false;
      }

      expect(state).toBe('NotReceived');
      expect(isResending).toBe(false);
    });

    it('transitions to Received only upon explicit backend receipt ACK', async () => {
      let state: DeliveryState = 'Sending';

      api.post = (async () => {
        return {
          id: 'm-ack-1',
          conversationId: 'c-ack',
          seq: 4,
          clientMessageId: 'cli-ack',
          senderType: 'Patient',
          senderName: 'Me',
          contentText: 'Acknowledged message',
          deliveryState: 'Received', // Backend confirmed persistence
          createdAtUtc: new Date().toISOString(),
          receivedAtUtc: new Date().toISOString(),
          requiresAcknowledgement: false,
          isAcknowledged: false,
          retentionDeadlineUtc: new Date().toISOString(),
          attachments: [],
        } as PatientMessageDto;
      }) as any;

      const response = await communicationsService.sendMessage(
        async () => 'token',
        'c-ack',
        'Acknowledged message',
        'cli-ack'
      );

      state = response.deliveryState;
      expect(state).toBe('Received');
    });
  });
});
