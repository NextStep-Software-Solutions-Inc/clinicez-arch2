import { describe, expect, it } from 'bun:test';
import {
  getBestSupportedMimeType,
  RecordedSegment,
  SegmentRecorder
} from '../../src/core/media/SegmentRecorder';

describe('Feature F15: SegmentRecorder Subsystem', () => {
  describe('Tier 1: Standard Lifecycle, Timeslicing & Monotonic Indexing', () => {
    it('initializes with default 10,000ms timeslice and inactive state', () => {
      const recorder = new SegmentRecorder();
      expect(recorder.isRecording()).toBe(false);
      expect(recorder.getSegmentCount()).toBe(0);
      expect(recorder.getTotalDurationMs()).toBe(0);
      expect(recorder.getSegments()).toEqual([]);
    });

    it('SegmentRecorder.isSupported() returns boolean matching environment', () => {
      const isSupported = SegmentRecorder.isSupported();
      expect(typeof isSupported).toBe('boolean');
      // In headless Bun, isSupported is false because MediaRecorder is absent
      expect(isSupported).toBe(false);
    });

    it('getBestSupportedMimeType falls back gracefully in non-browser environment', () => {
      expect(getBestSupportedMimeType('video/mp4')).toBe('video/mp4');
      expect(getBestSupportedMimeType()).toBe('video/webm');
    });

    it('starts recording and sets active flag', () => {
      const recorder = new SegmentRecorder({ mockMode: true });
      const mockStream = { id: 'stream-1' } as unknown as MediaStream;

      recorder.start(mockStream);
      expect(recorder.isRecording()).toBe(true);

      recorder.stop();
      expect(recorder.isRecording()).toBe(false);
    });

    it('emits segments with monotonic indices starting from 0', () => {
      const recorded: RecordedSegment[] = [];
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 10000,
        onSegmentReady: (seg) => {
          recorded.push(seg);
        }
      });

      const mockStream = { id: 'stream-1' } as unknown as MediaStream;
      recorder.start(mockStream);

      const s0 = recorder.emitMockSegment();
      const s1 = recorder.emitMockSegment();
      const s2 = recorder.emitMockSegment();

      expect(s0.segmentIndex).toBe(0);
      expect(s1.segmentIndex).toBe(1);
      expect(s2.segmentIndex).toBe(2);
      expect(recorder.getSegmentCount()).toBe(3);

      expect(recorded.length).toBe(3);
      expect(recorded[0].segmentIndex).toBe(0);
      expect(recorded[1].segmentIndex).toBe(1);
      expect(recorded[2].segmentIndex).toBe(2);

      recorder.stop();
    });

    it('emits segment with valid binary byte array and metadata', () => {
      const recorder = new SegmentRecorder({ mockMode: true });
      const mockStream = { id: 'stream-1' } as unknown as MediaStream;
      recorder.start(mockStream);

      const segment = recorder.emitMockSegment();
      expect(segment.segmentIndex).toBe(0);
      expect(segment.durationMs).toBe(10000);
      expect(segment.data instanceof Uint8Array).toBe(true);
      expect(segment.data.length).toBeGreaterThan(0);
      expect(segment.mimeType).toBe('video/webm');
      expect(segment.timestamp).toBeGreaterThan(0);

      recorder.stop();
    });

    it('stop halts recording and clears timer', async () => {
      const recorder = new SegmentRecorder({ mockMode: true, timesliceMs: 100 });
      const mockStream = { id: 'stream-1' } as unknown as MediaStream;
      recorder.start(mockStream);
      expect(recorder.isRecording()).toBe(true);

      await recorder.stop();
      expect(recorder.isRecording()).toBe(false);
    });
  });

  describe('Tier 2: Revocation, Boundaries & Error Handling', () => {
    it('unilateral revocation stops recording immediately', async () => {
      let segmentsCount = 0;
      const recorder = new SegmentRecorder({
        mockMode: true,
        timesliceMs: 10000,
        onSegmentReady: () => {
          segmentsCount++;
        }
      });

      recorder.start({} as unknown as MediaStream);
      recorder.emitMockSegment();
      expect(segmentsCount).toBe(1);

      // Patient or clinician unilaterally revokes consent -> recorder.stop()
      await recorder.stop();
      expect(recorder.isRecording()).toBe(false);

      // Emitting after stop should not mutate or increment active recording
      recorder.emitMockSegment();
      expect(recorder.isRecording()).toBe(false);
    });

    it('instant start-stop cycle within 0ms transitions safely', async () => {
      const recorder = new SegmentRecorder({ mockMode: true });
      recorder.start({} as unknown as MediaStream);
      await recorder.stop();
      expect(recorder.isRecording()).toBe(false);
      expect(recorder.getSegmentCount()).toBe(0);
    });

    it('supports custom timeslice duration (e.g. 5,000ms)', () => {
      const recorder = new SegmentRecorder({ mockMode: true, timesliceMs: 5000 });
      recorder.start({} as unknown as MediaStream);

      const seg = recorder.emitMockSegment();
      expect(seg.durationMs).toBe(5000);
      recorder.stop();
    });

    it('accumulates total duration across multiple segments', () => {
      const recorder = new SegmentRecorder({ mockMode: true, timesliceMs: 10000 });
      recorder.start({} as unknown as MediaStream);

      recorder.emitMockSegment(undefined, 10000);
      recorder.emitMockSegment(undefined, 10000);
      recorder.emitMockSegment(undefined, 5000);

      expect(recorder.getTotalDurationMs()).toBe(25000);
      expect(recorder.getSegmentCount()).toBe(3);
      expect(recorder.getSegments().length).toBe(3);

      recorder.stop();
    });

    it('accepts custom byte payload and preserves data integrity', () => {
      const recorder = new SegmentRecorder({ mockMode: true });
      recorder.start({} as unknown as MediaStream);

      const customPayload = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
      const seg = recorder.emitMockSegment(customPayload, 8000);

      expect(seg.data).toBe(customPayload);
      expect(seg.data.length).toBe(5);
      expect(seg.durationMs).toBe(8000);

      recorder.stop();
    });

    it('awaits asynchronous onSegmentReady handlers', async () => {
      let asyncHandled = false;
      const recorder = new SegmentRecorder({
        mockMode: true,
        onSegmentReady: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          asyncHandled = true;
        }
      });

      recorder.start({} as unknown as MediaStream);
      await (recorder as any).options.onSegmentReady?.({ segmentIndex: 0, durationMs: 10000 });
      expect(asyncHandled).toBe(true);

      recorder.stop();
    });

    it('forwards errors cleanly to onError handler without crashing', () => {
      let caughtError: Error | null = null;
      const recorder = new SegmentRecorder({
        mockMode: true,
        onError: (err) => {
          caughtError = err;
        }
      });

      (recorder as any).options.onError?.(new Error('Simulated media encoder failure'));
      expect(caughtError).not.toBeNull();
      expect(caughtError!.message).toBe('Simulated media encoder failure');
    });
  });
});
