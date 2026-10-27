import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel
} from '@microsoft/signalr';
import { ExponentialBackoffRetryPolicy } from './ExponentialBackoffRetryPolicy';
import { TicketRenewalTimer, TicketProvider } from './TicketRenewalTimer';
import { CommsEventEmitter } from '../events/CommsEventEmitter';
import { ConnectionError } from '../errors';
import {
  ConnectionState,
  ConversationDto,
  DeliveryState,
  ICommsClient,
  MessageDto,
  RequestStatus,
  SendMessageRequest,
  TriageDisposition
} from '../types';

export interface CommsClientOptions {
  hubUrl: string;                             // e.g. "https://comms.clinicez.com/hubs/comms"
  ticketProvider: TicketProvider;            // Function requesting POST /api/v1/comms/ticket
  initialTicket?: string;
  logLevel?: LogLevel;
  retryPolicy?: ExponentialBackoffRetryPolicy;
}

export class SignalRConnectionManager implements ICommsClient {
  private connection: HubConnection;
  private readonly renewalTimer: TicketRenewalTimer;
  public readonly events: CommsEventEmitter = new CommsEventEmitter();
  private readonly activeConversations: Set<string> = new Set();
  private isConnecting: boolean = false;

  constructor(private readonly options: CommsClientOptions) {
    this.renewalTimer = new TicketRenewalTimer(options.ticketProvider, {
      onTicketRenewed: (ticket, claims) => {
        this.events.emit('ticketRenewed', ticket, claims);
      },
      onRenewalError: (err) => {
        this.events.emit('error', err);
      }
    });

    const retryPolicy = options.retryPolicy ?? new ExponentialBackoffRetryPolicy();

    this.connection = new HubConnectionBuilder()
      .withUrl(options.hubUrl, {
        accessTokenFactory: () => this.renewalTimer.getActiveTicket() ?? options.initialTicket ?? ''
      })
      .withAutomaticReconnect(retryPolicy)
      .configureLogging(options.logLevel ?? LogLevel.Warning)
      .build();

    this.registerConnectionHooks();
    this.registerHubEventHandlers();
  }

  public async connect(): Promise<void> {
    if (this.connection.state === HubConnectionState.Connected) return;
    if (this.isConnecting) return;

    this.isConnecting = true;
    try {
      // Start proactive ticket renewal before handshake
      await this.renewalTimer.start(this.options.initialTicket);

      this.events.emit('connectionStateChanged', 'Connecting');
      await this.connection.start();
      this.events.emit('connectionStateChanged', 'Connected');

      // Rejoin any previously active conversations
      for (const convId of this.activeConversations) {
        try {
          await this.connection.invoke('JoinConversation', convId);
        } catch (e) {
          this.events.emit('error', e instanceof Error ? e : new Error(String(e)));
        }
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.events.emit('connectionStateChanged', 'Disconnected', error);
      throw new ConnectionError(error.message, error);
    } finally {
      this.isConnecting = false;
    }
  }

  public async disconnect(): Promise<void> {
    this.renewalTimer.stop();
    if (this.connection.state !== HubConnectionState.Disconnected) {
      await this.connection.stop();
    }
    this.activeConversations.clear();
    this.events.emit('connectionStateChanged', 'Disconnected');
  }

  public getConnectionState(): ConnectionState {
    switch (this.connection.state) {
      case HubConnectionState.Connected: return 'Connected';
      case HubConnectionState.Connecting: return 'Connecting';
      case HubConnectionState.Reconnecting: return 'Reconnecting';
      case HubConnectionState.Disconnected:
      default: return 'Disconnected';
    }
  }

  public async joinConversation(conversationId: string): Promise<void> {
    this.ensureConnected();
    await this.connection.invoke('JoinConversation', conversationId);
    this.activeConversations.add(conversationId);
  }

  public async leaveConversation(conversationId: string): Promise<void> {
    this.ensureConnected();
    await this.connection.invoke('LeaveConversation', conversationId);
    this.activeConversations.delete(conversationId);
  }

  public async sendMessage(request: SendMessageRequest): Promise<MessageDto> {
    this.ensureConnected();
    return await this.connection.invoke<MessageDto>('SendMessage', request);
  }

  public async sendReaction(messageId: string, reaction: string): Promise<void> {
    this.ensureConnected();
    await this.connection.invoke('SendReaction', messageId, reaction);
  }

  public async acknowledgeMessage(messageId: string): Promise<void> {
    this.ensureConnected();
    await this.connection.invoke('AcknowledgeMessage', messageId);
  }

  public async confirmDelivery(messageId: string): Promise<void> {
    this.ensureConnected();
    await this.connection.invoke('ConfirmDelivery', messageId);
  }

  public async getMessagesAfterSeq(conversationId: string, afterSeq: number): Promise<MessageDto[]> {
    this.ensureConnected();
    return await this.connection.invoke<MessageDto[]>('GetMessagesAfterSeq', conversationId, afterSeq);
  }

  public getRenewalTimer(): TicketRenewalTimer {
    return this.renewalTimer;
  }

  public getRawConnection(): HubConnection {
    return this.connection;
  }

  private registerConnectionHooks(): void {
    this.connection.onreconnecting((err) => {
      this.events.emit('connectionStateChanged', 'Reconnecting', err);
    });

    this.connection.onreconnected(async () => {
      this.events.emit('connectionStateChanged', 'Connected');
      // Resubscribe active conversation channels
      for (const convId of this.activeConversations) {
        try {
          await this.connection.invoke('JoinConversation', convId);
        } catch (e) {
          this.events.emit('error', e instanceof Error ? e : new Error(String(e)));
        }
      }
    });

    this.connection.onclose((err) => {
      this.events.emit('connectionStateChanged', 'Disconnected', err);
    });
  }

  private registerHubEventHandlers(): void {
    this.connection.on('OnMessageReceived', (message: MessageDto) => {
      this.events.emit('messageReceived', message);
    });

    this.connection.on('OnMessageStateChanged', (messageId: string, conversationId: string, state: DeliveryState, timestampUtc: string) => {
      this.events.emit('messageStateChanged', { messageId, conversationId, state, timestampUtc });
    });

    this.connection.on('OnReactionUpdated', (messageId: string, conversationId: string, reaction: string, staffId: string, staffName: string | null, isAdded: boolean, totalCount: number) => {
      this.events.emit('reactionUpdated', { messageId, conversationId, reaction, staffId, staffName, isAdded, totalCount });
    });

    this.connection.on('OnMessageAcknowledged', (messageId: string, conversationId: string, accountId: string, accountName: string, acknowledgedAtUtc: string) => {
      this.events.emit('messageAcknowledged', { messageId, conversationId, accountId, accountName, acknowledgedAtUtc });
    });

    this.connection.on('OnParticipantJoined', (conversationId: string, participantId: string, displayName: string, role: string) => {
      this.events.emit('participantJoined', { conversationId, participantId, displayName, role });
    });

    this.connection.on('OnParticipantLeft', (conversationId: string, participantId: string, displayName: string) => {
      this.events.emit('participantLeft', { conversationId, participantId, displayName });
    });

    this.connection.on('OnThreadStateChanged', (conversationId: string, newStatus: RequestStatus, disposition?: TriageDisposition, assignedStaffId?: string, assignedStaffName?: string) => {
      this.events.emit('threadStateChanged', { conversationId, newStatus, disposition, assignedStaffId, assignedStaffName });
    });

    this.connection.on('OnConversationCreated', (conversation: ConversationDto) => {
      this.events.emit('conversationCreated', conversation);
    });

    this.connection.on('OnConversationUpdated', (conversation: ConversationDto) => {
      this.events.emit('conversationUpdated', conversation);
    });
  }

  private ensureConnected(): void {
    if (this.connection.state !== HubConnectionState.Connected) {
      throw new ConnectionError(`Cannot execute hub operation: connection state is '${this.getConnectionState()}'.`);
    }
  }
}
