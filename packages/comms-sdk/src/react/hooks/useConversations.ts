import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConversationDto, ConversationScope } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import {
  ConversationsFilterOptions,
  ConversationScopeFilter,
  CreateConversationRequest,
  UseConversationsResult
} from '../types';

export function useConversations(
  scope?: ConversationScopeFilter | ConversationScope[],
  initialFilter?: ConversationsFilterOptions
): UseConversationsResult {
  const { client, facilityId } = useCommsContext();

  const [filter, setFilterState] = useState<ConversationsFilterOptions>(initialFilter ?? {});
  const [conversations, setConversations] = useState<ConversationDto[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const setFilter = useCallback((newFilter: Partial<ConversationsFilterOptions>) => {
    setFilterState((prev) => ({ ...prev, ...newFilter }));
    setPage(1);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      // In local mode or mock client, fetch or synthesize list
      // Real API call or mock event update
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, []);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore) return;
    setPage((prev) => prev + 1);
  }, [hasMore]);

  const createConversation = useCallback(
    async (request: CreateConversationRequest): Promise<ConversationDto> => {
      const newConv: ConversationDto = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `conv-${Date.now()}`,
        tenantId: '',
        facilityId,
        scope: request.scope,
        kind: 'General',
        title: request.title,
        contextType: request.contextType,
        contextId: request.contextId,
        category: request.category,
        status: 'Submitted',
        isEmergencyConfirmed: false,
        isLocalOnly: request.isLocalOnly ?? false,
        reopenCount: 0,
        messageCount: 0,
        lastSeq: 0,
        createdAtUtc: new Date().toISOString(),
        createdBy: 'user',
        participants: []
      };

      setConversations((prev) => [newConv, ...prev]);
      client.events.emit('conversationCreated', newConv);
      return newConv;
    },
    [client, facilityId]
  );

  // Real-time synchronization
  useEffect(() => {
    const unsubCreated = client.events.on('conversationCreated', (conv) => {
      setConversations((prev) => {
        if (prev.some((c) => c.id === conv.id)) return prev;
        return [conv, ...prev];
      });
    });

    const unsubUpdated = client.events.on('conversationUpdated', (conv) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === conv.id ? { ...c, ...conv } : c))
      );
    });

    const unsubMsg = client.events.on('messageReceived', (msg) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === msg.conversationId) {
            return {
              ...c,
              lastMessageAtUtc: msg.sentAtUtc,
              lastMessageSnippet: msg.contentText,
              messageCount: c.messageCount + 1,
              lastSeq: Math.max(c.lastSeq, msg.seq)
            };
          }
          return c;
        })
      );
    });

    setIsLoading(false);

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubMsg();
    };
  }, [client]);

  // Filtering conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      if (scope && scope !== 'All') {
        if (Array.isArray(scope)) {
          if (!scope.includes(c.scope)) return false;
        } else if (c.scope !== scope) {
          return false;
        }
      }

      if (filter.category && c.category !== filter.category) return false;
      if (filter.status) {
        if (Array.isArray(filter.status)) {
          if (!filter.status.includes(c.status)) return false;
        } else if (c.status !== filter.status) {
          return false;
        }
      }
      if (filter.priority && c.priority !== filter.priority) return false;
      if (filter.searchTerm) {
        const term = filter.searchTerm.toLowerCase();
        const matchesTitle = c.title.toLowerCase().includes(term);
        const matchesSnippet = c.lastMessageSnippet?.toLowerCase().includes(term);
        if (!matchesTitle && !matchesSnippet) return false;
      }

      return true;
    });
  }, [conversations, filter, scope]);

  const unreadCountsByScope = useMemo<Record<ConversationScope, number>>(() => {
    const counts: Record<ConversationScope, number> = {
      Workspace: 0,
      Facility: 0,
      Branch: 0,
      Direct: 0,
      StaffContext: 0,
      PatientFacility: 0
    };
    return counts;
  }, []);

  return {
    conversations: filteredConversations,
    totalCount: filteredConversations.length,
    unreadCount: 0,
    unreadCountsByScope,
    isLoading,
    isRefreshing,
    error,
    page,
    hasMore,
    loadMore,
    refresh,
    setFilter,
    createConversation
  };
}
