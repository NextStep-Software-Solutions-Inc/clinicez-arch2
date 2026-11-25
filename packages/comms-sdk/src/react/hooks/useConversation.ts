import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConversationDto, MessageDto, ParticipantDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import { resolveCommsAuthHeaders } from '../internal/authHeaders';
import { TypingParticipant, UseConversationOptions, UseConversationResult } from '../types';

export function useConversation(
  conversationId: string | null,
  options?: UseConversationOptions
): UseConversationResult {
  const {
    client,
    store,
    subscriptionTracker,
    connectionState,
    baseUrl,
    activeTicket,
    refreshTicket,
    staffId
  } = useCommsContext();

  const [conversation, setConversation] = useState<ConversationDto | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>(() =>
    conversationId ? store.getMessages(conversationId) : []
  );
  const [participants, setParticipants] = useState<ParticipantDto[]>([]);
  const [typingParticipants, setTypingParticipants] = useState<TypingParticipant[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(() =>
    Boolean(conversationId && store.getMessages(conversationId).length === 0)
  );
  const [isLoadingEarlier, setIsLoadingEarlier] = useState<boolean>(false);
  const [hasEarlierMessages, setHasEarlierMessages] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const typingTimeoutRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const refresh = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    try {
      const current = store.getMessages(conversationId);
      const maxSeq = current.reduce((max, m) => Math.max(max, m.seq), 0);
      const missed = await client.getMessagesAfterSeq(conversationId, maxSeq);
      if (Array.isArray(missed) && missed.length > 0) {
        for (const m of missed) {
          store.appendMessage(m);
        }
      }
      setError(null);
    } catch (err: any) {
      console.warn('refresh messages error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [client, conversationId, store]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Fetch conversation metadata from server if baseUrl is present
  useEffect(() => {
    if (!conversationId) {
      setConversation(null);
      return;
    }

    let isMounted = true;
    const fetchConversationDetails = async () => {
      if (!baseUrl) return;
      try {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const url = `${cleanBase}/api/v1/comms/conversations/${conversationId}`;
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller ? setTimeout(() => controller.abort(), 4000) : null;
        try {
          const res = await fetch(url, {
            method: 'GET',
            headers,
            ...(controller ? { signal: controller.signal } : {})
          });
          if (res.ok) {
            const data: ConversationDto = await res.json();
            if (isMounted) {
              setConversation(data);
              if (data.participants && Array.isArray(data.participants)) {
                setParticipants(data.participants);
              }
            }
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (err) {
        // Non-blocking metadata fetch failure
      }
    };

    fetchConversationDetails();
    return () => {
      isMounted = false;
    };
  }, [activeTicket?.ticket, baseUrl, conversationId, refreshTicket]);

  const markAsRead = useCallback(
    async (overrideLastReadMessageId?: string): Promise<void> => {
      if (!conversationId) return;

      const currentMessages = store.getMessages(conversationId);
      const latestServerMsg = [...currentMessages]
        .reverse()
        .find((m) => !m.messageId.startsWith('opt-'));
      const explicitMsgId =
        typeof overrideLastReadMessageId === 'string' && overrideLastReadMessageId.length > 0
          ? overrideLastReadMessageId
          : undefined;
      const lastReadMessageId = explicitMsgId ?? latestServerMsg?.messageId ?? null;

      setConversation((prev) => (prev ? { ...prev, unreadCount: 0 } : prev));
      client.events.emit('conversationUpdated', {
        id: conversationId,
        unreadCount: 0
      } as ConversationDto);

      if (!baseUrl) {
        Promise.resolve().then(() => {
          client.events.emit('conversationUpdated', {
            id: conversationId,
            unreadCount: 0
          } as ConversationDto);
        });
        return;
      }

      try {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const res = await fetch(
          `${cleanBase}/api/v1/comms/conversations/${conversationId}/read`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ lastReadMessageId })
          }
        );
        if (res.ok) {
          client.events.emit('conversationUpdated', {
            id: conversationId,
            unreadCount: 0
          } as ConversationDto);
        }
      } catch {
        // Non-blocking read-receipt persistence
      }
    },
    [activeTicket, baseUrl, client, conversationId, refreshTicket, store]
  );

  const markAsReadRef = useRef(markAsRead);
  useEffect(() => {
    markAsReadRef.current = markAsRead;
  }, [markAsRead]);

  // Room subscription retain/release, initial message load, and mark-as-read on mount
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setIsLoading(false);
      return;
    }

    subscriptionTracker.retainRoom(client, conversationId).catch((err) => {
      console.warn('retainRoom error:', err);
    });

    refreshRef.current().catch(() => {});

    if (options?.markAsReadOnMount !== false) {
      markAsReadRef.current().catch(() => {});
    }

    return () => {
      subscriptionTracker.releaseRoom(client, conversationId).catch((err) => {
        console.warn('releaseRoom error:', err);
      });
    };
  }, [client, conversationId, options?.markAsReadOnMount, subscriptionTracker]);

  // Mark incoming messages as read automatically while conversation is open
  useEffect(() => {
    if (!conversationId || options?.markAsReadOnMount === false) return;

    const unsub = client.events.on('messageReceived', (msg) => {
      if (msg.conversationId !== conversationId) return;
      const isOwn = Boolean(msg.senderId && staffId && msg.senderId === staffId);
      if (!isOwn) {
        markAsReadRef.current(msg.messageId).catch(() => {});
      }
    });

    return () => {
      unsub();
    };
  }, [client, conversationId, options?.markAsReadOnMount, staffId]);

  // Sync when connection connects or reconnects
  useEffect(() => {
    if (!conversationId) return;

    const unsub = client.events.on('connectionStateChanged', (state) => {
      if (state === 'Connected') {
        subscriptionTracker
          .ensureJoined(client, conversationId)
          .catch(() => {})
          .finally(() => {
            refreshRef.current().catch(() => {});
          });
      }
    });

    return () => {
      unsub();
    };
  }, [client, conversationId, subscriptionTracker]);

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
