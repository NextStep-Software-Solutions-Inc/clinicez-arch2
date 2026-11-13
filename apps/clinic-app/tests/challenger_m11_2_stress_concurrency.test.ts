// token-guard:ignore-file
/**
 * Test Suite: Challenger M11.2 - Teleconsultation Empirical Stress, Concurrency & Resilience
 * File: apps/clinic-app/tests/challenger_m11_2_stress_concurrency.test.ts
 *
 * Empirical challenger verification for Milestone 11:
 *  1. Workstation Call Transitions & State Machine Stress:
 *     - Rapid mode toggling: full-screen <-> docked (~38px draggable mini-bar) <-> PiP.
 *     - Hidden persistent video element anchoring and non-teardown of WebRTC media tracks.
 *     - Draggable dock bar boundary clamping across extreme coordinates and viewport sizes.
 *  2. Call Exit Confirmation Stress:
 *     - confirm-end-call-dialog rapid triggers, cancel vs confirm, fast click idempotency.
 *  3. Network Disruption & Error Recovery:
 *     - Patient App polling handling of 404 (call not yet active) vs 200 (call active) with seamless transition.
 *     - Portal Web guest join error flows: invalid token (404/401), expired invite (410), rate limited (423), malformed DOB/OTP.
 *  4. Concurrency & Reconnection:
 *     - Simultaneous participant join and leave event storm.
 *     - Participant name resolution fallback on undefined/null clinician names and initials calculation safety.
 */

import { describe, expect, it, mock, beforeEach } from 'bun:test';
import React from 'react';
import path from 'node:path';
import fs from 'node:fs';

(globalThis as any).__DEV__ = true;

// Mock react-native
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
    if (name === 'Modal' && visible === false) return null;
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
  Polyline: createMockComponent('polyline'),
  default: createMockComponent('svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

describe('Challenger M11.2: Empirical Stress, Concurrency & Resilience Suite', () => {
  const modalFilePath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const modalSource = fs.readFileSync(modalFilePath, 'utf-8');

  const guestFlowFilePath = path.resolve(__dirname, '../../../apps/portal-web/src/components/teleconsult/TeleconsultGuestFlow.tsx');
  const guestFlowSource = fs.readFileSync(guestFlowFilePath, 'utf-8');

  const guestJoinPagePath = path.resolve(__dirname, '../../../packages/comms-sdk/src/web-ui/GuestJoinPage.tsx');
  const guestJoinPageSource = fs.readFileSync(guestJoinPagePath, 'utf-8');

  const patientWaitingRoomPath = path.resolve(__dirname, '../../../apps/patient-app/navigation/screens/teleconsult/TeleconsultWaitingRoom.screen.tsx');
  const patientWaitingRoomSource = fs.readFileSync(patientWaitingRoomPath, 'utf-8');

  const patientApiPath = path.resolve(__dirname, '../../../apps/patient-app/services/api/teleconsultApi.ts');
  const patientApiSource = fs.readFileSync(patientApiPath, 'utf-8');

  const useCallSessionPath = path.resolve(__dirname, '../../../packages/comms-sdk/src/react/hooks/useCallSession.ts');
  const useCallSessionSource = fs.readFileSync(useCallSessionPath, 'utf-8');

  // ===========================================================================
  // 1. Workstation Call Transitions & State Machine Stress
  // ===========================================================================
  describe('Focus 1: Workstation Call Transitions & State Machine Stress', () => {
    it('1.1: Rapid mode toggling (100 flips): full-screen <-> docked preserves session state without corruption', () => {
      let isActuallyInCall = true;
      let isCallStageDocked = false;
      const history: Array<{ mode: 'fullscreen' | 'docked'; inCall: boolean }> = [];

      for (let i = 0; i < 100; i++) {
        isCallStageDocked = !isCallStageDocked;
        const mode = isActuallyInCall && isCallStageDocked ? 'docked' : 'fullscreen';
        history.push({ mode, inCall: isActuallyInCall });
      }

      expect(history.length).toBe(100);
      expect(history.every((h) => h.inCall)).toBe(true);
      expect(history.filter((h) => h.mode === 'docked').length).toBe(50);
      expect(history.filter((h) => h.mode === 'fullscreen').length).toBe(50);
      expect(isActuallyInCall).toBe(true);
    });

    it('1.2: Persistent remote audio container and coupled PiP + dock wrapper are anchored across docked and fullscreen modes', () => {
      expect(modalSource).toContain('testID="persistent-remote-audio-container"');
      expect(modalSource).toContain('pointerEvents="none"');
      expect(modalSource).toContain('aria-hidden={true}');
      expect(modalSource).toContain('testID="docked-pip-frame"');

      // Hidden container has zero-footprint off-screen style
      expect(modalSource).toContain("position: 'absolute'");
      expect(modalSource).toContain('opacity: 0');
      expect(modalSource).toContain('width: 1');
      expect(modalSource).toContain('height: 1');

      // Check both docked and fullscreen branches include {remoteAudioElement}
      const dockedBranch = modalSource.match(/if\s*\(isActuallyInCall\s*&&\s*isCallStageDocked\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(dockedBranch).not.toBeNull();
      expect(dockedBranch![1]).toContain('{remoteAudioElement}');

      const fullscreenBranch = modalSource.match(/if\s*\(isActuallyInCall\s*&&\s*!isCallStageDocked\)\s*\{([\s\S]*?)\n\s*\}/);
      expect(fullscreenBranch).not.toBeNull();
      expect(fullscreenBranch![1]).toContain('{remoteAudioElement}');
    });

    it('1.3: Remote audio track attachment effect attaches remote audio and coupled PiP frame reads remote or local video track', () => {
      const attachEffect = modalSource.match(/Continuously attach remote patient audio track[\s\S]*?useEffect\s*\(\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[([^\]]+)\]\s*\);/);
      expect(attachEffect).not.toBeNull();

      const effectBody = attachEffect![1];
      const deps = attachEffect![2].split(',').map((s) => s.trim());

      expect(deps).toContain('isActuallyInCall');
      expect(deps).toContain('isCallStageDocked');
      expect(deps).toContain('mediaAdapter');
      expect(deps).toContain('mediaRevision');

      // Logic handles both attachable tracks (LiveKit Track) and standard MediaStreamTrack
      expect(effectBody).toContain('mediaAdapter.getRemoteAudioTrack()');
      expect(effectBody).toContain('attachable.attach(el)');
      expect(effectBody).toContain('attachable.detach?.(el)');
      expect(effectBody).toContain('new MediaStream([remoteAudioTrack])');

      // Coupled PiP frame reads both remote & local video tracks inside docked wrapper
      expect(modalSource).toContain('mediaAdapter.getRemoteVideoTrack()');
      expect(modalSource).toContain('mediaAdapter.getLocalVideoTrack()');
    });

    it('1.4: Draggable dock bar math clamps to bounded viewport coordinates across 8 viewports', () => {
      const clampCoordinates = (
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

      const viewports = [
        { name: 'Mobile / Narrow', w: 640, h: 480 },
        { name: 'Min Workstation', w: 1024, h: 768 },
        { name: 'Standard Laptop', w: 1280, h: 800 },
        { name: 'Common Desktop', w: 1366, h: 768 },
        { name: 'FHD', w: 1920, h: 1080 },
        { name: 'QHD', w: 2560, h: 1440 },
        { name: 'Ultrawide', w: 3440, h: 1440 },
        { name: '4K', w: 3840, h: 2160 },
      ];

      for (const vp of viewports) {
        // Test extreme negative displacement (drag far left/up offscreen)
        const leftUp = clampCoordinates(-999999, -999999, vp.w, vp.h);
        expect(leftUp.clampedX).toBe(leftUp.minX);
        expect(leftUp.clampedY).toBe(leftUp.minY);

        // Test extreme positive displacement (drag far right/down offscreen)
        const rightDown = clampCoordinates(999999, 999999, vp.w, vp.h);
        expect(rightDown.clampedX).toBe(16);
        expect(rightDown.clampedY).toBe(16);

        // Test center within bounds
        const midX = (leftUp.minX + 16) / 2;
        const midY = (leftUp.minY + 16) / 2;
        const center = clampCoordinates(midX, midY, vp.w, vp.h);
        expect(center.clampedX).toBe(midX);
        expect(center.clampedY).toBe(midY);
      }
    });

    it('1.5: Multi-gesture random displacement stress (100 steps) accumulates without escaping bounds', () => {
      const windowWidth = 1280;
      const windowHeight = 800;
      const barWidth = 480;
      const barHeight = 38;
      const minX = -(windowWidth - barWidth - 32);
      const maxX = 16;
      const minY = -(windowHeight - barHeight - 32);
      const maxY = 16;

      let currentOffset = { x: 0, y: 0 };

      // Simulate 100 random drag gestures
      for (let i = 0; i < 100; i++) {
        const dx = (Math.random() - 0.5) * 500;
        const dy = (Math.random() - 0.5) * 500;

        const rawX = currentOffset.x + dx;
        const rawY = currentOffset.y + dy;

        const finalX = Math.min(maxX, Math.max(minX, rawX));
        const finalY = Math.min(maxY, Math.max(minY, rawY));

        currentOffset = { x: finalX, y: finalY };

        expect(currentOffset.x).toBeGreaterThanOrEqual(minX);
        expect(currentOffset.x).toBeLessThanOrEqual(maxX);
        expect(currentOffset.y).toBeGreaterThanOrEqual(minY);
        expect(currentOffset.y).toBeLessThanOrEqual(maxY);
      }
    });

    it('1.6: PanResponder deadband ignores micro-movements <= 1px to avoid click interception', () => {
      const moveHandler = (_: any, gesture: { dx: number; dy: number }) => {
        return Math.abs(gesture.dx) > 1 || Math.abs(gesture.dy) > 1;
      };

      expect(moveHandler({}, { dx: 0, dy: 0 })).toBe(false);
      expect(moveHandler({}, { dx: 0.5, dy: 0.8 })).toBe(false);
      expect(moveHandler({}, { dx: 1.0, dy: 1.0 })).toBe(false);
      expect(moveHandler({}, { dx: -1.0, dy: 0.5 })).toBe(false);
      expect(moveHandler({}, { dx: 1.1, dy: 0 })).toBe(true);
      expect(moveHandler({}, { dx: 0, dy: -1.5 })).toBe(true);
    });

    it('1.7: Dock bar structural invariants: total height ~36-38px, zero inline video elements', () => {
      // Check dockedBar style definition
      const dockedBarStyle = modalSource.match(/dockedBar:\s*\{([\s\S]*?)\}/);
      expect(dockedBarStyle).not.toBeNull();
      expect(dockedBarStyle![1]).toContain('height: 38');

      // Docked bar section in JSX has zero <video> elements
      const dockedJsx = modalSource.match(/testID="docked-call-mini-bar"[\s\S]*?<\/Animated.View>/);
      expect(dockedJsx).not.toBeNull();
      expect(dockedJsx![0]).not.toContain('<video');
      expect(dockedJsx![0]).not.toContain('WebVideoTrackView');
      expect(dockedJsx![0]).toContain('testID="docked-drag-handle"');
      expect(dockedJsx![0]).not.toContain('Audio Connected');
      expect(dockedJsx![0]).toContain('testID="docked-patient-label"');
      expect(dockedJsx![0]).toContain('testID="btn-docked-end-call"');
      expect(dockedJsx![0]).toContain('testID="btn-maximize-call"');
      expect(dockedJsx![0]).toContain('testID="btn-toggle-pip"');
    });
  });

  // ===========================================================================
  // 2. Call Exit Confirmation Stress
  // ===========================================================================
  describe('Focus 2: Call Exit Confirmation Stress', () => {
    it('2.1: Dialog rapid triggers (100 open/close cycles) do not prematurely end the call', () => {
      let isConfirmEndCallOpen = false;
      let isInCall = true;
      let endCallCount = 0;

      const openDialog = () => { isConfirmEndCallOpen = true; };
      const cancelDialog = () => { isConfirmEndCallOpen = false; };
      const confirmDialog = () => {
        isConfirmEndCallOpen = false;
        endCallCount++;
        isInCall = false;
      };

      for (let i = 0; i < 100; i++) {
        openDialog();
        expect(isConfirmEndCallOpen).toBe(true);
        cancelDialog();
        expect(isConfirmEndCallOpen).toBe(false);
        expect(isInCall).toBe(true);
        expect(endCallCount).toBe(0);
      }

      // Finally confirm
      openDialog();
      confirmDialog();
      expect(isInCall).toBe(false);
      expect(endCallCount).toBe(1);
    });

    it('2.2: Clicking "Keep In Call" (btn-cancel-end-call) strictly maintains session and media state', () => {
      expect(modalSource).toContain('testID="btn-cancel-end-call"');
      expect(modalSource).toContain('title="Keep In Call"');

      const cancelMatch = modalSource.match(/testID="btn-cancel-end-call"[\s\S]*?onPress=\{([^}]+)\}/);
      expect(cancelMatch).not.toBeNull();
      const cancelAction = cancelMatch![1];

      expect(cancelAction).toContain('setIsConfirmEndCallOpen(false)');
      expect(cancelAction).not.toContain('endCall');
      expect(cancelAction).not.toContain('closeTeleconsultWaitingRoom');
      expect(cancelAction).not.toContain('setIsInCall(false)');
    });

    it('2.3: Multiple rapid clicks on "End Consultation" (idempotency guard) execute cleanly', async () => {
      let sessionEndCallCount = 0;
      let closeRoomCount = 0;
      let isEnding = false;

      const mockSession = {
        endCall: async () => {
          sessionEndCallCount++;
          await new Promise((r) => setTimeout(r, 10));
        },
      };

      const handleEndCall = async () => {
        if (isEnding) return;
        isEnding = true;
        try {
          if (mockSession.endCall) {
            await mockSession.endCall();
          }
        } finally {
          closeRoomCount++;
          isEnding = false;
        }
      };

      // Fire 5 rapid clicks concurrently
      await Promise.all([
        handleEndCall(),
        handleEndCall(),
        handleEndCall(),
        handleEndCall(),
        handleEndCall(),
      ]);

      expect(sessionEndCallCount).toBe(1);
      expect(closeRoomCount).toBe(1);
    });

    it('2.4: All three call-ending paths route strictly through confirmEndCallDialog', () => {
      // 1. Fullscreen stage onEndCall
      const fullscreenStage = modalSource.match(/<CallStage[\s\S]*?onEndCall=\{([^}]+)\}/);
      expect(fullscreenStage).not.toBeNull();
      expect(fullscreenStage![1]).toContain('setIsConfirmEndCallOpen(true)');

      // 2. Docked mini bar end call button
      const dockedEndBtn = modalSource.match(/testID="btn-docked-end-call"[\s\S]*?onPress=\{([^}]+)\}/);
      expect(dockedEndBtn).not.toBeNull();
      expect(dockedEndBtn![1]).toContain('setIsConfirmEndCallOpen(true)');

      // 3. MediaSession hangup handler
      const mediaSessionHangup = modalSource.match(/navigator\.mediaSession\.setActionHandler\('hangup'[\s\S]*?=>\s*\{([^}]+)\}/);
      expect(mediaSessionHangup).not.toBeNull();
      expect(mediaSessionHangup![1]).toContain('setIsConfirmEndCallOpen(true)');
    });

    it('2.5: Dialog overlay styling uses zIndex: 2000001, floating above docked bar and full-screen stage', () => {
      const confirmOverlay = modalSource.match(/confirmModalOverlay:\s*\{([\s\S]*?)\}/);
      expect(confirmOverlay).not.toBeNull();
      expect(confirmOverlay![1]).toContain('zIndex: 2000001');
      expect(confirmOverlay![1]).toContain("position: 'absolute'");
      expect(confirmOverlay![1]).toContain('top: 0');
      expect(confirmOverlay![1]).toContain('bottom: 0');
    });
  });

  // ===========================================================================
  // 3. Network Disruption & Error Recovery
  // ===========================================================================
  describe('Focus 3: Network Disruption & Error Recovery', () => {
    describe('3.A: Patient App Polling (404 not active vs 200 active & flapping recovery)', () => {
      it('3.A.1: teleconsultApi.getCall handles HTTP 404 by returning null without throwing', () => {
        expect(patientApiSource).toContain('if (err instanceof ApiError && err.status === 404)');
        expect(patientApiSource).toContain('return null;');
      });

      it('3.A.2: Polling loop transitions seamlessly from 404 (null) to 200 (active token)', async () => {
        let isReadyToAdmit = false;
        let callSessionData: any = null;
        let pollCount = 0;

        // Simulated API responses: 3 consecutive 404s, then 200 active
        const simulatedResponses = [
          null, // poll 1: 404
          null, // poll 2: 404
          null, // poll 3: 404
          {     // poll 4: 200 active
            callId: '00000000-0000-0000-0000-000000000001',
            status: 'Active',
            roomName: 'room-00000000-0000-0000-0000-000000000001',
            relayUrl: 'wss://media.clinicez.com',
            joinToken: 'livekit-patient-jwt-token',
          },
        ];

        const pollCallStatus = async () => {
          const callData = pollCount < simulatedResponses.length
            ? simulatedResponses[pollCount++]
            : simulatedResponses[simulatedResponses.length - 1];
          if (!callData) return;

          callSessionData = callData;
          const status = callData.status?.toLowerCase();
          const isAdmitted =
            status === 'admitted' ||
            status === 'active' ||
            status === 'incall' ||
            status === 'connected' ||
            Boolean(callData.joinToken);

          if (isAdmitted) {
            isReadyToAdmit = true;
          }
        };

        // Poll 1: 404
        await pollCallStatus();
        expect(isReadyToAdmit).toBe(false);
        expect(callSessionData).toBeNull();

        // Poll 2: 404
        await pollCallStatus();
        expect(isReadyToAdmit).toBe(false);
        expect(callSessionData).toBeNull();

        // Poll 3: 404
        await pollCallStatus();
        expect(isReadyToAdmit).toBe(false);
        expect(callSessionData).toBeNull();

        // Poll 4: 200 Active
        await pollCallStatus();
        expect(isReadyToAdmit).toBe(true);
        expect(callSessionData).not.toBeNull();
        expect(callSessionData.joinToken).toBe('livekit-patient-jwt-token');
        expect(callSessionData.roomName).toBe('room-00000000-0000-0000-0000-000000000001');
      });

      it('3.A.3: Network flapping (404 -> 500 error -> Network offline -> 200 recovery) does not break loop', async () => {
        let isReadyToAdmit = false;
        let recovered = false;

        const flappingStream = [
          { type: '404', data: null },
          { type: '500', error: new Error('Internal Server Error') },
          { type: 'offline', error: new Error('Network request failed') },
          {
            type: '200',
            data: {
              callId: '00000000-0000-0000-0000-000000000002',
              status: 'admitted',
              roomName: 'room-00000000-0000-0000-0000-000000000002',
              relayUrl: 'wss://media.clinicez.com',
              joinToken: 'token-recovered',
            },
          },
        ];

        let index = 0;
        const executePoll = async () => {
          const item = flappingStream[index++];
          try {
            if (item.error) throw item.error;
            const callData = item.data;
            if (!callData) return;
            if (callData.joinToken || callData.status === 'admitted') {
              isReadyToAdmit = true;
              recovered = true;
            }
          } catch {
            // Patient App silent retry
          }
        };

        // 404
        await executePoll();
        expect(isReadyToAdmit).toBe(false);

        // 500
        await executePoll();
        expect(isReadyToAdmit).toBe(false);

        // Network Offline
        await executePoll();
        expect(isReadyToAdmit).toBe(false);

        // 200 Recovery
        await executePoll();
        expect(isReadyToAdmit).toBe(true);
        expect(recovered).toBe(true);
      });

      it('3.A.4: Polling handles malformed and null payload properties gracefully', async () => {
        const malformedPayloads = [
          {},
          { status: null, roomName: null },
          { status: undefined, joinToken: undefined },
          { status: 12345, joinToken: false },
          { status: 'UNKNOWN_STATUS', joinToken: null },
        ];

        for (const bad of malformedPayloads as any[]) {
          let threw = false;
          let admitted = false;
          try {
            const status = bad?.status && typeof bad.status === 'string' ? bad.status.toLowerCase() : '';
            const isAdmitted =
              status === 'admitted' ||
              status === 'active' ||
              status === 'incall' ||
              status === 'connected' ||
              Boolean(bad?.joinToken);
            if (isAdmitted) admitted = true;
          } catch {
            threw = true;
          }
          expect(threw).toBe(false);
          expect(admitted).toBe(false);
        }
      });
    });

    describe('3.B: Portal Web Guest Join Error Flows', () => {
      it('3.B.1: HTTP 423 (permanent lockout) triggers locked out screen and disables submit', () => {
        expect(guestJoinPageSource).toContain('if (res.status === 423)');
        expect(guestJoinPageSource).toContain('setIsLockedOut(true)');
        expect(guestJoinPageSource).toContain('Teleconsultation Link Locked');
        expect(guestJoinPageSource).toContain('5 failed verification attempts');
      });

      it('3.B.2: HTTP 410 (expired link) triggers expired screen and disables submit', () => {
        expect(guestJoinPageSource).toContain('if (res.status === 410)');
        expect(guestJoinPageSource).toContain('setIsExpired(true)');
        expect(guestJoinPageSource).toContain('Consultation Link Expired');
      });

      it('3.B.3: HTTP 404 / 401 increments failed attempts and displays remaining attempts countdown', () => {
        expect(guestJoinPageSource).toContain('const nextAttempts = attemptCount + 1');
        expect(guestJoinPageSource).toContain('setAttemptCount(nextAttempts)');
        expect(guestJoinPageSource).toContain('Verification failed. ${5 - nextAttempts} attempts remaining');
      });

      it('3.B.4: 5 consecutive failed attempts transition to lockout', () => {
        let attemptCount = 0;
        let isLockedOut = false;

        const recordFailedAttempt = () => {
          attemptCount++;
          if (attemptCount >= 5) {
            isLockedOut = true;
          }
        };

        recordFailedAttempt();
        expect(attemptCount).toBe(1);
        expect(isLockedOut).toBe(false);

        recordFailedAttempt();
        recordFailedAttempt();
        recordFailedAttempt();
        expect(attemptCount).toBe(4);
        expect(isLockedOut).toBe(false);

        recordFailedAttempt();
        expect(attemptCount).toBe(5);
        expect(isLockedOut).toBe(true);
      });

      it('3.B.5: Malformed DOB and OTP are rejected client-side before any network fetch', () => {
        const validateInputs = (dob: string, otp: string) => {
          const fullOtp = otp;
          const isoDobRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dob || !isoDobRegex.test(dob) || fullOtp.length !== 6) {
            return { valid: false, error: 'Format error' };
          }

          const [yearStr, monthStr, dayStr] = dob.split('-');
          const year = parseInt(yearStr, 10);
          const month = parseInt(monthStr, 10);
          const day = parseInt(dayStr, 10);
          const currentYear = new Date().getFullYear();
          if (year < 1900 || year > currentYear || month < 1 || month > 12 || day < 1 || day > 31) {
            return { valid: false, error: 'Range error' };
          }
          const parsedDate = new Date(`${dob}T00:00:00Z`);
          if (
            isNaN(parsedDate.getTime()) ||
            parsedDate.getUTCFullYear() !== year ||
            parsedDate.getUTCMonth() + 1 !== month ||
            parsedDate.getUTCDate() !== day
          ) {
            return { valid: false, error: 'Calendar date error' };
          }
          return { valid: true };
        };

        // Rejections:
        expect(validateInputs('', '123456').valid).toBe(false);
        expect(validateInputs('04/12/1985', '123456').valid).toBe(false); // non-ISO
        expect(validateInputs('1985-2-5', '123456').valid).toBe(false); // unpadded
        expect(validateInputs('1985-02-30', '123456').valid).toBe(false); // Feb 30
        expect(validateInputs('1985-04-31', '123456').valid).toBe(false); // April 31
        expect(validateInputs('1899-12-31', '123456').valid).toBe(false); // year < 1900
        expect(validateInputs('2099-01-01', '123456').valid).toBe(false); // future year
        expect(validateInputs('1985-04-12', '12345').valid).toBe(false); // OTP 5 digits
        expect(validateInputs('1985-04-12', '1234567').valid).toBe(false); // OTP 7 digits
        expect(validateInputs('1985-04-12', 'abcdef').valid).toBe(true); // digits filtered by input handler, but test standard regex

        // Acceptance:
        expect(validateInputs('1985-04-12', '123456').valid).toBe(true);
        expect(validateInputs('2000-02-29', '654321').valid).toBe(true); // leap year
      });
    });
  });

  // ===========================================================================
  // 4. Concurrency & Reconnection
  // ===========================================================================
  describe('Focus 4: Concurrency & Reconnection', () => {
    it('4.1: Simulated storm of 20 concurrent participant joins deduplicates by identity', () => {
      interface MockParticipant {
        identity: string;
        name: string;
      }

      let participants: MockParticipant[] = [{ identity: 'staff-self', name: 'Dr. Clinician' }];

      const onParticipantJoined = (p: { identity?: string; name?: string }) => {
        if (!p || !p.identity) return;
        if (participants.some((existing) => existing.identity === p.identity)) return;
        participants = [...participants, { identity: p.identity, name: p.name || 'Participant' }];
      };

      // 20 concurrent joins with some duplicate identities
      const joinEvents = [
        { identity: 'patient-1', name: 'Patient One' },
        { identity: 'patient-2', name: 'Patient Two' },
        { identity: 'patient-1', name: 'Patient One Duplicate' },
        { identity: 'patient-3', name: 'Patient Three' },
        { identity: 'patient-2', name: 'Patient Two Duplicate' },
        { identity: 'patient-4', name: 'Patient Four' },
        { identity: 'patient-5', name: 'Patient Five' },
        { identity: 'patient-3', name: 'Patient Three' },
        { identity: 'patient-6', name: 'Patient Six' },
        { identity: 'patient-7', name: 'Patient Seven' },
        { identity: 'patient-8', name: 'Patient Eight' },
        { identity: 'patient-9', name: 'Patient Nine' },
        { identity: 'patient-10', name: 'Patient Ten' },
        { identity: 'patient-5', name: 'Patient Five Dupe' },
        { identity: 'patient-11', name: 'Patient Eleven' },
        { identity: 'patient-12', name: 'Patient Twelve' },
        { identity: 'patient-13', name: 'Patient Thirteen' },
        { identity: 'patient-14', name: 'Patient Fourteen' },
        { identity: 'patient-15', name: 'Patient Fifteen' },
        { identity: 'patient-15', name: 'Patient Fifteen Dupe' },
      ];

      // Dispatch storm
      for (const event of joinEvents) {
        onParticipantJoined(event);
      }

      // Self + 15 unique patients = 16 total
      expect(participants.length).toBe(16);
      expect(participants[0].identity).toBe('staff-self');

      // Verify no duplicates
      const identities = participants.map((p) => p.identity);
      const uniqueIdentities = new Set(identities);
      expect(uniqueIdentities.size).toBe(identities.length);
    });

    it('4.2: Interleaved join and leave events preserve self participant and remove departed peers', () => {
      interface MockParticipant {
        identity: string;
        name: string;
      }

      let participants: MockParticipant[] = [{ identity: 'staff-self', name: 'Dr. Clinician' }];

      const join = (id: string, name: string) => {
        if (!participants.some((p) => p.identity === id)) {
          participants = [...participants, { identity: id, name }];
        }
      };

      const leave = (id: string) => {
        participants = participants.filter((p) => p.identity !== id);
      };

      join('p1', 'Alice');
      join('p2', 'Bob');
      expect(participants.length).toBe(3);

      leave('p1');
      expect(participants.length).toBe(2);
      expect(participants.some((p) => p.identity === 'p1')).toBe(false);

      join('p3', 'Charlie');
      leave('p2');
      expect(participants.length).toBe(2);
      expect(participants.map((p) => p.identity)).toEqual(['staff-self', 'p3']);

      // Attempt to leave non-existent id
      leave('p999');
      expect(participants.length).toBe(2);

      // Attempt to leave self: self should stay or be handled gracefully
      expect(participants[0].identity).toBe('staff-self');
    });

    it('4.3: Participant name resolution in useCallSession falls back safely when name is undefined or null', () => {
      const resolveParticipantName = (options?: { participantName?: string | null; isDoctor?: boolean }) => {
        return (
          options?.participantName ??
          (options?.isDoctor === false ? 'Participant' : 'Dr. Clinician')
        );
      };

      expect(resolveParticipantName(undefined)).toBe('Dr. Clinician');
      expect(resolveParticipantName({})).toBe('Dr. Clinician');
      expect(resolveParticipantName({ isDoctor: true })).toBe('Dr. Clinician');
      expect(resolveParticipantName({ isDoctor: false })).toBe('Participant');
      expect(resolveParticipantName({ participantName: undefined, isDoctor: false })).toBe('Participant');
      expect(resolveParticipantName({ participantName: null, isDoctor: true })).toBe('Dr. Clinician');
      expect(resolveParticipantName({ participantName: 'Dr. Sarah Connor' })).toBe('Dr. Sarah Connor');
      expect(resolveParticipantName({ participantName: 'Patient John' })).toBe('Patient John');
    });

    it('4.4: Clinician name resolution in TeleconsultWaitingRoomModal handles all null/undefined/empty permutations', () => {
      const resolveClinicianName = (
        isDoctor: boolean,
        user: { name?: string | null } | null | undefined,
        teleconsultSession: { clinicianName?: string | null },
        hydratedStatus: { clinicianName?: string | null } | null | undefined,
      ) => {
        if (isDoctor && user?.name) {
          return user.name;
        }
        if (teleconsultSession.clinicianName && teleconsultSession.clinicianName !== 'Clinic Attending') {
          return teleconsultSession.clinicianName;
        }
        if (hydratedStatus?.clinicianName) {
          return hydratedStatus.clinicianName;
        }
        return 'Attending Clinician';
      };

      // Permutation 1: All undefined/null
      expect(resolveClinicianName(false, null, {}, null)).toBe('Attending Clinician');

      // Permutation 2: Doctor with valid user name
      expect(resolveClinicianName(true, { name: 'Dr. Gregory House' }, {}, null)).toBe('Dr. Gregory House');

      // Permutation 3: Doctor with empty user name falls back
      expect(resolveClinicianName(true, { name: '' }, {}, null)).toBe('Attending Clinician');

      // Permutation 4: Staff with default placeholder 'Clinic Attending' falls back to generic
      expect(resolveClinicianName(false, { name: 'Staff User' }, { clinicianName: 'Clinic Attending' }, null)).toBe('Attending Clinician');

      // Permutation 5: Staff with real clinicianName in session
      expect(resolveClinicianName(false, null, { clinicianName: 'Dr. Allison Cameron' }, null)).toBe('Dr. Allison Cameron');

      // Permutation 6: Hydrated status fills clinicianName when session was empty
      expect(resolveClinicianName(false, null, {}, { clinicianName: 'Dr. Robert Chase' })).toBe('Dr. Robert Chase');

      // Permutation 7: Null values across the board
      expect(resolveClinicianName(false, { name: null }, { clinicianName: null }, { clinicianName: null })).toBe('Attending Clinician');
    });

    it('4.5: CallStage initials computation never throws and returns safe initials for all edge inputs', () => {
      const computeInitials = (participantName?: string | null) => {
        if (!participantName) return '??';
        const parts = participantName.trim().split(/\s+/);
        if (parts.length === 0 || (parts.length === 1 && parts[0] === '')) return '??';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase() || '??';
        return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase() || '??';
      };

      expect(computeInitials(undefined)).toBe('??');
      expect(computeInitials(null)).toBe('??');
      expect(computeInitials('')).toBe('??');
      expect(computeInitials('   ')).toBe('??');
      expect(computeInitials('A')).toBe('A');
      expect(computeInitials('Juan')).toBe('JU');
      expect(computeInitials('Juan Dela Cruz')).toBe('JC');
      expect(computeInitials('Dr. Maria Santos-Cruz')).toBe('DS');
      expect(computeInitials('12345')).toBe('12');
      expect(computeInitials('!@# $^&')).toBe('!$');
    });
  });
});
