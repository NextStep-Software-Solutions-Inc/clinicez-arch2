import { describe, expect, it } from 'bun:test';
import { SignalRConnectionManager } from '../../src/core/connection/SignalRConnectionManager';
import { ConnectionError } from '../../src/core/errors';

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
});
