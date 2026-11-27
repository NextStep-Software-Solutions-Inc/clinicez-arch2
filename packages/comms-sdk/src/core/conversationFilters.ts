import { resolveConversationDisplayTitle } from './conversationTitle';
import type { ConversationDto, RequestStatus } from './types';

export const TERMINAL_CONVERSATION_STATUSES: ReadonlySet<RequestStatus> = new Set<RequestStatus>([
  'Closed',
  'Answered',
  'NeedsVisit',
  'Declined',
  'Resolved',
]);

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  Submitted: 'Submitted',
  WithTriage: 'With Triage',
  Routed: 'Routed',
  Answered: 'Answered',
  NeedsVisit: 'Needs Visit',
  Declined: 'Declined',
  Resolved: 'Resolved',
  Closed: 'Closed',
};

const CANONICAL_REQUEST_STATUS_KEYS = Object.keys(REQUEST_STATUS_LABELS) as RequestStatus[];

/**
 * Formats a raw RequestStatus enum value (e.g. "WithTriage", "NeedsVisit") into a clean,
 * human-readable display label (e.g. "With Triage", "Needs Visit"). Splits PascalCase/camelCase
 * boundaries as a fallback for unrecognized values.
 */
export function formatRequestStatus(status?: string | null): string {
  const trimmed = (status || '').trim();
  if (!trimmed) {
    return '';
  }

  const lower = trimmed.toLowerCase();
  const canonical = CANONICAL_REQUEST_STATUS_KEYS.find((k) => k.toLowerCase() === lower);
  if (canonical) {
    return REQUEST_STATUS_LABELS[canonical];
  }

  if (/[\s/-]/.test(trimmed)) {
    return trimmed;
  }

  return trimmed.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

export function isConversationClosed(
  conversation?: Pick<ConversationDto, 'status' | 'closedAtUtc'> | null,
): boolean {
  if (!conversation) return false;
  if (conversation.closedAtUtc != null && conversation.closedAtUtc !== '') return true;
  return TERMINAL_CONVERSATION_STATUSES.has(conversation.status);
}

export function getClosedConversationLabel(
  conversation?: Pick<ConversationDto, 'status' | 'triageDisposition' | 'closedAtUtc'> | null,
): string {
  if (!conversation) return 'Closed';
  switch (conversation.status) {
    case 'Answered':
      return 'Answered';
    case 'NeedsVisit':
      return 'Needs Visit';
    case 'Declined':
      return 'Declined';
    case 'Resolved':
      return 'Resolved';
    case 'Closed':
      return 'Closed / Archived';
    default:
      if (conversation.triageDisposition === 'Answered') return 'Answered';
      if (conversation.triageDisposition === 'NeedsVisit') return 'Needs Visit';
      if (conversation.triageDisposition === 'Declined') return 'Declined';
      return 'Closed';
  }
}

export type ScopeFilterableConversation = Pick<
  ConversationDto,
  'id' | 'scope' | 'status' | 'title' | 'lastMessageSnippet' | 'participants'
> & {
  closedAtUtc?: string | null;
};

export function filterConversationsByScopeAndQuery<T extends ScopeFilterableConversation>(
  conversations: readonly T[],
  selectedScope: string,
  searchQuery: string,
): T[] {
  const trimmedQuery = searchQuery.trim().toLowerCase();

  return conversations.filter((c) => {
    const isArchived = c.status === 'Closed' || Boolean(c.closedAtUtc);
    if (selectedScope === 'Archived') {
      if (!isArchived) return false;
    } else {
      if (isArchived) return false;
      if (selectedScope !== 'All' && c.scope !== selectedScope) return false;
    }

    if (trimmedQuery) {
      const displayTitle = resolveConversationDisplayTitle(c).toLowerCase();
      return (
        displayTitle.includes(trimmedQuery) ||
        Boolean(c.title?.toLowerCase().includes(trimmedQuery)) ||
        Boolean(c.lastMessageSnippet?.toLowerCase().includes(trimmedQuery))
      );
    }

    return true;
  });
}

export function countActiveUnreadConversations(
  conversations: ReadonlyArray<
    Pick<ConversationDto, 'status' | 'unreadCount'> & { closedAtUtc?: string | null }
  >,
): number {
  return conversations.reduce(
    (acc, c) => (c.status === 'Closed' || Boolean(c.closedAtUtc) ? acc : acc + (c.unreadCount || 0)),
    0,
  );
}
