import {
  CommsTicketClaims,
  ConnectionState,
  ConversationDto,
  MessageAcknowledgedPayload,
  MessageDto,
  MessageStateChangedPayload,
  ParticipantJoinedPayload,
  ParticipantLeftPayload,
  ReactionUpdatedPayload,
  ThreadStateChangedPayload
} from '../types';

export interface CommsEventMap {
  connectionStateChanged: (state: ConnectionState, error?: Error) => void;
  ticketRenewed: (ticket: string, claims?: CommsTicketClaims) => void;
  messageReceived: (message: MessageDto) => void;
  messageStateChanged: (payload: MessageStateChangedPayload) => void;
  reactionUpdated: (payload: ReactionUpdatedPayload) => void;
  messageAcknowledged: (payload: MessageAcknowledgedPayload) => void;
  participantJoined: (payload: ParticipantJoinedPayload) => void;
  participantLeft: (payload: ParticipantLeftPayload) => void;
  threadStateChanged: (payload: ThreadStateChangedPayload) => void;
  conversationCreated: (conversation: ConversationDto) => void;
  conversationUpdated: (conversation: ConversationDto) => void;
  error: (error: Error) => void;
}

export type UnsubscribeFn = () => void;

export class CommsEventEmitter {
  private readonly listeners: Map<keyof CommsEventMap, Set<(...args: any[]) => void>> = new Map();

  public on<K extends keyof CommsEventMap>(event: K, listener: CommsEventMap[K]): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as (...args: any[]) => void);

    return () => {
      set.delete(listener as (...args: any[]) => void);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  public off<K extends keyof CommsEventMap>(event: K, listener: CommsEventMap[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as (...args: any[]) => void);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  public emit<K extends keyof CommsEventMap>(event: K, ...args: Parameters<CommsEventMap[K]>): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`Error in CommsEventEmitter listener for event '${String(event)}':`, err);
        }
      }
    }
  }

  public removeAllListeners(event?: keyof CommsEventMap): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
