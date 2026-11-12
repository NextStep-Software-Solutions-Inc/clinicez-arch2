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
  const {
    client,
    facilityId,
    tenantId,
    staffId,
    staffDisplayName,
    baseUrl,
    activeTicket,
    refreshTicket,
  } = useCommsContext();

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
      if (baseUrl) {
        const cleanBase = baseUrl.replace(/\/$/, '');
        let ticket = activeTicket?.ticket;
        if (!ticket && refreshTicket) {
          try {
            const refreshed = await refreshTicket();
            ticket = refreshed?.ticket;
          } catch {
            // ignore ticket refresh error
          }
        }
        const params = new URLSearchParams();
        if (facilityId) params.append('facilityId', facilityId);
        if (scope && scope !== 'All' && !Array.isArray(scope)) {
          params.append('scope', scope);
        }
        const queryString = params.toString();
        const url = `${cleanBase}/api/v1/comms/conversations${queryString ? `?${queryString}` : ''}`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(ticket ? { Authorization: `Bearer ${ticket}` } : {})
        };
        const res = await fetch(url, {
          method: 'GET',
          headers
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch conversations: ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
        }
        const data = await res.json();
        if (Array.isArray(data)) {
          setConversations(data);
        }
      }
      setError(null);
    } catch (err: any) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsRefreshing(false);
      setIsLoading(false);
    }
  }, [activeTicket?.ticket, baseUrl, facilityId, refreshTicket, scope]);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (!hasMore) return;
    setPage((prev) => prev + 1);
  }, [hasMore]);

  const createConversation = useCallback(
    async (request: CreateConversationRequest): Promise<ConversationDto> => {
      const optimisticId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `conv-${Date.now()}`;
      const effectiveCreatedBy = staffId || 'staff';

      // 1. Resolve participant inputs
      let participantsList: Array<{
        participantType: string;
        participantId: string;
        displayName: string;
        role: string;
      }> = [];

      if (request.participants && request.participants.length > 0) {
        participantsList = request.participants.map((p) => ({
          participantType: p.participantType || 'Staff',
          participantId: p.participantId,
          displayName: p.displayName || 'Staff',
          role: p.role || 'Member',
        }));
      } else {
        const rawIds = request.participantIds || request.participantStaffIds || [];
        participantsList = rawIds.map((id) => ({
          participantType: 'Staff',
          participantId: id,
          displayName: 'Staff',
          role: 'Member',
        }));
      }

      // 2. If creator is authenticated and not yet enrolled in the participants list, prepend creator
      if (staffId && !participantsList.some((p) => p.participantId === staffId)) {
        participantsList.unshift({
          participantType: 'Staff',
          participantId: staffId,
          displayName: staffDisplayName || 'Staff Member',
          role: 'Owner',
        });
      }

      const newConv: ConversationDto = {
        id: optimisticId,
        tenantId: tenantId || '',
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
        createdBy: effectiveCreatedBy,
        participants: participantsList.map((p) => ({
          id: p.participantId,
          userId: p.participantId,
          displayName: p.displayName,
          role: p.role,
          joinedAtUtc: new Date().toISOString(),
        })),
      };

      setConversations((prev) => [newConv, ...prev]);

      if (baseUrl) {
        const cleanBase = baseUrl.replace(/\/$/, '');
        let ticket = activeTicket?.ticket;
        if (!ticket && refreshTicket) {
          try {
            const refreshed = await refreshTicket();
            ticket = refreshed?.ticket;
          } catch {
            // ignore ticket refresh error
          }
        }
        const url = `${cleanBase}/api/v1/comms/conversations`;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...(ticket ? { Authorization: `Bearer ${ticket}` } : {})
        };
        const payload = {
          tenantId: tenantId || '',
          facilityId,
          scope: request.scope,
          kind: 'General',
          title: request.title,
          contextType: request.contextType || null,
          contextId: request.contextId || null,
          category: request.category || null,
          isEmergencyConfirmed: false,
          isLocalOnly: request.isLocalOnly ?? false,
          participants: participantsList.length > 0 ? participantsList : null
        };

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          setConversations((prev) => prev.filter((c) => c.id !== optimisticId));
          throw new Error(`Failed to create conversation: ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`);
        }

        const serverConv: ConversationDto = await res.json();
        setConversations((prev) => prev.map((c) => (c.id === optimisticId ? serverConv : c)));
        client.events.emit('conversationCreated', serverConv);
        return serverConv;
      }

      client.events.emit('conversationCreated', newConv);
      return newConv;
    },
    [activeTicket?.ticket, baseUrl, client, facilityId, refreshTicket, staffDisplayName, staffId, tenantId]
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
            const isOwn = Boolean(msg.senderId && staffId && msg.senderId === staffId);
            const currentUnread = (c as any).unreadCount || 0;
            return {
              ...c,
              lastMessageAtUtc: msg.sentAtUtc,
              lastMessageSnippet: msg.contentText,
              messageCount: c.messageCount + 1,
              lastSeq: Math.max(c.lastSeq, msg.seq),
              unreadCount: isOwn ? currentUnread : currentUnread + 1,
            };
          }
          return c;
        })
      );
    });

    const unsubState = client.events.on('connectionStateChanged', (state) => {
      if (state === 'Connected') {
        refresh().catch(() => {});
      }
    });

    setIsLoading(false);

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubMsg();
      unsubState();
    };
  }, [client, refresh]);

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
    for (const c of filteredConversations) {
      const u = (c as any).unreadCount || 0;
      if (u > 0 && counts[c.scope] !== undefined) {
        counts[c.scope] += u;
      }
    }
    return counts;
  }, [filteredConversations]);

  const totalUnreadCount = useMemo(() => {
    return filteredConversations.reduce((sum, c) => sum + ((c as any).unreadCount || 0), 0);
  }, [filteredConversations]);

  return {
    conversations: filteredConversations,
    totalCount: filteredConversations.length,
    unreadCount: totalUnreadCount,
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
