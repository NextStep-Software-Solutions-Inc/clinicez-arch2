import { describe, expect, it } from 'bun:test';
import {
  isWebRtcSupported,
  LiveKitMediaAdapter
} from '../src/core/media/LiveKitMediaAdapter';
import {
  LocalPreviewMediaAdapter
} from '../src/core/media/LocalPreviewMediaAdapter';
import {
  getBestSupportedMimeType,
  RecordedSegment,
  SegmentRecorder
} from '../src/core/media/SegmentRecorder';
import {
  sizes
} from '@clinicez/design-tokens';

describe('Challenger 2: Milestone 4 Media Adapters & UI Guardrails Adversarial Stress Suite', () => {
  // =========================================================================
  // DIMENSION 1: ZERO-PHI ROOM & PARTICIPANT IDENTITY VALIDATION
  // =========================================================================
  describe('Dimension 1: Zero-PHI Room & Participant Identity Validation', () => {
    describe('1.1 Adversarial Room Name Attack Matrix (Must Strictly Reject)', () => {
      const maliciousRoomNames = [
        // Direct PHI room names
        'patient-john-doe',
        'patient-jane-smith-123',
        'consultation-dr-smith',
        'room-juan-delacruz',
        'appointment-maria-clara',
        'dr-santos-clinic-teleconsult',

        // Malformed prefixes / Missing 'call-'
        'room-123',
        'call',
        'call-',
        'call-123',
        'call-0193167b',
        'call-0193167b-4029-73ec-80a2',
        'call-short-uuid',

        // Exceeding length (> 36 chars in hex-uuid section)
        'call-0193167b-4029-73ec-80a2-20f56a5ba195-extra-suffix',
        'call-0193167b402973ec80a220f56a5ba195000000000',

        // Non-hex characters
        'call-0193167b-4029-73ec-80a2-20f56a5ba19g',
        'call-0193167b-4029-73ec-80a2-20f56a5ba19z',
        'call-0193167b_4029_73ec_80a2_20f56a5ba195', // Underscores invalid in room UUID

        // Casing and Whitespace attacks
        'CALL-0193167B-4029-73EC-80A2-20F56A5BA195', // Uppercase prefix
        'Call-0193167b-4029-73ec-80a2-20f56a5ba195', // Titlecase prefix
        ' call-0193167b-4029-73ec-80a2-20f56a5ba195', // Leading whitespace
        'call-0193167b-4029-73ec-80a2-20f56a5ba195 ', // Trailing whitespace
        'call-0193167b-4029-73ec-80a2-20f56a5ba195\n', // Newline injection
        'call-0193167b-4029-73ec-80a2-20f56a5ba195\t', // Tab injection

        // Injection attacks
        'call-0193167b-4029-73ec-80a2-20f56a5ba195;DROP TABLE users;',
        'call-0193167b-4029-73ec-80a2-20f56a5ba195<script>alert(1)</script>',
        'call-0193167b-4029-73ec-80a2-20f56a5ba195/../'
      ];

      for (const badRoom of maliciousRoomNames) {
        it(`strictly rejects invalid room name: "${badRoom.slice(0, 35)}..."`, async () => {
          const adapter = new LiveKitMediaAdapter();
          await expect(
            adapter.connect({
              url: 'wss://sfu.internal.mock',
              token: 'mock-token',
              roomName: badRoom
            })
          ).rejects.toThrow(/Invalid LiveKit room name/);
        });
      }
    });

    describe('1.2 Adversarial Participant Identity Attack Matrix (Must Strictly Reject)', () => {
      const maliciousIdentities = [
        // Raw email identities (Missing valid prefix and contains @)
        'john_smith@gmail.com',
        'staff@clinicez.ph',
        'patient:john_smith@gmail.com', // Contains @
        'participant:user.name@hospital.org', // Contains @

        // Raw phone numbers (Missing prefix and invalid symbols)
        '09171234567',
        '+639171234567',
        'patient:+639171234567', // Contains +
        'staff:phone#0917', // Contains #

        // Invalid role prefixes
        'admin',
        'admin:usr-001',
        'superuser:usr-002',
        'doctor:usr-003', // Must be 'staff', not 'doctor'
        'nurse:usr-004',  // Must be 'staff', not 'nurse'
        'user:usr-005',
        'client:usr-006',
        'operator-007',

        // Missing delimiters or empty suffixes
        'staff',
        'patient',
        'guest',
        'participant',
        'staff:',
        'patient-',
        'guest:',
        'participant-',
        ':usr-123',
        '-usr-123',

        // Length overflow (> 64 chars suffix)
        `staff:${'a'.repeat(65)}`,
        `patient-${'b'.repeat(100)}`,

        // Whitespace and special symbol injections
        'staff:dr smith',
        'patient:juan dela cruz',
        'guest:user#1',
        'participant:user%20',
        'staff:usr-123;rm -rf /',
        'patient:usr-123\n',
        'staff:usr-123\0'
      ];

      for (const badIdentity of maliciousIdentities) {
        it(`strictly rejects invalid participant identity: "${badIdentity.slice(0, 35)}..."`, async () => {
          const adapter = new LiveKitMediaAdapter();
          await expect(
            adapter.connect({
              url: 'wss://sfu.internal.mock',
              token: 'mock-token',
              roomName: 'call-0193167b-4029-73ec-80a2-20f56a5ba195',
              participantIdentity: badIdentity
            })
          ).rejects.toThrow(/Invalid LiveKit identity/);
        });
      }
    });

    describe('1.3 Valid Zero-PHI Patterns Acceptance Matrix', () => {
      const validZeroPhiRooms = [
        'call-0193167b-4029-73ec-80a2-20f56a5ba195', // UUIDv7 with hyphens (36 chars)
        'call-0193167b402973ec80a220f56a5ba195',     // 32 hex chars without hyphens
        'call-9542d721-8b8b-46ea-9635-c34ef9a2bc0a', // UUIDv4
        'call-AABBCCDD-1122-3344-5566-77889900AABB', // Uppercase hex UUID
        'call-aabbccdd11223344556677889900aabb',     // Compact hex
        'call-12345678-abcd-ef01-2345-6789abcdef01'  // 36 chars standard
      ];

      const validZeroPhiIdentities = [
        'staff:usr-123',
        'staff-usr-456',
        'staff:doctor-0193167b',
        'staff-nurse_duty_01',
        'patient:usr-456',
        'patient-pt-0193167b-4029',
        'patient:anon-999',
        'guest:companion-1',
        'guest-guardian_02',
        'participant:teleconsult-session-guest',
        'participant-teleconsult_001'
      ];

      for (const room of validZeroPhiRooms) {
        for (const identity of validZeroPhiIdentities) {
          it(`accepts valid pair: room="${room.slice(0, 20)}..." identity="${identity}"`, async () => {
            // Mock Room to bypass headless WebRTC missing error
            let connectedUrl: string | null = null;
            let connectedToken: string | null = null;
            const mockRoom = {
              name: room,
              connect: async (url: string, token: string) => {
                connectedUrl = url;
                connectedToken = token;
              },
              disconnect: async () => {},
              localParticipant: {
                setMicrophoneEnabled: async () => {},
                setCameraEnabled: async () => {}
              },
              remoteParticipants: new Map(),
              on: () => {}
            } as any;

            const adapter = new LiveKitMediaAdapter({ room: mockRoom, skipEnvironmentCheck: true });

            await adapter.connect({
              url: 'wss://sfu.clinicez.internal:7880',
              token: 'jwt-token-media',
              roomName: room,
              participantIdentity: identity
            });

            expect(adapter.isConnected()).toBe(true);
            expect(connectedUrl).toBe('wss://sfu.clinicez.internal:7880');
            expect(connectedToken).toBe('jwt-token-media');
          });
        }
      }
    });
  });

  // =========================================================================
  // DIMENSION 2: SEGMENT RECORDER STRESS & RESILIENCE
  // =========================================================================
  describe('Dimension 2: SegmentRecorder Stress & Continuous Chunking', () => {
    it('handles 100 rapid start-stop cycles without leaking timers or crashing', async () => {
      const recorder = new SegmentRecorder({ mockMode: true, timesliceMs: 10000 });
      const mockStream = { id: 'stream-stress' } as unknown as MediaStream;

      for (let i = 0; i < 100; i++) {
        recorder.start(mockStream);
        expect(recorder.isRecording()).toBe(true);
        await recorder.stop();
        expect(recorder.isRecording()).toBe(false);
      }

      expect(recorder.getSegmentCount()).toBe(0);
      expect(recorder.getTotalDurationMs()).toBe(0);
    });

    it('enforces idempotent start() and stop() calls', async () => {
      const recorder = new SegmentRecorder({ mockMode: true, timesliceMs: 10000 });
      const mockStream = { id: 'stream-idempotent' } as unknown as MediaStream;

      // Multiple start calls
      recorder.start(mockStream);
      recorder.start(mockStream);
      recorder.start(mockStream);
      expect(recorder.isRecording()).toBe(true);

      // Multiple stop calls
      await recorder.stop();
      await recorder.stop();
      await recorder.stop();
      expect(recorder.isRecording()).toBe(false);
    });

    it('handles zero-duration stream gracefully (instant start and stop)', async () => {
      const recorded: RecordedSegment[] = [];
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 10000,
        onSegmentReady: (seg) => recorded.push(seg)
      });

      recorder.start({} as unknown as MediaStream);
      await recorder.stop();

      expect(recorder.isRecording()).toBe(false);
      expect(recorded.length).toBe(0);
      expect(recorder.getTotalDurationMs()).toBe(0);
    });

    it('maintains strict 0..N monotonic continuity across 50 consecutive segments', () => {
      const recorded: RecordedSegment[] = [];
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 10000,
        onSegmentReady: (seg) => {
          recorded.push(seg);
        }
      });

      recorder.start({} as unknown as MediaStream);

      const segmentCount = 50;
      for (let i = 0; i < segmentCount; i++) {
        const seg = recorder.emitMockSegment();
        expect(seg.segmentIndex).toBe(i);
      }

      expect(recorder.getSegmentCount()).toBe(segmentCount);
      expect(recorded.length).toBe(segmentCount);

      // Verify sequence continuity: no gaps, no duplicates
      for (let i = 0; i < segmentCount; i++) {
        expect(recorded[i].segmentIndex).toBe(i);
        expect(recorded[i].durationMs).toBe(10000);
        expect(recorded[i].data instanceof Uint8Array).toBe(true);
        expect(recorded[i].mimeType).toBe('video/webm');
        expect(recorded[i].timestamp).toBeGreaterThan(0);
      }

      expect(recorder.getTotalDurationMs()).toBe(segmentCount * 10000);
    });

    it('handles variable duration segments and tracks exact totalDurationMs accumulator', () => {
      const recorder = new SegmentRecorder({ mockMode: true });
      recorder.start({} as unknown as MediaStream);

      const durations = [1000, 2500, 5000, 10000, 8000, 300];
      const expectedTotal = durations.reduce((a, b) => a + b, 0);

      for (const d of durations) {
        recorder.emitMockSegment(undefined, d);
      }

      expect(recorder.getTotalDurationMs()).toBe(expectedTotal);
      expect(recorder.getSegmentCount()).toBe(durations.length);
      expect(recorder.getSegments().length).toBe(durations.length);
    });

    it('documents onSegmentReady execution semantics under error conditions', () => {
      // In SegmentRecorder, onSegmentReady is synchronously invoked.
      // If the caller provides a callback, failures inside synchronous callbacks propagate to caller.
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 10000,
        onSegmentReady: () => {
          throw new Error('Upload queue failed');
        }
      });

      recorder.start({} as unknown as MediaStream);

      expect(() => {
        recorder.emitMockSegment();
      }).toThrow('Upload queue failed');

      // The segment was nonetheless recorded in history before the callback threw
      expect(recorder.getSegmentCount()).toBe(1);
      expect(recorder.getSegments().length).toBe(1);
    });
  });

  // =========================================================================
  // DIMENSION 3: REPOSITORY GUARDRAILS EMPIRICAL VERIFICATION
  // =========================================================================
  describe('Dimension 3: Repository Guardrails Verification', () => {
    it('verifies design tokens touchTarget minimum is 44px', () => {
      expect(sizes.touchTarget).toBe(44);
      expect(sizes.touchTarget).toBeGreaterThanOrEqual(44);
    });

    it('verifies MIME type negotiation fallback matrix', () => {
      // In headless Bun where MediaRecorder is undefined
      expect(getBestSupportedMimeType()).toBe('video/webm');
      expect(getBestSupportedMimeType('video/webm;codecs=vp8,opus')).toBe('video/webm;codecs=vp8,opus');
      expect(getBestSupportedMimeType('video/mp4')).toBe('video/mp4');
    });

    it('verifies WebRTC environment detection guard prevents null dereferences', () => {
      // Bun test environment does not provide browser WebRTC globals
      expect(isWebRtcSupported()).toBe(false);

      const adapter = new LiveKitMediaAdapter();
      expect(adapter.connectionState).toBe('disconnected');
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getLocalVideoTrack()).toBeNull();
      expect(adapter.getLocalAudioTrack()).toBeNull();
      expect(adapter.getRecordingStream()).toBeNull();
      expect(adapter.getRemoteParticipants()).toEqual([]);
    });

    it('verifies LocalPreviewMediaAdapter provides mock stream fallback when WebRTC unavailable', async () => {
      const adapter = new LocalPreviewMediaAdapter();
      expect(adapter.isConnected()).toBe(false);

      await adapter.connect({ url: 'wss://mock', token: 'token' });
      expect(adapter.isConnected()).toBe(true);

      const stream = adapter.getRecordingStream();
      expect(stream).not.toBeNull();
      // In mock mode, LocalPreviewMediaAdapter provides audio and video tracks
      expect(stream?.getVideoTracks().length).toBe(1);
      expect(stream?.getAudioTracks().length).toBe(1);

      // Verify track mutations
      await adapter.setMicrophoneEnabled(false);
      expect(stream?.getAudioTracks()[0].enabled).toBe(false);
      await adapter.setMicrophoneEnabled(true);
      expect(stream?.getAudioTracks()[0].enabled).toBe(true);

      await adapter.disconnect();
      expect(adapter.isConnected()).toBe(false);
      expect(adapter.getRecordingStream()).toBeNull();
    });
  });
});
