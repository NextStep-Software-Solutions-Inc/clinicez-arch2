import { theme } from '../../constants/theme';
import type { AppointmentStatus } from '../../services/clinicService';
import type {
  CalendarViewMode,
  ClinicalUrgency,
  CalendarMonthCell,
  CalendarWeekDayColumn,
  CalendarTimeSlot,
  DoctorShiftOverlay,
  ExtendedAppointmentItem,
  SlotAvailabilityResult,
} from './types';

export function padZero(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${padZero(month)}-${padZero(day)}`;
}

export function parseDateOnly(dateStr: string): { year: number; month: number; day: number } {
  const parts = dateStr.split('T')[0].split('-');
  return {
    year: parseInt(parts[0], 10),
    month: parseInt(parts[1], 10),
    day: parseInt(parts[2], 10),
  };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  if (month < 1 || month > 12) return 0;
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

/**
 * Returns current Manila (UTC+8) date as YYYY-MM-DD.
 */
export function getManilaTodayStr(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    const d = new Date();
    // UTC+8 offset fallback
    const utc8 = new Date(d.getTime() + (8 * 60 + d.getTimezoneOffset()) * 60000);
    return `${utc8.getFullYear()}-${padZero(utc8.getMonth() + 1)}-${padZero(utc8.getDate())}`;
  }
}

export function toDateString(d: Date): string {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return formatDateString(year, month, day);
}

/**
 * Generates 7-column Gregorian month grid adhering to Asia/Manila calendar rules.
 * Rows always form full 6 weeks (42 cells total) with leading/trailing days.
 */
export function generateMonthGrid(
  year: number,
  month: number,
  appointments: ExtendedAppointmentItem[] = [],
  todayStr: string = getManilaTodayStr()
): CalendarMonthCell[] {
  const daysInCurrentMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday

  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;

  const cells: CalendarMonthCell[] = [];

  // 1. Leading days from preceding month
  for (let i = firstDayOfWeek - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    const dateString = formatDateString(prevYear, prevMonth, day);
    const cellDate = new Date(Date.UTC(prevYear, prevMonth - 1, day));
    const cellAppts = appointments.filter((a) => a.scheduledAt.startsWith(dateString));
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: day,
      isCurrentMonth: false,
      isToday: dateString === todayStr,
      appointments: cellAppts,
    });
  }

  // 2. Days of current month
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dateString = formatDateString(year, month, day);
    const cellDate = new Date(Date.UTC(year, month - 1, day));
    const cellAppts = appointments.filter((a) => a.scheduledAt.startsWith(dateString));
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: day,
      isCurrentMonth: true,
      isToday: dateString === todayStr,
      appointments: cellAppts,
    });
  }

  // 3. Trailing days to fill exactly 42 cells (uniform 6-week layout)
  const totalCellsNeeded = 42;
  let nextDay = 1;
  while (cells.length < totalCellsNeeded) {
    const dateString = formatDateString(nextYear, nextMonth, nextDay);
    const cellDate = new Date(Date.UTC(nextYear, nextMonth - 1, nextDay));
    const cellAppts = appointments.filter((a) => a.scheduledAt.startsWith(dateString));
    cells.push({
      date: cellDate,
      dateString,
      dayNumber: nextDay,
      isCurrentMonth: false,
      isToday: dateString === todayStr,
      appointments: cellAppts,
    });
    nextDay++;
  }

  return cells;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Returns 7-day columns (Sunday to Saturday) for the week containing baseDate.
 */
export function getWeekDays(
  baseDate: Date,
  appointments: ExtendedAppointmentItem[] = [],
  todayStr: string = getManilaTodayStr()
): CalendarWeekDayColumn[] {
  const current = new Date(baseDate.getTime());
  const dayOfWeek = current.getDay(); // 0 = Sun
  const startOfWeek = new Date(current.getTime() - dayOfWeek * 86400000);

  const columns: CalendarWeekDayColumn[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek.getTime() + i * 86400000);
    const dateString = toDateString(d);
    const cellAppts = appointments.filter((a) => a.scheduledAt.startsWith(dateString));
    columns.push({
      date: d,
      dateString,
      dayName: DAY_NAMES[d.getDay()],
      isToday: dateString === todayStr,
      appointments: cellAppts,
    });
  }
  return columns;
}

/**
 * Generates discrete 30-minute operational time slots between 07:00 and 19:00 (24 slots).
 */
export function generateDayTimeSlots(
  startHour: number = 7,
  endHour: number = 19,
  intervalMinutes: number = 30
): CalendarTimeSlot[] {
  const slots: CalendarTimeSlot[] = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += intervalMinutes) {
      slots.push({
        timeStr: `${padZero(h)}:${padZero(m)}`,
        hour: h,
        minute: m,
      });
    }
  }
  return slots;
}

/**
 * Resolves clinical urgency category from appointment fields.
 */
export function resolveAppointmentUrgency(
  appointment: Partial<ExtendedAppointmentItem>
): ClinicalUrgency {
  if (appointment.urgency) {
    return appointment.urgency;
  }
  const text = `${appointment.reason || ''} ${appointment.notes || ''} ${appointment.serviceType || ''}`.toLowerCase();
  if (
    text.includes('stat') ||
    text.includes('emergency') ||
    text.includes('critical') ||
    text.includes('anaphylaxis') ||
    text.includes('trauma')
  ) {
    return 'STAT';
  }
  if (
    text.includes('urgent') ||
    text.includes('acute') ||
    text.includes('chest') ||
    text.includes('pain') ||
    text.includes('fever') ||
    text.includes('bleeding')
  ) {
    return 'Urgent';
  }
  return 'Routine';
}

/**
 * Resolves semantic tokens for clinical urgency.
 */
export function resolveUrgencyTokens(urgency: ClinicalUrgency = 'Routine') {
  switch (urgency) {
    case 'STAT':
      return {
        badgeBg: theme.colors.emergencyBg,
        badgeText: theme.colors.emergencyText,
        borderColor: theme.colors.emergencyBorder,
        label: 'STAT Emergency',
      };
    case 'Urgent':
      return {
        badgeBg: theme.colors.urgentBg,
        badgeText: theme.colors.urgentText,
        borderColor: theme.colors.urgentBorder,
        label: 'Urgent',
      };
    case 'Routine':
    default:
      return {
        badgeBg: theme.colors.primaryLight,
        badgeText: theme.colors.primary,
        borderColor: theme.colors.primary,
        label: 'Routine',
      };
  }
}

/**
 * Resolves semantic tokens for appointment lifecycle status.
 */
export function resolveStatusTokens(status: AppointmentStatus) {
  switch (status) {
    case 'CheckedIn':
      return {
        badgeBg: theme.colors.successBg,
        badgeText: theme.colors.successText,
        borderColor: theme.colors.successBorder,
        label: 'Checked In',
        isStrikethrough: false,
      };
    case 'InConsultation':
      return {
        badgeBg: theme.colors.purpleBg,
        badgeText: theme.colors.purple,
        borderColor: theme.colors.purpleBorder,
        label: 'In Consultation',
        isStrikethrough: false,
      };
    case 'Completed':
      return {
        badgeBg: theme.colors.surfaceMuted,
        badgeText: theme.colors.textMuted,
        borderColor: theme.colors.border,
        label: 'Completed',
        isStrikethrough: false,
      };
    case 'Pending':
      return {
        badgeBg: theme.colors.warningBg,
        badgeText: theme.colors.warningText,
        borderColor: theme.colors.warningBorder,
        label: 'Pending',
        isStrikethrough: false,
      };
    case 'Cancelled':
      return {
        badgeBg: theme.colors.surfaceMuted,
        badgeText: theme.colors.textMuted,
        borderColor: theme.colors.emergencyBorder,
        label: 'Cancelled',
        isStrikethrough: true,
      };
    case 'Confirmed':
    default:
      return {
        badgeBg: theme.colors.primaryLight,
        badgeText: theme.colors.primary,
        borderColor: theme.colors.primary,
        label: 'Confirmed',
        isStrikethrough: false,
      };
  }
}

/**
 * Validates whether two time intervals overlap (GiST exclusion logic).
 */
export function isSlotCollision(
  start1: Date | string,
  durationMinutes1: number,
  start2: Date | string,
  durationMinutes2: number
): boolean {
  const s1 = new Date(start1).getTime();
  const e1 = s1 + durationMinutes1 * 60 * 1000;
  const s2 = new Date(start2).getTime();
  const e2 = s2 + durationMinutes2 * 60 * 1000;

  // Strict interval overlap: max(s1, s2) < min(e1, e2)
  return Math.max(s1, s2) < Math.min(e1, e2);
}

/**
 * Evaluates whether an appointment slot falls within a doctor's shift template,
 * during a shift break, or during approved leave.
 */
export function evaluateDoctorAvailabilityForSlot(
  slotDateStr: string,
  slotTimeStr: string,
  overlay: DoctorShiftOverlay
): SlotAvailabilityResult {
  if (overlay.leave) {
    return { isAvailable: false, status: 'Leave', reason: overlay.leave.reason };
  }
  if (!overlay.isOnDuty) {
    return { isAvailable: false, status: 'OffDuty', reason: 'Physician off duty' };
  }

  // Check working hours boundary
  if (slotTimeStr < overlay.shiftStart || slotTimeStr >= overlay.shiftEnd) {
    return { isAvailable: false, status: 'OffDuty', reason: 'Outside working hours' };
  }

  // Check shift breaks
  for (const b of overlay.breaks) {
    if (slotTimeStr >= b.start && slotTimeStr < b.end) {
      return { isAvailable: false, status: 'Break', reason: b.description };
    }
  }

  return { isAvailable: true, status: 'Available' };
}

/**
 * Formats HH:MM (24h) to 12h AM/PM format (e.g. 08:30 -> 8:30 AM).
 */
export function formatTime12(timeStr: string): string {
  if (!timeStr) return '';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${ampm}`;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const SHORT_MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

/**
 * Formats header title according to viewMode.
 */
export function formatDateTitle(viewMode: CalendarViewMode, currentDate: Date): string {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  if (viewMode === 'month' || viewMode === 'agenda') {
    return `${MONTH_NAMES[month]} ${year}`;
  }

  if (viewMode === 'day') {
    const dayName = FULL_DAY_NAMES[currentDate.getDay()];
    const shortMonth = SHORT_MONTH_NAMES[month];
    const dateNum = currentDate.getDate();
    return `${dayName}, ${shortMonth} ${dateNum}, ${year}`;
  }

  // Week view: Sunday to Saturday range
  const dayOfWeek = currentDate.getDay();
  const startOfWeek = new Date(currentDate.getTime() - dayOfWeek * 86400000);
  const endOfWeek = new Date(startOfWeek.getTime() + 6 * 86400000);

  const startMonthStr = SHORT_MONTH_NAMES[startOfWeek.getMonth()];
  const endMonthStr = SHORT_MONTH_NAMES[endOfWeek.getMonth()];
  const startDay = startOfWeek.getDate();
  const endDay = endOfWeek.getDate();
  const endYear = endOfWeek.getFullYear();

  if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
    return `${startMonthStr} ${startDay} – ${endDay}, ${endYear}`;
  }
  return `${startMonthStr} ${startDay} – ${endMonthStr} ${endDay}, ${endYear}`;
}
