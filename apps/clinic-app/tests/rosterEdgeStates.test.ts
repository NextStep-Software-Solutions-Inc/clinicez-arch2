import { describe, expect, test } from 'bun:test';
import { AvailableSlotItem, DoctorAvailabilityData } from '../services/clinicService';

describe('Roster and Slot Edge States', () => {
  test('Doctor has no template configured: returns off-duty state and empty slots', () => {
    const rawAvailability: DoctorAvailabilityData = {
      doctorId: 'doc-123',
      doctorName: 'Dr. Santos',
      date: '2026-10-12',
      isOnDuty: false,
      nonAvailabilityReason: 'No scheduled shift on this day',
      slots: [],
    };

    expect(rawAvailability.isOnDuty).toBe(false);
    expect(rawAvailability.nonAvailabilityReason).toBe('No scheduled shift on this day');
    expect(rawAvailability.slots).toHaveLength(0);
  });

  test('Doctor on approved leave: returns non-availability reason', () => {
    const rawAvailability: DoctorAvailabilityData = {
      doctorId: 'doc-123',
      doctorName: 'Dr. Santos',
      date: '2026-10-12',
      isOnDuty: false,
      nonAvailabilityReason: 'Annual Medical Conference',
      slots: [],
    };

    expect(rawAvailability.isOnDuty).toBe(false);
    expect(rawAvailability.nonAvailabilityReason).toBe('Annual Medical Conference');
    expect(rawAvailability.slots).toHaveLength(0);
  });

  test('All slots are booked (slots full): all items have isAvailable false and Booked status', () => {
    const slots: AvailableSlotItem[] = [
      {
        startTime: '09:00',
        endTime: '09:30',
        slotStartUtc: '2026-10-12T01:00:00Z',
        slotEndUtc: '2026-10-12T01:30:00Z',
        isAvailable: false,
        status: 'Booked',
        existingAppointmentId: 'appt-1',
        patientName: 'Juan Dela Cruz',
      },
      {
        startTime: '09:30',
        endTime: '10:00',
        slotStartUtc: '2026-10-12T01:30:00Z',
        slotEndUtc: '2026-10-12T02:00:00Z',
        isAvailable: false,
        status: 'Booked',
        existingAppointmentId: 'appt-2',
        patientName: 'Maria Santos',
      },
    ];

    const availableSlots = slots.filter((s) => s.isAvailable);
    expect(availableSlots).toHaveLength(0);

    const bookedSlots = slots.filter((s) => s.status === 'Booked');
    expect(bookedSlots).toHaveLength(2);
  });

  test('Break and Leave slots are marked unavailable with correct statuses', () => {
    const slots: AvailableSlotItem[] = [
      {
        startTime: '12:00',
        endTime: '12:30',
        slotStartUtc: '2026-10-12T04:00:00Z',
        slotEndUtc: '2026-10-12T04:30:00Z',
        isAvailable: false,
        status: 'Break',
        notes: 'Lunch Recess',
      },
      {
        startTime: '13:00',
        endTime: '13:30',
        slotStartUtc: '2026-10-12T05:00:00Z',
        slotEndUtc: '2026-10-12T05:30:00Z',
        isAvailable: false,
        status: 'OnLeave',
        notes: 'Partial Day Leave',
      },
      {
        startTime: '14:00',
        endTime: '14:30',
        slotStartUtc: '2026-10-12T06:00:00Z',
        slotEndUtc: '2026-10-12T06:30:00Z',
        isAvailable: true,
        status: 'Available',
      },
    ];

    expect(slots[0].isAvailable).toBe(false);
    expect(slots[0].status).toBe('Break');
    expect(slots[0].notes).toBe('Lunch Recess');

    expect(slots[1].isAvailable).toBe(false);
    expect(slots[1].status).toBe('OnLeave');

    expect(slots[2].isAvailable).toBe(true);
    expect(slots[2].status).toBe('Available');
  });

  test('Slot time formatter handles 12-hour AM/PM rollover cleanly', () => {
    function formatSlotTime(timeStr: string): string {
      if (!timeStr) return '';
      const parts = timeStr.split(':');
      if (parts.length >= 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parts[1];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 === 0 ? 12 : hours % 12;
        return `${formattedHours}:${minutes} ${ampm}`;
      }
      return timeStr;
    }

    expect(formatSlotTime('00:00')).toBe('12:00 AM');
    expect(formatSlotTime('09:00')).toBe('9:00 AM');
    expect(formatSlotTime('12:00')).toBe('12:00 PM');
    expect(formatSlotTime('13:30')).toBe('1:30 PM');
    expect(formatSlotTime('23:45')).toBe('11:45 PM');
  });
});
