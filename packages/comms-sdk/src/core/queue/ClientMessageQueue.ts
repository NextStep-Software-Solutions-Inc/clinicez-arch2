import {
  CommsAttachmentReference,
  DeliveryState,
  ICommsClient,
  MessageDto,
  MessageVisibility,
  SendMessageRequest
} from '../types';
import { DeliveryStateTracker } from './DeliveryStateTracker';

export interface QueuedMessage {
  clientMessageId: string;
  conversationId: string;
  contentText: string;
  visibility: MessageVisibility;
  requiresAcknowledgement: boolean;
  attachments: CommsAttachmentReference[];
  state: DeliveryState;
  enqueuedAt: number;
  lastAttemptAt?: number;
  error?: string;
  serverMessage?: MessageDto;
}

export interface IQueueStorageAdapter {
  load(): Promise<QueuedMessage[]>;
  save(messages: QueuedMessage[]): Promise<void>;
}

export class InMemoryQueueStorageAdapter implements IQueueStorageAdapter {
  private storage: QueuedMessage[] = [];
  public async load(): Promise<QueuedMessage[]> {
    return [...this.storage];
  }
  public async save(messages: QueuedMessage[]): Promise<void> {
    this.storage = [...messages];
  }
}

export class ClientMessageQueue {
  private readonly queue: Map<string, QueuedMessage> = new Map();
  private isProcessing: boolean = false;
  private isInitialized: boolean = false;

  constructor(
    private readonly client: ICommsClient,
    private readonly storageAdapter: IQueueStorageAdapter = new InMemoryQueueStorageAdapter()
  ) {
    this.initStorage();
    this.hookClientEvents();
  }

  private async initStorage(): Promise<void> {
    try {
      const saved = await this.storageAdapter.load();
      for (const msg of saved) {
        this.queue.set(msg.clientMessageId, msg);
      }
    } catch (e) {
      console.warn('Failed to load queued comms messages from storage adapter:', e);
    } finally {
      this.isInitialized = true;
    }
  }

  private hookClientEvents(): void {
    this.client.events.on('connectionStateChanged', (state) => {
      if (state === 'Connected') {
        this.processQueue();
      }
    });

    this.client.events.on('messageStateChanged', ({ messageId, state }) => {
      for (const item of this.queue.values()) {
        if (item.serverMessage?.messageId === messageId) {
          if (DeliveryStateTracker.canTransition(item.state, state)) {
            item.state = state;
            this.persist();
          }
          break;
        }
      }
    });
  }

  /**
   * Enqueues a message for transmission, generating UUIDv4 clientMessageId if not provided.
   * Optimistically returns the queued message with state = "Sending".
   */
  public async enqueue(
    params: Omit<SendMessageRequest, 'clientMessageId'> & { clientMessageId?: string }
  ): Promise<QueuedMessage> {
    const clientMessageId = params.clientMessageId ?? this.generateUUID();
    const queuedMessage: QueuedMessage = {
      clientMessageId,
      conversationId: params.conversationId,
      contentText: params.contentText,
      visibility: params.visibility ?? 'Public',
      requiresAcknowledgement: params.requiresAcknowledgement ?? false,
      attachments: (params.attachments as CommsAttachmentReference[]) ?? [],
      state: 'Sending',
      enqueuedAt: Date.now()
    };

    this.queue.set(clientMessageId, queuedMessage);
    await this.persist();

    // Trigger asynchronous dispatch if connected
    if (this.client.getConnectionState() === 'Connected') {
      this.processQueue();
    }

    return queuedMessage;
  }

  /**
   * Single-tap retry: Re-submits with the IDENTICAL ClientMessageId.
   */
  public async retry(clientMessageId: string): Promise<QueuedMessage> {
    const item = this.queue.get(clientMessageId);
    if (!item) {
      throw new Error(`Message '${clientMessageId}' not found in queue.`);
    }

    item.state = 'Sending';
    item.error = undefined;
    await this.persist();

    if (this.client.getConnectionState() === 'Connected') {
      await this.processQueue();
    }
    return item;
  }

  /**
   * Cancels and removes a pending message from queue.
   */
  public async cancel(clientMessageId: string): Promise<boolean> {
    const item = this.queue.get(clientMessageId);
    if (!item) return false;

    // Only allow cancelling if not yet confirmed as received
    if (item.state === 'Received') return false;

    this.queue.delete(clientMessageId);
    await this.persist();
    return true;
  }

  public getQueuedMessages(conversationId: string): QueuedMessage[] {
    return Array.from(this.queue.values())
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  public getAll(): QueuedMessage[] {
    return Array.from(this.queue.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  public get(clientMessageId: string): QueuedMessage | undefined {
    return this.queue.get(clientMessageId);
  }

  public async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (this.client.getConnectionState() !== 'Connected') return;

    this.isProcessing = true;
    try {
      const itemsToProcess = Array.from(this.queue.values())
        .filter((item) => item.state === 'Sending')
        .sort((a, b) => a.enqueuedAt - b.enqueuedAt);

      for (const item of itemsToProcess) {
        if (this.client.getConnectionState() !== 'Connected') break;

        try {
          item.lastAttemptAt = Date.now();
          const serverMessage = await this.client.sendMessage({
            conversationId: item.conversationId,
            clientMessageId: item.clientMessageId,
            contentText: item.contentText,
            visibility: item.visibility,
            requiresAcknowledgement: item.requiresAcknowledgement,
            attachments: item.attachments
          });

          item.serverMessage = serverMessage;
          item.state = serverMessage.deliveryState ?? 'Waiting';
          item.error = undefined;
        } catch (err: any) {
          item.error = err?.message ?? 'Transmission error';
          item.state = 'NotReceived';
        }
        await this.persist();
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async persist(): Promise<void> {
    try {
      await this.storageAdapter.save(Array.from(this.queue.values()));
    } catch (e) {
      console.warn('Failed to persist queued comms messages:', e);
    }
  }

  public generateUUID(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
