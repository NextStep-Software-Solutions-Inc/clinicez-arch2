import { describe, expect, it } from 'bun:test';
import {
  LiveKitMediaAdapter
} from '../../src/core/media/LiveKitMediaAdapter';
import {
  LocalPreviewMediaAdapter
} from '../../src/core/media/LocalPreviewMediaAdapter';

describe('Feature F06-F08: Media Adapters Screen Share Reliability (TEST_INFRA Section 4)', () => {
  describe('TC-T1.2.1: Local Camera and Screen Share Track Decoupling', () => {
    it('LocalPreviewMediaAdapter: getLocalCameraTrack and getLocalScreenShareTrack return isolated publications', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true, initialVideoEnabled: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      // Before screen share is enabled
      const cameraTrackBefore = adapter.getLocalCameraTrack();
      const screenTrackBefore = adapter.getLocalScreenShareTrack();
      expect(cameraTrackBefore).not.toBeNull();
      expect(screenTrackBefore).toBeNull();

      // Enable screen share
      await adapter.setScreenShareEnabled(true);
      const cameraTrackAfter = adapter.getLocalCameraTrack();
      const screenTrackAfter = adapter.getLocalScreenShareTrack();

      expect(cameraTrackAfter).not.toBeNull();
      expect(screenTrackAfter).not.toBeNull();
      // Verifies tracks are distinct objects (decoupled)
      expect(cameraTrackAfter).not.toBe(screenTrackAfter);
      expect((screenTrackAfter as any)?.id).toBe('mock-screen-track');

      // Disable screen share
      await adapter.setScreenShareEnabled(false);
      expect(adapter.getLocalScreenShareTrack()).toBeNull();
      // Camera track remains intact
      expect(adapter.getLocalCameraTrack()).not.toBeNull();
      await adapter.disconnect();
    });

    it('LiveKitMediaAdapter: getLocalCameraTrack and getLocalScreenShareTrack return isolated publications', async () => {
      const mockCameraTrack = { id: 'livekit-cam-track-1' };
      const mockScreenTrack = { id: 'livekit-screen-track-1' };

      const videoPublications = new Map<string, any>([
        ['cam-pub', { source: 'camera', track: mockCameraTrack, isMuted: false }],
        ['screen-pub', { source: 'screen_share', track: mockScreenTrack, isMuted: false }]
      ]);

      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: videoPublications
        },
        remoteParticipants: new Map(),
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      const cameraTrack = adapter.getLocalCameraTrack();
      const screenTrack = adapter.getLocalScreenShareTrack();

      expect(cameraTrack).toBe(mockCameraTrack);
      expect(screenTrack).toBe(mockScreenTrack);
      expect(cameraTrack).not.toBe(screenTrack);
    });
  });

  describe('TC-T1.2.2 & TC-T2.2.2: Screen Share Picker Cancellation Guard', () => {
    it('LiveKitMediaAdapter: suppresses localTrackChanged("screen", true) if picker was dismissed by user clicking Cancel', async () => {
      let emittedScreenEvent: boolean | null = null;
      let emittedEvents: Array<{ kind: string; enabled: boolean }> = [];

      const mockRoom: any = {
        localParticipant: {
          setScreenShareEnabled: async () => undefined, // User cancelled picker, resolves with undefined
          videoTrackPublications: new Map() // No publication added
        },
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      adapter.on('localTrackChanged', (kind, enabled) => {
        emittedEvents.push({ kind: kind as string, enabled: enabled as boolean });
        if (kind === 'screen') emittedScreenEvent = enabled as boolean;
      });

      await adapter.setScreenShareEnabled(true);

      expect(emittedScreenEvent).toBeNull();
      expect(emittedEvents.length).toBe(0);
    });
  });

  describe('TC-T1.2.3: Native OS / Browser "Stop Sharing" Event Listener', () => {
    it('LiveKitMediaAdapter: intercepts track "ended" event and immediately emits localTrackChanged("screen", false)', () => {
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
        on: (event: string, handler: Function) => {
          roomEvents.set(event, handler);
        },
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      (adapter as any).wireRoomEvents(mockRoom);

      let lastScreenState: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') lastScreenState = enabled as boolean;
      });

      // Simulate publication of screen share
      const pubHandler = roomEvents.get('localTrackPublished');
      expect(pubHandler).toBeDefined();

      pubHandler!({
        source: 'screen_share',
        track: {
          mediaStreamTrack: mockMediaStreamTrack
        }
      });

      expect(lastScreenState).toBe(true);
      expect(endedListener).not.toBeNull();

      // Dispatch "ended" event (simulating native OS Stop button or browser top bar)
      endedListener!();
      expect(lastScreenState).toBe(false);
    });
  });

  describe('TC-T2.2.1: Browser Screen Share Permission Denied (NotAllowedError)', () => {
    it('LiveKitMediaAdapter: catches permission denied error and leaves isScreenSharing false', async () => {
      const mockRoom: any = {
        localParticipant: {
          setScreenShareEnabled: async () => {
            const err = new Error('Permission denied by system');
            err.name = 'NotAllowedError';
            throw err;
          },
          videoTrackPublications: new Map()
        },
        on: () => {},
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

      let emittedScreen: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') emittedScreen = enabled as boolean;
      });

      let caughtError: any = null;
      try {
        await adapter.setScreenShareEnabled(true);
      } catch (e) {
        caughtError = e;
      }

      // LiveKitMediaAdapter lets caller handle or catches error, but localTrackChanged(screen, true) is not fired
      expect(emittedScreen).toBeNull();
    });
  });

  describe('TC-T2.2.6: Unpublish Event on OS Window Close', () => {
    it('LiveKitMediaAdapter: localTrackUnpublished for screen_share emits localTrackChanged("screen", false)', () => {
      const roomEvents = new Map<string, Function>();
      const mockRoom: any = {
        localParticipant: {
          videoTrackPublications: new Map()
        },
        remoteParticipants: new Map(),
        on: (event: string, handler: Function) => {
          roomEvents.set(event, handler);
        },
        off: () => {}
      };

      const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });
      (adapter as any).wireRoomEvents(mockRoom);

      let lastScreenState: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') lastScreenState = enabled as boolean;
      });

      const unpubHandler = roomEvents.get('localTrackUnpublished');
      expect(unpubHandler).toBeDefined();

      unpubHandler!({
        source: 'screen_share',
        track: { id: 'unpub-track' }
      });

      expect(lastScreenState).toBe(false);
    });
  });
});
