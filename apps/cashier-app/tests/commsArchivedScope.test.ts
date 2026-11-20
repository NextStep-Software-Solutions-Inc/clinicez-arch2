import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  countActiveUnreadConversations,
  filterConversationsByScopeAndQuery,
  type ConversationDto,
} from '../../../packages/comms-sdk/src/core';

const sampleConversations: Array<
  Pick<
    ConversationDto,
    'id' | 'scope' | 'status' | 'title' | 'lastMessageSnippet' | 'unreadCount' | 'participants'
  >
> = [
  {
    id: 'cashier-open-fac',
    scope: 'Facility',
    status: 'Submitted',
    title: 'Billing Desk Queue',
    lastMessageSnippet: 'Invoice #1042 pending review',
    unreadCount: 2,
    participants: [],
  },
  {
    id: 'cashier-open-direct',
    scope: 'Direct',
    status: 'WithTriage',
    title: 'Dr. Santos',
    lastMessageSnippet: 'Confirm HMO coverage',
    unreadCount: 3,
    participants: [],
  },
  {
    id: 'cashier-closed-1',
    scope: 'Facility',
    status: 'Closed',
    title: 'Settled Insurance Dispute',
    lastMessageSnippet: 'Receipt issued and closed',
    unreadCount: 5,
    participants: [],
  },
  {
    id: 'cashier-closed-2',
    scope: 'Direct',
    status: 'Closed',
    title: 'Refund Approval Archive',
    lastMessageSnippet: 'Completed yesterday',
    unreadCount: 1,
    participants: [],
  },
];

describe('Cashier Comms Archived Scope & Unread Exclusion (#212)', () => {
  it('excludes Closed conversations from All and active scope filters', () => {
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'All', '').map((c) => c.id)).toEqual([
      'cashier-open-fac',
      'cashier-open-direct',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'Facility', '').map((c) => c.id)).toEqual([
      'cashier-open-fac',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'Direct', '').map((c) => c.id)).toEqual([
      'cashier-open-direct',
    ]);
  });

  it('shows only Closed conversations under Archived scope and preserves search filtering', () => {
    const archived = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', '');
    expect(archived.map((c) => c.id)).toEqual(['cashier-closed-1', 'cashier-closed-2']);

    const searched = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', 'refund');
    expect(searched.map((c) => c.id)).toEqual(['cashier-closed-2']);
  });

  it('excludes Closed conversations from totalUnread count', () => {
    expect(countActiveUnreadConversations(sampleConversations)).toBe(5);
  });

  it('CashierChatModal & CashierChatTrigger wire Archived filtering, read-only Closed threads, and semantic tokens', () => {
    const modalSource = fs.readFileSync(
      path.resolve(__dirname, '../components/CashierChatModal.tsx'),
      'utf8',
    );
    const triggerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/CashierChatTrigger.tsx'),
      'utf8',
    );

    expect(modalSource).toContain('filterConversationsByScopeAndQuery');
    expect(modalSource).toContain("isArchived: c.status === 'Closed'");
    expect(modalSource).toContain('initialIsArchived');
    expect(modalSource).toContain('Closed / Archived');
    expect(modalSource).toContain('isReadOnly={isArchived}');
    expect(modalSource).toContain('isArchived={isArchived}');
    expect(modalSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(modalSource).not.toMatch(/\brgba?\s*\(/);

    expect(triggerSource).toContain('countActiveUnreadConversations');
    expect(triggerSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
