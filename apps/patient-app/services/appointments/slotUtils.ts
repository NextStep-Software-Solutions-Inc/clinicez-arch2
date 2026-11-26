import { format } from 'date-fns';
import type { DirectoryServiceDto } from '../api/homeApi';
import type { AvailableSlot } from './types';

export const CLINIC_TIMEZONE_ID = 'Asia/Manila';
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface ManilaTimeParts {
  dateStr: string;
  timeStr: string;
  hour: number;
  minute: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Returns Asia/Manila (UTC+8) calendar date and clock time parts for the given instant.
 */
export function getManilaTimeParts(now: Date = new Date()): ManilaTimeParts {
  const safeNow = Number.isNaN(now.getTime()) ? new Date() : now;
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: CLINIC_TIMEZONE_ID,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(safeNow);
    const year = parts.find((p) => p.type === 'year')?.value;
    const month = parts.find((p) => p.type === 'month')?.value;
    const day = parts.find((p) => p.type === 'day')?.value;
    let hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
    if (hourStr === '24') hourStr = '00';
    const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00';
    if (year && month && day) {
      return {
        dateStr: `${year}-${month}-${day}`,
        timeStr: `${hourStr}:${minuteStr}`,
        hour: parseInt(hourStr, 10),
        minute: parseInt(minuteStr, 10),
      };
    }
  } catch {
    // Fallback below uses deterministic UTC+8 arithmetic
  }

  const utc8 = new Date(safeNow.getTime() + MANILA_OFFSET_MS);
  const hour = utc8.getUTCHours();
  const minute = utc8.getUTCMinutes();
  const dateStr = `${utc8.getUTCFullYear()}-${pad2(utc8.getUTCMonth() + 1)}-${pad2(utc8.getUTCDate())}`;
  return {
    dateStr,
    timeStr: `${pad2(hour)}:${pad2(minute)}`,
    hour,
    minute,
  };
}

/**
 * Returns a Date positioned at local midnight for today's calendar date in Asia/Manila.
 */
export function getManilaTodayDate(now: Date = new Date()): Date {
  const { dateStr } = getManilaTimeParts(now);
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  return new Date(y, m - 1, d);
}

/**
 * Checks whether the given calendar Date matches today's date in Asia/Manila.
 */
export function isManilaToday(date: Date, now: Date = new Date()): boolean {
  return format(date, 'yyyy-MM-dd') === getManilaTimeParts(now).dateStr;
}

/**
 * Normalizes a Date or YYYY-MM-DD string into a YYYY-MM-DD date key.
 */
export function toDateKey(dateOrKey: Date | string): string {
  if (typeof dateOrKey === 'string') {
    return dateOrKey.trim().slice(0, 10);
  }
  return format(dateOrKey, 'yyyy-MM-dd');
}

function parseSlotTime24(rawTime: string): { hour: number; minute: number } | null {
  const trimmed = (rawTime || '').trim();
  if (!trimmed) return null;

  const amPmMatch = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(trimmed);
  if (amPmMatch) {
    let hour = parseInt(amPmMatch[1], 10);
    const minute = parseInt(amPmMatch[2], 10);
    const meridiem = amPmMatch[3].toUpperCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (meridiem === 'AM') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return { hour, minute };
  }

  const h24Match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(trimmed);
  if (!h24Match) return null;
  const hour = parseInt(h24Match[1], 10);
  const minute = parseInt(h24Match[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/**
 * Returns true when a slot on `dateOrKey` at `slotTime` (Asia/Manila) has already started or passed.
 */
export function isPastManilaSlot(
  dateOrKey: Date | string,
  slotTime: string,
  now: Date = new Date(),
): boolean {
  const dateKey = toDateKey(dateOrKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;

  const parsed = parseSlotTime24(slotTime);
  if (!parsed || Number.isNaN(now.getTime())) return false;

  const slotMs = Date.parse(`${dateKey}T${pad2(parsed.hour)}:${pad2(parsed.minute)}:00+08:00`);
  if (!Number.isFinite(slotMs)) return false;
  return slotMs <= now.getTime();
}

/**
 * Filters out unavailable slots and slots already in the past (Asia/Manila), sorted chronologically.
 */
export function filterOpenFutureSlots(
  slots: readonly AvailableSlot[],
  dateOrKey: Date | string,
  now: Date = new Date(),
): AvailableSlot[] {
  const dateKey = toDateKey(dateOrKey);
  return slots
    .filter((s) => s.available !== false && !isPastManilaSlot(dateKey, s.time, now))
    .sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Preserves all slots for pickers that display disabled states, marking past Manila slots unavailable.
 */
export function markPastSlotsUnavailable(
  slots: readonly AvailableSlot[],
  dateOrKey: Date | string,
  now: Date = new Date(),
): AvailableSlot[] {
  const dateKey = toDateKey(dateOrKey);
  return slots.map((s) => ({
    ...s,
    available: s.available !== false && !isPastManilaSlot(dateKey, s.time, now),
  }));
}

/**
 * Selects the earliest upcoming available slot ("Fastest Option" / "Recommended").
 */
export function selectRecommendedSlot(
  openFutureSlots: readonly AvailableSlot[],
): AvailableSlot | null {
  return openFutureSlots[0] ?? null;
}

/**
 * Resolves a clinic service ONLY when `initialServiceId` was explicitly requested.
 * Never silently pre-selects an arbitrary alphabetical service (e.g. ECG) for general consultations.
 */
export function resolveExplicitSelectedService(
  services: readonly DirectoryServiceDto[],
  clinicId: string | undefined,
  initialServiceId?: string,
): DirectoryServiceDto | null {
  if (!clinicId || !initialServiceId) return null;
  return (
    services.find((s) => s.id === initialServiceId && s.clinicId === clinicId) ??
    null
  );
}

export function formatSlotSummary(
  slot: AvailableSlot | null,
  date: Date,
  doctorName?: string,
): string | null {
  if (!slot) return null;
  const dateStr = format(date, 'EEE, MMM d');
  const timeStr = slot.displayTime || slot.time;
  return doctorName ? `${dateStr} at ${timeStr} • ${doctorName}` : `${dateStr} at ${timeStr}`;
}
