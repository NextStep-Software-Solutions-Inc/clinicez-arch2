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
  });
});
