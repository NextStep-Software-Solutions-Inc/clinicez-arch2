import { DeliveryState, MessageDto } from '../../core/types';
import { PendingMessageRecord } from '../types';

export type StoreListener = () => void;

export class OptimisticStore {
  private readonly conversationMessages: Map<string, MessageDto[]> = new Map();
  private readonly pendingMessages: Map<string, PendingMessageRecord> = new Map();
  private readonly listeners: Set<StoreListener> = new Set();

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public getMessages(conversationId: string): MessageDto[] {
    return this.conversationMessages.get(conversationId) ?? [];
  }

  public setMessages(conversationId: string, messages: MessageDto[]): void {
    this.conversationMessages.set(conversationId, [...messages]);
    this.notify();
  }

  public appendMessage(message: MessageDto): void {
    const list = this.conversationMessages.get(message.conversationId) ?? [];
    // Deduplicate by messageId or clientMessageId
    const existingIndex = list.findIndex(
      (m) =>
        m.messageId === message.messageId ||
        (message.clientMessageId && m.clientMessageId === message.clientMessageId)
    );

    if (existingIndex >= 0) {
      list[existingIndex] = message;
    } else {
      list.push(message);
    }

    // Sort by seq, then by sentAtUtc
    list.sort((a, b) => a.seq - b.seq);
    this.conversationMessages.set(message.conversationId, list);

    // If matching a pending message that has been accepted or resolved, remove from pending
    if (message.clientMessageId && message.deliveryState !== 'Sending') {
      this.pendingMessages.delete(message.clientMessageId);
    }

    this.notify();
  }

  public updateMessageState(messageId: string, conversationId: string, state: DeliveryState): void {
    const list = this.conversationMessages.get(conversationId);
    let matchedClientMessageId: string | null | undefined;
    if (list) {
      const msg = list.find((m) => m.messageId === messageId);
      if (msg) {
        msg.deliveryState = state;
        matchedClientMessageId = msg.clientMessageId;
      }
    }

    if (matchedClientMessageId) {
      const pending = this.pendingMessages.get(matchedClientMessageId);
      if (pending) {
        pending.state = state;
      }
    } else {
      const pending = this.pendingMessages.get(messageId);
      if (pending && pending.conversationId === conversationId) {
        pending.state = state;
      }
    }

    this.notify();
  }

  public addPending(record: PendingMessageRecord): void {
    this.pendingMessages.set(record.clientMessageId, record);
    this.notify();
  }

  public updatePendingState(clientMessageId: string, state: DeliveryState, error?: string): void {
    const record = this.pendingMessages.get(clientMessageId);
    if (record) {
      record.state = state;
      if (error !== undefined) record.error = error;
      this.notify();
    }
  }

  public removePending(clientMessageId: string): void {
    this.pendingMessages.delete(clientMessageId);
    this.notify();
  }

  public getPending(conversationId?: string): PendingMessageRecord[] {
    const all = Array.from(this.pendingMessages.values());
    if (conversationId) {
      return all.filter((m) => m.conversationId === conversationId);
    }
    return all;
  }

  public clear(): void {
    this.conversationMessages.clear();
    this.pendingMessages.clear();
    this.notify();
  }
}
