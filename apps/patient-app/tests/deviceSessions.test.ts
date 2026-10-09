import { describe, expect, test } from 'bun:test';
import {
  deviceSessionListSchema,
  registerSessionResponseSchema,
  type DeviceSessionDto,
} from '../services/api/sessionsApi';
import { formatLastActive, markCurrentDevice } from '../services/devices/presentation';

const NOW = new Date('2026-01-10T12:00:00.000Z');

function session(overrides: Partial<DeviceSessionDto> = {}): DeviceSessionDto {
  return {
    id: 's1',
    deviceId: 'device-a',
    deviceLabel: 'Pixel 9',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastActiveAt: '2026-01-10T11:59:30.000Z',
    ...overrides,
  };
}

describe('device session contract', () => {
  test('parses the session list', () => {
    const parsed = deviceSessionListSchema.parse([session(), session({ id: 's2', deviceId: 'device-b' })]);
    expect(parsed.map((item) => item.id)).toEqual(['s1', 's2']);
  });

  test('rejects rows missing required fields', () => {
    expect(deviceSessionListSchema.safeParse([{ id: 's1', deviceId: 'device-a' }]).success).toBe(false);
  });

  test('parses the registration response', () => {
    const response = { sessionId: 's1', deviceId: 'device-a', deviceLabel: 'Pixel 9', issuedAt: '2026-01-10T00:00:00.000Z' };
    expect(registerSessionResponseSchema.parse(response).sessionId).toBe('s1');
    expect(registerSessionResponseSchema.safeParse({ ...response, sessionId: undefined }).success).toBe(false);
  });
});

describe('markCurrentDevice', () => {
  test('flags only the session whose device id matches this install', () => {
    const rows = markCurrentDevice(
      [session({ id: 's1', deviceId: 'device-a' }), session({ id: 's2', deviceId: 'device-b' })],
      'device-b',
    );
    expect(rows.map((row) => [row.id, row.isCurrentDevice])).toEqual([
      ['s1', false],
      ['s2', true],
    ]);
  });

  test('flags nothing when this device is not in the list', () => {
    const rows = markCurrentDevice([session()], 'device-z');
    expect(rows.every((row) => !row.isCurrentDevice)).toBe(true);
  });

  test('flags nothing when this install has no device id yet', () => {
    const rows = markCurrentDevice([session()], null);
    expect(rows.every((row) => !row.isCurrentDevice)).toBe(true);
  });

  test('keeps order and session data intact', () => {
    const input = [session({ id: 's9', deviceLabel: 'iPad' })];
    const [row] = markCurrentDevice(input, 'device-a');
    expect(row).toMatchObject({ id: 's9', deviceLabel: 'iPad', deviceId: 'device-a', isCurrentDevice: true });
  });
});

describe('formatLastActive', () => {
  test('renders relative time buckets', () => {
    expect(formatLastActive('2026-01-10T11:59:30.000Z', NOW)).toBe('Just now');
    expect(formatLastActive('2026-01-10T11:55:00.000Z', NOW)).toBe('5 min ago');
    expect(formatLastActive('2026-01-10T11:00:00.000Z', NOW)).toBe('1 hour ago');
    expect(formatLastActive('2026-01-10T07:00:00.000Z', NOW)).toBe('5 hours ago');
    expect(formatLastActive('2026-01-09T11:00:00.000Z', NOW)).toBe('1 day ago');
    expect(formatLastActive('2026-01-07T12:00:00.000Z', NOW)).toBe('3 days ago');
  });

  test('handles clock skew and invalid input', () => {
    expect(formatLastActive('2026-01-10T12:05:00.000Z', NOW)).toBe('Just now');
    expect(formatLastActive('not a date', NOW)).toBe('Unknown');
  });
});
