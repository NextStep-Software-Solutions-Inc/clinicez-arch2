import { Room, RoomEvent, type RoomOptions } from 'livekit-client';
import {
  IMediaRoomAdapter,
  MediaAdapterEventType,
  MediaConnectOptions,
  MediaConnectionState,
  MediaEventListener,
  RemoteMediaParticipant
} from './IMediaRoomAdapter';

const ZERO_PHI_ROOM_REGEX = /^call-[0-9a-fA-F\-]{32,36}$/;
const ZERO_PHI_IDENTITY_REGEX = /^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$/;

export function isWebRtcSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof RTCPeerConnection !== 'undefined'
  );
}

export interface LiveKitMediaAdapterOptions {
  room?: Room;
  roomOptions?: RoomOptions;
  skipEnvironmentCheck?: boolean;
}

export class LiveKitMediaAdapter implements IMediaRoomAdapter {
  private room: Room | null = null;
  private state: MediaConnectionState = 'disconnected';
  private networkQuality: 'excellent' | 'good' | 'poor' | 'reconnecting' = 'good';
  private participantQualities: Map<string, 'excellent' | 'good' | 'poor'> = new Map();
  private listeners: Map<MediaAdapterEventType, Set<MediaEventListener>> = new Map();
  private isSupported: boolean;

  constructor(options?: LiveKitMediaAdapterOptions) {
    this.isSupported = options?.skipEnvironmentCheck || isWebRtcSupported();
    if (options?.room) {
      this.room = options.room;
    } else if (this.isSupported) {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        ...options?.roomOptions
      });
    }
  }

  get connectionState(): MediaConnectionState {
    return this.state;
  }

  getNetworkQuality(): 'excellent' | 'good' | 'poor' | 'reconnecting' {
    return this.networkQuality;
  }

  async sendDataMessage(payload: string): Promise<void> {
    if (!this.room?.localParticipant) return;
    const encoded = typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(payload) : null;
    if (!encoded) return;
    await (this.room.localParticipant as { publishData?: (data: Uint8Array, opts?: unknown) => Promise<void> })
      .publishData?.(encoded, { reliable: true });
  }

  isConnected(): boolean {
    return this.state === 'connected';
  }

  async connect(options: MediaConnectOptions): Promise<void> {
    if (options.roomName && !ZERO_PHI_ROOM_REGEX.test(options.roomName)) {
      throw new Error(
        `Invalid LiveKit room name: "${options.roomName}". Must match zero-PHI pattern ^call-[0-9a-fA-F\\-]{32,36}$.`
      );
    }
    if (options.participantIdentity && !ZERO_PHI_IDENTITY_REGEX.test(options.participantIdentity)) {
      throw new Error(
        `Invalid LiveKit identity: "${options.participantIdentity}". Must match zero-PHI pattern.`
      );
    }

    if (!this.room) {
      throw new Error(
        'WebRTC runtime environment is not supported in this runtime. Use LocalPreviewMediaAdapter for testing.'
      );
    }

    this.state = 'connecting';
    this.wireRoomEvents(this.room);

    try {
      await this.room.connect(options.url, options.token);
      this.state = 'connected';

      if (options.audioEnabled ?? true) {
        await this.room.localParticipant.setMicrophoneEnabled(true);
      }
      if (options.videoEnabled ?? true) {
        await this.room.localParticipant.setCameraEnabled(true);
      }

      this.emit('connected', options.roomName || this.room.name);
    } catch (err) {
      this.state = 'failed';
      this.emit('error', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    if (this.room) {
      await this.room.disconnect();
    }
    this.state = 'disconnected';
    this.emit('disconnected');
  }

  async setMicrophoneEnabled(enabled: boolean): Promise<void> {
    if (this.room?.localParticipant) {
      await this.room.localParticipant.setMicrophoneEnabled(enabled);
      this.emit('localTrackChanged', 'audio', enabled);
    }
  }

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (this.room?.localParticipant) {
      await this.room.localParticipant.setCameraEnabled(enabled);
      this.emit('localTrackChanged', 'video', enabled);
    }
  }

  async setScreenShareEnabled(enabled: boolean): Promise<void> {
    if (this.room?.localParticipant) {
      await this.room.localParticipant.setScreenShareEnabled(enabled);
      this.emit('localTrackChanged', 'screen', enabled);
    }
  }

  async switchCamera(deviceId?: string): Promise<void> {
    if (this.room && deviceId) {
      await this.room.switchActiveDevice('videoinput', deviceId);
    }
  }

  getLocalVideoTrack(): unknown | null {
    if (!this.room?.localParticipant) return null;
    const pubs = Array.from(this.room.localParticipant.videoTrackPublications.values());
    const screenPub = pubs.find((pub) => (pub as { source?: string }).source === 'screen_share' && pub.track && !pub.isMuted);
    if (screenPub?.track) return screenPub.track;
    const camPub = pubs.find((pub) => pub.track && !pub.isMuted);
    return camPub?.track || null;
  }

  getLocalAudioTrack(): unknown | null {
    if (!this.room?.localParticipant) return null;
    const pub = Array.from(this.room.localParticipant.audioTrackPublications.values())[0];
    return pub?.track || null;
  }

  getRemoteVideoTrack(participantIdentity?: string): unknown | null {
    if (!this.room) return null;
    const participants = Array.from(this.room.remoteParticipants.values());
    const participant = participantIdentity
      ? participants.find((p) => p.identity === participantIdentity)
      : participants[0];
    if (!participant) return null;
    const pubs = Array.from(participant.videoTrackPublications.values());
    const screenPub = pubs.find((pub) => (pub as { source?: string }).source === 'screen_share' && pub.track && !pub.isMuted);
    if (screenPub?.track) return screenPub.track;
    const camPub = pubs.find((pub) => pub.track && !pub.isMuted);
    return camPub?.track || null;
  }

  getRemoteAudioTrack(participantIdentity?: string): unknown | null {
    if (!this.room) return null;
    const participants = Array.from(this.room.remoteParticipants.values());
    const participant = participantIdentity
      ? participants.find((p) => p.identity === participantIdentity)
      : participants[0];
    if (!participant) return null;
    const pub = Array.from(participant.audioTrackPublications.values())[0];
    return pub?.track || null;
  }

  getRemoteParticipants(): RemoteMediaParticipant[] {
    if (!this.room) return [];
    return Array.from(this.room.remoteParticipants.values()).map((p) => ({
      identity: p.identity,
      name: p.name,
      isAudioEnabled: p.isMicrophoneEnabled,
      isVideoEnabled: p.isCameraEnabled,
      isScreenSharing: p.isScreenShareEnabled,
      joinedAt: p.joinedAt
    }));
  }

  getRecordingStream(): MediaStream | null {
    if (typeof MediaStream === 'undefined' || !this.room?.localParticipant) {
      return null;
    }
    const stream = new MediaStream();
    const vTrack = this.getLocalVideoTrack() as { mediaStreamTrack?: MediaStreamTrack } | null;
    const aTrack = this.getLocalAudioTrack() as { mediaStreamTrack?: MediaStreamTrack } | null;
    if (vTrack?.mediaStreamTrack) stream.addTrack(vTrack.mediaStreamTrack);
    if (aTrack?.mediaStreamTrack) stream.addTrack(aTrack.mediaStreamTrack);
    return stream.getTracks().length > 0 ? stream : null;
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

  private updateOverallNetworkQuality(): void {
    if (this.state === 'reconnecting') {
      this.networkQuality = 'reconnecting';
      this.emit('networkQualityChanged', 'reconnecting');
      return;
    }
    const qualities = Array.from(this.participantQualities.values());
    let next: 'excellent' | 'good' | 'poor' = 'good';
    if (qualities.includes('poor')) {
      next = 'poor';
    } else if (qualities.length > 0 && qualities.every((q) => q === 'excellent')) {
      next = 'excellent';
    }
    if (next !== this.networkQuality) {
      this.networkQuality = next;
      this.emit('networkQualityChanged', next);
    }
  }

  private wireRoomEvents(room: Room): void {
    room.on(RoomEvent.Connected, () => {
      this.state = 'connected';
      this.networkQuality = 'good';
      this.emit('networkQualityChanged', 'good');
      this.emit('connected', room.name);
    });
    room.on(RoomEvent.Disconnected, () => {
      this.state = 'disconnected';
      this.participantQualities.clear();
      this.emit('disconnected');
    });
    room.on(RoomEvent.Reconnecting, () => {
      this.state = 'reconnecting';
      this.networkQuality = 'reconnecting';
      this.emit('networkQualityChanged', 'reconnecting');
      this.emit('reconnecting');
    });
    room.on(RoomEvent.Reconnected, () => {
      this.state = 'connected';
      this.updateOverallNetworkQuality();
      this.emit('reconnected');
    });
    room.on(RoomEvent.ParticipantConnected, (p) => {
      this.emit('participantJoined', {
        identity: p.identity,
        name: p.name,
        isAudioEnabled: p.isMicrophoneEnabled,
        isVideoEnabled: p.isCameraEnabled,
        isScreenSharing: p.isScreenShareEnabled,
        joinedAt: p.joinedAt
      });
    });
    room.on(RoomEvent.ParticipantDisconnected, (p) => {
      this.participantQualities.delete(p.identity);
      this.updateOverallNetworkQuality();
      this.emit('participantLeft', p.identity);
    });
    room.on(RoomEvent.TrackSubscribed, (track, pub, p) => {
      this.emit('trackSubscribed', track, pub, {
        identity: p.identity,
        name: p.name,
        isAudioEnabled: p.isMicrophoneEnabled,
        isVideoEnabled: p.isCameraEnabled,
        isScreenSharing: p.isScreenShareEnabled
      });
    });
    room.on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
      this.emit('trackUnsubscribed', track, pub, {
        identity: p.identity,
        name: p.name,
        isAudioEnabled: p.isMicrophoneEnabled,
        isVideoEnabled: p.isCameraEnabled,
        isScreenSharing: p.isScreenShareEnabled
      });
    });
    if (RoomEvent.TrackMuted) {
      room.on(RoomEvent.TrackMuted, (pub, p) => {
        this.emit('trackUnsubscribed', (pub as { track?: unknown })?.track, pub, {
          identity: (p as { identity?: string })?.identity || '',
          name: (p as { name?: string })?.name
        });
      });
    }
    if (RoomEvent.TrackUnmuted) {
      room.on(RoomEvent.TrackUnmuted, (pub, p) => {
        this.emit('trackSubscribed', (pub as { track?: unknown })?.track, pub, {
          identity: (p as { identity?: string })?.identity || '',
          name: (p as { name?: string })?.name
        });
      });
    }
    if (RoomEvent.TrackStreamStateChanged) {
      room.on(RoomEvent.TrackStreamStateChanged, (pub, streamState, p) => {
        const paused = String(streamState ?? '').toLowerCase() === 'paused';
        this.emit(paused ? 'trackUnsubscribed' : 'trackSubscribed', (pub as { track?: unknown })?.track, pub, {
          identity: (p as { identity?: string })?.identity || '',
          name: (p as { name?: string })?.name
        });
      });
    }
    if (RoomEvent.ConnectionQualityChanged) {
      room.on(RoomEvent.ConnectionQualityChanged, (quality, p) => {
        const raw = String(quality ?? '').toLowerCase();
        const mapped: 'excellent' | 'good' | 'poor' =
          raw === 'poor' || raw === 'lost' || raw === '0' || raw === '1'
            ? 'poor'
            : raw === 'excellent' || raw === '3'
              ? 'excellent'
              : 'good';
        const key = (p as { identity?: string })?.identity || '__local__';
        this.participantQualities.set(key, mapped);
        this.updateOverallNetworkQuality();
      });
    }
    if (RoomEvent.LocalTrackUnpublished) {
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if ((pub as { source?: string })?.source === 'screen_share') {
          this.emit('localTrackChanged', 'screen', false);
        }
      });
    }
    if (RoomEvent.DataReceived) {
      room.on(RoomEvent.DataReceived, (payload, p) => {
        try {
          const text = typeof TextDecoder !== 'undefined' ? new TextDecoder().decode(payload) : String(payload);
          this.emit('dataMessageReceived', text, (p as { identity?: string })?.identity);
        } catch {
          // Ignore malformed non-UTF8 data packets
        }
      });
    }
  }
}
