import { describe, expect, it } from 'bun:test';
import { ClientMessageQueue } from '../../src/core/queue/ClientMessageQueue';
import { MockCommsClient } from '../mocks/MockCommsClient';
import { MessageDto, SendMessageRequest } from '../../src/core/types';

describe('Adversarial Scenario 3: Client Message Queue FIFO & Deduplication Under Load', () => {
  it('enqueues 100 rapid messages offline with strict FIFO ordering and preserves clientMessageId on single-tap resends', async () => {
    const mockClient = new MockCommsClient();
    // Keep client disconnected initially
    mockClient.connectionState = 'Disconnected';

    const queue = new ClientMessageQueue(mockClient);
    const conversationId = 'conv-stress-100';

    const sentHistory: string[] = [];
    mockClient.sendMessage = async (req: SendMessageRequest): Promise<MessageDto> => {
      sentHistory.push(req.contentText);
      return {
        messageId: `server-${req.clientMessageId}`,
        conversationId: req.conversationId,
        seq: sentHistory.length,
        senderType: 'Staff',
        senderId: 'mock-staff-1',
        senderDisplayName: 'Dr. Santos',
        visibility: req.visibility ?? 'Public',
        requiresAcknowledgement: req.requiresAcknowledgement ?? false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: (req.attachments as any) ?? [],
        deliveryState: 'Waiting',
        sentAtUtc: new Date().toISOString(),
        contentText: req.contentText,
        clientMessageId: req.clientMessageId
      };
    };

    // 1. Enqueue 100 rapid messages while offline
    const enqueuedPromises = [];
    for (let i = 1; i <= 100; i++) {
      enqueuedPromises.push(
        queue.enqueue({
          conversationId,
          contentText: `Message ${String(i).padStart(3, '0')}`,
          visibility: 'Public'
        })
      );
    }
    const enqueuedMessages = await Promise.all(enqueuedPromises);

    expect(enqueuedMessages.length).toBe(100);

    // Verify all 100 have unique UUIDs and state 'Sending'
    const uniqueIds = new Set(enqueuedMessages.map((m) => m.clientMessageId));
    expect(uniqueIds.size).toBe(100);

    // Verify FIFO ordering in getQueuedMessages
    const queuedList = queue.getQueuedMessages(conversationId);
    expect(queuedList.length).toBe(100);
    for (let i = 0; i < 100; i++) {
      expect(queuedList[i].contentText).toBe(`Message ${String(i + 1).padStart(3, '0')}`);
    }

    // 2. Simulate offline failure / transition to NotReceived for the first 20 messages
    for (let i = 0; i < 20; i++) {
      const msg = queuedList[i];
      msg.state = 'NotReceived';
    }

    // 3. Simulate single-tap resend on 20 messages
    const retriedIds: string[] = [];
    for (let i = 0; i < 20; i++) {
      const originalId = queuedList[i].clientMessageId;
      const retried = await queue.retry(originalId);
      retriedIds.push(retried.clientMessageId);
      expect(retried.clientMessageId).toBe(originalId); // MUST be identically preserved
      expect(retried.state).toBe('Sending');
    }

    expect(retriedIds.length).toBe(20);

    // 4. Connect client and directly await queue processing
    mockClient.connectionState = 'Connected';
    await queue.processQueue();

    // Verify all 100 messages were processed by server
    expect(sentHistory.length).toBe(100);

    // Verify strict FIFO ordering of server dispatches
    for (let i = 0; i < 100; i++) {
      expect(sentHistory[i]).toBe(`Message ${String(i + 1).padStart(3, '0')}`);
    }
  });

  it('reveals race condition when connectionStateChanged event triggers un-awaitable processQueue', async () => {
    const mockClient = new MockCommsClient();
    mockClient.connectionState = 'Disconnected';
    const queue = new ClientMessageQueue(mockClient);

    let serverProcessCount = 0;
    mockClient.sendMessage = async (req: SendMessageRequest): Promise<MessageDto> => {
      // Simulate 10ms network transmission delay
      await new Promise((r) => setTimeout(r, 10));
      serverProcessCount++;
      return {
        messageId: `server-${req.clientMessageId}`,
        conversationId: req.conversationId,
        seq: serverProcessCount,
        senderType: 'Staff',
        senderId: 'mock-staff-1',
        senderDisplayName: 'Dr. Santos',
        visibility: req.visibility ?? 'Public',
        requiresAcknowledgement: false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: [],
        deliveryState: 'Waiting',
        sentAtUtc: new Date().toISOString(),
        contentText: req.contentText,
        clientMessageId: req.clientMessageId
      };
    };

    // Enqueue 5 messages offline
    for (let i = 1; i <= 5; i++) {
      await queue.enqueue({
        conversationId: 'conv-race',
        contentText: `Msg ${i}`
      });
    }

    // Connect via event emission
    mockClient.connectionState = 'Connected';
    mockClient.events.emit('connectionStateChanged', 'Connected');

    // A concurrent caller immediately calling processQueue will be locked out and return immediately
    await queue.processQueue(); // returns immediately because isProcessing is already true!

    // Because processQueue was unawaitable from the event, serverProcessCount is NOT 5 yet
    const immediateCount = serverProcessCount;
    // Wait for the background task to complete
    await new Promise((r) => setTimeout(r, 100));

    expect(immediateCount).toBeLessThan(5);
    expect(serverProcessCount).toBe(5);
  });
});
