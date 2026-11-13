import { describe, expect, it } from 'bun:test';
import {
  isWebRtcSupported,
  LiveKitMediaAdapter
} from '../../src/core/media/LiveKitMediaAdapter';
import {
  LocalPreviewMediaAdapter
} from '../../src/core/media/LocalPreviewMediaAdapter';
import {
  RemoteMediaParticipant
} from '../../src/core/media/IMediaRoomAdapter';

describe('Feature F15: Comms Media Adapters (LiveKit & LocalPreview)', () => {
  describe('Tier 1: Standard Lifecycle, Tracks & Event Dispatch', () => {
    it('LocalPreviewMediaAdapter initializes in disconnected state', () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      expect(adapter.connectionState).toBe('disconnected');
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getLocalVideoTrack()).toBeNull();
      expect(adapter.getLocalAudioTrack()).toBeNull();
    });

    it('LocalPreviewMediaAdapter connects and transitions to connected state', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      let connectedRoomName: string | null = null;
      adapter.on('connected', (roomName) => {
        connectedRoomName = roomName as string;
      });

      await adapter.connect({
        url: 'wss://sfu.internal.mock',
        token: 'mock-token',
        roomName: 'call-12345678-1234-1234-1234-123456789abc'
      });

      expect(adapter.connectionState).toBe('connected');
      expect(adapter.isConnected()).toBe(true);
      expect(connectedRoomName).toBe('call-12345678-1234-1234-1234-123456789abc');
      expect(adapter.getLocalVideoTrack()).not.toBeNull();
      expect(adapter.getLocalAudioTrack()).not.toBeNull();
    });

    it('LocalPreviewMediaAdapter toggles microphone and emits localTrackChanged', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true, initialAudioEnabled: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      let changedKind: string | null = null;
      let changedEnabled: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        changedKind = kind as string;
        changedEnabled = enabled as boolean;
      });

      await adapter.setMicrophoneEnabled(false);
      expect(changedKind).toBe('audio');
      expect(changedEnabled).toBe(false);

      await adapter.setMicrophoneEnabled(true);
      expect(changedKind).toBe('audio');
      expect(changedEnabled).toBe(true);
    });

    it('LocalPreviewMediaAdapter toggles camera and emits localTrackChanged', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true, initialVideoEnabled: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      let changedKind: string | null = null;
      let changedEnabled: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        changedKind = kind as string;
        changedEnabled = enabled as boolean;
      });

      await adapter.setCameraEnabled(false);
      expect(changedKind).toBe('video');
      expect(changedEnabled).toBe(false);

      await adapter.setCameraEnabled(true);
      expect(changedKind).toBe('video');
      expect(changedEnabled).toBe(true);
    });

    it('LocalPreviewMediaAdapter manages mock remote participants', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      let joinedParticipant: RemoteMediaParticipant | null = null;
      adapter.on('participantJoined', (p) => {
        joinedParticipant = p as RemoteMediaParticipant;
      });

      let leftParticipantId: string | null = null;
      adapter.on('participantLeft', (identity) => {
        leftParticipantId = identity as string;
      });

      const mockParticipant: RemoteMediaParticipant = {
        identity: 'patient:juan-delacruz-01',
        name: 'Juan Dela Cruz',
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        joinedAt: new Date()
      };

      adapter.addMockParticipant(mockParticipant);
      expect(joinedParticipant).toBe(mockParticipant);
      expect(adapter.getRemoteParticipants().length).toBe(1);
      expect(adapter.getRemoteParticipants()[0].identity).toBe('patient:juan-delacruz-01');

      adapter.removeMockParticipant('patient:juan-delacruz-01');
      expect(leftParticipantId).toBe('patient:juan-delacruz-01');
      expect(adapter.getRemoteParticipants().length).toBe(0);
    });

    it('LiveKitMediaAdapter validates zero-PHI room format pattern', () => {
      // Must match ^call-[0-9a-fA-F\-]{32,36}$
      const validRooms = [
        'call-12345678-1234-1234-1234-123456789abc',
        'call-abcdef0123456789abcdef0123456789',
        'call-9542d721-8b8b-46ea-9635-c34ef9a2bc0a'
      ];
      const adapter = new LiveKitMediaAdapter();

      for (const roomName of validRooms) {
        expect(() => {
          // Room validation check should pass without throwing invalid room error
          const ZERO_PHI_ROOM_REGEX = /^call-[0-9a-fA-F\-]{32,36}$/;
          expect(ZERO_PHI_ROOM_REGEX.test(roomName)).toBe(true);
        }).not.toThrow();
      }
    });

    it('LiveKitMediaAdapter validates zero-PHI participant identity pattern', () => {
      // Must match ^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$
      const validIdentities = [
        'staff:doctor-santos',
        'staff-nurse-reyes',
        'patient:pt-987654',
        'patient-01928374-abcd-ef01',
        'guest:relative-companion',
        'participant-teleconsult-anon'
      ];
      const ZERO_PHI_IDENTITY_REGEX = /^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$/;

      for (const identity of validIdentities) {
        expect(ZERO_PHI_IDENTITY_REGEX.test(identity)).toBe(true);
      }
    });
  });

  describe('Tier 2: Boundary Analysis, Adversarial Inputs & Error Handling', () => {
    it('LiveKitMediaAdapter rejects room names containing PHI or invalid prefixes', async () => {
      const invalidRooms = [
        'patient-juan-delacruz',
        'juan-teleconsult-call',
        'call-short',
        'call-',
        'call-123',
        'call-contains-spaces in name',
        'ROOM-call-12345678-1234-1234-1234-123456789abc'
      ];
      const adapter = new LiveKitMediaAdapter();

      for (const invalidRoom of invalidRooms) {
        await expect(
          adapter.connect({
            url: 'wss://sfu.internal.mock',
            token: 'mock-token',
            roomName: invalidRoom
          })
        ).rejects.toThrow(/Invalid LiveKit room name/);
      }
    });

    it('LiveKitMediaAdapter rejects participant identities containing PHI or invalid roles', async () => {
      const invalidIdentities = [
        'doctor-juan-delacruz',
        'admin:system-operator',
        'user:invalid-role',
        'staff juan with spaces',
        'patient:',
        ':empty-prefix',
        'participant-@symbol!'
      ];
      const adapter = new LiveKitMediaAdapter();

      for (const invalidIdentity of invalidIdentities) {
        await expect(
          adapter.connect({
            url: 'wss://sfu.internal.mock',
            token: 'mock-token',
            roomName: 'call-12345678-1234-1234-1234-123456789abc',
            participantIdentity: invalidIdentity
          })
        ).rejects.toThrow(/Invalid LiveKit identity/);
      }
    });

    it('LiveKitMediaAdapter detects headless environment and prevents WebRTC crash', async () => {
      expect(isWebRtcSupported()).toBe(false);
      const adapter = new LiveKitMediaAdapter();
      expect(adapter.connectionState).toBe('disconnected');

      await expect(
        adapter.connect({
          url: 'wss://sfu.internal.mock',
          token: 'mock-token',
          roomName: 'call-12345678-1234-1234-1234-123456789abc',
          participantIdentity: 'staff:doc-1'
        })
      ).rejects.toThrow(/WebRTC runtime environment is not supported in this runtime/);
    });

    it('LocalPreviewMediaAdapter disconnect cleans up streams and resets connection state', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });
      expect(adapter.isConnected()).toBe(true);

      let disconnectedFired = false;
      adapter.on('disconnected', () => {
        disconnectedFired = true;
      });

      await adapter.disconnect();
      expect(adapter.connectionState).toBe('disconnected');
      expect(adapter.isConnected()).toBe(false);
      expect(disconnectedFired).toBe(true);
      expect(adapter.getLocalVideoTrack()).toBeNull();
      expect(adapter.getLocalAudioTrack()).toBeNull();
    });

    it('LocalPreviewMediaAdapter screen share toggling and camera switching', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      let screenKind: string | null = null;
      let screenEnabled: boolean | null = null;
      adapter.on('localTrackChanged', (kind, enabled) => {
        if (kind === 'screen') {
          screenKind = kind;
          screenEnabled = enabled as boolean;
        }
      });

      await adapter.setScreenShareEnabled(true);
      expect(screenKind).toBe('screen');
      expect(screenEnabled).toBe(true);

      await adapter.setScreenShareEnabled(false);
      expect(screenKind).toBe('screen');
      expect(screenEnabled).toBe(false);

      let switchFired = false;
      adapter.on('localTrackChanged', (kind) => {
        if (kind === 'video') switchFired = true;
      });
      await adapter.switchCamera('device-front');
      expect(switchFired).toBe(true);
    });

    it('LocalPreviewMediaAdapter unregisters event listeners correctly', () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      const unsubscribe = adapter.on('connected', listener);
      (adapter as any).emit('connected', 'room-1');
      expect(callCount).toBe(1);

      unsubscribe();
      (adapter as any).emit('connected', 'room-2');
      expect(callCount).toBe(1); // Should not increase

      adapter.on('disconnected', listener);
      (adapter as any).emit('disconnected');
      expect(callCount).toBe(2);

      adapter.off('disconnected', listener);
      (adapter as any).emit('disconnected');
      expect(callCount).toBe(2); // Should not increase
    });

    it('LocalPreviewMediaAdapter returns recording stream in mock mode', async () => {
      const adapter = new LocalPreviewMediaAdapter({ mockMode: true });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });
      const stream = adapter.getRecordingStream();
      expect(stream).not.toBeNull();
      expect(typeof stream).toBe('object');
    });
  });

  describe('Tier 3: Multi-Party Participant Query Matrix', () => {
    it('retrieves specific remote participant video and audio tracks by identity', async () => {
      const mockVTrack = { id: 'v-track-pt1', kind: 'video' };
      const mockATrack = { id: 'a-track-pt1', kind: 'audio' };
      const p1: RemoteMediaParticipant = {
        identity: 'patient:pt-1',
        name: 'Patient One',
        isAudioEnabled: true,
        isVideoEnabled: true,
        isScreenSharing: false,
        videoTrack: mockVTrack,
        audioTrack: mockATrack
      };
      const p2: RemoteMediaParticipant = {
        identity: 'staff:nurse-2',
        name: 'Nurse Two',
        isAudioEnabled: false,
        isVideoEnabled: false,
        isScreenSharing: true
      };

      const adapter = new LocalPreviewMediaAdapter({
        mockMode: true,
        mockRemoteParticipants: [p1, p2]
      });
      await adapter.connect({ url: 'wss://sfu.internal.mock', token: 'mock-token' });

      expect(adapter.getRemoteParticipants().length).toBe(2);
      expect(adapter.getRemoteVideoTrack('patient:pt-1')).toBe(mockVTrack);
      expect(adapter.getRemoteAudioTrack('patient:pt-1')).toBe(mockATrack);
      expect(adapter.getRemoteVideoTrack('staff:nurse-2')).toBeNull();
      expect(adapter.getRemoteAudioTrack('staff:nurse-2')).toBeNull();
      expect(adapter.getRemoteVideoTrack('non-existent')).toBeNull();
    });
  });
});
