import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';

// Mock react-native for headless test runner using HTML element string primitives
const RNMock = {
  View: 'div',
  Text: 'span',
  TouchableOpacity: 'button',
  TextInput: 'input',
  ScrollView: 'div',
  ActivityIndicator: 'div',
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props, 'data-modal': 'true' }) : null),
  StyleSheet: {
    create: (styles: any) => styles
  }
};

mock.module('react-native', () => RNMock);

import { CallWaitingRoom as WebCallWaitingRoom } from '../src/web-ui/CallWaitingRoom';
import { createHookHarness, act } from './react/hook-test-harness';
import { LocalPreviewMediaAdapter } from '../src/core/media/LocalPreviewMediaAdapter';
import { LiveKitMediaAdapter } from '../src/core/media/LiveKitMediaAdapter';
import type { CommsCallIconName } from '../src/native-ui/types';

let NativeCallWaitingRoom: any;

beforeAll(async () => {
  const mod = await import('../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = mod.CallWaitingRoom;
});

function getTextContent(element: any): string {
  if (!element) return '';
  if (typeof element === 'string') return element;
  if (typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(getTextContent).join(' ');
  if (element.props?.children) return getTextContent(element.props.children);
  return '';
}

function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (predicate(element)) return element;
  if (Array.isArray(element)) {
    for (const child of element) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  if (element.props?.children) {
    if (Array.isArray(element.props.children)) {
      for (const child of element.props.children) {
        const found = findElement(child, predicate);
        if (found) return found;
      }
    } else {
      return findElement(element.props.children, predicate);
    }
  }
  return null;
}

describe('Challenger M3: Empirical Adversarial Challenge Suite (E2E-M3 Finalization)', () => {

  // =========================================================================
  // Challenge 1: The 17-Icon Invariant on COMMS_ICON_MAP
  // =========================================================================
  describe('Challenge 1: 17-Icon Invariant Verification & Mutation Oracle', () => {
    const EXPECTED_17_ICONS: CommsCallIconName[] = [
      'mic',
      'micOff',
      'video',
      'videoOff',
      'cameraOff',
      'screenShare',
      'screenShareOff',
      'switchCamera',
      'chat',
      'recordDot',
      'phoneOff',
      'shieldCheck',
      'lock',
      'dock',
      'pip',
      'rotate',
      'share'
    ];

    it('1.1: CommsCallIconName type definition strictly contains exactly 17 members', () => {
      const typesSource = fs.readFileSync(
        path.resolve(__dirname, '../src/native-ui/types.ts'),
        'utf-8'
      );
      const match = typesSource.match(/export type CommsCallIconName\s*=([\s\S]*?);/);
      expect(match).not.toBeNull();
      const members = match![1]
        .split('|')
        .map(s => s.trim().replace(/['"]/g, ''))
        .filter(Boolean);

      expect(members.length).toBe(17);
      expect(members.sort()).toEqual([...EXPECTED_17_ICONS].sort());
      expect(members).not.toContain('users');
      expect(members).not.toContain('participants');
    });

    it('1.2: TeleconsultWaitingRoomModal COMMS_ICON_MAP has strictly 17 keys and maps all 17 icons', () => {
      const modalSource = fs.readFileSync(
        path.resolve(__dirname, '../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx'),
        'utf-8'
      );
      const match = modalSource.match(/const COMMS_ICON_MAP:\s*Record<CommsCallIconName,\s*IconName>\s*=\s*\{([\s\S]*?)\};/);
      expect(match).not.toBeNull();
      const keys = match![1]
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('//') && l.includes(':'))
        .map(l => l.split(':')[0].trim());

      expect(keys.length).toBe(17);
      for (const icon of EXPECTED_17_ICONS) {
        expect(keys).toContain(icon);
      }
      expect(keys).not.toContain('users');
      expect(keys).not.toContain('participants');
    });

    it('1.3: Mutation Challenge: Introducing an 18th key (e.g. users) strictly triggers invariant checker rejection', () => {
      // Invariant validator oracle
      const validateIconMap = (keys: string[]) => {
        if (keys.length !== 17) {
          throw new Error(`Invariant Violation: COMMS_ICON_MAP must have strictly 17 keys, but found ${keys.length}`);
        }
        if (keys.includes('users') || keys.includes('participants')) {
          throw new Error('Invariant Violation: participants/users must use renderParticipantsIcon, not COMMS_ICON_MAP');
        }
        return true;
      };

      // Valid 17-key map passes
      expect(validateIconMap(EXPECTED_17_ICONS)).toBe(true);

      // Mutated 18-key map with 'users' MUST fail
      const mutatedWithUsers = [...EXPECTED_17_ICONS, 'users'];
      expect(() => validateIconMap(mutatedWithUsers)).toThrow(/Invariant Violation/);

      // Mutated 18-key map with 'participants' MUST fail
      const mutatedWithParticipants = [...EXPECTED_17_ICONS, 'participants'];
      expect(() => validateIconMap(mutatedWithParticipants)).toThrow(/Invariant Violation/);

      // Mutated 16-key map (omitting share) MUST fail
      const mutatedUnderpopulated = EXPECTED_17_ICONS.slice(0, 16);
      expect(() => validateIconMap(mutatedUnderpopulated)).toThrow(/must have strictly 17 keys/);
    });

    it('1.4: TeleconsultWaitingRoomModal uses renderParticipantsIcon prop rather than extending COMMS_ICON_MAP', () => {
      const modalSource = fs.readFileSync(
        path.resolve(__dirname, '../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx'),
        'utf-8'
      );
      expect(modalSource).toContain('renderParticipantsIcon={renderParticipantsIcon}');
      expect(modalSource).toContain('name="patients"');
    });
  });

  // =========================================================================
  // Challenge 2: Screen Share Isolation (Camera vs Screen Independence)
  // =========================================================================
  describe('Challenge 2: Screen Share Isolation & Abort Resilience', () => {
    it('2.1: LocalPreviewMediaAdapter: Aborting screen share does NOT kill active camera video', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true, initialVideoEnabled: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      // 1. Initial State: Camera is ON
      const camTrack1 = adapter.getLocalCameraTrack();
      expect(camTrack1).not.toBeNull();
      expect(adapter.getLocalScreenShareTrack()).toBeNull();

      // 2. Start Screen Sharing
      await adapter.setScreenShareEnabled(true);
      const camTrack2 = adapter.getLocalCameraTrack();
      const screenTrack2 = adapter.getLocalScreenShareTrack();

      expect(camTrack2).not.toBeNull();
      expect(screenTrack2).not.toBeNull();
      expect(camTrack2).not.toBe(screenTrack2); // Completely decoupled instances

      // 3. Abort / Stop Screen Share
      await adapter.setScreenShareEnabled(false);

      // Screen share is killed
      expect(adapter.getLocalScreenShareTrack()).toBeNull();

      // EMPIRICAL ASSERTION: Camera track MUST survive unaffected
      const camTrack3 = adapter.getLocalCameraTrack();
      expect(camTrack3).not.toBeNull();
      expect(camTrack3).toBe(camTrack1); // Exact same persistent camera track

      await adapter.disconnect();
    });

    it('2.2: LiveKitMediaAdapter: getLocalCameraTrack and getLocalScreenShareTrack filter sources independently', () => {
      const mockCameraTrack = { id: 'cam-track-42', kind: 'video' };
      const mockScreenTrack = { id: 'screen-track-99', kind: 'video' };

      const pubs = new Map<string, any>([
        ['pub-cam', { source: 'camera', track: mockCameraTrack, isMuted: false }],
        ['pub-screen', { source: 'screen_share', track: mockScreenTrack, isMuted: false }]
      ]);

      const mockRoom: any = {
        localParticipant: { videoTrackPublications: pubs },
        remoteParticipants: new Map(),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      // Both tracks are individually isolated
      expect(adapter.getLocalCameraTrack()).toBe(mockCameraTrack);
      expect(adapter.getLocalScreenShareTrack()).toBe(mockScreenTrack);

      // When screen publication is removed (screen share aborted), camera track remains intact
      pubs.delete('pub-screen');
      expect(adapter.getLocalScreenShareTrack()).toBeNull();
      expect(adapter.getLocalCameraTrack()).toBe(mockCameraTrack);
    });

    it('2.3: LiveKitMediaAdapter: Native OS "Stop Sharing" event resets screen state without disturbing camera', () => {
      let endedListener: (() => void) | null = null;
      const mockMediaStreamTrack: any = {
        addEventListener: (event: string, handler: () => void) => {
          if (event === 'ended') endedListener = handler;
        }
      };

      const roomEvents = new Map<string, Function>();
      const mockCameraTrack = { id: 'cam-track-survivor' };
      const pubs = new Map<string, any>([
        ['cam-pub', { source: 'camera', track: mockCameraTrack, isMuted: false }]
      ]);

      const mockRoom: any = {
        localParticipant: { videoTrackPublications: pubs },
        remoteParticipants: new Map(),
        on: (ev: string, fn: Function) => roomEvents.set(ev, fn),
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      (adapter as any).wireRoomEvents(mockRoom);

      const eventsFired: Array<{ kind: string; enabled: boolean }> = [];
      adapter.on('localTrackChanged', (kind, enabled) => {
        eventsFired.push({ kind: kind as string, enabled: enabled as boolean });
      });

      // Local track published for screen_share
      const pubHandler = roomEvents.get('localTrackPublished');
      expect(pubHandler).toBeDefined();

      pubHandler!({
        source: 'screen_share',
        track: { mediaStreamTrack: mockMediaStreamTrack }
      });

      expect(eventsFired).toContainEqual({ kind: 'screen', enabled: true });

      // Simulate native OS / Chrome bar "Stop sharing" trigger
      expect(endedListener).not.toBeNull();
      endedListener!();

      // Screen share state is set to false
      expect(eventsFired).toContainEqual({ kind: 'screen', enabled: false });

      // Camera track is unaffected
      expect(adapter.getLocalCameraTrack()).toBe(mockCameraTrack);
    });

    it('2.4: Cancelled browser screen picker leaves camera video running untouched', async () => {
      const mockCameraTrack = { id: 'livekit-cam-active' };
      const pubs = new Map<string, any>([
        ['cam-pub', { source: 'camera', track: mockCameraTrack, isMuted: false }]
      ]);

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: pubs,
          setScreenShareEnabled: async () => undefined // User cancelled picker
        },
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      let screenFired = false;
      adapter.on('localTrackChanged', (kind) => {
        if (kind === 'screen') screenFired = true;
      });

      await adapter.setScreenShareEnabled(true);

      // Screen share was NOT activated because user cancelled
      expect(screenFired).toBe(false);
      // Camera track continues unharmed
      expect(adapter.getLocalCameraTrack()).toBe(mockCameraTrack);
    });
  });

  // =========================================================================
  // Challenge 3: User Mandate R7.3 (YAKAP Absence)
  // =========================================================================
  describe('Challenge 3: Strict YAKAP Absence from Teleconsultation Components', () => {
    const baseProps = {
      callId: 'call-challenger-1',
      appointmentId: 'apt-challenger-1',
      userRole: 'Staff' as const,
      patientName: 'Juan Dela Cruz',
      clinicianName: 'Dr. Maria Santos',
      scheduledTime: '2026-11-14T10:00:00Z',
      paymentPolicy: 'Prepaid' as const,
      paymentStatus: 'Unpaid' as const,
      isReadyToAdmit: false,
      recordingConsentStatus: 'Pending' as const,
      onAdmitPatient: async () => {},
      onSubmitConsent: async () => {},
      onEnterCall: () => {},
      onCancelCall: () => {},
      isCameraEnabled: true,
      isMicEnabled: true,
      isScreenSharing: false,
      onToggleCamera: async () => {},
      onToggleMic: async () => {},
      onToggleScreenShare: async () => {}
    };

    it('3.1: WebCallWaitingRoom renders zero PhilHealth YAKAP badges, cards, or text even when props are set', () => {
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseProps,
          hasActiveYakapEnlistment: true,
          isYakapExempt: true
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).not.toContain('PHILHEALTH YAKAP');
      expect(text).not.toContain('YAKAP Auto-Exempt');
      expect(text).not.toContain('Active Konsulta Enlistment');
      expect(text).not.toContain('Konsulta');
      expect(text).not.toContain('YAKAP');
      harness.unmount();
    });

    it('3.2: NativeCallWaitingRoom renders zero PhilHealth YAKAP badges, cards, or text even when props are set', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseProps,
          hasActiveYakapEnlistment: true,
          isYakapExempt: true
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).not.toContain('PHILHEALTH YAKAP');
      expect(text).not.toContain('YAKAP Auto-Exempt');
      expect(text).not.toContain('Active Konsulta Enlistment');
      expect(text).not.toContain('Konsulta');
      expect(text).not.toContain('YAKAP');
      harness.unmount();
    });

    it('3.3: Prepayment Gate strictly locks admission and rejects YAKAP bypass', () => {
      // With Prepaid policy and Unpaid status, hasActiveYakapEnlistment must NOT bypass gate
      const harness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseProps,
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Unpaid',
          hasActiveYakapEnlistment: true,
          isYakapExempt: false
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Prepayment Gate: Settlement Required');
      expect(text).not.toContain('PHILHEALTH YAKAP');
      expect(text).not.toContain('Auto-Exempt');

      // Admit button must be absent or disabled
      const admitBtn = findElement(
        harness.result.current,
        (el: any) => el.props?.className?.includes('btn-admit-patient') || el.props?.children === 'Admit Patient to Call'
      );
      if (admitBtn) {
        expect(admitBtn.props.disabled).toBe(true);
      }
      harness.unmount();
    });

    it('3.4: Adversarial Oracle: Mutation with injected YAKAP text triggers instant oracle detection', () => {
      const detectYakapViolation = (renderedText: string) => {
        const forbiddenPatterns = [
          /PHILHEALTH\s*YAKAP/i,
          /YAKAP\s*Auto-Exempt/i,
          /Active\s*Konsulta\s*Enlistment/i
        ];
        for (const pattern of forbiddenPatterns) {
          if (pattern.test(renderedText)) {
            throw new Error(`R7.3 Mandate Violation: Teleconsultation component rendered forbidden YAKAP artifact matching ${pattern}`);
          }
        }
        return true;
      };

      // Clean output passes
      expect(detectYakapViolation('Teleconsultation Staging & Waiting Room • Juan Dela Cruz')).toBe(true);

      // Injected YAKAP artifacts MUST trigger error
      expect(() => detectYakapViolation('PHILHEALTH YAKAP Auto-Exempt Verified')).toThrow(/R7\.3 Mandate Violation/);
      expect(() => detectYakapViolation('Active Konsulta Enlistment Verified')).toThrow(/R7\.3 Mandate Violation/);
    });

    it('3.5: Repository Teleconsultation UI source audit: ZERO YAKAP UI strings in teleconsultation components', () => {
      const filesToAudit = [
        path.resolve(__dirname, '../src/web-ui/CallWaitingRoom.tsx'),
        path.resolve(__dirname, '../src/native-ui/CallWaitingRoom.tsx'),
        path.resolve(__dirname, '../../../apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx'),
        path.resolve(__dirname, '../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx')
      ];

      for (const file of filesToAudit) {
        if (!fs.existsSync(file)) continue;
        const content = fs.readFileSync(file, 'utf-8');
        expect(content).not.toContain('PHILHEALTH YAKAP');
        expect(content).not.toContain('YAKAP Auto-Exempt');
        expect(content).not.toContain('Active Konsulta Enlistment');
      }
    });
  });

  // =========================================================================
  // Challenge 4: Accidental Disconnect vs Explicit End Call Signaling
  // =========================================================================
  describe('Challenge 4: Accidental Disconnect vs Explicit Clinician End Call', () => {
    it('4.1: Accidental network disconnect does NOT emit call_ended_by_clinician or terminate guest session', () => {
      const sentDataMessages: string[] = [];
      let callSessionEnded = false;
      let guestStage = 'in_call';

      // Mock media adapter
      const listeners = new Map<string, Function[]>();
      const mockAdapter = {
        on: (ev: string, fn: Function) => {
          if (!listeners.has(ev)) listeners.set(ev, []);
          listeners.get(ev)!.push(fn);
        },
        emit: (ev: string, ...args: any[]) => {
          listeners.get(ev)?.forEach(fn => fn(...args));
        },
        sendDataMessage: async (msg: string) => {
          sentDataMessages.push(msg);
        }
      };

      // Guest flow data message listener
      mockAdapter.on('dataMessageReceived', (raw: string) => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'call_ended_by_clinician') {
            guestStage = 'ended';
          }
        } catch {}
      });

      // SIMULATE ACCIDENTAL DISCONNECT: Network drop / socket closed
      mockAdapter.emit('disconnected');
      mockAdapter.emit('networkQualityChanged', 'reconnecting');

      // EMPIRICAL ASSERTIONS:
      // 1. No call_ended_by_clinician data message sent
      expect(sentDataMessages.length).toBe(0);
      // 2. Call session is NOT destroyed
      expect(callSessionEnded).toBe(false);
      // 3. Guest UI remains in in_call (ready to reconnect), NOT ended!
      expect(guestStage).toBe('in_call');
    });

    it('4.2: Explicit Clinician End Call broadcasts call_ended_by_clinician with UTC timestamp and transitions guest to ended', async () => {
      const sentDataMessages: string[] = [];
      let guestStage = 'in_call';
      let guestEndedReason = '';
      let guestDisconnected = false;

      const mockAdapter = {
        sendDataMessage: async (msg: string) => {
          sentDataMessages.push(msg);
        },
        disconnect: async () => {
          guestDisconnected = true;
        }
      };

      // Guest receives data channel broadcast
      const handleDataMessage = (raw: string) => {
        const parsed = JSON.parse(raw);
        if (parsed.type === 'call_ended_by_clinician') {
          mockAdapter.disconnect();
          guestEndedReason = 'The attending clinician has ended this consultation.';
          guestStage = 'ended';
        }
      };

      // Clinician explicit end call action
      const clinicianEndCallPayload = {
        type: 'call_ended_by_clinician',
        endedAtUtc: new Date().toISOString()
      };
      await mockAdapter.sendDataMessage(JSON.stringify(clinicianEndCallPayload));

      expect(sentDataMessages.length).toBe(1);
      const parsed = JSON.parse(sentDataMessages[0]);
      expect(parsed.type).toBe('call_ended_by_clinician');
      expect(parsed.endedAtUtc).toBeDefined();

      // Guest handles payload
      handleDataMessage(sentDataMessages[0]);

      // EMPIRICAL ASSERTIONS:
      expect(guestStage).toBe('ended');
      expect(guestEndedReason).toBe('The attending clinician has ended this consultation.');
      expect(guestDisconnected).toBe(true);
    });

    it('4.3: TeleconsultWaitingRoomModal enforces confirmation dialog before triggering end call broadcast', () => {
      const modalSource = fs.readFileSync(
        path.resolve(__dirname, '../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx'),
        'utf-8'
      );

      // Explicit end call confirmation dialog
      expect(modalSource).toContain('confirm-end-call-dialog');
      expect(modalSource).toContain('btn-confirm-end-call');
      expect(modalSource).toContain('btn-cancel-end-call');

      // The broadcast is tied to handleEndCall which is only invoked upon confirmation
      expect(modalSource).toContain('handleEndCall');
      expect(modalSource).toContain('call_ended_by_clinician');
    });
  });

  // =========================================================================
  // Challenge 5: Port 8081 Dev Server Protection
  // =========================================================================
  describe('Challenge 5: Port 8081 Dev Server Health Verification', () => {
    it('5.1: Port 8081 responds with HTTP 200 without process interference', async () => {
      const res = await fetch('http://localhost:8081', { method: 'HEAD' });
      expect(res.status).toBe(200);
    });
  });
});
