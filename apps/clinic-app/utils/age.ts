export interface ChronologicalAge {
  years: number;
  months: number;
  weeks: number;
  days: number;
  totalDays: number;
  isNewborn: boolean;
  isInfant: boolean;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function getDaysInMonth(year: number, month: number): number {
  // month is 1-indexed (1 = Jan, 12 = Dec)
  if (month < 1 || month > 12) return 30;
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

interface ParsedDateParts {
  year: number;
  month: number;
  day: number;
}

export function parseDateParts(input: string | Date | undefined | null): ParsedDateParts | null {
  if (!input) return null;

  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
    };
  }

  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Check YYYY-MM-DD format first to prevent timezone shifts
  const matchYmd = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matchYmd) {
    const year = parseInt(matchYmd[1], 10);
    const month = parseInt(matchYmd[2], 10);
    const day = parseInt(matchYmd[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= getDaysInMonth(year, month)) {
      return { year, month, day };
    }
    return null;
  }

  // Fallback to Date parser
  const parsed = new Date(trimmed);
  if (isNaN(parsed.getTime())) return null;
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    day: parsed.getDate(),
  };
}

export function calculateChronologicalAge(
  dateOfBirth: string | Date | undefined | null,
  referenceDate?: Date
): ChronologicalAge | null {
  const birth = parseDateParts(dateOfBirth);
  if (!birth) return null;

  const ref = parseDateParts(referenceDate || new Date());
  if (!ref) return null;

  let years = ref.year - birth.year;
  let months = ref.month - birth.month;
  let days = ref.day - birth.day;

  // Calendar borrowing for days
  if (days < 0) {
    let prevMonth = ref.month - 1;
    let prevYear = ref.year;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const daysInPrev = getDaysInMonth(prevYear, prevMonth);
    const isLeapBabyInNonLeapFeb =
      birth.month === 2 && birth.day === 29 && prevMonth === 2 && daysInPrev === 28;
    if (birth.day > daysInPrev && !isLeapBabyInNonLeapFeb) {
      days = ref.day;
    } else {
      days += daysInPrev;
    }
    months -= 1;
  }

  // Calendar borrowing for months
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  if (years < 0) {
    return {
      years: 0,
      months: 0,
      weeks: 0,
      days: 0,
      totalDays: 0,
      isNewborn: true,
      isInfant: true,
    };
  }

  const isNewborn = years === 0 && months === 0;
  const isInfant = years === 0;

  // Total days for newborn
  const totalDays = days;
  const weeks = Math.floor(days / 7);
  const remDays = days % 7;

  return {
    years,
    months,
    weeks,
    days: remDays,
    totalDays,
    isNewborn,
    isInfant,
  };
}

/**
 * Format chronological age into long clinical format:
 * - Adults / Children (> 1 yr): e.g. "33 yrs, 10 mos, 1 wk, 4 days", "5 yrs, 2 mos, 1 day"
 * - Infants (1-12 mos): e.g. "3 mos, 2 wks, 4 days"
 * - Newborns (< 1 mo): e.g. "12 days", "1 day", "0 days"
 */
export function formatLongAge(
  dateOfBirth: string | Date | undefined | null,
  referenceDate?: Date
): string {
  const age = calculateChronologicalAge(dateOfBirth, referenceDate);
  if (!age) return '';

  // Newborns (< 1 month)
  if (age.isNewborn) {
    const d = age.totalDays;
    return `${d} ${d === 1 ? 'day' : 'days'}`;
  }

  // Infants (1-12 months, < 1 year)
  if (age.isInfant) {
    const parts: string[] = [];
    if (age.months > 0) {
      parts.push(`${age.months} ${age.months === 1 ? 'mo' : 'mos'}`);
    }
    if (age.weeks > 0) {
      parts.push(`${age.weeks} ${age.weeks === 1 ? 'wk' : 'wks'}`);
    }
    if (age.days > 0) {
      parts.push(`${age.days} ${age.days === 1 ? 'day' : 'days'}`);
    }
    return parts.length > 0 ? parts.join(', ') : `${age.months} mos`;
  }

  // Adults and Children (>= 1 year)
  const parts: string[] = [];
  parts.push(`${age.years} ${age.years === 1 ? 'yr' : 'yrs'}`);

  if (age.months > 0) {
    parts.push(`${age.months} ${age.months === 1 ? 'mo' : 'mos'}`);
  }
  if (age.weeks > 0) {
    parts.push(`${age.weeks} ${age.weeks === 1 ? 'wk' : 'wks'}`);
  }
  if (age.days > 0) {
    parts.push(`${age.days} ${age.days === 1 ? 'day' : 'days'}`);
  }

  return parts.join(', ');
}

/**
 * Format chronological age into compact format suitable for rails, badges & dense tables:
 * - Adults / Children (>= 1 yr): e.g. "27 yrs old", "5 yrs old"
 * - Infants (1-12 mos): e.g. "3 mos old"
 * - Newborns (< 1 mo): e.g. "12 days old"
 */
export function formatShortAge(
  dateOfBirth: string | Date | undefined | null,
  referenceDate?: Date
): string {
  const age = calculateChronologicalAge(dateOfBirth, referenceDate);
  if (!age) return '';

  if (age.isNewborn) {
    const d = age.totalDays;
    return `${d} ${d === 1 ? 'day' : 'days'} old`;
  }

  if (age.isInfant) {
    return `${age.months} ${age.months === 1 ? 'mo' : 'mos'} old`;
  }

  return `${age.years} ${age.years === 1 ? 'yr' : 'yrs'} old`;
}
