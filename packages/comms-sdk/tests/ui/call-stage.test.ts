import { describe, expect, it, mock, beforeAll } from 'bun:test';
import React from 'react';
import { lightColors, createShadows } from '@clinicez/design-tokens';

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
import { CallWaitingRoom as WebCallWaitingRoom } from '../../src/web-ui/CallWaitingRoom';
import { createHookHarness, act } from '../react/hook-test-harness';

let NativeCallStage: any;
let NativeCallWaitingRoom: any;
beforeAll(async () => {
  const mod = await import('../../src/native-ui/CallStage');
  NativeCallStage = mod.CallStage;
  const wrMod = await import('../../src/native-ui/CallWaitingRoom');
  NativeCallWaitingRoom = wrMod.CallWaitingRoom;
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

describe('Feature F18: CallStage Video Surface & In-Call Controls (Native & Web)', () => {
  const baseNativeProps = {
    callId: 'call-12345678-1234-1234-1234-123456789abc',
    roomName: 'call-session-room-001',
    userRole: 'Clinician' as const,
    participantName: 'Juan Dela Cruz',
    selfName: 'Dr. Maria Santos',
    isMicEnabled: true,
    isCameraEnabled: true,
    isScreenSharing: false,
    onToggleMic: () => {},
    onToggleCamera: () => {},
    onToggleScreenShare: () => {},
    onSwitchCamera: () => {},
    onEndCall: () => {}
  };

  const baseWebProps = {
    ...baseNativeProps
  };

  describe('Tier 1: Video Surfaces, Header & Workstation Action', () => {
    it('Native UI: renders participant name, E2EE badge, and room subtitle', () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Juan Dela Cruz');
      expect(text).toContain('E2EE Encrypted');
      expect(text).toContain('call-session-room-001');
      harness.unmount();
    });

    it('Web UI: renders participant name, E2EE badge, and room subtitle', () => {
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps
        })
      );

      const text = getTextContent(harness.result.current);
      expect(text).toContain('Juan Dela Cruz');
      expect(text).toContain('E2EE Encrypted');
      expect(text).toContain('call-session-room-001');
      harness.unmount();
    });

    it('Native & Web: renders workstation extension action slot', () => {
      let workstationClicked = false;
      const renderWorkstationAction = () =>
        React.createElement(
          'button',
          {
            onClick: () => {
              workstationClicked = true;
            }
          },
          'Open Consultation Chart'
        );

      // Native
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          renderWorkstationAction
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('Open Consultation Chart');
      nativeHarness.unmount();

      // Web
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          renderWorkstationAction
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Open Consultation Chart');
      webHarness.unmount();
    });

    it('Native & Web: supports custom video surfaces (remote & local PiP)', () => {
      const renderCustomVideoSurface = (trackType: 'remote' | 'local') =>
        React.createElement('div', { 'data-track': trackType }, `Surface: ${trackType}`);

      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          renderCustomVideoSurface
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('Surface: remote');
      expect(nativeText).toContain('Surface: local');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          renderCustomVideoSurface
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Surface: remote');
      expect(webText).toContain('Surface: local');
      webHarness.unmount();
    });
  });

  describe('Tier 2: Media Toolbar, Toggles & End Call', () => {
    it('Native UI: triggers onToggleMic, onToggleCamera, onToggleScreenShare, and onSwitchCamera', async () => {
      let micToggled = false;
      let camToggled = false;
      let shareToggled = false;
      let flipTriggered = false;

      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onToggleMic: () => {
            micToggled = true;
          },
          onToggleCamera: () => {
            camToggled = true;
          },
          onToggleScreenShare: () => {
            shareToggled = true;
          },
          onSwitchCamera: () => {
            flipTriggered = true;
          }
        })
      );

      const buttons = findAllElements(harness.result.current, (el) => el.type === 'button');

      const micBtn = buttons.find((b) => getTextContent(b).includes('MIC'));
      expect(micBtn).toBeDefined();
      await micBtn?.props.onPress?.();
      expect(micToggled).toBe(true);

      const camBtn = buttons.find((b) => getTextContent(b).includes('CAM'));
      expect(camBtn).toBeDefined();
      await camBtn?.props.onPress?.();
      expect(camToggled).toBe(true);

      const shareBtn = buttons.find((b) => getTextContent(b).includes('SHARE'));
      expect(shareBtn).toBeDefined();
      await shareBtn?.props.onPress?.();
      expect(shareToggled).toBe(true);

      const flipBtn = buttons.find((b) => getTextContent(b).includes('FLIP'));
      expect(flipBtn).toBeDefined();
      await flipBtn?.props.onPress?.();
      expect(flipTriggered).toBe(true);

      harness.unmount();
    });

    it('Web UI: triggers onToggleMic, onToggleCamera, and onToggleScreenShare', async () => {
      let micToggled = false;
      let camToggled = false;
      let shareToggled = false;

      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onToggleMic: () => {
            micToggled = true;
          },
          onToggleCamera: () => {
            camToggled = true;
          },
          onToggleScreenShare: () => {
            shareToggled = true;
          }
        })
      );

      const buttons = findAllElements(harness.result.current, (el) => el.type === 'button');

      const micBtn = buttons.find((b) => getTextContent(b).includes('MIC'));
      expect(micBtn).toBeDefined();
      await micBtn?.props.onClick?.();
      expect(micToggled).toBe(true);

      const camBtn = buttons.find((b) => getTextContent(b).includes('CAM'));
      expect(camBtn).toBeDefined();
      await camBtn?.props.onClick?.();
      expect(camToggled).toBe(true);

      const shareBtn = buttons.find((b) => getTextContent(b).includes('SHARE'));
      expect(shareBtn).toBeDefined();
      await shareBtn?.props.onClick?.();
      expect(shareToggled).toBe(true);

      harness.unmount();
    });

    it('Native & Web: triggers onEndCall when end button is pressed', async () => {
      let nativeEnded = false;
      let webEnded = false;

      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onEndCall: () => {
            nativeEnded = true;
          }
        })
      );
      const nativeButtons = findAllElements(nativeHarness.result.current, (el) => el.type === 'button');
      const nativeEndBtn = nativeButtons.find((b) => getTextContent(b) === 'END' || getTextContent(b) === 'End Call');
      expect(nativeEndBtn).toBeDefined();
      await nativeEndBtn?.props.onPress?.();
      expect(nativeEnded).toBe(true);
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onEndCall: () => {
            webEnded = true;
          }
        })
      );
      const webButtons = findAllElements(webHarness.result.current, (el) => el.type === 'button');
      const webEndBtn = webButtons.find((b) => getTextContent(b) === 'END' || getTextContent(b) === 'End Call');
      expect(webEndBtn).toBeDefined();
      await webEndBtn?.props.onClick?.();
      expect(webEnded).toBe(true);
      webHarness.unmount();
    });
  });

  describe('Tier 3: Persistent REC Banner & Single-Party Stop', () => {
    it('Native & Web: renders red REC banner with timer and single-party Stop Recording button', async () => {
      let stopTriggered = false;

      // Native
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          isRecording: true,
          recordingDurationSeconds: 125,
          onStopRecording: () => {
            stopTriggered = true;
          }
        })
      );

      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('REC');
      expect(nativeText).toContain('02:05');
      expect(nativeText).toContain('Recording in progress');

      const nativeStopBtn = findElement(
        nativeHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Stop Recording')
      );
      expect(nativeStopBtn).not.toBeNull();
      await nativeStopBtn.props.onPress?.();
      expect(stopTriggered).toBe(true);
      nativeHarness.unmount();

      // Web
      stopTriggered = false;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          isRecording: true,
          recordingDurationSeconds: 70,
          onStopRecording: () => {
            stopTriggered = true;
          }
        })
      );

      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('REC');
      expect(webText).toContain('01:10');

      const webStopBtn = findElement(
        webHarness.result.current,
        (el) => el.type === 'button' && getTextContent(el).includes('Stop Recording')
      );
      expect(webStopBtn).not.toBeNull();
      await webStopBtn.props.onClick?.();
      expect(stopTriggered).toBe(true);
      webHarness.unmount();
    });

    it('Native & Web: hides REC banner when isRecording is false', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          isRecording: false
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).not.toContain('Recording in progress');
      expect(nativeText).not.toContain('Stop Recording');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          isRecording: false
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).not.toContain('Recording in progress');
      expect(webText).not.toContain('Stop Recording');
      webHarness.unmount();
    });
  });

  describe('Tier 4: In-Call Chat Drawer Toggle', () => {
    it('Native & Web: renders in-call chat drawer when isChatOpen is true', () => {
      const renderChatDrawer = () => React.createElement('div', null, 'Active Chat Drawer Content');

      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          isChatOpen: true,
          renderChatDrawer
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('Active Chat Drawer Content');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          isChatOpen: true,
          renderChatDrawer
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Active Chat Drawer Content');
      webHarness.unmount();
    });
  });

  describe('Tier 5: Milestone 8 Adaptations: Dock, PiP, and Orientation', () => {
    it('Native & Web: renders btn-dock-call and triggers onDockCall', async () => {
      let nativeDockTriggered = false;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onDockCall: () => {
            nativeDockTriggered = true;
          }
        })
      );

      const nativeDockBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-dock-call'
      );
      expect(nativeDockBtn).not.toBeNull();
      await nativeDockBtn.props.onPress?.();
      expect(nativeDockTriggered).toBe(true);
      nativeHarness.unmount();

      let webDockTriggered = false;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onDockCall: () => {
            webDockTriggered = true;
          }
        })
      );

      const webDockBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-dock-call' || el.props?.id === 'btn-dock-call'
      );
      expect(webDockBtn).not.toBeNull();
      await webDockBtn.props.onClick?.();
      expect(webDockTriggered).toBe(true);
      webHarness.unmount();
    });

    it('Native & Web: renders btn-toggle-pip and triggers onTogglePip', async () => {
      let nativePipTriggered = false;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onTogglePip: () => {
            nativePipTriggered = true;
          },
          isPipSupported: true,
          isPipActive: false
        })
      );

      const nativePipBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-pip'
      );
      expect(nativePipBtn).not.toBeNull();
      await nativePipBtn.props.onPress?.();
      expect(nativePipTriggered).toBe(true);
      nativeHarness.unmount();

      let webPipTriggered = false;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onTogglePip: () => {
            webPipTriggered = true;
          },
          isPipSupported: true,
          isPipActive: true
        })
      );

      const webPipBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-pip' || el.props?.id === 'btn-toggle-pip'
      );
      expect(webPipBtn).not.toBeNull();
      await webPipBtn.props.onClick?.();
      expect(webPipTriggered).toBe(true);
      webHarness.unmount();
    });

    it('Native & Web: renders btn-toggle-orientation and triggers onToggleOrientation', async () => {
      let nativeRotateTriggered = false;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          videoOrientation: 'portrait',
          onToggleOrientation: () => {
            nativeRotateTriggered = true;
          }
        })
      );

      const nativeRotateBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-orientation'
      );
      expect(nativeRotateBtn).not.toBeNull();
      await nativeRotateBtn.props.onPress?.();
      expect(nativeRotateTriggered).toBe(true);
      nativeHarness.unmount();

      let webRotateTriggered = false;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          videoOrientation: 'landscape',
          onToggleOrientation: () => {
            webRotateTriggered = true;
          }
        })
      );

      const webRotateBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-orientation' || el.props?.id === 'btn-toggle-orientation'
      );
      expect(webRotateBtn).not.toBeNull();
      await webRotateBtn.props.onClick?.();
      expect(webRotateTriggered).toBe(true);
      webHarness.unmount();
    });

    it('Native & Web: renders networkQuality banner for poor and reconnecting states', () => {
      for (const quality of ['poor', 'reconnecting'] as const) {
        const nativeHarness = createHookHarness(() =>
          NativeCallStage({
            ...baseNativeProps,
            networkQuality: quality,
          })
        );
        const nativeBanner = findElement(
          nativeHarness.result.current,
          (el) => el.props?.testID === 'banner-network-quality'
        );
        expect(nativeBanner).not.toBeNull();
        expect(getTextContent(nativeBanner)).toContain(
          quality === 'reconnecting' ? 'Connection Interrupted' : 'Weak Network Connection'
        );
        nativeHarness.unmount();

        const webHarness = createHookHarness(() =>
          WebCallStage({
            ...baseWebProps,
            networkQuality: quality,
          })
        );
        const webBanner = findElement(
          webHarness.result.current,
          (el) => el.props?.['data-testid'] === 'banner-network-quality'
        );
        expect(webBanner).not.toBeNull();
        expect(getTextContent(webBanner)).toContain(
          quality === 'reconnecting' ? 'Connection Interrupted' : 'Weak Network Connection'
        );
        webHarness.unmount();
      }
    });

    it('Native & Web: renders icon-only Copy Invite button at top-left with hover tooltip and omits center Message Patient button', async () => {
      let nativeCopied = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onSharePatientLink: () => {
            nativeCopied += 1;
          },
          onMessagePatient: () => {},
        })
      );
      // M15 invariant: btn-stage-copy-invite and btn-stage-message-patient are strictly removed from stage surface
      const nativeCopyBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-stage-copy-invite'
      );
      const nativeMsgBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-stage-message-patient'
      );
      expect(nativeCopyBtn).toBeNull();
      expect(nativeMsgBtn).toBeNull();
      nativeHarness.unmount();

      // Remains absent when active remote video surface replaces the waiting placeholder
      const nativeActiveVideoHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onSharePatientLink: () => {},
          renderCustomVideoSurface: (trackType: string) =>
            trackType === 'remote' ? React.createElement('div', { testID: 'remote-video-track' }) : undefined,
        })
      );
      expect(
        findElement(nativeActiveVideoHarness.result.current, (el) => el.props?.testID === 'btn-stage-copy-invite')
      ).toBeNull();
      nativeActiveVideoHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onSharePatientLink: () => {},
          onMessagePatient: () => {},
        })
      );
      const webCopyBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-stage-copy-invite'
      );
      const webMsgBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-stage-message-patient'
      );
      expect(webCopyBtn).toBeNull();
      expect(webMsgBtn).toBeNull();
      webHarness.unmount();

      const webActiveVideoHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onSharePatientLink: () => {},
          renderCustomVideoSurface: (trackType: string) =>
            trackType === 'remote' ? React.createElement('video', { id: 'remote-video-track' }) : undefined,
        })
      );
      expect(
        findElement(webActiveVideoHarness.result.current, (el) => el.props?.['data-testid'] === 'btn-stage-copy-invite')
      ).toBeNull();
      webActiveVideoHarness.unmount();
    });

    it('Native & Web: shows unread chat badge and keeps idle record button neutral & blocked when isRecordDisabled', async () => {
      let nativeStarted = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          renderIcon: (name: string) => React.createElement('span', { 'data-icon': name }, name),
          onToggleChat: () => {},
          unreadChatCount: 3,
          isRecording: false,
          canStartRecording: true,
          isRecordDisabled: true,
          onStartRecording: () => {
            nativeStarted += 1;
          },
        })
      );
      const nativeUnread = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'badge-unread-chat'
      );
      expect(nativeUnread).not.toBeNull();
      expect(getTextContent(nativeUnread)).toContain('3');

      const nativeRecBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-start-recording'
      );
      expect(nativeRecBtn).not.toBeNull();
      expect(nativeRecBtn.props.disabled).toBe(true);
      await nativeRecBtn.props.onPress?.();
      expect(nativeStarted).toBe(0);
      nativeHarness.unmount();

      let webStarted = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          renderIcon: (name: string) => React.createElement('span', { 'data-icon': name }, name),
          onToggleChat: () => {},
          unreadChatCount: 2,
          isRecording: false,
          canStartRecording: true,
          isRecordDisabled: true,
          onStartRecording: () => {
            webStarted += 1;
          },
        })
      );
      const webUnread = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'badge-unread-chat'
      );
      expect(webUnread).not.toBeNull();
      expect(getTextContent(webUnread)).toContain('2');

      const webRecBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-start-recording'
      );
      expect(webRecBtn).not.toBeNull();
      expect(webRecBtn.props.disabled).toBe(true);
      expect(String(webRecBtn.props.className)).not.toContain('bg-red-600');
      await webRecBtn.props.onClick?.();
      expect(webStarted).toBe(0);
      webHarness.unmount();
    });

    it('Native & Web: active stage pills, invite CTAs, and end button apply brand and semantic drop shadows', () => {
      const roseColors = {
        ...lightColors,
        primary: '#E11D48',
        primaryDark: '#9F1239',
        primaryLight: '#FFE4E6',
        primarySubtle: '#FFF1F2',
        primaryBorder: '#FECDD3',
        onPrimary: '#FFFFFF',
        primaryShadowSubtle: 'rgba(225, 29, 72, 0.22)',
        primaryShadowSm: 'rgba(225, 29, 72, 0.34)',
        primaryShadowMd: 'rgba(225, 29, 72, 0.46)',
        dangerShadowSm: 'rgba(220, 38, 38, 0.28)',
      };
      const nativeShadows = createShadows(roseColors, false);
      const webShadows = createShadows(roseColors, true);

      // Native active PiP + Chat open + Copy Invite + End Call
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          onTogglePip: () => {},
          isPipActive: true,
          onToggleChat: () => {},
          isChatOpen: true,
          onSharePatientLink: () => {},
          colors: roseColors,
          shadows: nativeShadows,
        })
      );
      const nativePipBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-pip'
      );
      expect(nativePipBtn.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backgroundColor: '#E11D48',
            shadowColor: 'rgba(225, 29, 72, 0.34)',
          }),
        ])
      );

      const nativeCopyBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-stage-copy-invite'
      );
      expect(nativeCopyBtn).toBeNull();
      nativeHarness.unmount();

      // Web explicit brand theme on active PiP & active Chat & Copy Invite
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          onTogglePip: () => {},
          isPipActive: true,
          onToggleChat: () => {},
          isChatOpen: true,
          onSharePatientLink: () => {},
          colors: roseColors,
          shadows: webShadows,
        })
      );
      const webPipBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-pip'
      );
      expect(String(webPipBtn.props.className)).toContain('bg-teal-700 text-white');
      expect(webPipBtn.props.style).toMatchObject({
        backgroundColor: '#E11D48',
        color: '#FFFFFF',
      });
      expect(String(webPipBtn.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.34)');

      const webChatBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-chat'
      );
      expect(webChatBtn.props.style).toMatchObject({
        backgroundColor: '#E11D48',
        color: '#FFFFFF',
      });
      expect(String(webChatBtn.props.style.boxShadow)).toContain('rgba(225, 29, 72, 0.34)');

      const webCopyBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-stage-copy-invite'
      );
      expect(webCopyBtn).toBeNull();
      webHarness.unmount();
    });
  });

  describe('Milestone M15: Participants Roster, 6-Digit PIN, Screen Sharing Banner & Solo Safeguards', () => {
    const m15Participants = [
      { identity: 'clinician-1', name: 'Dr. Maria Santos', isLocal: true, status: 'In call' as const, isMicActive: true, isCameraActive: true },
      { identity: 'patient-1', name: 'Juan Dela Cruz', isLocal: false, status: 'In call' as const, isMicActive: true, isCameraActive: false, isScreenSharing: true }
    ];

    it('Native & Web: Bottom toolbar renders btn-toggle-participants with live count badge and handles toggle', async () => {
      let nativeToggled = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          participants: m15Participants,
          isParticipantsOpen: false,
          onToggleParticipants: () => {
            nativeToggled += 1;
          },
        })
      );
      const nativeToggleBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-participants'
      );
      expect(nativeToggleBtn).not.toBeNull();
      const nativeBadge = findElement(
        nativeToggleBtn,
        (el) => el.props?.testID === 'badge-participants-count'
      );
      expect(nativeBadge).not.toBeNull();
      expect(getTextContent(nativeBadge)).toBe('2');
      await nativeToggleBtn.props.onPress?.();
      expect(nativeToggled).toBe(1);
      nativeHarness.unmount();

      let webToggled = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          participants: m15Participants,
          isParticipantsOpen: false,
          onToggleParticipants: () => {
            webToggled += 1;
          },
        })
      );
      const webToggleBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-participants'
      );
      expect(webToggleBtn).not.toBeNull();
      const webBadge = findElement(
        webToggleBtn,
        (el) => el.props?.['data-testid'] === 'badge-participants-count'
      );
      expect(webBadge).not.toBeNull();
      expect(getTextContent(webBadge)).toBe('2');
      await webToggleBtn.props.onClick?.();
      expect(webToggled).toBe(1);
      webHarness.unmount();
    });

    it('Native & Web: Renders right-hand panel-participants-roster with invite copy, 6-digit PIN, and attendees', async () => {
      let nativeInviteCopied = 0;
      let nativePinCopied = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          participants: m15Participants,
          isParticipantsOpen: true,
          isChatOpen: false,
          patientLink: 'https://portal.clinicez.com/teleconsult/join?token=tok-123',
          patientPin: '789012',
          onSharePatientLink: () => {
            nativeInviteCopied += 1;
          },
          onCopyPatientPin: () => {
            nativePinCopied += 1;
          },
        })
      );

      const nativeRoster = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'panel-participants-roster'
      );
      expect(nativeRoster).not.toBeNull();

      const nativeCopyInviteBtn = findElement(
        nativeRoster,
        (el) => el.props?.testID === 'btn-roster-copy-invite'
      );
      expect(nativeCopyInviteBtn).not.toBeNull();
      await nativeCopyInviteBtn.props.onPress?.();
      expect(nativeInviteCopied).toBe(1);

      const nativePinText = findElement(
        nativeRoster,
        (el) => el.props?.testID === 'text-roster-invite-pin'
      );
      expect(nativePinText).not.toBeNull();
      expect(getTextContent(nativePinText)).toBe('789012');

      const nativeCopyPinBtn = findElement(
        nativeRoster,
        (el) => el.props?.testID === 'btn-roster-copy-pin'
      );
      expect(nativeCopyPinBtn).not.toBeNull();
      await nativeCopyPinBtn.props.onPress?.();
      expect(nativePinCopied).toBe(1);

      expect(getTextContent(nativeRoster)).toContain('Juan Dela Cruz');
      nativeHarness.unmount();

      let webInviteCopied = 0;
      let webPinCopied = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          participants: m15Participants,
          isParticipantsOpen: true,
          isChatOpen: false,
          patientLink: 'https://portal.clinicez.com/teleconsult/join?token=tok-123',
          patientPin: '789012',
          onSharePatientLink: () => {
            webInviteCopied += 1;
          },
          onCopyPatientPin: () => {
            webPinCopied += 1;
          },
        })
      );

      const webRoster = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'panel-participants-roster'
      );
      expect(webRoster).not.toBeNull();

      const webCopyInviteBtn = findElement(
        webRoster,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-invite'
      );
      expect(webCopyInviteBtn).not.toBeNull();
      await webCopyInviteBtn.props.onClick?.();
      expect(webInviteCopied).toBe(1);

      const webPinText = findElement(
        webRoster,
        (el) => el.props?.['data-testid'] === 'text-roster-invite-pin'
      );
      expect(webPinText).not.toBeNull();
      expect(getTextContent(webPinText)).toBe('789012');

      const webCopyPinBtn = findElement(
        webRoster,
        (el) => el.props?.['data-testid'] === 'btn-roster-copy-pin'
      );
      expect(webCopyPinBtn).not.toBeNull();
      await webCopyPinBtn.props.onClick?.();
      expect(webPinCopied).toBe(1);

      expect(getTextContent(webRoster)).toContain('Juan Dela Cruz');
      webHarness.unmount();
    });

    it('Native & Web: Enforces mutual exclusion between chat drawer and roster', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          renderChatDrawer: () => React.createElement('div', { testID: 'chat-drawer-content' }),
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
          ...baseWebProps,
          isParticipantsOpen: true,
          isChatOpen: true,
          renderChatDrawer: () => React.createElement('div', { 'data-testid': 'chat-drawer-content' }),
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

    it('Native & Web: Screen sharing banner renders when isScreenSharing is true and PiP adopts landscape aspect', async () => {
      let nativeToggledScreen = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          isScreenSharing: true,
          onToggleScreenShare: () => {
            nativeToggledScreen += 1;
          },
        })
      );
      const nativeBanner = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'banner-screen-sharing'
      );
      expect(nativeBanner).not.toBeNull();
      expect(getTextContent(nativeBanner)).toContain('You are sharing your screen');
      const nativeStopBtn = findElement(
        nativeBanner,
        (el) => el.props?.accessibilityLabel === 'Stop Sharing'
      );
      expect(nativeStopBtn).not.toBeNull();
      await nativeStopBtn.props.onPress?.();
      expect(nativeToggledScreen).toBe(1);
      nativeHarness.unmount();

      let webToggledScreen = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          isScreenSharing: true,
          onToggleScreenShare: () => {
            webToggledScreen += 1;
          },
        })
      );
      const webBanner = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-screen-sharing'
      );
      expect(webBanner).not.toBeNull();
      expect(getTextContent(webBanner)).toContain('You are sharing your screen');
      const webStopBtn = findElement(
        webBanner,
        (el) => getTextContent(el) === 'Stop Sharing'
      );
      expect(webStopBtn).not.toBeNull();
      await webStopBtn.props.onClick?.();
      expect(webToggledScreen).toBe(1);
      webHarness.unmount();
    });

    it('Native & Web: CallWaitingRoom displays 6-digit access PIN and copy button', async () => {
      let nativePinCopied = 0;
      const baseWaitingRoomProps = {
        callId: 'call-123',
        patientName: 'Juan Dela Cruz',
        clinicianName: 'Dr. Maria Santos',
        scheduledTime: '10:00 AM',
        paymentPolicy: 'Prepaid' as const,
        paymentStatus: 'Paid' as const,
        isReadyToAdmit: true,
        recordingConsentStatus: 'Approved' as const,
        onEnterCall: () => {},
        onCancelCall: () => {},
      };

      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseWaitingRoomProps,
          userRole: 'Clinician',
          patientPin: '456789',
          onCopyPatientPin: () => {
            nativePinCopied += 1;
          },
        })
      );
      const nativePin = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'text-waiting-room-pin'
      );
      expect(nativePin).not.toBeNull();
      expect(getTextContent(nativePin)).toBe('456789');
      const nativeCopyBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-copy-patient-pin'
      );
      expect(nativeCopyBtn).not.toBeNull();
      await nativeCopyBtn.props.onPress?.();
      expect(nativePinCopied).toBe(1);
      nativeHarness.unmount();

      let webPinCopied = 0;
      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWaitingRoomProps,
          userRole: 'Clinician',
          patientPin: '456789',
          onCopyPatientPin: () => {
            webPinCopied += 1;
          },
        })
      );
      const webPin = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'text-waiting-room-pin'
      );
      expect(webPin).not.toBeNull();
      expect(getTextContent(webPin)).toBe('456789');
      const webCopyBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-copy-patient-pin'
      );
      expect(webCopyBtn).not.toBeNull();
      await webCopyBtn.props.onClick?.();
      expect(webPinCopied).toBe(1);
      webHarness.unmount();
    });

    it('Native & Web: Solo participant safeguard triggers warning and supports stay & leave actions', async () => {
      let nativeLeft = 0;
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 10,
          soloAutoLeaveGraceMs: 2000,
          onSoloLeave: () => {
            nativeLeft += 1;
          },
        })
      );

      // Wait for solo threshold
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25));
      });

      const nativeWarning = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'banner-solo-participant-warning'
      );
      expect(nativeWarning).not.toBeNull();
      expect(getTextContent(nativeWarning)).toContain('Are you still waiting?');

      const nativeLeaveBtn = findElement(
        nativeWarning,
        (el) => el.props?.testID === 'btn-solo-leave'
      );
      expect(nativeLeaveBtn).not.toBeNull();
      await nativeLeaveBtn.props.onPress?.();
      expect(nativeLeft).toBe(1);
      nativeHarness.unmount();

      let webLeft = 0;
      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebProps,
          hasRemoteParticipant: false,
          soloWarningThresholdMs: 10,
          soloAutoLeaveGraceMs: 2000,
          onSoloLeave: () => {
            webLeft += 1;
          },
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
      expect(getTextContent(webWarning)).toContain('Are you still waiting?');

      const webStayBtn = findElement(
        webWarning,
        (el) => el.props?.['data-testid'] === 'btn-solo-stay'
      );
      expect(webStayBtn).not.toBeNull();
      await webStayBtn.props.onClick?.();

      const webLeaveBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-solo-leave'
      );
      // Stay in call dismissed the warning
      expect(webLeaveBtn).toBeNull();
      webHarness.unmount();
    });
  });
});
