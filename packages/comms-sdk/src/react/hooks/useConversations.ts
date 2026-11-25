import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isConversationClosed,
  TERMINAL_CONVERSATION_STATUSES
} from '../../core/conversationFilters';
import { ConversationDto, ConversationScope, ParticipantDto } from '../../core/types';
import { useCommsContext } from '../CommsContext';
import { resolveCommsAuthHeaders } from '../internal/authHeaders';
import {
  ConversationsFilterOptions,
  ConversationScopeFilter,
  CreateConversationRequest,
  UseConversationsResult
} from '../types';

const VALID_MESSAGE_CATEGORIES = new Set<string>([
  'Scheduling',
  'PrescriptionRefill',
  'LabResultQuestion',
  'PostVisitFollowUp',
  'Billing',
  'OrderStatus',
  'MedicineQuestion',
  'CollectionAndAppointment',
  'ReportCopy',
  'Other'
]);

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
  const conversationsRef = useRef<ConversationDto[]>(conversations);
  conversationsRef.current = conversations;

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);

  const isCurrentStaffParticipant = useCallback(
    (p: ParticipantDto): boolean => {
      if (!staffId) return false;
      return p.participantId === staffId || p.userId === staffId || p.id === staffId;
    },
    [staffId]
  );

  const setFilter = useCallback((newFilter: Partial<ConversationsFilterOptions>) => {
    setFilterState((prev) => ({ ...prev, ...newFilter }));
    setPage(1);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true);
    try {
      if (baseUrl) {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const params = new URLSearchParams();
        if (facilityId) params.append('facilityId', facilityId);
        if (scope && scope !== 'All' && scope !== 'Archived' && !Array.isArray(scope)) {
          params.append('scope', scope);
        }
        const queryString = params.toString();
        const url = `${cleanBase}/api/v1/comms/conversations${queryString ? `?${queryString}` : ''}`;
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
  }, [activeTicket, baseUrl, facilityId, refreshTicket, scope]);

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

      const trimmedDepartment = request.department?.trim() || undefined;
      const effectiveContextType =
        request.contextType || (trimmedDepartment ? 'Department' : undefined);
      const effectiveContextId =
        request.contextId || trimmedDepartment || undefined;
      const effectiveCategory =
        request.category && VALID_MESSAGE_CATEGORIES.has(request.category)
          ? request.category
          : undefined;

      const newConv: ConversationDto = {
        id: optimisticId,
        tenantId: tenantId || '',
        facilityId,
        scope: request.scope,
        kind: 'General',
        title: request.title ?? null,
        contextType: effectiveContextType,
        contextId: effectiveContextId,
        category: effectiveCategory,
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
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const url = `${cleanBase}/api/v1/comms/conversations`;
        const payload = {
          tenantId: tenantId || '',
          facilityId,
          scope: request.scope,
          kind: 'General',
          title: request.title ? request.title.trim() : null,
          contextType: effectiveContextType || null,
          contextId: effectiveContextId || null,
          category: effectiveCategory || null,
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
    [activeTicket, baseUrl, client, facilityId, refreshTicket, staffDisplayName, staffId, tenantId]
  );

  const markConversationRead = useCallback(
    async (conversationId: string, lastReadMessageId?: string): Promise<void> => {
      if (!conversationId) return;
      const prevConv = conversationsRef.current.find((c) => c.id === conversationId);

      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
      client.events.emit('conversationUpdated', {
        id: conversationId,
        unreadCount: 0
      } as ConversationDto);

      if (!baseUrl) return;

      try {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const res = await fetch(
          `${cleanBase}/api/v1/comms/conversations/${conversationId}/read`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ lastReadMessageId: lastReadMessageId ?? null })
          }
        );

        if (!res.ok) {
          throw new Error(
            `Failed to mark conversation read: ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
          );
        }
      } catch (err: any) {
        const failure = err instanceof Error ? err : new Error(String(err));
        if (prevConv) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === conversationId ? { ...c, unreadCount: prevConv.unreadCount } : c
            )
          );
          client.events.emit('conversationUpdated', {
            id: conversationId,
            unreadCount: prevConv.unreadCount
          } as ConversationDto);
        }
        setError(failure);
      }
    },
    [activeTicket, baseUrl, client, refreshTicket]
  );

  const setConversationMuted = useCallback(
    async (conversationId: string, isMuted: boolean): Promise<void> => {
      if (!conversationId) return;
      const prevConv = conversationsRef.current.find((c) => c.id === conversationId);

      const applyMuted = (c: ConversationDto, muted: boolean): ConversationDto => ({
        ...c,
        isMuted: muted,
        participants: (c.participants ?? []).map((p) =>
          isCurrentStaffParticipant(p) ? { ...p, isMuted: muted } : p
        )
      });

      const optimisticConv = prevConv ? applyMuted(prevConv, isMuted) : undefined;
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? applyMuted(c, isMuted) : c))
      );
      client.events.emit(
        'conversationUpdated',
        optimisticConv ?? ({ id: conversationId, isMuted } as ConversationDto)
      );

      if (!baseUrl) return;

      try {
        const cleanBase = baseUrl.replace(/\/$/, '');
        const headers = await resolveCommsAuthHeaders(activeTicket, refreshTicket);
        const res = await fetch(
          `${cleanBase}/api/v1/comms/conversations/${conversationId}/mute`,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ isMuted })
          }
        );

        if (!res.ok) {
          throw new Error(
            `Failed to update conversation mute state: ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
          );
        }

        const data = await res.json().catch(() => null);
        if (data && typeof data === 'object') {
          const resolvedMuted = typeof data.isMuted === 'boolean' ? data.isMuted : isMuted;
          let updatedForEvent: ConversationDto | undefined;
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== conversationId) return c;
              const existingList = c.participants ?? [];
              let nextParticipants = existingList;
              if (data.participantId) {
                const normalizedParticipant: ParticipantDto = {
                  id: data.id ?? data.participantId,
                  userId: data.userId ?? data.participantId,
                  participantId: data.participantId,
                  displayName: data.displayName ?? staffDisplayName ?? 'Staff Member',
                  role: data.role ?? 'Member',
                  joinedAtUtc: data.joinedAtUtc ?? new Date().toISOString(),
                  leftAtUtc: data.leftAtUtc ?? null,
                  lastReadMessageId: data.lastReadMessageId ?? null,
                  lastReadAtUtc: data.lastReadAtUtc ?? null,
                  isMuted: resolvedMuted
                };
                const idx = existingList.findIndex(
                  (p) =>
                    p.participantId === data.participantId ||
                    p.userId === data.participantId ||
                    p.id === data.id ||
                    isCurrentStaffParticipant(p)
                );
                nextParticipants =
                  idx >= 0
                    ? existingList.map((p, i) =>
                        i === idx ? { ...p, ...normalizedParticipant } : p
                      )
                    : [...existingList, normalizedParticipant];
              }
              updatedForEvent = {
                ...c,
                isMuted: resolvedMuted,
                participants: nextParticipants
              };
              return updatedForEvent;
            })
          );
          if (updatedForEvent) {
            client.events.emit('conversationUpdated', updatedForEvent);
          }
        }
      } catch (err: any) {
        if (prevConv) {
          setConversations((prev) =>
            prev.map((c) => (c.id === conversationId ? prevConv : c))
          );
          client.events.emit('conversationUpdated', prevConv);
        }
        throw err instanceof Error ? err : new Error(String(err));
      }
    },
    [activeTicket, baseUrl, client, isCurrentStaffParticipant, refreshTicket, staffDisplayName]
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
      const targetId = conv.id || (conv as { conversationId?: string }).conversationId;
      if (!targetId) return;
      setConversations((prev) =>
        prev.map((c) => (c.id === targetId ? { ...c, ...conv, id: c.id } : c))
      );
    });

    const unsubThreadState = client.events.on('threadStateChanged', (payload) => {
      if (!payload.conversationId) return;
      const isTerminal = TERMINAL_CONVERSATION_STATUSES.has(payload.newStatus);
      setConversations((prev) =>
        prev.map((c) =>
          c.id === payload.conversationId
            ? {
                ...c,
                status: payload.newStatus,
                triageDisposition:
                  payload.disposition !== undefined ? payload.disposition : c.triageDisposition,
                assignedStaffId:
                  payload.assignedStaffId !== undefined
                    ? payload.assignedStaffId
                    : c.assignedStaffId,
                assignedStaffName:
                  payload.assignedStaffName !== undefined
                    ? payload.assignedStaffName
                    : c.assignedStaffName,
                closedAtUtc: isTerminal ? (c.closedAtUtc ?? new Date().toISOString()) : null,
              }
            : c
        )
      );
    });

    const unsubMsg = client.events.on('messageReceived', (msg) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === msg.conversationId) {
            const isDuplicateSeq = c.lastSeq > 0 && msg.seq > 0 && msg.seq <= c.lastSeq;
            const isOwn = Boolean(msg.senderId && staffId && msg.senderId === staffId);
            const currentUnread = c.unreadCount ?? 0;
            const shouldIncrementUnread = !isDuplicateSeq && !isOwn && !isConversationClosed(c);
            return {
              ...c,
              lastMessageAtUtc: msg.sentAtUtc,
              lastMessageSnippet: msg.contentText,
              messageCount: isDuplicateSeq ? c.messageCount : c.messageCount + 1,
              lastSeq: Math.max(c.lastSeq, msg.seq),
              unreadCount: shouldIncrementUnread ? currentUnread + 1 : currentUnread,
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
      unsubThreadState();
      unsubMsg();
      unsubState();
    };
  }, [client, refresh, staffId]);

  // Filtering conversations
  // Note: when scope is undefined or 'All', Closed threads remain in `conversations`
  // so drawer hosts can populate the client-side 'Archived' tab, while unread counts
  // below exclude Closed threads unless scope === 'Archived'.
  const filteredConversations = useMemo(() => {
    const explicitlyIncludesClosed =
      (filter.status && !Array.isArray(filter.status) && TERMINAL_CONVERSATION_STATUSES.has(filter.status)) ||
      (Array.isArray(filter.status) && filter.status.some((s) => TERMINAL_CONVERSATION_STATUSES.has(s)));

    return conversations.filter((c) => {
      if (scope === 'Archived') {
        if (!isConversationClosed(c)) return false;
      } else if (scope && scope !== 'All') {
        if (!explicitlyIncludesClosed && isConversationClosed(c)) return false;
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
        const matchesTitle = Boolean(c.title?.toLowerCase().includes(term));
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
      if (scope !== 'Archived' && isConversationClosed(c)) continue;
      const u = c.unreadCount ?? 0;
      if (u > 0 && counts[c.scope] !== undefined) {
        counts[c.scope] += u;
      }
    }
    return counts;
  }, [filteredConversations, scope]);

  const totalUnreadCount = useMemo(() => {
    return filteredConversations.reduce((sum, c) => {
      if (scope !== 'Archived' && isConversationClosed(c)) return sum;
      return sum + (c.unreadCount ?? 0);
    }, 0);
  }, [filteredConversations, scope]);

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
    createConversation,
    markConversationRead,
    setConversationMuted
  };
}
