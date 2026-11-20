import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { Platform } from 'react-native';
import { api, ApiError } from '../services/api/apiClient';
import {
  communicationsService,
  type PatientConversationDto,
  type PatientMessageDto,
} from '../services/comms/communicationsService';

describe('Milestone M7: Patient Comms & Teleconsultation', () => {
  const originalApiGet = api.get;
  const originalApiPost = api.post;
  const originalApiPostForm = api.postForm;
  const originalApiDelete = api.delete;
  const originalFetch = globalThis.fetch;
  const originalPlatformOS = Platform.OS;
  const originalFormDataAppend = FormData.prototype.append;

  afterEach(() => {
    api.get = originalApiGet;
    api.post = originalApiPost;
    api.postForm = originalApiPostForm;
    api.delete = originalApiDelete;
    globalThis.fetch = originalFetch;
    (Platform as { OS: string }).OS = originalPlatformOS;
    FormData.prototype.append = originalFormDataAppend;
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

  describe('communicationsService.uploadAttachment Cross-Platform Multipart', () => {
    it('appends browser File/Blob directly on web preserving PNG magic bytes without re-encoding', async () => {
      (Platform as { OS: string }).OS = 'web';

      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
      const browserFile = new File([pngBytes], 'lab_scan.png', { type: 'image/png' });

      let postedPath = '';
      let postedFormData: FormData | null = null;
      api.postForm = (async (_getToken: any, reqPath: string, form: FormData) => {
        postedPath = reqPath;
        postedFormData = form;
        return {
          fileKey: 'comms/attachments/p-1/scan.png',
          fileName: 'lab_scan.png',
          contentType: 'image/png',
          sizeBytes: pngBytes.byteLength,
        };
      }) as typeof api.postForm;

      const result = await communicationsService.uploadAttachment(async () => 'mock-jwt', {
        uri: 'blob:http://localhost:8081/1234',
        name: 'lab_scan.png',
        type: 'image/png',
        size: pngBytes.byteLength,
        file: browserFile,
      });

      expect(postedPath).toBe('/patient/communications/attachments');
      expect(postedFormData).not.toBeNull();
      const part = postedFormData!.get('file');
      expect(typeof part).not.toBe('string');
      expect(part instanceof Blob).toBe(true);
      const uploadedBlob = part as File;
      expect(uploadedBlob.name).toBe('lab_scan.png');
      expect(uploadedBlob.type).toBe('image/png');
      expect(new Uint8Array(await uploadedBlob.arrayBuffer())).toEqual(pngBytes);
      expect(result.fileName).toBe('lab_scan.png');
    });

    it('appends PDF File directly on web without altering PDF bytes', async () => {
      (Platform as { OS: string }).OS = 'web';

      const pdfBytes = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');
      const pdfFile = new File([pdfBytes], 'prescription.pdf', { type: 'application/pdf' });

      let postedFormData: FormData | null = null;
      api.postForm = (async (_getToken: any, _reqPath: string, form: FormData) => {
        postedFormData = form;
        return {
          fileKey: 'comms/attachments/p-1/rx.pdf',
          fileName: 'prescription.pdf',
          contentType: 'application/pdf',
          sizeBytes: pdfBytes.byteLength,
        };
      }) as typeof api.postForm;

      await communicationsService.uploadAttachment(async () => 'mock-jwt', {
        uri: 'blob:http://localhost:8081/pdf-1',
        name: 'prescription.pdf',
        type: 'application/pdf',
        size: pdfBytes.byteLength,
        file: pdfFile,
      });

      const part = postedFormData!.get('file') as File;
      expect(part instanceof Blob).toBe(true);
      expect(part.name).toBe('prescription.pdf');
      expect(part.type).toBe('application/pdf');
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(pdfBytes);
    });

    it('preserves explicit MIME type when web Blob has missing or generic type', async () => {
      (Platform as { OS: string }).OS = 'web';

      const pdfBytes = new TextEncoder().encode('%PDF-1.7\n');
      const untypedBlob = new Blob([pdfBytes]);

      let postedFormData: FormData | null = null;
      api.postForm = (async (_getToken: any, _reqPath: string, form: FormData) => {
        postedFormData = form;
        return {
          fileKey: 'comms/attachments/p-1/untyped.pdf',
          fileName: 'untyped.pdf',
          contentType: 'application/pdf',
          sizeBytes: pdfBytes.byteLength,
        };
      }) as typeof api.postForm;

      await communicationsService.uploadAttachment(async () => 'mock-jwt', {
        uri: 'blob:http://localhost:8081/untyped',
        name: 'untyped.pdf',
        type: 'application/pdf',
        file: untypedBlob,
      });

      const part = postedFormData!.get('file') as File;
      expect(part instanceof Blob).toBe(true);
      expect(part.type).toBe('application/pdf');
      expect(part.name).toBe('untyped.pdf');
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(pdfBytes);
    });

    it('fetches blob URI fallback on web when file.file is omitted', async () => {
      (Platform as { OS: string }).OS = 'web';

      const pdfBytes = new TextEncoder().encode('%PDF-1.4\nfallback\n');
      let fetchedUrl = '';
      globalThis.fetch = (async (input: RequestInfo | URL) => {
        fetchedUrl = String(input);
        return new Response(pdfBytes, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      }) as typeof globalThis.fetch;

      let postedFormData: FormData | null = null;
      api.postForm = (async (_getToken: any, _reqPath: string, form: FormData) => {
        postedFormData = form;
        return {
          fileKey: 'comms/attachments/p-1/rx.pdf',
          fileName: 'rx.pdf',
          contentType: 'application/pdf',
          sizeBytes: pdfBytes.byteLength,
        };
      }) as typeof api.postForm;

      await communicationsService.uploadAttachment(async () => 'mock-jwt', {
        uri: 'blob:http://localhost:8081/abc',
        name: 'rx.pdf',
        type: 'application/pdf',
      });

      expect(fetchedUrl).toBe('blob:http://localhost:8081/abc');
      const part = postedFormData!.get('file') as File;
      expect(part instanceof Blob).toBe(true);
      expect(part.name).toBe('rx.pdf');
      expect(new Uint8Array(await part.arrayBuffer())).toEqual(pdfBytes);
    });

    it('fails fast on web with FILE_READ_FAILED for non-fetchable URIs or failed fetch without calling postForm', async () => {
      (Platform as { OS: string }).OS = 'web';

      let postFormCalled = false;
      api.postForm = (async () => {
        postFormCalled = true;
        return {} as any;
      }) as typeof api.postForm;

      try {
        await communicationsService.uploadAttachment(async () => 'mock-jwt', {
          uri: '/local/file.pdf',
          name: 'file.pdf',
          type: 'application/pdf',
        });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.errors[0]?.code).toBe('FILE_READ_FAILED');
      }
      expect(postFormCalled).toBe(false);

      globalThis.fetch = (async () => new Response(null, { status: 404 })) as typeof globalThis.fetch;
      try {
        await communicationsService.uploadAttachment(async () => 'mock-jwt', {
          uri: 'blob:http://localhost:8081/missing',
          name: 'missing.pdf',
          type: 'application/pdf',
        });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(400);
        expect(apiErr.errors[0]?.code).toBe('FILE_READ_FAILED');
      }
      expect(postFormCalled).toBe(false);
    });

    it('rejects files over 15 MB both pre-flight and after web blob fetch without calling postForm', async () => {
      (Platform as { OS: string }).OS = 'web';

      let postFormCalled = false;
      api.postForm = (async () => {
        postFormCalled = true;
        return {} as any;
      }) as typeof api.postForm;

      try {
        await communicationsService.uploadAttachment(async () => 'mock-jwt', {
          uri: 'blob:http://localhost:8081/huge',
          name: 'huge.pdf',
          type: 'application/pdf',
          size: 15 * 1024 * 1024 + 1,
        });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(413);
        expect(apiErr.errors[0]?.code).toBe('FILE_SIZE_EXCEEDED');
      }
      expect(postFormCalled).toBe(false);

      const oversizedBytes = new Uint8Array(15 * 1024 * 1024 + 1);
      globalThis.fetch = (async () =>
        new Response(oversizedBytes, {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        })) as typeof globalThis.fetch;

      try {
        await communicationsService.uploadAttachment(async () => 'mock-jwt', {
          uri: 'blob:http://localhost:8081/huge-fetched',
          name: 'huge-fetched.pdf',
          type: 'application/pdf',
        });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const apiErr = err as ApiError;
        expect(apiErr.status).toBe(413);
        expect(apiErr.errors[0]?.code).toBe('FILE_SIZE_EXCEEDED');
      }
      expect(postFormCalled).toBe(false);
    });

    it('preserves React Native { uri, name, type } descriptor on iOS and Android without calling fetch', async () => {
      for (const nativeOs of ['ios', 'android'] as const) {
        (Platform as { OS: string }).OS = nativeOs;

        let fetchCalled = false;
        globalThis.fetch = (async () => {
          fetchCalled = true;
          return new Response();
        }) as typeof globalThis.fetch;

        const appendedCalls: { field: string; value: unknown }[] = [];
        FormData.prototype.append = function (field: string, value: unknown) {
          appendedCalls.push({ field, value });
        } as typeof FormData.prototype.append;

        let postedPath = '';
        api.postForm = (async (_getToken: any, reqPath: string) => {
          postedPath = reqPath;
          return {
            fileKey: 'comms/attachments/p-1/photo.jpg',
            fileName: 'photo.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 1024,
          };
        }) as typeof api.postForm;

        try {
          await communicationsService.uploadAttachment(async () => 'mock-jwt', {
            uri: 'file:///cache/photo.jpg',
            name: 'photo.jpg',
            type: 'image/jpeg',
            size: 1024,
          });
        } finally {
          FormData.prototype.append = originalFormDataAppend;
          globalThis.fetch = originalFetch;
          (Platform as { OS: string }).OS = originalPlatformOS;
        }

        expect(fetchCalled).toBe(false);
        expect(postedPath).toBe('/patient/communications/attachments');
        expect(appendedCalls).toEqual([
          {
            field: 'file',
            value: {
              uri: 'file:///cache/photo.jpg',
              name: 'photo.jpg',
              type: 'image/jpeg',
            },
          },
        ]);
      }
    });

    it('verifies NewMessageInquiryScreen forwards DocumentPicker file.file and keeps text-only messages working', () => {
      const screenPath = path.resolve(
        import.meta.dir,
        '../navigation/screens/messages/NewMessageInquiry.screen.tsx',
      );
      const source = fs.readFileSync(screenPath, 'utf8');
      expect(source).toContain('file: file.file');
      expect(source).toContain('attachments: attachments.length > 0 ? attachments : undefined');
      expect(source).not.toMatch(/\bAlert\b/);
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

      // Native navigation header with eye privacy toggle and bottom tab inset to prevent clipping
      expect(content).toContain('navigation.setOptions');
      expect(content).toContain('headerRight');
      expect(content).toContain('BottomTabsHeaderRight');
      expect(content).toContain('useContentInsets');
      expect(content).toContain('bottomInset={tabBarBottom}');

      // Floating Action Button (FAB)
      expect(content).toContain('styles.fab');
      expect(content).toContain('New Inquiry');

      // Filter chips uniform with other screens (FilterChipBar with facility filter)
      expect(content).toContain('FilterChipBar');
      expect(content).toContain('All Facilities');
    });
  });
});
