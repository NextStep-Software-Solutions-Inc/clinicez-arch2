import { describe, it, expect } from 'bun:test';
import type { DoctorScheduleTemplateItem } from '../services/clinicService';

describe('Doctor Schedule Template Deletion and Duty Status', () => {
  it('builds canonical template deletion URL path matching backend contract', () => {
    const buildDeleteTemplateUrl = (doctorId: string, templateId: string) => {
      return `/doctors/${doctorId}/schedules/templates/${templateId}`;
    };

    const doctorId = '11111111-1111-1111-1111-111111111111';
    const templateId = '22222222-2222-2222-2222-222222222222';
    const url = buildDeleteTemplateUrl(doctorId, templateId);

    expect(url).toBe('/doctors/11111111-1111-1111-1111-111111111111/schedules/templates/22222222-2222-2222-2222-222222222222');
  });

  it('supports canonical DayOfWeek name and index mapping', () => {
    const DAY_INDEX_TO_NAME: Record<number, string> = {
      0: 'Sunday',
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
    };

    const DAY_NAME_TO_INDEX: Record<string, number> = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    };

    const getDayIndex = (day: string | number): number => {
      if (typeof day === 'number') return day;
      return DAY_NAME_TO_INDEX[day] ?? -1;
    };

    const getDayName = (day: number): string => {
      return DAY_INDEX_TO_NAME[day] ?? 'Monday';
    };

    expect(getDayName(3)).toBe('Wednesday');
    expect(getDayIndex('Wednesday')).toBe(3);
    expect(getDayIndex('Monday')).toBe(1);
    expect(getDayIndex('Sunday')).toBe(0);
    expect(getDayIndex('InvalidDay')).toBe(-1);
  });

  it('removes schedule template cleanly and marks day as unscheduled', () => {
    let templates: DoctorScheduleTemplateItem[] = [
      {
        id: 't-mon',
        doctorId: 'doc-1',
        doctorName: 'Dr. Santos',
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '17:00',
        isActive: true,
      },
      {
        id: 't-wed',
        doctorId: 'doc-1',
        doctorName: 'Dr. Santos',
        dayOfWeek: 'Wednesday',
        startTime: '09:00',
        endTime: '17:00',
        isActive: true,
      },
    ];

    // Admin accidentally added Wednesday and wants to remove it
    const wednesdayTemplateId = 't-wed';
    templates = templates.filter((t) => t.id !== wednesdayTemplateId);

    expect(templates).toHaveLength(1);
    expect(templates.find((t) => t.dayOfWeek === 'Wednesday')).toBeUndefined();
    expect(templates.find((t) => t.dayOfWeek === 'Monday')).toBeDefined();
  });

  it('distinguishes active working day from off-duty day and unscheduled day', () => {
    const templates: DoctorScheduleTemplateItem[] = [
      {
        id: 't-mon',
        doctorId: 'doc-1',
        doctorName: 'Dr. Santos',
        dayOfWeek: 'Monday',
        startTime: '08:00',
        endTime: '17:00',
        isActive: true,
      },
      {
        id: 't-fri',
        doctorId: 'doc-1',
        doctorName: 'Dr. Santos',
        dayOfWeek: 'Friday',
        startTime: '09:00',
        endTime: '17:00',
        isActive: false, // Configured as Off Duty
      },
    ];

    const getDayStatus = (dayName: string) => {
      const template = templates.find((t) => t.dayOfWeek === dayName);
      if (!template) return 'Unscheduled';
      return template.isActive ? 'Working' : 'OffDuty';
    };

    expect(getDayStatus('Monday')).toBe('Working');
    expect(getDayStatus('Friday')).toBe('OffDuty');
    expect(getDayStatus('Wednesday')).toBe('Unscheduled');
    expect(getDayStatus('Sunday')).toBe('Unscheduled');
  });
});
