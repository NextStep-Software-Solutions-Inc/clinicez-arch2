import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionError } from '../../core/errors';
import { ClientMessageQueue } from '../../core/queue/ClientMessageQueue';
import { ICommsClient, MessageDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import {
  PendingMessageRecord,
  SendMessageInput,
  UseSendMessageResult
} from '../types';

export function useSendMessage(): UseSendMessageResult {
  const {
    client,
    store,
    staffId,
    staffDisplayName,
    messageQueue: contextQueue
  } = useCommsContext();

  const fallbackQueueRef = useRef<ClientMessageQueue | null>(null);
  const fallbackQueueClientRef = useRef<ICommsClient | null>(null);
  if (!contextQueue && (!fallbackQueueRef.current || fallbackQueueClientRef.current !== client)) {
    fallbackQueueRef.current?.dispose();
    fallbackQueueClientRef.current = client;
    fallbackQueueRef.current = new ClientMessageQueue(client);
  }
  const messageQueue = contextQueue ?? fallbackQueueRef.current!;

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

  useEffect(() => {
    if (!contextQueue) {
      messageQueue.attach();
    }
    const unsubQueue = messageQueue.subscribe({
      onMessageSent: (queued, serverMsg) => {
        const normalized = serverMsg.clientMessageId
          ? serverMsg
          : { ...serverMsg, clientMessageId: queued.clientMessageId };
        store.appendMessage(normalized);
        if (normalized.clientMessageId) {
          store.updatePendingState(
            normalized.clientMessageId,
            normalized.deliveryState ?? 'Waiting'
          );
        }
        setLastSentMessage(normalized);
      },
      onMessageFailed: (queued, err) => {
        setError(err);
        store.updatePendingState(queued.clientMessageId, 'NotReceived', err.message);
        store.updateMessageState(
          `opt-${queued.clientMessageId}`,
          queued.conversationId,
          'NotReceived'
        );
      }
    });

    return () => {
      unsubQueue();
      if (!contextQueue) {
        fallbackQueueRef.current?.dispose();
      }
    };
  }, [contextQueue, messageQueue, store]);

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

      const queueForReconnect = async (): Promise<MessageDto> => {
        await messageQueue.enqueue(
          {
            conversationId: input.conversationId,
            clientMessageId,
            contentText: input.contentText,
            visibility: input.visibility ?? 'Public',
            requiresAcknowledgement: input.requiresAcknowledgement ?? false,
            attachments: input.attachments
          },
          { skipAutoProcess: true }
        );
        return optimisticMsg;
      };

      try {
        if (client.getConnectionState() !== 'Connected') {
          return await queueForReconnect();
        }

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
        const isConnErr =
          err instanceof ConnectionError ||
          (err && typeof err === 'object' && (err as { name?: string }).name === 'ConnectionError') ||
          client.getConnectionState() !== 'Connected';
        if (isConnErr) {
          return await queueForReconnect();
        }
        const failure = err instanceof Error ? err : new Error(String(err));
        setError(failure);
        // Delivery failed -> NotReceived
        store.updatePendingState(clientMessageId, 'NotReceived', failure.message);
        store.updateMessageState(optimisticMsg.messageId, input.conversationId, 'NotReceived');
        throw failure;
      } finally {
        setIsSending(false);
      }
    },
    [client, generateUUID, messageQueue, staffDisplayName, staffId, store]
  );

  const resendMessage = useCallback(
    async (clientMessageIdOrMessageId: string): Promise<MessageDto> => {
      const rawId = clientMessageIdOrMessageId.startsWith('opt-')
        ? clientMessageIdOrMessageId.slice(4)
        : clientMessageIdOrMessageId;

      let pending = store.getPending().find(
        (m) =>
          m.clientMessageId === clientMessageIdOrMessageId ||
          m.clientMessageId === rawId
      );

      if (!pending) {
        // Fallback: search store messages across conversations
        const foundMsg = store.findMessageById(clientMessageIdOrMessageId);
        if (foundMsg) {
          return await sendMessage({
            conversationId: foundMsg.conversationId,
            contentText: foundMsg.contentText,
            visibility: foundMsg.visibility,
            requiresAcknowledgement: foundMsg.requiresAcknowledgement,
            attachments: foundMsg.attachments,
            clientMessageId: foundMsg.clientMessageId || rawId
          });
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
      messageQueue.cancel(clientMessageId).catch(() => {});
    },
    [messageQueue, store]
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
