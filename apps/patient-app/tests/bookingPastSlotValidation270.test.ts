import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DirectoryServiceDto } from '../services/api/homeApi';
import type { AvailableSlot } from '../services/appointments/types';
import {
  filterOpenFutureSlots,
  getManilaTimeParts,
  getManilaTodayDate,
  isManilaToday,
  isPastManilaSlot,
  markPastSlotsUnavailable,
  resolveExplicitSelectedService,
  selectRecommendedSlot,
} from '../services/appointments/slotUtils';

const APP_ROOT = join(import.meta.dir, '..');
const readAppFile = (rel: string): string =>
  readFileSync(join(APP_ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const SAMPLE_SLOTS: AvailableSlot[] = [
  { id: '2026-11-25-09:00', time: '09:00', displayTime: '9:00 AM', period: 'morning', available: true },
  { id: '2026-11-25-09:30', time: '09:30', displayTime: '9:30 AM', period: 'morning', available: true },
  { id: '2026-11-25-10:00', time: '10:00', displayTime: '10:00 AM', period: 'morning', available: true },
  { id: '2026-11-25-10:30', time: '10:30', displayTime: '10:30 AM', period: 'morning', available: true },
  { id: '2026-11-25-11:00', time: '11:00', displayTime: '11:00 AM', period: 'morning', available: true },
  { id: '2026-11-25-13:00', time: '13:00', displayTime: '1:00 PM', period: 'afternoon', available: true },
  { id: '2026-11-25-13:30', time: '13:30', displayTime: '1:30 PM', period: 'afternoon', available: false },
];

describe('Issue #270: Past-Slot Validation, Service Preselection & Telehealth UX', () => {
  test('1. Manila clock & today helpers resolve Asia/Manila accurately', () => {
    // 2026-11-25 10:39 AM Asia/Manila == 2026-11-25 02:39 UTC
    const now1039 = new Date('2026-11-25T10:39:00+08:00');
    const parts = getManilaTimeParts(now1039);
    expect(parts.dateStr).toBe('2026-11-25');
    expect(parts.hour).toBe(10);
    expect(parts.minute).toBe(39);

    const today = getManilaTodayDate(now1039);
    expect(isManilaToday(today, now1039)).toBe(true);
    expect(isManilaToday(new Date(2026, 10, 26), now1039)).toBe(false);
  });

  test('2. filterOpenFutureSlots removes past slots on today (both in-person & telehealth) and keeps future slots', () => {
    const now1039 = new Date('2026-11-25T10:39:00+08:00');

    const todayFuture = filterOpenFutureSlots(SAMPLE_SLOTS, '2026-11-25', now1039);
    expect(todayFuture.map((s) => s.time)).toEqual(['11:00', '13:00']);

    // Exact boundary at 10:30:00 excludes 10:30
    expect(isPastManilaSlot('2026-11-25', '10:30', new Date('2026-11-25T10:30:00+08:00'))).toBe(true);
    expect(isPastManilaSlot('2026-11-25', '10:30', new Date('2026-11-25T10:29:59+08:00'))).toBe(false);

    // Tomorrow keeps all available slots (09:00 onward)
    const tomorrowSlots = SAMPLE_SLOTS.map((s) => ({
      ...s,
      id: s.id.replace('2026-11-25', '2026-11-26'),
    }));
    const tomorrowFuture = filterOpenFutureSlots(tomorrowSlots, '2026-11-26', now1039);
    expect(tomorrowFuture.map((s) => s.time)).toEqual(['09:00', '09:30', '10:00', '10:30', '11:00', '13:00']);
  });

  test('3. markPastSlotsUnavailable disables past slots for TimeSlotPicker', () => {
    const now1039 = new Date('2026-11-25T10:39:00+08:00');
    const marked = markPastSlotsUnavailable(SAMPLE_SLOTS, '2026-11-25', now1039);
    expect(marked.map((s) => [s.time, s.available])).toEqual([
      ['09:00', false],
      ['09:30', false],
      ['10:00', false],
      ['10:30', false],
      ['11:00', true],
      ['13:00', true],
      ['13:30', false],
    ]);
  });

  test('4. selectRecommendedSlot picks earliest future available slot instead of hardcoded 10:00', () => {
    const now1039 = new Date('2026-11-25T10:39:00+08:00');
    const todayFuture = filterOpenFutureSlots(SAMPLE_SLOTS, '2026-11-25', now1039);
    const recommended = selectRecommendedSlot(todayFuture);
    expect(recommended?.time).toBe('11:00');

    expect(selectRecommendedSlot([])).toBeNull();
  });

  test('5. resolveExplicitSelectedService never silently picks ECG when no serviceId was requested', () => {
    const clinicServices: DirectoryServiceDto[] = [
      {
        id: 'svc-ecg',
        clinicId: 'clinic-1',
        clinicName: 'Nextstep OPD',
        name: '12-Lead Electrocardiogram (ECG)',
        subtitle: null,
        description: null,
        durationMinutes: 30,
        price: 450,
        priceBadgeLabel: '₱450.00',
        tags: [],
      },
      {
        id: 'svc-consult',
        clinicId: 'clinic-1',
        clinicName: 'Nextstep OPD',
        name: 'General Consultation',
        subtitle: null,
        description: null,
        durationMinutes: 30,
        price: 500,
        priceBadgeLabel: '₱500.00',
        tags: [],
      },
    ];

    // No initialServiceId -> must return null instead of picking first alphabetical service (ECG)
    expect(resolveExplicitSelectedService(clinicServices, 'clinic-1', undefined)).toBeNull();

    // Explicit initialServiceId -> resolves exact match within same clinic
    expect(resolveExplicitSelectedService(clinicServices, 'clinic-1', 'svc-consult')?.id).toBe('svc-consult');
    expect(resolveExplicitSelectedService(clinicServices, 'other-clinic', 'svc-consult')).toBeNull();
  });

  test('6. Booking screens & components wire past-slot checks, explicit service resolution, and telehealth copy', () => {
    for (const screenPath of [
      'navigation/screens/BookingDraft.screen.tsx',
      'navigation/screens/BookingDraft.screen.web.tsx',
    ]) {
      const src = readAppFile(screenPath);
      expect(src.includes('filterOpenFutureSlots')).toBe(true);
      expect(src.includes('selectRecommendedSlot')).toBe(true);
      expect(src.includes('isPastManilaSlot')).toBe(true);
      expect(src.includes('resolveExplicitSelectedService')).toBe(true);
      expect(src.includes('consultationMode={consultationMode}')).toBe(true);
      // Old fallback that silently auto-selected first alphabetical service must be gone
      expect(src.includes('services.find((s) => s.clinicId === selectedDoctor.clinicId)')).toBe(false);
    }

    const slotStepSrc = readAppFile('components/booking/BookingSlotStep.tsx');
    expect(slotStepSrc.includes('isPastManilaSlot')).toBe(true);
    expect(slotStepSrc.includes('selectRecommendedSlot')).toBe(true);
    expect(slotStepSrc.includes('Virtual Waiting Room Check-In')).toBe(true);
    expect(slotStepSrc.includes("s.time.startsWith('10:')")).toBe(false);

    const reviewStepSrc = readAppFile('components/booking/BookingReviewStep.tsx');
    expect(reviewStepSrc.includes('Join 10 minutes early')).toBe(true);
    expect(reviewStepSrc.includes('Payable before or during teleconsultation')).toBe(true);
    expect(reviewStepSrc.includes('Due before teleconsultation on')).toBe(true);

    const footerSrc = readAppFile('components/booking/BookingStickyFooter.tsx');
    expect(footerSrc.includes("'due at session'")).toBe(true);

    const confirmSrc = readAppFile('components/booking/BookingConfirmationStep.tsx');
    expect(confirmSrc.includes('Before Your Virtual Visit')).toBe(true);
    expect(confirmSrc.includes('Camera & Microphone Check')).toBe(true);
  });
});
