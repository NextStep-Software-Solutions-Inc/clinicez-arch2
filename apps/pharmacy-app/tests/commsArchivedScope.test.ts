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
    id: 'pharm-open-fac',
    scope: 'Facility',
    status: 'Submitted',
    title: 'Dispensary Desk',
    lastMessageSnippet: 'Check stock for Amoxicillin 500mg',
    unreadCount: 3,
    participants: [],
  },
  {
    id: 'pharm-open-direct',
    scope: 'Direct',
    status: 'Answered',
    title: 'Dr. Luna',
    lastMessageSnippet: 'Dosage confirmed',
    unreadCount: 2,
    participants: [],
  },
  {
    id: 'pharm-closed-1',
    scope: 'Facility',
    status: 'Closed',
    title: 'Prescription Substitution Archive',
    lastMessageSnippet: 'Dispensed generic equivalent',
    unreadCount: 8,
    participants: [],
  },
  {
    id: 'pharm-closed-2',
    scope: 'PatientFacility',
    status: 'Closed',
    title: 'Refill Request Closed',
    lastMessageSnippet: 'Picked up by patient',
    unreadCount: 1,
    participants: [],
  },
];

describe('Pharmacy Comms Archived Scope & Unread Exclusion (#212)', () => {
  it('excludes Closed conversations from All and active scope filters', () => {
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'All', '').map((c) => c.id)).toEqual([
      'pharm-open-fac',
      'pharm-open-direct',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'Facility', '').map((c) => c.id)).toEqual([
      'pharm-open-fac',
    ]);
    expect(filterConversationsByScopeAndQuery(sampleConversations, 'PatientFacility', '')).toEqual([]);
  });

  it('shows only Closed conversations under Archived scope and preserves search filtering', () => {
    const archived = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', '');
    expect(archived.map((c) => c.id)).toEqual(['pharm-closed-1', 'pharm-closed-2']);

    const searched = filterConversationsByScopeAndQuery(sampleConversations, 'Archived', 'substitution');
    expect(searched.map((c) => c.id)).toEqual(['pharm-closed-1']);
  });

  it('excludes Closed conversations from totalUnread count', () => {
    expect(countActiveUnreadConversations(sampleConversations)).toBe(5);
  });

  it('PharmacyChatModal & PharmacyChatTrigger wire Archived filtering, read-only Closed threads, and semantic tokens', () => {
    const modalSource = fs.readFileSync(
      path.resolve(__dirname, '../components/PharmacyChatModal.tsx'),
      'utf8',
    );
    const triggerSource = fs.readFileSync(
      path.resolve(__dirname, '../components/PharmacyChatTrigger.tsx'),
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
