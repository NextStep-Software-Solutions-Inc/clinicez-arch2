import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

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

import { CallStage as WebCallStage } from '../../src/web-ui/CallStage';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallStage: any;
beforeAll(async () => {
  const mod = await import('../../src/native-ui/CallStage');
  NativeCallStage = mod.CallStage;
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

const baseProps = {
  callId: 'call-solo-12345678-1234-1234-1234-123456789abc',
  roomName: 'call-solo-12345678-1234-1234-1234-123456789abc',
  participantName: 'Dr. Maria Santos',
  userRole: 'Clinician' as const,
  isDoctor: true,
  isCameraEnabled: true,
  isMicEnabled: true,
  isScreenSharing: false,
  isRecording: false,
  isE2eeEnabled: true,
  onToggleMic: () => {},
  onToggleCamera: () => {},
  onToggleScreenShare: () => {},
  onEndCall: () => {}
};

describe('Requirement R5: Solo Participant Warning & Safeguards (TEST_INFRA Section 4.1 & 4.2)', () => {
  describe('TC-T1.5.6: Solo Participant Warning Banner Display', () => {
    it('Native & Web: Banner appears after solo threshold and displays warning notice', async () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 15,
          soloAutoLeaveGraceMs: 2000,
          onSoloLeave: () => {}
        })
      );

      // Initially, no solo warning banner
      expect(
        findElement(nativeHarness.result.current, (el) => el.props?.testID === 'banner-solo-participant-warning')
      ).toBeNull();

      // Advance past threshold
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const nativeBanner = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(nativeBanner).not.toBeNull();
      expect(getTextContent(nativeBanner)).toContain('Are you still waiting?');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 15,
          soloAutoLeaveGraceMs: 2000,
          onSoloLeave: () => {}
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const webBanner = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-solo-participant-warning'
      );
      expect(webBanner).not.toBeNull();
      expect(getTextContent(webBanner)).toContain('Are you still waiting?');
      webHarness.unmount();
    });
  });

  describe('TC-T2.5.4: Solo Warning "Stay in Call" Action', () => {
    it('Native & Web: Clicking Stay in Call dismisses banner and resets timer', async () => {
      let webLeaveCount = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 15,
          soloAutoLeaveGraceMs: 200,
          onSoloLeave: () => {
            webLeaveCount += 1;
          }
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const webWarning = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-solo-participant-warning'
      );
      expect(webWarning).not.toBeNull();

      const stayBtn = findElement(
        webWarning,
        (el) => el.props?.['data-testid'] === 'btn-solo-stay'
      );
      expect(stayBtn).not.toBeNull();

      // Click Stay in Call
      await stayBtn.props?.onClick?.();

      // Warning banner is dismissed immediately
      const dismissedBanner = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-solo-participant-warning'
      );
      expect(dismissedBanner).toBeNull();
      expect(webLeaveCount).toBe(0);
      webHarness.unmount();
    });
  });

  describe('TC-T2.5.5: Solo Warning "Leave Room" Action', () => {
    it('Native & Web: Clicking Leave Room immediately calls onSoloLeave', async () => {
      let nativeLeaveCount = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 15,
          soloAutoLeaveGraceMs: 5000,
          onSoloLeave: () => {
            nativeLeaveCount += 1;
          }
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const nativeWarning = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(nativeWarning).not.toBeNull();

      const leaveBtn = findElement(
        nativeWarning,
        (el) => el.props?.testID === 'btn-solo-leave'
      );
      expect(leaveBtn).not.toBeNull();

      await leaveBtn.props?.onPress?.();
      expect(nativeLeaveCount).toBe(1);
      nativeHarness.unmount();
    });
  });

  describe('TC-T3.3: Remote Participant Presence Resets Solo State', () => {
    it('Native & Web: Remote participant join prevents or dismisses solo warning banner', async () => {
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          hasRemoteParticipant: true, // Remote attendee is present
          soloWarningThresholdMs: 15,
          soloAutoLeaveGraceMs: 30,
          onSoloLeave: () => {}
        })
      );

      await act(async () => {
        await new Promise((r) => setTimeout(r, 35));
      });

      const banner = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-solo-participant-warning'
      );
      // When remote participant is in call, solo warning banner must NEVER appear
      expect(banner).toBeNull();
      webHarness.unmount();
    });
  });
});
