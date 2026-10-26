import { describe, expect, it } from 'bun:test';
import { OptimisticStore } from '../../src/react/internal/OptimisticStore';

describe('OptimisticStore Message Isolation', () => {
  it('updates only the targeted message without mutating other pending messages in the same conversation', () => {
    const store = new OptimisticStore();

    // Add two pending messages in the same conversation
    store.addPending({
      clientMessageId: 'client-msg-1',
      conversationId: 'conv-123',
      content: 'Message 1',
      isInternal: false,
      state: 'Sending',
      createdAt: new Date()
    });

    store.addPending({
      clientMessageId: 'client-msg-2',
      conversationId: 'conv-123',
      content: 'Message 2',
      isInternal: false,
      state: 'Sending',
      createdAt: new Date()
    });

    // Seed conversation messages with msg-1
    store.appendMessage({
      messageId: 'server-msg-1',
      clientMessageId: 'client-msg-1',
      conversationId: 'conv-123',
      senderId: 'staff-1',
      senderDisplayName: 'Staff 1',
      senderType: 'Staff',
      visibility: 'Public',
      contentText: 'Message 1',
      seq: 1,
      sentAtUtc: new Date().toISOString(),
      requiresAcknowledgement: false,
      isAcknowledged: false,
      deliveryState: 'Sending',
      attachments: []
    });

    // Update state of message 1 to Received
    store.updateMessageState('server-msg-1', 'conv-123', 'Received');

    const pending = store.getPending('conv-123');
    const pending1 = pending.find((p) => p.clientMessageId === 'client-msg-1');
    const pending2 = pending.find((p) => p.clientMessageId === 'client-msg-2');

    expect(pending1?.state).toBe('Received');
    // Message 2 MUST remain Sending - NOT mutated!
    expect(pending2?.state).toBe('Sending');
  });

  it('updates targeted pending message directly by clientMessageId when server messageId is not yet assigned', () => {
    const store = new OptimisticStore();

    store.addPending({
      clientMessageId: 'client-msg-orphan',
      conversationId: 'conv-456',
      content: 'Pending only',
      isInternal: false,
      state: 'Sending',
      createdAt: new Date()
    });

    store.updateMessageState('client-msg-orphan', 'conv-456', 'NotReceived');

    const pending = store.getPending('conv-456');
    expect(pending[0].state).toBe('NotReceived');
  });
});
