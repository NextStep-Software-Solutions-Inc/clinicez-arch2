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

import {
  LiveKitMediaAdapter,
} from '../src/core/media/LiveKitMediaAdapter';
import {
  LocalPreviewMediaAdapter,
} from '../src/core/media/LocalPreviewMediaAdapter';
import { CallStage as WebCallStage } from '../src/web-ui/CallStage';
import { createHookHarness, act } from './react/hook-test-harness';

let NativeCallStage: any;
beforeAll(async () => {
  const mod = await import('../src/native-ui/CallStage');
  NativeCallStage = mod.CallStage;
});

// Minimal test harness helpers
function findElement(node: any, predicate: (el: any) => boolean): any {
  if (!node) return null;
  if (predicate(node)) return node;
  if (node.props?.children) {
    const children = React.Children.toArray(node.props.children);
    for (const child of children) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

function getTextContent(node: any): string {
  if (!node) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getTextContent).join('');
  if (node.props?.children) {
    return React.Children.toArray(node.props.children).map(getTextContent).join('');
  }
  return '';
}

describe('Milestone M15 Challenger 2: Screen Sharing Reliability & Track Decoupling Adversarial Suite', () => {
  describe('Dimension 1: Decoupled Local Media Tracks (Camera vs Screen Share)', () => {
    it('LiveKitMediaAdapter: returns distinct tracks for camera and screen share without collision', () => {
      const cameraTrack = { id: 'cam-track-001', kind: 'video' };
      const screenTrack = { id: 'screen-track-002', kind: 'video' };

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map([
            [
              'cam-pub',
              { source: 'camera', track: cameraTrack, isMuted: false }
            ],
            [
              'screen-pub',
              { source: 'screen_share', track: screenTrack, isMuted: false }
            ]
          ])
        },
        remoteParticipants: new Map(),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      const localCam = adapter.getLocalCameraTrack();
      const localScreen = adapter.getLocalScreenShareTrack();
      const localVideo = adapter.getLocalVideoTrack();

      // 1. Both tracks exist
      expect(localCam).not.toBeNull();
      expect(localScreen).not.toBeNull();

      // 2. Tracks are strictly isolated and not collided
      expect(localCam).toBe(cameraTrack);
      expect(localScreen).toBe(screenTrack);
      expect(localCam).not.toBe(localScreen);

      // 3. Composite getter prioritizes screen share over camera when screen share is active
      expect(localVideo).toBe(screenTrack);
    });

    it('LiveKitMediaAdapter: falls back to camera track when screen share is disabled or muted', () => {
      const cameraTrack = { id: 'cam-track-active', kind: 'video' };

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map([
            [
              'cam-pub',
              { source: 'camera', track: cameraTrack, isMuted: false }
            ]
          ])
        },
        remoteParticipants: new Map(),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      expect(adapter.getLocalScreenShareTrack()).toBeNull();
      expect(adapter.getLocalCameraTrack()).toBe(cameraTrack);
      expect(adapter.getLocalVideoTrack()).toBe(cameraTrack);
    });

    it('LiveKitMediaAdapter: returns null for camera track when camera publication is muted', () => {
      const cameraTrack = { id: 'cam-muted', kind: 'video' };
      const screenTrack = { id: 'screen-active', kind: 'video' };

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map([
            [
              'cam-pub',
              { source: 'camera', track: cameraTrack, isMuted: true } // Camera muted
            ],
            [
              'screen-pub',
              { source: 'screen_share', track: screenTrack, isMuted: false }
            ]
          ])
        },
        remoteParticipants: new Map(),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      expect(adapter.getLocalCameraTrack()).toBeNull();
      expect(adapter.getLocalScreenShareTrack()).toBe(screenTrack);
      expect(adapter.getLocalVideoTrack()).toBe(screenTrack);
    });

    it('LocalPreviewMediaAdapter: decouples camera stream and screen stream cleanly', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.mock', token: 'mock-token' });

      // Before screen share: camera track present, screen share null
      const initialCam = adapter.getLocalCameraTrack();
      expect(initialCam).not.toBeNull();
      expect(adapter.getLocalScreenShareTrack()).toBeNull();
      expect(adapter.getLocalVideoTrack()).toBe(initialCam);

      // Enable screen share
      await adapter.setScreenShareEnabled(true);
      const activeCam = adapter.getLocalCameraTrack();
      const activeScreen = adapter.getLocalScreenShareTrack();
      const activeVideo = adapter.getLocalVideoTrack();

      expect(activeCam).not.toBeNull();
      expect(activeScreen).not.toBeNull();
      expect(activeCam).not.toBe(activeScreen);
      expect(activeVideo).toBe(activeScreen);

      // Disable screen share
      await adapter.setScreenShareEnabled(false);
      expect(adapter.getLocalScreenShareTrack()).toBeNull();
      expect(adapter.getLocalCameraTrack()).toBe(activeCam);
      expect(adapter.getLocalVideoTrack()).toBe(activeCam);

      await adapter.disconnect();
    });
  });

  describe('Dimension 2: Browser Screen Share Picker Cancellation & False Positives', () => {
    it('LiveKitMediaAdapter: cancelling picker (resolving undefined/null without track) emits NO event', async () => {
      let emitCount = 0;
      let emittedEnabled: boolean | null = null;

      const mockRoom: any = {
        localParticipant: {
          setScreenShareEnabled: async () => {
            // User pressed Cancel in browser picker -> resolves undefined without error
            return undefined;
          },
          videoTrackPublications: new Map() // No publication added
        },
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') {
          emitCount++;
          emittedEnabled = enabled as boolean;
        }
      });

      await adapter.setScreenShareEnabled(true);

      // Must strictly prevent false positives
      expect(emitCount).toBe(0);
      expect(emittedEnabled).toBeNull();
      expect(adapter.getLocalScreenShareTrack()).toBeNull();
    });

    it('LiveKitMediaAdapter: publication with muted track does not emit active screen sharing', async () => {
      let emitCount = 0;

      const mockRoom: any = {
        localParticipant: {
          setScreenShareEnabled: async () => {
            return {
              source: 'screen_share',
              isMuted: true,
              track: null // Muted / dead track
            };
          },
          videoTrackPublications: new Map([
            ['screen-pub', { source: 'screen_share', isMuted: true, track: null }]
          ])
        },
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      adapter.on('localTrackChanged', (kind) => {
        if (kind === 'screen') emitCount++;
      });

      await adapter.setScreenShareEnabled(true);
      expect(emitCount).toBe(0);
    });
  });

  describe('Dimension 3: Native Browser / OS "Stop Sharing" Bar Integration', () => {
    it('LiveKitMediaAdapter: fires screen=false when MediaStreamTrack "ended" event triggers via addEventListener', () => {
      let endedListener: (() => void) | null = null;
      const mockMediaStreamTrack: any = {
        addEventListener: (event: string, handler: () => void) => {
          if (event === 'ended') endedListener = handler;
        }
      };

      const roomEvents = new Map<string, Function>();
      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map()
        },
        remoteParticipants: new Map(),
        on: (evt: string, fn: Function) => roomEvents.set(evt, fn),
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      (adapter as any).wireRoomEvents(mockRoom);

      const stateTransitions: boolean[] = [];
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') stateTransitions.push(enabled as boolean);
      });

      // Simulate LiveKit LocalTrackPublished with screen_share
      const pubHandler = roomEvents.get('localTrackPublished');
      expect(pubHandler).toBeDefined();

      pubHandler!({
        source: 'screen_share',
        track: {
          mediaStreamTrack: mockMediaStreamTrack
        }
      });

      expect(stateTransitions).toEqual([true]);
      expect(endedListener).not.toBeNull();

      // User clicks OS native "Stop Sharing" button
      endedListener!();

      // Must immediately reset screen sharing state to false
      expect(stateTransitions).toEqual([true, false]);
    });

    it('LiveKitMediaAdapter: attaches onended fallback when addEventListener is missing', () => {
      const mockTrackWithoutAddEventListener: any = {
        onended: null
      };

      const roomEvents = new Map<string, Function>();
      const mockRoom: any = {
        localParticipant: { videoTrackPublications: new Map() },
        remoteParticipants: new Map(),
        on: (evt: string, fn: Function) => roomEvents.set(evt, fn),
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      (adapter as any).wireRoomEvents(mockRoom);

      const stateTransitions: boolean[] = [];
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') stateTransitions.push(enabled as boolean);
      });

      const pubHandler = roomEvents.get('localTrackPublished');
      pubHandler!({
        source: 'screen_share',
        track: mockTrackWithoutAddEventListener
      });

      expect(stateTransitions).toEqual([true]);
      expect(typeof mockTrackWithoutAddEventListener.onended).toBe('function');

      // Trigger fallback onended
      mockTrackWithoutAddEventListener.onended();
      expect(stateTransitions).toEqual([true, false]);
    });

    it('LiveKitMediaAdapter: does not attach duplicate ended listeners for same track reference', () => {
      let listenerCount = 0;
      const mockTrack: any = {
        addEventListener: (event: string) => {
          if (event === 'ended') listenerCount++;
        }
      };

      const adapter = new LiveKitMediaAdapter({ room: { on: () => {} } as any, skipEnvironmentCheck: true });
      (adapter as any).attachTrackEndedListener(mockTrack);
      (adapter as any).attachTrackEndedListener(mockTrack);
      (adapter as any).attachTrackEndedListener(mockTrack);

      expect(listenerCount).toBe(1);
    });
  });

  describe('Dimension 4: UI Stage Promotion, Local PiP Aspect Ratio & Banner', () => {
    it('WebCallStage: switches PiP canvas to landscape aspect-video and renders banner-screen-sharing when sharing', () => {
      let stopSharingInvoked = false;
      const harness = createHookHarness(() =>
        WebCallStage({
          callId: 'call-screen-test',
          roomName: 'call-screen-room',
          userRole: 'Clinician',
          participantName: 'Maria Santos',
          isMicEnabled: true,
          isCameraEnabled: true,
          isScreenSharing: true, // Screen sharing ACTIVE
          onToggleScreenShare: () => {
            stopSharingInvoked = true;
          },
          videoOrientation: 'portrait', // Normally portrait, but screen sharing forces landscape PiP
          onEndCall: () => {}
        })
      );

      const element = harness.result.current;

      // 1. Screen sharing banner rendered
      const banner = findElement(
        element,
        (el) => el.props?.['data-testid'] === 'banner-screen-sharing'
      );
      expect(banner).not.toBeNull();
      expect(getTextContent(banner)).toContain('You are sharing your screen');

      // 2. Stop Sharing button present inside banner
      const stopBtn = findElement(
        banner,
        (el) => typeof el.props?.onClick === 'function' && getTextContent(el).includes('Stop Sharing')
      );
      expect(stopBtn).not.toBeNull();
      stopBtn.props.onClick();
      expect(stopSharingInvoked).toBe(true);

      // 3. PiP container is switched to aspect-video (landscape)
      const pipContainer = findElement(
        element,
        (el) => el.props?.className && el.props.className.includes('aspect-video')
      );
      expect(pipContainer).not.toBeNull();
      harness.unmount();
    });

    it('NativeCallStage: renders banner-screen-sharing and pipCanvasLandscape style when sharing', () => {
      let stopSharingInvoked = false;
      const harness = createHookHarness(() =>
        NativeCallStage({
          callId: 'call-screen-test-native',
          roomName: 'call-screen-room-native',
          userRole: 'Clinician',
          participantName: 'Maria Santos',
          isMicEnabled: true,
          isCameraEnabled: true,
          isScreenSharing: true,
          onToggleScreenShare: () => {
            stopSharingInvoked = true;
          },
          videoOrientation: 'portrait',
          onEndCall: () => {}
        })
      );

      const element = harness.result.current;

      // 1. Banner testID
      const banner = findElement(
        element,
        (el) => el.props?.testID === 'banner-screen-sharing'
      );
      expect(banner).not.toBeNull();
      expect(getTextContent(banner)).toContain('You are sharing your screen');

      // 2. Stop Sharing button
      const stopBtn = findElement(
        banner,
        (el) => el.props?.accessibilityLabel === 'Stop Sharing'
      );
      expect(stopBtn).not.toBeNull();
      stopBtn.props.onPress();
      expect(stopSharingInvoked).toBe(true);
      harness.unmount();
    });

    it('WebCallStage: hides banner-screen-sharing when isScreenSharing is false', () => {
      const harness = createHookHarness(() =>
        WebCallStage({
          callId: 'call-screen-test',
          roomName: 'call-screen-room',
          userRole: 'Clinician',
          participantName: 'Maria Santos',
          isMicEnabled: true,
          isCameraEnabled: true,
          isScreenSharing: false, // NOT sharing
          onEndCall: () => {}
        })
      );

      const banner = findElement(
        harness.result.current,
        (el) => el.props?.['data-testid'] === 'banner-screen-sharing'
      );
      expect(banner).toBeNull();
      harness.unmount();
    });
  });

  describe('Dimension 5: Remote Screen Share Prioritization', () => {
    it('LiveKitMediaAdapter: getRemoteVideoTrack strictly prioritizes remote screen share over camera', () => {
      const mockRoom: any = {
        localParticipant: { videoTrackPublications: new Map() },
        remoteParticipants: new Map([
          [
            'p1-clinician',
            {
              identity: 'p1-clinician',
              videoTrackPublications: new Map([
                ['p1-cam', { source: 'camera', track: { id: 'p1-camera-track' }, isMuted: false }]
              ])
            }
          ],
          [
            'p2-specialist',
            {
              identity: 'p2-specialist',
              videoTrackPublications: new Map([
                ['p2-cam', { source: 'camera', track: { id: 'p2-camera-track' }, isMuted: false }],
                ['p2-screen', { source: 'screen_share', track: { id: 'p2-screen-share-track' }, isMuted: false }]
              ])
            }
          ]
        ]),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      // Active screen share on p2 must be prioritized over p1's camera
      const activeVideo = adapter.getRemoteVideoTrack();
      expect(activeVideo).toEqual({ id: 'p2-screen-share-track' });
    });
  });
});
