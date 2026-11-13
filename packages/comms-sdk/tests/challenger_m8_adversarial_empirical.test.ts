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
import { useCallSession } from '../src/react/hooks/useCallSession';
import { createHookHarness, act } from './react/hook-test-harness';
import { lightColors, spaceScale, sizes } from '@clinicez/design-tokens';

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

describe('Challenger M8: Empirical Verification & Adversarial Stress Harness', () => {
  const baseNativeWRProps = {
    callId: 'call-m8-1111-2222-3333-444455556666',
    appointmentId: 'apt-m8-12345',
    userRole: 'Clinician' as const,
    patientName: 'Adversarial Test Patient',
    clinicianName: 'Dr. Adversarial',
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

  const baseNativeStageProps = {
    callId: 'call-m8-1111-2222-3333-444455556666',
    roomName: 'room-m8-active',
    userRole: 'Clinician' as const,
    participantName: 'Adversarial Test Patient',
    selfName: 'Dr. Adversarial',
    isMicEnabled: true,
    isCameraEnabled: true,
    onToggleMic: () => {},
    onToggleCamera: () => {},
    onEndCall: () => {}
  };

  const baseWebStageProps = {
    ...baseNativeStageProps
  };

  // =========================================================================
  // Dimension 1: Aspect Ratio Switching & Video Orientation Matrices
  // =========================================================================
  describe('Dimension 1: Aspect Ratio Switching & Video Orientation Transitions', () => {
    it('WaitingRoom Native: defaults to portrait 3/4 aspect ratio and switches to landscape 16/9', () => {
      // Default: portrait
      const defaultHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps
        })
      );
      const defaultTree = defaultHarness.result.current;
      const previewBoxDefault = findElement(defaultTree, (el) =>
        Array.isArray(el.props?.style) &&
        el.props.style.some((s: any) => s && (s.aspectRatio === 3 / 4 || s.aspectRatio === 16 / 9))
      );
      expect(previewBoxDefault).not.toBeNull();
      const defaultStyles = Object.assign({}, ...previewBoxDefault.props.style.filter(Boolean));
      expect(defaultStyles.aspectRatio).toBe(3 / 4);
      defaultHarness.unmount();

      // Explicit Landscape: 16/9
      const landscapeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          videoOrientation: 'landscape'
        })
      );
      const landscapeTree = landscapeHarness.result.current;
      const previewBoxLandscape = findElement(landscapeTree, (el) =>
        Array.isArray(el.props?.style) &&
        el.props.style.some((s: any) => s && (s.aspectRatio === 3 / 4 || s.aspectRatio === 16 / 9))
      );
      expect(previewBoxLandscape).not.toBeNull();
      const landscapeStyles = Object.assign({}, ...previewBoxLandscape.props.style.filter(Boolean));
      expect(landscapeStyles.aspectRatio).toBe(16 / 9);
      landscapeHarness.unmount();
    });

    it('WaitingRoom Web: defaults to aspect-[3/4] and switches to aspect-video in landscape', () => {
      // Default: aspect-[3/4]
      const defaultHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebWRProps
        })
      );
      const defaultTree = defaultHarness.result.current;
      const previewBoxDefault = findElement(defaultTree, (el) =>
        typeof el.props?.className === 'string' &&
        (el.props.className.includes('aspect-[3/4]') || el.props.className.includes('aspect-video'))
      );
      expect(previewBoxDefault).not.toBeNull();
      expect(previewBoxDefault.props.className).toContain('aspect-[3/4]');
      expect(previewBoxDefault.props.className).not.toContain('aspect-video');
      defaultHarness.unmount();

      // Landscape: aspect-video
      const landscapeHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebWRProps,
          videoOrientation: 'landscape'
        })
      );
      const landscapeTree = landscapeHarness.result.current;
      const previewBoxLandscape = findElement(landscapeTree, (el) =>
        typeof el.props?.className === 'string' &&
        (el.props.className.includes('aspect-[3/4]') || el.props.className.includes('aspect-video'))
      );
      expect(previewBoxLandscape).not.toBeNull();
      expect(previewBoxLandscape.props.className).toContain('aspect-video');
      landscapeHarness.unmount();
    });

    it('CallStage Native: PiP canvas switches between portrait (3/4, width 105) and landscape (16/9, width 140)', () => {
      // Default: portrait PiP
      const portraitHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          videoOrientation: 'portrait'
        })
      );
      const portraitTree = portraitHarness.result.current;
      const pipCanvasPortrait = findElement(portraitTree, (el) =>
        Array.isArray(el.props?.style) &&
        el.props.style.some((s: any) => s && (s.aspectRatio === 3 / 4 || s.aspectRatio === 16 / 9))
      );
      expect(pipCanvasPortrait).not.toBeNull();
      const pStyles = Object.assign({}, ...pipCanvasPortrait.props.style.filter(Boolean));
      expect(pStyles.aspectRatio).toBe(3 / 4);
      expect(pStyles.width).toBe(105);
      portraitHarness.unmount();

      // Landscape PiP
      const landscapeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          videoOrientation: 'landscape'
        })
      );
      const landscapeTree = landscapeHarness.result.current;
      const pipCanvasLandscape = findElement(landscapeTree, (el) =>
        Array.isArray(el.props?.style) &&
        el.props.style.some((s: any) => s && (s.aspectRatio === 3 / 4 || s.aspectRatio === 16 / 9))
      );
      expect(pipCanvasLandscape).not.toBeNull();
      const lStyles = Object.assign({}, ...pipCanvasLandscape.props.style.filter(Boolean));
      expect(lStyles.aspectRatio).toBe(16 / 9);
      expect(lStyles.width).toBe(140);
      landscapeHarness.unmount();
    });

    it('CallStage Web: PiP canvas applies responsive aspect-[3/4] vs aspect-video classes', () => {
      // Default / Portrait
      const portraitHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          videoOrientation: 'portrait'
        })
      );
      const pCanvas = findElement(portraitHarness.result.current, (el) =>
        typeof el.props?.className === 'string' &&
        (el.props.className.includes('aspect-[3/4]') || el.props.className.includes('aspect-video'))
      );
      expect(pCanvas).not.toBeNull();
      expect(pCanvas.props.className).toContain('aspect-[3/4]');
      portraitHarness.unmount();

      // Landscape
      const landscapeHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          videoOrientation: 'landscape'
        })
      );
      const lCanvas = findElement(landscapeHarness.result.current, (el) =>
        typeof el.props?.className === 'string' &&
        (el.props.className.includes('aspect-[3/4]') || el.props.className.includes('aspect-video'))
      );
      expect(lCanvas).not.toBeNull();
      expect(lCanvas.props.className).toContain('aspect-video');
      landscapeHarness.unmount();
    });
  });

  // =========================================================================
  // Dimension 2: Orientation Toggle & Share Link Controls
  // =========================================================================
  describe('Dimension 2: Orientation Toggle & Share Link Control Suppression & Triggers', () => {
    it('WaitingRoom Native & Web: strictly suppresses btn-toggle-orientation when onToggleOrientation is omitted', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          onToggleOrientation: undefined
        })
      );
      const nativeBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-orientation'
      );
      expect(nativeBtn).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebWRProps,
          onToggleOrientation: undefined
        })
      );
      const webBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-orientation' || el.props?.id === 'btn-toggle-orientation'
      );
      expect(webBtn).toBeNull();
      webHarness.unmount();
    });

    it('WaitingRoom Native & Web: strictly suppresses share link card and button when patientLink & onSharePatientLink are omitted', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          patientLink: undefined,
          onSharePatientLink: undefined
        })
      );
      const nativeShareBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-share-patient-link'
      );
      expect(nativeShareBtn).toBeNull();
      const nativeCard = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-share-patient-link-card'
      );
      expect(nativeCard).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallWaitingRoom({
          ...baseWebWRProps,
          patientLink: undefined,
          onSharePatientLink: undefined
        })
      );
      const webShareBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-share-patient-link'
      );
      expect(webShareBtn).toBeNull();
      const webCardBtn = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-share-patient-link-card'
      );
      expect(webCardBtn).toBeNull();
      webHarness.unmount();
    });

    it('WaitingRoom Native: handles patientLink display without onSharePatientLink cleanly without crashing', async () => {
      const testLink = 'https://portal.clinicez.com/teleconsult/join?token=sec-token-xyz';
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          patientLink: testLink,
          onSharePatientLink: undefined
        })
      );
      const text = getTextContent(nativeHarness.result.current);
      expect(text).toContain(testLink);

      // Media bar share button is present because patientLink is defined
      const shareBtn = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-share-patient-link'
      );
      expect(shareBtn).not.toBeNull();
      // Pressing it when onSharePatientLink is undefined must not throw
      expect(() => shareBtn.props.onPress?.()).not.toThrow();

      nativeHarness.unmount();
    });
  });

  // =========================================================================
  // Dimension 3: Centered Toolbar, Docking & PiP Controls
  // =========================================================================
  describe('Dimension 3: Centered Toolbar Layout, Docking & PiP Mechanics', () => {
    it('CallStage Native: mediaToolbarWrapper is absolutely positioned, centered, with pointerEvents="box-none"', () => {
      const harness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onDockCall: () => {}
        })
      );
      const tree = harness.result.current;
      const toolbarWrapper = findElement(
        tree,
        (el) => el.props?.pointerEvents === 'box-none' && el.props?.style?.alignItems === 'center'
      );
      expect(toolbarWrapper).not.toBeNull();
      expect(toolbarWrapper.props.style).toEqual({
        position: 'absolute',
        bottom: spaceScale.lg,
        left: 0,
        right: 0,
        alignItems: 'center',
        justifyContent: 'center'
      });
      harness.unmount();
    });

    it('CallStage Web: media controls toolbar is horizontally centered with left-1/2 -translate-x-1/2', () => {
      const harness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          onDockCall: () => {}
        })
      );
      const tree = harness.result.current;
      const toolbar = findElement(
        tree,
        (el) =>
          typeof el.props?.className === 'string' &&
          el.props.className.includes('left-1/2') &&
          el.props.className.includes('-translate-x-1/2')
      );
      expect(toolbar).not.toBeNull();
      expect(toolbar.props.className).toContain('absolute bottom-4 left-1/2 -translate-x-1/2');
      harness.unmount();
    });

    it('CallStage Native & Web: strictly suppresses btn-dock-call when onDockCall is omitted', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onDockCall: undefined
        })
      );
      const nativeDock = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-dock-call'
      );
      expect(nativeDock).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          onDockCall: undefined
        })
      );
      const webDock = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-dock-call' || el.props?.id === 'btn-dock-call'
      );
      expect(webDock).toBeNull();
      webHarness.unmount();
    });

    it('CallStage Native & Web: strictly suppresses btn-toggle-pip when isPipSupported is false even if onTogglePip is passed', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onTogglePip: () => {},
          isPipSupported: false
        })
      );
      const nativePip = findElement(
        nativeHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-pip'
      );
      expect(nativePip).toBeNull();
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          onTogglePip: () => {},
          isPipSupported: false
        })
      );
      const webPip = findElement(
        webHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-pip' || el.props?.id === 'btn-toggle-pip'
      );
      expect(webPip).toBeNull();
      webHarness.unmount();
    });

    it('CallStage Native & Web: btn-toggle-pip toggles active styling based on isPipActive', () => {
      // Inactive
      const nativeInactiveHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onTogglePip: () => {},
          isPipSupported: true,
          isPipActive: false
        })
      );
      const nativeInactiveBtn = findElement(
        nativeInactiveHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-pip'
      );
      expect(nativeInactiveBtn).not.toBeNull();
      const inactiveStyles = Object.assign({}, ...nativeInactiveBtn.props.style.filter(Boolean));
      expect(inactiveStyles.backgroundColor).toBe(lightColors.surface);
      nativeInactiveHarness.unmount();

      // Active
      const nativeActiveHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onTogglePip: () => {},
          isPipSupported: true,
          isPipActive: true
        })
      );
      const nativeActiveBtn = findElement(
        nativeActiveHarness.result.current,
        (el) => el.props?.testID === 'btn-toggle-pip'
      );
      expect(nativeActiveBtn).not.toBeNull();
      const activeStyles = Object.assign({}, ...nativeActiveBtn.props.style.filter(Boolean));
      expect(activeStyles.backgroundColor).toBe(lightColors.primary);
      nativeActiveHarness.unmount();

      // Web active vs inactive
      const webActiveHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          onTogglePip: () => {},
          isPipSupported: true,
          isPipActive: true
        })
      );
      const webActiveBtn = findElement(
        webActiveHarness.result.current,
        (el) => el.props?.['data-testid'] === 'btn-toggle-pip'
      );
      expect(webActiveBtn.props.className).toContain('bg-teal-700 text-white');
      webActiveHarness.unmount();
    });
  });

  // =========================================================================
  // Dimension 4: Participant Name Resolution & Fallback Matrix in useCallSession
  // =========================================================================
  describe('Dimension 4: Participant Name Resolution & Fallback Matrix in useCallSession', () => {
    it('resolves Dr. Clinician when options is undefined (backward compatibility)', () => {
      const harness = createHookHarness(() => useCallSession('call-session-alpha'));
      expect(harness.result.current.participants[0].name).toBe('Dr. Clinician');
      expect(harness.result.current.participants[0].isDoctor).toBe(true);
      harness.unmount();
    });

    it('resolves Dr. Clinician when options is empty object {}', () => {
      const harness = createHookHarness(() => useCallSession('call-session-alpha', {}));
      expect(harness.result.current.participants[0].name).toBe('Dr. Clinician');
      expect(harness.result.current.participants[0].isDoctor).toBe(true);
      harness.unmount();
    });

    it('resolves Dr. Clinician when isDoctor is true and participantName is omitted', () => {
      const harness = createHookHarness(() => useCallSession('call-session-alpha', { isDoctor: true }));
      expect(harness.result.current.participants[0].name).toBe('Dr. Clinician');
      expect(harness.result.current.participants[0].isDoctor).toBe(true);
      harness.unmount();
    });

    it('resolves Participant when isDoctor is false and participantName is omitted', () => {
      const harness = createHookHarness(() => useCallSession('call-session-alpha', { isDoctor: false }));
      expect(harness.result.current.participants[0].name).toBe('Participant');
      expect(harness.result.current.participants[0].isDoctor).toBe(false);
      harness.unmount();
    });

    it('resolves custom participantName regardless of isDoctor value', () => {
      const nurseHarness = createHookHarness(() =>
        useCallSession('call-session-alpha', {
          participantName: 'Nurse Maria Santos',
          isDoctor: false
        })
      );
      expect(nurseHarness.result.current.participants[0].name).toBe('Nurse Maria Santos');
      expect(nurseHarness.result.current.participants[0].isDoctor).toBe(false);
      nurseHarness.unmount();

      const doctorHarness = createHookHarness(() =>
        useCallSession('call-session-alpha', {
          participantName: 'Dr. Roberto Cruz',
          isDoctor: true
        })
      );
      expect(doctorHarness.result.current.participants[0].name).toBe('Dr. Roberto Cruz');
      expect(doctorHarness.result.current.participants[0].isDoctor).toBe(true);
      doctorHarness.unmount();
    });

    it('handles participant name with single word, whitespace, or multiple parts for initials in CallStage', () => {
      // 2 parts: "Juan Dela Cruz" -> "JC"
      const h1 = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          participantName: 'Juan Dela Cruz'
        })
      );
      expect(getTextContent(h1.result.current)).toContain('JC');
      h1.unmount();

      // 1 part: "Prince" -> "PR"
      const h2 = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          participantName: 'Prince'
        })
      );
      expect(getTextContent(h2.result.current)).toContain('PR');
      h2.unmount();

      // Empty string: "" -> "??"
      const h3 = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          participantName: ''
        })
      );
      expect(getTextContent(h3.result.current)).toContain('??');
      h3.unmount();

      // Whitespace string: "   " -> yields empty initials "" (edge case documented in challenger report)
      const h4 = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          participantName: '   '
        })
      );
      const h4Text = getTextContent(h4.result.current);
      expect(h4Text).not.toContain('??');
      h4.unmount();
    });
  });

  // =========================================================================
  // Dimension 5: Plain Copy, Accessibility & Token Compliance
  // =========================================================================
  describe('Dimension 5: Plain Copy, A11y & Strict Token Guard', () => {
    it('WaitingRoom Native & Web: renders plain copy without technical jargon', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          isLoading: true
        })
      );
      const nativeLoadingText = getTextContent(nativeHarness.result.current);
      expect(nativeLoadingText).toContain('Preparing consultation...');
      expect(nativeLoadingText).not.toContain('Staging teleconsultation session...');
      nativeHarness.unmount();

      const nativeDetailsHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          isLoading: false
        })
      );
      const detailsText = getTextContent(nativeDetailsHarness.result.current);
      expect(detailsText).toContain('Doctor / Clinician:');
      expect(detailsText).not.toContain('Attending Clinician:');
      nativeDetailsHarness.unmount();
    });

    it('CallStage Native & Web: replaces Vault Recording Active with Recording in progress', () => {
      const nativeHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          isRecording: true,
          recordingDurationSeconds: 45
        })
      );
      const nativeText = getTextContent(nativeHarness.result.current);
      expect(nativeText).toContain('Recording in progress');
      expect(nativeText).not.toContain('Vault Recording Active');
      expect(nativeText).not.toContain('Encrypted Vault Recording Active');
      nativeHarness.unmount();

      const webHarness = createHookHarness(() =>
        WebCallStage({
          ...baseWebStageProps,
          isRecording: true,
          recordingDurationSeconds: 45
        })
      );
      const webText = getTextContent(webHarness.result.current);
      expect(webText).toContain('Recording in progress');
      expect(webText).not.toContain('Vault Recording Active');
      webHarness.unmount();
    });

    it('Native UI Controls enforce touchTarget minimum dimension >= 44px', () => {
      expect(sizes.touchTarget).toBeGreaterThanOrEqual(44);

      // CallStage native toolbar buttons
      const stageHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onDockCall: () => {},
          onTogglePip: () => {},
          isPipSupported: true,
          onToggleOrientation: () => {},
          onToggleScreenShare: () => {}
        })
      );
      const stageTree = stageHarness.result.current;
      const stageButtons = findAllElements(stageTree, (el) => el.type === 'button');
      for (const btn of stageButtons) {
        if (Array.isArray(btn.props?.style)) {
          const combined = Object.assign({}, ...btn.props.style.filter(Boolean));
          if (combined.minHeight !== undefined) {
            expect(combined.minHeight).toBeGreaterThanOrEqual(44);
          }
          if (combined.minWidth !== undefined) {
            expect(combined.minWidth).toBeGreaterThanOrEqual(44);
          }
        }
      }
      stageHarness.unmount();

      // WaitingRoom native media buttons
      const wrHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          patientLink: 'https://test.link',
          onSharePatientLink: () => {},
          onToggleOrientation: () => {}
        })
      );
      const wrButtons = findAllElements(wrHarness.result.current, (el) => el.type === 'button');
      for (const btn of wrButtons) {
        if (Array.isArray(btn.props?.style)) {
          const combined = Object.assign({}, ...btn.props.style.filter(Boolean));
          if (combined.minHeight !== undefined) {
            expect(combined.minHeight).toBeGreaterThanOrEqual(44);
          }
          if (combined.minWidth !== undefined) {
            expect(combined.minWidth).toBeGreaterThanOrEqual(44);
          }
        }
      }
      wrHarness.unmount();
    });

    it('All new interactive controls provide non-empty accessibility labels', () => {
      const stageHarness = createHookHarness(() =>
        NativeCallStage({
          ...baseNativeStageProps,
          onDockCall: () => {},
          onTogglePip: () => {},
          isPipSupported: true,
          onToggleOrientation: () => {}
        })
      );
      const stageTree = stageHarness.result.current;

      const dockBtn = findElement(stageTree, (el) => el.props?.testID === 'btn-dock-call');
      expect(dockBtn.props?.accessibilityLabel).toBe('Dock call and open chart');

      const pipBtn = findElement(stageTree, (el) => el.props?.testID === 'btn-toggle-pip');
      expect(pipBtn.props?.accessibilityLabel).toBe('Toggle picture in picture');

      const rotateBtn = findElement(stageTree, (el) => el.props?.testID === 'btn-toggle-orientation');
      expect(rotateBtn.props?.accessibilityLabel).toBe('Toggle video orientation');

      stageHarness.unmount();

      const wrHarness = createHookHarness(() =>
        NativeCallWaitingRoom({
          ...baseNativeWRProps,
          patientLink: 'https://test.link',
          onSharePatientLink: () => {},
          onToggleOrientation: () => {}
        })
      );
      const wrTree = wrHarness.result.current;

      const wrRotateBtn = findElement(wrTree, (el) => el.props?.testID === 'btn-toggle-orientation');
      expect(wrRotateBtn.props?.accessibilityLabel).toBe('Toggle video orientation');

      const wrShareBtn = findElement(wrTree, (el) => el.props?.testID === 'btn-share-patient-link');
      expect(wrShareBtn.props?.accessibilityLabel).toBe('Share patient invite link');

      wrHarness.unmount();
    });
  });
});
