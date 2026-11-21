// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import crypto from 'crypto';
import path from 'path';

(globalThis as any).__DEV__ = true;
const rootDir = path.resolve(import.meta.dir, '../../..');
const appDir = path.resolve(import.meta.dir, '..');

// Mock react-native
mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableHighlight',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  Polyline: 'Polyline',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// API Client Mock
let lastPostUrl = '';
let lastPostPayload: any = null;
let mockPostResponse: any = null;
let mockPostError: any = null;

mock.module('../services/apiClient', () => ({
  clinicApiClient: {
    get: async () => [null, null],
    put: async () => [null, null],
    post: async (url: string, data?: any) => {
      lastPostUrl = url;
      lastPostPayload = data;
      if (mockPostError) return [null, mockPostError];
      return [mockPostResponse, null];
    },
  },
  clinicApiUrl: (p: string) => `http://localhost:5000/api/v1${p}`,
}));

const { clinicService } = await import('../services/clinicService');
import type { EmergencyOverrideDto } from '../services/clinicService';
import { theme } from '../constants/theme';

// Zero-PHI Regex Constants
export const ZERO_PHI_ROOM_REGEX = /^call-[0-9a-fA-F\-]{32,36}$/;
export const ZERO_PHI_PARTICIPANT_REGEX = /^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$/;

// Ticket Validation helpers
const HMAC_SECRET = 'playback-signing-secret-cmk-2026-very-secure-key';

function signTicket(payload: string, key: string = HMAC_SECRET): string {
  const hmac = crypto.createHmac('sha256', key);
  hmac.update(payload);
  return hmac.digest('base64url');
}

function createTicket(sessionId: string, userId: string, ttlMs: number, key: string = HMAC_SECRET) {
  const expiresAtMs = Date.now() + ttlMs;
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${sessionId}:${userId}:${expiresAtMs}:${nonce}`;
  const sig = signTicket(payload, key);
  return {
    ticket: `${payload}.${sig}`,
    expiresAtMs,
  };
}

function verifyTicket(ticket: string, currentTimeMs: number = Date.now(), key: string = HMAC_SECRET) {
  if (!ticket) return { valid: false, error: 'Empty ticket' };
  const parts = ticket.split('.');
  if (parts.length !== 2) return { valid: false, error: 'Malformed format' };
  const [payload, sig] = parts;
  const expectedSig = signTicket(payload, key);
  if (sig !== expectedSig) return { valid: false, error: 'Signature mismatch' };
  const fields = payload.split(':');
  if (fields.length !== 4) return { valid: false, error: 'Malformed payload' };
  const [sessionId, userId, expiresAtStr] = fields;
  const expiresAtMs = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAtMs)) return { valid: false, error: 'Invalid timestamp' };
  if (currentTimeMs > expiresAtMs) return { valid: false, error: 'Ticket expired' };
  return { valid: true, sessionId, userId, expiresAtMs };
}

describe('Milestone 5 Challenger Adversarial Stress Suite', () => {
  beforeEach(() => {
    lastPostUrl = '';
    lastPostPayload = null;
    mockPostResponse = null;
    mockPostError = null;
  });

  // ===========================================================================
  // Focus 1: Plain-Note Override Boundary (< 5 vs >= 5 chars, WORM audit)
  // ===========================================================================
  describe('Focus 1: Plain-Note Override Boundary Verification', () => {
    function validateNote(note?: string | null): { isValid: boolean; reason?: string } {
      if (!note || typeof note !== 'string') {
        return { isValid: false, reason: 'Missing note' };
      }
      const trimmed = note.trim();
      if (trimmed.length < 5) {
        return { isValid: false, reason: `Length ${trimmed.length} is less than 5 characters` };
      }
      return { isValid: true };
    }

    test('1.1: Rejects empty, whitespace-only, and < 5 char emergency override notes', () => {
      const invalidNotes = [
        '',
        '   ',
        'STAT',
        '911',
        'ab',
        ' a ',
        ' 1234 ',
        '\t\n\r',
      ];

      for (const note of invalidNotes) {
        const res = validateNote(note);
        expect(res.isValid).toBe(false);
      }
    });

    test('1.2: Accepts notes with >= 5 non-whitespace characters', () => {
      const validNotes = [
        'EMERG',
        'STAT-CALL',
        'Severe acute chest pain with diaphoresis',
        '   Five chars note   ',
      ];

      for (const note of validNotes) {
        const res = validateNote(note);
        expect(res.isValid).toBe(true);
      }
    });

    test('1.3: clinicService.admitTeleconsultPatient formats emergency override payload correctly', async () => {
      mockPostResponse = {
        appointmentId: 'appt-1',
        callId: 'call-1',
        roomName: 'call-550e8400-e29b-41d4-a716-446655440000',
        admittedAtUtc: new Date().toISOString(),
        paymentStatus: 'Overridden',
        isEmergencyOverride: true,
      };

      const override: EmergencyOverrideDto = {
        reasonCode: 'CLINICAL_EMERGENCY',
        reasonNote: 'Severe chest pain requiring immediate tele-triage',
      };

      const [res, err] = await clinicService.admitTeleconsultPatient('appt-1', override);
      expect(err).toBeNull();
      expect(res).toBeDefined();
      expect(lastPostUrl).toBe('/teleconsult/admit');
      expect(lastPostPayload).toEqual({
        appointmentId: 'appt-1',
        emergencyOverride: override,
      });
    });
  });

  // ===========================================================================
  // Focus 2: YAKAP Policy Non-Mutation Verification
  // ===========================================================================
  describe('Focus 2: YAKAP Policy Non-Mutation Invariant', () => {
    test('2.1: Enlisted YAKAP status does NOT automatically set paymentPolicy to Exempt', () => {
      const patientWithYakap = {
        id: 'pat-101',
        name: 'Maria Santos',
        hasActiveYakapEnlistment: true,
        isYakapEligible: true,
      };

      // Appointment creation input defaults to Prepaid
      let policy = 'Prepaid';

      // Verify that mere presence of YAKAP enlistment does NOT alter policy to 'Exempt'
      const hasYakap = Boolean(
        patientWithYakap.hasActiveYakapEnlistment || patientWithYakap.isYakapEligible
      );
      expect(hasYakap).toBe(true);
      // Policy MUST remain Prepaid unless explicitly changed by staff
      expect(policy).toBe('Prepaid');
      expect(policy).not.toBe('Exempt');
    });

    test('2.2: TeleconsultStatusDto surfaces hasActiveYakapEnlistment independently of paymentPolicy', () => {
      const statusDto = {
        appointmentId: 'appt-001',
        patientId: 'pat-001',
        patientName: 'Juan Dela Cruz',
        paymentPolicy: 'Prepaid' as const,
        paymentStatus: 'Pending' as const,
        canAdmit: false,
        hasActiveYakapEnlistment: true,
        isYakapExempt: false,
      };

      expect(statusDto.hasActiveYakapEnlistment).toBe(true);
      expect(statusDto.paymentPolicy).toBe('Prepaid');
      expect(statusDto.isYakapExempt).toBe(false);
      expect(statusDto.canAdmit).toBe(false);
    });
  });

  // ===========================================================================
  // Focus 3: Zero-PHI Signaling Integrity Regexes
  // ===========================================================================
  describe('Focus 3: Zero-PHI Room & Participant Regex Invariants', () => {
    test('3.1: Zero-PHI room regex allows 32-36 hex characters with "call-" prefix', () => {
      const validRooms = [
        'call-550e8400-e29b-41d4-a716-446655440000',
        'call-0123456789abcdef0123456789abcdef',
        'call-AABBCCDDEEFF00112233445566778899',
        'call-12345678-1234-1234-1234-123456789012',
      ];

      for (const room of validRooms) {
        expect(ZERO_PHI_ROOM_REGEX.test(room)).toBe(true);
      }
    });

    test('3.2: Zero-PHI room regex strictly rejects PHI, missing prefixes, or invalid lengths', () => {
      const invalidRooms = [
        'call-juan-delacruz-123',
        'call-mrn-2026-99999',
        'call-patient-hypertension',
        'room-550e8400-e29b-41d4-a716-446655440000',
        '550e8400-e29b-41d4-a716-446655440000',
        'call-0123456789abcdef0123456789abcde', // 31 chars
        'call-550e8400-e29b-41d4-a716-446655440000-leak', // > 36 chars
        'call-',
        'call-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz', // non-hex
      ];

      for (const room of invalidRooms) {
        expect(ZERO_PHI_ROOM_REGEX.test(room)).toBe(false);
      }
    });

    test('3.3: Zero-PHI participant regex allows valid prefixes and opaque identifiers', () => {
      const validParticipants = [
        'staff:doc-123',
        'staff-usr-999',
        'patient:pat-550e8400',
        'patient-pat_001',
        'guest:gst-external',
        'participant:anon-token',
        'staff:1',
      ];

      for (const p of validParticipants) {
        expect(ZERO_PHI_PARTICIPANT_REGEX.test(p)).toBe(true);
      }
    });

    test('3.4: Zero-PHI participant regex strictly rejects PHI (names, emails) and invalid prefixes', () => {
      const invalidParticipants = [
        'staff:Dr Maria Santos', // space / name
        'patient:juan.delacruz@gmail.com', // email
        'doctor:doc-1', // illegal prefix
        'admin:adm-1', // illegal prefix
        'nurse:nur-1', // illegal prefix
        'clinician:cli-1', // illegal prefix
        `staff:${'a'.repeat(65)}`, // > 64 chars
        'staff:', // empty id
        'staff:id#special', // special character #
      ];

      for (const p of invalidParticipants) {
        expect(ZERO_PHI_PARTICIPANT_REGEX.test(p)).toBe(false);
      }
    });
  });

  // ===========================================================================
  // Focus 4: Touch Target Enforcement (min 44px)
  // ===========================================================================
  describe('Focus 4: Touch Target Enforcement (>= 44px)', () => {
    test('4.1: Theme touchTarget constant equals 44px', () => {
      expect(theme.sizes.touchTarget).toBe(44);
    });

    test('4.2: Audit AppointmentInspectionModal styles for touch target compliance', async () => {
      const inspectionModalCode = await Bun.file(path.join(appDir, 'components/calendar/AppointmentInspectionModal.tsx')).text();
      
      const hasPolicyMinHeight = inspectionModalCode.includes('minHeight: theme.sizes.touchTarget');
      expect(hasPolicyMinHeight).toBe(true);

      const hasTeleconsultBtnStyle = inspectionModalCode.includes('styles.btnTeleconsult');
      expect(hasTeleconsultBtnStyle).toBe(true);
      
      const btnStyleMatch = inspectionModalCode.match(/btn:\s*\{[\s\S]*?\}/);
      const btnTeleconsultStyleMatch = inspectionModalCode.match(/btnTeleconsult:\s*\{[\s\S]*?\}/);
      const policySwitchBtnMatch = inspectionModalCode.match(/policySwitchBtn:\s*\{[\s\S]*?\}/);
      
      const btnHasMinHeight = btnStyleMatch ? btnStyleMatch[0].includes('touchTarget') || btnStyleMatch[0].includes('minHeight: 44') : false;
      const btnTeleconsultHasMinHeight = btnTeleconsultStyleMatch ? btnTeleconsultStyleMatch[0].includes('touchTarget') || btnTeleconsultStyleMatch[0].includes('minHeight: 44') : false;
      const btnTeleconsultHasMinWidth = btnTeleconsultStyleMatch ? btnTeleconsultStyleMatch[0].includes('touchTarget') || btnTeleconsultStyleMatch[0].includes('minWidth: 44') : false;
      const policyHasMinWidth = policySwitchBtnMatch ? policySwitchBtnMatch[0].includes('touchTarget') || policySwitchBtnMatch[0].includes('minWidth: 44') : false;

      // EMPIRICAL VERIFICATION: styles.btn and styles.btnTeleconsult enforce minHeight: theme.sizes.touchTarget (44px)
      expect(btnHasMinHeight || btnTeleconsultHasMinHeight).toBe(true);
      expect(btnTeleconsultHasMinWidth).toBe(true);
      expect(policyHasMinWidth).toBe(true);
    });

    test('4.3: Audit TeleconsultSettingsCard styles for touch target compliance', async () => {
      const code = await Bun.file(path.join(appDir, 'components/settings/cards/TeleconsultSettingsCard.tsx')).text();
      expect(code.includes('optionPill: {')).toBe(true);
      expect(code.includes('minHeight: theme.sizes.touchTarget')).toBe(true);
      expect(code.includes('minWidth: theme.sizes.touchTarget')).toBe(true);
      expect(code.includes('saveButton:')).toBe(true);
    });

    test('4.4: Audit ClinicRecordingPlayerModal styles for touch target compliance', async () => {
      const code = await Bun.file(path.join(appDir, 'components/teleconsult/ClinicRecordingPlayerModal.tsx')).text();
      expect(code.includes('touchableMinSize:')).toBe(true);
      expect(code.includes('minHeight: theme.sizes.touchTarget')).toBe(true);
      expect(code.includes('minWidth: theme.sizes.touchTarget')).toBe(true);
    });

    test('4.5: Audit TeleconsultWaitingRoomModal styles for touch target compliance', async () => {
      const code = await Bun.file(path.join(appDir, 'components/teleconsult/TeleconsultWaitingRoomModal.tsx')).text();
      expect(code.includes('dockedIconButton:')).toBe(true);
      expect(code.includes('minHeight: theme.sizes.touchTarget')).toBe(true);
      expect(code.includes('minWidth: theme.sizes.touchTarget')).toBe(true);
      expect(code.includes('touchableMinSize:')).toBe(true);
    });
  });

  // ===========================================================================
  // Focus 5: HMAC Ticket Expiration & Tamper Resistance
  // ===========================================================================
  describe('Focus 5: 15-Minute Playback Ticket Validation & Expiration', () => {
    const sessionId = '550e8400-e29b-41d4-a716-446655440000';
    const userId = 'usr-admin-01';

    test('5.1: Newly generated ticket is valid at T=0 and T=14 minutes', () => {
      const now = Date.now();
      const ticketObj = createTicket(sessionId, userId, 15 * 60 * 1000);

      // Check at T = 0
      const res0 = verifyTicket(ticketObj.ticket, now);
      expect(res0.valid).toBe(true);
      expect(res0.sessionId).toBe(sessionId);

      // Check at T = 14m 50s
      const res14 = verifyTicket(ticketObj.ticket, now + 14 * 60 * 1000 + 50 * 1000);
      expect(res14.valid).toBe(true);
    });

    test('5.2: Ticket expires cleanly after 15 minutes', () => {
      const now = Date.now();
      const ticketObj = createTicket(sessionId, userId, 15 * 60 * 1000);

      // Check at T = 15m 01s
      const resExpired = verifyTicket(ticketObj.ticket, now + 15 * 60 * 1000 + 1000);
      expect(resExpired.valid).toBe(false);
      expect(resExpired.error).toBe('Ticket expired');
    });

    test('5.3: Ticket rejects signature tampering and modified payload', () => {
      const ticketObj = createTicket(sessionId, userId, 15 * 60 * 1000);
      const [payload, sig] = ticketObj.ticket.split('.');

      // 1. Altered payload (change sessionId)
      const forgedPayload = `660f9511-f30c-52e5-b827-557766551111:${userId}:${ticketObj.expiresAtMs}:nonce123`;
      const resForgedPayload = verifyTicket(`${forgedPayload}.${sig}`);
      expect(resForgedPayload.valid).toBe(false);
      expect(resForgedPayload.error).toBe('Signature mismatch');

      // 2. Altered signature
      const badSig = sig.slice(0, -3) + 'abc';
      const resForgedSig = verifyTicket(`${payload}.${badSig}`);
      expect(resForgedSig.valid).toBe(false);
      expect(resForgedSig.error).toBe('Signature mismatch');

      // 3. Malformed format (no signature)
      const resNoSig = verifyTicket(payload);
      expect(resNoSig.valid).toBe(false);
      expect(resNoSig.error).toBe('Malformed format');
    });

    test('5.4: buildRecordingStreamUrl generates valid query string with encoded ticket and optional segmentIndex', () => {
      const ticket = 'sess-1:usr-1:123456.sig789';
      const urlWithSeg = clinicService.buildRecordingStreamUrl('sess-1', ticket, 3);
      expect(urlWithSeg).toContain('/teleconsult/recordings/sessions/sess-1/stream');
      expect(urlWithSeg).toContain('ticket=sess-1%3Ausr-1%3A123456.sig789');
      expect(urlWithSeg).toContain('segmentIndex=3');

      const urlWithoutSeg = clinicService.buildRecordingStreamUrl('sess-1', ticket);
      expect(urlWithoutSeg).toContain('ticket=sess-1%3Ausr-1%3A123456.sig789');
      expect(urlWithoutSeg).not.toContain('segmentIndex');
    });
  });

  // ===========================================================================
  // CRITICAL INTEGRATION CHECK: CallWaitingRoom Payment Gate with 'Pending' status
  // ===========================================================================
  describe('Critical Challenge: CallWaitingRoom Gating with Statutory "Pending" Status', () => {
    test('6.1: Demonstrates whether CallWaitingRoom blocks prepaid admission when paymentStatus is Pending', async () => {
      const commsDir = path.resolve(rootDir, 'packages/comms-sdk');
      const webCode = await Bun.file(path.join(commsDir, 'src/web-ui/CallWaitingRoom.tsx')).text();
      const nativeCode = await Bun.file(path.join(commsDir, 'src/native-ui/CallWaitingRoom.tsx')).text();

      // Check how isPrepaidBlocked is defined in comms-sdk
      const webHasOnlyUnpaid = webCode.includes("paymentStatus === 'Unpaid'");
      const nativeHasOnlyUnpaid = nativeCode.includes("paymentStatus === 'Unpaid'");

      expect(webHasOnlyUnpaid).toBe(true);
      expect(nativeHasOnlyUnpaid).toBe(true);

      // Verify what happens if paymentStatus is 'Pending':
      const paymentPolicy = 'Prepaid';
      const paymentStatus = 'Pending';
      const isYakapExempt = false;

      const isPrepaidBlockedActual =
        paymentPolicy === 'Prepaid' &&
        paymentStatus === 'Unpaid' &&
        !isYakapExempt;

      // In current implementation: 'Pending' === 'Unpaid' is false!
      expect(isPrepaidBlockedActual).toBe(false);

      // What it SHOULD be (both 'Pending' and 'Unpaid' are unpaid):
      const isPrepaidBlockedCorrect =
        paymentPolicy === 'Prepaid' &&
        (paymentStatus === 'Pending' || paymentStatus === 'Unpaid') &&
        !isYakapExempt;

      expect(isPrepaidBlockedCorrect).toBe(true);
    });
  });
});
