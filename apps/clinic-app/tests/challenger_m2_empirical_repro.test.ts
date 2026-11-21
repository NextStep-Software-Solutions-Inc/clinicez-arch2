import { describe, expect, test, mock } from 'bun:test';

mock.module('react-native', () => ({
  Alert: { alert: () => {} },
  Platform: { OS: 'web' },
}));

const { notify } = await import('../utils/feedback');

describe('Empirical Verification: notify.warning runtime existence', () => {
  test('notify object exposes warning method along with success, error, info', () => {
    expect(Object.keys(notify)).toEqual(['success', 'error', 'info', 'warning']);
    expect(typeof (notify as any).warning).toBe('function');
  });

  test('calling notify.warning does not throw TypeError at runtime in ScheduleVisitModal flows', () => {
    expect(() => {
      (notify as any).warning('No contact number on file for this patient. Update demographics to send SMS.');
    }).not.toThrow();
  });
});
