export type MediaConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface RemoteMediaParticipant {
  identity: string;
  name?: string;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  isScreenSharing: boolean;
  joinedAt?: Date;
  videoTrack?: unknown;
  audioTrack?: unknown;
}

export interface MediaConnectOptions {
  url: string;
  token: string;
  roomName?: string;
  participantIdentity?: string;
  audioEnabled?: boolean;
  videoEnabled?: boolean;
  e2eeKey?: string;
}

export type MediaAdapterEventType =
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'reconnected'
  | 'participantJoined'
  | 'participantLeft'
  | 'trackSubscribed'
  | 'trackUnsubscribed'
  | 'localTrackChanged'
  | 'networkQualityChanged'
  | 'dataMessageReceived'
  | 'error';

export type MediaEventListener = (...args: unknown[]) => void;

export interface IMediaRoomAdapter {
  readonly connectionState: MediaConnectionState;
  connect(options: MediaConnectOptions): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  setScreenShareEnabled(enabled: boolean): Promise<void>;
  switchCamera(deviceId?: string): Promise<void>;
  getLocalVideoTrack(): unknown | null;
  getLocalAudioTrack(): unknown | null;
  getRemoteVideoTrack(participantIdentity?: string): unknown | null;
  getRemoteAudioTrack(participantIdentity?: string): unknown | null;
  getRemoteParticipants(): RemoteMediaParticipant[];
  getRecordingStream(): MediaStream | null;
  getNetworkQuality?(): 'excellent' | 'good' | 'poor' | 'reconnecting';
  sendDataMessage?(payload: string): Promise<void>;
  on(event: MediaAdapterEventType, listener: MediaEventListener): () => void;
  off(event: MediaAdapterEventType, listener: MediaEventListener): void;
}
