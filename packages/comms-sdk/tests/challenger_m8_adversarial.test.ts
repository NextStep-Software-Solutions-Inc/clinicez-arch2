import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

// Mock react-native for headless test runner
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

import { useCallSession } from '../src/react/hooks/useCallSession';
import { createHookHarness, act } from './react/hook-test-harness';
import { CallWaitingRoom as WebCallWaitingRoom } from '../src/web-ui/CallWaitingRoom';
import { CallStage as WebCallStage } from '../src/web-ui/CallStage';
import type { IMediaRoomAdapter, RemoteParticipant } from '../src/core/media/IMediaRoomAdapter';

let NativeCallWaitingRoom: any;
let NativeCallStage: any;

beforeAll(async () => {
  const wrMod = await import('../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = wrMod.CallWaitingRoom;
  const csMod = await import('../src/native-ui/CallStage');
  NativeCallStage = csMod.CallStage;
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

function createMockAdapter(initialRemotes: RemoteParticipant[] = []): IMediaRoomAdapter & {
  triggerEvent: (event: string, ...args: any[]) => void;
  setRemotes: (remotes: RemoteParticipant[]) => void;
} {
  const listeners = new Map<string, Set<Function>>();
  let remotes = [...initialRemotes];

  return {
    connectionState: 'connected',
    isConnected: () => true,
    connect: async () => {},
    disconnect: async () => {},
    setAudioEnabled: async () => {},
    setVideoEnabled: async () => {},
    setScreenShareEnabled: async () => {},
    switchCamera: async () => {},
    getRemoteParticipants: () => remotes,
    setRemotes: (newRemotes: RemoteParticipant[]) => {
      remotes = [...newRemotes];
    },
    on: (event: string, callback: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(callback);
      return () => {
        listeners.get(event)?.delete(callback);
      };
    },
    triggerEvent: (event: string, ...args: any[]) => {
      listeners.get(event)?.forEach((cb) => cb(...args));
    }
  };
}

describe('Challenger M8.2: Comms SDK Adversarial Verification Suite', () => {
  // =========================================================================
  // Dimension 1: Participant Name Resolution Matrix
  // =========================================================================
  describe('Dimension 1: Participant Name Resolution Matrix', () => {
    it('1.1: Fallbacks cleanly to "Dr. Clinician" and isDoctor: true when options are undefined', () => {
      const harness = createHookHarness(() => useCallSession('call-session-matrix-1'));
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Dr. Clinician');
      expect(self.isDoctor).toBe(true);
      expect(self.identity).toBe('staff-current');
      expect(self.isCameraEnabled).toBe(true);
      expect(self.isMicEnabled).toBe(true);
      harness.unmount();
    });

    it('1.2: Fallbacks cleanly to "Dr. Clinician" and isDoctor: true when options is empty object', () => {
      const harness = createHookHarness(() => useCallSession('call-session-matrix-2', {}));
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Dr. Clinician');
      expect(self.isDoctor).toBe(true);
      harness.unmount();
    });

    it('1.3: Resolves to "Participant" and isDoctor: false when isDoctor is explicitly false and no name provided', () => {
      const harness = createHookHarness(() => useCallSession('call-session-matrix-3', { isDoctor: false }));
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Participant');
      expect(self.isDoctor).toBe(false);
      harness.unmount();
    });

    it('1.4: Resolves to "Dr. Clinician" and isDoctor: true when isDoctor is explicitly true and no name provided', () => {
      const harness = createHookHarness(() => useCallSession('call-session-matrix-4', { isDoctor: true }));
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Dr. Clinician');
      expect(self.isDoctor).toBe(true);
      harness.unmount();
    });

    it('1.5: Preserves explicit participantName with isDoctor: false', () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-matrix-5', {
          participantName: 'Patient Maria Clara',
          isDoctor: false,
          participantIdentity: 'patient-mc-01'
        })
      );
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Patient Maria Clara');
      expect(self.isDoctor).toBe(false);
      expect(self.identity).toBe('patient-mc-01');
      harness.unmount();
    });

    it('1.6: Preserves explicit participantName with isDoctor: true', () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-matrix-6', {
          participantName: 'Dr. Jose Rizal, MD',
          isDoctor: true,
          participantIdentity: 'doctor-jr-01'
        })
      );
      expect(harness.result.current.participants.length).toBe(1);
      const self = harness.result.current.participants[0];
      expect(self.name).toBe('Dr. Jose Rizal, MD');
      expect(self.isDoctor).toBe(true);
      expect(self.identity).toBe('doctor-jr-01');
      harness.unmount();
    });

    it('1.7: Non-doctor participantName overrides default without prefixing Dr.', () => {
      const harness = createHookHarness(() =>
        useCallSession('call-session-matrix-7', {
          participantName: 'Triage Nurse Ramos',
          isDoctor: false
        })
      );
      expect(harness.result.current.participants[0].name).toBe('Triage Nurse Ramos');
      expect(harness.result.current.participants[0].isDoctor).toBe(false);
      harness.unmount();
    });

    it('1.8: Preserves local self participant through remote participant synchronization', async () => {
      const mockAdapter = createMockAdapter([
        {
          identity: 'remote-pt-1',
          name: 'Juan Dela Cruz',
          isVideoEnabled: true,
          isAudioEnabled: true,
          isScreenSharing: false,
          joinedAt: new Date()
        },
        {
          identity: 'remote-pt-2',
          name: '', // Empty name should fallback to 'Participant'
          isVideoEnabled: false,
          isAudioEnabled: false,
          isScreenSharing: false,
          joinedAt: new Date()
        }
      ]);

      const harness = createHookHarness(() =>
        useCallSession('call-session-matrix-8', {
          participantName: 'Nurse Joy',
          isDoctor: false,
          mediaAdapter: mockAdapter
        })
      );

      // Trigger trackSubscribed event on adapter to run syncParticipants
      await act(async () => {
        mockAdapter.triggerEvent('trackSubscribed');
      });

      const parts = harness.result.current.participants;
      expect(parts.length).toBe(3);

      // Index 0: Local self preserved
      expect(parts[0].name).toBe('Nurse Joy');
      expect(parts[0].isDoctor).toBe(false);

      // Index 1: Remote participant with explicit name
      expect(parts[1].identity).toBe('remote-pt-1');
      expect(parts[1].name).toBe('Juan Dela Cruz');
      expect(parts[1].isDoctor).toBe(false);

      // Index 2: Remote participant with empty name fallback
      expect(parts[2].identity).toBe('remote-pt-2');
      expect(parts[2].name).toBe('Participant');
      expect(parts[2].isDoctor).toBe(false);

      harness.unmount();
    });
  });

  // =========================================================================
  // Dimension 2: CallWaitingRoom Orientation & Plain Copy
  // =========================================================================
  describe('Dimension 2: CallWaitingRoom Orientation & Plain Copy', () => {
    it('2.1: Native CallWaitingRoom supports portrait-first default aspect ratio 3/4', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-1',
          userRole: 'Clinician',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Paid',
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      // In Native CallWaitingRoom, previewBox has style array containing { aspectRatio: 3 / 4 }
      const previewBox = findElement(harness.result.current, (el) => {
        const style = el.props?.style;
        if (Array.isArray(style)) {
          return style.some((s) => s && s.aspectRatio === 3 / 4);
        }
        return false;
      });
      expect(previewBox).toBeDefined();
      expect(previewBox).not.toBeNull();
      harness.unmount();
    });

    it('2.2: Native CallWaitingRoom switches to 16/9 aspect ratio when videoOrientation is landscape', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-2',
          userRole: 'Clinician',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Paid',
          videoOrientation: 'landscape',
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      const previewBox = findElement(harness.result.current, (el) => {
        const style = el.props?.style;
        if (Array.isArray(style)) {
          return style.some((s) => s && s.aspectRatio === 16 / 9);
        }
        return false;
      });
      expect(previewBox).toBeDefined();
      expect(previewBox).not.toBeNull();
      harness.unmount();
    });

    it('2.3: Native CallWaitingRoom invokes onToggleOrientation and onSharePatientLink', async () => {
      let toggled = false;
      let shared = false;

      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-3',
          userRole: 'Clinician',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Paid',
          patientLink: 'https://clinicez.ph/teleconsult/join?token=abc',
          onToggleOrientation: () => {
            toggled = true;
          },
          onSharePatientLink: () => {
            shared = true;
          },
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      const rotateBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-toggle-orientation');
      expect(rotateBtn).toBeDefined();
      rotateBtn.props.onPress();
      expect(toggled).toBe(true);

      const shareBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-share-patient-link');
      expect(shareBtn).toBeDefined();
      shareBtn.props.onPress();
      expect(shared).toBe(true);
      harness.unmount();
    });

    it('2.4: Native CallWaitingRoom enforces plain copy without jargon', () => {
      const harness = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-4',
          userRole: 'Clinician',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Unpaid',
          canAdmit: false,
          isLoading: true,
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Preparing consultation...');
      expect(text).not.toContain('Staging teleconsultation session...');
      harness.unmount();

      const harnessContent = createHookHarness(() =>
        NativeCallWaitingRoom({
          callId: 'call-wr-4b',
          userRole: 'Clinician',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Prepaid',
          paymentStatus: 'Unpaid',
          canAdmit: false,
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );
      const contentText = getTextContent(harnessContent.result.current);
      expect(contentText).toContain('Doctor / Clinician:');
      expect(contentText).not.toContain('Attending Clinician:');
      expect(contentText).toContain('Payment Required Before Consultation');
      harnessContent.unmount();
    });

    it('2.5: Web CallWaitingRoom supports portrait-first aspect-[3/4] and landscape aspect-video', () => {
      const portraitHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          callId: 'call-wr-5',
          userRole: 'Patient',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      const portraitBox = findElement(portraitHarness.result.current, (el) =>
        typeof el.props?.className === 'string' && el.props.className.includes('aspect-[3/4]')
      );
      expect(portraitBox).not.toBeNull();
      portraitHarness.unmount();

      const landscapeHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          callId: 'call-wr-6',
          userRole: 'Patient',
          patientName: 'Patient Maria',
          clinicianName: 'Dr. Clinician',
          scheduledTime: '10:00 AM',
          paymentPolicy: 'Exempt',
          paymentStatus: 'Exempt',
          videoOrientation: 'landscape',
          onEnterCall: () => {},
          onCancelCall: () => {}
        })
      );

      const landscapeBox = findElement(landscapeHarness.result.current, (el) =>
        typeof el.props?.className === 'string' && el.props.className.includes('aspect-video')
      );
      expect(landscapeBox).not.toBeNull();
      landscapeHarness.unmount();
    });
  });

  // =========================================================================
  // Dimension 3: CallStage Centered Toolbar & Plain Copy
  // =========================================================================
  describe('Dimension 3: CallStage Centered Toolbar & Plain Copy', () => {
    it('3.1: Native CallStage centers floating media toolbar horizontally and renders dock/pip buttons', () => {
      let docked = false;
      let pipToggled = false;
      let orientationToggled = false;

      const harness = createHookHarness(() =>
        NativeCallStage({
          callId: 'call-stage-1',
          isAdmitted: true,
          patientName: 'Patient Maria',
          onEndCall: () => {},
          onDockCall: () => {
            docked = true;
          },
          onTogglePip: () => {
            pipToggled = true;
          },
          onToggleOrientation: () => {
            orientationToggled = true;
          }
        })
      );

      // Verify toolbar wrapper centers horizontally
      const toolbarWrapper = findElement(harness.result.current, (el) => {
        const style = el.props?.style;
        return (
          style &&
          style.position === 'absolute' &&
          style.alignItems === 'center' &&
          style.justifyContent === 'center' &&
          style.left === 0 &&
          style.right === 0
        );
      });
      expect(toolbarWrapper).toBeDefined();
      expect(toolbarWrapper).not.toBeNull();

      // Verify btn-dock-call
      const dockBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-dock-call');
      expect(dockBtn).toBeDefined();
      dockBtn.props.onPress();
      expect(docked).toBe(true);

      // Verify btn-toggle-pip
      const pipBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-toggle-pip');
      expect(pipBtn).toBeDefined();
      pipBtn.props.onPress();
      expect(pipToggled).toBe(true);

      // Verify btn-toggle-orientation
      const orientBtn = findElement(harness.result.current, (el) => el.props?.testID === 'btn-toggle-orientation');
      expect(orientBtn).toBeDefined();
      orientBtn.props.onPress();
      expect(orientationToggled).toBe(true);
      harness.unmount();
    });

    it('3.2: Native and Web CallStage enforce plain copy for recording', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          callId: 'call-stage-2',
          isAdmitted: true,
          patientName: 'Patient Maria',
          isRecording: true,
          onEndCall: () => {}
        })
      );

      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('Recording in progress');
      expect(nativeText).not.toContain('Vault Recording Active');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          callId: 'call-stage-3',
          isAdmitted: true,
          patientName: 'Patient Maria',
          isRecording: true,
          onEndCall: () => {}
        })
      );

      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Recording in progress');
      expect(webText).not.toContain('Vault Recording Active');
      webHarness.unmount();
    });

    it('3.3: Web CallStage renders centered toolbar with data-testid dock and pip buttons', () => {
      let docked = false;
      let pipToggled = false;

      const harness = createHookHarness(() =>
        WebCallStage({
          callId: 'call-stage-4',
          isAdmitted: true,
          patientName: 'Patient Maria',
          onEndCall: () => {},
          onDockCall: () => {
            docked = true;
          },
          onTogglePip: () => {
            pipToggled = true;
          }
        })
      );

      const dockBtn = findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'btn-dock-call');
      expect(dockBtn).toBeDefined();
      dockBtn.props.onClick();
      expect(docked).toBe(true);

      const pipBtn = findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'btn-toggle-pip');
      expect(pipBtn).toBeDefined();
      pipBtn.props.onClick();
      expect(pipToggled).toBe(true);
      harness.unmount();
    });
  });
});
