import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationDto, MessageDto, ParticipantDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import { TypingParticipant, UseConversationOptions, UseConversationResult } from '../types';

export function useConversation(
  conversationId: string | null,
  options?: UseConversationOptions
): UseConversationResult {
  const { client, store, subscriptionTracker } = useCommsContext();

  const [conversation, setConversation] = useState<ConversationDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>(() =>
    conversationId ? store.getMessages(conversationId) : []
  );
  const [participants, setParticipants] = useState<ParticipantDto[]>([]);
  const [typingParticipants, setTypingParticipants] = useState<TypingParticipant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingEarlier, setIsLoadingEarlier] = useState<boolean>(false);
  const [hasEarlierMessages, setHasEarlierMessages] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const typingTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Room subscription retain/release
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    subscriptionTracker.retainRoom(client, conversationId).catch((err) => {
      console.warn('retainRoom error:', err);
    });

    setMessages(store.getMessages(conversationId));
    setIsLoading(false);

    return () => {
      subscriptionTracker.releaseRoom(client, conversationId).catch((err) => {
        console.warn('releaseRoom error:', err);
      });
    };
  }, [client, conversationId, subscriptionTracker, store]);

  // Sync with OptimisticStore
  useEffect(() => {
    if (!conversationId) return;

    const unsub = store.subscribe(() => {
      setMessages([...store.getMessages(conversationId)]);
    });

    return () => {
      unsub();
    };
  }, [conversationId, store]);

  // Hook typing indicators & participant events
  useEffect(() => {
    if (!conversationId) return;

    const unsubPartJoined = client.events.on('participantJoined', (payload) => {
      if (payload.conversationId === conversationId) {
        setParticipants((prev) => {
          if (prev.some((p) => p.userId === payload.participantId)) return prev;
          return [
            ...prev,
            {
              id: payload.participantId,
              userId: payload.participantId,
              displayName: payload.displayName,
              role: payload.role,
              joinedAtUtc: new Date().toISOString()
            }
          ];
        });
      }
    });

    const unsubPartLeft = client.events.on('participantLeft', (payload) => {
      if (payload.conversationId === conversationId) {
        setParticipants((prev) => prev.filter((p) => p.userId !== payload.participantId));
      }
    });

    return () => {
      unsubPartJoined();
      unsubPartLeft();
    };
  }, [client, conversationId]);

  const loadEarlierMessages = useCallback(async (): Promise<void> => {
    if (!conversationId || isLoadingEarlier) return;
    setIsLoadingEarlier(true);
    try {
      const currentMessages = store.getMessages(conversationId);
      const lowestSeq = currentMessages.length > 0 ? currentMessages[0].seq : 0;
      if (lowestSeq > 0) {
        // In full server integration, would call REST or hub method for earlier
      }
      setHasEarlierMessages(false);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoadingEarlier(false);
    }
  }, [conversationId, isLoadingEarlier, store]);

  const sendTypingIndicator = useCallback(
    (isTyping: boolean) => {
      // Broadcast typing status (no-op in offline mode)
    },
    []
  );

  const markAsRead = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    // Mark read locally / server
  }, [conversationId]);

  const acknowledgeMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!conversationId) return false;
      try {
        await client.acknowledgeMessage(messageId);
        return true;
      } catch (err: any) {
        setError(err instanceof Error ? err : new Error(String(err)));
        return false;
      }
    },
    [client, conversationId]
  );

  const sendReaction = useCallback(
    async (messageId: string, reaction: string): Promise<void> => {
      if (!conversationId) return;
      try {
        await client.sendReaction(messageId, reaction);
      } catch (err: any) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [client, conversationId]
  );

  const confirmDelivery = useCallback(
    async (messageId: string): Promise<void> => {
      if (!conversationId) return;
      try {
        await client.confirmDelivery(messageId);
      } catch (err: any) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    },
    [client, conversationId]
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    try {
      const current = store.getMessages(conversationId);
      const maxSeq = current.reduce((max, m) => Math.max(max, m.seq), 0);
      const missed = await client.getMessagesAfterSeq(conversationId, maxSeq);
      for (const m of missed) {
        store.appendMessage(m);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [client, conversationId, store]);

  return {
    conversation,
    messages,
    participants,
    typingParticipants,
    isLoading,
    isLoadingEarlier,
    hasEarlierMessages,
    error,
    loadEarlierMessages,
    sendTypingIndicator,
    markAsRead,
    acknowledgeMessage,
    sendReaction,
    confirmDelivery,
    refresh
  };
}
