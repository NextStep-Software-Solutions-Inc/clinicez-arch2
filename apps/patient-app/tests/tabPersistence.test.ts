import { describe, expect, test, mock, beforeEach } from 'bun:test';

mock.module('react-native', () => ({
  Platform: { OS: 'web', select: <T>(obj: { web?: T; default?: T }) => obj.web ?? obj.default },
  DeviceEventEmitter: { emit: () => {}, addListener: () => ({ remove: () => {} }) },
}));

const {
  getPersistedTab,
  setPersistedTab,
  subscribePersistedTab,
} = await import('../services/tabs/tabPersistence');

describe('Generic Tab & Filter Persistence Engine', () => {
  test('persists numeric tab segments with custom serialize/deserialize', () => {
    const config = {
      key: 'test.numeric_segment',
      defaultValue: 0 as 0 | 1,
      queryParam: 'tab',
      serialize: (v: 0 | 1) => (v === 1 ? 'past' : 'upcoming'),
      deserialize: (raw: string) => (raw === 'past' || raw === '1' ? 1 : 0) as 0 | 1,
    };

    expect(getPersistedTab(config)).toBe(0);

    setPersistedTab(config, 1);
    expect(getPersistedTab(config)).toBe(1);

    setPersistedTab(config, 0);
    expect(getPersistedTab(config)).toBe(0);
  });

  test('persists string filters with default serializer', () => {
    type TestFilter = 'all' | 'unread' | 'reminders';
    const config = {
      key: 'test.notifications_filter',
      defaultValue: 'all' as TestFilter,
      queryParam: 'filter',
    };

    expect(getPersistedTab(config)).toBe('all');

    setPersistedTab(config, 'unread');
    expect(getPersistedTab(config)).toBe('unread');

    setPersistedTab(config, 'reminders');
    expect(getPersistedTab(config)).toBe('reminders');
  });

  test('notifies subscribers upon value changes', () => {
    const config = {
      key: 'test.subscription_key',
      defaultValue: 'initial',
    };

    const received: string[] = [];
    const unsubscribe = subscribePersistedTab<string>('test.subscription_key', (val) => {
      received.push(val);
    });

    setPersistedTab(config, 'updated_1');
    setPersistedTab(config, 'updated_2');

    expect(received).toEqual(['updated_1', 'updated_2']);
    unsubscribe();

    setPersistedTab(config, 'updated_3');
    expect(received).toEqual(['updated_1', 'updated_2']); // No new notifications after unsubscribe
  });

  test('preserves distinct states across different screen keys independently', () => {
    const screenA = { key: 'screenA.tab', defaultValue: 'tab1' };
    const screenB = { key: 'screenB.tab', defaultValue: 'overview' };

    setPersistedTab(screenA, 'tab2');
    setPersistedTab(screenB, 'details');

    expect(getPersistedTab(screenA)).toBe('tab2');
    expect(getPersistedTab(screenB)).toBe('details');
  });
});
