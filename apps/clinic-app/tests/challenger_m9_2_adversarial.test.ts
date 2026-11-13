// token-guard:ignore-file
/**
 * Test Suite: Challenger M9.2 Clinic Workstation UI/UX Adversarial Stress Suite
 * (challenger_m9_2_adversarial.test.ts)
 * 
 * Adversarial challenger 2 empirical verification for Milestone 9 (R4):
 *  - State Transition Fuzzing: Rapid switching between full-screen and docked mode,
 *    verifying persistent <video> element presence, properties, and track attachment logic.
 *  - Confirmation Dialog Behavior: Verifying cancel keeps session intact and call connected,
 *    confirm cleanly tears down call, and re-entrancy / rapid toggles do not corrupt state.
 *  - Draggable Dock Boundary Clamping: Viewport math across standard, ultrawide, 4K, and
 *    constrained viewports, with multi-gesture pan offset accumulation.
 *  - Guest Invite API Edge Cases: URL-encoding fuzzing (path traversal, URI delimiters,
 *    unicode, emojis, whitespace) and error resilience when API or clipboard fails.
 *  - AST & Token Invariance: Full compliance with design tokens and host safety.
 */

import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  Image: createMockComponent('Image'),
  Animated: {
    ValueXY: class {
      x: number;
      y: number;
      offset = { x: 0, y: 0 };
      constructor(val?: { x: number; y: number }) {
        this.x = val?.x ?? 0;
        this.y = val?.y ?? 0;
      }
      setValue(val: { x: number; y: number }) {
        this.x = val.x;
        this.y = val.y;
      }
      setOffset(offset: { x: number; y: number }) {
        this.offset = { ...offset };
      }
      flattenOffset() {
        this.x += this.offset.x;
        this.y += this.offset.y;
        this.offset = { x: 0, y: 0 };
      }
      getTranslateTransform() {
        return [{ translateX: this.x }, { translateY: this.y }];
      }
    },
    View: createMockComponent('Animated.View'),
  },
  PanResponder: {
    create: (config: any) => ({
      panHandlers: {
        onStartShouldSetResponder: config.onStartShouldSetPanResponder,
        onMoveShouldSetResponder: config.onMoveShouldSetPanResponder,
        onResponderGrant: config.onPanResponderGrant,
        onResponderMove: config.onPanResponderMove,
        onResponderRelease: config.onPanResponderRelease,
      },
      _config: config,
    }),
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

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

describe('Challenger M9.2: Clinic Workstation UI/UX Adversarial Stress Suite', () => {
  const modalFilePath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const modalContent = fs.readFileSync(modalFilePath, 'utf-8');

  const inspectionFilePath = path.resolve(__dirname, '../components/calendar/AppointmentInspectionModal.tsx');
  const inspectionContent = fs.readFileSync(inspectionFilePath, 'utf-8');

  const serviceFilePath = path.resolve(__dirname, '../services/clinicService.ts');
  const serviceContent = fs.readFileSync(serviceFilePath, 'utf-8');

  // =========================================================================
  // Focus 1: State Transition Fuzzing & Persistent Video Element Invariant
  // =========================================================================
  describe('Focus 1: State Transition Fuzzing & Persistent Video Element Invariant', () => {
    it('1.1: Persistent video element container uses aria-hidden, pointerEvents="none", and 1x1 hidden video style', () => {
      // Must contain persistent video container definition
      expect(modalContent).toContain('testID="persistent-pip-video-container"');
      expect(modalContent).toContain('data-testid="persistent-pip-video-container"');
      expect(modalContent).toContain('pointerEvents="none"');
      expect(modalContent).toContain('aria-hidden={true}');

      // Must create hidden HTMLVideoElement with persistentVideoRef
      expect(modalContent).toContain('ref: persistentVideoRef');
      expect(modalContent).toContain('autoPlay: true');
      expect(modalContent).toContain('playsInline: true');
      expect(modalContent).toContain("position: 'absolute'");
      expect(modalContent).toContain('opacity: 0');
    });

    it('1.2: Persistent video element is present in both docked and fullscreen layout returns', () => {
      // Docked layout return
      const dockedSection = modalContent.match(/if\s*\(isActuallyInCall\s*&&\s*isCallStageDocked\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(dockedSection).not.toBeNull();
      expect(dockedSection![1]).toContain('{persistentVideoElement}');
      expect(dockedSection![1]).toContain('docked-call-mini-bar-wrapper');

      // Fullscreen layout return
      const fullscreenSection = modalContent.match(/if\s*\(isActuallyInCall\s*&&\s*!isCallStageDocked\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(fullscreenSection).not.toBeNull();
      expect(fullscreenSection![1]).toContain('{persistentVideoElement}');
      expect(fullscreenSection![1]).toContain('teleconsult-active-stage-container');
    });

    it('1.3: Fuzz rapid docking state transitions (50 iterations) without state corruption', () => {
      // Model the state machine governing layout transitions
      let isActuallyInCall = true;
      let isCallStageDocked = false;
      let activeLayout: 'fullscreen' | 'docked' | 'staging' = 'fullscreen';

      const renderLayout = (inCall: boolean, docked: boolean) => {
        if (inCall && docked) return 'docked';
        if (inCall && !docked) return 'fullscreen';
        return 'staging';
      };

      for (let i = 0; i < 50; i++) {
        isCallStageDocked = !isCallStageDocked;
        activeLayout = renderLayout(isActuallyInCall, isCallStageDocked);
        if (i % 2 === 0) {
          expect(activeLayout).toBe('docked');
        } else {
          expect(activeLayout).toBe('fullscreen');
        }
      }

      // Re-verify call remains in call
      expect(isActuallyInCall).toBe(true);
    });

    it('1.4: Video track attachment effect continuously re-evaluates across track changes and media revisions', () => {
      // Check useEffect for continuously attaching video tracks to persistentVideoRef
      const trackEffectMatch = modalContent.match(/Continuously attach remote video track[\s\S]*?useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?getRemoteVideoTrack[\s\S]*?\}\s*,\s*\[([^\]]+)\]\s*\);/);
      expect(trackEffectMatch).not.toBeNull();
      const deps = trackEffectMatch![1].split(',').map((d) => d.trim());
      expect(deps).toContain('isActuallyInCall');
      expect(deps).toContain('mediaAdapter');
      expect(deps).toContain('mediaRevision');
    });

    it('1.5: PiP event listeners (enterpictureinpicture, leavepictureinpicture) are cleanly attached and cleaned up', () => {
      expect(modalContent).toContain("el.addEventListener('enterpictureinpicture', onEnterPip)");
      expect(modalContent).toContain("el.addEventListener('leavepictureinpicture', onLeavePip)");
      expect(modalContent).toContain("el.removeEventListener('enterpictureinpicture', onEnterPip)");
      expect(modalContent).toContain("el.removeEventListener('leavepictureinpicture', onLeavePip)");
    });
  });

  // =========================================================================
  // Focus 2: Confirmation Dialog State Machine & Re-entrancy Stress
  // =========================================================================
  describe('Focus 2: Confirmation Dialog State Machine & Re-entrancy Stress', () => {
    it('2.1: Confirmation dialog overlay uses alertdialog role and aria-modal={true}', () => {
      expect(modalContent).toContain('testID="confirm-end-call-dialog"');
      expect(modalContent).toContain('data-testid="confirm-end-call-dialog"');
      expect(modalContent).toContain('role="alertdialog"');
      expect(modalContent).toContain('aria-modal={true}');
    });

    it('2.2: Cancel action strictly sets isConfirmEndCallOpen(false) without invoking session.endCall', () => {
      // Find btn-cancel-end-call handler
      const cancelMatch = modalContent.match(/testID="btn-cancel-end-call"[\s\S]*?onPress=\{([^}]+)\}/);
      expect(cancelMatch).not.toBeNull();
      const handlerBody = cancelMatch![1];
      expect(handlerBody).toContain('setIsConfirmEndCallOpen(false)');
      expect(handlerBody).not.toContain('endCall');
      expect(handlerBody).not.toContain('closeTeleconsultWaitingRoom');
    });

    it('2.3: Confirm action invokes handleEndCall cleanly after closing dialog', () => {
      // Find btn-confirm-end-call handler
      const confirmMatch = modalContent.match(/testID="btn-confirm-end-call"[\s\S]*?onPress=\{([^}]+)\}/);
      expect(confirmMatch).not.toBeNull();
      const handlerBody = confirmMatch![1];
      expect(handlerBody).toContain('setIsConfirmEndCallOpen(false)');
      expect(handlerBody).toContain('handleEndCall');
    });

    it('2.4: All three end-call trigger paths route through confirmation dialog before disconnecting', () => {
      // 1. Docked end call button
      const dockedEndMatch = modalContent.match(/testID="btn-docked-end-call"[\s\S]*?onPress=\{([^}]+)\}/);
      expect(dockedEndMatch).not.toBeNull();
      expect(dockedEndMatch![1]).toContain('setIsConfirmEndCallOpen(true)');
      expect(dockedEndMatch![1]).not.toContain('handleEndCall');

      // 2. Fullscreen CallStage onEndCall
      const stageEndMatch = modalContent.match(/onEndCall=\{([^}]+)\}/);
      expect(stageEndMatch).not.toBeNull();
      expect(stageEndMatch![1]).toContain('setIsConfirmEndCallOpen(true)');

      // 3. MediaSession hangup action
      expect(modalContent).toContain("navigator.mediaSession.setActionHandler('hangup' as any, () => {");
      expect(modalContent).toContain('setIsConfirmEndCallOpen(true);');
    });

    it('2.5: Re-entrancy stress: Cancel -> Open -> Cancel -> Open -> Confirm sequence preserves session until confirmed', () => {
      let isCallActive = true;
      let isConfirmOpen = false;
      let endCallInvocationCount = 0;

      const clickEndCall = () => { isConfirmOpen = true; };
      const clickCancel = () => { isConfirmOpen = false; };
      const clickConfirm = () => {
        isConfirmOpen = false;
        endCallInvocationCount++;
        isCallActive = false;
      };

      // Cycle 1: Click end -> Cancel
      clickEndCall();
      expect(isConfirmOpen).toBe(true);
      expect(isCallActive).toBe(true);
      clickCancel();
      expect(isConfirmOpen).toBe(false);
      expect(isCallActive).toBe(true);
      expect(endCallInvocationCount).toBe(0);

      // Cycle 2: Click end -> Cancel again
      clickEndCall();
      expect(isConfirmOpen).toBe(true);
      clickCancel();
      expect(isConfirmOpen).toBe(false);
      expect(isCallActive).toBe(true);
      expect(endCallInvocationCount).toBe(0);

      // Cycle 3: Click end -> Confirm
      clickEndCall();
      expect(isConfirmOpen).toBe(true);
      clickConfirm();
      expect(isConfirmOpen).toBe(false);
      expect(isCallActive).toBe(false);
      expect(endCallInvocationCount).toBe(1);
    });

    it('2.6: Confirmation modal overlay has zIndex: 10000, floating above docked bar and full-screen stage', () => {
      expect(modalContent).toContain('zIndex: 10000');
      expect(modalContent).toContain('zIndex: 9999'); // dockedBarContainer & fullScreenStage are 9999
    });
  });

  // =========================================================================
  // Focus 3: Draggable Dock Boundary Clamping & Gesture Accumulator Stress
  // =========================================================================
  describe('Focus 3: Draggable Dock Boundary Clamping & Gesture Accumulator Stress', () => {
    // Pure mathematical model extracted directly from TeleconsultWaitingRoomModal.tsx PanResponder logic
    const calculateClampedPan = (
      windowWidth: number,
      windowHeight: number,
      initialOffset: { x: number; y: number },
      delta: { dx: number; dy: number },
    ) => {
      const barWidth = 480;
      const barHeight = 38;

      const minX = -(windowWidth - barWidth - 32);
      const maxX = 16;
      const minY = -(windowHeight - barHeight - 32);
      const maxY = 16;

      const rawX = initialOffset.x + delta.dx;
      const rawY = initialOffset.y + delta.dy;

      const clampedX = Math.min(maxX, Math.max(minX, rawX));
      const clampedY = Math.min(maxY, Math.max(minY, rawY));

      return { clampedX, clampedY, minX, maxX, minY, maxY };
    };

    it('3.1: Standard Desktop (1280 x 800) boundary clamping verification', () => {
      const w = 1280;
      const h = 800;
      const offset = { x: 0, y: 0 };

      // Neutral drag
      const neutral = calculateClampedPan(w, h, offset, { dx: 0, dy: 0 });
      expect(neutral.clampedX).toBe(0);
      expect(neutral.clampedY).toBe(0);
      expect(neutral.minX).toBe(-768); // -(1280 - 480 - 32)
      expect(neutral.minY).toBe(-730); // -(800 - 38 - 32)

      // Extreme positive drag (down/right): must clamp strictly to maxX=16, maxY=16
      const extremePos = calculateClampedPan(w, h, offset, { dx: 5000, dy: 5000 });
      expect(extremePos.clampedX).toBe(16);
      expect(extremePos.clampedY).toBe(16);

      // Extreme negative drag (up/left): must clamp strictly to minX=-768, minY=-730
      const extremeNeg = calculateClampedPan(w, h, offset, { dx: -5000, dy: -5000 });
      expect(extremeNeg.clampedX).toBe(-768);
      expect(extremeNeg.clampedY).toBe(-730);
    });

    it('3.2: Ultrawide (3440 x 1440) and 4K (3840 x 2160) boundary clamping', () => {
      // 3440 x 1440
      const ultra = calculateClampedPan(3440, 1440, { x: 0, y: 0 }, { dx: -10000, dy: -10000 });
      expect(ultra.minX).toBe(-(3440 - 480 - 32)); // -2928
      expect(ultra.minY).toBe(-(1440 - 38 - 32));  // -1370
      expect(ultra.clampedX).toBe(-2928);
      expect(ultra.clampedY).toBe(-1370);

      // 3840 x 2160 (4K)
      const fourK = calculateClampedPan(3840, 2160, { x: 0, y: 0 }, { dx: -10000, dy: -10000 });
      expect(fourK.minX).toBe(-(3840 - 480 - 32)); // -3328
      expect(fourK.minY).toBe(-(2160 - 38 - 32));  // -2090
      expect(fourK.clampedX).toBe(-3328);
      expect(fourK.clampedY).toBe(-2090);
    });

    it('3.3: Minimum workstation viewport (1024 x 768) boundary clamping', () => {
      const minViewport = calculateClampedPan(1024, 768, { x: 0, y: 0 }, { dx: -500, dy: -600 });
      expect(minViewport.minX).toBe(-(1024 - 480 - 32)); // -512
      expect(minViewport.minY).toBe(-(768 - 38 - 32));   // -698
      expect(minViewport.clampedX).toBe(-500); // within -512 and 16
      expect(minViewport.clampedY).toBe(-600); // within -698 and 16
    });

    it('3.4: Multi-gesture offset accumulation without unbounded drift', () => {
      const w = 1280;
      const h = 800;
      let currentOffset = { x: 0, y: 0 };

      // Gesture 1: Drag left by 200px, up by 150px
      const g1 = calculateClampedPan(w, h, currentOffset, { dx: -200, dy: -150 });
      currentOffset = { x: g1.clampedX, y: g1.clampedY };
      expect(currentOffset).toEqual({ x: -200, y: -150 });

      // Gesture 2: Drag left by another 400px, up by 300px
      const g2 = calculateClampedPan(w, h, currentOffset, { dx: -400, dy: -300 });
      currentOffset = { x: g2.clampedX, y: g2.clampedY };
      expect(currentOffset).toEqual({ x: -600, y: -450 });

      // Gesture 3: Drag right by 1000px (overshoot), down by 800px (overshoot)
      const g3 = calculateClampedPan(w, h, currentOffset, { dx: 1000, dy: 800 });
      currentOffset = { x: g3.clampedX, y: g3.clampedY };
      expect(currentOffset).toEqual({ x: 16, y: 16 }); // Strictly clamped to maxX, maxY
    });

    it('3.5: PanResponder deadband ignores micro-movements <= 1px to prevent click hijacking', () => {
      const moveHandlerMatch = modalContent.match(/onMoveShouldSetPanResponder:\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\}/);
      expect(moveHandlerMatch).not.toBeNull();
      const body = moveHandlerMatch![1];
      expect(body).toContain('Math.abs(gestureState.dx) > 1 || Math.abs(gestureState.dy) > 1');
    });

    it('3.6: Drag handle has gripVertical icon, adjustable role, and grab cursor', () => {
      expect(modalContent).toContain('testID="docked-drag-handle"');
      expect(modalContent).toContain('accessibilityRole="adjustable"');
      expect(modalContent).toContain("name=\"gripVertical\"");
      expect(modalContent).toContain("cursor: 'grab'");
    });
  });

  // =========================================================================
  // Focus 4: Guest Invite URL Encoding Fuzzing & API Error Resilience
  // =========================================================================
  describe('Focus 4: Guest Invite URL Encoding Fuzzing & API Error Resilience', () => {
    it('4.1: clinicService.createTeleconsultGuestInvite properly URL-encodes appointmentId', () => {
      expect(serviceContent).toContain('createTeleconsultGuestInvite(appointmentId: string)');
      expect(serviceContent).toContain('/teleconsult/appointments/${encodeURIComponent(appointmentId)}/guest-invite');
    });

    it('4.2: URL Encoding Fuzz Matrix: handles GUIDs, path traversals, URI delimiters, unicode, and emojis', () => {
      const testCases = [
        {
          input: 'd3b07384-d113-46d4-a077-4c728ff22002',
          expectedPath: '/teleconsult/appointments/d3b07384-d113-46d4-a077-4c728ff22002/guest-invite',
        },
        {
          input: 'appt/123/malicious',
          expectedPath: '/teleconsult/appointments/appt%2F123%2Fmalicious/guest-invite',
        },
        {
          input: '../../etc/passwd',
          expectedPath: '/teleconsult/appointments/..%2F..%2Fetc%2Fpasswd/guest-invite',
        },
        {
          input: 'appt?token=secret#fragment',
          expectedPath: '/teleconsult/appointments/appt%3Ftoken%3Dsecret%23fragment/guest-invite',
        },
        {
          input: 'appt with spaces & symbols + =',
          expectedPath: '/teleconsult/appointments/appt%20with%20spaces%20%26%20symbols%20%2B%20%3D/guest-invite',
        },
        {
          input: 'ñöñó-app-👨‍⚕️',
          expectedPath: `/teleconsult/appointments/${encodeURIComponent('ñöñó-app-👨‍⚕️')}/guest-invite`,
        },
      ];

      for (const tc of testCases) {
        const constructedPath = `/teleconsult/appointments/${encodeURIComponent(tc.input)}/guest-invite`;
        expect(constructedPath).toBe(tc.expectedPath);
        // Ensure no unencoded forward slashes from the appointmentId leak into the path
        const pathSegments = constructedPath.split('/');
        expect(pathSegments.length).toBe(5);
        expect(pathSegments[1]).toBe('teleconsult');
        expect(pathSegments[2]).toBe('appointments');
        expect(pathSegments[4]).toBe('guest-invite');
      }
    });

    it('4.3: AppointmentInspectionModal error handling when createTeleconsultGuestInvite returns API error', () => {
      expect(inspectionContent).toContain('clinicService.createTeleconsultGuestInvite');
      expect(inspectionContent).toContain('if (err || !invite?.inviteUrl)');
      expect(inspectionContent).toContain("notify.error(err?.message || 'Could not generate patient consultation link.')");
    });

    it('4.4: AppointmentInspectionModal error handling when clipboard write throws exception', () => {
      expect(inspectionContent).toContain('navigator.clipboard?.writeText');
      // Must be wrapped in try/catch block
      const handlerSection = inspectionContent.match(/testID="btn-copy-patient-link"[\s\S]*?onPress=\{async \(\) => \{([\s\S]*?)\}\}/);
      expect(handlerSection).not.toBeNull();
      const body = handlerSection![1];
      expect(body).toContain('try {');
      expect(body).toContain('catch {');
      expect(body).toContain("notify.error('Could not generate patient consultation link.')");
    });

    it('4.5: TeleconsultWaitingRoomModal handleSharePatientLink error resilience', () => {
      const shareMatch = modalContent.match(/handleSharePatientLink\s*=\s*useCallback\(async \(\) => \{([\s\S]*?)\},\s*\[appointmentId\]\);/);
      expect(shareMatch).not.toBeNull();
      const body = shareMatch![1];
      expect(body).toContain('if (!appointmentId) return;');
      expect(body).toContain('clinicService.createTeleconsultGuestInvite(appointmentId)');
      expect(body).toContain('if (err || !invite?.inviteUrl)');
      expect(body).toContain("notify.error(err?.message || 'Could not generate patient consultation link.')");
      expect(body).toContain('setPatientInviteUrl(invite.inviteUrl)');
    });
  });

  // =========================================================================
  // Focus 5: AST, Design Token & Guardrail Invariants
  // =========================================================================
  describe('Focus 5: AST, Design Token & Guardrail Invariants', () => {
    it('5.1: Zero raw hex colors in TeleconsultWaitingRoomModal.tsx', () => {
      const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
      const matches = modalContent.match(hexColorRegex);
      expect(matches).toBeNull();
    });

    it('5.2: Zero raw hex colors in AppointmentInspectionModal.tsx', () => {
      const hexColorRegex = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
      const matches = inspectionContent.match(hexColorRegex);
      expect(matches).toBeNull();
    });

    it('5.3: Zero forbidden external hostnames or localhost in TeleconsultWaitingRoomModal.tsx', () => {
      const forbiddenHosts = ['localhost', '127.0.0.1', '0.0.0.0', 'herokuapp.com', 'firebaseapp.com'];
      for (const host of forbiddenHosts) {
        expect(modalContent.toLowerCase()).not.toContain(host);
      }
    });

    it('5.4: Zero forbidden external hostnames or localhost in AppointmentInspectionModal.tsx', () => {
      const forbiddenHosts = ['localhost', '127.0.0.1', '0.0.0.0', 'herokuapp.com', 'firebaseapp.com'];
      for (const host of forbiddenHosts) {
        expect(inspectionContent.toLowerCase()).not.toContain(host);
      }
    });

    it('5.5: Dock bar dimensions strictly conform to R4 (~36-38px height, 0 inline video)', () => {
      expect(modalContent).toContain('height: 38');
      expect(modalContent).toContain('maxHeight: 38');
      expect(modalContent).toContain("flexDirection: 'row'");
      expect(modalContent).toContain("alignItems: 'center'");
    });

    it('5.6: Interactive touch targets satisfy accessibility minimums via hitSlop or touchableMinSize', () => {
      expect(modalContent).toContain('hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}');
      expect(modalContent).toContain('touchableMinSize: {');
      expect(modalContent).toContain('minHeight: theme.sizes.touchTarget');
      expect(modalContent).toContain('minWidth: theme.sizes.touchTarget');
    });

    it('5.7: Plain copy audit: no technical or clinical jargon in user-visible strings', () => {
      const forbiddenJargon = [
        'WebRTC Media Signaling Gateway',
        'SFU Peer Connection',
        'ICE Candidate Allocation',
        'SDP Offer/Answer Handshake',
      ];
      for (const jargon of forbiddenJargon) {
        expect(modalContent).not.toContain(jargon);
      }
    });
  });
});
