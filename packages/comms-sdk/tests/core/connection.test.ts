import { describe, expect, it, mock } from 'bun:test';
import { SignalRConnectionManager } from '../../src/core/connection/SignalRConnectionManager';
import { ConnectionError } from '../../src/core/errors';
import { MessageDto } from '../../src/core/types';

describe('SignalRConnectionManager', () => {
  it('initializes in Disconnected state and rejects hub calls while disconnected', async () => {
    const manager = new SignalRConnectionManager({
      hubUrl: 'https://comms.clinicez.com/hubs/comms',
      ticketProvider: async () => 'test.ticket'
    });

    expect(manager.getConnectionState()).toBe('Disconnected');

    // Trying to invoke sendMessage while disconnected throws ConnectionError
    expect(
      manager.sendMessage({
        conversationId: 'c1',
        clientMessageId: 'm1',
        contentText: 'Hello',
        visibility: 'Public',
        requiresAcknowledgement: false
      })
    ).rejects.toThrow(ConnectionError);

    expect(manager.joinConversation('c1')).rejects.toThrow(ConnectionError);
    expect(manager.leaveConversation('c1')).rejects.toThrow(ConnectionError);
  });

  it('exposes renewal timer and event emitter', () => {
    const manager = new SignalRConnectionManager({
      hubUrl: 'https://comms.clinicez.com/hubs/comms',
      ticketProvider: async () => 'test.ticket'
    });

    expect(manager.events).toBeDefined();
    expect(manager.getRenewalTimer()).toBeDefined();

    let receivedEvent = false;
    manager.events.on('connectionStateChanged', (state) => {
      if (state === 'Disconnected') receivedEvent = true;
    });

    manager.events.emit('connectionStateChanged', 'Disconnected');
    expect(receivedEvent).toBe(true);
  });

  it('tracks lastSeenSeq per conversation and catches up missed messages on onreconnected', async () => {
    const manager = new SignalRConnectionManager({
      hubUrl: 'https://comms.clinicez.com/hubs/comms',
      ticketProvider: async () => 'test.ticket'
    });

    const rawConn = manager.getRawConnection() as any;
    rawConn._connectionState = 'Connected';

    const makeMsg = (conversationId: string, seq: number): MessageDto => ({
      messageId: `msg-${conversationId}-${seq}`,
      conversationId,
      seq,
      clientMessageId: `cid-${conversationId}-${seq}`,
      senderType: 'Staff',
      senderId: 'staff-2',
      senderDisplayName: 'Dr. Santos',
      contentText: `Message seq ${seq}`,
      visibility: 'Public',
      requiresAcknowledgement: false,
      isAcknowledged: false,
      acknowledgedAtUtc: null,
      acknowledgedByAccountId: null,
      acknowledgedByName: null,
      attachments: [],
      deliveryState: 'Waiting',
      sentAtUtc: new Date().toISOString()
    });

    const invokeCalls: Array<{ method: string; args: any[] }> = [];
    rawConn.invoke = mock(async (method: string, ...args: any[]) => {
      invokeCalls.push({ method, args });
      if (method === 'GetMessagesAfterSeq') {
        const [convId, afterSeq] = args;
        if (convId === 'conv-alpha' && afterSeq === 3) {
          return [makeMsg('conv-alpha', 4), makeMsg('conv-alpha', 5)];
        }
        if (convId === 'conv-beta' && afterSeq === 7) {
          return [makeMsg('conv-beta', 8)];
        }
        return [];
      }
      return undefined;
    });

    // Join active conversations
    await manager.joinConversation('conv-alpha');
    await manager.joinConversation('conv-beta');
    await manager.joinConversation('conv-gamma');

    // Simulate incoming OnMessageReceived updating conv-alpha up to seq 3
    const onMessageReceivedHandlers = rawConn._methods?.['onmessagereceived'] ?? [];
    expect(onMessageReceivedHandlers.length).toBeGreaterThan(0);
    onMessageReceivedHandlers[0](makeMsg('conv-alpha', 1));
    onMessageReceivedHandlers[0](makeMsg('conv-alpha', 3));

    // Simulate getMessagesAfterSeq updating conv-beta up to seq 7
    rawConn.invoke = mock(async (method: string, ...args: any[]) => {
      invokeCalls.push({ method, args });
      if (method === 'GetMessagesAfterSeq') {
        const [convId, afterSeq] = args;
        if (convId === 'conv-beta' && afterSeq === 0) {
          return [makeMsg('conv-beta', 6), makeMsg('conv-beta', 7)];
        }
        if (convId === 'conv-alpha' && afterSeq === 3) {
          return [makeMsg('conv-alpha', 4), makeMsg('conv-alpha', 5)];
        }
        if (convId === 'conv-beta' && afterSeq === 7) {
          return [makeMsg('conv-beta', 8)];
        }
        return [];
      }
      return undefined;
    });

    await manager.getMessagesAfterSeq('conv-beta', 0);

    expect(manager.getLastSeenSeq('conv-alpha')).toBe(3);
    expect(manager.getLastSeenSeq('conv-beta')).toBe(7);
    expect(manager.getLastSeenSeq('conv-gamma')).toBe(0);

    // Clear recorded invoke calls before triggering onreconnected
    invokeCalls.length = 0;

    const replayed: MessageDto[] = [];
    manager.events.on('messageReceived', (msg) => {
      replayed.push(msg);
    });

    const reconnectedCallbacks = rawConn._reconnectedCallbacks ?? [];
    expect(reconnectedCallbacks.length).toBeGreaterThan(0);
    await reconnectedCallbacks[0]('new-conn-id');

    // Verify JoinConversation ran before GetMessagesAfterSeq with exact tracked seq per room
    expect(invokeCalls).toEqual([
      { method: 'JoinConversation', args: ['conv-alpha'] },
      { method: 'GetMessagesAfterSeq', args: ['conv-alpha', 3] },
      { method: 'JoinConversation', args: ['conv-beta'] },
      { method: 'GetMessagesAfterSeq', args: ['conv-beta', 7] },
      { method: 'JoinConversation', args: ['conv-gamma'] },
      { method: 'GetMessagesAfterSeq', args: ['conv-gamma', 0] }
    ]);

    // Verify missed messages were emitted and max seq updated
    expect(replayed.map((m) => m.messageId)).toEqual([
      'msg-conv-alpha-4',
      'msg-conv-alpha-5',
      'msg-conv-beta-8'
    ]);
    expect(manager.getLastSeenSeq('conv-alpha')).toBe(5);
    expect(manager.getLastSeenSeq('conv-beta')).toBe(8);
  });
});
