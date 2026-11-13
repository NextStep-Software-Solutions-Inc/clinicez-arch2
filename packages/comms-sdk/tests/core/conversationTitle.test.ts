import { describe, expect, it } from 'bun:test';
import { resolveConversationDisplayTitle } from '../../src/core/conversationTitle';

describe('resolveConversationDisplayTitle', () => {
  const alice = { id: 'staff-alice', participantId: 'staff-alice', displayName: 'Dr. Alice' };
  const wave = { id: 'staff-wave', participantId: 'staff-wave', displayName: 'Wave Ambray' };
  const bob = { id: 'staff-bob', participantId: 'staff-bob', displayName: 'Nurse Bob' };
  const charlie = { id: 'staff-charlie', participantId: 'staff-charlie', displayName: 'Charlie Davis' };

  it('renders other participant name in 1-on-1 direct chat for recipient (Wave Ambray)', () => {
    const conv = {
      scope: 'Direct',
      title: null,
      participants: [alice, wave]
    };

    const titleForWave = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(titleForWave).toBe('Dr. Alice');
  });

  it('renders other participant name in 1-on-1 direct chat for creator (Dr. Alice)', () => {
    const conv = {
      scope: 'Direct',
      title: null,
      participants: [alice, wave]
    };

    const titleForAlice = resolveConversationDisplayTitle(conv, 'staff-alice', 'Dr. Alice');
    expect(titleForAlice).toBe('Wave Ambray');
  });

  it('formats multi-party direct chats with two other members as "Name1, Name2"', () => {
    const conv = {
      scope: 'Direct',
      title: null,
      participants: [wave, alice, bob]
    };

    const titleForWave = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(titleForWave).toBe('Dr. Alice, Nurse Bob');
  });

  it('formats multi-party direct chats with 3+ other members as "Name1, Name2 +N"', () => {
    const conv = {
      scope: 'Direct',
      title: null,
      participants: [wave, alice, bob, charlie]
    };

    const titleForWave = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(titleForWave).toBe('Dr. Alice, Nurse Bob +1');
  });

  it('preserves explicit custom title for direct chat if explicitly named by user', () => {
    const conv = {
      scope: 'Direct',
      title: 'Emergency Consult Protocol',
      participants: [alice, wave]
    };

    const title = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(title).toBe('Emergency Consult Protocol');
  });

  it('preserves non-Direct scope explicit titles (e.g. Facility channels)', () => {
    const conv = {
      scope: 'Facility',
      title: 'General Clinic Channel',
      participants: [alice, wave]
    };

    const title = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(title).toBe('General Clinic Channel');
  });

  it('returns empty string when title is null and participants list is empty (no fallback default)', () => {
    const conv = {
      scope: 'Direct',
      title: null,
      participants: []
    };

    const title = resolveConversationDisplayTitle(conv, 'staff-wave', 'Wave Ambray');
    expect(title).toBe('');
  });
});
