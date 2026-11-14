import {
  IMediaRoomAdapter,
  MediaAdapterEventType,
  MediaConnectOptions,
  MediaConnectionState,
  MediaEventListener,
  RemoteMediaParticipant
} from './IMediaRoomAdapter';

export interface LocalPreviewMediaAdapterOptions {
  mockMode?: boolean;
  initialAudioEnabled?: boolean;
  initialVideoEnabled?: boolean;
  mockRemoteParticipants?: RemoteMediaParticipant[];
}

export class LocalPreviewMediaAdapter implements IMediaRoomAdapter {
  private state: MediaConnectionState = 'disconnected';
  private listeners: Map<MediaAdapterEventType, Set<MediaEventListener>> = new Map();
  private isAudioEnabled: boolean;
  private isVideoEnabled: boolean;
  private isScreenSharing = false;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private remoteParticipants: Map<string, RemoteMediaParticipant> = new Map();
  private options: LocalPreviewMediaAdapterOptions;

  constructor(options?: LocalPreviewMediaAdapterOptions) {
    this.options = options || {};
    this.isAudioEnabled = options?.initialAudioEnabled ?? true;
    this.isVideoEnabled = options?.initialVideoEnabled ?? true;
    if (options?.mockRemoteParticipants) {
      for (const p of options.mockRemoteParticipants) {
        this.remoteParticipants.set(p.identity, p);
      }
    }
  }

  get connectionState(): MediaConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(options: MediaConnectOptions): Promise<void> {
    this.state = 'connecting';
    const canUseBrowserMedia =
      !this.options.mockMode &&
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function';

    if (canUseBrowserMedia) {
      try {
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: options.audioEnabled ?? this.isAudioEnabled,
          video: options.videoEnabled ?? this.isVideoEnabled
        });
      } catch {
        this.localStream = this.createMockMediaStream();
      }
    } else {
      this.localStream = this.createMockMediaStream();
    }

    this.state = 'connected';
    this.emit('connected', options.roomName || 'preview-room');
  }

  async disconnect(): Promise<void> {
    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    this.isAudioEnabled = enabled;
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = enabled;
      }
    }
    this.emit('localTrackChanged', 'audio', enabled);
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    this.isVideoEnabled = enabled;
    if (this.localStream) {
      for (const track of this.localStream.getVideoTracks()) {
        track.enabled = enabled;
      }
    }
    this.emit('localTrackChanged', 'video', enabled);
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const canUseDisplayMedia =
        !this.options.mockMode &&
        typeof navigator !== 'undefined' &&
        typeof navigator.mediaDevices?.getDisplayMedia === 'function';

      if (canUseDisplayMedia) {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        if (this.screenStream) {
          for (const track of this.screenStream.getTracks()) {
            track.stop();
          }
        }
        this.screenStream = displayStream;
        const screenTrack = displayStream.getVideoTracks()[0];
        if (screenTrack) {
          screenTrack.onended = () => {
            if (this.screenStream) {
              for (const t of this.screenStream.getTracks()) {
                t.stop();
              }
              this.screenStream = null;
            }
            this.isScreenSharing = false;
            this.emit('localTrackChanged', 'screen', false);
          };
        }
      }

      this.isScreenSharing = true;
      this.emit('localTrackChanged', 'screen', true);
      return;
    }

    if (this.screenStream) {
      for (const track of this.screenStream.getTracks()) {
        track.stop();
      }
      this.screenStream = null;
    }
    this.isScreenSharing = false;
    this.emit('localTrackChanged', 'screen', false);
  }

  async switchCamera(_deviceId?: string): Promise<void> {
    this.emit('localTrackChanged', 'video', this.isVideoEnabled);
  }

  getLocalVideoTrack(): unknown | null {
    if (this.isScreenSharing) {
      const screenTrack = this.screenStream?.getVideoTracks()[0];
      if (screenTrack) return screenTrack;
    }
    return this.localStream?.getVideoTracks()[0] || null;
  }

  getLocalAudioTrack(): unknown | null {
    return this.localStream?.getAudioTracks()[0] || null;
  }

  getRemoteVideoTrack(participantIdentity?: string): unknown | null {
    const p = participantIdentity
      ? this.remoteParticipants.get(participantIdentity)
      : Array.from(this.remoteParticipants.values())[0];
    return p?.videoTrack || null;
  }

  getRemoteAudioTrack(participantIdentity?: string): unknown | null {
    const p = participantIdentity
      ? this.remoteParticipants.get(participantIdentity)
      : Array.from(this.remoteParticipants.values())[0];
    return p?.audioTrack || null;
  }

  getRemoteParticipants(): RemoteMediaParticipant[] {
    return Array.from(this.remoteParticipants.values());
  }

  addMockParticipant(participant: RemoteMediaParticipant): void {
    this.remoteParticipants.set(participant.identity, participant);
    this.emit('participantJoined', participant);
  }

  removeMockParticipant(participantIdentity: string): void {
    this.remoteParticipants.delete(participantIdentity);
    this.emit('participantLeft', participantIdentity);
  }

  getRecordingStream(): MediaStream | null {
    return this.localStream;
  }

  on(event: MediaAdapterEventType, listener: MediaEventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: MediaAdapterEventType, listener: MediaEventListener): void {
    this.listeners.get(event)?.delete(listener);
  }

  private emit(event: MediaAdapterEventType, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(...args);
      }
    }
  }

  private createMockMediaStream(): MediaStream | null {
    if (typeof MediaStream !== 'undefined') {
      return new MediaStream();
    }
    return {
      id: 'mock-stream-id',
      active: true,
      getTracks: () => [],
      getVideoTracks: () => [
        { id: 'mock-v-track', kind: 'video', enabled: this.isVideoEnabled, stop: () => {} }
      ],
      getAudioTracks: () => [
        { id: 'mock-a-track', kind: 'audio', enabled: this.isAudioEnabled, stop: () => {} }
      ],
      addTrack: () => {},
      removeTrack: () => {}
    } as unknown as MediaStream;
  }
}
