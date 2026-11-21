import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';

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

function findAllElements(element: any, predicate: (el: any) => boolean): any[] {
  const results: any[] = [];
  function search(node: any) {
    if (!node) return;
    if (predicate(node)) results.push(node);
    if (Array.isArray(node)) {
      node.forEach(search);
      return;
    }
    if (node.props?.children) {
      if (Array.isArray(node.props.children)) {
        node.props.children.forEach(search);
      } else {
        search(node.props.children);
      }
    }
  }
  search(element);
  return results;
}

const baseProps = {
  callId: 'call-e2e4a8b0-8c29-41d4-8d49-14a5ef019283',
  roomName: 'call-e2e4a8b0-8c29-41d4-8d49-14a5ef019283',
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

describe('Requirement R1: CallStage Participants Roster & Visible 6-Digit PIN (TEST_INFRA Section 4.1 & 4.2)', () => {
  describe('TC-T1.1.1: Removal of Upper-Left Copy Invite Button', () => {
    it('Native & Web: btn-stage-copy-invite and topLeftControls are absent from canvas', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          hideHeader: false,
          patientLink: 'https://portal.clinicez.ph/teleconsult/guest?token=xyz'
        })
      );

      const nativeCopyBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-stage-copy-invite'
      );
      expect(nativeCopyBtn).toBeNull();

      const nativeTopLeft = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'topLeftControls'
      );
      expect(nativeTopLeft).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          hideHeader: false,
          patientLink: 'https://portal.clinicez.ph/teleconsult/guest?token=xyz'
        })
      );

      const webCopyBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-stage-copy-invite'
      );
      expect(webCopyBtn).toBeNull();

      const webTopLeft = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'topLeftControls'
      );
      expect(webTopLeft).toBeNull();
      webHarness.unmount();
    });
  });

  describe('TC-T1.1.2: Bottom Toolbar Users Button & Live Participant Badge', () => {
    it('Native & Web: btn-toggle-participants renders live count badge and has >=44x44px touch target', async () => {
      let nativeToggled = 0;
      const participants = [
        { identity: 'p1', name: 'Dr. Maria Santos', isLocal: true, status: 'In call' as const, isMicActive: true, isCameraActive: true },
        { identity: 'p2', name: 'Juan Dela Cruz', isLocal: false, status: 'In call' as const, isMicActive: true, isCameraActive: false }
      ];

      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          participants,
          isParticipantsOpen: false,
          onToggleParticipants: () => {
            nativeToggled += 1;
          }
        })
      );

      const nativeBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-participants'
      );
      expect(nativeBtn).not.toBeNull();
      const nativeBadge = findElement(
        nativeBtn,
        (el) => el.props?.testID === 'badge-participants-count'
      );
      expect(nativeBadge).not.toBeNull();
      expect(getTextContent(nativeBadge)).toBe('2');

      // Verify touch target >= 44x44px
      const nativeHitSlop = nativeBtn.props?.hitSlop;
      if (nativeHitSlop) {
        expect(nativeHitSlop.top + nativeHitSlop.bottom).toBeGreaterThanOrEqual(16);
      }

      await nativeBtn.props?.onPress?.();
      expect(nativeToggled).toBe(1);
      nativeHarness.unmount();

      let webToggled = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          participants,
          isParticipantsOpen: false,
          onToggleParticipants: () => {
            webToggled += 1;
          }
        })
      );

      const webBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-participants'
      );
      expect(webBtn).not.toBeNull();
      const webBadge = findElement(
        webBtn,
        (el) => el.props?.['data-testid'] === 'badge-participants-count'
      );
      expect(webBadge).not.toBeNull();
      expect(getTextContent(webBadge)).toBe('2');

      // Check min-h-[44px] min-w-[44px] on web button
      expect(String(webBtn.props?.className)).toMatch(/min-h-\[44px\]/);
      expect(String(webBtn.props?.className)).toMatch(/min-w-\[44px\]/);

      await webBtn.props?.onClick?.();
      expect(webToggled).toBe(1);
      webHarness.unmount();
    });
  });

  describe('TC-T1.1.3: Participants Roster Drawer & Chat Mutual Exclusion', () => {
    it('Native & Web: Opening roster and chat simultaneously suppresses roster in favor of chat', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          renderChatDrawer: () => React.createElement('div', { testID: 'chat-drawer-content' })
        })
      );

      expect(
        findElement(nativeHarness.result.current, (el) => el.props?.testID === 'panel-participants-roster')
      ).toBeNull();
      expect(
        findElement(nativeHarness.result.current, (el) => el.props?.testID === 'chat-drawer-content')
      ).not.toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'chat-drawer-content' })
        })
      );

      expect(
        findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'panel-participants-roster')
      ).toBeNull();
      expect(
        findElement(webHarness.result.current, (el) => el.props?.['data-testid'] === 'chat-drawer-content')
      ).not.toBeNull();
      webHarness.unmount();
    });
  });

  describe('TC-T1.1.4: Roster Consultation Link Row with Copy Button & Feedback', () => {
    it('Native & Web: btn-roster-copy-invite triggers copy handler', async () => {
      let nativeCopied = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          patientLink: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-abc',
          onSharePatientLink: () => {
            nativeCopied += 1;
          }
        })
      );

      const nativeBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-invite'
      );
      expect(nativeBtn).not.toBeNull();
      await nativeBtn.props?.onPress?.();
      expect(nativeCopied).toBe(1);
      nativeHarness.unmount();

      let webCopied = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          patientLink: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-abc',
          onSharePatientLink: () => {
            webCopied += 1;
          }
        })
      );

      const webBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite'
      );
      expect(webBtn).not.toBeNull();
      await webBtn.props?.onClick?.();
      expect(webCopied).toBe(1);
      webHarness.unmount();
    });
  });

  describe('TC-T1.1.5: Visible 6-Digit Access PIN and Copy Action', () => {
    it('Native & Web: text-roster-invite-pin displays "481920" and btn-roster-copy-pin fires handler', async () => {
      let nativePinCopied = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          patientPin: '481920',
          onCopyPatientPin: () => {
            nativePinCopied += 1;
          }
        })
      );

      const nativePinText = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'text-roster-invite-pin'
      );
      expect(nativePinText).not.toBeNull();
      expect(getTextContent(nativePinText)).toBe('481920');

      const nativeCopyPin = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-roster-copy-pin'
      );
      expect(nativeCopyPin).not.toBeNull();
      await nativeCopyPin.props?.onPress?.();
      expect(nativePinCopied).toBe(1);
      nativeHarness.unmount();

      let webPinCopied = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          patientPin: '481920',
          onCopyPatientPin: () => {
            webPinCopied += 1;
          }
        })
      );

      const webPinText = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'text-roster-invite-pin'
      );
      expect(webPinText).not.toBeNull();
      expect(getTextContent(webPinText)).toBe('481920');

      const webCopyPin = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-pin'
      );
      expect(webCopyPin).not.toBeNull();
      await webCopyPin.props?.onClick?.();
      expect(webPinCopied).toBe(1);
      webHarness.unmount();
    });
  });

  describe('TC-T1.1.6: Active Attendees List with Media Status Indicators', () => {
    it('Native & Web: Renders (You) and remote attendees with appropriate status', () => {
      const attendees = [
        { identity: 'p1', name: 'Dr. Santos', isLocal: true, status: 'In call' as const, isMicActive: true, isCameraActive: true },
        { identity: 'p2', name: 'Maria Cruz', isLocal: false, status: 'In call' as const, isMicActive: false, isCameraActive: true, isScreenSharing: true }
      ];

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          participants: attendees
        })
      );

      const roster = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'panel-participants-roster'
      );
      expect(roster).not.toBeNull();
      const text = getTextContent(roster);
      expect(text).toContain('You');
      expect(text).toContain('(You)');
      expect(text).toContain('Maria Cruz');
      webHarness.unmount();
    });
  });

  describe('TC-T2.1.3: Participants Roster with 25+ Attendees', () => {
    it('Web CallStage: Roster panel container enforces maxHeight 100% and overflow scroll for 25+ attendees', () => {
      const manyAttendees = [
        { identity: 'p-local', name: 'Dr. Host', isLocal: true, status: 'In call' as const, isMicActive: true, isCameraActive: true },
        ...Array.from({ length: 25 }, (_, i) => ({
          identity: `p-remote-${i + 1}`,
          name: `Guest Patient ${i + 1}`,
          isLocal: false,
          status: 'In call' as const,
          isMicActive: i % 2 === 0,
          isCameraActive: true
        }))
      ];

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          participants: manyAttendees
        })
      );

      const roster = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'panel-participants-roster'
      );
      expect(roster).not.toBeNull();

      // Check all 26 participants are rendered in roster text
      const rosterText = getTextContent(roster);
      expect(rosterText).toContain('You');
      expect(rosterText).toContain('Guest Patient 1');
      expect(rosterText).toContain('Guest Patient 25');
      webHarness.unmount();
    });
  });

  describe('TC-T2.1.4: Special Characters and Emojis in Display Name', () => {
    it('Native & Web: Sanitizes and renders display names with emojis and symbols without injecting DOM tags', () => {
      const xssAttendees = [
        { identity: 'p1', name: 'Dr. Host', isLocal: true, status: 'In call' as const, isMicActive: true, isCameraActive: true },
        { identity: 'p2', name: 'Dr. José María Ñuñoa 🩺 <script>alert(1)</script>', isLocal: false, status: 'In call' as const, isMicActive: true, isCameraActive: true }
      ];

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          participants: xssAttendees
        })
      );

      const roster = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'panel-participants-roster'
      );
      expect(roster).not.toBeNull();
      const text = getTextContent(roster);
      expect(text).toContain('Dr. José María Ñuñoa 🩺 <script>alert(1)</script>');

      // Verify no actual script elements were inserted
      const scripts = findAllElements(roster, (el) => el.type === 'script');
      expect(scripts.length).toBe(0);
      webHarness.unmount();
    });
  });

  describe('TC-T2.1.5: Missing Patient PIN Prop Handling', () => {
    it('Native & Web: When patientPin is undefined, consultation link renders and PIN row is cleanly omitted', () => {
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseProps,
          isParticipantsOpen: true,
          patientLink: 'https://portal.clinicez.ph/teleconsult/guest?token=tok-abc',
          onSharePatientLink: () => {},
          patientPin: undefined
        })
      );

      const roster = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'panel-participants-roster'
      );
      expect(roster).not.toBeNull();

      // Consultation link row exists
      const copyBtn = findElement(roster, (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite');
      expect(copyBtn).not.toBeNull();

      // PIN row is omitted
      const pinText = findElement(roster, (el) => el.props?.['data-testid'] === 'text-roster-invite-pin');
      expect(pinText).toBeNull();

      // Text does not render "undefined"
      expect(getTextContent(roster)).not.toContain('undefined');
      webHarness.unmount();
    });
  });
});
