import { CommsEventEmitter } from '../../src/core/events/CommsEventEmitter';
import {
  ConnectionState,
  ICommsClient,
  MessageDto,
  SendMessageRequest
} from '../../src/core/types';

export class MockCommsClient implements ICommsClient {
  public readonly events: CommsEventEmitter = new CommsEventEmitter();
  public connectionState: ConnectionState = 'Connected';
  public sentMessages: SendMessageRequest[] = [];
  public joinedRooms: Set<string> = new Set();
  public leftRooms: Set<string> = new Set();
  public acknowledgedMessageIds: string[] = [];
  public confirmedDeliveryMessageIds: string[] = [];
  public sentReactions: Array<{ messageId: string; reaction: string }> = [];

  public async connect(): Promise<void> {
    this.connectionState = 'Connected';
    this.events.emit('connectionStateChanged', 'Connected');
  }

  public async disconnect(): Promise<void> {
    this.connectionState = 'Disconnected';
    this.events.emit('connectionStateChanged', 'Disconnected');
  }

  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  public async joinConversation(conversationId: string): Promise<void> {
    this.joinedRooms.add(conversationId);
  }

  public async leaveConversation(conversationId: string): Promise<void> {
    this.leftRooms.add(conversationId);
    this.joinedRooms.delete(conversationId);
  }

  public async sendMessage(request: SendMessageRequest): Promise<MessageDto> {
    this.sentMessages.push(request);
    const msg: MessageDto = {
      messageId: `srv-${request.clientMessageId}`,
      conversationId: request.conversationId,
      seq: this.sentMessages.length,
      clientMessageId: request.clientMessageId,
      senderType: 'Staff',
      senderId: 'mock-staff-1',
      senderDisplayName: 'Dr. Mock',
      contentText: request.contentText,
      visibility: request.visibility,
      requiresAcknowledgement: request.requiresAcknowledgement,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: (request.attachments as any) ?? [],
      deliveryState: 'Waiting',
      sentAtUtc: new Date().toISOString()
    };
    return msg;
  }

  public async sendReaction(messageId: string, reaction: string): Promise<void> {
    this.sentReactions.push({ messageId, reaction });
  }

  public async acknowledgeMessage(messageId: string): Promise<void> {
    this.acknowledgedMessageIds.push(messageId);
  }

  public async confirmDelivery(messageId: string): Promise<void> {
    this.confirmedDeliveryMessageIds.push(messageId);
  }

  public async getMessagesAfterSeq(conversationId: string, afterSeq: number): Promise<MessageDto[]> {
    return [];
  }
}
