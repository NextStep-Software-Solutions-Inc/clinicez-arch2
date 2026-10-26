import { useCallback, useEffect, useState } from 'react';
import { DeliveryStateTracker } from '../../core/queue/DeliveryStateTracker';
import { MessageDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import {
  PendingMessageRecord,
  SendMessageInput,
  UseSendMessageResult
} from '../types';

export function useSendMessage(): UseSendMessageResult {
  const { client, store, staffId, staffDisplayName } = useCommsContext();

  const [isSending, setIsSending] = useState<boolean>(false);
  const [lastSentMessage, setLastSentMessage] = useState<MessageDto | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessageRecord[]>(() =>
    store.getPending()
  );

  useEffect(() => {
    return store.subscribe(() => {
      setPendingMessages(store.getPending());
    });
  }, [store]);

  const generateUUID = useCallback((): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }, []);

  const sendMessage = useCallback(
    async (input: SendMessageInput): Promise<MessageDto> => {
      const clientMessageId = input.clientMessageId ?? generateUUID();
      const now = new Date();

      const pendingRecord: PendingMessageRecord = {
        clientMessageId,
        conversationId: input.conversationId,
        contentText: input.contentText,
        visibility: input.visibility ?? 'Public',
        requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        attachments: input.attachments ?? [],
        sentAt: now,
        state: 'Sending'
      };

      // 1. Optimistic insertion into store
      store.addPending(pendingRecord);

      const optimisticMsg: MessageDto = {
        messageId: `opt-${clientMessageId}`,
        conversationId: input.conversationId,
        seq: Date.now(),
        clientMessageId,
        senderType: 'Staff',
        senderId: staffId,
        senderDisplayName: staffDisplayName,
        contentText: input.contentText,
        visibility: input.visibility ?? 'Public',
        requiresAcknowledgement: input.requiresAcknowledgement ?? false,
        isAcknowledged: false,
        acknowledgedAtUtc: null,
        acknowledgedByAccountId: null,
        acknowledgedByName: null,
        attachments: input.attachments ?? [],
        deliveryState: 'Sending',
        sentAtUtc: now.toISOString()
      };
      store.appendMessage(optimisticMsg);

      setIsSending(true);
      setError(null);

      try {
        const serverMsg = await client.sendMessage({
          conversationId: input.conversationId,
          clientMessageId,
          contentText: input.contentText,
          visibility: input.visibility ?? 'Public',
          requiresAcknowledgement: input.requiresAcknowledgement ?? false,
          attachments: input.attachments
        });

        // 2. Server accepted message: advances to "Waiting" (or Received)
        store.appendMessage(serverMsg);
        store.updatePendingState(clientMessageId, serverMsg.deliveryState ?? 'Waiting');
        setLastSentMessage(serverMsg);
        return serverMsg;
      } catch (err: any) {
        const failure = err instanceof Error ? err : new Error(String(err));
        setError(failure);
        // Delivery failed / offline -> NotReceived
        store.updatePendingState(clientMessageId, 'NotReceived', failure.message);
        store.updateMessageState(optimisticMsg.messageId, input.conversationId, 'NotReceived');
        throw failure;
      } finally {
        setIsSending(false);
      }
    },
    [client, generateUUID, staffDisplayName, staffId, store]
  );

  const resendMessage = useCallback(
    async (clientMessageIdOrMessageId: string): Promise<MessageDto> => {
      let pending = store.getPending().find(
        (m) =>
          m.clientMessageId === clientMessageIdOrMessageId
      );

      if (!pending) {
        // Check if message exists in store with that clientMessageId
        for (const pendingItem of store.getPending()) {
          if (pendingItem.clientMessageId === clientMessageIdOrMessageId) {
            pending = pendingItem;
            break;
          }
        }
      }

      if (!pending) {
        throw new Error(`Pending message '${clientMessageIdOrMessageId}' not found for resend.`);
      }

      // Re-submit with IDENTICAL clientMessageId
      return await sendMessage({
        conversationId: pending.conversationId,
        contentText: pending.contentText,
        visibility: pending.visibility,
        requiresAcknowledgement: pending.requiresAcknowledgement,
        attachments: pending.attachments,
        clientMessageId: pending.clientMessageId
      });
    },
    [sendMessage, store]
  );

  const cancelPendingMessage = useCallback(
    (clientMessageId: string) => {
      store.removePending(clientMessageId);
    },
    [store]
  );

  return {
    sendMessage,
    resendMessage,
    cancelPendingMessage,
    isSending,
    pendingMessages,
    lastSentMessage,
    error
  };
}
