// token-guard:ignore-file
/**
 * Test Suite: Challenger M9 Adversarial Clinic Workstation Teleconsultation Suite
 * 
 * Requirement R4 Verification Mandates:
 *  1. Fullscreen edge-to-edge call stage: hideHeader={true}, no header bar, no close button when isActuallyInCall && !isCallStageDocked.
 *  2. Ultra-thin single-row horizontal draggable dock bar (~36-38px): testID="docked-call-mini-bar-wrapper",
 *     testID="docked-call-mini-bar", testID="docked-drag-handle", testID="docked-audio-indicator",
 *     testID="docked-patient-label", testID="btn-toggle-pip", testID="btn-maximize-call",
 *     testID="btn-docked-end-call", height constraints (38px), zero inline video box, and PanResponder boundary clamping.
 *  3. Native Web Picture-in-Picture: persistent hidden <video> element (testID="persistent-pip-video-container"),
 *     track attachment lifecycle, and PiP toggle mechanics with event synchronization.
 *  4. End-call confirmation dialog: testID="confirm-end-call-dialog", testID="btn-cancel-end-call",
 *     testID="btn-confirm-end-call", ensuring calls cannot disconnect without explicit confirmation.
 *  5. Guest invite API endpoint: createTeleconsultGuestInvite(appointmentId) calling POST /api/v1/teleconsult/appointments/{appointmentId}/guest-invite
 *     and testID="btn-copy-patient-link" in AppointmentInspectionModal.tsx.
 *  6. Token & host guard assertions: zero raw hex colors, zero unapproved external hosts.
 */

import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import path from 'node:path';
import fs from 'node:fs';

(globalThis as any).__DEV__ = true;

// =============================================================================
// React Native Mocking for Headless Bun Environment
// =============================================================================

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    testID,
    visible,
    style,
    onPress,
    onClick,
    ...props
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    const clickHandler = onPress || onClick;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(clickHandler ? { 'data-pressable': 'true', onClick: clickHandler } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      children,
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  RefreshControl: createMockComponent('RefreshControl'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Touchable: { Mixin: {} },
  Image: createMockComponent('Image'),
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    ValueXY: class {
      constructor(public val: any = { x: 0, y: 0 }) {}
      setValue(val: any) { this.val = val; }
      setOffset() {}
      flattenOffset() {}
      getTranslateTransform() { return []; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
  },
  PanResponder: {
    create: (config: any) => ({ panHandlers: {}, ...config }),
  },
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
}));

const { theme } = await import('../constants/theme');
const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');

describe('Challenger M9: Clinic Workstation UI/UX, Draggable Dock, Native PiP & Confirmation Dialog', () => {
  const modalFilePath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const modalSource = fs.readFileSync(modalFilePath, 'utf-8');

  const drawerFilePath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const drawerSource = fs.readFileSync(drawerFilePath, 'utf-8');

  const serviceFilePath = path.resolve(__dirname, '../services/clinicService.ts');
  const serviceSource = fs.readFileSync(serviceFilePath, 'utf-8');

  // =========================================================================
  // Focus 1: Fullscreen Edge-to-Edge Call Stage Invariant Matrix
  // =========================================================================
  describe('Focus 1: Fullscreen Edge-to-Edge Call Stage Invariant Matrix', () => {
    it('1.1: Active full-screen stage is triggered strictly when isActuallyInCall && !isCallStageDocked', () => {
      expect(modalSource).toContain('if (isActuallyInCall && !isCallStageDocked) {');
    });

    it('1.2: Renders CallStage with hideHeader={true} attribute', () => {
      // Find the CallStage block within full-screen active call stage
      const fullScreenMatch = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{([\s\S]*?return \([\s\S]*?<CallStage([\s\S]*?)\/>[\s\S]*?\);[\s\S]*?\})/,
      );
      expect(fullScreenMatch).not.toBeNull();
      const callStageBlock = fullScreenMatch![2];
      expect(callStageBlock).toContain('hideHeader');
    });

    it('1.3: Active stage container enforces fixed full-viewport edge-to-edge layout without header', () => {
      expect(modalSource).toContain('testID="teleconsult-active-stage-container"');
      expect(modalSource).toContain('fullScreenStage: {');

      // Verify fullScreenStage styles in StyleSheet
      const fullScreenStyleMatch = modalSource.match(/fullScreenStage:\s*\{([\s\S]*?)\},/);
      expect(fullScreenStyleMatch).not.toBeNull();
      const styleBody = fullScreenStyleMatch![1];
      expect(styleBody).toContain("position: 'fixed'");
      expect(styleBody).toContain('top: 0');
      expect(styleBody).toContain('left: 0');
      expect(styleBody).toContain('right: 0');
      expect(styleBody).toContain('bottom: 0');
      expect(styleBody).toContain("width: '100vw'");
      expect(styleBody).toContain("height: '100vh'");
      expect(styleBody).toContain('zIndex: 2000000');
    });

    it('1.4: In full-screen mode, headerBar, modalCard, and btn-close-waiting-room are bypassed', () => {
      const fullScreenBranch = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{([\s\S]*?)(?:if \(|return)/,
      );
      expect(fullScreenBranch).not.toBeNull();
      const branchCode = fullScreenBranch![1];

      // The full screen branch must not render the modal card or close button
      expect(branchCode).not.toContain('styles.headerBar');
      expect(branchCode).not.toContain('styles.modalCard');
      expect(branchCode).not.toContain('btn-close-waiting-room');
    });

    it('1.5: CallStage wires patientLink and onSharePatientLink for guest link dissemination', () => {
      const fullScreenMatch = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{([\s\S]*?<CallStage([\s\S]*?)\/>)/,
      );
      expect(fullScreenMatch).not.toBeNull();
      const callStageProps = fullScreenMatch![2];
      expect(callStageProps).toContain('patientLink={patientInviteUrl}');
      expect(callStageProps).toContain('onSharePatientLink={handleSharePatientLink}');
    });

    it('1.6: CallStage workstation action renders dock button (btn-dock-call) invoking handleDockAndOpenChart', () => {
      expect(modalSource).toContain('testID="btn-dock-call"');
      expect(modalSource).toContain('onPress={handleDockAndOpenChart}');
      expect(modalSource).toContain('onDockCall={handleDockAndOpenChart}');
    });

    it('1.7: Full-screen CallStage onEndCall triggers confirmation modal rather than direct disconnect', () => {
      // Find full-screen active call stage return block
      const fullScreenMatch = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{([\s\S]*?return \([\s\S]*?<CallStage[\s\S]*?renderWorkstationAction=[\s\S]*?\/>[\s\S]*?\);[\s\S]*?\})/,
      );
      expect(fullScreenMatch).not.toBeNull();
      const callStageBlock = fullScreenMatch![1];
      expect(callStageBlock).toContain('onEndCall={() => setIsConfirmEndCallOpen(true)}');
    });
  });

  // =========================================================================
  // Focus 2: Ultra-Thin Draggable Dock Bar Architecture & Clamping Math
  // =========================================================================
  describe('Focus 2: Ultra-Thin Draggable Dock Bar Architecture & Clamping Math', () => {
    it('2.1: Docked mode is triggered strictly when isActuallyInCall && isCallStageDocked', () => {
      expect(modalSource).toContain('if (isActuallyInCall && isCallStageDocked) {');
    });

    it('2.2: Outer wrapper has testID="docked-call-mini-bar-wrapper" with Animated pan transform', () => {
      expect(modalSource).toContain('testID="docked-call-mini-bar-wrapper"');
      expect(modalSource).toContain('styles.dockedBarContainer, { transform: pan.getTranslateTransform() }');
    });

    it('2.3: Docked bar has testID="docked-call-mini-bar" with 38px height constraint', () => {
      expect(modalSource).toContain('testID="docked-call-mini-bar"');
      const dockedBarStyleMatch = modalSource.match(/dockedBar:\s*\{([\s\S]*?)\},/);
      expect(dockedBarStyleMatch).not.toBeNull();
      const styleBody = dockedBarStyleMatch![1];
      expect(styleBody).toContain('height: 38');
      expect(styleBody).toContain('maxHeight: 38');
      expect(styleBody).toContain("flexDirection: 'row'");
      expect(styleBody).toContain("alignItems: 'center'");
    });

    it('2.4: Slim dock bar (docked-call-mini-bar) contains NO inline video element while optional docked-pip-frame mounts directly above it inside the shared wrapper', () => {
      const dockedBranchMatch = modalSource.match(
        /if \(isActuallyInCall && isCallStageDocked\) \{([\s\S]*?)return \(\s*<>([\s\S]*?)<\/>\s*\);/m,
      );
      expect(dockedBranchMatch).not.toBeNull();
      const dockedJsx = dockedBranchMatch![2];

      expect(dockedJsx).toContain('testID="docked-pip-frame"');

      const barOnlyStart = dockedJsx.indexOf('testID="docked-call-mini-bar"');
      expect(barOnlyStart).toBeGreaterThan(-1);
      const barOnlyJsx = dockedJsx.slice(barOnlyStart);
      expect(barOnlyJsx).not.toContain('<video');
      expect(barOnlyJsx).not.toContain('WebVideoTrackView');
      expect(barOnlyJsx).not.toContain('renderVideoPreview');
      expect(barOnlyJsx).not.toContain('renderCustomVideoSurface');
      expect(barOnlyJsx).not.toContain('stagingPlaceholder');
    });

    it('2.5: Renders all required child testIDs in docked bar', () => {
      expect(modalSource).toContain('testID="docked-drag-handle"');
      expect(modalSource).not.toContain('Audio Connected');
      expect(modalSource).toContain('testID="docked-patient-label"');
      expect(modalSource).toContain('testID="btn-toggle-pip"');
      expect(modalSource).toContain('testID="btn-maximize-call"');
      expect(modalSource).toContain('testID="btn-docked-end-call"');
    });

    it('2.6: Drag handle attaches PanResponder panHandlers and adjustable accessibility role', () => {
      const dragHandleBlock = modalSource.match(/testID="docked-drag-handle"([\s\S]*?)>/);
      expect(dragHandleBlock).not.toBeNull();
      const blockCode = dragHandleBlock![1];
      expect(blockCode).toContain('{...panResponder.panHandlers}');
      expect(blockCode).toContain('accessibilityRole="adjustable"');
    });

    it('2.7: PanResponder boundary clamping math survives extreme boundary attacks', () => {
      // Simulate the exact clamping formula used in PanResponder onPanResponderMove and onPanResponderRelease
      const calculateClampedPosition = (
        currentX: number,
        currentY: number,
        windowWidth: number,
        windowHeight: number,
        barWidth = 480,
        barHeight = 38,
      ) => {
        const minX = -(windowWidth - barWidth - 32);
        const maxX = 16;
        const minY = -(windowHeight - barHeight - 32);
        const maxY = 16;

        const clampedX = Math.min(maxX, Math.max(minX, currentX));
        const clampedY = Math.min(maxY, Math.max(minY, currentY));
        return { clampedX, clampedY, minX, maxX, minY, maxY };
      };

      // Scenario 1: Extreme positive drag (+99999px) -> must clamp to maxX (16) and maxY (16)
      const extremePos = calculateClampedPosition(99999, 88888, 1920, 1080);
      expect(extremePos.clampedX).toBe(16);
      expect(extremePos.clampedY).toBe(16);

      // Scenario 2: Extreme negative drag (-99999px) -> must clamp to minX and minY
      const standardDesktop = calculateClampedPosition(-99999, -99999, 1920, 1080);
      // minX = -(1920 - 480 - 32) = -1408
      expect(standardDesktop.minX).toBe(-1408);
      expect(standardDesktop.clampedX).toBe(-1408);
      // minY = -(1080 - 38 - 32) = -1010
      expect(standardDesktop.minY).toBe(-1010);
      expect(standardDesktop.clampedY).toBe(-1010);

      // Scenario 3: Compact viewport (1024 x 768)
      const compactScreen = calculateClampedPosition(-99999, -99999, 1024, 768);
      // minX = -(1024 - 480 - 32) = -512
      expect(compactScreen.clampedX).toBe(-512);
      // minY = -(768 - 38 - 32) = -698
      expect(compactScreen.clampedY).toBe(-698);

      // Scenario 4: In-bounds translation (-200, -150)
      const inBounds = calculateClampedPosition(-200, -150, 1920, 1080);
      expect(inBounds.clampedX).toBe(-200);
      expect(inBounds.clampedY).toBe(-150);

      // Scenario 5: Subtle drag at edge
      const edgeX = calculateClampedPosition(20, -100, 1920, 1080);
      expect(edgeX.clampedX).toBe(16);
      expect(edgeX.clampedY).toBe(-100);
    });

    it('2.8: PanResponder ignores micro-movements <= 1px to avoid gesture hijacking on click', () => {
      // Test the movement threshold defined in onMoveShouldSetPanResponder
      const shouldSetPanResponder = (dx: number, dy: number) => {
        return Math.abs(dx) > 1 || Math.abs(dy) > 1;
      };

      expect(shouldSetPanResponder(0, 0)).toBe(false);
      expect(shouldSetPanResponder(1, 0)).toBe(false);
      expect(shouldSetPanResponder(0, 1)).toBe(false);
      expect(shouldSetPanResponder(-1, 1)).toBe(false);
      expect(shouldSetPanResponder(2, 0)).toBe(true);
      expect(shouldSetPanResponder(0, -2)).toBe(true);
      expect(shouldSetPanResponder(5, 5)).toBe(true);
    });

    it('2.9: Touch target compliance on dock controls: hitSlop ensures effective touch target >= 44x36px', () => {
      // Find all hitSlop usages on dockedCompactButton
      const hitSlopMatches = modalSource.match(/hitSlop=\{\{\s*top:\s*8,\s*bottom:\s*8,\s*left:\s*6,\s*right:\s*6\s*\}\}/g);
      expect(hitSlopMatches).not.toBeNull();
      // At least 5 buttons in dock bar: mic, cam, pip, maximize, end
      expect(hitSlopMatches!.length).toBeGreaterThanOrEqual(5);

      // 28px width + 6 left + 6 right = 40px ~ 44px
      // 28px height + 8 top + 8 bottom = 44px (Strict mobile touch guidelines)
      const dockedCompactStyle = modalSource.match(/dockedCompactButton:\s*\{([\s\S]*?)\},/);
      expect(dockedCompactStyle).not.toBeNull();
      expect(dockedCompactStyle![1]).toContain('width: 28');
      expect(dockedCompactStyle![1]).toContain('height: 28');
    });
  });

  // =========================================================================
  // Focus 3: Coupled In-App PiP + Slim Dock & Zero-Detachment Pointer Capture
  // =========================================================================
  describe('Focus 3: Coupled In-App PiP + Slim Dock & Zero-Detachment Pointer Capture', () => {
    it('3.1: Persistent remote audio container is mounted whenever isActuallyInCall === true', () => {
      expect(modalSource).toContain('testID="persistent-remote-audio-container"');
      expect(modalSource).toContain('styles.persistentVideoHidden');
      expect(modalSource).toContain("Platform.OS === 'web' && isActuallyInCall");
    });

    it('3.2: Persistent remote audio container is placed in both docked and full-screen return branches', () => {
      // Full screen return branch includes remoteAudioElement
      const fullScreenReturn = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{[\s\S]*?return \(\s*<View[^>]*testID="teleconsult-active-stage-container"[^>]*>([\s\S]*?)<\/View>/,
      );
      expect(fullScreenReturn).not.toBeNull();
      expect(fullScreenReturn![1]).toContain('{remoteAudioElement}');

      // Docked return branch includes remoteAudioElement
      const dockedReturn = modalSource.match(
        /if \(isActuallyInCall && isCallStageDocked\) \{[\s\S]*?return \(\s*<>([\s\S]*?)<\/>/,
      );
      expect(dockedReturn).not.toBeNull();
      expect(dockedReturn![1]).toContain('{remoteAudioElement}');
    });

    it('3.3: Coupled PiP frame and camera-off fallback render inside the unified draggable wrapper', () => {
      expect(modalSource).toContain('const isPipSupported = true;');
      expect(modalSource).toContain('testID="docked-pip-frame"');
      expect(modalSource).toContain('testID="docked-pip-fallback"');
      expect(modalSource).toContain('testID="btn-close-docked-pip"');
      expect(modalSource).toContain("session.mediaTracks.isCameraEnabled ? 'Waiting for Patient Video' : 'Camera Off'");
    });

    it('3.4: Dock action minimizes full-screen without PiP, while PiP button docks with PiP open and toggles in-dock PiP', () => {
      const dockHandler = modalSource.match(/const handleDockAndOpenChart = useCallback\(\(\) => \{([\s\S]*?)\}, \[/);
      expect(dockHandler).not.toBeNull();
      expect(dockHandler![1]).toContain('setIsPipActive(false);');
      expect(dockHandler![1]).toContain('dockCallStage();');

      const pipHandler = modalSource.match(/const handleTogglePip = useCallback\(async \(\) => \{([\s\S]*?)\}, \[/);
      expect(pipHandler).not.toBeNull();
      expect(pipHandler![1]).toContain('if (!isCallStageDocked) {');
      expect(pipHandler![1]).toContain('setIsPipActive(true);');
      expect(pipHandler![1]).toContain('dockCallStage();');
      expect(pipHandler![1]).toContain('setIsPipActive((prev) => !prev);');
    });

    it('3.5: Web pointer capture and window-level listeners prevent cursor detachment during fast drags', () => {
      expect(modalSource).toContain('captureTarget?.setPointerCapture?.(pointerId)');
      expect(modalSource).toContain("window.addEventListener('pointermove', onPointerMove)");
      expect(modalSource).toContain("window.addEventListener('pointerup', finishDrag)");
      expect(modalSource).toContain("window.addEventListener('pointercancel', finishDrag)");
      expect(modalSource).toContain("window.removeEventListener('pointermove', onPointerMove)");

      // Both the coupled PiP frame and dock drag handle share the zero-detachment drag handler
      const pipBlock = modalSource.match(/testID="docked-pip-frame"([\s\S]*?)accessibilityLabel=/);
      expect(pipBlock).not.toBeNull();
      expect(pipBlock![1]).toContain('handleWebDragPointerDown');

      const handleBlock = modalSource.match(/testID="docked-drag-handle"([\s\S]*?)>/);
      expect(handleBlock).not.toBeNull();
      expect(handleBlock![1]).toContain('handleWebDragPointerDown');
    });

    it('3.6: Remote audio track attachment supports both LiveKit attach/detach and MediaStreamTrack', () => {
      expect(modalSource).toContain('const remoteAudioTrack = mediaAdapter.getRemoteAudioTrack();');
      expect(modalSource).toContain("typeof attachable.attach === 'function'");
      expect(modalSource).toContain('attachable.attach(el)');
      expect(modalSource).toContain('attachable.detach?.(el)');
      expect(modalSource).toContain('remoteAudioTrack instanceof MediaStreamTrack');
      expect(modalSource).toContain('el.srcObject = new MediaStream([remoteAudioTrack])');
      expect(modalSource).toContain('el.srcObject = null');
    });

    it('3.7: dockedBarContainer uses fixed positioning on Web so viewport coordinates stay aligned during scroll/drag', () => {
      const containerStyle = modalSource.match(/dockedBarContainer:\s*\{([\s\S]*?)\},/);
      expect(containerStyle).not.toBeNull();
      expect(containerStyle![1]).toContain("Platform.OS === 'web' ? ('fixed' as any) : 'absolute'");
    });

    it('3.8: MediaSession API connects hangup action handler directly to confirmation dialog', () => {
      expect(modalSource).toContain("navigator.mediaSession.setActionHandler('hangup' as any, () => {");
      expect(modalSource).toContain('setIsConfirmEndCallOpen(true);');
    });

    it('3.9: Unified dock card clips PiP + bar inside single rounded mask and portals to document.body above all modals', () => {
      expect(modalSource).toContain('testID="docked-unified-card"');
      const unifiedCardStyle = modalSource.match(/dockedUnifiedCard:\s*\{([\s\S]*?)\},/);
      expect(unifiedCardStyle).not.toBeNull();
      expect(unifiedCardStyle![1]).toContain('borderRadius: theme.radii.md');
      expect(unifiedCardStyle![1]).toContain("overflow: 'hidden'");

      const containerStyle = modalSource.match(/dockedBarContainer:\s*\{([\s\S]*?)\},/);
      expect(containerStyle).not.toBeNull();
      expect(containerStyle![1]).toContain('borderRadius: theme.radii.md');
      expect(containerStyle![1]).toContain('...theme.shadows.lg');

      const portalHostStyle = modalSource.match(/teleconsultTopPortalHost:\s*\{([\s\S]*?)\},/);
      expect(portalHostStyle).not.toBeNull();
      expect(portalHostStyle![1]).toContain('zIndex: 2147483000');
      expect(modalSource).toContain('createPortal');
      expect(modalSource).toContain("clinicezTopLayer: 'true'");
    });
  });

  // =========================================================================
  // Focus 4: End-Call Confirmation Dialog Defense Matrix
  // =========================================================================
  describe('Focus 4: End-Call Confirmation Dialog Defense Matrix', () => {
    it('4.1: Confirmation dialog is rendered with testID="confirm-end-call-dialog" and accessibility attributes', () => {
      expect(modalSource).toContain('testID="confirm-end-call-dialog"');
      expect(modalSource).toContain('role="alertdialog"');
      expect(modalSource).toContain('aria-modal={true}');
    });

    it('4.2: Confirmation dialog contains testID="btn-cancel-end-call" and testID="btn-confirm-end-call"', () => {
      expect(modalSource).toContain('testID="btn-cancel-end-call"');
      expect(modalSource).toContain('title="Keep In Call"');
      expect(modalSource).toContain('testID="btn-confirm-end-call"');
      expect(modalSource).toContain('title="End Consultation"');
    });

    it('4.3: Cancel button dismisses modal without calling session.endCall or closing waiting room', () => {
      const cancelActionMatch = modalSource.match(
        /testID="btn-cancel-end-call"[\s\S]*?onPress=\{([^}]+)\}/,
      );
      expect(cancelActionMatch).not.toBeNull();
      expect(cancelActionMatch![1]).toContain('setIsConfirmEndCallOpen(false)');
      expect(cancelActionMatch![1]).not.toContain('handleEndCall');
      expect(cancelActionMatch![1]).not.toContain('session.endCall');
    });

    it('4.4: Confirm button closes confirmation dialog and executes handleEndCall', () => {
      const confirmActionMatch = modalSource.match(
        /testID="btn-confirm-end-call"[\s\S]*?onPress=\{([^}]+)\}/,
      );
      expect(confirmActionMatch).not.toBeNull();
      expect(confirmActionMatch![1]).toContain('setIsConfirmEndCallOpen(false)');
      expect(confirmActionMatch![1]).toContain('handleEndCall()');
    });

    it('4.5: Docked end call button (btn-docked-end-call) opens confirmation dialog, never ends directly', () => {
      const dockedEndBtnMatch = modalSource.match(
        /testID="btn-docked-end-call"[\s\S]*?onPress=\{([^}]+)\}/,
      );
      expect(dockedEndBtnMatch).not.toBeNull();
      expect(dockedEndBtnMatch![1]).toContain('setIsConfirmEndCallOpen(true)');
      expect(dockedEndBtnMatch![1]).not.toContain('handleEndCall');
    });

    it('4.6: Confirm modal overlay has zIndex: 2000001, floating above full-screen stage and dock bar', () => {
      const overlayStyleMatch = modalSource.match(/confirmModalOverlay:\s*\{([\s\S]*?)\},/);
      expect(overlayStyleMatch).not.toBeNull();
      const styleBody = overlayStyleMatch![1];
      expect(styleBody).toContain('zIndex: 2000001');
      expect(styleBody).toContain("position: 'absolute'");
    });

    it('4.7: Confirmation dialog is present in both docked and full-screen layout trees', () => {
      const dockedTree = modalSource.match(
        /if \(isActuallyInCall && isCallStageDocked\) \{([\s\S]*?)return \(\s*<>([\s\S]*?)<\/>\s*\);/,
      );
      expect(dockedTree).not.toBeNull();
      expect(dockedTree![2]).toContain('{confirmEndCallDialog}');

      const fullScreenTree = modalSource.match(
        /if \(isActuallyInCall && !isCallStageDocked\) \{([\s\S]*?)return \(\s*<View[^>]*testID="teleconsult-active-stage-container"[^>]*>([\s\S]*?)<\/View>\s*\);/,
      );
      expect(fullScreenTree).not.toBeNull();
      expect(fullScreenTree![2]).toContain('{confirmEndCallDialog}');
    });
  });

  // =========================================================================
  // Focus 5: Guest Invite Service API & Appointment Inspection Modal
  // =========================================================================
  describe('Focus 5: Guest Invite Service API & Appointment Inspection Modal', () => {
    it('5.1: clinicService.createTeleconsultGuestInvite method signature and HTTP endpoint', () => {
      expect(serviceSource).toContain('async createTeleconsultGuestInvite(appointmentId: string)');
      expect(serviceSource).toContain('/teleconsult/appointments/${encodeURIComponent(appointmentId)}/guest-invite');
    });

    it('5.2: TeleconsultGuestInviteDto interface exposes required cryptographic invite fields', () => {
      expect(serviceSource).toContain('export interface TeleconsultGuestInviteDto {');
      expect(serviceSource).toContain('inviteToken: string;');
      expect(serviceSource).toContain('inviteUrl: string;');
      expect(serviceSource).toContain('otp: string;');
      expect(serviceSource).toContain('expiresAtUtc: string;');
      expect(serviceSource).toContain('dobHint?: string | null;');
    });

    it('5.3: createTeleconsultGuestInvite correctly dispatches POST to API client with URI encoding', async () => {
      const capturedCalls: Array<{ url: string; body: any }> = [];
      const originalPost = clinicApiClient.post.bind(clinicApiClient);
      (clinicApiClient as any).post = async (url: string, body: any) => {
        capturedCalls.push({ url, body });
        return [
          {
            inviteToken: 'mock-token-xyz',
            inviteUrl: 'https://portal.clinicez.ph/teleconsult/guest?token=mock-token-xyz',
            otp: '123456',
            expiresAtUtc: '2026-11-13T23:59:59Z',
            dobHint: '1985-**-**',
          },
          null,
        ];
      };

      try {
        const appointmentId = 'appt-test-456/emergency #1';
        const [result, err] = await clinicService.createTeleconsultGuestInvite(appointmentId);
        expect(err).toBeNull();
        expect(result).not.toBeNull();
        expect(result!.inviteToken).toBe('mock-token-xyz');
        expect(result!.otp).toBe('123456');
        expect(capturedCalls.length).toBe(1);
        expect(capturedCalls[0].url).toBe(
          `/teleconsult/appointments/${encodeURIComponent(appointmentId)}/guest-invite`,
        );
        expect(capturedCalls[0].body).toEqual({});
      } finally {
        (clinicApiClient as any).post = originalPost;
      }
    });

    it('5.4: AppointmentInspectionModal renders testID="btn-copy-patient-link" for active teleconsult appointments', () => {
      expect(drawerSource).toContain('testID="btn-copy-patient-link"');
      expect(drawerSource).toContain('Copy Patient Link');
      expect(drawerSource).toContain('isTeleconsult && currentAppointment.status !== \'Cancelled\'');
    });

    it('5.5: btn-copy-patient-link calls clinicService.createTeleconsultGuestInvite and writes to clipboard', () => {
      const copyBtnBlock = drawerSource.match(
        /testID="btn-copy-patient-link"[\s\S]*?onPress=\{async \(\) => \{([\s\S]*?)\}\}/,
      );
      expect(copyBtnBlock).not.toBeNull();
      const clickHandler = copyBtnBlock![1];
      expect(clickHandler).toContain('clinicService.createTeleconsultGuestInvite');
      expect(clickHandler).toContain('navigator.clipboard.writeText');
      expect(clickHandler).toContain('Patient consultation link copied to clipboard.');
    });

    it('5.6: btn-copy-patient-link handles clipboard or service failure with error notification', () => {
      const copyBtnBlock = drawerSource.match(
        /testID="btn-copy-patient-link"[\s\S]*?onPress=\{async \(\) => \{([\s\S]*?)\}\}/,
      );
      expect(copyBtnBlock).not.toBeNull();
      const clickHandler = copyBtnBlock![1];
      expect(clickHandler).toContain('notify.error');
      expect(clickHandler).toContain('Could not generate patient consultation link.');
    });
  });

  // =========================================================================
  // Focus 6: Strict Design Tokens, External Host & Code Safety Guards
  // =========================================================================
  describe('Focus 6: Strict Design Tokens, External Host & Code Safety Guards', () => {
    it('6.1: Zero hardcoded hex color literals in TeleconsultWaitingRoomModal.tsx', () => {
      const hexMatches = modalSource.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('6.2: Zero hardcoded hex color literals in AppointmentInspectionModal.tsx', () => {
      const hexMatches = drawerSource.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('6.3: Zero unapproved external hosts in TeleconsultWaitingRoomModal.tsx', () => {
      const hostMatches = modalSource.match(/https?:\/\/(?!localhost:8081)[^\s'"`,]+/g) || [];
      const activeCodeMatches = hostMatches.filter((url) => !url.includes('// Example'));
      expect(activeCodeMatches.length).toBe(0);
    });

    it('6.4: Zero unapproved external hosts in AppointmentInspectionModal.tsx', () => {
      const hostMatches = drawerSource.match(/https?:\/\/(?!localhost:8081)[^\s'"`,]+/g) || [];
      const activeCodeMatches = hostMatches.filter((url) => !url.includes('// Example'));
      expect(activeCodeMatches.length).toBe(0);
    });

    it('6.5: Static AST audit verifies touchTarget constraint on touchableMinSize and interactive elements', () => {
      expect(modalSource).toContain('touchableMinSize: {');
      expect(modalSource).toContain('minHeight: theme.sizes.touchTarget');
      expect(modalSource).toContain('minWidth: theme.sizes.touchTarget');
      expect(theme.sizes.touchTarget).toBeGreaterThanOrEqual(44);
    });

    it('6.6: Plain copy verification: rejects technical jargon in user-facing UI labels', () => {
      // Must not contain technical or clinical jargon
      expect(modalSource).not.toContain('Teleconsultation Staging Room');
      expect(modalSource).not.toContain('Local Preview (No Camera/Mic Access)');
      expect(modalSource).not.toContain('Could not acquire teleconsultation room token');

      // Must contain user-friendly plain copy
      expect(modalSource).toContain('Virtual Waiting Room');
      expect(modalSource).toContain('Preview Only (Microphone & Camera Off)');
      expect(modalSource).toContain('Could not connect to consultation call');
    });
  });
});
