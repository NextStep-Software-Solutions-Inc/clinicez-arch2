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
    id: 'lab-open-fac',
    scope: 'Facility',
    status: 'Submitted',
    title: 'Hematology Bench',
    lastMessageSnippet: 'CBC specimen arrived',
    unreadCount: 4,
    participants: [],
  },
  {
    id: 'lab-open-direct',
    scope: 'Direct',
    status: 'Routed',
    title: 'Dr. Reyes',
    lastMessageSnippet: 'Confirm fasting sample',
    unreadCount: 1,
    participants: [],
  },
  {
    id: 'lab-closed-1',
    scope: 'Facility',
    status: 'Closed',
    title: 'Hemolyzed Specimen Follow-up',
    lastMessageSnippet: 'Recollection completed',
    unreadCount: 6,
    participants: [],
  },
  {
    id: 'lab-closed-2',
    scope: 'StaffContext',
    status: 'Closed',
    title: 'Care Team: Urinalysis Clarified',
    lastMessageSnippet: 'Report finalized',
    unreadCount: 2,
    participants: [],
  },
];

describe('Laboratory Comms Archived Scope & Unread Exclusion (#212)', () => {
  it('excludes Closed conversations from All and active scope filters', () => {
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'All', '').map((c) => c.id)).toEqual([
      'lab-open-fac',
      'lab-open-direct',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'Facility', '').map((c) => c.id)).toEqual([
      'lab-open-fac',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'StaffContext', '')).toEqual([]);
  });

  it('shows only Closed conversations under Archived scope and preserves search filtering', () => {
    const archived = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', '');
    expect(archived.map((c) => c.id)).toEqual(['lab-closed-1', 'lab-closed-2']);

    const searched = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', 'urinalysis');
    expect(searched.map((c) => c.id)).toEqual(['lab-closed-2']);
  });

  it('excludes Closed conversations from totalUnread count', () => {
    expect(countActiveUnreadConversations(sampleConversations)).toBe(5);
  });

  it('LabChatModal & LabChatTrigger wire Archived filtering, read-only Closed threads, and semantic tokens', () => {
    const modalSource = fs.readFileSync(
      path.resolve(__dirname, '../components/LabChatModal.tsx'),
      'utf8',
    );
    const triggerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/LabChatTrigger.tsx'),
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
