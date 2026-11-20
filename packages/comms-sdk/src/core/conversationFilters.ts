import { resolveConversationDisplayTitle } from './conversationTitle';
import type { ConversationDto } from './types';

export type ScopeFilterableConversation = Pick<
  ConversationDto,
  'id' | 'scope' | 'status' | 'title' | 'lastMessageSnippet' | 'participants'
>;

export function filterConversationsByScopeAndQuery<T extends ScopeFilterableConversation>(
  conversations: readonly T[],
  selectedScope: string,
  searchQuery: string,
): T[] {
  const trimmedQuery = searchQuery.trim().toLowerCase();

  return conversations.filter((c) => {
    const isArchived = c.status === 'Closed';
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
  conversations: ReadonlyArray<Pick<ConversationDto, 'status' | 'unreadCount'>>,
): number {
  return conversations.reduce(
    (acc, c) => (c.status === 'Closed' ? acc : acc + (c.unreadCount || 0)),
    0,
  );
}
