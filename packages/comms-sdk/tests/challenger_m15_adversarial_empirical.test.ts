import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

// Mock react-native for headless test runner
const RNMock = {
  View: (props: any) => React.createElement('div', props, props.children),
  Text: (props: any) => React.createElement('span', props, props.children),
  TouchableOpacity: (props: any) => React.createElement('button', props, props.children),
  TextInput: (props: any) => React.createElement('input', props),
  ScrollView: (props: any) => React.createElement('div', props, props.children),
  ActivityIndicator: (props: any) => React.createElement('div', { ...props, 'data-indicator': 'true' }),
  Modal: (props: any) => (props.visible ? React.createElement('div', { ...props, 'data-modal': 'true' }) : null),
  StyleSheet: {
    create: (styles: any) => styles
  }
};

mock.module('react-native', () => RNMock);

import { CallWaitingRoom as WebCallWaitingRoom } from '../src/web-ui/CallWaitingRoom';
import { CallStage as WebCallStage } from '../src/web-ui/CallStage';
import { createHookHarness, act } from './react/hook-test-harness';
import { sizes, spaceScale } from '@clinicez/design-tokens';
import type { CallStageParticipant } from '../src/native-ui/types';

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

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(el: any) {
    if (!el) return;
    if (Array.isArray(el)) {
      el.forEach(search);
      return;
    }
    if (predicate(el)) results.push(el);
    if (el.props?.children) {
      if (Array.isArray(el.props.children)) {
        el.props.children.forEach(search);
      } else {
        search(el.props.children);
      }
    }
  }
  search(element);
  return results;
}

describe('Challenger M15: Empirical Verification & Adversarial Stress Harness', () => {
  const baseNativeStageProps = {
    callId: 'call-m15-test-1111-2222',
    roomName: 'room-m15-test',
    userRole: 'Clinician' as const,
    participantName: 'Juan Dela Cruz',
    selfName: 'Dr. Santos',
    isMicEnabled: true,
    isCameraEnabled: true,
    onToggleMic: () => {},
    onToggleCamera: () => {},
    onEndCall: () => {}
  };

  const baseWebStageProps = {
    ...baseNativeStageProps
  };

  const baseNativeWRProps = {
    callId: 'call-m15-test-1111-2222',
    appointmentId: 'apt-m15-12345',
    userRole: 'Clinician' as const,
    patientName: 'Juan Dela Cruz',
    clinicianName: 'Dr. Santos',
    scheduledTime: '10:00 AM - 10:30 AM',
    paymentPolicy: 'Prepaid' as const,
    paymentStatus: 'Paid' as const,
    isReadyToAdmit: true,
    recordingConsentStatus: 'Approved' as const,
    onEnterCall: () => {},
    onCancelCall: () => {}
  };

  const baseWebWRProps = {
    ...baseNativeWRProps
  };

  // =========================================================================
  // Section 1: Participants Roster
  // =========================================================================
  describe('Focus 1: Participants Roster & Toolbar Integration', () => {
    it('1.1 Native CallStage: btn-toggle-participants enforces minimum touch target >= 44x44px', () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onToggleParticipants: () => {}
        })
      );
      const tree = harness.result.current;
      const toggleBtn = findElement(tree, (el) => el.props?.testID === 'btn-toggle-participants');
      expect(toggleBtn).not.toBeNull();

      // Style should contain controlButton with minWidth >= 44 and minHeight >= 44
      const styleArr = Array.isArray(toggleBtn.props.style) ? toggleBtn.props.style : [toggleBtn.props.style];
      const mergedStyle = Object.assign({}, ...styleArr.filter(Boolean));
      expect(mergedStyle.minWidth).toBeGreaterThanOrEqual(44);
      expect(mergedStyle.minHeight).toBeGreaterThanOrEqual(44);
      expect(mergedStyle.minWidth).toBeGreaterThanOrEqual(sizes.touchTarget);
      expect(mergedStyle.minHeight).toBeGreaterThanOrEqual(sizes.touchTarget);
      harness.unmount();
    });

    it('1.2 Web CallStage: btn-toggle-participants enforces minimum touch target classes min-h-[44px] min-w-[44px]', () => {
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          onToggleParticipants: () => {}
        })
      );
      const tree = harness.result.current;
      const toggleBtn = findElement(tree, (el) => el.props?.['data-testid'] === 'btn-toggle-participants');
      expect(toggleBtn).not.toBeNull();
      const className = toggleBtn.props?.className || '';
      expect(className).toContain('min-h-[44px]');
      expect(className).toContain('min-w-[44px]');
      harness.unmount();
    });

    it('1.3 Badge count strictly reflects participant counts across diverse participant matrices', () => {
      const testCases: Array<{ participants: CallStageParticipant[]; expectedBadge: string }> = [
        {
          participants: [
            { identity: 'self', name: 'Dr. Santos', isLocal: true, status: 'In call' }
          ],
          expectedBadge: '1'
        },
        {
          participants: [
            { identity: 'self', name: 'Dr. Santos', isLocal: true, status: 'In call' },
            { identity: 'patient-1', name: 'Juan Dela Cruz', isLocal: false, status: 'In call' }
          ],
          expectedBadge: '2'
        },
        {
          participants: [
            { identity: 'self', name: 'Dr. Santos', isLocal: true, status: 'In call' },
            { identity: 'patient-1', name: 'Juan Dela Cruz', isLocal: false, status: 'In call' },
            { identity: 'nurse-1', name: 'Nurse Joy', isLocal: false, status: 'In call' },
            { identity: 'relative-1', name: 'Maria Dela Cruz', isLocal: false, status: 'Waiting to join' }
          ],
          expectedBadge: '4'
        }
      ];

      for (const tc of testCases) {
        // Native
        const nativeHarness = createHookHarness(() =>
          NativeCallStage({
            ...baseNativeStageProps,
            participants: tc.participants,
            onToggleParticipants: () => {}
          })
        );
        const nativeBadge = findElement(
          nativeHarness.result.current,
          (el) => el.props?.testID === 'badge-participants-count'
        );
        expect(nativeBadge).not.toBeNull();
        expect(getTextContent(nativeBadge).trim()).toBe(tc.expectedBadge);
        nativeHarness.unmount();

        // Web
        const webHarness = createHookHarness(() =>
          WebCallStage({
            ...baseWebStageProps,
            participants: tc.participants,
            onToggleParticipants: () => {}
          })
        );
        const webBadge = findElement(
          webHarness.result.current,
          (el) => el.props?.['data-testid'] === 'badge-participants-count'
        );
        expect(webBadge).not.toBeNull();
        expect(getTextContent(webBadge).trim()).toBe(tc.expectedBadge);
        webHarness.unmount();
      }
    });

    it('1.4 Fallback participant count when participants prop is undefined respects hasRemote', () => {
      // hasRemote = false -> 1
      const nativeHarnessSolo = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: false,
          onToggleParticipants: () => {}
        })
      );
      const soloBadge = findElement(nativeHarnessSolo.result.current, (el) => el.props?.testID === 'badge-participants-count');
      expect(getTextContent(soloBadge).trim()).toBe('1');
      nativeHarnessSolo.unmount();

      // hasRemote = true -> 2
      const nativeHarnessRemote = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: true,
          onToggleParticipants: () => {}
        })
      );
      const remoteBadge = findElement(nativeHarnessRemote.result.current, (el) => el.props?.testID === 'badge-participants-count');
      expect(getTextContent(remoteBadge).trim()).toBe('2');
      nativeHarnessRemote.unmount();
    });

    it('1.5 Mutual Exclusion: Opening roster closes chat, opening chat closes roster in Native & Web', () => {
      // 1. isParticipantsOpen=true, isChatOpen=false -> Roster is visible, Chat is NOT
      const nativeRosterOpen = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isParticipantsOpen: true,
          isChatOpen: false,
          onToggleParticipants: () => {},
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'mock-chat-drawer' }, 'Chat')
        })
      );
      expect(findElement(nativeRosterOpen.result.current, (el) => el.props?.testID === 'panel-participants-roster')).not.toBeNull();
      expect(findElement(nativeRosterOpen.result.current, (el) => el.props?.['data-testid'] === 'mock-chat-drawer')).toBeNull();
      nativeRosterOpen.unmount();

      // 2. isParticipantsOpen=true, isChatOpen=true -> Chat takes precedence, Roster is suppressed
      const nativeBothOpen = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          onToggleParticipants: () => {},
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'mock-chat-drawer' }, 'Chat')
        })
      );
      expect(findElement(nativeBothOpen.result.current, (el) => el.props?.testID === 'panel-participants-roster')).toBeNull();
      expect(findElement(nativeBothOpen.result.current, (el) => el.props?.['data-testid'] === 'mock-chat-drawer')).not.toBeNull();
      nativeBothOpen.unmount();

      // 3. Web parity
      const webRosterOpen = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isParticipantsOpen: true,
          isChatOpen: false,
          onToggleParticipants: () => {},
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'mock-chat-drawer' }, 'Chat')
        })
      );
      expect(findElement(webRosterOpen.result.current, (el) => el.props?.['data-testid'] === 'panel-participants-roster')).not.toBeNull();
      expect(findElement(webRosterOpen.result.current, (el) => el.props?.['data-testid'] === 'mock-chat-drawer')).toBeNull();
      webRosterOpen.unmount();

      const webBothOpen = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          onToggleParticipants: () => {},
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'mock-chat-drawer' }, 'Chat')
        })
      );
      expect(findElement(webBothOpen.result.current, (el) => el.props?.['data-testid'] === 'panel-participants-roster')).toBeNull();
      expect(findElement(webBothOpen.result.current, (el) => el.props?.['data-testid'] === 'mock-chat-drawer')).not.toBeNull();
      webBothOpen.unmount();
    });

    it('1.6 Invite link copy confirmation feedback in roster is icon-only and toggles accessibilityLabel "Copied!" for 2 seconds', async () => {
      let shareCalled = 0;
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isParticipantsOpen: true,
          patientLink: 'https://staging.clinicez.com/teleconsult/invite/tok-12345',
          onSharePatientLink: async () => {
            shareCalled += 1;
          }
        })
      );

      const copyBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-invite'
      );
      expect(copyBtn).not.toBeNull();
      expect(getTextContent(copyBtn).trim()).toBe('');
      expect(copyBtn.props?.accessibilityLabel).toBe('Copy consultation invite link');

      // Click copy button
      await act(async () => {
        await copyBtn.props.onPress?.();
      });

      expect(shareCalled).toBe(1);

      // Now accessibilityLabel should show "Copied!" with icon-only child
      const copiedBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-invite'
      );
      expect(getTextContent(copiedBtn).trim()).toBe('');
      expect(copiedBtn.props?.accessibilityLabel).toBe('Copied!');

      // Wait 2050ms for timeout to revert
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2050));
      });

      const revertedBtn = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-invite'
      );
      expect(getTextContent(revertedBtn).trim()).toBe('');
      expect(revertedBtn.props?.accessibilityLabel).toBe('Copy consultation invite link');
      harness.unmount();
    });

    it('1.7 Web roster invite link copy confirmation feedback is icon-only and toggles aria-label', async () => {
      let shareCalled = 0;
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isParticipantsOpen: true,
          patientLink: 'https://staging.clinicez.com/teleconsult/invite/tok-12345',
          onSharePatientLink: async () => {
            shareCalled += 1;
          }
        })
      );

      const copyBtn = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite'
      );
      expect(copyBtn).not.toBeNull();
      expect(getTextContent(copyBtn).trim()).toBe('');
      expect(copyBtn.props?.['aria-label']).toBe('Copy consultation invite link');

      await act(async () => {
        await copyBtn.props.onClick?.();
      });

      expect(shareCalled).toBe(1);
      const copiedBtn = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite'
      );
      expect(getTextContent(copiedBtn).trim()).toBe('');
      expect(copiedBtn.props?.['aria-label']).toBe('Copied!');

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 2050));
      });

      const revertedBtn = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite'
      );
      expect(getTextContent(revertedBtn).trim()).toBe('');
      expect(revertedBtn.props?.['aria-label']).toBe('Copy consultation invite link');
      harness.unmount();
    });
  });

  // =========================================================================
  // Section 2: 6-Digit PIN
  // =========================================================================
  describe('Focus 2: 6-Digit PIN Display, Clipboard Writing & Stability', () => {
    it('2.1 Native & Web CallStage roster: renders text-roster-invite-pin and icon-only btn-roster-copy-pin', async () => {
      let nativePinCopyCount = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isParticipantsOpen: true,
          patientPin: '482915',
          onCopyPatientPin: async () => {
            nativePinCopyCount += 1;
          }
        })
      );

      const nativePinText = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'text-roster-invite-pin'
      );
      expect(nativePinText).not.toBeNull();
      expect(getTextContent(nativePinText).trim()).toBe('482915');

      const nativeCopyPinBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-pin'
      );
      expect(nativeCopyPinBtn).not.toBeNull();
      expect(getTextContent(nativeCopyPinBtn).trim()).toBe('');
      expect(nativeCopyPinBtn.props?.accessibilityLabel).toBe('Copy access PIN');

      await act(async () => {
        await nativeCopyPinBtn.props.onPress?.();
      });
      expect(nativePinCopyCount).toBe(1);

      const nativeCopiedBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-pin'
      );
      expect(getTextContent(nativeCopiedBtn).trim()).toBe('');
      expect(nativeCopiedBtn.props?.accessibilityLabel).toBe('Copied!');

      await act(async () => {
        await new Promise((r) => setTimeout(r, 2050));
      });
      const nativeRevertedBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-pin'
      );
      expect(getTextContent(nativeRevertedBtn).trim()).toBe('');
      expect(nativeRevertedBtn.props?.accessibilityLabel).toBe('Copy access PIN');
      nativeHarness.unmount();

      // Web
      let webPinCopyCount = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isParticipantsOpen: true,
          patientPin: '739102',
          onCopyPatientPin: async () => {
            webPinCopyCount += 1;
          }
        })
      );

      const webPinText = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'text-roster-invite-pin'
      );
      expect(webPinText).not.toBeNull();
      expect(getTextContent(webPinText).trim()).toBe('739102');

      const webCopyPinBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-pin'
      );
      expect(webCopyPinBtn).not.toBeNull();
      await act(async () => {
        await webCopyPinBtn.props.onClick?.();
      });
      expect(webPinCopyCount).toBe(1);
      webHarness.unmount();
    });

    it('2.2 Native & Web CallWaitingRoom: renders text-waiting-room-pin and btn-copy-patient-pin', async () => {
      let copyPinCalls = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          patientPin: '123456',
          onCopyPatientPin: async () => {
            copyPinCalls += 1;
          }
        })
      );

      const pinEl = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'text-waiting-room-pin'
      );
      expect(pinEl).not.toBeNull();
      expect(getTextContent(pinEl).trim()).toBe('123456');

      const copyBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-copy-patient-pin'
      );
      expect(copyBtn).not.toBeNull();
      await act(async () => {
        await copyBtn.props.onPress?.();
      });
      expect(copyPinCalls).toBe(1);
      nativeHarness.unmount();

      // Web
      let webCopyPinCalls = 0;
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebWRProps,
          patientPin: '654321',
          onCopyPatientPin: async () => {
            webCopyPinCalls += 1;
          }
        })
      );

      const webPinEl = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'text-waiting-room-pin'
      );
      expect(webPinEl).not.toBeNull();
      expect(getTextContent(webPinEl).trim()).toBe('654321');

      const webCopyBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-copy-patient-pin'
      );
      expect(webCopyBtn).not.toBeNull();
      await act(async () => {
        await webCopyBtn.props.onClick?.();
      });
      expect(webCopyPinCalls).toBe(1);
      webHarness.unmount();
    });

    it('2.3 Absence of patientPin omits PIN display without breaking other controls', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isParticipantsOpen: true
          // no patientPin
        })
      );
      expect(findElement(nativeHarness.result.current, (el) => el.props?.testID === 'text-roster-invite-pin')).toBeNull();
      expect(findElement(nativeHarness.result.current, (el) => el.props?.testID === 'btn-roster-copy-pin')).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isParticipantsOpen: true
          // no patientPin
        })
      );
      expect(findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'text-roster-invite-pin')).toBeNull();
      expect(findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-roster-copy-pin')).toBeNull();
      webHarness.unmount();
    });
  });

  // =========================================================================
  // Section 3: Solo Participant Warning & Auto-Leave
  // =========================================================================
  describe('Focus 3: Solo Participant Warning Banner & Auto-Leave Lifecycle', () => {
    it('3.1 Solo presence triggers banner-solo-participant-warning after threshold expires', async () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 30,
          soloAutoLeaveGraceMs: 5000
        })
      );

      // Initially NOT visible
      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).toBeNull();

      // Advance past threshold
      await act(async () => {
        await new Promise((r) => setTimeout(r, 45));
      });

      const banner = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(banner).not.toBeNull();
      expect(getTextContent(banner)).toContain('Are you still waiting?');
      expect(getTextContent(banner)).toContain('No other participants are currently in this room');
      harness.unmount();
    });

    it('3.2 Clicking btn-solo-stay resets the warning banner and restarts the countdown timer', async () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 30,
          soloAutoLeaveGraceMs: 5000
        })
      );

      // Wait for banner to appear
      await act(async () => {
        await new Promise((r) => setTimeout(r, 45));
      });

      const banner = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(banner).not.toBeNull();

      const stayBtn = findElement(banner, (el) => el.props?.testID === 'btn-solo-stay');
      expect(stayBtn).not.toBeNull();

      // Click Stay in Call
      await act(async () => {
        await stayBtn.props.onPress?.();
      });

      // Banner is immediately dismissed
      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).toBeNull();

      // Wait for threshold again -> banner reappears!
      await act(async () => {
        await new Promise((r) => setTimeout(r, 45));
      });

      const reappearedBanner = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(reappearedBanner).not.toBeNull();
      harness.unmount();
    });

    it('3.3 Clicking btn-solo-leave immediately invokes onSoloLeave / disconnects from call', async () => {
      let soloLeft = 0;
      let callEnded = 0;
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 20,
          soloAutoLeaveGraceMs: 5000,
          onSoloLeave: async () => {
            soloLeft += 1;
          },
          onEndCall: async () => {
            callEnded += 1;
          }
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });

      const banner = findElement(
        harness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(banner).not.toBeNull();

      const leaveBtn = findElement(banner, (el) => el.props?.testID === 'btn-solo-leave');
      expect(leaveBtn).not.toBeNull();

      await act(async () => {
        await leaveBtn.props.onPress?.();
      });

      expect(soloLeft).toBe(1);
      expect(callEnded).toBe(0);
      harness.unmount();
    });

    it('3.4 Expiring grace countdown automatically triggers disconnect via onSoloLeave', async () => {
      let autoLeft = 0;
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 20,
          soloAutoLeaveGraceMs: 1000, // 1 second grace
          onSoloLeave: async () => {
            autoLeft += 1;
          }
        })
      );

      // Wait for threshold
      await act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });

      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).not.toBeNull();
      expect(autoLeft).toBe(0);

      // Wait for 1-second grace countdown to expire (1000ms + interval jitter)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 1150));
      });

      expect(autoLeft).toBe(1);
      harness.unmount();
    });

    it('3.5 Web CallStage: Solo warning & auto-leave grace countdown triggers disconnect', async () => {
      let webAutoLeft = 0;
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 20,
          soloAutoLeaveGraceMs: 1000, // 1s
          onSoloLeave: async () => {
            webAutoLeft += 1;
          }
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });

      expect(
        findElement(harness.result.current, (el) => el.props?.['data-testid'] === 'banner-solo-participant-warning')
      ).not.toBeNull();
      expect(webAutoLeft).toBe(0);

      await act(async () => {
        await new Promise((r) => setTimeout(r, 1150));
      });

      expect(webAutoLeft).toBe(1);
      harness.unmount();
    });

    it('3.6 Remote participant connection aborts and clears active solo warning banner immediately', async () => {
      let isRemoteConnected = false;
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          hasRemoteParticipant: isRemoteConnected,
          soloWarningThresholdMs: 20,
          soloAutoLeaveGraceMs: 5000
        })
      );

      // Wait for warning
      await act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });

      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).not.toBeNull();

      // Remote participant joins!
      isRemoteConnected = true;
      harness.rerender();

      // Banner is immediately cleared
      expect(
        findElement(harness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).toBeNull();
      harness.unmount();
    });
  });
});
