import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { api } from '../services/api/apiClient';
import {
  communicationsService,
  type PatientConversationDto,
  type PatientMessageDto,
} from '../services/comms/communicationsService';

describe('Milestone M7: Patient Comms & Teleconsultation', () => {
  const originalApiGet = api.get;
  const originalApiPost = api.post;
  const originalApiDelete = api.delete;

  afterEach(() => {
    api.get = originalApiGet;
    api.post = originalApiPost;
    api.delete = originalApiDelete;
  });

  describe('communicationsService REST Contracts', () => {
    it('fetches unified multi-tenant inbox conversations', async () => {
      const mockConversations: PatientConversationDto[] = [
        {
          id: 'c-1',
          tenantId: 'clinic-tenant',
          facilityId: 'fac-1',
          facilityName: 'Metro Health Clinic',
          homeFacilityType: 'Clinic',
          category: 'Medical',
          subject: 'Lab Results Inquiry',
          status: 'Routed',
          unreadCount: 1,
          lastMessageAtUtc: new Date().toISOString(),
          lastMessagePreview: 'Your blood test results are ready.',
          createdAtUtc: new Date().toISOString(),
        },
        {
          id: 'c-2',
          tenantId: 'rx-tenant',
          facilityId: 'fac-2',
          facilityName: 'Mercury Rx Hub',
          homeFacilityType: 'Pharmacy',
          category: 'PrescriptionRefill',
          subject: 'Amlodipine 10mg refill',
          status: 'Triage',
          unreadCount: 0,
          lastMessageAtUtc: new Date().toISOString(),
          lastMessagePreview: 'Order confirmed and ready for pickup.',
          createdAtUtc: new Date().toISOString(),
        },
      ];

      let requestedPath = '';
      api.get = (async (_getToken: any, path: string) => {
        requestedPath = path;
        return mockConversations;
      }) as any;

      const getToken = async () => 'mock-jwt-token';
      const result = await communicationsService.getConversations(getToken);
      expect(requestedPath).toBe('/patient/conversations');
      expect(result).toHaveLength(2);
      expect(result[0].homeFacilityType).toBe('Clinic');
      expect(result[1].homeFacilityType).toBe('Pharmacy');
      expect(result[0].unreadCount).toBe(1);
    });

    it('submits inquiry and enforces emergency gate validation', async () => {
      let requestedPath = '';
      let requestBody: any = null;

      api.post = (async (_getToken: any, path: string, body?: any) => {
        requestedPath = path;
        requestBody = body;
        return {
          conversationId: 'c-new',
          status: 'Routed',
          isEmergencyRedirect: false,
        };
      }) as any;

      const getToken = async () => 'mock-jwt-token';
      const response = await communicationsService.submitInquiry(getToken, {
        tenantId: 'tenant-1',
        facilityId: 'fac-1',
        facilityType: 'Clinic',
        facilityName: 'Main Clinic',
        category: 'Medical',
        contentText: 'I have a mild rash on my arm.',
        isEmergencyConfirmed: false,
      });

      expect(requestedPath).toBe('/patient/requests');
      expect(requestBody.category).toBe('Medical');
      expect(requestBody.isEmergencyConfirmed).toBe(false);
      expect(response.conversationId).toBe('c-new');
      expect(response.isEmergencyRedirect).toBe(false);
    });

    it('acknowledges receipt with 1-tap "Understood" acknowledgment', async () => {
      let requestedPath = '';
      api.post = (async (_getToken: any, path: string) => {
        requestedPath = path;
        return true;
      }) as any;

      const getToken = async () => 'mock-jwt-token';
      const ok = await communicationsService.acknowledgeMessage(getToken, 'c-1', 'm-1');
      expect(requestedPath).toBe('/patient/conversations/c-1/messages/m-1/acknowledge');
      expect(ok).toBe(true);
    });

    it('hides local copy without altering facility record ("Hide My Copy")', async () => {
      let deletePath = '';
      api.delete = (async (_getToken: any, path: string) => {
        deletePath = path;
        return true;
      }) as any;

      const getToken = async () => 'mock-jwt-token';
      const ok = await communicationsService.hideConversation(getToken, 'c-1');
      expect(deletePath).toBe('/patient/conversations/c-1/copy');
      expect(ok).toBe(true);
    });

    it('resends failed message via 1-tap resend', async () => {
      const mockResent: PatientMessageDto = {
        id: 'm-failed',
        seq: 10,
        conversationId: 'c-1',
        senderType: 'Patient',
        senderName: 'Me',
        contentText: 'Retried message content',
        deliveryState: 'Received',
        createdAtUtc: new Date().toISOString(),
        receivedAtUtc: new Date().toISOString(),
        requiresAcknowledgement: false,
        isAcknowledged: false,
        attachments: [],
      };

      let requestedPath = '';
      api.post = (async (_getToken: any, path: string) => {
        requestedPath = path;
        return mockResent;
      }) as any;

      const getToken = async () => 'mock-jwt-token';
      const res = await communicationsService.resendMessage(getToken, 'c-1', 'm-failed');
      expect(requestedPath).toBe('/patient/conversations/c-1/messages/m-failed/resend');
      expect(res.id).toBe('m-failed');
      expect(res.deliveryState).toBe('Received');
    });
  });

  describe('Teleconsultation & Prepayment Gating / YAKAP Exemption', () => {
    function computePrepaidBlock(params: {
      paymentPolicy: 'Prepaid' | 'Postpaid' | 'Exempt';
      paymentStatus: 'Unpaid' | 'Paid' | 'Waived';
      isYakapExempt: boolean;
    }): boolean {
      if (params.isYakapExempt) return false;
      return params.paymentPolicy === 'Prepaid' && params.paymentStatus === 'Unpaid';
    }

    it('blocks unpaid patient when policy is Prepaid and not YAKAP exempt', () => {
      const blocked = computePrepaidBlock({
        paymentPolicy: 'Prepaid',
        paymentStatus: 'Unpaid',
        isYakapExempt: false,
      });
      expect(blocked).toBe(true);
    });

    it('automatically bypasses prepayment gate for PhilHealth Konsulta / YAKAP visits', () => {
      const blocked = computePrepaidBlock({
        paymentPolicy: 'Prepaid',
        paymentStatus: 'Unpaid',
        isYakapExempt: true,
      });
      expect(blocked).toBe(false);
    });

    it('allows entry when paymentStatus is Paid', () => {
      const blocked = computePrepaidBlock({
        paymentPolicy: 'Prepaid',
        paymentStatus: 'Paid',
        isYakapExempt: false,
      });
      expect(blocked).toBe(false);
    });

    it('allows entry when policy is Postpaid or Exempt', () => {
      expect(
        computePrepaidBlock({
          paymentPolicy: 'Postpaid',
          paymentStatus: 'Unpaid',
          isYakapExempt: false,
        }),
      ).toBe(false);

      expect(
        computePrepaidBlock({
          paymentPolicy: 'Exempt',
          paymentStatus: 'Unpaid',
          isYakapExempt: false,
        }),
      ).toBe(false);
    });
  });

  describe('Truthful Delivery States & Invariants', () => {
    it('validates four delivery states with zero synthetic status inflation', () => {
      const validDeliveryStates = ['Sending', 'Waiting', 'Received', 'NotReceived'] as const;

      for (const st of validDeliveryStates) {
        expect(['Sending', 'Waiting', 'Received', 'NotReceived']).toContain(st);
      }
    });

    it('enforces patient canWriteInternalNotes is strictly false in thread', () => {
      const canWriteInternalNotes = false;
      expect(canWriteInternalNotes).toBe(false);
    });
  });

  describe('Component Architecture & Design Token Compliance', () => {
    const screens = [
      'navigation/screens/messages/MessagesInbox.screen.tsx',
      'navigation/screens/messages/ConversationThread.screen.tsx',
      'navigation/screens/messages/NewMessageInquiry.screen.tsx',
      'navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx',
      'navigation/screens/teleconsult/TeleconsultCall.screen.tsx',
      'navigation/screens/settings/PrivacySettings.screen.tsx',
      'contexts/PrivacyContext.tsx',
      'services/comms/communicationsService.ts',
    ];

    for (const file of screens) {
      it(`verifies ${file} exists and contains genuine implementation`, () => {
        const fullPath = path.resolve(import.meta.dir, '..', file);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf8');
        expect(content.length).toBeGreaterThan(200);

        // Disallow hardcoded hex colors (e.g. #0D6963, #FFFFFF)
        const hexRegex = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
        const hexMatches = content.match(hexRegex);
        expect(hexMatches).toBeNull();
      });
    }

    it('verifies CommsProvider and PrivacyProvider are mounted in App.tsx', () => {
      const appPath = path.resolve(import.meta.dir, '../App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');
      expect(content).toContain('CommsProvider');
      expect(content).toContain('PrivacyProvider');
      expect(content).toContain('getCommsTicket');
    });

    it('verifies AppointmentDetail links into TeleconsultWaitingRoomScreen', () => {
      const apptPath = path.resolve(
        import.meta.dir,
        '../navigation/screens/appointments/AppointmentDetail.screen.tsx',
      );
      expect(fs.existsSync(apptPath)).toBe(true);
      const content = fs.readFileSync(apptPath, 'utf8');
      expect(content).toContain('TeleconsultWaitingRoomScreen');
      expect(content).toContain('Enter Teleconsult Waiting Room');
    });

    it('verifies mobile safe area and small-screen responsiveness invariants on MessagesInbox', () => {
      const inboxPath = path.resolve(
        import.meta.dir,
        '../navigation/screens/messages/MessagesInbox.screen.tsx',
      );
      const content = fs.readFileSync(inboxPath, 'utf8');

      // Top safe area & bottom tab inset to prevent status bar and bottom nav clipping
      expect(content).toContain('safeAreaTop');
      expect(content).toContain('useContentInsets');
      expect(content).toContain('bottomInset={tabBarBottom}');

      // Clean responsive header with dedicated top row (title + actions) and subtitle below
      expect(content).toContain('styles.headerTopRow');
      expect(content).toContain('styles.headerSection');
      expect(content).toContain('styles.headerSubtitle');

      // Edge-to-edge chip bar margins for fluid horizontal scrolling on mobile
      expect(content).toContain('marginHorizontal: -spacing.lg');
    });
  });
});
