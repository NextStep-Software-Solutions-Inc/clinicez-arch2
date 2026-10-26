import { describe, expect, it } from 'bun:test';
import { ClientMessageQueue } from '../../src/core/queue/ClientMessageQueue';
import { MockCommsClient } from '../mocks/MockCommsClient';

describe('ClientMessageQueue & Deduplication', () => {
  it('enqueues with UUIDv4 clientMessageId and transitions to Waiting upon server accept', async () => {
    const client = new MockCommsClient();
    const queue = new ClientMessageQueue(client);

    const queued = await queue.enqueue({
      conversationId: 'conv-101',
      contentText: 'Doctor is on the way.',
      visibility: 'Public',
      requiresAcknowledgement: false
    });

    expect(queued.clientMessageId).toBeDefined();
    expect(queued.clientMessageId.length).toBeGreaterThan(10);
    expect(queued.state).toBe('Waiting');
    expect(client.sentMessages.length).toBe(1);
    expect(client.sentMessages[0].clientMessageId).toBe(queued.clientMessageId);
  });

  it('preserves exact same clientMessageId during single-tap retry', async () => {
    const client = new MockCommsClient();
    const queue = new ClientMessageQueue(client);

    // Force client to fail on first send
    const originalSendMessage = client.sendMessage.bind(client);
    let attempts = 0;
    client.sendMessage = async (req) => {
      attempts++;
      if (attempts === 1) {
        throw new Error('Network timeout');
      }
      return originalSendMessage(req);
    };

    const queued = await queue.enqueue({
      conversationId: 'conv-101',
      contentText: 'Test message for retry',
      visibility: 'Public',
      requiresAcknowledgement: false
    });

    // First attempt failed
    expect(queued.state).toBe('NotReceived');
    const originalClientId = queued.clientMessageId;

    // Execute single-tap retry
    const retried = await queue.retry(originalClientId);

    expect(retried.clientMessageId).toBe(originalClientId); // MUST BE IDENTICAL
    expect(retried.state).toBe('Waiting');
    expect(client.sentMessages.length).toBe(1); // second call succeeded
    expect(client.sentMessages[0].clientMessageId).toBe(originalClientId);
  });

  it('updates queued message state when server pushes OnMessageStateChanged event', async () => {
    const client = new MockCommsClient();
    const queue = new ClientMessageQueue(client);

    const queued = await queue.enqueue({
      conversationId: 'conv-101',
      contentText: 'Message delivered test',
      visibility: 'Public',
      requiresAcknowledgement: false
    });

    expect(queued.state).toBe('Waiting');
    expect(queued.serverMessage?.messageId).toBeDefined();

    // Server emits OnMessageStateChanged(Received)
    client.events.emit('messageStateChanged', {
      messageId: queued.serverMessage!.messageId,
      conversationId: 'conv-101',
      state: 'Received',
      timestampUtc: new Date().toISOString()
    });

    expect(queued.state).toBe('Received');
  });
});
