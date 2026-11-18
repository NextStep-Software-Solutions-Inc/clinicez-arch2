export interface RecordedSegment {
  segmentIndex: number;
  durationMs: number;
  blob: Blob | null;
  data: Uint8Array;
  mimeType: string;
  timestamp: number;
}

export interface SegmentRecorderOptions {
  timesliceMs?: number;
  preferredMimeType?: string;
  onSegmentReady?: (segment: RecordedSegment) => void | Promise<void>;
  onError?: (error: Error) => void;
  mockMode?: boolean;
}

export function getBestSupportedMimeType(preferred?: string): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return preferred || 'video/webm';
  }
  const candidates = [
    preferred,
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm',
    'video/mp4;codecs=avc1,mp4a.40.2',
    'video/mp4'
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return 'video/webm';
}

export class SegmentRecorder {
  private options: SegmentRecorderOptions;
  private recorder: MediaRecorder | null = null;
  private timesliceMs: number;
  private currentSegmentIndex = 0;
  private isRecordingActive = false;
  private lastSegmentTime = 0;
  private totalDurationMs = 0;
  private segments: RecordedSegment[] = [];
  private mockIntervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options?: SegmentRecorderOptions) {
    this.options = options || {};
    this.timesliceMs = options?.timesliceMs || 10000;
  }

  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';
  }

  isRecording(): boolean {
    return this.isRecordingActive;
  }

  getSegmentCount(): number {
    return this.currentSegmentIndex;
  }

  getTotalDurationMs(): number {
    return this.totalDurationMs;
  }

  getSegments(): RecordedSegment[] {
    return [...this.segments];
  }

  start(stream: MediaStream): void {
    if (this.isRecordingActive) return;
    this.isRecordingActive = true;
    this.currentSegmentIndex = 0;
    this.totalDurationMs = 0;
    this.segments = [];
    this.lastSegmentTime = Date.now();

    const shouldUseMock = this.options.mockMode || !SegmentRecorder.isSupported();

    if (shouldUseMock) {
      this.mockIntervalTimer = setInterval(() => {
        if (!this.isRecordingActive) return;
        this.emitMockSegment();
      }, this.timesliceMs);
      return;
    }

    const mimeType = getBestSupportedMimeType(this.options.preferredMimeType);
    try {
      this.recorder = new MediaRecorder(stream, { mimeType });
      this.recorder.ondataavailable = async (event: BlobEvent) => {
        if (!event.data || event.data.size === 0) return;
        const blob = event.data;
        const arrayBuffer = await blob.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const now = Date.now();
        const durationMs = this.lastSegmentTime ? now - this.lastSegmentTime : this.timesliceMs;
        this.lastSegmentTime = now;

        const segment: RecordedSegment = {
          segmentIndex: this.currentSegmentIndex++,
          durationMs,
          blob,
          data,
          mimeType,
          timestamp: now
        };

        this.totalDurationMs += durationMs;
        this.segments.push(segment);
        await this.options.onSegmentReady?.(segment);
      };

      this.recorder.onerror = (e) => {
        this.options.onError?.(new Error(`MediaRecorder error: ${String(e)}`));
      };

      this.recorder.start(this.timesliceMs);
    } catch (err) {
      this.isRecordingActive = false;
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.isRecordingActive) return;
    this.isRecordingActive = false;

    if (this.mockIntervalTimer) {
      clearInterval(this.mockIntervalTimer);
      this.mockIntervalTimer = null;
    }

    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.stop();
      this.recorder = null;
    }
  }

  emitMockSegment(customData?: Uint8Array, customDurationMs?: number): RecordedSegment {
    const durationMs = customDurationMs || this.timesliceMs;
    const now = Date.now();
    const data = customData || new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const segment: RecordedSegment = {
      segmentIndex: this.currentSegmentIndex++,
      durationMs,
      blob: typeof Blob !== 'undefined' ? new Blob([data as BlobPart], { type: 'video/webm' }) : null,
      data,
      mimeType: 'video/webm',
      timestamp: now
    };
    this.totalDurationMs += durationMs;
    this.segments.push(segment);
    this.options.onSegmentReady?.(segment);
    return segment;
  }
}
